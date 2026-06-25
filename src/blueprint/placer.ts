/**
 * SimpleGridPlacer assigns 3D grid positions to circuit components.
 *
 * Layout strategy:
 *   Column 0      : Input buttons (z = 0, 1, 2, ...)
 *   Column 1..N   : Logic gates (all at z = 0, spaced along x)
 *   Column N+1    : Output blocks (z = 0, 1, 2, ...)
 *
 * Controller IDs are assigned sequentially starting from 1.
 */
import type { CircuitDefinition } from "../types/circuit.js";
import type { SMVector } from "../types/blueprint.js";

const FIRST_CONTROLLER_ID = 1;

/** A single placed component with test-friendly metadata */
export interface PlacedComponent {
  readonly childId: string;
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly isInput: boolean;
  readonly isOutput: boolean;
  readonly controllerId: number;
  readonly position: SMVector;
}

/** Result of placing all components */
export interface PlacementResult {
  readonly placements: readonly PlacedComponent[];
}

function makeVec(x: number, y: number, z: number): SMVector {
  return { x, y, z };
}

export class SimpleGridPlacer {
  private readonly circuit: CircuitDefinition;
  private readonly spacing: number;
  private nextControllerId: number;

  constructor(circuit: CircuitDefinition, spacing: number = 1) {
    this.circuit = circuit;
    this.spacing = spacing;
    this.nextControllerId = FIRST_CONTROLLER_ID;
  }

  /**
   * Assign (x, y, z) positions and controller IDs to every input, gate, and output.
   */
  place(): PlacementResult {
    const placements: PlacedComponent[] = [];

    // Column 0: input buttons
    for (let i = 0; i < this.circuit.inputs.length; i++) {
      const name = this.circuit.inputs[i]!;
      const cid = this.nextControllerId++;
      placements.push({
        childId: name,
        x: 0,
        y: 0,
        z: i * this.spacing,
        isInput: true,
        isOutput: false,
        controllerId: cid,
        position: makeVec(0, 0, i * this.spacing),
      });
    }

    // Columns 1..N: logic gates
    for (let i = 0; i < this.circuit.gates.length; i++) {
      const gate = this.circuit.gates[i]!;
      const cid = this.nextControllerId++;
      const x = (i + 1) * this.spacing;
      placements.push({
        childId: gate.id,
        x,
        y: 0,
        z: 0,
        isInput: false,
        isOutput: false,
        controllerId: cid,
        position: makeVec(x, 0, 0),
      });
    }

    // Column N+1: output blocks
    const outputColumnX = (this.circuit.gates.length + 1) * this.spacing;
    for (let i = 0; i < this.circuit.outputs.length; i++) {
      const name = this.circuit.outputs[i]!;
      const cid = this.nextControllerId++;
      placements.push({
        childId: name,
        x: outputColumnX,
        y: 0,
        z: i * this.spacing,
        isInput: false,
        isOutput: true,
        controllerId: cid,
        position: makeVec(outputColumnX, 0, i * this.spacing),
      });
    }

    return { placements: Object.freeze(placements) };
  }
}

/** Backward-compatible alias */
export const Placer = SimpleGridPlacer;