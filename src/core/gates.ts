/**
 * Gate evaluation functions, definitions, and truth tables.
 *
 * All evaluation functions faithfully model Scrap Mechanic's logic gate
 * behavior as extracted from SteveBenz/ScrapMechanicLogicGateSimulator Model.ts.
 *
 * Key insight: gates read from the PREVIOUS state of their inputs (prevState),
 * creating a 1-tick propagation delay per gate level.
 */

import type { LogicGateType } from "../types/gate.js";

// ---------------------------------------------------------------------------
// Gate type validation
// ---------------------------------------------------------------------------

const VALID_GATE_TYPES: readonly string[] = ["and", "or", "xor", "nand", "nor", "xnor"] as const;

/** Check if a string is a valid logic gate type */
export function isValidGateType(type: string): type is LogicGateType {
  return (VALID_GATE_TYPES as readonly string[]).includes(type);
}

// ---------------------------------------------------------------------------
// Gate definitions (mode numbers, min/max inputs, descriptions)
// ---------------------------------------------------------------------------

export interface GateDefinition {
  readonly type: LogicGateType;
  readonly mode: number;
  readonly minInputs: number;
  readonly maxInputs: number;
  readonly description: string;
  readonly smShapeId: string;
}

const GATE_DEFINITIONS: Readonly<Record<LogicGateType, GateDefinition>> = {
  and:  { type: "and",  mode: 0, minInputs: 1, maxInputs: 20, description: "AND gate — output ON when ALL inputs are ON", smShapeId: "9f0f56e8-2c31-4d83-996c-d00a9b296c3f" },
  or:   { type: "or",   mode: 1, minInputs: 1, maxInputs: 20, description: "OR gate — output ON when ANY input is ON", smShapeId: "9f0f56e8-2c31-4d83-996c-d00a9b296c3f" },
  xor:  { type: "xor",  mode: 2, minInputs: 1, maxInputs: 20, description: "XOR gate — output ON for odd number of ON inputs", smShapeId: "9f0f56e8-2c31-4d83-996c-d00a9b296c3f" },
  nand: { type: "nand", mode: 3, minInputs: 1, maxInputs: 20, description: "NAND gate — output OFF only when ALL inputs are ON", smShapeId: "9f0f56e8-2c31-4d83-996c-d00a9b296c3f" },
  nor:  { type: "nor",  mode: 4, minInputs: 1, maxInputs: 20, description: "NOR gate — output ON only when ALL inputs are OFF", smShapeId: "9f0f56e8-2c31-4d83-996c-d00a9b296c3f" },
  xnor: { type: "xnor", mode: 5, minInputs: 1, maxInputs: 20, description: "XNOR gate — output ON for even number of ON inputs", smShapeId: "9f0f56e8-2c31-4d83-996c-d00a9b296c3f" },
};

/** Get the definition for a gate type. Throws for invalid types. */
export function getGateDefinition(type: LogicGateType): GateDefinition {
  const def = GATE_DEFINITIONS[type];
  if (def === undefined) {
    throw new Error(`Unknown gate type: "${type}"`);
  }
  return def;
}

/** Get the inverse (complement) gate type */
export function getInverseGateType(type: LogicGateType): LogicGateType {
  const inverse: Record<LogicGateType, LogicGateType> = {
    and: "nand",
    nand: "and",
    or: "nor",
    nor: "or",
    xor: "xnor",
    xnor: "xor",
  };
  return inverse[type];
}

// ---------------------------------------------------------------------------
// Core gate evaluation
// ---------------------------------------------------------------------------

/**
 * Evaluate a logic gate given the number of activated inputs and total input count.
 *
 * These formulas are extracted directly from the simulator source code
 * and match Scrap Mechanic's in-game behavior exactly.
 */
export function evaluateGate(
  gateType: LogicGateType,
  inputCount: number,
  activatedCount: number,
): boolean {
  switch (gateType) {
    case "and":
      return inputCount > 0 && activatedCount === inputCount;
    case "or":
      return inputCount > 0 && activatedCount > 0;
    case "xor":
      return activatedCount % 2 === 1;
    case "nand":
      return inputCount > 0 && activatedCount !== inputCount;
    case "nor":
      return inputCount > 0 && activatedCount === 0;
    case "xnor":
      return inputCount > 0 && activatedCount % 2 === 0;
  }
}

/** Detailed result of gate evaluation */
export interface GateEvaluationResult {
  readonly output: boolean;
  readonly activatedInputs: number;
  readonly totalInputs: number;
}

/**
 * Evaluate a gate and return a detailed result with activated/total counts.
 */
export function evaluateGateDetailed(
  gateType: LogicGateType,
  inputCount: number,
  activatedCount: number,
): GateEvaluationResult {
  return {
    output: evaluateGate(gateType, inputCount, activatedCount),
    activatedInputs: activatedCount,
    totalInputs: inputCount,
  };
}

