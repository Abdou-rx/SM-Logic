/**
 * Test and iterate on T flip-flop designs for SM-accurate behavior.
 */
import { SimulationEngine } from "../src/simulator/engine.js";
import { readFileSync } from "node:fs";

function loadCircuit(path: string) {
  return JSON.parse(readFileSync(path, "utf-8"));
}

// ============================================================
// Design A: Timer-based edge detection + NOR SR latch
// T input is a CLOCK signal (user sends pulses like 0,1,0,1,...)
// ============================================================
const designA = {
  name: "t_flipflop_a",
  description: "T flip-flop: Q toggles on each rising edge of T (clock). Uses timer for edge detection and NOR SR latch for storage.",
  version: "3.0.0",
  inputs: ["T"],
  outputs: ["Q"],
  gates: [
    // Edge detection: timer delays T by 1 tick
    { id: "t_del", type: "timer", delay: 1, inputs: ["T"], output: "T_d" },
    { id: "not_td", type: "nand", inputs: ["T_d", "T_d"], output: "T_d_bar" },
    { id: "rising", type: "and", inputs: ["T", "T_d_bar"], output: "pulse" },
    // Toggle logic
    { id: "not_q", type: "nand", inputs: ["Q", "Q"], output: "Q_inv" },
    { id: "set_g", type: "and", inputs: ["pulse", "Q_inv"], output: "S" },
    { id: "rst_g", type: "and", inputs: ["pulse", "Q"], output: "R" },
    // SR latch
    { id: "nor1", type: "nor", inputs: ["R", "Q_bar"], output: "Q" },
    { id: "nor2", type: "nor", inputs: ["S", "Q"], output: "Q_bar" }
  ]
};

// ============================================================
// Design B: Self-oscillating T-FF (internal clock, T is enable)
// When T=1, internal oscillator runs and Q toggles on each clock edge
// ============================================================
const designB = {
  name: "t_flipflop_b",
  description: "Self-oscillating T flip-flop: Q toggles repeatedly while T is held high. Internal NOT+timer oscillator generates clock pulses, gated by T.",
  version: "3.0.0",
  inputs: ["T"],
  outputs: ["Q", "CLK"],
  gates: [
    // Internal oscillator: NOT(osc) → timer → osc
    { id: "osc_not", type: "nand", inputs: ["osc", "osc"], output: "osc_inv" },
    { id: "osc_tmr", type: "timer", delay: 2, inputs: ["osc_inv"], output: "osc" },
    // Gated clock
    { id: "gclk", type: "and", inputs: ["T", "osc"], output: "CLK" },
    // Edge detection on CLK
    { id: "clk_d", type: "timer", delay: 1, inputs: ["CLK"], output: "CLK_d" },
    { id: "not_cd", type: "nand", inputs: ["CLK_d", "CLK_d"], output: "CLK_d_bar" },
    { id: "rise", type: "and", inputs: ["CLK", "CLK_d_bar"], output: "pulse" },
    // Toggle logic
    { id: "nq", type: "nand", inputs: ["Q", "Q"], output: "Qi" },
    { id: "sg", type: "and", inputs: ["pulse", "Qi"], output: "S" },
    { id: "rg", type: "and", inputs: ["pulse", "Q"], output: "R" },
    // SR latch
    { id: "n1", type: "nor", inputs: ["R", "Qb"], output: "Q" },
    { id: "n2", type: "nor", inputs: ["S", "Q"], output: "Qb" }
  ]
};

// ============================================================
// Design C: Minimal - T-FF with explicit feedback (like original but with timer)
// Timer delays T by 1 tick for edge detection, XOR for toggle
// ============================================================
const designC = {
  name: "t_flipflop_c",
  description: "Minimal T flip-flop using timer-based edge detection and XOR toggle with explicit feedback.",
  version: "3.0.0",
  inputs: ["T"],
  outputs: ["Q"],
  gates: [
    { id: "t_del", type: "timer", delay: 1, inputs: ["T"], output: "T_d" },
    { id: "not_td", type: "nand", inputs: ["T_d", "T_d"], output: "T_d_bar" },
    { id: "rising", type: "and", inputs: ["T", "T_d_bar"], output: "pulse" },
    { id: "toggle", type: "xor", inputs: ["Q_fb", "pulse"], output: "Q" }
  ],
  feedback: {
    "Q": "Q_fb"
  }
};

