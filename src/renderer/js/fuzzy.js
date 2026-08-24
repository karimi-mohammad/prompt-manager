// fuzzy.js — subsequence fuzzy matcher with scoring

/**
 * Score how well query matches haystack (case-insensitive subsequence).
 * Returns { score, positions } or null if not a match.
 * positions = indices in haystack that matched query chars.
 */
export function fuzzyMatch(query, haystack) {
  if (!query) return { score: 1, positions: [] };

  const q = query.toLowerCase();
  const h = haystack.toLowerCase();
  const positions = [];
  let qi = 0;
  let score = 0;
  let lastMatchIdx = -2;

  for (let hi = 0; hi < h.length && qi < q.length; hi++) {
    if (h[hi] === q[qi]) {
      positions.push(hi);
      score += 10;
      // Bonus for consecutive matches
      if (hi === lastMatchIdx + 1) score += 8;
      // Bonus for match at start of word
      if (hi === 0 || /[\s\-_./]/.test(h[hi - 1])) score += 5;
      // Bonus for lowercase match (more precise)
      if (haystack[hi] === query[qi]) score += 2;
      lastMatchIdx = hi;
      qi++;
    }
  }

  // Not all query chars matched
  if (qi < q.length) return null;

  // Penalty for long gaps between first and last match
  const span = positions[positions.length - 1] - positions[0];
  score -= Math.max(0, span - q.length) * 0.5;

  return { score, positions };
}

/**
 * Search a list of prompts with a query string.
 * Searches across title, description, tags, and category.
 * Returns sorted results [{ prompt, score, titlePositions }].
 */
export function fuzzySearch(prompts, query) {
  if (!query || !query.trim()) {
    return prompts.map(p => ({ prompt: p, score: 0, titlePositions: [] }));
  }

  const results = [];
  for (const p of prompts) {
    const titleMatch = fuzzyMatch(query, p.title || '');
    const descMatch = fuzzyMatch(query, p.description || '');
    const catMatch = fuzzyMatch(query, p.category || '');
    const tagMatches = (p.tags || [])
      .map(t => fuzzyMatch(query, t))
      .filter(Boolean);

    const bestTag = tagMatches.length
      ? tagMatches.reduce((a, b) => b.score > a.score ? b : a)
      : null;

    // Best score across all fields
    const candidates = [titleMatch, descMatch, catMatch, bestTag].filter(Boolean);
    if (candidates.length === 0) continue;

    // Weight title matches highest
    const best = candidates.reduce((a, b) => {
      const aWeight = a === titleMatch ? 1.5 : 1;
      const bWeight = b === titleMatch ? 1.5 : 1;
      return (b.score * bWeight) > (a.score * aWeight) ? b : a;
    });

    const titlePositions = titleMatch ? titleMatch.positions : [];
    results.push({
      prompt: p,
      score: best.score * (titleMatch ? 1.5 : 1),
      titlePositions,
    });
  }

  results.sort((a, b) => b.score - a.score);
  return results;
}
