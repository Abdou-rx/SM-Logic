/**
 * VerificationReporter formats verification results as human-readable reports.
 *
 * Provides both a class-based API (VerificationReporter) and standalone
 * formatting functions for convenience.
 */

import type { TruthTable } from "./truth-table-gen.js";
import type {
  TestRunResult,
  TestResult,
} from "./test-runner.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Statistics for a verification summary */
export interface VerificationStats {
  readonly total: number;
  readonly passed: number;
  readonly failed: number;
  readonly warnings: readonly string[];
}

// ---------------------------------------------------------------------------
// Formatting helpers
// ---------------------------------------------------------------------------

/**
 * Format a Map<string, boolean> as a compact string like "{A=1, B=0}".
 */
function formatMap(m: ReadonlyMap<string, boolean>): string {
  const entries: string[] = [];
  for (const [key, value] of m) {
    entries.push(`${key}=${value ? "1" : "0"}`);
  }
  return `{${entries.join(", ")}}`;
}

/**
 * Compute the column width needed for a signal name.
 */
function columnWidth(name: string): number {
  return Math.max(name.length, 3);
}

// ---------------------------------------------------------------------------
// Standalone formatting functions (for CLI compatibility)
// ---------------------------------------------------------------------------

/**
 * Format a test run result as a human-readable report.
 */
export function formatTestReport(result: TestRunResult): string {
  return new VerificationReporter().formatTestResults(
    [...result.results],
  );
}

/**
 * Format a truth table with a circuit name header.
 */
export function formatTruthTableReport(
  table: TruthTable,
  circuitName: string,
): string {
  return new VerificationReporter().formatTruthTable(table, circuitName);
}

/**
 * Format an equivalence result as a human-readable report.
 */
export function formatEquivalenceReport(result: EquivalenceReportData): string {
  return new VerificationReporter().formatEquivalence(result);
}

// ---------------------------------------------------------------------------
// Equivalence report data type (to avoid circular dependency)
// ---------------------------------------------------------------------------

/** Data needed for equivalence report formatting */
export interface EquivalenceReportData {
  readonly equivalent: boolean;
  readonly reason: string;
  readonly totalTested: number;
  readonly mismatches: number;
  readonly sharedInputs: readonly string[];
  readonly sharedOutputs: readonly string[];
  readonly mismatchDetails?: readonly EquivalenceMismatchReport[];
}

/** Mismatch detail for equivalence report */
export interface EquivalenceMismatchReport {
  readonly inputCombination: number;
  readonly output: string;
  readonly valueA: boolean;
  readonly valueB: boolean;
}

// ---------------------------------------------------------------------------
// VerificationReporter class
// ---------------------------------------------------------------------------

/**
 * VerificationReporter formats verification results as human-readable strings.
 *
 * Usage:
 * ```typescript
 * const reporter = new VerificationReporter();
 * console.log(reporter.formatTruthTable(table, 'Half Adder'));
 * console.log(reporter.formatTestResults(results));
 * console.log(reporter.formatSummary({ total: 4, passed: 4, failed: 0, warnings: [] }));
 * ```
 */
export class VerificationReporter {
  /**
   * Pretty-print a truth table.
   *
   * @param table - The truth table to format
   * @param circuitName - Optional circuit name for the header
   */
  formatTruthTable(table: TruthTable, circuitName?: string): string {
    const lines: string[] = [];

    // Header
    if (circuitName !== undefined) {
      lines.push("=".repeat(60));
      lines.push(`  TRUTH TABLE: ${circuitName}`);
      lines.push("=".repeat(60));
      lines.push("");
    }

    lines.push(`  Inputs:  ${table.inputNames.join(", ")}`);
    lines.push(`  Outputs: ${table.outputNames.join(", ")}`);
    lines.push(`  Rows:    ${table.rows.length}`);
    lines.push("");

    // Column layout
    const inputCols = table.inputNames.map((n) => columnWidth(n));
    const outputCols = table.outputNames.map((n) => columnWidth(n));

    const inputSection = table.inputNames
      .map((n, i) => n.padEnd(inputCols[i]!))
      .join(" ");
    const outputSection = table.outputNames
      .map((n, i) => n.padEnd(outputCols[i]!))
      .join(" ");

    lines.push(`  ${inputSection}  |  ${outputSection}`);
    lines.push(
      `  ${"-".repeat(inputSection.length)}  |  ${"-".repeat(outputSection.length)}`,
    );

    // Data rows
    for (const row of table.rows) {
      const inputVals = table.inputNames
        .map((n, i) => (row.inputs.get(n) ? " 1" : " 0").padEnd(inputCols[i]!))
        .join(" ");
      const outputVals = table.outputNames
        .map((n, i) => (row.outputs.get(n) ? " 1" : " 0").padEnd(outputCols[i]!))
        .join(" ");
      lines.push(`  ${inputVals}  |  ${outputVals}`);
    }

    if (circuitName !== undefined) {
      lines.push("");
      lines.push("=".repeat(60));
    }

    return lines.join("\n");
  }

