/**
 * sm-logic simulate — Tick-by-tick circuit simulation.
 */
import chalk from "chalk";
import { Command } from "commander";
import fs from "node:fs/promises";
import path from "node:path";
import { SimulationEngine } from "../../simulator/engine.js";
import { CircuitJsonParser } from "../../parser/circuit-json.js";
import { info, success, warn, error, header, kv } from "../utils/output.js";

interface SimulateOptions {
  ticks?: string;
  input?: string[];
  output?: string;
  watch?: boolean;
}

export function createSimulateCommand(): Command {
  return new Command("simulate")
    .description("Run tick-by-tick simulation of a circuit")
    .argument("<file>", "Circuit file (.sm-circuit.json)")
    .option("-t, --ticks <number>", "Number of ticks to simulate", "20")
    .option("-i, --input <pairs...>", "Input assignments: A=1,B=0")
    .option("-o, --output <file>", "Export waveform as VCD file")
    .option("-w, --watch", "Interactive watch mode")
    .action(async (filePath: string, options: SimulateOptions) => {
      await runSimulate(filePath, options);
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

async function runSimulate(filePath: string, options: SimulateOptions): Promise<void> {
  const absPath = path.resolve(filePath);

  if (!(await fileExists(absPath))) {
    error(`File not found: ${absPath}`);
    process.exit(1);
  }

  header("Scrap Mechanic Circuit Simulation");
  kv("File", absPath);

  let engine: SimulationEngine;

  try {
    const parser = new CircuitJsonParser();
    const circuit = await parser.parseFile(absPath);
    engine = new SimulationEngine(circuit);
    kv("Circuit", circuit.name);
    kv("Inputs", circuit.inputs.join(", "));
    kv("Outputs", circuit.outputs.join(", "));
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    error(`Failed to load circuit: ${msg}`);
    process.exit(1);
  }

  // Parse input assignments
  const inputMap: Record<string, boolean> = {};
  if (options.input?.length) {
    for (const pair of options.input) {
      const eqIdx = pair.indexOf("=");
      if (eqIdx < 0) {
        warn(`Ignoring invalid input pair: ${pair}`);
        continue;
      }
      const key = pair.substring(0, eqIdx);
      const val = pair.substring(eqIdx + 1);
      if (!key) {
        warn(`Ignoring invalid input pair: ${pair}`);
        continue;
      }
      inputMap[key] = val === "1" || val.toLowerCase() === "true" || val.toLowerCase() === "on";
    }
    kv("Inputs set", Object.entries(inputMap).map(([k, v]) => `${k}=${v ? 1 : 0}`).join(", "));
  }

  const tickCount = parseInt(options.ticks ?? "20", 10);
  if (isNaN(tickCount) || tickCount < 1) {
    error("Ticks must be a positive number");
    process.exit(1);
  }
  kv("Ticks", tickCount);

  if (options.output) {
    engine.enableWaveformRecording();
    kv("VCD output", path.resolve(options.output));
  }

  engine.setInputs(inputMap);

  info(`Simulating ${tickCount} ticks...`);
  const results = engine.tickN(tickCount);

  console.log();
  header("Simulation Results");

  const outputNames = [...engine.getOutputs().keys()];
  const inputNames = [...engine.getInputs().keys()];
  const allNames = [...inputNames, ...outputNames];

  const tickStr = "Tick";
  const colWidth = Math.max(tickStr.length, ...allNames.map((n) => n.length)) + 2;
  let line = tickStr.padEnd(colWidth);
  for (const name of allNames) {
    line += name.padEnd(colWidth);
  }
  console.log(chalk.dim(line));

  for (const result of results) {
    line = String(result.tickNumber).padEnd(colWidth);
    for (const name of allNames) {
      const val = result.allStates[name] ?? false;
      line += (val ? chalk.green("1") : chalk.red("0")).padEnd(colWidth);
    }
    console.log(result.changed ? line : chalk.dim(line));
  }

  const finalOutputs = engine.getOutputs();
  console.log();
  header("Final State");
  for (const [name, value] of finalOutputs.entries()) {
    kv(name, value ? chalk.green("ON (1)") : chalk.red("OFF (0)"));
  }

  if (options.output) {
    try {
      engine.exportVCD(path.resolve(options.output));
      success(`Waveform exported to ${options.output}`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      error(`VCD export failed: ${msg}`);
    }
  }
}
