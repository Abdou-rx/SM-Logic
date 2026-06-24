/**
 * SimpleGridPlacer assigns 3D grid positions to circuit components.
 *
 * Layout strategy:
 *   Column 0      : Input buttons (z = 0, 1, 2, ...)
 *   Column 1..N   : Logic gates (all at z = 0, spaced along x)
 *   Column N+1    : Output plastic blocks (z = 0, 1, 2, ...)
 *
 * Controller IDs are assigned sequentially starting from 1.
 */
import type { CircuitDefinition } from "../types/circuit.js";
import type { GatePlacement, SMVector } from "../types/blueprint.js";

const FIRST_CONTROLLER_ID = 1;

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
  place(): GatePlacement[] {
    const placements: GatePlacement[] = [];

    // Column 0: input buttons
    for (let i = 0; i < this.circuit.inputs.length; i++) {
      const name = this.circuit.inputs[i]!;
      placements.push({
        gateId: name,
        position: makeVec(0, 0, i * this.spacing),
        controllerId: this.nextControllerId++,
      });
    }

    // Columns 1..N: logic gates
    for (let i = 0; i < this.circuit.gates.length; i++) {
      const gate = this.circuit.gates[i]!;
      placements.push({
        gateId: gate.id,
        position: makeVec((i + 1) * this.spacing, 0, 0),
        controllerId: this.nextControllerId++,
      });
    }

    // Column N+1: output blocks
    const outputColumnX = (this.circuit.gates.length + 1) * this.spacing;
    for (let i = 0; i < this.circuit.outputs.length; i++) {
      const name = this.circuit.outputs[i]!;
      placements.push({
        gateId: name,
        position: makeVec(outputColumnX, 0, i * this.spacing),
        controllerId: this.nextControllerId++,
      });
    }

    return placements;
  }
}

/** Helper to create an SMVector */
function makeVec(x: number, y: number, z: number): SMVector {
  return { x, y, z };
}
