const SVG_NS = 'http://www.w3.org/2000/svg';

export function number(value) {
  const numeric = Number(value) || 0;
  if (Object.is(numeric, -0) || numeric === 0) {
    return '0';
  }

  return String(numeric);
}

export function translate(x, y) {
  return `translate(${number(x)},${number(y)})`;
}

export function escapeXml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}

export function getAdvanceWidth(positions) {
  return (positions || []).reduce(
    (width, position) => width + (Number(position.xAdvance) || 0),
    0,
  );
}

export function getAdvanceHeight(positions) {
  return (positions || []).reduce(
    (height, position) => height + (Number(position.yAdvance) || 0),
    0,
  );
}

function addBounds(bounds, minX, minY, maxX, maxY) {
  if (!bounds) {
    return { minX, minY, maxX, maxY };
  }

  return {
    minX: Math.min(bounds.minX, minX),
    minY: Math.min(bounds.minY, minY),
    maxX: Math.max(bounds.maxX, maxX),
    maxY: Math.max(bounds.maxY, maxY),
  };
}

/**
 * Bounds use exactly the same pen + offset placement as rendering. The pen
 * advances only by xAdvance/yAdvance; a glyph's native advance is never used.
 */
export function getRunBounds(run, options = {}) {
  const margin = options.margin ?? 32;
  const positions = run.positions || [];
  const glyphs = run.glyphs || [];
  const totalAdvanceWidth = getAdvanceWidth(positions);

  let bounds = addBounds(null, 0, 0, 0, 0);
  bounds = addBounds(bounds, totalAdvanceWidth, 0, totalAdvanceWidth, 0);

  let penX = 0;
  let penY = 0;
  for (let index = 0; index < glyphs.length; index++) {
    const position = positions[index] || {};
    const glyph = glyphs[index] || {};
    const x = penX + (Number(position.xOffset) || 0);
    const y = penY + (Number(position.yOffset) || 0);
    const bbox = glyph.bbox || {
      minX: 0,
      minY: 0,
      maxX: 0,
      maxY: 0,
    };

    bounds = addBounds(
      bounds,
      x + bbox.minX,
      y + bbox.minY,
      x + bbox.maxX,
      y + bbox.maxY,
    );

    penX += Number(position.xAdvance) || 0;
    penY += Number(position.yAdvance) || 0;
  }

  bounds.minX -= margin;
  bounds.minY -= margin;
  bounds.maxX += margin;
  bounds.maxY += margin;
  bounds.width = Math.max(1, bounds.maxX - bounds.minX);
  bounds.height = Math.max(1, bounds.maxY - bounds.minY);
  return bounds;
}

function renderMetadata(run) {
  const metadata = {
    id: run.id,
    spec: run.spec,
    advanceWidth: getAdvanceWidth(run.positions),
    advanceHeight: getAdvanceHeight(run.positions),
    positions: run.positions,
  };

  return `<metadata id="position-sheet-${escapeXml(run.id || 'run')}">${escapeXml(
    JSON.stringify(metadata),
  )}</metadata>`;
}

function renderGlyphs(run) {
  const positions = run.positions || [];
  const glyphs = run.glyphs || [];
  let penX = 0;
  let penY = 0;

  return glyphs
    .map((glyph, index) => {
      const position = positions[index] || {};
      const xAdvance = Number(position.xAdvance) || 0;
      const yAdvance = Number(position.yAdvance) || 0;
      const xOffset = Number(position.xOffset) || 0;
      const yOffset = Number(position.yOffset) || 0;
      const absoluteX = penX + xOffset;
      const absoluteY = penY + yOffset;
      const d = glyph.d || glyph.path?.toSVG?.() || '';
      const nativeAdvanceWidth =
        glyph.nativeAdvanceWidth ?? glyph.advanceWidth ?? null;
      const mark = Boolean(glyph.isMark);
      const fill =
        run.id === 'open-sans-a' ? '#f4f1ea' : mark ? '#fbbf24' : '#f4f1ea';

      const node = `
    <g class="glyph glyph-${number(glyph.id)}${mark ? ' mark' : ''}" transform="${translate(
      penX,
      penY,
    )}" data-glyph-id="${number(glyph.id)}"${
      nativeAdvanceWidth == null
        ? ''
        : ` data-native-advance-width="${number(nativeAdvanceWidth)}"`
    } data-mark="${mark ? 'true' : 'false'}" data-offset="${number(
      xOffset,
    )},${number(yOffset)}" data-advance="${number(
      xAdvance,
    )}" data-pen-transform="${translate(
      penX,
      penY,
    )}" data-offset-transform="${translate(
      xOffset,
      yOffset,
    )}" data-absolute-transform="${translate(
      absoluteX,
      absoluteY,
    )}" data-pen-x="${number(penX)}" data-pen-y="${number(
      penY,
    )}" data-x-offset="${number(xOffset)}" data-y-offset="${number(
      yOffset,
    )}" data-x-advance="${number(xAdvance)}" data-y-advance="${number(
      yAdvance,
    )}" data-x="${number(absoluteX)}" data-y="${number(absoluteY)}">
      <g class="offset" transform="${translate(xOffset, yOffset)}">
        <path d="${d}" fill="${fill}" fill-rule="nonzero"></path>
      </g>
    </g>`;

      penX += xAdvance;
      penY += yAdvance;
      return node;
    })
    .join('');
}

