/**
 * GateConverter — converts logic gates in a blueprint between
 * vanilla, Vincling mod, and Circuits Creator mod formats.
 *
 * Conversion strategy:
 *  - Detect source format from each item's shapeId.
 *  - Extract the gate mode (0-5) from controller.mode (vanilla) or
 *    reverse-lookup from controller.data (modded).
 *  - Replace shapeId, controller.mode / controller.data accordingly.
 *  - Update the blueprint's dependency list.
 */
import type {
  SMBlueprint,
  SMBlueprintItem,
  SMBlueprintBody,
  SMController,
} from "../types/blueprint.js";
import type { GateFormat } from "./format-types.js";
import type { ConversionResult } from "./format-types.js";
import {
  SHAPE_IDS,
  VINCLING_SHAPE_ID,
  CIRCUITS_SHAPE_ID,
  VINCLING_GATE_DATA,
  CIRCUITS_GATE_DATA,
  MOD_DEPENDENCIES,
} from "../core/constants.js";

// ---------------------------------------------------------------------------
// Reverse lookup maps: base64 data → mode number
// ---------------------------------------------------------------------------

const VINCLING_DATA_TO_MODE: Readonly<Record<string, number>> = buildReverseMap(VINCLING_GATE_DATA);
const CIRCUITS_DATA_TO_MODE: Readonly<Record<string, number>> = buildReverseMap(CIRCUITS_GATE_DATA);

function buildReverseMap(forward: Readonly<Record<number, string>>): Record<string, number> {
  const result: Record<string, number> = {};
  for (const [mode, data] of Object.entries(forward)) {
    result[data] = Number(mode);
  }
  return result;
}

// ---------------------------------------------------------------------------
// Known logic-gate shape IDs (used for format detection)
// ---------------------------------------------------------------------------

const LOGIC_SHAPE_IDS: ReadonlySet<string> = new Set([
  SHAPE_IDS.LOGIC_GATE,
  VINCLING_SHAPE_ID,
  CIRCUITS_SHAPE_ID,
]);

// ---------------------------------------------------------------------------
// GateConverter
// ---------------------------------------------------------------------------

export class GateConverter {
  /**
   * Convert every logic gate in `blueprint` from its current format
   * to `targetFormat`.
   *
   * Non-logic-gate items (buttons, switches, timers, plastic blocks, etc.)
   * are left untouched.
   */
  static convert(blueprint: SMBlueprint, targetFormat: GateFormat): SMBlueprint {
    let gatesConverted = 0;

    const newBodies: SMBlueprintBody[] = blueprint.bodies.map((body) => {
      const newChilds: SMBlueprintItem[] = body.childs.map((item) => {
        if (!LOGIC_SHAPE_IDS.has(item.shapeId)) return item;

        const sourceFormat = detectFormat(item.shapeId);
        if (sourceFormat === null) return item;

        if (sourceFormat === targetFormat) return item;

        const mode = extractMode(item.controller, sourceFormat);
        if (mode === undefined) return item;

        gatesConverted++;
        return convertItem(item, mode, targetFormat);
      });

      return { childs: newChilds };
    });

    const newDeps = updateDependencies(blueprint.dependencies, targetFormat);

    return {
      version: 4,
      bodies: newBodies,
      joints: blueprint.joints,
      dependencies: newDeps,
    };
  }

