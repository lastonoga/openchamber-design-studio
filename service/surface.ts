// The single Browser instance the service owns.
//
// The in-panel shared surface and its HTTP routes (/surface/frame|input|
// control|resize|clipboard, /navigate, /state, /pick) are gone: the live view
// is now the real Chrome window itself, opened through main.ts's /open route.
//
// This module keeps only the process-wide singleton because browser-control.ts
// and verify.ts import `ensureBrowser` / `getController` from here; the surface
// control notice is no longer fed by any route, so `getController` is a
// constant the harness can keep reading.
import type { SurfaceController } from '@openchamber/sdk';

import { Browser } from './browser.ts';

let browser: Browser | null = null;

/**
 * The single Browser instance, started on demand.
 *
 * With a URL this launches (or reuses) the live window at it. WITHOUT a URL it
 * returns the handle and deliberately does NOT launch: callers that then
 * navigate (verify.ts, browser-control.ts) supply the real URL and the window
 * is created lazily at it. That is what keeps an `about:blank` placeholder out
 * of the launch path — a blank launch would give a normal tabbed window.
 */
export async function ensureBrowser(url?: string): Promise<Browser> {
  if (!browser) browser = new Browser();
  if (url !== undefined) await browser.start(url);
  return browser;
}

/** The Browser instance if one has started, else null. */
export function getBrowser(): Browser | null {
  return browser;
}

/**
 * Stop the service's link to the live window.
 *
 * The window is the user's, not the service's: it is spawned detached and is
 * deliberately NOT killed here, so a host stop/restart leaves the page on
 * screen. A restarted service cannot re-attach (it does not persist the
 * throwaway profile or the random debugging port), so it reports
 * `windowOpen:false` and the next `/open` launches a fresh window. Set
 * `DS_KILL_WINDOW_ON_STOP=1` to kill it anyway (tests do, to avoid leaking a
 * window).
 */
export async function stopBrowser(): Promise<void> {
  if (!browser) return;
  const current = browser;
  browser = null;
  await current.stop({ kill: process.env.DS_KILL_WINDOW_ON_STOP === '1' });
}

/**
 * Last control notice from the host. The surface routes that used to set it are
 * removed, so it is permanently 'none'; kept for verify.ts's control guard.
 */
export function getController(): SurfaceController {
  return 'none';
}
