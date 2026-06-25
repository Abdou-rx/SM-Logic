/**
 * TruthTableGenerator generates complete truth tables for circuit verification.
 *
 * For circuits with ≤6 inputs, it exhaustively tests all 2^N input combinations.
 * For circuits with >6 inputs, it warns and provides a sampled generation mode.
 * Sequential circuits (timers/feedback) are handled by running each combination
 * through the simulation until stable.
 */

import type { CircuitDefinition } from "../types/circuit.js";
import { SimulationEngine } from "../simulator/engine.js";

// ---------------------------------------------------------------------------
// Truth table types
// ---------------------------------------------------------------------------

/** A single row in a truth table */
export interface TruthTableRow {
  readonly inputs: ReadonlyMap<string, boolean>;
  readonly outputs: ReadonlyMap<string, boolean>;
}

/** Complete truth table for a circuit */
export interface TruthTable {
  readonly inputNames: readonly string[];
  readonly outputNames: readonly string[];
  readonly rows: readonly TruthTableRow[];
}

/** Result of truth table generation (alias for TruthTable) */
export type TruthTableResult = TruthTable;

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

/** Maximum number of inputs for full truth table enumeration (2^6 = 64 rows) */
const MAX_INPUTS_FULL = 6;

/** Number of inputs above which a size warning is shown */
const MAX_INPUTS_WARN = 4;

/** Default number of random samples for large circuits */
const DEFAULT_SAMPLE_COUNT = 256;

/** Extra ticks to run beyond circuit depth for sequential stabilization */
const SEQUENTIAL_EXTRA_TICKS = 10;

// ---------------------------------------------------------------------------
// TruthTableGenerator
// ---------------------------------------------------------------------------

/**
 * TruthTableGenerator generates truth tables for circuit verification.
 *
 * Usage:
 * ```typescript
 * const gen = new TruthTableGenerator(circuit);
 * if (gen.canGenerateFull()) {
 *   const table = gen.generate();
 *   // Use table.rows for verification
 * } else {
 *   const sampled = gen.generateSampled();
 * }
 * ```
 */
export class TruthTableGenerator {
  private readonly circuit: CircuitDefinition;

  constructor(circuit: CircuitDefinition) {
    this.circuit = circuit;
  }

  /**
   * Check if full exhaustive truth table generation is feasible.
   * Returns true when the circuit has ≤6 inputs (max 64 combinations).
   */
  canGenerateFull(): boolean {
    return this.circuit.inputs.length <= MAX_INPUTS_FULL;
  }

  /**
   * Check if a size warning should be shown (>4 inputs).
   */
  shouldWarnSize(): boolean {
    return this.circuit.inputs.length > MAX_INPUTS_WARN;
  }

  /**
   * Get the number of rows in a full truth table (2^N).
   */
  getRowCount(): number {
    return 1 << this.circuit.inputs.length;
  }

  /**
   * Check if the circuit is sequential (has timers or feedback loops).
   * Detects both explicit feedback (circuit.feedback field) and implicit
   * feedback cycles in the gate dependency graph.
   */
  isSequential(): boolean {
    if (this.circuit.gates.some((g) => g.type === "timer")) return true;
    if (
      this.circuit.feedback !== undefined &&
      Object.keys(this.circuit.feedback).length > 0
    )
      return true;

    // Detect implicit feedback: build gate dependency graph and check for cycles
    const outputToGateId = new Map<string, string>();
    for (const gate of this.circuit.gates) {
      outputToGateId.set(gate.output, gate.id);
    }

    // adjacency: gateId → set of gateIds it depends on (sources)
    const deps = new Map<string, Set<string>>();
    for (const gate of this.circuit.gates) {
      const gateDeps = new Set<string>();
      for (const inputSig of gate.inputs) {
        const srcId = outputToGateId.get(inputSig);
        if (srcId !== undefined && srcId !== gate.id) {
          gateDeps.add(srcId);
        }
      }
      deps.set(gate.id, gateDeps);
    }

    // Recursive DFS cycle detection
    const WHITE = 0;
    const GRAY = 1;
    const BLACK = 2;
    const color = new Map<string, number>();
    for (const gate of this.circuit.gates) {
      color.set(gate.id, WHITE);
    }

    const detectCycle = (node: string): boolean => {
      color.set(node, GRAY);
      for (const depId of deps.get(node) ?? []) {
        const depColor = color.get(depId) ?? WHITE;
        if (depColor === GRAY) return true;
        if (depColor === WHITE && detectCycle(depId)) return true;
      }
      color.set(node, BLACK);
      return false;
    };

    for (const gate of this.circuit.gates) {
      if ((color.get(gate.id) ?? WHITE) === WHITE) {
        if (detectCycle(gate.id)) return true;
      }
    }

    return false;
  }

