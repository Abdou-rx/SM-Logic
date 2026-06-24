/**
 * sm-logic convert — Convert logic gates between vanilla/vincling/circuits formats.
 */
import { Command } from "commander";
import fs from "node:fs/promises";
import path from "node:path";
import { BlueprintReader } from "../../parser/blueprint-reader.js";
import { GateConverter } from "../../converter/gate-converter.js";
import type { GateFormat } from "../../converter/format-types.js";
import { success, error, header, kv, info } from "../utils/output.js";

interface ConvertOptions {
  to?: string;
  output?: string;
}

export function createConvertCommand(): Command {
  return new Command("convert")
    .description("Convert logic gates between vanilla/vincling/circuits formats")
    .argument("<file>", "Blueprint file (blueprint.json)")
    .option("-t, --to <format>", "Target format: vanilla, vincling, circuits")
    .option("-o, --output <file>", "Output file path")
    .action(async (filePath: string, options: ConvertOptions) => {
      await runConvert(filePath, options);
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

async function runConvert(filePath: string, options: ConvertOptions): Promise<void> {
  const absPath = path.resolve(filePath);

  if (!(await fileExists(absPath))) {
    error(`File not found: ${absPath}`);
    process.exit(1);
  }

  header("Blueprint Gate Format Converter");
  kv("Input", absPath);

  const targetFormat = options.to as GateFormat;
  if (!targetFormat || !["vanilla", "vincling", "circuits"].includes(targetFormat)) {
    error("Must specify --to vanilla|vincling|circuits");
    process.exit(1);
  }
  kv("Target format", targetFormat);

  info("Reading blueprint...");
  let blueprint;
  try {
    blueprint = await BlueprintReader.parseFile(absPath);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    error(`Failed to parse blueprint: ${msg}`);
    process.exit(1);
  }

  const before = BlueprintReader.countGates(blueprint);
  kv("Logic gates found", before.total);
  for (const [type, count] of Object.entries(before.byType)) {
    if (count > 0) {
      kv(`  ${type}`, count);
    }
  }

  info(`Converting to ${targetFormat}...`);
  const converted = GateConverter.convertWithResult(blueprint, targetFormat);
  kv("Gates converted", converted.gatesConverted);
  kv("Source format", converted.sourceFormat);
  kv("Target format", converted.targetFormat);

  if (converted.dependencies.length > 0) {
    info("Dependencies added: " + converted.dependencies.join(", "));
  }

  const outputPath = options.output
    ? path.resolve(options.output)
    : absPath.replace(".json", `_${targetFormat}.json`);

  const jsonStr = JSON.stringify(converted.blueprint, null, 2);
  await fs.writeFile(outputPath, jsonStr, "utf-8");
  kv("Output", outputPath);
  kv("Size", `${(Buffer.byteLength(jsonStr, "utf-8") / 1024).toFixed(1)} KB`);

  success(`Converted blueprint written to ${outputPath}`);
}
