/**
 * Circuit builder with a fluent API for programmatic circuit construction.
 */

import type {
  CircuitDefinition,
  FeedbackMapping,
  GateConfig,
} from "../types/circuit.js";
import type { LogicGateType } from "../types/gate.js";

/** Mutable builder for circuit definitions */
export class CircuitBuilder {
  private readonly _name: string;
  private _description: string;
  private _version: string;
  private readonly _inputs: string[];
  private readonly _outputs: string[];
  private readonly _gates: GateConfig[];
  private _feedback: FeedbackMapping;
  private _gateCounter: number;

  constructor(name: string) {
    this._name = name;
    this._description = "";
    this._version = "1.0.0";
    this._inputs = [];
    this._outputs = [];
    this._gates = [];
    this._feedback = {};
    this._gateCounter = 0;
  }

  /** Set circuit description */
  description(desc: string): CircuitBuilder {
    this._description = desc;
    return this;
  }

  /** Set circuit version */
  version(ver: string): CircuitBuilder {
    this._version = ver;
    return this;
  }

  /** Add a named input port */
  input(name: string): CircuitBuilder {
    if (this._inputs.includes(name)) {
      throw new Error(`Duplicate input name: "${name}"`);
    }
    this._inputs.push(name);
    return this;
  }

  /** Add a named output port */
  output(name: string): CircuitBuilder {
    if (this._outputs.includes(name)) {
      throw new Error(`Duplicate output name: "${name}"`);
    }
    this._outputs.push(name);
    return this;
  }

  /** Add a logic gate */
  gate(
    id: string,
    type: LogicGateType,
    inputs: readonly string[],
    output: string,
    description?: string,
  ): CircuitBuilder {
    if (this._gates.some((g) => g.id === id)) {
      throw new Error(`Duplicate gate ID: "${id}"`);
    }
    this._gates.push({
      id,
      type,
      inputs: [...inputs],
      output,
      description,
    });
    return this;
  }

  /** Add a timer gate */
  timer(id: string, delay: number, input: string, output: string): CircuitBuilder {
    if (delay < 1 || delay > 30) {
      throw new Error(`Timer delay must be between 1 and 30 ticks, got ${delay}`);
    }
    if (this._gates.some((g) => g.id === id)) {
      throw new Error(`Duplicate gate ID: "${id}"`);
    }
    this._gates.push({
      id,
      type: "timer",
      inputs: [input],
      output,
      delay,
    });
    return this;
  }

  /** Add a gate with auto-generated ID */
  autoGate(
    type: LogicGateType,
    inputs: readonly string[],
    output: string,
  ): CircuitBuilder {
    const id = `${type}_${this._gateCounter++}`;
    return this.gate(id, type, inputs, output);
  }

  /** Declare feedback connections for sequential circuits */
  feedback(mapping: FeedbackMapping): CircuitBuilder {
    this._feedback = { ...mapping };
    return this;
  }

  /** Add a single feedback connection */
  addFeedback(sourceOutput: string, targetInput: string): CircuitBuilder {
    this._feedback = { ...this._feedback, [sourceOutput]: targetInput };
    return this;
  }

  /** Build the final circuit definition */
  build(): CircuitDefinition {
    if (this._inputs.length === 0) {
      throw new Error(`Circuit "${this._name}" must have at least one input`);
    }

    // Validate all outputs are produced by at least one gate
    const gateOutputs = new Set(this._gates.map((g) => g.output));
    for (const outName of this._outputs) {
      if (!gateOutputs.has(outName)) {
        throw new Error(
          `Output "${outName}" is not produced by any gate in circuit "${this._name}"`,
        );
      }
    }

    // Validate all gate inputs reference known signals
    const knownSignals = new Set([
      ...this._inputs,
      ...this._outputs,
      ...Object.values(this._feedback),
      ...this._gates.map((g) => g.output),
    ]);

    for (const gate of this._gates) {
      for (const input of gate.inputs) {
        if (!knownSignals.has(input)) {
          throw new Error(
            `Gate "${gate.id}" references unknown input signal "${input}" in circuit "${this._name}"`,
          );
        }
      }
    }

    return Object.freeze({
      name: this._name,
      description: this._description,
      version: this._version,
      inputs: Object.freeze([...this._inputs]),
      outputs: Object.freeze([...this._outputs]),
      gates: Object.freeze([...this._gates]),
      feedback: Object.keys(this._feedback).length > 0
        ? Object.freeze({ ...this._feedback })
        : undefined,
    });
  }
}

/** Convenience: create a builder with a name */
export function circuit(name: string): CircuitBuilder {
  return new CircuitBuilder(name);
}