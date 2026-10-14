// The gate runner. Every gate here is pure and deterministic (G1, G3, G4, G5,
// G6): each reads a page probe and returns findings, with no stored screenshots.
//
// runGateReport is the one entry point the service calls: it takes the parsed
// probe plus whatever token/source context the host has, and returns one
// GateResult per gate, in GATE_ORDER. Each gate is also exported on its own so
// tests can drive it with a single fixture.
import { GATE_ORDER } from '../../shared/verify-types.ts';
import type { GateId, GateResult } from '../../shared/verify-types.ts';
import type { ProbeReport } from './probe.ts';
import { runOverflowGate } from './overflow.ts';
import { runA11yGate } from './a11y.ts';
import { runSemanticsGate } from './semantics.ts';
import { runTokensGate } from './tokens.ts';
import { runLayoutGate } from './layout.ts';

export type { ProbeElement, ProbeReport, ProbeRect, ProbeStyles } from './probe.ts';
export { runOverflowGate } from './overflow.ts';
export { runA11yGate } from './a11y.ts';
export { runSemanticsGate } from './semantics.ts';
export { runTokensGate } from './tokens.ts';
export type { TokensInput } from './tokens.ts';
export { runLayoutGate } from './layout.ts';

export type GateContext = {
  tokens?: Record<string, string>;
  files?: { path: string; text: string }[];
};

/**
 * Run every gate over one probe, in GATE_ORDER.
 */
export function runGateReport(probe: ProbeReport, ctx: GateContext = {}): GateResult[] {
  const byGate: Partial<Record<GateId, GateResult>> = {
    G1: runOverflowGate(probe),
    G4: runTokensGate({ files: ctx.files ?? [], tokens: ctx.tokens ?? {} }),
    G3: runA11yGate(probe),
    G6: runSemanticsGate(probe),
    G5: runLayoutGate(probe),
  };

  return GATE_ORDER.filter((gate) => byGate[gate] !== undefined).map((gate) => byGate[gate]!);
}
