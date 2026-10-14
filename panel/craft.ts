// Craft rulebooks and visual directions for the Design Studio harness.
//
// The rulebook itself now lives in `shared/harness-text.ts`, the single source of
// truth shared with the service's generated OpenCode plugin. This file keeps the
// visual directions (a panel-only concern) and re-exports the rulebook so existing
// imports from `./craft.ts` keep working.

import { CRAFT_RULES, defaultCraft } from '../shared/harness-text.ts';
import type { CraftRuleId } from '../shared/harness-text.ts';

export { CRAFT_RULES, defaultCraft };
export type { CraftRuleId };

export type DirectionId = 'editorial' | 'modern-minimal' | 'human' | 'tech-utility';

export type Direction = {
  id: DirectionId;
  name: string;
  when: string;
  displayFont: string;
  bodyFont: string;
  tokens: Record<string, string>;
  posture: string[];
};

export const DIRECTIONS: Record<DirectionId, Direction> = {
  editorial: {
    id: 'editorial',
    name: 'Editorial',
    when: 'long-form reading, blogs, articles, magazines, brand storytelling with a voice',
    displayFont: 'a high-contrast serif (e.g. "Fraunces", "Playfair Display")',
    bodyFont: 'a companion serif or a quiet grotesque (e.g. "Source Serif 4", "Inter")',
    tokens: {
      '--bg': '#faf7f2',
      '--surface': '#f2ece3',
      '--fg': '#1c1a17',
      '--muted': '#6b6459',
      '--border': '#ded5c8',
      '--accent': '#a3341f',
    },
    posture: [
      'Lead with type, not chrome: generous measure, real hierarchy.',
      'Use an eyebrow label above headlines and a drop cap or standfirst where it helps.',
      'Let off-white paper tones and one warm accent carry the mood.',
      'Favor asymmetry and pull quotes over centered bland blocks.',
      'Keep rules, borders and shadows restrained; let whitespace separate.',
    ],
  },

  'modern-minimal': {
    id: 'modern-minimal',
    name: 'Modern Minimal',
    when: 'SaaS products, marketing and landing pages, developer tools with a crisp brand',
    displayFont: 'a tight geometric sans (e.g. "Inter Tight", "Geist")',
    bodyFont: 'the same family at body weight (e.g. "Inter")',
    tokens: {
      '--bg': '#ffffff',
      '--surface': '#f7f8f8',
      '--fg': '#0a0a0a',
      '--muted': '#6b7280',
      '--border': '#e5e7eb',
      '--accent': '#2563eb',
    },
    posture: [
      'Precise spacing on a consistent 4/8px rhythm.',
      'One crisp accent; everything else neutral and calm.',
      'Thin borders and subtle shadows, never heavy elevation.',
      'Strong typographic hierarchy with restrained color.',
      'Confident use of whitespace over decorative filler.',
    ],
  },

  human: {
    id: 'human',
    name: 'Human',
    when: 'consumer apps, kids and wellness, community, marketplaces and social products',
    displayFont: 'a friendly rounded face (e.g. "Nunito", "Baloo 2")',
    bodyFont: 'a warm readable sans (e.g. "Nunito Sans", "Inter")',
    tokens: {
      '--bg': '#fffdf9',
      '--surface': '#fff3e6',
      '--fg': '#2b2320',
      '--muted': '#8a7d74',
      '--border': '#f0e2d3',
      '--accent': '#ff6b52',
    },
    posture: [
      'Rounded corners and roomy padding throughout.',
      'Warm, saturated accent used sparingly for delight.',
      'Illustration and friendly microcopy over corporate tone.',
      'Clear, encouraging states for every step.',
      'Comfortable, touch-first tap targets.',
    ],
  },

  'tech-utility': {
    id: 'tech-utility',
    name: 'Tech Utility',
    when: 'dashboards, admin consoles, data and API tools, developer and ops products',
    displayFont: 'a neutral UI sans (e.g. "Inter", "IBM Plex Sans")',
    bodyFont: 'the same family, with a mono for code (e.g. "JetBrains Mono")',
    tokens: {
      '--bg': '#0e1116',
      '--surface': '#161b22',
      '--fg': '#e6edf3',
      '--muted': '#8b949e',
      '--border': '#30363d',
      '--accent': '#2f81f7',
    },
    posture: [
      'Density is a feature: compact rows, aligned columns, tabular numerals.',
      'Status color carries meaning and nothing else.',
      'Monospace for identifiers, values and code.',
      'Dark-first surfaces with clear separators, no decorative flourish.',
      'Every control reachable and legible at scale.',
    ],
  },
};

const DIRECTION_KEYWORDS: Array<[DirectionId, RegExp]> = [
  ['tech-utility', /\b(dashboard|data|analytics|api|developer|devops|ops|admin|console|table|chart|metrics|monitoring)\b/i],
  ['editorial', /\b(blog|article|editorial|magazine|journal|essay|news|long[- ]?form|publication)\b/i],
  ['human', /\b(kids|children|wellness|health|community|marketplace|social|fitness|family|charity|nonprofit)\b/i],
  ['modern-minimal', /\b(brand|marketing|landing|saas|startup|product|launch|agency|portfolio)\b/i],
];

// Order matters: the first matching bucket wins, so the more specific signals
// (data/editorial/human) are tested before the broad product bucket.
export function inferDirection(brief: string): DirectionId {
  for (const [id, re] of DIRECTION_KEYWORDS) {
    if (re.test(brief)) return id;
  }
  return 'modern-minimal';
}


