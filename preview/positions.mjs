import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as fontkit from 'fontkit';

const previewDirectory = path.dirname(fileURLToPath(import.meta.url));
export const repoRoot = path.resolve(previewDirectory, '..');

/**
 * The two GPOS cases from the positioning acceptance checks, plus a font
 * without GPOS used by the Unicode-property fallback.
 */
export const PREVIEW_CASES = [
  {
    id: 'hebrew-gpos',
    label: 'Hebrew · Taamey Frank CLM · הֲבֵל',
    fontPath: 'test/data/Hebrew/TaameyFrankCLM.ttf',
    text: 'הֲבֵל',
    kind: 'gpos',
    expectedSpec: '40+901|15@512,0+0|29+967|13@600,0+0|32+1071',
    expectedAdvanceWidth: 2939,
  },
  {
    id: 'myanmar-gpos',
    label: 'Myanmar · Noto Sans Myanmar Mark Advance · ကု',
    fontPath: 'test/data/NotoSans/NotoSansMyanmar-MarkAdvance.ttf',
    text: 'ကု',
    kind: 'gpos',
    expectedSpec: '1+1124|2@-5,0+0',
    expectedAdvanceWidth: 1124,
  },
  {
    id: 'unicode-fallback',
    label: 'No positioning table · FontkitMarkFallbackTest · x́̈',
    fontPath:
      'test/data/FontkitMarkFallbackTest/FontkitMarkFallbackTest-Italic.ttf',
    text: 'x́̈',
    kind: 'fallback',
  },
  {
    id: 'open-sans-a',
    label: 'Control · Open Sans A',
    fontPath: 'test/data/OpenSans/OpenSans-Regular.ttf',
    codePoint: 0x41,
    kind: 'control',
    expectedAdvanceWidth: 1296,
    expectedPathPrefix: 'M1120 0L938 465',
  },
];

const fontCache = new Map();

export function getPreviewFont(fontPath) {
  let font = fontCache.get(fontPath);
  if (!font) {
    const url = pathToFileUrl(path.join(repoRoot, fontPath));
    font = fontkit.openSync(url);
    fontCache.set(fontPath, font);
  }

  return font;
}

function pathToFileUrl(filename) {
  return new URL(`file://${filename}`);
}

/**
 * Format a run in the same compact notation used by test/shaping.js.
 */
export function formatPositionSpec(glyphs, positions) {
  return glyphs
    .map((glyph, index) => {
      const position = positions[index];
      let token = String(glyph.id);
      if (position.xOffset || position.yOffset) {
        token += `@${position.xOffset},${position.yOffset}`;
      }

      return `${token}+${position.xAdvance}`;
    })
    .join('|');
}

/**
 * Turn either a GlyphRun or plain glyph/position arrays into the single
 * offset+advance representation consumed by the preview.
 */
export function createPositionSheet(testCase) {
  const font = getPreviewFont(testCase.fontPath);
  let run;
  let text = testCase.text || '';

  if (testCase.text != null) {
    run = font.layout(testCase.text);
  } else {
    const glyph = font.glyphForCodePoint(testCase.codePoint);
    const position = {
      xAdvance: glyph.advanceWidth,
      yAdvance: 0,
      xOffset: 0,
      yOffset: 0,
    };
    run = {
      glyphs: [glyph],
      positions: [position],
      script: null,
      direction: 'ltr',
      advanceWidth: glyph.advanceWidth,
    };
    text = String.fromCodePoint(testCase.codePoint);
  }

  const positions = run.positions.map((position) => ({
    xAdvance: position.xAdvance,
    yAdvance: position.yAdvance,
    xOffset: position.xOffset,
    yOffset: position.yOffset,
  }));

  const glyphs = run.glyphs.map((glyph, index) => ({
    id: glyph.id,
    isMark: Boolean(glyph.isMark),
    nativeAdvanceWidth: glyph.advanceWidth,
    d: glyph.path.toSVG(),
    bbox: glyph.bbox
      ? {
          minX: glyph.bbox.minX,
          minY: glyph.bbox.minY,
          maxX: glyph.bbox.maxX,
          maxY: glyph.bbox.maxY,
        }
      : null,
    positionIndex: index,
  }));

  const spec = formatPositionSpec(run.glyphs, run.positions);

  return {
    id: testCase.id,
    label: testCase.label,
    kind: testCase.kind,
    text,
    script: run.script || null,
    direction: run.direction || null,
    spec,
    get advanceWidth() {
      return this.positions.reduce(
        (width, position) => width + position.xAdvance,
        0,
      );
    },
    get advanceHeight() {
      return this.positions.reduce(
        (height, position) => height + position.yAdvance,
        0,
      );
    },
    expectedSpec: testCase.expectedSpec || null,
    expectedAdvanceWidth: testCase.expectedAdvanceWidth || null,
    expectedPathPrefix: testCase.expectedPathPrefix || null,
    positions,
    glyphs,
  };
}

export function createAllPositionSheets(cases = PREVIEW_CASES) {
  return cases.map((testCase) => createPositionSheet(testCase));
}

export function writePositionJson(
  sheets,
  filename = path.join(previewDirectory, 'positions.json'),
) {
  fs.writeFileSync(filename, `${JSON.stringify(sheets, null, 2)}\n`);
  return filename;
}
