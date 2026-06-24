/**
 * BlueprintReader — reads Scrap Mechanic blueprint.json files and
 * extracts logic gate information from them.
 */
import { readFile } from "node:fs/promises";
import type {
  SMBlueprint,
  SMBlueprintItem,
  SMVector,
  SMController,
} from "../types/blueprint.js";
import type { LogicGateType } from "../types/gate.js";
import { MODE_TO_GATE_TYPE } from "../types/gate.js";
import { SHAPE_IDS } from "../core/constants.js";

// ---------------------------------------------------------------------------
// Public result types
// ---------------------------------------------------------------------------

/** Extracted information about a single logic-related item in a blueprint */
export interface ExtractedGateInfo {
  readonly kind: "logic_gate" | "timer" | "button" | "switch";
  readonly gateType?: LogicGateType;
  readonly mode?: number;
  readonly controllerId: number;
  readonly position: SMVector;
  readonly inputControllerIds: readonly number[];
}

/** Summary of gate counts in a blueprint */
export interface GateCountSummary {
  readonly logicGates: number;
  readonly timers: number;
  readonly buttons: number;
  readonly switches: number;
  readonly total: number;
  readonly byType: Readonly<Record<LogicGateType, number>>;
}

// ---------------------------------------------------------------------------
// BlueprintReader
// ---------------------------------------------------------------------------

export class BlueprintReader {
  /**
   * Read and parse a blueprint.json file.
   */
  static async parseFile(filePath: string): Promise<SMBlueprint> {
    const content = await readFile(filePath, "utf-8");
    const data: unknown = JSON.parse(content);
    return BlueprintReader.validateBlueprint(data);
  }

  /**
   * Find all logic gates, timers, buttons, and switches in a blueprint.
   */
  static extractGates(blueprint: SMBlueprint): ExtractedGateInfo[] {
    const results: ExtractedGateInfo[] = [];

    for (const body of blueprint.bodies) {
      for (const item of body.childs) {
        const info = classifyItem(item);
        if (info !== null) {
          results.push(info);
        }
      }
    }

    return results;
  }

  /**
   * Count gates by category in a blueprint.
   */
  static countGates(blueprint: SMBlueprint): GateCountSummary {
    const byType: Record<LogicGateType, number> = {
      and: 0, or: 0, xor: 0, nand: 0, nor: 0, xnor: 0,
    };
    let logicGates = 0;
    let timers = 0;
    let buttons = 0;
    let switches = 0;

    for (const body of blueprint.bodies) {
      for (const item of body.childs) {
        if (item.shapeId === SHAPE_IDS.LOGIC_GATE) {
          const mode = item.controller?.mode;
          if (mode !== undefined) {
            const gt = MODE_TO_GATE_TYPE[mode];
            if (gt !== undefined) {
              byType[gt] = (byType[gt] ?? 0) + 1;
            }
          }
          logicGates++;
        } else if (item.shapeId === SHAPE_IDS.TIMER) {
          timers++;
        } else if (item.shapeId === SHAPE_IDS.BUTTON) {
          buttons++;
        } else if (item.shapeId === SHAPE_IDS.SWITCH) {
          switches++;
        }
      }
    }

    return {
      logicGates,
      timers,
      buttons,
      switches,
      total: logicGates + timers + buttons + switches,
      byType,
    };
  }

  // ---------------------------------------------------------------------------
  // Internal helpers
  // ---------------------------------------------------------------------------

  private static validateBlueprint(data: unknown): SMBlueprint {
    if (data === null || typeof data !== "object") {
      throw new Error("Blueprint JSON must be a non-null object");
    }
    const obj = data as Record<string, unknown>;
    if (obj.version !== 4) {
      throw new Error(`Unsupported blueprint version: ${String(obj.version)} (expected 4)`);
    }
    if (!Array.isArray(obj.bodies)) {
      throw new Error("Blueprint must contain a \"bodies\" array");
    }
    // Structural accept — deeper validation happens when reading items
    return data as SMBlueprint;
  }
}

// ---------------------------------------------------------------------------
// Item classification (module-private)
// ---------------------------------------------------------------------------

function classifyItem(item: SMBlueprintItem): ExtractedGateInfo | null {
  switch (item.shapeId) {
    case SHAPE_IDS.LOGIC_GATE:
      return classifyLogicGate(item);
    case SHAPE_IDS.TIMER:
      return classifyTimer(item);
    case SHAPE_IDS.BUTTON:
      return classifyPortDevice(item, "button");
    case SHAPE_IDS.SWITCH:
      return classifyPortDevice(item, "switch");
    default:
      return null;
  }
}

function classifyLogicGate(item: SMBlueprintItem): ExtractedGateInfo {
  const ctrl = item.controller;
  const mode = ctrl?.mode;
  const gateType = mode !== undefined ? MODE_TO_GATE_TYPE[mode] : undefined;
  return {
    kind: "logic_gate",
    gateType,
    mode,
    controllerId: ctrl?.id ?? 0,
    position: item.pos,
    inputControllerIds: extractInputIds(ctrl),
  };
}

function classifyTimer(item: SMBlueprintItem): ExtractedGateInfo {
  const ctrl = item.controller;
  return {
    kind: "timer",
    mode: undefined,
    controllerId: ctrl?.id ?? 0,
    position: item.pos,
    inputControllerIds: extractInputIds(ctrl),
  };
}

function classifyPortDevice(
  item: SMBlueprintItem,
  kind: "button" | "switch",
): ExtractedGateInfo {
  const ctrl = item.controller;
  return {
    kind,
    controllerId: ctrl?.id ?? 0,
    position: item.pos,
    inputControllerIds: [],
  };
}

function extractInputIds(ctrl: SMController | undefined): number[] {
  if (ctrl?.controllers === undefined) return [];
  return ctrl.controllers.map((c) => c.id);
}
