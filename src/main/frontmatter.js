const yaml = require('js-yaml');

/**
 * Parse a Markdown file's YAML front matter.
 * Returns { meta: {...}, body: '...', rawMeta: '...' } or { meta: null, body: fullText, rawMeta: '' }.
 * Unknown keys in YAML are preserved (stored in _rawKeys).
 */
function parseFrontMatter(text) {
  const match = text.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!match) return { meta: null, body: text, rawMeta: '' };

  const rawYaml = match[1];
  const body = match[2];

  try {
    // js-yaml v5: load() uses safe schema by default
    const meta = yaml.load(rawYaml) || {};
    return { meta, body, rawMeta: rawYaml };
  } catch {
    // Malformed YAML — treat entire text as body
    return { meta: null, body: text, rawMeta: '' };
  }
}

/**
 * Serialize meta + body back to a Markdown string with YAML front matter.
 * Preserves unknown keys from _rawKeys if present.
 */
function serializeFrontMatter(meta, body) {
  // Remove internal tracking fields before dump
  const toDump = { ...meta };
  delete toDump._rawKeys;

  const yamlStr = yaml.dump(toDump, {
    lineWidth: -1,
    quotingType: "'",
    forceQuotes: false,
  }).trimEnd();

  return `---\n${yamlStr}\n---\n${body}`;
}

module.exports = { parseFrontMatter, serializeFrontMatter };
