/**
 * sm-logic verify — Circuit verification with truth tables and test vectors.
 */
import { Command } from "commander";
import fs from "node:fs/promises";
import path from "node:path";
import { CircuitJsonParser } from "../../parser/circuit-json.js";
import { TruthTableGenerator } from "../../verifier/truth-table-gen.js";
import { TestRunner } from "../../verifier/test-runner.js";
import { formatTruthTableReport, formatTestReport } from "../../verifier/reporter.js";
import { success, warn, error, header, kv, info } from "../utils/output.js";

interface VerifyOptions {
  testVectors?: string;
  truthTable?: boolean;
  output?: string;
}

export function createVerifyCommand(): Command {
  return new Command("verify")
    .description("Verify circuit correctness with truth tables and test vectors")
    .argument("<file>", "Circuit file (.sm-circuit.json)")
    .option("--test-vectors <file>", "Test vectors JSON file")
    .option("--truth-table", "Generate and display truth table")
    .option("-o, --output <file>", "Save report to file")
    .action(async (filePath: string, options: VerifyOptions) => {
      await runVerify(filePath, options);
    });
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function runVerify(filePath: string, options: VerifyOptions): Promise<void> {
  const absPath = path.resolve(filePath);

  if (!(await fileExists(absPath))) {
    error(`File not found: ${absPath}`);
    process.exit(1);
  }

  header("Circuit Verification");
  kv("File", absPath);

  let circuit;
  try {
    const parser = new CircuitJsonParser();
    circuit = await parser.parseFile(absPath);
    kv("Circuit", circuit.name);
    kv("Inputs", circuit.inputs.length);
    kv("Outputs", circuit.outputs.length);
    kv("Gates", circuit.gates.length);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    error(`Failed to load circuit: ${msg}`);
    process.exit(1);
  }

  const reportLines: string[] = [];

  // Truth table generation
  if (options.truthTable || !options.testVectors) {
    const ttGen = new TruthTableGenerator(circuit);
    if (ttGen.isSequential()) {
      warn(
        "Circuit has feedback loops (sequential). Truth table shows cold-start behavior only — sequential state is not captured.",
      );
    }
    info("Generating truth table...");

    if (ttGen.canGenerateFull()) {
      if (ttGen.shouldWarnSize()) {
        warn(
          `Circuit has ${circuit.inputs.length} inputs — truth table will have ${1 << circuit.inputs.length} rows`,
        );
      }
      const table = ttGen.generate();
      const formatted = formatTruthTableReport(table, circuit.name);
      console.log(formatted);
      reportLines.push(formatted);
    } else {
      warn(
        `Circuit has ${circuit.inputs.length} inputs — too many for full truth table (>6). Using sampled verification.`,
      );
      const table = ttGen.generateSampled(32);
      const formatted = formatTruthTableReport(table, circuit.name);
      console.log(formatted);
      reportLines.push(formatted);
    }
  }

  // Test vector verification
  if (options.testVectors) {
    const tvPath = path.resolve(options.testVectors);
    if (!(await fileExists(tvPath))) {
      error(`Test vectors file not found: ${tvPath}`);
      process.exit(1);
    }

    info(`Running test vectors from ${tvPath}...`);
    try {
      const tvContent = await fs.readFile(tvPath, "utf-8");
      const runner = new TestRunner(circuit);
      const results = runner.runFromJson(JSON.parse(tvContent));
      const formatted = formatTestReport(results);
      console.log(formatted);
      reportLines.push(formatted);

      if (results.passed === results.total) {
        success(`All ${results.total} test vectors PASSED`);
      } else {
        error(`${results.failed} of ${results.total} test vectors FAILED`);
        process.exit(1);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      error(`Failed to run test vectors: ${msg}`);
      process.exit(1);
    }
  }

  if (options.output && reportLines.length > 0) {
    try {
      await fs.writeFile(path.resolve(options.output), reportLines.join("\n\n"), "utf-8");
      success(`Report saved to ${options.output}`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      error(`Failed to save report: ${msg}`);
    }
  }
}
