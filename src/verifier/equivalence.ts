/**
 * CircuitEquivalenceChecker verifies that two circuits produce the same outputs
 * for the same inputs. Used for validating circuit optimizations or
 * alternative implementations.
 *
 * For combinational circuits, generates truth tables and compares outputs.
 * For sequential circuits, runs simulations and compares settled outputs.
 */

import type { CircuitDefinition } from "../types/circuit.js";
import { SimulationEngine } from "../simulator/engine.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Result of an equivalence check between two circuits */
export interface EquivalenceResult {
  readonly equivalent: boolean;
  readonly reason: string;
  readonly totalTested: number;
  readonly mismatches: number;
  readonly sharedInputs: readonly string[];
  readonly sharedOutputs: readonly string[];
  readonly warnings: readonly string[];
  readonly mismatchDetails: readonly EquivalenceMismatchDetail[];
}

/** Detail of a single output mismatch */
export interface EquivalenceMismatchDetail {
  readonly inputCombination: number;
  readonly output: string;
  readonly valueA: boolean;
  readonly valueB: boolean;
}

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

/** Maximum number of inputs for exhaustive equivalence testing */
const MAX_INPUTS_FOR_EXHAUSTIVE = 8;

/** Maximum number of ticks to run for sequential circuit stabilization */
const SEQUENTIAL_STABILIZATION_TICKS = 50;

// ---------------------------------------------------------------------------
// Helper functions
// ---------------------------------------------------------------------------

/**
 * Check if a circuit is sequential (has timers or feedback).
 */
function isSequentialCircuit(circuit: CircuitDefinition): boolean {
  if (circuit.gates.some((g) => g.type === "timer")) return true;
  if (
    circuit.feedback !== undefined &&
    Object.keys(circuit.feedback).length > 0
  )
    return true;
  return false;
}

/**
 * Convert a combination index to a Map of input values.
 */
function combinationToInputs(
  inputNames: readonly string[],
  combination: number,
): Map<string, boolean> {
  const inputs = new Map<string, boolean>();
  for (let bit = 0; bit < inputNames.length; bit++) {
    const value = Boolean((combination >> bit) & 1);
    inputs.set(inputNames[bit]!, value);
  }
  return inputs;
}

// ---------------------------------------------------------------------------
// CircuitEquivalenceChecker class
// ---------------------------------------------------------------------------

/**
 * CircuitEquivalenceChecker verifies that two circuits produce the same outputs
 * for the same inputs.
 *
 * Usage:
 * ```typescript
 * const checker = new CircuitEquivalenceChecker();
 * const result = checker.check(circuitA, circuitB);
 * if (result.equivalent) {
 *   console.log("Circuits are equivalent!");
 * }
 * ```
 */
