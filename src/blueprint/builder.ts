/**
 * BlueprintBuilder — constructs a complete SMBlueprint from a CircuitDefinition.
 *
 * Workflow:
 * 1. SimpleGridPlacer assigns (x,y,z) positions and controller IDs.
 * 2. For each placed component, an SMBlueprintItem is created with the
 *     correct shapeId and controller data (mode, wiring references).
 * 3. Input buttons and output LEDs are added.
 * 4. Optionally, empty grid positions are filled with plastic blocks.
 * 5. Everything is wrapped in an SMBlueprint version-4 envelope.
 */
import type { CircuitDefinition } from "../types/circuit.js";
import type { LogicGateType, GateConfig } from "../types/gate.js";
import type {
  SMBlueprint,
  SMBlueprintItem,
  SMBlueprintBody,
  SMController,
  SMControllerItem,
  BlueprintOptions,
  PlacedComponent,
  SMVector,
} from "../types/blueprint.js";
import { DEFAULT_BP_OPTIONS } from "../types/blueprint.js";
import { GATE_MODE_MAP } from "../types/gate.js";
import {
  SHAPE_IDS,
  DEFAULT_DIRECTIONS,
} from "../core/constants.js";
import { SimpleGridPlacer } from "./placer.js";
import { BlueprintWriter } from "./writer.js";
import { randomUUID } from "node:crypto";

/** Statistics about the generated blueprint */
export interface BlueprintStats {
  readonly gateCount: number;
  readonly timerCount: number;
  readonly bodyCount: number;
  readonly itemCount: number;
  readonly inputCount: number;
  readonly outputCount: number;
}

export class BlueprintBuilder {
  private readonly circuit: CircuitDefinition;
  private readonly options: BlueprintOptions;
  private placements: readonly PlacedComponent[] = [];

  constructor(circuit: CircuitDefinition, options?: Partial<BlueprintOptions>) {
    this.circuit = circuit;
    this.options = { ...DEFAULT_BP_OPTIONS, ...options };
  }

  /**
   * Generate the complete SMBlueprint.
   */
  build(): SMBlueprint {
    // 1. Place components on a grid
    const placer = new SimpleGridPlacer(this.circuit, this.options.gateSpacing);
    const result = placer.place();
    this.placements = result.placements;

    // 2. Build signal → controllerId map for wiring
    const signalToControllerId = buildSignalMap(this.circuit, this.placements);

    // 3. Create blueprint items
    const items: SMBlueprintItem[] = [];

    for (const placement of this.placements) {
      const item = this.createItem(placement, signalToControllerId);
      items.push(item);
    }

    // 4. Fill empty grid positions with plastic blocks
    if (this.options.fillBlocks) {
      const occupied = new Set(
        this.placements.map((p) => posKey(p.position)),
      );
      const fills = generateFillBlocks(this.placements, occupied, this.options.gateSpacing);
      for (const pos of fills) {
        items.push(makePlasticBlock(pos, 0));
      }
    }

    // 5. Wrap in SMBlueprint
    const body: SMBlueprintBody = { childs: items };

    return {
      version: 4,
      name: this.circuit.name,
      blueprintId: randomUUID(),
      bodies: [body],
      joints: [],
      dependencies: [],
    };
  }

  /**
   * Build the blueprint and return as a JSON string.
   */
  toString(): string {
    const blueprint = this.build();
    return BlueprintWriter.writeString(blueprint);
  }

  /**
   * Build the blueprint and write it to a file.
   */
  async writeToFile(filePath: string): Promise<void> {
    const blueprint = this.build();
    await BlueprintWriter.write(blueprint, filePath);
  }