  /**
   * Format test results with pass/fail status and mismatch details.
   *
   * @param results - Array of individual test results
   */
  formatTestResults(results: readonly TestResult[]): string {
    const lines: string[] = [];
    const passed = results.filter((r) => r.passed).length;
    const failed = results.length - passed;

    lines.push("=".repeat(60));
    lines.push("  VERIFICATION REPORT");
    lines.push("=".repeat(60));
    lines.push("");

    const statusText =
      failed === 0 ? "ALL TESTS PASSED" : `${failed} TEST(S) FAILED`;
    lines.push(`  Status: ${statusText}`);
    lines.push("");
    lines.push(`  Total:  ${results.length}`);
    lines.push(`  Passed: ${passed}`);
    lines.push(`  Failed: ${failed}`);
    lines.push("");

    // Show failures in detail
    if (failed > 0) {
      lines.push("-".repeat(60));
      lines.push("  FAILURES:");
      lines.push("-".repeat(60));

      for (const r of results) {
        if (!r.passed) {
          lines.push("");
          lines.push(`  [FAIL] ${r.name}`);
          lines.push(`    Inputs:     ${formatMap(r.inputs)}`);
          lines.push(
            `    Expected:   ${formatMap(r.expectedOutputs)}`,
          );
          lines.push(`    Actual:     ${formatMap(r.actualOutputs)}`);
          lines.push(
            `    Mismatches: ${r.mismatches
              .map(
                (m) =>
                  `${m.signal} (expected=${m.expected ? "1" : "0"}, got=${m.actual ? "1" : "0"})`,
              )
              .join(", ")}`,
          );
        }
      }
      lines.push("");
    }

    // Show all passed tests in compact form
    if (passed > 0 && failed === 0) {
      lines.push("-".repeat(60));
      for (const r of results) {
        lines.push(`  [PASS] ${r.name} (${r.ticksRun} ticks)`);
      }
      lines.push("");
    }

    lines.push("=".repeat(60));
    return lines.join("\n");
  }

  /**
   * Format a verification summary.
   *
   * @param stats - Aggregated verification statistics
   */
  formatSummary(stats: VerificationStats): string {
    const lines: string[] = [];

    lines.push("=".repeat(60));
    lines.push("  VERIFICATION SUMMARY");
    lines.push("=".repeat(60));
    lines.push("");

    const success = stats.failed === 0;
    lines.push(
      `  Result: ${success ? "PASS" : "FAIL"} (${stats.passed}/${stats.total} passed)`,
    );
    lines.push("");

    if (stats.warnings.length > 0) {
      lines.push("  Warnings:");
      for (const warning of stats.warnings) {
        lines.push(`    - ${warning}`);
      }
      lines.push("");
    }

    lines.push("=".repeat(60));
    return lines.join("\n");
  }

  /**
   * Format an equivalence check result.
   *
   * @param result - Equivalence check result data
   */
  formatEquivalence(result: EquivalenceReportData): string {
    const lines: string[] = [];

    lines.push("=".repeat(60));
    lines.push("  EQUIVALENCE CHECK REPORT");
    lines.push("=".repeat(60));
    lines.push("");

    const statusText = result.equivalent
      ? "EQUIVALENT"
      : "NOT EQUIVALENT";
    lines.push(`  Result:  ${statusText}`);
    lines.push(`  Reason:  ${result.reason}`);
    lines.push("");
    lines.push(`  Combinations tested: ${result.totalTested}`);
    lines.push(`  Mismatches found:   ${result.mismatches}`);
    lines.push("");

    lines.push(`  Shared inputs:  ${result.sharedInputs.join(", ") || "(none)"}`);
    lines.push(
      `  Shared outputs: ${result.sharedOutputs.join(", ") || "(none)"}`,
    );

    // Show mismatch details if any
    if (
      result.mismatchDetails !== undefined &&
      result.mismatchDetails.length > 0
    ) {
      lines.push("");
      lines.push("-".repeat(60));
      lines.push("  MISMATCH DETAILS:");
      lines.push("-".repeat(60));
      for (const m of result.mismatchDetails) {
        lines.push(
          `  Input #${m.inputCombination.toString().padStart(4)}: ${m.output} -> A=${m.valueA ? "1" : "0"} B=${m.valueB ? "1" : "0"}`,
        );
      }
      lines.push("");
    }

    lines.push("=".repeat(60));
    return lines.join("\n");
  }
}
