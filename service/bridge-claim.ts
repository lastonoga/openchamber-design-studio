/**
 * Exclusive, expiring ownership of the pick→chat bridge.
 *
 * When `/design` runs inside a chat window, the host mounts a hidden command
 * pane there; while that pane holds the bridge it claims ownership here and
 * heartbeats every few hundred ms, attaching each picked element into ITS OWN
 * window's composer. The always-running Work Status row in the main window
 * reads `active()` from /state and stands down while a bridge owns the picks,
 * so a pick never becomes two chips in two windows. If the holding pane dies
 * (its window closed, the host removed the frame), the claim expires and the
 * row quietly resumes.
 */
import { randomBytes } from 'node:crypto';

export type BridgeClaim =
  | { ok: true; token: string; ttlMs: number }
  | { ok: false; bridgeActive: true };

export class BridgeClaims {
  private token = '';
  private until = 0;
  private readonly ttlMs: number;
  private readonly now: () => number;

  constructor(ttlMs = 4000, now: () => number = Date.now) {
    this.ttlMs = ttlMs;
    this.now = now;
  }

  /** Claim or heartbeat. An existing holder renews with its token; anyone else is refused while the claim is warm. */
  claim(requestedToken?: string): BridgeClaim {
    const at = this.now();
    if (this.until > at) {
      if (requestedToken !== undefined && requestedToken === this.token) {
        this.until = at + this.ttlMs;
        return { ok: true, token: this.token, ttlMs: this.ttlMs };
      }
      return { ok: false, bridgeActive: true };
    }
    if (requestedToken === undefined || requestedToken !== this.token) this.token = newBridgeToken();
    this.until = at + this.ttlMs;
    return { ok: true, token: this.token, ttlMs: this.ttlMs };
  }

  /** Give the bridge up early (the holding pane is shutting down cleanly). */
  release(token: string): boolean {
    if (this.until > this.now() && this.token === token) {
      this.token = '';
      this.until = 0;
      return true;
    }
    return false;
  }

  /** Whether a warm claim exists right now — what /state reports to every panel. */
  active(): boolean {
    return this.until > this.now();
  }
}

function newBridgeToken(): string {
  return `ds-bridge-${randomBytes(12).toString('hex')}`;
}
