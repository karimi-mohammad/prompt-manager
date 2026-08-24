// markdown.js — render markdown with variable highlighting

/**
 * Sanitize HTML output to prevent XSS.
 * Uses vendored DOMPurify (window.DOMPurify).
 */
function sanitize(html) {
  const purify = window.DOMPurify;
  if (purify) {
    return purify.sanitize(html, {
      ALLOWED_TAGS: ['p','br','strong','em','b','i','u','s','code','pre','blockquote',
        'ul','ol','li','h1','h2','h3','h4','h5','h6','hr','table','thead','tbody',
        'tr','th','td','a','img','span','div','mark','del','sup','sub'],
      ALLOWED_ATTR: ['href','src','alt','title','class','id','target','rel'],
    });
  }
  return html;
}

/**
 * Render markdown body to HTML, highlighting {variables}.
 * Uses vendored marked.js (window.marked). Output is sanitized with DOMPurify.
 */
export function renderMarkdown(body) {
  if (!body) return '';

  // Highlight variables before sending to marked
  const highlighted = body.replace(
    /(?<!\\)\{([a-zA-Z_][a-zA-Z0-9_-]*)\}/g,
    '<span class="var-highlight">{$1}</span>'
  );

  const marked = window.marked;
  if (marked) {
    return sanitize(marked.parse(highlighted));
  }

  return '<pre>' + escapeHtml(body) + '</pre>';
}

/**
 * Render markdown for the final prompt (no variable highlighting, sanitized).
 */
export function renderFinalMarkdown(body) {
  const marked = window.marked;
  if (marked) {
    return sanitize(marked.parse(body));
  }
  return '<pre>' + escapeHtml(body) + '</pre>';
}

function escapeHtml(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}
