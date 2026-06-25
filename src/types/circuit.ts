/**
 * Circuit definition types.
 *
 * A circuit is a directed graph of gates with named inputs and outputs.
 * Feedback loops are explicitly declared for sequential circuits.
 */

import type { GateConfig, GateType, LogicGateType } from "./gate.js";

export type { GateConfig, GateType } from "./gate.js";
export type { LogicGateType } from "./gate.js";

/** A single test vector for circuit verification */
export interface TestVector {
  readonly name: string;
  readonly inputs: Readonly<Record<string, boolean>>;
  readonly expected: Readonly<Record<string, boolean>>;
}

/** Feedback loop declaration for sequential circuits */
export interface FeedbackMapping {
  /** Source output name maps to target input name */
  readonly [sourceOutput: string]: string;
}

/** The circuit definition format (.sm-circuit.json) */
export interface CircuitDefinition {
  readonly name: string;
  readonly description?: string;
  readonly version?: string;
  readonly inputs: readonly string[];
  readonly outputs: readonly string[];
  readonly gates: readonly GateConfig[];
  readonly feedback?: FeedbackMapping;
}

/** Internal node in the circuit graph */
export interface CircuitNode {
  readonly id: string;
  readonly type: GateType;
  readonly isInput: boolean;
  readonly isOutput: boolean;
  readonly delay: number;
  readonly sourceGateIds: readonly string[];
  readonly state: NodeState;
}

/** State of a single node during simulation */
export interface NodeState {
  currentState: boolean;
  prevState: boolean;
}

/** Resolved circuit ready for simulation */
export interface ResolvedCircuit {
  readonly name: string;
  readonly description: string;
  readonly version: string;
  readonly inputNames: readonly string[];
  readonly outputNames: readonly string[];
  readonly nodes: ReadonlyMap<string, CircuitNode>;
  readonly feedback: FeedbackMapping;
  readonly topologicalOrder: readonly string[];
  readonly hasFeedback: boolean;
}

/** Gate count statistics for a circuit */
export interface CircuitStats {
  readonly totalGates: number;
  readonly inputCount: number;
  readonly outputCount: number;
  readonly timerCount: number;
  readonly gateBreakdown: Readonly<Record<LogicGateType, number>>;
  readonly estimatedTickDepth: number;
}

/** Wire connection between two gates */
export interface Wire {
  readonly from: string;
  readonly to: string;
  readonly label?: string;
}
