/**
 * Test refined T-FF designs:
 * - Design D: Oscillator + edge detect + XOR toggle (self-oscillating)
 * - Design E: Like Design C but with proper documentation and tested scenarios
 */
import { SimulationEngine } from "../src/simulator/engine.js";

// ============================================================
// Design D: Self-oscillating T-FF
// Oscillator generates clock → edge detect → AND with T → XOR toggle
// ============================================================
const designD = {
  name: "t_flipflop",
  description: "T flip-flop: Q toggles repeatedly while T is held high. SM-accurate design using NOT+timer oscillator, timer-based edge detection, and XOR toggle with feedback.",
  version: "3.0.0",
  inputs: ["T"],
  outputs: ["Q", "CLK"],
  gates: [
    // --- Internal clock oscillator ---
    // NOT(osc) feeds back through timer to create square wave
    { id: "osc_not", type: "nand", inputs: ["osc", "osc"], output: "osc_inv" },
    { id: "osc_timer", type: "timer", delay: 2, inputs: ["osc_inv"], output: "osc" },
    // --- Edge detection on oscillator output ---
    { id: "osc_del", type: "timer", delay: 1, inputs: ["osc"], output: "osc_d" },
    { id: "not_od", type: "nand", inputs: ["osc_d", "osc_d"], output: "osc_d_bar" },
    { id: "clk_rise", type: "and", inputs: ["osc", "osc_d_bar"], output: "clk_pulse" },
    // --- Gate clock with T input ---
    { id: "gated", type: "and", inputs: ["clk_pulse", "T"], output: "CLK" },
    // --- XOR toggle with feedback ---
    { id: "toggle", type: "xor", inputs: ["Q_fb", "CLK"], output: "Q" }
  ],
  feedback: { "Q": "Q_fb" }
};

// ============================================================
// Design E: Clock-input T-FF (user provides clock pulses)
// Clean version of Design C
// ============================================================
const designE = {
  name: "t_flipflop_clock",
  description: "T flip-flop: Q toggles on each rising edge of input T. Timer-based edge detection with XOR toggle. For use with an external clock source.",
  version: "3.0.0",
  inputs: ["T"],
  outputs: ["Q"],
  gates: [
    { id: "t_del", type: "timer", delay: 1, inputs: ["T"], output: "T_d" },
    { id: "not_td", type: "nand", inputs: ["T_d", "T_d"], output: "T_d_bar" },
    { id: "pulse", type: "and", inputs: ["T", "T_d_bar"], output: "edge" },
    { id: "toggle", type: "xor", inputs: ["Q_fb", "edge"], output: "Q" }
  ],
  feedback: { "Q": "Q_fb" }
};

function testCircuit(name: string, circuit: any, phases: Array<{label: string, ticks: Array<{setInputs?: Record<string,boolean>, expectQ?: boolean}>}>) {
  console.log(`\n${"=".repeat(70)}`);
  console.log(`  ${name}`);
  console.log(`${"=".repeat(70)}`);
  
  try {
    const engine = new SimulationEngine(circuit, { recordWaveform: true });
    const qHistory: boolean[] = [];
    const clkHistory: boolean[] = [];
    let allPassed = true;
    let toggleCount = 0;
    let lastQ = false;
    
    for (const phase of phases) {
      console.log(`\n  --- ${phase.label} ---`);
      for (const step of phase.ticks) {
        if (step.setInputs) {
          for (const [k, v] of Object.entries(step.setInputs)) {
            engine.setInput(k, v);
          }
        }
        const result = engine.tick();
        const q = result.outputStates.Q;
        const clk = (result.outputStates as any).CLK ?? false;
        qHistory.push(q);
        clkHistory.push(clk);
        
        if (q !== lastQ) toggleCount++;
        lastQ = q;
        
        const inputs = Object.entries(result.inputStates).map(([k,v]) => `${k}=${v?1:0}`).join(",");
        const outputs = Object.entries(result.outputStates).map(([k,v]) => `${k}=${v?1:0}`).join(",");
        const internals = Array.from((result as any).internalSignals?.entries() ?? [])
          .filter(([k]) => ["osc","osc_inv","osc_d","osc_d_bar","clk_pulse","T_d","T_d_bar","edge","Q_fb","gated"].includes(k))
          .map(([k,v]) => `${k}=${v?1:0}`).join(", ");
        
        let line = `  Tick ${String(result.tick).padStart(2)}: [${inputs}] → [${outputs}]`;
        if (internals) line += `  | ${internals}`;
        if (step.expectQ !== undefined) {
          line += q === step.expectQ ? "  ✓" : "  ✗ EXPECT Q=" + (step.expectQ ? 1 : 0);
          if (q !== step.expectQ) allPassed = false;
        }
        console.log(line);
      }
    }
    
    // Count actual toggles (Q changes)
    let actualToggles = 0;
    for (let i = 1; i < qHistory.length; i++) {
      if (qHistory[i] !== qHistory[i-1]) actualToggles++;
    }
    
    console.log(`\n  Q history: [${qHistory.map(v=>v?1:0).join("")}]`);
    console.log(`  Total Q toggles: ${actualToggles}`);
    console.log(`  Result: ${allPassed ? "ALL CHECKS PASSED ✓" : "SOME CHECKS FAILED ✗"}`);
    return { passed: allPassed, toggles: actualToggles, qHistory, clkHistory };
  } catch (e: any) {
    console.error(`  ERROR: ${e.message}`);
    return { passed: false, toggles: 0, qHistory: [], clkHistory: [] };
  }
}

