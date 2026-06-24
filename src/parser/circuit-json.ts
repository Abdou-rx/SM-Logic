/**
 * Parser for .sm-circuit.json files.
 *
 * Provides async file I/O, JSON string parsing, and structural validation
 * for the CircuitDefinition format used throughout the tool.
 */
import { readFile, writeFile } from "node:fs/promises";
import type { CircuitDefinition, FeedbackMapping } from "../types/circuit.js";
import type { GateConfig, GateType } from "../types/gate.js";

/** Gate types that are valid in .sm-circuit.json gate arrays */
const VALID_JSON_GATE_TYPES = new Set<string>([
  "and", "or", "xor", "nand", "nor", "xnor", "timer",
]);

function isValidJsonGateType(value: string): boolean {
  return VALID_JSON_GATE_TYPES.has(value);
}

export class CircuitJsonParser {
  /**
   * Read and parse a .sm-circuit.json file.
   */
  async parseFile(filePath: string): Promise<CircuitDefinition> {
    const content = await readFile(filePath, "utf-8");
    return this.parseString(content);
  }

  /**
   * Parse a CircuitDefinition from a JSON string.
   */
  parseString(json: string): CircuitDefinition {
    let parsed: unknown;
    try {
      parsed = JSON.parse(json);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      throw new Error(`Failed to parse JSON: ${msg}`);
    }
    return this.validate(parsed);
  }

  /**
   * Validate an unknown value as a CircuitDefinition, throwing on mismatch.
   */
  validate(data: unknown): CircuitDefinition {
    if (data === null || typeof data !== "object") {
      throw new Error("Circuit JSON must be a non-null object");
    }

    const obj = data as Record<string, unknown>;

    // --- name ---
    if (typeof obj.name !== "string" || obj.name.length === 0) {
      throw new Error('Circuit JSON must have a non-empty "name" string');
    }

    // --- optional scalars ---
    const description = typeof obj.description === "string" ? obj.description : undefined;
    const version = typeof obj.version === "string" ? obj.version : undefined;

    // --- inputs ---
    const inputs = requireStringArray(obj, "inputs");

    // --- outputs ---
    const outputs = requireStringArray(obj, "outputs");

    // --- gates ---
    const gates = validateGateArray(obj.gates);

    // --- feedback ---
    const feedback = validateFeedback(obj.feedback);

    return {
      name: obj.name as string,
      description,
      version,
      inputs,
      outputs,
      gates,
      feedback,
    };
  }

  /**
   * Write a CircuitDefinition to a JSON file.
   */
  async writeFile(circuit: CircuitDefinition, filePath: string): Promise<void> {
    const content = JSON.stringify(circuit, null, 2) + "\n";
    await writeFile(filePath, content, "utf-8");
  }
}

// ---------------------------------------------------------------------------
// Validation helpers (module-private)
// ---------------------------------------------------------------------------

function requireStringArray(obj: Record<string, unknown>, field: string): readonly string[] {
  const raw = obj[field];
  if (!Array.isArray(raw)) {
    throw new Error(`"${field}" must be an array of strings`);
  }
  for (let i = 0; i < raw.length; i++) {
    if (typeof raw[i] !== "string") {
      throw new Error(`${field}[${i}] must be a string, got ${typeof raw[i]}`);
    }
  }
  return raw as string[];
}

function validateGateArray(raw: unknown): readonly GateConfig[] {
  if (!Array.isArray(raw)) {
    throw new Error('"gates" must be an array');
  }
  const result: GateConfig[] = [];
  for (let i = 0; i < raw.length; i++) {
    result.push(validateOneGate(raw[i], i));
  }
  return result;
}

function validateOneGate(raw: unknown, idx: number): GateConfig {
  if (raw === null || typeof raw !== "object") {
    throw new Error(`gates[${idx}] must be an object`);
  }
  const g = raw as Record<string, unknown>;

  // id
  if (typeof g.id !== "string" || (g.id as string).length === 0) {
    throw new Error(`gates[${idx}].id must be a non-empty string`);
  }

  // type
  if (typeof g.type !== "string" || !isValidJsonGateType(g.type as string)) {
    throw new Error(
      `gates[${idx}].type must be one of [and|or|xor|nand|nor|xnor|timer], got "${String(g.type)}"`,
    );
  }

  // inputs
  const inputs = requireStringArray(g, "inputs");

  // output
  if (typeof g.output !== "string" || (g.output as string).length === 0) {
    throw new Error(`gates[${idx}].output must be a non-empty string`);
  }

  // optional delay & description — build into the object up front so readonly is satisfied
  const delay = typeof g.delay === "number" ? g.delay : undefined;
  const desc = typeof g.description === "string" ? g.description : undefined;

  const gate: GateConfig = {
    id: g.id as string,
    type: g.type as GateType,
    inputs,
    output: g.output as string,
    delay,
    description: desc,
  };

  return gate;
}

function validateFeedback(raw: unknown): FeedbackMapping | undefined {
  if (raw === undefined || raw === null) return undefined;

  if (typeof raw !== "object" || Array.isArray(raw)) {
    throw new Error('"feedback" must be an object mapping output names to input names');
  }

  const fb = raw as Record<string, unknown>;
  const result: Record<string, string> = {};
  for (const [key, value] of Object.entries(fb)) {
    if (typeof value !== "string") {
      throw new Error(`feedback["${key}"] must be a string`);
    }
    result[key] = value;
  }

  return result as FeedbackMapping;
}
