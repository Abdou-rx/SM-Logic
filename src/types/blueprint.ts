/**
 * Scrap Mechanic Blueprint JSON types.
 *
 * Based on analysis of blueprint format from:
 * - SteveBenz/ScrapMechanicLogicGateSimulator (importexport.ts)
 * - MikeDev101/scrap-mechanic-logic-converter (main.py)
 * - yliu-hashed/Scrap-Mechanic-EDA (SM Blueprint.swift)
 */

/** 3D vector position */
export interface SMVector {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

/** Direction vector for block rotation */
export interface SMDirection {
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly w: number;
}

/** Controller item for wiring connections */
export interface SMControllerItem {
  readonly id: number;
}

/** Blueprint item controller */
export interface SMController {
  readonly active?: boolean;
  readonly id: number;
  readonly mode?: number;
  readonly controllers?: readonly SMControllerItem[];
  readonly joints?: unknown;
  readonly seconds?: number;
  readonly ticks?: number;
  readonly containers?: unknown;
  readonly data?: string;
}

/** A single item in the blueprint */
export interface SMBlueprintItem {
  readonly bounds?: SMVector;
  readonly color?: string;
  readonly pos: SMVector;
  readonly shapeId: string;
  readonly xaxis?: SMDirection;
  readonly zaxis?: SMDirection;
  readonly controller?: SMController;
  readonly joints?: unknown[];
}

/** Body containing child items */
export interface SMBlueprintBody {
  readonly childs: readonly SMBlueprintItem[];
}

/** Top-level blueprint structure (version 4) */
export interface SMBlueprint {
  readonly version: 4;
  readonly name?: string;
  readonly blueprintId?: string;
  readonly bodies: readonly SMBlueprintBody[];
  readonly joints?: unknown[];
  readonly dependencies?: readonly string[];
}

/** Placement configuration for a single gate */
export interface GatePlacement {
  readonly gateId: string;
  readonly position: SMVector;
  readonly direction?: SMDirection;
  readonly controllerId: number;
}

/** Blueprint generation options */
export interface BlueprintOptions {
  readonly addPortDevices: boolean;
  readonly fillBlocks: boolean;
  readonly gridSize: SMVector;
  readonly gateSpacing: number;
}

/** Default blueprint generation options */
export const DEFAULT_BP_OPTIONS: BlueprintOptions = {
  addPortDevices: true,
  fillBlocks: true,
  gridSize: { x: 10, y: 1, z: 10 },
  gateSpacing: 1,
} as const;