function testCircuit(name: string, circuit: any, scenarios: Array<{label: string, ticks: Array<{setInputs?: Record<string,boolean>, expect?: string}>}>) {
  console.log(`\n${"=".repeat(60)}`);
  console.log(`=== ${name} ===`);
  console.log(`${"=".repeat(60)}`);
  
  try {
    const engine = new SimulationEngine(circuit, { recordWaveform: true });
    let allPassed = true;
    const qHistory: boolean[] = [];
    
    for (const scenario of scenarios) {
      console.log(`\n--- ${scenario.label} ---`);
      for (const step of scenario.ticks) {
        if (step.setInputs) {
          for (const [k, v] of Object.entries(step.setInputs)) {
            engine.setInput(k, v);
          }
        }
        const result = engine.tick();
        const q = result.outputStates.Q;
        qHistory.push(q);
        
        const inputs = Object.entries(result.inputStates).map(([k,v]) => `${k}=${v?1:0}`).join(",");
        const outputs = Object.entries(result.outputStates).map(([k,v]) => `${k}=${v?1:0}`).join(",");
        const internals = Array.from((result as any).internalSignals?.entries() ?? [])
          .filter(([k]) => ["pulse","S","R","Q_bar","Qb","CLK","osc","T_d","T_d_bar","CLK_d","CLK_d_bar","Q_inv","Qi","Q_fb","osc_inv","osc_not_out","rising","rise","set_g","rst_g","sg","rg","nq"].includes(k))
          .map(([k,v]) => `${k}=${v?1:0}`).join(", ");
        
        let line = `  Tick ${String(result.tick).padStart(2)}: [${inputs}] → [${outputs}]`;
        if (internals) line += `  (${internals})`;
        if (step.expect) line += `  ${q === (step.expect === "1") ? "✓" : "✗ EXPECT "+step.expect}`;
        console.log(line);
        
        if (step.expect !== undefined && q !== (step.expect === "1")) {
          allPassed = false;
        }
      }
    }
    
    console.log(`\nQ history: [${qHistory.map(v=>v?1:0).join(", ")}]`);
    console.log(`Overall: ${allPassed ? "ALL PASSED ✓" : "SOME FAILED ✗"}`);
    return allPassed;
  } catch (e: any) {
    console.error(`ERROR: ${e.message}`);
    if (e.stack) console.error(e.stack);
    return false;
  }
}

// ============================================================
// Test the broken original T-FF
// ============================================================
console.log("Testing CURRENT (broken) T-FF:");
const brokenTFF = loadCircuit("/home/z/my-project/sm-logic-push/examples/t-flipflop.sm-circuit.json");
testCircuit("Current T-FF (broken)", brokenTFF, [
  {
    label: "T=1 held high for 10 ticks",
    ticks: Array(10).fill(null).map((_, i) => ({
      setInputs: { T: true },
      expect: i === 1 ? "1" : (i > 1 ? "FAIL" : undefined) // should toggle once at tick 1
    }))
  }
]);

// ============================================================
// Test Design A: Clock-driven T-FF with NOR SR latch
// ============================================================
// Scenario: Send clock pulses (T alternates 0,1,0,1,...)
testCircuit("Design A: Timer edge-detect + NOR SR latch (clock pulses)", designA, [
  {
    label: "Clock pulses: T=0,1,0,1,0,1,0,1 (4 rising edges)",
    ticks: [
      { setInputs: { T: false } },          // tick 0: T=0, no edge
      { setInputs: { T: true }, expect: "1" },  // tick 1: rising edge → Q should toggle to 1
      { setInputs: { T: false } },          // tick 2: falling edge, Q holds
      { setInputs: { T: true }, expect: "0" },  // tick 3: rising edge → Q should toggle to 0
      { setInputs: { T: false } },          // tick 4: falling edge, Q holds
      { setInputs: { T: true }, expect: "1" },  // tick 5: rising edge → Q should toggle to 1
      { setInputs: { T: false } },          // tick 6
      { setInputs: { T: true }, expect: "0" },  // tick 7: rising edge → Q should toggle to 0
    ]
  },
  {
    label: "T held high (no more edges)",
    ticks: [
      { setInputs: { T: true }, expect: "0" },  // tick 8: T stays high, no new edge → Q holds
      { setInputs: { T: true }, expect: "0" },  // tick 9: still no edge
      { setInputs: { T: true }, expect: "0" },  // tick 10
    ]
  }
]);

// ============================================================
// Test Design B: Self-oscillating T-FF
// ============================================================
testCircuit("Design B: Self-oscillating (T=enable, internal clock)", designB, [
  {
    label: "T=0 for 5 ticks (oscillator gated off)",
    ticks: Array(5).fill(null).map(() => ({ setInputs: { T: false } }))
  },
  {
    label: "T=1 for 30 ticks (should toggle repeatedly)",
    ticks: Array(30).fill(null).map(() => ({ setInputs: { T: true } }))
  }
]);

// ============================================================
// Test Design C: Minimal XOR toggle with explicit feedback
// ============================================================
testCircuit("Design C: Minimal XOR + explicit feedback", designC, [
  {
    label: "Clock pulses: T=0,1,0,1,0,1,0,1",
    ticks: [
      { setInputs: { T: false } },
      { setInputs: { T: true } },          // rising edge
      { setInputs: { T: false } },
      { setInputs: { T: true } },          // rising edge
      { setInputs: { T: false } },
      { setInputs: { T: true } },          // rising edge
      { setInputs: { T: false } },
      { setInputs: { T: true } },          // rising edge
    ]
  }
]);