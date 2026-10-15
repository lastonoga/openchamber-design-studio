// The attach payload builder for picked elements.
//
// The former attach-dialog mode (the composer "+" menu) was removed: Design
// Mode is started with the `/design` command inside the target chat, whose
// hidden resolve frame doubles as the pick→chat bridge (see panel/main.ts).
// What stays here is the chip handed to `host.attach` for a picked element —
// the SAME shape every pick path sends, so a chip is indistinguishable
// regardless of which window picked it.
import type { AttachIssueRequest } from '@openchamber/sdk';

import { referenceText, type PickPayload } from './api.ts';

/**
 * The chip handed to `host.attach` for a picked element — the SAME shape
 * `addToChat` sends from the panel's live pick pipeline, so a picked-element
 * chip is identical no matter which window picked it.
 */
export function buildAttachPayload(
  pick: PickPayload,
  seq: number,
  url: string,
  pickedAt: Date,
): AttachIssueRequest {
  return {
    providerId: 'design-studio',
    id: `element-${seq}`,
    title: pick.selector,
    url,
    text: referenceText(pick, url, pickedAt),
    data: {
      selector: pick.selector,
      tag: pick.tag,
      classes: pick.classes,
      snippet: pick.outerHTML,
      styles: pick.styles,
      url,
    },
  };
}
