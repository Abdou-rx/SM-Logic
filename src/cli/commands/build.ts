/**
 * sm-logic build — Generate Scrap Mechanic blueprints from circuits or Verilog.
 */
import { Command } from "commander";
import fs from "node:fs/promises";
import path from "node:path";
import { CircuitJsonParser } from "../../parser/circuit-json.js";
import { VerilogParser } from "../../parser/verilog-parser.js";
import { BlueprintBuilder } from "../../blueprint/builder.js";
import { GateConverter } from "../../converter/gate-converter.js";
import { DEFAULT_BP_OPTIONS } from "../../types/blueprint.js";
import type { CircuitDefinition } from "../../types/circuit.js";
import type { GateFormat } from "../../converter/format-types.js";
import { success, error, header, kv, info, warn } from "../utils/output.js";

interface BuildOptions {
  output?: string;
  format?: string;
  portDevices?: boolean;
  fill?: boolean;
}

export function createBuildCommand(): Command {
  return new Command("build")
    .description("Generate Scrap Mechanic blueprint from circuit or Verilog")
    .argument("<file>", "Circuit (.sm-circuit.json) or Verilog (.v) file")
    .option("-o, --output <file>", "Output blueprint file path", "blueprint.json")
    .option("-f, --format <format>", "Gate format: vanilla, vincling, circuits", "vanilla")
    .option("--no-port-devices", "Skip adding button/switch devices for ports")
    .option("--no-fill", "Skip filling empty grid with plastic blocks")
    .action(async (filePath: string, options: BuildOptions) => {
      await runBuild(filePath, options);
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

async function runBuild(filePath: string, options: BuildOptions): Promise<void> {
  const absPath = path.resolve(filePath);

  if (!(await fileExists(absPath))) {
    error(`File not found: ${absPath}`);
    process.exit(1);
  }

  header("Blueprint Generator");

  const format = (options.format ?? "vanilla") as GateFormat;
  if (!["vanilla", "vincling", "circuits"].includes(format)) {
    error(`Invalid format: ${format}. Must be vanilla, vincling, or circuits`);
    process.exit(1);
  }

  let circuit: CircuitDefinition;
  const ext = path.extname(absPath).toLowerCase();

  try {
    if (ext === ".v" || ext === ".sv" || ext === ".vh") {
      info("Parsing Verilog file...");
      const verilogFile = await VerilogParser.parseFile(absPath);
      if (verilogFile.modules.length === 0) {
        error("No modules found in Verilog file");
        process.exit(1);
      }
      kv("Modules found", verilogFile.modules.length);
      circuit = VerilogParser.moduleToCircuit(verilogFile.modules[0]!);
      kv("Using module", verilogFile.modules[0]!.name);
    } else if (ext === ".json") {
      info("Parsing circuit file...");
      const parser = new CircuitJsonParser();
      circuit = await parser.parseFile(absPath);
    } else {
      error(`Unsupported file format: ${ext}. Use .sm-circuit.json or .v`);
      process.exit(1);
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    error(`Parse error: ${msg}`);
    process.exit(1);
  }

  kv("Circuit", circuit.name);
  kv("Inputs", circuit.inputs.join(", "));
  kv("Outputs", circuit.outputs.join(", "));
  kv("Gates", circuit.gates.length);
  kv("Format", format);

  info("Generating blueprint...");
  const bpOptions = {
    ...DEFAULT_BP_OPTIONS,
    addPortDevices: options.portDevices !== false,
    fillBlocks: options.fill !== false,
  };

  try {
    const builder = new BlueprintBuilder(circuit, bpOptions);
    let blueprint = builder.build();

    if (format !== "vanilla") {
      info(`Converting to ${format} format...`);
      blueprint = GateConverter.convert(blueprint, format);
    }

    const stats = builder.getStats();
    kv("Bodies", stats.bodyCount);
    kv("Total items", stats.itemCount);
    kv("Logic gates", stats.gateCount);

    const outputPath = path.resolve(options.output ?? "blueprint.json");
    const jsonStr = JSON.stringify(blueprint, null, 2);
    await fs.writeFile(outputPath, jsonStr, "utf-8");

    const fileSize = Buffer.byteLength(jsonStr, "utf-8");
    kv("Output path", outputPath);
    kv("File size", `${(fileSize / 1024).toFixed(1)} KB`);

    if (fileSize > 512 * 1024) {
      warn("Blueprint is large (>512 KB). May exceed SM packet limit after compression.");
    }

    success(`Blueprint written to ${outputPath}`);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    error(`Blueprint generation failed: ${msg}`);
    process.exit(1);
  }
}