  /**
   * Generate the complete truth table by simulating all input combinations.
   * Runs simulation until stable for each combination.
   *
   * For combinational circuits, each combination needs ~circuit-depth ticks.
   * For sequential circuits, runs extra ticks to allow state to settle.
   *
   * @throws {Error} if full enumeration is not feasible (>6 inputs)
   */
  generate(): TruthTable {
    if (!this.canGenerateFull()) {
      const count = this.circuit.inputs.length;
      throw new Error(
        `Circuit has ${count} inputs (${1 << count} combinations). ` +
          `Maximum supported for full truth table is ${MAX_INPUTS_FULL} inputs. ` +
          `Use generateSampled() for large circuits.`,
      );
    }

    const warnings: string[] = [];
    if (this.isSequential()) {
      warnings.push(
        "Circuit is sequential (timers/feedback). Truth table shows reset-state behavior only.",
      );
    }

    const inputNames = this.circuit.inputs;
    const outputNames = this.circuit.outputs;
    const totalCombinations = 1 << inputNames.length;
    const rows: TruthTableRow[] = [];

    const maxTicks = this.computeMaxTicks();

    for (let i = 0; i < totalCombinations; i++) {
      const inputs = new Map<string, boolean>();
      const inputValues: boolean[] = [];

      for (let bit = 0; bit < inputNames.length; bit++) {
        // LSB-first enumeration: bit 0 corresponds to first input
        const value = Boolean((i >> bit) & 1);
        inputs.set(inputNames[bit]!, value);
        inputValues.push(value);
      }

      const outputs = this.simulateCombination(inputs, maxTicks);

      const inputMap = new Map<string, boolean>();
      for (let j = 0; j < inputNames.length; j++) {
        inputMap.set(inputNames[j]!, inputValues[j]!);
      }

      const outputMap = new Map<string, boolean>();
      for (const name of outputNames) {
        outputMap.set(name, outputs.get(name) ?? false);
      }

      rows.push({
        inputs: inputMap,
        outputs: outputMap,
      });
    }

    return {
      inputNames,
      outputNames,
      rows,
    };
  }

  /**
   * Generate a sampled truth table for circuits with many inputs.
   * Always includes corner cases: all-zeros, all-ones, and single-input-high.
   *
   * @param sampleCount - Maximum number of test cases (default: 256)
   */
  generateSampled(sampleCount?: number): TruthTable {
    const inputNames = this.circuit.inputs;
    const outputNames = this.circuit.outputs;
    const totalCombinations = 1 << inputNames.length;
    const maxSamples = sampleCount ?? DEFAULT_SAMPLE_COUNT;
    const rows: TruthTableRow[] = [];

    const maxTicks = this.computeMaxTicks();

    // Build test case set with guaranteed corner cases
    const testCases = new Set<number>();
    testCases.add(0); // all zeros
    testCases.add(totalCombinations - 1); // all ones

    // Each input individually HIGH
    for (let i = 0; i < inputNames.length; i++) {
      testCases.add(1 << i);
    }

    // Add random samples until we reach the desired count
    let attempts = 0;
    while (testCases.size < maxSamples && attempts < maxSamples * 10) {
      const idx = Math.floor(Math.random() * totalCombinations);
      testCases.add(idx);
      attempts++;
    }

    // Sort test cases numerically
    const sortedCases = [...testCases].sort((a, b) => a - b);

    for (const i of sortedCases) {
      const inputs = new Map<string, boolean>();
      for (let bit = 0; bit < inputNames.length; bit++) {
        inputs.set(inputNames[bit]!, Boolean((i >> bit) & 1));
      }

      const outputs = this.simulateCombination(inputs, maxTicks);

      const inputMap = new Map<string, boolean>();
      for (const name of inputNames) {
        inputMap.set(name, inputs.get(name) ?? false);
      }

      const outputMap = new Map<string, boolean>();
      for (const name of outputNames) {
        outputMap.set(name, outputs.get(name) ?? false);
      }

      rows.push({
        inputs: inputMap,
        outputs: outputMap,
      });
    }

    return {
      inputNames,
      outputNames,
      rows,
    };
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  /**
   * Compute the maximum number of ticks to run for stabilization.
   * Sequential circuits need more ticks to settle.
   */
  private computeMaxTicks(): number {
    const baseTicks = this.circuit.gates.length + 5;
    if (this.isSequential()) {
      return baseTicks + SEQUENTIAL_EXTRA_TICKS;
    }
    return baseTicks;
  }

  /**
   * Simulate a single input combination until stable.
   * Creates a fresh engine for each combination to avoid cross-contamination.
   */
  private simulateCombination(
    inputs: ReadonlyMap<string, boolean>,
    maxTicks: number,
  ): ReadonlyMap<string, boolean> {
    const engine = new SimulationEngine(this.circuit);
    engine.setInputs(inputs);

    if (this.isSequential()) {
      engine.runUntilStable(maxTicks);
    } else {
      engine.tickN(maxTicks);
    }

    return engine.getOutputs();
  }
}

// ---------------------------------------------------------------------------
// Formatting utilities
// ---------------------------------------------------------------------------

/**
 * Format a truth table as a readable string for console display.
 */
export function formatTruthTable(table: TruthTable): string {
  const lines: string[] = [];

  // Header row
  const inputHeader = table.inputNames.join(" | ");
  const outputHeader = table.outputNames.join(" | ");
  const separator = "\u2500".repeat(
    inputHeader.length + 3 + outputHeader.length + 3,
  );

  lines.push(`${inputHeader} \u2502 ${outputHeader}`);
  lines.push(separator);

  // Data rows
  for (const row of table.rows) {
    const inputValues = table.inputNames.map(
      (name) => (row.inputs.get(name) ? "1" : "0"),
    );
    const outputValues = table.outputNames.map(
      (name) => (row.outputs.get(name) ? "1" : "0"),
    );
    lines.push(
      `${inputValues.join(" | ")} \u2502 ${outputValues.join(" | ")}`,
    );
  }

  return lines.join("\n");
}