  /**
   * Return summary statistics about the blueprint that would be generated.
   */
  getStats(): BlueprintStats {
    const gateCount = this.circuit.gates.filter(
      (g) => g.type !== "timer",
    ).length;
    const timerCount = this.circuit.gates.filter(
      (g) => g.type === "timer",
    ).length;

    return {
      gateCount,
      timerCount,
      bodyCount: 1,
      itemCount:
        this.circuit.inputs.length +
        this.circuit.outputs.length +
        this.circuit.gates.length,
      inputCount: this.circuit.inputs.length,
      outputCount: this.circuit.outputs.length,
    };
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  private createItem(
    placement: PlacedComponent,
    signalMap: ReadonlyMap<string, number>,
  ): SMBlueprintItem {
    const { childId, position, controllerId } = placement;

    // Check if this placement is an input port
    if (placement.isInput) {
      return this.createInputButton(childId, position, controllerId);
    }

    // Check if this placement is an output port
    if (placement.isOutput) {
      return this.createOutputLED(childId, position, controllerId, signalMap);
    }

    // Otherwise it is a gate
    const gate = this.circuit.gates.find((g) => g.id === childId);
    if (gate === undefined) {
      return makePlasticBlock(position, controllerId);
    }

    return this.createGateItem(gate, position, controllerId, signalMap);
  }

  private createInputButton(
    _gateId: string,
    position: SMVector,
    controllerId: number,
  ): SMBlueprintItem {
    const controller: SMController = {
      id: controllerId,
      active: true,
      controllers: [],
    };

    return {
      pos: position,
      shapeId: SHAPE_IDS.BUTTON,
      xaxis: DEFAULT_DIRECTIONS.X_AXIS,
      zaxis: DEFAULT_DIRECTIONS.Z_AXIS,
      controller,
      joints: [],
    };
  }

  private createOutputLED(
    gateId: string,
    position: SMVector,
    controllerId: number,
    signalMap: ReadonlyMap<string, number>,
  ): SMBlueprintItem {
    const sourceGate = this.circuit.gates.find((g) => g.output === gateId);
    const controllers: SMControllerItem[] = [];

    if (sourceGate !== undefined) {
      const srcCid = signalMap.get(gateId);
      if (srcCid !== undefined) {
        controllers.push({ id: srcCid });
      }
    }

    const controller: SMController = {
      id: controllerId,
      controllers,
    };

    return {
      pos: position,
      shapeId: "020fc24a-61b5-4cf3-bd4f-e876d89bd905", // LED shape ID
      xaxis: DEFAULT_DIRECTIONS.X_AXIS,
      zaxis: DEFAULT_DIRECTIONS.Z_AXIS,
      controller,
      joints: [],
    };
  }

  private createGateItem(
    gate: GateConfig,
    position: SMVector,
    controllerId: number,
    signalMap: ReadonlyMap<string, number>,
  ): SMBlueprintItem {
    const isTimer = gate.type === "timer";
    const shapeId = isTimer ? SHAPE_IDS.TIMER : SHAPE_IDS.LOGIC_GATE;

    const controllers: SMControllerItem[] = [];
    for (const inputSignal of gate.inputs) {
      const srcCid = signalMap.get(inputSignal);
      if (srcCid !== undefined) {
        controllers.push({ id: srcCid });
      }
    }

    const controller: SMController = isTimer
      ? {
          id: controllerId,
          controllers,
          ticks: gate.delay ?? 5,
        }
      : {
          id: controllerId,
          controllers,
          mode: GATE_MODE_MAP[gate.type as LogicGateType],
        };

    return {
      pos: position,
      shapeId,
      xaxis: DEFAULT_DIRECTIONS.X_AXIS,
      zaxis: DEFAULT_DIRECTIONS.Z_AXIS,
      controller,
      joints: [],
    };
  }
}

// ---------------------------------------------------------------------------
// Module-private helpers
// ---------------------------------------------------------------------------

function buildSignalMap(
  circuit: CircuitDefinition,
  placements: readonly PlacedComponent[],
): ReadonlyMap<string, number> {
  const map = new Map<string, number>();

  for (const p of placements) {
    // Input ports: map by name
    if (p.isInput) {
      map.set(p.childId, p.controllerId);
    }
  }

  for (const gate of circuit.gates) {
    const p = placements.find((pl) => pl.childId === gate.id);
    if (p !== undefined) {
      map.set(gate.output, p.controllerId);
    }
  }

  if (circuit.feedback !== undefined) {
    for (const [sourceOutput, targetInput] of Object.entries(circuit.feedback)) {
      const srcCid = map.get(sourceOutput);
      if (srcCid !== undefined) {
        map.set(targetInput, srcCid);
      }
    }
  }

  return map;
}

function posKey(pos: SMVector): string {
  return `${pos.x},${pos.y},${pos.z}`;
}

function generateFillBlocks(
  placements: readonly PlacedComponent[],
  occupied: ReadonlySet<string>,
  spacing: number,
): SMVector[] {
  if (placements.length === 0) return [];

  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;

  for (const p of placements) {
    if (p.position.x < minX) minX = p.position.x;
    if (p.position.x > maxX) maxX = p.position.x;
    if (p.position.z < minZ) minZ = p.position.z;
    if (p.position.z > maxZ) maxZ = p.position.z;
  }

  const fills: SMVector[] = [];
  for (let x = minX; x <= maxX; x += spacing) {
    for (let z = minZ; z <= maxZ; z += spacing) {
      const key = `${x},0,${z}`;
      if (!occupied.has(key)) {
        fills.push({ x, y: 0, z });
      }
    }
  }

  return fills;
}

function makePlasticBlock(position: SMVector, controllerId: number): SMBlueprintItem {
  const controller: SMController = {
    id: controllerId,
    controllers: [],
  };

  return {
    pos: position,
    shapeId: SHAPE_IDS.PLASTIC_BLOCK,
    xaxis: DEFAULT_DIRECTIONS.X_AXIS,
    zaxis: DEFAULT_DIRECTIONS.Z_AXIS,
    controller,
    joints: [],
  };
}