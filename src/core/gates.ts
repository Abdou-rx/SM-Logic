/**
 * Gate evaluation functions and truth tables.
 *
 * All evaluation functions faithfully model Scrap Mechanic's logic gate
 * behavior as extracted from SteveBenz/ScrapMechanicLogicGateSimulator Model.ts.
 *
 * Key insight: gates read from the PREVIOUS state of their inputs (prevState),
 * creating a 1-tick propagation delay per gate level.
 */

import type { LogicGateType } from "../types/gate.js";

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

/** Generate the complete truth table for a 2-input gate */
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
 * Generate truth table for N inputs.
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
export function formatTruthTable(
  gateType: LogicGateType,
  inputCount: number,
): string {
  const table = generateTruthTable(gateType, inputCount);
  const header = `Truth Table for ${gateType.toUpperCase()} (${inputCount} inputs):`;
  const lines: string[] = [header, "-".repeat(header.length)];

  if (inputCount <= 4) {
    // Print header row
    const colNames = Array.from({ length: inputCount }, (_, i) =>
      String.fromCharCode(65 + i), // A, B, C, D
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
  switch (type) {
    case "and":
      return "Output ON only when ALL inputs are ON";
    case "or":
      return "Output ON when ANY input is ON";
    case "xor":
      return "Output ON when an ODD number of inputs are ON (parity)";
    case "nand":
      return "Output ON unless ALL inputs are ON (inverted AND)";
    case "nor":
      return "Output ON only when ALL inputs are OFF (inverted OR)";
    case "xnor":
      return "Output ON when an EVEN number of inputs are ON (inverted parity)";
  }
}
