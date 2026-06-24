/**
 * BlueprintWriter serializes SMBlueprint objects to JSON files and strings.
 */
import { writeFile, mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import type { SMBlueprint } from "../types/blueprint.js";

export class BlueprintWriter {
  /**
   * Write a blueprint to a JSON file, creating directories as needed.
   */
  static async write(blueprint: SMBlueprint, filePath: string): Promise<void> {
    const dir = dirname(filePath);
    await mkdir(dir, { recursive: true });
    const content = BlueprintWriter.writeString(blueprint);
    await writeFile(filePath, content, "utf-8");
  }

  /**
   * Serialize a blueprint to a formatted JSON string.
   */
  static writeString(blueprint: SMBlueprint): string {
    return JSON.stringify(blueprint, null, 2) + "\n";
  }
}