export class CircuitEquivalenceChecker {
  /**
   * Check if two circuits are functionally equivalent.
   *
   * The check:
   * 1. Verifies I/O compatibility (shared input/output names)
   * 2. For combinational circuits: enumerates all input combinations
   * 3. For sequential circuits: runs simulation until stable for each combo
   * 4. Compares outputs and reports any mismatches
   *
   * @param circuitA - First circuit to compare
   * @param circuitB - Second circuit to compare
   */
  check(
    circuitA: CircuitDefinition,
    circuitB: CircuitDefinition,
  ): EquivalenceResult {
    const warnings: string[] = [];

    // Determine shared inputs and outputs
    const sharedInputs = circuitA.inputs.filter((i) =>
      circuitB.inputs.includes(i),
    );
    const sharedOutputs = circuitA.outputs.filter((o) =>
      circuitB.outputs.includes(o),
    );

    // Validate compatibility
    if (sharedInputs.length === 0) {
      return {
        equivalent: false,
        reason: "No shared inputs between circuits",
        totalTested: 0,
        mismatches: 0,
        sharedInputs: [],
        sharedOutputs,
        warnings,
        mismatchDetails: [],
      };
    }

    if (sharedOutputs.length === 0) {
      return {
        equivalent: false,
        reason: "No shared outputs between circuits",
        totalTested: 0,
        mismatches: 0,
        sharedInputs,
        sharedOutputs: [],
        warnings,
        mismatchDetails: [],
      };
    }

    // Check for input/output differences
    const onlyInA = circuitA.inputs.filter((i) => !circuitB.inputs.includes(i));
    const onlyInB = circuitB.inputs.filter((i) => !circuitA.inputs.includes(i));
    const outputsOnlyInA = circuitA.outputs.filter(
      (o) => !circuitB.outputs.includes(o),
    );
    const outputsOnlyInB = circuitB.outputs.filter(
      (o) => !circuitA.outputs.includes(o),
    );

    if (onlyInA.length > 0) {
      warnings.push(`Inputs only in circuit A: ${onlyInA.join(", ")}`);
    }
    if (onlyInB.length > 0) {
      warnings.push(`Inputs only in circuit B: ${onlyInB.join(", ")}`);
    }
    if (outputsOnlyInA.length > 0) {
      warnings.push(
        `Outputs only in circuit A: ${outputsOnlyInA.join(", ")}`,
      );
    }
    if (outputsOnlyInB.length > 0) {
      warnings.push(
        `Outputs only in circuit B: ${outputsOnlyInB.join(", ")}`,
      );
    }

    // Check if exhaustive testing is feasible
    if (sharedInputs.length > MAX_INPUTS_FOR_EXHAUSTIVE) {
      return {
        equivalent: false,
        reason: `Too many shared inputs (${sharedInputs.length}) for exhaustive testing (max ${MAX_INPUTS_FOR_EXHAUSTIVE})`,
        totalTested: 0,
        mismatches: 0,
        sharedInputs,
        sharedOutputs,
        warnings: [
          ...warnings,
          "Cannot exhaustively test; consider reducing input count",
        ],
        mismatchDetails: [],
      };
    }

    // Warn about sequential circuits
    const isSequentialA = isSequentialCircuit(circuitA);
    const isSequentialB = isSequentialCircuit(circuitB);
    if (isSequentialA || isSequentialB) {
      warnings.push(
        "One or both circuits are sequential; equivalence is checked from reset state only",
      );
    }

    // Compute max ticks for stabilization
    const maxTicks = isSequentialA || isSequentialB
      ? SEQUENTIAL_STABILIZATION_TICKS
      : Math.max(circuitA.gates.length, circuitB.gates.length) + 5;

    // Run exhaustive comparison
    const totalCombinations = 1 << sharedInputs.length;
    let mismatchCount = 0;
    const mismatchDetails: EquivalenceMismatchDetail[] = [];

    // Create reusable engines for efficiency
    const engineA = new SimulationEngine(circuitA);
    const engineB = new SimulationEngine(circuitB);

    for (let i = 0; i < totalCombinations; i++) {
      const sharedInputsMap = combinationToInputs(sharedInputs, i);

      // Build full input maps for each circuit (shared + non-shared inputs = false)
      const inputsA = new Map<string, boolean>();
      const inputsB = new Map<string, boolean>();

      for (const inp of circuitA.inputs) {
        inputsA.set(
          inp,
          sharedInputsMap.get(inp) ?? false,
        );
      }
      for (const inp of circuitB.inputs) {
        inputsB.set(
          inp,
          sharedInputsMap.get(inp) ?? false,
        );
      }

      // Reset and run both engines
      engineA.reset();
      engineB.reset();
      engineA.setInputs(inputsA);
      engineB.setInputs(inputsB);

      if (isSequentialA || isSequentialB) {
        engineA.runUntilStable(maxTicks);
        engineB.runUntilStable(maxTicks);
      } else {
        engineA.tickN(maxTicks);
        engineB.tickN(maxTicks);
      }

      const outA = engineA.getOutputs();
      const outB = engineB.getOutputs();

      // Compare shared outputs
      for (const output of sharedOutputs) {
        const valA = outA.get(output) ?? false;
        const valB = outB.get(output) ?? false;

        if (valA !== valB) {
          mismatchCount++;
          mismatchDetails.push({
            inputCombination: i,
            output,
            valueA: valA,
            valueB: valB,
          });
        }
      }
    }

    return {
      equivalent: mismatchCount === 0,
      reason:
        mismatchCount === 0
          ? "Circuits are functionally equivalent"
          : `Found ${mismatchCount} output mismatch(es)`,
      totalTested: totalCombinations,
      mismatches: mismatchCount,
      sharedInputs,
      sharedOutputs,
      warnings,
      mismatchDetails,
    };
  }
}

// ---------------------------------------------------------------------------
// Standalone convenience function (for CLI and test compatibility)
// ---------------------------------------------------------------------------

/**
 * Check if two circuits are functionally equivalent.
 * Convenience wrapper around CircuitEquivalenceChecker.
 *
 * @param circuitA - First circuit
 * @param circuitB - Second circuit
 */
export function checkEquivalence(
  circuitA: CircuitDefinition,
  circuitB: CircuitDefinition,
): EquivalenceResult {
  const checker = new CircuitEquivalenceChecker();
  return checker.check(circuitA, circuitB);
}
