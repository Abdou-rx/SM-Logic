/**
 * Pre-built subcircuit library for Scrap Mechanic.
 *
 * Each subcircuit is defined with its gate-level implementation,
 * matching the patterns documented in the SM Logic Gate reference.
 */

import { circuit, CircuitBuilder } from "./circuit-builder.js";
import type { CircuitDefinition } from "../types/circuit.js";

/** Subcircuit metadata */
export interface SubcircuitInfo {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly gateCount: number;
  readonly category: "primitive" | "memory" | "timing" | "arithmetic" | "utility";
  readonly build: () => CircuitDefinition;
}

// ---------------------------------------------------------------------------
// Convenience creator functions (return CircuitDefinition directly)
// ---------------------------------------------------------------------------

export function createNotGate(): CircuitDefinition {
  return circuit("not")
    .description("NOT gate using NAND")
    .input("IN")
    .output("OUT")
    .gate("nand1", "nand", ["IN", "IN"], "OUT")
    .build();
}

export function createBuffer(): CircuitDefinition {
  return circuit("buffer")
    .description("Buffer gate with 1-tick delay")
    .input("IN")
    .output("OUT")
    .gate("and1", "and", ["IN", "IN"], "OUT")
    .build();
}

export function createHalfAdder(): CircuitDefinition {
  return circuit("half_adder")
    .description("1-bit half adder")
    .input("A")
    .input("B")
    .output("Sum")
    .output("Carry")
    .gate("xor1", "xor", ["A", "B"], "Sum")
    .gate("and1", "and", ["A", "B"], "Carry")
    .build();
}

export function createFullAdder(): CircuitDefinition {
  return circuit("full_adder")
    .description("1-bit full adder")
    .input("A")
    .input("B")
    .input("Cin")
    .output("Sum")
    .output("Cout")
    .gate("xor1", "xor", ["A", "B"], "axb")
    .gate("xor2", "xor", ["axb", "Cin"], "Sum")
    .gate("and1", "and", ["A", "B"], "ab")
    .gate("and2", "and", ["axb", "Cin"], "axb_cin")
    .gate("or1", "or", ["ab", "axb_cin"], "Cout")
    .build();
}

export function createSRLatch(): CircuitDefinition {
  return circuit("sr_latch")
    .description("SR latch using cross-coupled NOR gates")
    .input("SET")
    .input("RESET")
    .output("Q")
    .output("Q_bar")
    .gate("nor1", "nor", ["RESET", "Q_bar"], "Q")
    .gate("nor2", "nor", ["SET", "Q"], "Q_bar")
    .build();
}

export function createDelayLine(ticks: number = 5): CircuitDefinition {
  const builder = circuit("delay_line")
    .description(`${ticks}-tick delay line`)
    .input("IN")
    .output("OUT");

  let prev = "IN";
  for (let i = 0; i < ticks; i++) {
    const next = i === ticks - 1 ? "OUT" : `s${i + 1}`;
    builder.gate(`buf${i + 1}`, "and", [prev, prev], next);
    prev = next;
  }

  return builder.build();
}

export function createPulseGenerator(_delay?: number): CircuitDefinition {
  return circuit("pulse_gen")
    .description("Rising-edge pulse generator")
    .input("IN")
    .output("PULSE")
    .timer("t1", 1, "IN", "delayed_in")
    .gate("xor1", "xor", ["IN", "delayed_in"], "PULSE")
    .build();
}

// ---------------------------------------------------------------------------
// Library query functions
// ---------------------------------------------------------------------------

/** Get the complete library of available subcircuits */
export function getSubcircuitLibrary(): readonly SubcircuitInfo[] {
  return Object.freeze(LIBRARY);
}

/** Get a list of available subcircuit IDs */
export function getAvailableSubcircuits(): string[] {
  return LIBRARY.map((s) => s.id);
}

/** Get a subcircuit by its ID. Returns the CircuitDefinition (built). */
export function getSubcircuit(id: string): CircuitDefinition {
  const entry = LIBRARY.find((s) => s.id === id);
  if (entry === undefined) {
    throw new Error(`Unknown subcircuit: "${id}". Available: ${LIBRARY.map((s) => s.id).join(", ")}`);
  }
  return entry.build();
}

// ---------------------------------------------------------------------------
// JSON serialization helpers
// ---------------------------------------------------------------------------

/** Serialize a CircuitDefinition to a JSON string */
export function circuitToJson(circuit: CircuitDefinition): string {
  return JSON.stringify(circuit, null, 2);
}

/** Deserialize a CircuitDefinition from a JSON string */
export function circuitFromJson(json: string): CircuitDefinition {
  const parsed = JSON.parse(json) as CircuitDefinition;
  // Basic structural validation
  if (typeof parsed.name !== "string" || !Array.isArray(parsed.inputs) || !Array.isArray(parsed.gates)) {
    throw new Error("Invalid circuit JSON: missing required fields (name, inputs, gates)");
  }
  return parsed;
}

