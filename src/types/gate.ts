/**
 * Core gate type definitions for Scrap Mechanic logic system.
 *
 * Scrap Mechanic supports 6 logic gate types: AND, OR, XOR and their
 * negated counterparts NAND, NOR, XNOR. All gates support unlimited
 * inputs and have a 1-tick propagation delay.
 */

/** The 6 logic gate types available in Scrap Mechanic */
export type LogicGateType = "and" | "or" | "xor" | "nand" | "nor" | "xnor";

/** All gate types including timer as a special case */
export type GateType = LogicGateType | "timer" | "input" | "output";

/** Gate mode values used in Scrap Mechanic blueprint controller field */
export const GATE_MODE_MAP: Readonly<Record<LogicGateType, number>> = {
  and: 0,
  or: 1,
  xor: 2,
  nand: 3,
  nor: 4,
  xnor: 5,
} as const;

/** Reverse lookup: mode number to gate type */
export const MODE_TO_GATE_TYPE: Readonly<Record<number, LogicGateType>> = {
  0: "and",
  1: "or",
  2: "xor",
  3: "nand",
  4: "nor",
  5: "xnor",
} as const;

/** Human-readable names for each gate type */
export const GATE_DISPLAY_NAMES: Readonly<Record<LogicGateType, string>> = {
  and: "AND",
  or: "OR",
  xor: "XOR",
  nand: "NAND",
  nor: "NOR",
  xnor: "XNOR",
} as const;

/** Gate category classification */
export type GateCategory = "and-family" | "or-family" | "xor-family";

/** Classify a gate into its logical family */
export function getGateCategory(type: LogicGateType): GateCategory {
  switch (type) {
    case "and":
    case "nand":
      return "and-family";
    case "or":
    case "nor":
      return "or-family";
    case "xor":
    case "xnor":
      return "xor-family";
  }
}

/** Check if a gate type produces negated output */
export function isNegatedGate(type: LogicGateType): boolean {
  return type === "nand" || type === "nor" || type === "xnor";
}

/** Get the base (non-negated) form of a gate type */
export function getBaseGate(type: LogicGateType): "and" | "or" | "xor" {
  switch (type) {
    case "and":
    case "nand":
      return "and";
    case "or":
    case "nor":
      return "or";
    case "xor":
    case "xnor":
      return "xor";
  }
}

/** Configuration for a single gate in a circuit */
export interface GateConfig {
  readonly id: string;
  readonly type: GateType;
  readonly inputs: readonly string[];
  readonly output: string;
  readonly delay?: number; // ticks, only for timer type
  readonly description?: string;
}

/** Validated gate configuration */
export interface ValidatedGate extends GateConfig {
  validated: true;
}
