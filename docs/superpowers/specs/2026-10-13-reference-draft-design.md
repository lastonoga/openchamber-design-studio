# Design Studio reference draft repair

Approved direction: user selected pasted paths only on 2026-10-13.

## Experience
Studio owns a reference-only draft, rendered as one wrapping chip list inside its composer between the textarea and toolbar. Removing a chip removes that staged reference. References survive rerenders, project changes and send failures. The source directory is captured when adding, not reinterpreted when selecting another target project. No host-composer attachment is made from the Studio page.

The Add menu works without a preview URL. Pasted relative paths resolve from the explicitly selected/current registered project; absolute paths identify an explicitly supplied external file. Validate file existence/readability through the extension service; never upload file bytes. Duplicates use resolved full paths, not basenames. Dropping files never stages their names as paths: explain that the user must paste the accessible path. In-session picked-element attachments retain host.attach.

## Submission
Include all retained file/project references explicitly in the first design prompt and in optional existing session metadata. Validate full text and serialized metadata against SDK limits before session creation; never silently truncate reference data. Retain the entire draft when creation or sending fails, including no-model. Use supported SDK operations only; do not broaden folder isolation or registration work.

## States and accessibility
No chips when empty. Loading path validation has progress and a delayed explanation. Errors retain the entered path and explain the next action. A duplicate announces Already added. Long paths wrap/truncate without horizontal scrolling and retain accessible full names. Remove controls are labelled and keyboard accessible; focus follows the next chip or Add. Announce changes. The existing overlay toggle/outside/Escape/select/focus contract remains.

## Rail
No manifest change: the user can hide the rail icon through Configure panels, leaving the sidebar page, /design and Work Status intact. No supported author-side visibility flag exists in current SDK.

## Evidence
Observed source panel/main.ts:1767-1869 calls host.attach into the original host composer, intentionally omits a local chip list, and sends no references in startSession. SDK PanelContribution and parser require panel.entry for a contributed full-page view. Reference: MDN File.name excludes the filesystem path; installed SDK 2.2 contracts and host 2.3 were inspected on 13.10.2026.

## Acceptance
Actual built panel must show/add/remove chips without a preview URL, keep source-qualified references across rerenders, send only retained references, avoid host.attach on the page, reject inaccessible paths and filename-only drops, and preserve the draft on failed sending. Rendering gates: overflow, design tokens, accessibility, semantics, layout at 320, 375, 390, 768, 1024, 1280, 1440, 2048. Maximum five corrective iterations; primary owns final checks.