// ---------------------------------------------------------------------------
// Internal library definition
// ---------------------------------------------------------------------------

const LIBRARY: readonly SubcircuitInfo[] = Object.freeze([
  {
    id: "not",
    name: "NOT (Inverter)",
    description: "Inverts input using NAND with both inputs tied. 1 gate. 1-tick delay.",
    gateCount: 1,
    category: "primitive",
    build: createNotGate,
  },
  {
    id: "buffer",
    name: "Buffer (1-tick delay)",
    description: "Copies input to output with 1-tick delay. Uses AND with one constant-ON input.",
    gateCount: 1,
    category: "primitive",
    build: createBuffer,
  },
  {
    id: "sr-latch",
    name: "SR Latch (Set-Reset)",
    description: "Cross-coupled NOR gates. SET=1 → Q=1, RESET=1 → Q=0.",
    gateCount: 2,
    category: "memory",
    build: createSRLatch,
  },
  {
    id: "t-flipflop",
    name: "T Flip-Flop (Toggle)",
    description: "Toggle flip-flop: each pulse on T toggles Q. Uses XOR storage loop.",
    gateCount: 6,
    category: "memory",
    build: () =>
      circuit("t_flipflop")
        .description("T flip-flop (toggle)")
        .input("T")
        .output("Q")
        .gate("or1", "or", ["T"], "or1_out")
        .gate("nand1", "nand", ["or1_out"], "nand1_out")
        .gate("and1", "and", ["nand1_out"], "and1_out")
        .gate("xor1", "xor", ["and1_out", "xor3_out"], "xor1_out")
        .gate("xor2", "xor", ["xor1_out", "and1_out"], "xor2_out")
        .gate("xor3", "xor", ["xor2_out", "and1_out"], "xor3_out")
        .gate("nor1", "nor", ["xor1_out"], "Q")
        .feedback({ xor1_out: "xor3_out" })
        .build(),
  },
  {
    id: "d-flipflop",
    name: "D Flip-Flop (Edge-Triggered)",
    description: "Edge-triggered D flip-flop with data input D and clock CLK.",
    gateCount: 6,
    category: "memory",
    build: () =>
      circuit("d_flipflop")
        .description("D flip-flop (edge-triggered)")
        .input("D")
        .input("CLK")
        .output("Q")
        .gate("cinv", "nor", ["CLK"], "clk_inv")
        .gate("filt", "and", ["CLK", "clk_inv"], "clk_pulse")
        .gate("xlp0", "xor", ["d_mux", "xlp2_out"], "xlp0_out")
        .gate("xlp1", "xor", ["xlp0_out", "d_mux"], "xlp1_out")
        .gate("xlp2", "xor", ["xlp1_out", "d_mux"], "xlp2_out")
        .gate("diff", "xor", ["D", "xlp0_out"], "d_mux")
        .feedback({ xlp0_out: "xlp2_out", xlp1_out: "d_mux" })
        .build(),
  },
  {
    id: "clock",
    name: "Repeating Timer / Clock",
    description: "Continuous clock oscillator: Timer + AND + NOR in triangle loop.",
    gateCount: 3,
    category: "timing",
    build: () =>
      circuit("clock")
        .description("Repeating timer clock oscillator")
        .input("ENABLE")
        .output("CLK")
        .timer("t1", 10, "and1_out", "t1_out")
        .gate("and1", "and", ["ENABLE", "t1_out"], "and1_out")
        .gate("nor1", "nor", ["and1_out"], "nor1_out")
        .feedback({ and1_out: "t1_input", nor1_out: "t1_input" })
        .build(),
  },
  {
    id: "pulse-generator",
    name: "Pulse Generator (Rising Edge)",
    description: "Generates a 1-tick pulse on the rising edge of input.",
    gateCount: 2,
    category: "timing",
    build: () => createPulseGenerator(),
  },
  {
    id: "delay-line",
    name: "Delay Line (N ticks)",
    description: "Delays input signal by N ticks using a chain of buffers.",
    gateCount: 5,
    category: "timing",
    build: () => createDelayLine(5),
  },
  {
    id: "half-adder",
    name: "Half Adder",
    description: "1-bit half adder: Sum = A XOR B, Carry = A AND B. 2 gates.",
    gateCount: 2,
    category: "arithmetic",
    build: createHalfAdder,
  },
  {
    id: "full-adder",
    name: "Full Adder",
    description: "1-bit full adder with carry in: Sum = A XOR B XOR Cin. 5 gates.",
    gateCount: 5,
    category: "arithmetic",
    build: createFullAdder,
  },
]);