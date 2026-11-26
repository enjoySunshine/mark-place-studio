import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  PREVIEW_CASES,
  createAllPositionSheets,
  createPositionSheet,
  getPreviewFont,
  writePositionJson,
} from './positions.mjs';
import { renderPreviewSvg, renderRunSvg } from './render.mjs';

export { renderPreviewSvg, renderRunSvg };
export {
  PREVIEW_CASES,
  createPositionSheet,
  createAllPositionSheets,
} from './positions.mjs';

const previewDirectory = import.meta.dirname;

function writePreviewFile(filename, contents) {
  const outputPath = path.join(previewDirectory, filename);
  fs.writeFileSync(outputPath, contents);
  return outputPath;
}

/**
 * The original OpenSans A preview, kept byte-for-byte in intent. Its advance
 * is 1296 and its path starts at M1120 0L938 465; mark-placement work must not
 * change this control glyph.
 */
function writeOpenSansAControl(log = console.log) {
  const font = getPreviewFont('test/data/OpenSans/OpenSans-Regular.ttf');
  const glyph = font.glyphForCodePoint(0x41);
  const d = glyph.path.toSVG();
  const box = glyph.path.bbox;
  const w = Math.max(1, Math.ceil(box.maxX - box.minX));
  const h = Math.max(1, Math.ceil(box.maxY - box.minY));
  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="${box.minX} ${-box.maxY} ${w} ${h}" width="480" height="480">
  <rect x="${box.minX}" y="${-box.maxY}" width="${w}" height="${h}" fill="#111"/>
  <path d="${d}" transform="scale(1,-1)" fill="#f4f1ea"/>
</svg>
`;

  const outputPath = writePreviewFile('open-sans-a.svg', svg);
  log('wrote preview/open-sans-a.svg', w, h);
  return outputPath;
}

export function main(options = {}) {
  const log = options.silent ? () => {} : console.log;
  const sheets = createAllPositionSheets(PREVIEW_CASES);
  const sheetsById = Object.fromEntries(
    sheets.map((sheet) => [sheet.id, sheet]),
  );

  // The one machine-readable placement sheet. Every SVG below reads these
  // same xOffset/yOffset/xAdvance/yAdvance values.
  const jsonPath = writePositionJson(sheets);
  const outJsonPath = writePreviewFile(
    'out.json',
    `${JSON.stringify(sheets, null, 2)}\n`,
  );

  const previewSvg = renderPreviewSvg(sheets);
  const outPath = writePreviewFile('out.svg', previewSvg);

  const markSheets = [sheetsById['hebrew-gpos'], sheetsById['myanmar-gpos']];
  writePreviewFile(
    'marks.svg',
    renderPreviewSvg(markSheets, { panelMaxHeight: 420 }),
  );
  writePreviewFile(
    'hebrew.svg',
    renderRunSvg(sheetsById['hebrew-gpos'], { width: 1100 }),
  );
  writePreviewFile(
    'myanmar.svg',
    renderRunSvg(sheetsById['myanmar-gpos'], { width: 720 }),
  );
  writePreviewFile(
    'fallback.svg',
    renderRunSvg(sheetsById['unicode-fallback'], { width: 900 }),
  );

  writeOpenSansAControl(log);

  for (const sheet of sheets) {
    if (sheet.expectedSpec && sheet.spec !== sheet.expectedSpec) {
      throw new Error(
        `${sheet.id}: expected ${sheet.expectedSpec}, got ${sheet.spec}`,
      );
    }

    if (
      sheet.expectedAdvanceWidth != null &&
      sheet.advanceWidth !== sheet.expectedAdvanceWidth
    ) {
      throw new Error(
        `${sheet.id}: expected advance ${sheet.expectedAdvanceWidth}, got ${sheet.advanceWidth}`,
      );
    }

    if (sheet.expectedPathPrefix) {
      const prefix = sheet.glyphs[0]?.d.slice(
        0,
        sheet.expectedPathPrefix.length,
      );
      if (prefix !== sheet.expectedPathPrefix) {
        throw new Error(
          `${sheet.id}: expected path prefix ${sheet.expectedPathPrefix}, got ${prefix}`,
        );
      }
    }

    log(
      `${sheet.id}: ${sheet.spec || sheet.glyphs.map((g) => g.id).join('|')} (advance ${sheet.advanceWidth})`,
    );
  }

  log('wrote preview/out.svg', outPath);
  log('wrote preview/positions.json', jsonPath);
  return { outPath, jsonPath, outJsonPath, sheets };
}

export const draw = main;
export const buildPreview = main;

Object.assign(main, {
  draw: main,
  buildPreview: main,
  renderRunSvg,
  renderPreviewSvg,
  createPositionSheet,
  createAllPositionSheets,
  PREVIEW_CASES,
});

export default main;

const invokedFile = process.argv[1] ? path.resolve(process.argv[1]) : '';
if (invokedFile === fileURLToPath(import.meta.url)) {
  const jsonOutput = process.argv.includes('--json');
  const result = main({ silent: jsonOutput });
  if (jsonOutput) {
    process.stdout.write(`${JSON.stringify(result.sheets)}\n`);
  }
} else {
  // Preserve the script's historical import-time side effect.
  main();
}
