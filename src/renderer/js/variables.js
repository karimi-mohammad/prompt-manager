// variables.js — detect, merge, and replace variables in prompt text

// Matches {var_name} but NOT \{escaped\}
const VAR_RE = /(?<!\\)\{([a-zA-Z_][a-zA-Z0-9_-]*)\}/g;

/**
 * Detect all unique variables in body text, preserving order of first appearance.
 * Returns array of { name } objects.
 */
export function detectVariables(body) {
  const seen = new Set();
  const vars = [];
  const regex = new RegExp(VAR_RE.source, 'g');
  let match;

  while ((match = regex.exec(body)) !== null) {
    const name = match[1];
    if (!seen.has(name)) {
      seen.add(name);
      vars.push({ name });
    }
  }

  return vars;
}

/**
 * Merge detected variables with YAML metadata variables.
 * YAML metadata takes precedence for type/default/required/options.
 * Variables only in body get type: 'text'.
 */
export function mergeVariables(detectedVars, yamlVars) {
  const yamlMap = new Map((yamlVars || []).map(v => [v.name, v]));

  return detectedVars.map(dv => {
    const yaml = yamlMap.get(dv.name);
    if (yaml) {
      return { ...yaml }; // YAML metadata wins
    }
    return {
      name: dv.name,
      type: 'text',
      required: false,
      default: '',
    };
  });
}

/**
 * Replace variables in body with values.
 * Escaped variables (\{...\}) are unescaped to literal {text}.
 */
export function replaceVariables(body, values) {
  // First pass: replace real variables
  const result = body.replace(new RegExp(VAR_RE.source, 'g'), (full, name) => {
    const val = values[name];
    return val !== undefined ? val : '';
  });

  // Second pass: unescape escaped variables → literal {text}
  return result.replace(/\\{([^}]+)\\}/g, '{$1}');
}

/**
 * Validate that all required variables have values.
 * Returns { valid: boolean, missing: string[] }.
 */
export function validateRequired(variables, values) {
  const missing = [];
  for (const v of variables) {
    if (v.required && (!values[v.name] || values[v.name].trim() === '')) {
      missing.push(v.name);
    }
  }
  return { valid: missing.length === 0, missing };
}
