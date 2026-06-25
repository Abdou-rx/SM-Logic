/**
 * sm-logic truth-table — Generate and display truth tables.
 */
import { Command } from "commander";
import { CircuitJsonParser } from "../../parser/circuit-json.js";
import { TruthTableGenerator } from "../../verifier/truth-table-gen.js";
import { formatTruthTableReport } from "../../verifier/reporter.js";
import { success, warn, error, header, kv, info } from "../utils/output.js";
import { formatGateTruthTable } from "../../core/gates.js";

interface TruthTableOptions {
  gate?: string;
  inputs?: string;
}

export function createTruthTableCommand(): Command {
  return new Command("truth-table")
    .description("Generate truth tables for gates or circuits")
    .option("-g, --gate <type>", "Gate type (and|or|xor|nand|nor|xnor)")
    .option("-n, --inputs <number>", "Number of inputs for --gate (max 10)", "2")
    .argument("[file]", "Circuit file (.sm-circuit.json)")
    .action(async (filePath: string | undefined, options: TruthTableOptions) => {
      await runTruthTable(filePath, options);
    });
}

async function runTruthTable(
  filePath: string | undefined,
  options: TruthTableOptions,
): Promise<void> {
  header("Truth Table Generator");

  if (options.gate) {
    const gateType = options.gate as "and" | "or" | "xor" | "nand" | "nor" | "xnor";
    const validGates = ["and", "or", "xor", "nand", "nor", "xnor"];
    if (!validGates.includes(gateType)) {
      error(`Invalid gate type: ${gateType}. Must be one of: ${validGates.join(", ")}`);
      process.exit(1);
    }
    const inputCount = parseInt(options.inputs ?? "2", 10);
    if (isNaN(inputCount) || inputCount < 1 || inputCount > 10) {
      error("Input count must be between 1 and 10");
      process.exit(1);
    }

    kv("Gate", gateType.toUpperCase());
    kv("Inputs", inputCount);
    kv("Rows", 1 << inputCount);

    console.log();
    console.log(formatGateTruthTable(gateType, inputCount));
    success("Done");
    return;
  }

  if (!filePath) {
    error("Provide a circuit file or use --gate to generate a gate truth table");
    process.exit(1);
  }

  try {
    const parser = new CircuitJsonParser();
    const circuit = await parser.parseFile(filePath);
    kv("Circuit", circuit.name);
    kv("Inputs", circuit.inputs.length);

    const ttGen = new TruthTableGenerator(circuit);

    if (!ttGen.canGenerateFull()) {
      warn(
        `Circuit has ${circuit.inputs.length} inputs — using sampled verification (${Math.min(64, 1 << 6)} samples)`,
      );
      const table = ttGen.generateSampled(64);
      console.log(formatTruthTableReport(table, circuit.name));
    } else {
      info("Generating exhaustive truth table...");
      const table = ttGen.generate();
      console.log(formatTruthTableReport(table, circuit.name));
    }
    success("Done");
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    error(`Failed: ${msg}`);
    process.exit(1);
  }
}
