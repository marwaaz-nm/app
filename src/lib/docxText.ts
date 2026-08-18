import 'server-only';

import JSZip from 'jszip';

const NAMED_ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
};

function decodeEntities(value: string): string {
  return value.replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z]+);/g, (match, entity: string) => {
    if (entity[0] === '#') {
      const codePoint = entity[1] === 'x' || entity[1] === 'X'
        ? parseInt(entity.slice(2), 16)
        : parseInt(entity.slice(1), 10);
      return Number.isFinite(codePoint) ? String.fromCodePoint(codePoint) : match;
    }
    return NAMED_ENTITIES[entity] ?? match;
  });
}

// Word stores text runs in <w:t> elements. Extracting text runs directly is
// significantly faster and avoids performing expensive regex replacements across
// megabytes of styling and layout XML markup.
export async function extractDocxText(buffer: Buffer): Promise<string> {
  const zip = await JSZip.loadAsync(buffer);
  const documentXml = zip.file('word/document.xml');
  if (!documentXml) return '';

  const xml = await documentXml.async('text');
  const matches = xml.match(/<w:t(?:\s+[^>]*)?>([\s\S]*?)<\/w:t>/g);
  if (!matches || matches.length === 0) return '';

  const textPieces: string[] = [];
  for (let i = 0; i < matches.length; i++) {
    const raw = matches[i].replace(/^<w:t(?:\s+[^>]*)?>|<\/w:t>$/g, '');
    if (raw) {
      textPieces.push(decodeEntities(raw));
    }
  }

  return textPieces.join(' ').replace(/\s+/g, ' ').trim();
}

