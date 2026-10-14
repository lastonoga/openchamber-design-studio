// Shared between the panel and the local service, so the panel can render lint
// findings the service produced without either side importing the other.
export type LintSeverity = 'P0' | 'P1' | 'P2';

export type LintFinding = {
  /** Stable rule id, e.g. "anti-slop/indigo" or "contrast/body". */
  rule: string;
  severity: LintSeverity;
  message: string;
  /** Offending sample from the document, trimmed. */
  evidence?: string;
};

export type ContrastResult = {
  selector: string;
  fg: string;
  bg: string;
  ratio: number;
  level: 'AA' | 'AA-large' | 'fail';
};

export type LintResult = {
  findings: LintFinding[];
  contrast: ContrastResult[];
  /** How many times the accent colour is used as a fill/text on one screen. */
  accentUses: number;
};
