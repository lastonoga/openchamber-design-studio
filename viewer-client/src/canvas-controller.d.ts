/** This function must remain self-contained for server-side source serialization. */
export function initCanvas(initialConfig: { url: string; pages: readonly { id: string; label: string; url: string }[]; viewport: { width: number; height: number } }): unknown;