/**
 * Evaluate a gate from a boolean array of input states (previous tick).
 */
export function evaluateGateFromInputs(
  gateType: LogicGateType,
  inputs: readonly boolean[],
): boolean {
  const activatedCount = inputs.filter((v) => v).length;
  return evaluateGate(gateType, inputs.length, activatedCount);
}

/** Evaluate a NOT gate (inverter) using NAND with both inputs tied */
export function evaluateNotGate(input: boolean): boolean {
  return !input;
}

/** Evaluate a NOT gate using a single-input NOR gate */
export function evaluateNorNotGate(input: boolean): boolean {
  return !input;
}

// ---------------------------------------------------------------------------
// Truth table generation
// ---------------------------------------------------------------------------

/** A single row in a gate truth table */
export interface GateTruthTableRow {
  readonly inputs: readonly boolean[];
  readonly output: boolean;
}

/**
 * Generate the complete truth table for a gate with N inputs.
 * Returns rows as `{ inputs: [...], output: boolean }`.
 */
export function generateGateTruthTable(
  gateType: LogicGateType,
  inputCount: number,
): readonly GateTruthTableRow[] {
  if (inputCount < 1 || inputCount > 8) {
    throw new Error(`Input count must be between 1 and 8, got ${inputCount}`);
  }

  const totalRows = 1 << inputCount;
  const table: GateTruthTableRow[] = [];

  for (let row = 0; row < totalRows; row++) {
    const inputs: boolean[] = [];
    let activated = 0;

    // LSB-first: bit 0 = first input (A), bit 1 = second input (B), etc.
    for (let bit = 0; bit < inputCount; bit++) {
      const value = Boolean((row >> bit) & 1);
      inputs.push(value);
      if (value) activated++;
    }

    const output = evaluateGate(gateType, inputCount, activated);
    table.push({ inputs: Object.freeze(inputs), output });
  }

  return Object.freeze(table);
}

/** Generate the complete truth table for a 2-input gate (legacy format) */
export function generateTwoInputTruthTable(
  gateType: LogicGateType,
): ReadonlyArray<readonly [boolean, boolean, boolean]> {
  const inputs: readonly boolean[] = [false, true];
  const table: Array<readonly [boolean, boolean, boolean]> = [];

  for (const a of inputs) {
    for (const b of inputs) {
      const result = evaluateGate(gateType, 2, (a ? 1 : 0) + (b ? 1 : 0));
      table.push([a, b, result]);
    }
  }

  return table;
}

/**
 * Generate truth table for N inputs (returns tuples).
 * For N > 4, this generates 2^N rows which can be very large.
 */
export function generateTruthTable(
  gateType: LogicGateType,
  inputCount: number,
): ReadonlyArray<readonly [readonly boolean[], boolean]> {
  if (inputCount > 20) {
    throw new Error(`Cannot generate truth table for ${inputCount} inputs (max 20)`);
  }

  const totalRows = 1 << inputCount; // 2^N
  const table: Array<readonly [readonly boolean[], boolean]> = [];

  for (let row = 0; row < totalRows; row++) {
    const inputs: boolean[] = [];
    let activated = 0;

    for (let bit = 0; bit < inputCount; bit++) {
      const value = Boolean((row >> (inputCount - 1 - bit)) & 1);
      inputs.push(value);
      if (value) activated++;
    }

    const result = evaluateGate(gateType, inputCount, activated);
    table.push([Object.freeze(inputs), result]);
  }

  return table;
}

/** Pretty-print a truth table as a formatted string */
export function formatGateTruthTable(
  gateType: LogicGateType,
  inputCount: number,
): string {
  const table = generateTruthTable(gateType, inputCount);
  const header = `Truth Table for ${gateType.toUpperCase()} (${inputCount} inputs):`;
  const lines: string[] = [header, "-".repeat(header.length)];

  if (inputCount <= 4) {
    const colNames = Array.from({ length: inputCount }, (_, i) =>
      String.fromCharCode(65 + i),
    );
    lines.push(`${colNames.join(" ")} | Y`);
    lines.push("-".repeat(colNames.join(" ").length + 3));

    for (const [inputs, result] of table) {
      const inputStr = inputs.map((v) => (v ? "1" : "0")).join(" ");
      lines.push(`${inputStr} | ${result ? "1" : "0"}`);
    }
  } else {
    lines.push(`(${table.length} rows — too many to display)`);
  }

  return lines.join("\n");
}

/** Get the gate type name in uppercase */
export function gateTypeName(type: LogicGateType): string {
  return type.toUpperCase();
}

/** Get a description of the gate's behavior */
export function gateDescription(type: LogicGateType): string {
  return getGateDefinition(type).description;
}