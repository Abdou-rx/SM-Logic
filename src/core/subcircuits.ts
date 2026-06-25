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

export function createPulseGenerator(delay?: number): CircuitDefinition {
  const d = delay ?? 1;
  return circuit("pulse_gen")
    .description(`Rising-edge pulse generator (timer delay=${d})`)
    .input("IN")
    .output("PULSE")
    .timer("t1", d, "IN", "IN_d")
    .gate("not_d", "nand", ["IN_d", "IN_d"], "IN_d_bar")
    .gate("rise", "and", ["IN", "IN_d_bar"], "PULSE")
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
    description: "Toggle flip-flop: Q toggles on each rising edge of T. Uses timer-based edge detection and XOR toggle with feedback. Connect T to a clock source (alternating 0/1 signal). Cold start: Q=0.",
    gateCount: 4,
    category: "memory",
    build: () =>
      circuit("t_flipflop")
        .description("T flip-flop: Q toggles on each rising edge of T (clock input)")
        .input("T")
        .output("Q")
        .timer("t_del", 1, "T", "T_d")
        .gate("not_td", "nand", ["T_d", "T_d"], "T_d_bar")
        .gate("pulse", "and", ["T", "T_d_bar"], "edge")
        .gate("toggle", "xor", ["Q_fb", "edge"], "Q")
        .feedback({ Q: "Q_fb" })
        .build(),
  },
  {
    id: "d-flipflop",
    name: "D Flip-Flop (Edge-Triggered)",
    description: "Edge-triggered D flip-flop: Q captures D on rising CLK edge, holds otherwise. Uses timer-based edge detection, MUX (AND/OR), and timer storage element. Cold start: Q=0.",
    gateCount: 7,
    category: "memory",
    build: () =>
      circuit("d_flipflop")
        .description("D flip-flop: Q captures D on rising edge of CLK")
        .input("D")
        .input("CLK")
        .output("Q")
        .timer("clk_del", 1, "CLK", "clk_d")
        .gate("not_cd", "nand", ["clk_d", "clk_d"], "clk_d_bar")
        .gate("edge", "and", ["CLK", "clk_d_bar"], "clk_rise")
        .gate("not_edge", "nand", ["clk_rise", "clk_rise"], "clk_rise_bar")
        .gate("d_gate", "and", ["D", "clk_rise"], "d_pass")
        .gate("q_gate", "and", ["Q", "clk_rise_bar"], "q_hold")
        .gate("mux", "or", ["d_pass", "q_hold"], "q_next")
        .timer("q_store", 1, "q_next", "Q")
        .build(),
  },
  {
    id: "clock",
    name: "NOR Oscillator / Clock",
    description: "Simple NOR gate self-oscillator. ENABLE=0 runs at 50% duty cycle (period 2 ticks). ENABLE=1 stops clock (CLK held LOW). 1 gate.",
    gateCount: 1,
    category: "timing",
    build: () =>
      circuit("clock")
        .description("NOR self-oscillator clock")
        .input("ENABLE")
        .output("CLK")
        .gate("osc", "nor", ["CLK_fb", "ENABLE"], "CLK")
        .feedback({ CLK: "CLK_fb" })
        .build(),
  },
  {
    id: "pulse-generator",
    name: "Pulse Generator (Rising Edge)",
    description: "Generates a pulse on the rising edge of input using timer-based edge detection.",
    gateCount: 3,
    category: "timing",
    build: () => createPulseGenerator(1),
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