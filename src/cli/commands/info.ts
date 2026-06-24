/**
 * sm-logic info — Display circuit information and statistics.
 */
import { Command } from "commander";
import { CircuitJsonParser } from "../../parser/circuit-json.js";
import { BlueprintReader } from "../../parser/blueprint-reader.js";
import { GATE_DISPLAY_NAMES } from "../../types/gate.js";
import { success, error, header, kv, subheader } from "../utils/output.js";

export function createInfoCommand(): Command {
  return new Command("info")
    .description("Display circuit information and statistics")
    .argument("<file>", "Circuit file (.sm-circuit.json) or blueprint.json")
    .action(async (filePath: string) => {
      await runInfo(filePath);
    });
}

async function runInfo(filePath: string): Promise<void> {
  header("Circuit Information");
  kv("File", filePath);

  // Try as blueprint first
  try {
    const bp = await BlueprintReader.parseFile(filePath);
    const stats = BlueprintReader.countGates(bp);
    kv("Type", "Scrap Mechanic Blueprint");
    kv("Version", String(bp.version));
    kv("Bodies", String(bp.bodies.length));
    kv("Total items", stats.total);
    subheader("Gate Breakdown");
    for (const [type, count] of Object.entries(stats.byType)) {
      if (count > 0) {
        kv(`  ${type}`, String(count));
      }
    }
    success("Done");
    return;
  } catch {
    // Not a blueprint, try as circuit
  }

  try {
    const parser = new CircuitJsonParser();
    const circuit = await parser.parseFile(filePath);
    kv("Type", "SM Circuit Definition");
    kv("Name", circuit.name);
    kv("Version", circuit.version ?? "1.0.0");
    if (circuit.description) kv("Description", circuit.description);
    kv("Inputs", String(circuit.inputs.length));
    kv("Outputs", String(circuit.outputs.length));
    kv("Gates", String(circuit.gates.length));

    const breakdown: Record<string, number> = {};
    for (const gate of circuit.gates) {
      breakdown[gate.type] = (breakdown[gate.type] ?? 0) + 1;
    }

    if (Object.keys(breakdown).length > 0) {
      subheader("Gate Breakdown");
      for (const [type, count] of Object.entries(breakdown)) {
        const displayName =
          type in GATE_DISPLAY_NAMES
            ? GATE_DISPLAY_NAMES[type as keyof typeof GATE_DISPLAY_NAMES]
            : type;
        kv(`  ${displayName}`, String(count));
      }
    }

    if (circuit.feedback && Object.keys(circuit.feedback).length > 0) {
      subheader("Feedback Loops (Sequential)");
      for (const [src, dst] of Object.entries(circuit.feedback)) {
        kv(`  ${src} → ${dst}`, "feedback");
      }
    }

    subheader("Inputs");
    for (const input of circuit.inputs) {
      kv(`  ${input}`, "input port");
    }

    subheader("Outputs");
    for (const output of circuit.outputs) {
      kv(`  ${output}`, "output port");
    }

    success("Done");
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    error(`Failed to parse: ${msg}`);
    process.exit(1);
  }
}