// ============================================================
// Test Design E first (simpler, clock-input version)
// ============================================================
testCircuit("Design E: Clock-input T-FF (T = clock pulses)", designE, [
  {
    label: "Reset: T=0 for 3 ticks (Q should stay 0)",
    ticks: [
      { setInputs: { T: false }, expectQ: false },
      { setInputs: { T: false }, expectQ: false },
      { setInputs: { T: false }, expectQ: false },
    ]
  },
  {
    label: "4 rising edges: T alternates 1,0,1,0,1,0,1,0",
    ticks: [
      { setInputs: { T: true } },            // tick 3: rising edge
      { setInputs: { T: false }, expectQ: true },  // tick 4: Q should toggle to 1
      { setInputs: { T: true } },            // tick 5: rising edge
      { setInputs: { T: false }, expectQ: false }, // tick 6: Q should toggle to 0
      { setInputs: { T: true } },            // tick 7: rising edge
      { setInputs: { T: false }, expectQ: true },  // tick 8: Q should toggle to 1
      { setInputs: { T: true } },            // tick 9: rising edge
      { setInputs: { T: false }, expectQ: false }, // tick 10: Q should toggle to 0
    ]
  },
  {
    label: "T held high (no new edges, Q should hold at 0)",
    ticks: [
      { setInputs: { T: true }, expectQ: false },  // tick 11
      { setInputs: { T: true }, expectQ: false },  // tick 12
      { setInputs: { T: true }, expectQ: false },  // tick 13
      { setInputs: { T: true }, expectQ: false },  // tick 14
      { setInputs: { T: true }, expectQ: false },  // tick 15
    ]
  },
  {
    label: "Another rising edge (T goes 0 then 1)",
    ticks: [
      { setInputs: { T: false } },           // tick 16
      { setInputs: { T: true } },            // tick 17: rising edge
      { setInputs: { T: false }, expectQ: true },  // tick 18: Q should toggle to 1
    ]
  }
]);

// ============================================================
// Test Design D (self-oscillating)
// ============================================================
const resultD = testCircuit("Design D: Self-oscillating T-FF (T=enable, internal oscillator)", designD, [
  {
    label: "T=0 for 8 ticks (oscillator gated off, Q should hold)",
    ticks: Array(8).fill(null).map((_, i) => ({ 
      setInputs: { T: false },
      // After initial settling, Q should stabilize
      expectQ: i >= 2 ? false : undefined 
    }))
  },
  {
    label: "T=1 for 40 ticks (should toggle repeatedly)",
    ticks: Array(40).fill(null).map(() => ({ setInputs: { T: true } }))
  },
  {
    label: "T=0 for 15 ticks (should hold current Q)",
    ticks: Array(15).fill(null).map(() => ({ setInputs: { T: false } }))
  }
]);

// Check that toggles actually happened during T=1 phase
const t1PhaseQ = resultD.qHistory.slice(8, 48); // T=1 phase
let t1Toggles = 0;
for (let i = 1; i < t1PhaseQ.length; i++) {
  if (t1PhaseQ[i] !== t1PhaseQ[i-1]) t1Toggles++;
}
console.log(`\n  Toggles during T=1 phase: ${t1Toggles} (should be > 0)`);

// Check that Q held stable during T=0 phase (after T=1)
const t0PhaseQ = resultD.qHistory.slice(48); // T=0 phase after T=1
let t0Toggles = 0;
for (let i = 1; i < t0PhaseQ.length; i++) {
  if (t0PhaseQ[i] !== t0PhaseQ[i-1]) t0Toggles++;
}
console.log(`  Toggles during final T=0 phase: ${t0Toggles} (should be 0 or very few for settling)`);