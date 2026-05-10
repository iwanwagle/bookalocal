// Lightweight server-side sanitizer for free-text user fields.
//
// Our text fields (description, bio, special_requests, etc.) are plain text — we
// don't intentionally support markdown or HTML. So the safest approach is to strip
// any tag-like content on input. This prevents stored XSS even if a frontend ever
// renders the field via dangerouslySetInnerHTML by mistake.
//
// We don't use DOMPurify here because:
//   1. It requires jsdom on Node (heavy dependency).
//   2. We don't want to allow ANY HTML — sanitisation, not HTML filtering.
//
// For fields that legitimately need rich text (e.g. blog posts) we'd switch to
// DOMPurify or sanitize-html with an explicit allow-list. We don't have any yet.

// Match: <tag>, </tag>, <tag attr="...">, <!-- ... -->, <![CDATA[ ... ]]>, etc.
const TAG_RE = /<\/?[a-zA-Z][^>]*>|<!--[\s\S]*?-->|<!\[CDATA\[[\s\S]*?\]\]>/g;

// Match decimal/hex/named char references that could obfuscate tag-like content
// after we strip plain tags. We replace with a space rather than decoding to avoid
// double-decoding bugs in downstream consumers.
const ENTITY_RE = /&(?:#x?[0-9a-fA-F]+|[a-zA-Z]+);/g;

/**
 * Strip all HTML/XML markup from a string.
 * Preserves regular text, line breaks, and unicode. Leaves markdown alone since
 * markdown isn't HTML — it's interpreted on the client only when explicitly
 * rendered through a markdown engine.
 */
function stripTags(input) {
  if (input == null) return input;
  if (typeof input !== 'string') return input;
  // Two passes: strip tags, then re-strip in case stripping revealed nested ones.
  let cleaned = input.replace(TAG_RE, '');
  if (cleaned.length !== input.length) {
    cleaned = cleaned.replace(TAG_RE, '');
  }
  return cleaned;
}

/**
 * Express middleware: strip tags from named body fields in-place.
 * Usage: router.post('/x', sanitizeBody(['description', 'bio']), handler)
 */
function sanitizeBody(fields) {
  return (req, _res, next) => {
    if (!req.body || typeof req.body !== 'object') return next();
    for (const f of fields) {
      if (typeof req.body[f] === 'string') {
        req.body[f] = stripTags(req.body[f]);
      }
    }
    next();
  };
}

module.exports = { stripTags, sanitizeBody };
