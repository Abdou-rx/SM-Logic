/**
 * Pre-built subcircuit library for Scrap Mechanic.
 *
 * Each subcircuit is defined with its gate-level implementation,
 * matching the patterns documented in the SM Logic Gate reference.
 */

import { circuit } from "./circuit-builder.js";
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

/** Get the complete library of available subcircuits */
export function getSubcircuitLibrary(): readonly SubcircuitInfo[] {
  return Object.freeze([
    SUBCIRCUIT_NOT,
    SUBCIRCUIT_BUFFER,
    SUBCIRCUIT_SR_LATCH,
    SUBCIRCUIT_T_FLIPFLOP,
    SUBCIRCUIT_D_FLIPFLOP,
    SUBCIRCUIT_CLOCK,
    SUBCIRCUIT_PULSE_GENERATOR,
    SUBCIRCUIT_DELAY_LINE,
    SUBCIRCUIT_HALF_ADDER,
    SUBCIRCUIT_FULL_ADDER,
  ]);
}

/** Get a subcircuit by its ID */
export function getSubcircuit(id: string): SubcircuitInfo | undefined {
  return getSubcircuitLibrary().find((s) => s.id === id);
}

// --- Primitive Gates ---

const SUBCIRCUIT_NOT: SubcircuitInfo = {
  id: "not",
  name: "NOT (Inverter)",
  description:
    "Inverts input using NAND with both inputs tied. 1 gate. 1-tick delay.",
  gateCount: 1,
  category: "primitive",
  build: () =>
    circuit("not")
      .description("NOT gate using NAND")
      .input("IN")
      .output("OUT")
      .gate("nand1", "nand", ["IN", "IN"], "OUT")
      .build(),
};

const SUBCIRCUIT_BUFFER: SubcircuitInfo = {
  id: "buffer",
  name: "Buffer (1-tick delay)",
  description:
    "Copies input to output with 1-tick delay. Uses AND with one constant-ON input.",
  gateCount: 1,
  category: "primitive",
  build: () =>
    circuit("buffer")
      .description("Buffer gate with 1-tick delay")
      .input("IN")
      .output("OUT")
      .gate("and1", "and", ["IN", "IN"], "OUT")
      .build(),
};

// --- Memory Elements ---

const SUBCIRCUIT_SR_LATCH: SubcircuitInfo = {
  id: "sr-latch",
  name: "SR Latch (Set-Reset)",
  description:
    "4-gate SR latch: 2 NOR cross-coupled + 2 AND for output shaping. " +
    "SM-specific design (real SR only needs 2 NOR). Toggle: SET turns ON, RESET turns OFF.",
  gateCount: 4,
  category: "memory",
  build: () =>
    circuit("sr_latch")
      .description("SR latch (4-gate SM variant)")
      .input("SET")
      .input("RESET")
      .output("Q")
      .output("Q_bar")
      .gate("nor1", "nor", ["SET", "Q_bar_fb"], "Q")
      .gate("nor2", "nor", ["RESET", "Q"], "Q_bar")
      .gate("and1", "and", ["Q"], "Q_bar_fb")
      .gate("and2", "and", ["Q_bar"], "Q_fb")
      .feedback({ Q: "Q_fb", Q_bar: "Q_bar_fb" })
      .build(),
};

const SUBCIRCUIT_T_FLIPFLOP: SubcircuitInfo = {
  id: "t-flipflop",
  name: "T Flip-Flop (Toggle)",
  description:
    "Toggle flip-flop: each pulse on T toggles Q. Uses 3 XOR + 1 AND + 1 NOR + 1 OR. " +
    "Resistant to common SM timing issues.",
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
};

const SUBCIRCUIT_D_FLIPFLOP: SubcircuitInfo = {
  id: "d-flipflop",
  name: "D Flip-Flop (Edge-Triggered)",
  description:
    "Edge-triggered D flip-flop with data input D and clock CLK. " +
    "Stores D value on rising edge of CLK. 6 gates using XOR storage loop.",
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
};

// --- Timing Circuits ---

const SUBCIRCUIT_CLOCK: SubcircuitInfo = {
  id: "clock",
  name: "Repeating Timer / Clock",
  description:
    "Continuous clock oscillator: Timer + AND + NOR in triangle loop. " +
    "Generates periodic on/off oscillation for sequential circuits.",
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
};

const SUBCIRCUIT_PULSE_GENERATOR: SubcircuitInfo = {
  id: "pulse-generator",
  name: "Pulse Generator (Rising Edge)",
  description:
    "Generates a 1-tick pulse on the rising edge of input. " +
    "Uses XOR + Timer for edge detection.",
  gateCount: 2,
  category: "timing",
  build: () =>
    circuit("pulse_gen")
      .description("Rising-edge pulse generator")
      .input("IN")
      .output("PULSE")
      .timer("t1", 1, "IN", "delayed_in")
      .gate("xor1", "xor", ["IN", "delayed_in"], "PULSE")
      .build(),
};

const SUBCIRCUIT_DELAY_LINE: SubcircuitInfo = {
  id: "delay-line",
  name: "Delay Line (N ticks)",
  description:
    "Delays input signal by N ticks using a chain of buffers. " +
    "This template uses 5 ticks. Modify delay count as needed.",
  gateCount: 5,
  category: "timing",
  build: () =>
    circuit("delay_line")
      .description("5-tick delay line")
      .input("IN")
      .output("OUT")
      .gate("buf1", "and", ["IN", "IN"], "s1")
      .gate("buf2", "and", ["s1", "s1"], "s2")
      .gate("buf3", "and", ["s2", "s2"], "s3")
      .gate("buf4", "and", ["s3", "s3"], "s4")
      .gate("buf5", "and", ["s4", "s4"], "OUT")
      .build(),
};

// --- Arithmetic ---

const SUBCIRCUIT_HALF_ADDER: SubcircuitInfo = {
  id: "half-adder",
  name: "Half Adder",
  description:
    "1-bit half adder: Sum = A XOR B, Carry = A AND B. 2 gates.",
  gateCount: 2,
  category: "arithmetic",
  build: () =>
    circuit("half_adder")
      .description("1-bit half adder")
      .input("A")
      .input("B")
      .output("Sum")
      .output("Carry")
      .gate("xor1", "xor", ["A", "B"], "Sum")
      .gate("and1", "and", ["A", "B"], "Carry")
      .build(),
};

const SUBCIRCUIT_FULL_ADDER: SubcircuitInfo = {
  id: "full-adder",
  name: "Full Adder",
  description:
    "1-bit full adder with carry in: Sum = A XOR B XOR Cin, Cout = (A AND B) OR (Cin AND (A XOR B)). 5 gates.",
  gateCount: 5,
  category: "arithmetic",
  build: () =>
    circuit("full_adder")
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
      .build(),
};
