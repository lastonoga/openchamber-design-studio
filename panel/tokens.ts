// Parse and rewrite a `tokens.css` custom-property file so the panel can offer a
// light editor without owning the file format. The agent owns tokens.css; the
// panel only edits values it already found and appends missing ones.
export type Token = { name: string; value: string };

const DECL_RE = /(--[a-zA-Z0-9-]+)\s*:\s*([^;{}]+);/g;

export function parseTokensCss(css: string): Token[] {
  const seen = new Map<string, string>();
  DECL_RE.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = DECL_RE.exec(css))) {
    if (!seen.has(match[1]!)) seen.set(match[1]!, match[2]!.trim());
  }
  return [...seen.entries()].map(([name, value]) => ({ name, value }));
}

/** Replace existing values in place; append names that were not present. */
export function serializeTokensCss(tokens: Token[], originalCss: string): string {
  let css = originalCss;
  const appended: Token[] = [];
  for (const token of tokens) {
    const declRe = new RegExp(`(${token.name}\\s*:\\s*)([^;{}]+)(;)`);
    if (declRe.test(css)) {
      css = css.replace(declRe, `$1${token.value}$3`);
    } else {
      appended.push(token);
    }
  }
  if (appended.length === 0) return css;
  const block = appended.map((token) => `  ${token.name}: ${token.value};`).join('\n');
  if (/:root\s*\{/.test(css)) {
    return css.replace(/:root\s*\{/, (open) => `${open}\n${block}`);
  }
  return `${css}\n:root {\n${block}\n}\n`;
}

const COLOR_RE = /^(#[0-9a-fA-F]{3,8}|rgba?\([^)]*\)|\b(?:white|black|transparent|currentColor)\b|oklch\([^)]*\))$/;

export function isColorValue(value: string): boolean {
  return COLOR_RE.test(value.trim());
}

/** Best-effort swatch background for <input type=color>; null when not a hex. */
export function toHex(value: string): string | null {
  const trimmed = value.trim();
  if (/^#[0-9a-fA-F]{6}$/.test(trimmed)) return trimmed;
  if (/^#[0-9a-fA-F]{3}$/.test(trimmed)) {
    return `#${trimmed[1]}${trimmed[1]}${trimmed[2]}${trimmed[2]}${trimmed[3]}${trimmed[3]}`;
  }
  return null;
}
