// Build the text the panel drops into the standard OpenChamber chat. The panel
// never sends on its own unless the user asks; `compose` appends, so the user
// reviews and can add their own wording before sending.
//
// All copy here is English: the user requires English-only UI, and the model
// handles English instructions natively.
export type SelectedElement = {
  selector: string;
  tag: string;
  id: string;
  classes: string;
  text: string;
  outerHTML: string;
  styles: Record<string, string>;
  rect: { x: number; y: number; width: number; height: number };
};

const PREAMBLE =
  'You are working inside Design Studio. Edit only the design files in this project, keep the visual system consistent, and favor a strong, opinionated result over a generic one.';

function styleLines(styles: Record<string, string>): string {
  const keys = ['font-family', 'font-size', 'font-weight', 'line-height', 'color', 'background-color', 'border-radius', 'padding', 'margin', 'display', 'gap'];
  return keys
    .filter((key) => styles[key] && styles[key] !== 'normal' && styles[key] !== 'none')
    .map((key) => `  ${key}: ${styles[key]};`)
    .join('\n');
}

export function buildEditPrompt(entry: string, element: SelectedElement, intent: string): string {
  const intentText = intent.trim() || 'Improve this element so it looks better and matches its neighbours.';
  return [
    PREAMBLE,
    '',
    `File: ${entry}`,
    `Element: ${element.selector}${element.classes ? ` (classes: ${element.classes})` : ''}`,
    `Tag: ${element.tag}`,
    element.text ? `Text: ${JSON.stringify(element.text)}` : 'Text: (empty)',
    'Current styles:',
    styleLines(element.styles) || '  (no notable styles)',
    'Markup:',
    '```html',
    element.outerHTML,
    '```',
    '',
    `Task: ${intentText}`,
  ].join('\n');
}

export function buildBoardPrompt(entry: string, intent: string): string {
  const intentText = intent.trim() || 'Build or refine the layout into something coherent and well-crafted.';
  return [PREAMBLE, '', `File: ${entry || '(pick or create an entry html)'}`, `Task: ${intentText}`].join('\n');
}