function renderGuides(run, bounds) {
  const advanceWidth = getAdvanceWidth(run.positions);
  return `
  <rect class="canvas" x="${number(bounds.minX)}" y="${number(
    bounds.minY,
  )}" width="${number(bounds.width)}" height="${number(
    bounds.height,
  )}" fill="#111827"></rect>
  <line class="baseline" vector-effect="non-scaling-stroke" x1="${number(
    bounds.minX,
  )}" y1="0" x2="${number(bounds.maxX)}" y2="0" stroke="#38bdf8" stroke-width="3" opacity="0.55"></line>
  <line class="advance-boundary" vector-effect="non-scaling-stroke" x1="${number(
    advanceWidth,
  )}" y1="${number(bounds.minY)}" x2="${number(advanceWidth)}" y2="${number(
    bounds.maxY,
  )}" stroke="#22c55e" stroke-width="4" stroke-dasharray="18 12" opacity="0.8"></line>
  <circle cx="0" cy="0" r="10" fill="#38bdf8" opacity="0.8"></circle>`;
}

function renderRunGeometry(run, bounds) {
  return `
    ${renderGuides(run, bounds)}
    ${renderGlyphs(run)}`;
}

function renderRunInner(run, bounds) {
  return `${renderMetadata(run)}
  <g class="font-coordinates" transform="scale(1,-1)">${renderRunGeometry(
    run,
    bounds,
  )}
  </g>`;
}

/**
 * Render one run. The caller can mutate run.positions and call this again;
 * every transform and the data-advance-width attribute are recomputed.
 */
export function renderRunSvg(run, options = {}) {
  const bounds = options.bounds || getRunBounds(run);
  const advanceWidth = getAdvanceWidth(run.positions);
  const advanceHeight = getAdvanceHeight(run.positions);
  const viewBox = `${number(bounds.minX)} ${number(-bounds.maxY)} ${number(
    bounds.width,
  )} ${number(bounds.height)}`;

  const width = options.width ?? 960;
  const height =
    options.height ?? Math.max(240, (bounds.height / bounds.width) * width);
  const testAttributes = [
    `data-run-id="${escapeXml(run.id || '')}"`,
    `data-spec="${escapeXml(run.spec || '')}"`,
    `data-advance="${number(advanceWidth)}"`,
    `data-advance-width="${number(advanceWidth)}"`,
    `data-advance-height="${number(advanceHeight)}"`,
    `data-view-box="${escapeXml(viewBox)}"`,
  ].join(' ');

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="${SVG_NS}" class="position-preview run-${escapeXml(
    run.id || 'unknown',
  )}" ${testAttributes} width="${number(width)}" height="${number(
    height,
  )}" viewBox="${viewBox}" preserveAspectRatio="xMinYMid meet">
  ${renderRunInner(run, bounds)}
</svg>
`;
}

/**
 * Stack all preview cases in one SVG. Each panel establishes a transform into
 * font coordinates; offset transforms inside remain the raw offset+advance
 * numbers from the single position sheet.
 */
export function renderPreviewSvg(sheets, options = {}) {
  const rootWidth = options.width ?? 1200;
  const outerMargin = 24;
  const labelHeight = 38;
  const panelGap = 34;
  const panelMaxWidth = rootWidth - outerMargin * 2;
  const panelMaxHeight = options.panelMaxHeight ?? 320;

  let cursorY = outerMargin;
  const panels = sheets
    .map((sheet) => {
      const bounds = getRunBounds(sheet);
      const scale = Math.min(
        panelMaxWidth / bounds.width,
        panelMaxHeight / bounds.height,
      );
      const drawWidth = Math.max(1, bounds.width * scale);
      const drawHeight = Math.max(1, bounds.height * scale);
      const labelY = cursorY + 25;
      const x = outerMargin;
      const y = cursorY + labelHeight;

      // Map font-coordinate (minX, maxY) to screen point (x, y).
      const tx = x - scale * bounds.minX;
      const ty = y + scale * bounds.maxY;
      const panelTransform = `matrix(${number(scale)},0,0,${number(
        -scale,
      )},${number(tx)},${number(ty)})`;
      const advanceWidth = getAdvanceWidth(sheet.positions);

      const label = `
  <text x="${x}" y="${labelY}" fill="#e5e7eb" font-family="sans-serif" font-size="24">${escapeXml(
    sheet.label || sheet.id,
  )}</text>
  <text x="${x + Math.max(drawWidth, 520)}" y="${labelY}" fill="#86efac" font-family="monospace" font-size="22">advance ${number(
    advanceWidth,
  )}</text>`;

      const panel = `
  <g class="position-preview run-${escapeXml(
    sheet.id || 'unknown',
  )}" data-run-id="${escapeXml(sheet.id || '')}" data-spec="${escapeXml(
    sheet.spec || '',
  )}" data-advance="${number(advanceWidth)}" data-advance-width="${number(
    advanceWidth,
  )}" transform="${panelTransform}">
    ${renderRunGeometry(sheet, bounds)}
  </g>`;

      cursorY = y + drawHeight + panelGap;
      return `${label}${panel}`;
    })
    .join('\n');

  const rootHeight = cursorY + outerMargin;
  const rootMetadata = `<metadata id="all-position-sheets">${escapeXml(
    JSON.stringify(
      sheets.map((sheet) => ({
        id: sheet.id,
        spec: sheet.spec,
        advanceWidth: getAdvanceWidth(sheet.positions),
        positions: sheet.positions,
      })),
    ),
  )}</metadata>`;

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="${SVG_NS}" class="mark-place-studio-preview" width="${rootWidth}" height="${number(
    rootHeight,
  )}" viewBox="0 0 ${rootWidth} ${number(rootHeight)}">
  <rect x="0" y="0" width="${rootWidth}" height="${number(
    rootHeight,
  )}" fill="#020617"></rect>
  ${rootMetadata}
  ${panels}
</svg>
`;
}
