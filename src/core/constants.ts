/**
 * Scrap Mechanic shape IDs and constants.
 * Sourced from blueprint analysis of all 3 repos.
 */

/** Scrap Mechanic blueprint shape UUIDs */
export const SHAPE_IDS = {
  LOGIC_GATE: "9f0f56e8-2c31-4d83-996c-d00a9b296c3f",
  TIMER: "8f7fd0e7-c46e-4944-a414-7ce2437bb30f",
  BUTTON: "1e8d93a4-506b-470d-9ada-9c0a321e2db5",
  SWITCH: "7cf717d7-d167-4f2d-a6e7-6b2c70aa3986",
  PLASTIC_BLOCK: "628b2d61-5ceb-43e9-8334-a4135566df7a",
  SENSOR_PLAYER: "d5329e19-5fd5-4b4b-8153-608781fa8520",
  SENSOR_DESTRUCTIBLE: "a5ec65f6-02a7-4a21-bc41-3a1dc4b4e5cb",
  SENSOR_ANGLE: "9a951bf2-c1e6-4214-8f20-635a03e66b63",
} as const;

/** Vincling mod shape ID */
export const VINCLING_SHAPE_ID = "bc336a10-675a-4942-94ce-e83ecb4b501a";

/** Circuits Creator mod shape ID */
export const CIRCUITS_SHAPE_ID = "8f98db04-72eb-4a3a-88a1-f4f3e8d818ee";

/** Vincling mod base64 data for each gate mode */
export const VINCLING_GATE_DATA: Readonly<Record<number, string>> = {
  0: "gExVQQAAAAEFBQDAAgAAAAIAbW9kZQgA",
  1: "gExVQQAAAAEFBQDAAgAAAAIAbW9kZQgB",
  2: "gExVQQAAAAEFBQDAAgAAAAIAbW9kZQgC",
  3: "gExVQQAAAAEFBQDAAgAAAAIAbW9kZQgD",
  4: "gExVQQAAAAEFBQDAAgAAAAIAbW9kZQgE",
  5: "gExVQQAAAAEFBQDAAgAAAAIAbW9kZQgF",
} as const;

/** Circuits Creator mod base64 data for each gate mode */
export const CIRCUITS_GATE_DATA: Readonly<Record<number, string>> = {
  0: "gExVQQAAAAEFBQDwAgIAAAAEgG9wZXJhdGlvbggA",
  1: "gExVQQAAAAEFBQDwAgIAAAAEgG9wZXJhdGlvbggB",
  2: "gExVQQAAAAEFBQDwAgIAAAAEgG9wZXJhdGlvbggC",
  3: "gExVQQAAAAEFBQDwAgIAAAAEgG9wZXJhdGlvbggD",
  4: "gExVQQAAAAEFBQDwAgIAAAAEgG9wZXJhdGlvbggE",
  5: "gExVQQAAAAEFBQDwAgIAAAAEgG9wZXJhdGlvbggF",
} as const;

/** Dependency entries for modded formats */
export const MOD_DEPENDENCIES = {
  vincling: "2568516747",
  circuits: "2289714402",
} as const;

/** Default block directions */
export const DEFAULT_DIRECTIONS = {
  /** X-axis direction (identity rotation) */
  X_AXIS: { x: 1, y: 0, z: 0, w: 0 } as const,
  /** Z-axis direction */
  Z_AXIS: { x: 0, y: 0, z: 1, w: 0 } as const,
} as const;

/** Gate format types for conversion */
export type GateFormat = "vanilla" | "vincling" | "circuits";

/** Circuit file extension */
export const CIRCUIT_FILE_EXT = ".sm-circuit.json";

/** Blueprint file name */
export const BLUEPRINT_FILE_NAME = "blueprint.json";
