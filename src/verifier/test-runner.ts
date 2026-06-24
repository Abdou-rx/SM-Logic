/**
 * TestRunner runs test vectors against a circuit simulation.
 *
 * Each test vector specifies input values and expected output values.
 * The runner creates a fresh simulation engine for each test, sets inputs,
 * runs until stable, and checks outputs against expectations.
 */

import type { CircuitDefinition } from "../types/circuit.js";
import { SimulationEngine } from "../simulator/engine.js";

// ---------------------------------------------------------------------------
// Test vector types
// ---------------------------------------------------------------------------

/**
 * A single test vector with Map-based inputs and outputs (primary API).
 * Used by programmatic test creation and the runVector/runAll methods.
 */
export interface TestVector {
  readonly name?: string;
  readonly inputs: ReadonlyMap<string, boolean>;
  readonly expectedOutputs: ReadonlyMap<string, boolean>;
  readonly ticksToStabilize?: number;
}

/**
 * A single test vector with Record-based inputs and outputs.
 * Used by the task-specified run() method for JSON-based test inputs.
 */
export interface TestVectorRecord {
  readonly name?: string;
  readonly inputs: Readonly<Record<string, boolean>>;
  readonly expected: Readonly<Record<string, boolean>>;
  readonly ticksToStabilize?: number;
}

/** Result of running a single test vector */
export interface TestResult {
  readonly name: string;
  readonly passed: boolean;
  readonly inputs: ReadonlyMap<string, boolean>;
  readonly expectedOutputs: ReadonlyMap<string, boolean>;
  readonly actualOutputs: ReadonlyMap<string, boolean>;
  readonly mismatches: readonly TestMismatch[];
  readonly ticksRun: number;
}

/** Detail of a single output mismatch */
export interface TestMismatch {
  readonly signal: string;
  readonly expected: boolean;
  readonly actual: boolean;
}

/** Aggregate result of running all test vectors */
export interface TestRunResult {
  readonly total: number;
  readonly passed: number;
  readonly failed: number;
  readonly results: readonly TestResult[];
  readonly success: boolean;
}

// ---------------------------------------------------------------------------
// JSON test vector types (for file-based test data)
// ---------------------------------------------------------------------------

/** A test vector in JSON file format */
export interface TestVectorJson {
  readonly name?: string;
  readonly inputs: Readonly<Record<string, number>>;
  readonly expectedOutputs: Readonly<Record<string, number>>;
  readonly ticksToStabilize?: number;
}

/** Container for test vectors in a JSON file */
export interface TestVectorJsonData {
  readonly vectors: readonly TestVectorJson[];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Maximum number of ticks to run for combinational stabilization */
const MAX_COMBINATION_TICKS = 100;

/**
 * Parse test vectors from JSON format.
 * Converts numeric 0/1 values to boolean.
 */
export function parseTestVectorsFromJson(
  data: TestVectorJsonData,
): TestVector[] {
  return data.vectors.map((v, idx) => ({
    name: v.name ?? `vector_${idx}`,
    inputs: new Map(
      Object.entries(v.inputs).map(([k, val]) => [k, val !== 0]),
    ),
    expectedOutputs: new Map(
      Object.entries(v.expectedOutputs).map(([k, val]) => [k, val !== 0]),
    ),
    ticksToStabilize: v.ticksToStabilize,
  }));
}

/**
 * Convert a TestVectorRecord (Record-based) to a TestVector (Map-based).
 */
function toTestVector(record: TestVectorRecord): TestVector {
  return {
    name: record.name,
    inputs: new Map(Object.entries(record.inputs)),
    expectedOutputs: new Map(Object.entries(record.expected)),
    ticksToStabilize: record.ticksToStabilize,
  };
}

// ---------------------------------------------------------------------------
// TestRunner
// ---------------------------------------------------------------------------

/**
 * TestRunner runs test vectors against a circuit simulation.
 *
 * Usage:
 * ```typescript
 * const runner = new TestRunner(circuit);
 * const result = runner.runAll(vectors);
 * console.log(`${result.passed}/${result.total} tests passed`);
 * ```
 */
export class TestRunner {
  private readonly circuit: CircuitDefinition;

  constructor(circuit: CircuitDefinition) {
    this.circuit = circuit;
  }

  /**
   * Run a single test vector against the circuit.
   * Creates a fresh engine, sets inputs, runs until stable, checks outputs.
   */
  runVector(vector: TestVector): TestResult {
    const maxTicks =
      vector.ticksToStabilize ??
      Math.min(this.circuit.gates.length + 5, MAX_COMBINATION_TICKS);

    const engine = new SimulationEngine(this.circuit);
    engine.setInputs(vector.inputs);

    const results = engine.runUntilStable(maxTicks);
    const actualOutputs = engine.getOutputs();

    // Check each expected output
    const mismatches: TestMismatch[] = [];
    for (const [signal, expected] of vector.expectedOutputs) {
      const actual = actualOutputs.get(signal);
      if (actual !== expected) {
        mismatches.push({
          signal,
          expected,
          actual: actual ?? false,
        });
      }
    }

    return {
      name: vector.name ?? "unnamed",
      passed: mismatches.length === 0,
      inputs: vector.inputs,
      expectedOutputs: vector.expectedOutputs,
      actualOutputs,
      mismatches,
      ticksRun: results.length,
    };
  }

  /**
   * Run multiple test vectors and return aggregate results.
   */
  runAll(vectors: readonly TestVector[]): TestRunResult {
    const results: TestResult[] = [];

    for (const vector of vectors) {
      results.push(this.runVector(vector));
    }

    const passed = results.filter((r) => r.passed).length;
    const failed = results.length - passed;

    return {
      total: results.length,
      passed,
      failed,
      results,
      success: failed === 0,
    };
  }

  /**
   * Run test vectors from JSON file format.
   *
   * @param data - Parsed JSON test vector data
   */
  runFromJson(data: TestVectorJsonData): TestRunResult {
    const vectors = parseTestVectorsFromJson(data);
    return this.runAll(vectors);
  }

  /**
   * Run test vectors specified as Record-based test vector records.
   * This is the primary API specified by the task.
   *
   * @param circuit - Circuit to test against
   * @param vectors - Array of test vectors with Record-based I/O
   */
  run(vectors: readonly TestVectorRecord[]): TestResult[] {
    const testVectors = vectors.map(toTestVector);
    const aggregate = this.runAll(testVectors);
    return [...aggregate.results];
  }
}