  /**
   * Convert and return a detailed ConversionResult.
   */
  static convertWithResult(
    blueprint: SMBlueprint,
    targetFormat: GateFormat,
  ): ConversionResult {
    let gatesConverted = 0;

    const newBodies: SMBlueprintBody[] = blueprint.bodies.map((body) => {
      const newChilds: SMBlueprintItem[] = body.childs.map((item) => {
        if (!LOGIC_SHAPE_IDS.has(item.shapeId)) return item;

        const sourceFormat = detectFormat(item.shapeId);
        if (sourceFormat === null || sourceFormat === targetFormat) return item;

        const mode = extractMode(item.controller, sourceFormat);
        if (mode === undefined) return item;

        gatesConverted++;
        return convertItem(item, mode, targetFormat);
      });

      return { childs: newChilds };
    });

    const sourceFormat = detectSourceFormat(blueprint);
    const newDeps = updateDependencies(blueprint.dependencies, targetFormat);

    return {
      blueprint: {
        version: 4,
        bodies: newBodies,
        joints: blueprint.joints,
        dependencies: newDeps,
      },
      sourceFormat: sourceFormat ?? "vanilla",
      targetFormat,
      gatesConverted,
      dependencies: newDeps,
    };
  }
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function detectFormat(shapeId: string): GateFormat | null {
  if (shapeId === SHAPE_IDS.LOGIC_GATE) return "vanilla";
  if (shapeId === VINCLING_SHAPE_ID) return "vincling";
  if (shapeId === CIRCUITS_SHAPE_ID) return "circuits";
  return null;
}

function detectSourceFormat(blueprint: SMBlueprint): GateFormat | null {
  for (const body of blueprint.bodies) {
    for (const item of body.childs) {
      const fmt = detectFormat(item.shapeId);
      if (fmt !== null) return fmt;
    }
  }
  return null;
}

function extractMode(
  controller: SMController | undefined,
  format: GateFormat,
): number | undefined {
  if (controller === undefined) return undefined;

  switch (format) {
    case "vanilla":
      return controller.mode;
    case "vincling": {
      if (controller.data === undefined) return undefined;
      return VINCLING_DATA_TO_MODE[controller.data];
    }
    case "circuits": {
      if (controller.data === undefined) return undefined;
      return CIRCUITS_DATA_TO_MODE[controller.data];
    }
  }
}

function convertItem(
  item: SMBlueprintItem,
  mode: number,
  targetFormat: GateFormat,
): SMBlueprintItem {
  const base = item.controller;

  switch (targetFormat) {
    case "vanilla":
      return {
        ...item,
        shapeId: SHAPE_IDS.LOGIC_GATE,
        controller: base
          ? makeController(base, mode, undefined)
          : undefined,
      };

    case "vincling": {
      const data = VINCLING_GATE_DATA[mode];
      return {
        ...item,
        shapeId: VINCLING_SHAPE_ID,
        controller: base
          ? makeController(base, undefined, data)
          : undefined,
      };
    }

    case "circuits": {
      const data = CIRCUITS_GATE_DATA[mode];
      return {
        ...item,
        shapeId: CIRCUITS_SHAPE_ID,
        controller: base
          ? makeController(base, undefined, data)
          : undefined,
      };
    }
  }
}

/**
 * Build a new SMController based on an existing one, replacing mode and data.
 * Preserves: id, active, controllers, joints, seconds, ticks, containers.
 */
function makeController(
  original: SMController,
  mode: number | undefined,
  data: string | undefined,
): SMController {
  return {
    id: original.id,
    active: original.active,
    mode,
    data,
    controllers: original.controllers,
    joints: original.joints,
    seconds: original.seconds,
    ticks: original.ticks,
    containers: original.containers,
  };
}

/**
 * Update the blueprint's dependency list for the target format.
 *
 * - Vanilla: no mod dependencies
 * - Vincling: requires MOD_DEPENDENCIES.vincling
 * - Circuits: requires MOD_DEPENDENCIES.circuits
 */
function updateDependencies(
  existing: readonly string[] | undefined,
  targetFormat: GateFormat,
): string[] {
  const deps = new Set<string>(existing ?? []);

  if (targetFormat === "vanilla") {
    deps.delete(MOD_DEPENDENCIES.vincling);
    deps.delete(MOD_DEPENDENCIES.circuits);
  } else if (targetFormat === "vincling") {
    deps.delete(MOD_DEPENDENCIES.circuits);
    deps.add(MOD_DEPENDENCIES.vincling);
  } else if (targetFormat === "circuits") {
    deps.delete(MOD_DEPENDENCIES.vincling);
    deps.add(MOD_DEPENDENCIES.circuits);
  }

  return Array.from(deps);
}
