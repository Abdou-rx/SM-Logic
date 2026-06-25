/**
 * Conversion format types for Scrap Mechanic gate format conversion.
 *
 * Supports conversion between three gate representation formats:
 * - Vanilla: Standard SM logic gates (controller.mode based)
 * - Vincling: Vincling's logic mod (base64 data encoded)
 * - Circuits: Circuits Creator mod (base64 data encoded)
 */
import type { LogicGateType } from "../types/gate.js";
import type { SMBlueprint } from "../types/blueprint.js";

/** Supported gate representation formats */
export type GateFormat = "vanilla" | "vincling" | "circuits";

/** Information about a vanilla-format logic gate */
export interface VanillaGateInfo {
  readonly mode: number;
  readonly gateType: LogicGateType;
}

/** Information about a modded-format logic gate (Vincling or Circuits) */
export interface ModdedGateInfo {
  readonly shapeId: string;
  readonly data: string;
  readonly gateType: LogicGateType;
  readonly dependencyId: string;
}

/** Result of a blueprint format conversion */
export interface ConversionResult {
  readonly blueprint: SMBlueprint;
  readonly sourceFormat: GateFormat;
  readonly targetFormat: GateFormat;
  readonly gatesConverted: number;
  readonly dependencies: readonly string[];
}

/** Metadata about each supported format */
export interface FormatMetadata {
  readonly format: GateFormat;
  readonly label: string;
  readonly shapeId: string;
  readonly description: string;
}
