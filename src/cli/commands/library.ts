/**
 * sm-logic library — Browse and inspect the subcircuit library.
 */
import chalk from "chalk";
import { Command } from "commander";
import fs from "node:fs/promises";
import { getSubcircuitLibrary, getSubcircuit } from "../../core/subcircuits.js";
import { header, kv, subheader, error, success } from "../utils/output.js";
import Table from "cli-table3";

export function createLibraryCommand(): Command {
  return new Command("library")
    .description("Browse the subcircuit library")
    .addCommand(new Command("list").description("List all available subcircuits").action(listSubcircuits))
    .addCommand(
      new Command("show")
        .description("Show details of a specific subcircuit")
        .argument("<name>", "Subcircuit ID (e.g., 'sr-latch', 't-flipflop')")
        .action(showSubcircuit),
    )
    .addCommand(
      new Command("export")
        .description("Export a subcircuit to a .sm-circuit.json file")
        .argument("<name>", "Subcircuit ID")
        .argument("[output]", "Output file path")
        .action(exportSubcircuit),
    );
}

function listSubcircuits(): void {
  header("Subcircuit Library");
  const library = getSubcircuitLibrary();

  const table = new Table({
    head: ["ID", "Name", "Gates", "Category", "Description"],
    colWidths: [20, 25, 8, 14, 40],
    style: { head: ["cyan"] },
  });

  for (const sc of library) {
    table.push([
      chalk.dim(sc.id),
      chalk.white(sc.name),
      String(sc.gateCount),
      chalk.yellow(sc.category),
      sc.description.length > 40 ? sc.description.substring(0, 37) + "..." : sc.description,
    ]);
  }

  console.log(table.toString());
  console.log(chalk.dim(`\n${library.length} subcircuits available`));
  console.log(chalk.dim("Use 'sm-logic library show <id>' for details"));
}

function showSubcircuit(name: string): void {
  const sc = getSubcircuit(name);
  if (!sc) {
    error(`Subcircuit not found: "${name}"`);
    console.log(chalk.dim("Use 'sm-logic library list' to see available subcircuits"));
    process.exit(1);
  }

  header(`Subcircuit: ${sc.name}`);
  kv("ID", sc.id);
  kv("Category", sc.category);
  kv("Gate Count", String(sc.gateCount));
  kv("Description", sc.description);

  const circuit = sc.build();
  subheader("Circuit: " + circuit.name);
  kv("Inputs", circuit.inputs.join(", "));
  kv("Outputs", circuit.outputs.join(", "));

  subheader("Gates");
  for (const gate of circuit.gates) {
    const inputStr = gate.inputs.join(", ");
    const delayStr = gate.type === "timer" ? ` (delay: ${gate.delay})` : "";
    kv(`  ${gate.id}`, `${gate.type}${delayStr} [${inputStr}] → ${gate.output}`);
  }

  if (circuit.feedback && Object.keys(circuit.feedback).length > 0) {
    subheader("Feedback Loops");
    for (const [src, dst] of Object.entries(circuit.feedback)) {
      kv(`  ${src}`, `→ ${dst}`);
    }
  }

  success("Done");
}

async function exportSubcircuit(name: string, outputPath?: string): Promise<void> {
  const sc = getSubcircuit(name);
  if (!sc) {
    error(`Subcircuit not found: "${name}"`);
    process.exit(1);
  }

  const circuit = sc.build();
  const jsonStr = JSON.stringify(circuit, null, 2);

  const outPath = outputPath ?? `${sc.id}.sm-circuit.json`;
  await fs.writeFile(outPath, jsonStr, "utf-8");

  kv("Exported", outPath);
  kv("Circuit", circuit.name);
  kv("Gates", String(circuit.gates.length));
  success(`Subcircuit exported to ${outPath}`);
}
