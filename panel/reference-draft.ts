import type { JsonValue } from '@openchamber/sdk';

/** Paths are canonical service results; the source is captured when staged. */
export type DraftReference = {
  id: string;
  kind: 'file' | 'project';
  path: string;
  sourceDirectory: string;
  label: string;
};

export function addDraftReference(existing: readonly DraftReference[], reference: DraftReference): DraftReference[] {
  if (existing.some((item) => item.kind === reference.kind && item.path === reference.path)) return [...existing];
  return [...existing, { ...reference }];
}

export function removeDraftReference(existing: readonly DraftReference[], id: string): DraftReference[] {
  return existing.filter((item) => item.id !== id);
}

// Installed SDK contract: both attachment text and serialized data cap at 16000
// characters. Check before startSession can clamp text or silently drop data.
const PAYLOAD_LIMIT = 16000;

export function buildReferenceSubmission(
  text: string,
  data: JsonValue | undefined,
  references: readonly DraftReference[],
): { text: string; data: JsonValue | undefined } {
  let submittedText = text;
  let submittedData = data;
  if (references.length > 0) {
    const retained = references.map((reference) => ({ ...reference }));
    submittedText += '\n\nDesign Studio references (paths only; no file contents uploaded):\n' + retained.map((reference) =>
      `- ${reference.kind}: ${JSON.stringify(reference.path)}; source directory: ${JSON.stringify(reference.sourceDirectory)}; label: ${JSON.stringify(reference.label)}`,
    ).join('\n');
    submittedData = data !== null && typeof data === 'object' && !Array.isArray(data)
      ? { ...data, references: retained }
      : { ...(data === undefined ? {} : { baseData: data }), references: retained };
  }
  if (submittedText.length > PAYLOAD_LIMIT) {
    throw new Error('Design prompt exceeds 16000 characters. Shorten the brief or remove references before sending.');
  }
  let serialized: string | undefined;
  try {
    serialized = JSON.stringify(submittedData);
  } catch {
    throw new Error('Design metadata must be serializable JSON. Remove invalid reference metadata before sending.');
  }
  if (serialized !== undefined && serialized.length > PAYLOAD_LIMIT) {
    throw new Error('Design metadata exceeds 16000 JSON characters. Shorten the brief or remove references before sending.');
  }
  return { text: submittedText, data: submittedData };
}
