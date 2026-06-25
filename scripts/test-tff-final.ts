/**
 * Test the final T-FF design with pulse shortener.
 * 
 * Design D's issue: edge detect AND(osc, NOT(osc_d)) produces 2-tick pulses
 * because timer delay-1 adds 2 ticks of lag in signalPrev.
 * The cycle gate (toggle) sees 3 ticks of CLK → 3 toggles → net 1 toggle + glitches.
 * 
 * Fix: Add rising-edge detector on the raw pulse to shorten it to 1 tick.
 * raw_buf = AND(raw, raw) acts as 1-tick delay (reads from signalPrev).
 * clk_pulse = AND(raw, NOT(raw_buf)) = rising edge of raw = 1 tick wide.
 * Toggle sees exactly 1 tick of CLK = 1 clean toggle per oscillator cycle.
 */
import { SimulationEngine } from "../src/simulator/engine.js";

// ============================================================
// Design F: Self-oscillating T-FF with pulse shortener
// ============================================================
const designF = {
  name: "t_flipflop",
  description: "T flip-flop: Q toggles repeatedly while T is held high. SM-accurate design using NOT+timer oscillator, timer-based edge detection, pulse shortener (rising-edge detector), and XOR toggle with explicit feedback.",
  version: "3.0.0",
  inputs: ["T"],
  outputs: ["Q", "CLK"],
  gates: [
    // --- Internal clock oscillator ---
    { id: "osc_not", type: "nand", inputs: ["osc", "osc"], output: "osc_inv" },
    { id: "osc_timer", type: "timer", "delay": 2, inputs: ["osc_inv"], "output": "osc" },
    // --- Edge detection on oscillator (produces 2-tick pulse) ---
    { id: "osc_del", type: "timer", "delay": 1, inputs: ["osc"], "output": "osc_d" },
    { id: "not_od", type: "nand", inputs: ["osc_d", "osc_d"], "output": "osc_d_bar" },
    { id: "raw_pulse", type: "and", inputs: ["osc", "osc_d_bar"], "output": "raw" },
    // --- Pulse shortener: rising-edge detector on raw pulse ---
    // raw_buf reads raw from signalPrev → 1-tick delayed copy of raw
    { id: "raw_buf", type: "and", inputs: ["raw", "raw"], "output": "raw_d" },
    { id: "not_raw_d", type: "nand", inputs: ["raw_d", "raw_d"], "output": "raw_d_bar" },
    { id: "clk_pulse", type: "and", inputs: ["raw", "raw_d_bar"], "output": "clk_pulse" },
    // --- Gate clock with T input ---
    { id: "gated", type: "and", inputs: ["clk_pulse", "T"], "output": "CLK" },
    // --- XOR toggle with feedback ---
    { id: "toggle", type: "xor", inputs: ["Q_fb", "CLK"], "output": "Q" }
  ],
  feedback: { "Q": "Q_fb" }
};

// ============================================================
// Design G: Clock-input T-FF with pulse shortener (clean version of E)
// ============================================================
const designG = {
  name: "t_flipflop_clock",
  description: "T flip-flop: Q toggles on each rising edge of T. Timer edge detection, pulse shortener, and XOR toggle. For use with an external clock source.",
  version: "3.0.0",
  inputs: ["T"],
  outputs: ["Q"],
  gates: [
    // Edge detection
    { id: "t_del", type: "timer", "delay": 1, inputs: ["T"], "output": "T_d" },
    { id: "not_td", type: "nand", inputs: ["T_d", "T_d"], "output": "T_d_bar" },
    { id: "raw", type: "and", inputs: ["T", "T_d_bar"], "output": "edge_raw" },
    // Pulse shortener
    { id: "raw_buf", type: "and", inputs: ["edge_raw", "edge_raw"], "output": "edge_d" },
    { id: "not_ed", type: "nand", inputs: ["edge_d", "edge_d"], "output": "edge_d_bar" },
    { id: "pulse", type: "and", inputs: ["edge_raw", "edge_d_bar"], "output": "edge" },
    // Toggle
    { id: "toggle", type: "xor", inputs: ["Q_fb", "edge"], "output": "Q" }
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
        
        const inputs = Object.entries(result.inputStates).map(([k,v]) => `${k}=${v?1:0}`).join(",");
        const outputs = Object.entries(result.outputStates).map(([k,v]) => `${k}=${v?1:0}`).join(",");
        const internals = Array.from((result as any).internalSignals?.entries() ?? [])
          .filter(([k]) => ["osc","osc_inv","osc_d","osc_d_bar","raw","raw_d","raw_d_bar","clk_pulse","T_d","T_d_bar","edge_raw","edge_d","edge_d_bar","edge","Q_fb","gated"].includes(k))
          .map(([k,v]) => `${k}=${v?1:0}`).join(", ");
        
        let line = `  Tick ${String(result.tick).padStart(2)}: [${inputs}] → [${outputs}]`;
        if (internals) line += `  | ${internals}`;
        if (step.expectQ !== undefined) {
          line += q === step.expectQ ? "  ✓" : `  ✗ EXPECT Q=${step.expectQ ? 1 : 0}`;
          if (q !== step.expectQ) allPassed = false;
        }
        console.log(line);
      }
    }
    
    // Count toggles
    let actualToggles = 0;
    for (let i = 1; i < qHistory.length; i++) {
      if (qHistory[i] !== qHistory[i-1]) actualToggles++;
    }
    
    // Count 1-tick glitches (change that reverses within 1 tick)
    let glitches = 0;
    for (let i = 1; i < qHistory.length - 1; i++) {
      if (qHistory[i] !== qHistory[i-1] && qHistory[i+1] !== qHistory[i] && qHistory[i+1] === qHistory[i-1]) {
        glitches++;
      }
    }
    
    console.log(`\n  Q history: [${qHistory.map(v=>v?1:0).join("")}]`);
    if (clkHistory.some(v => v)) {
      console.log(`  CLK history: [${clkHistory.map(v=>v?1:0).join("")}]`);
    }
    console.log(`  Total Q toggles: ${actualToggles}`);
    console.log(`  1-tick glitches: ${glitches}`);
    console.log(`  Result: ${allPassed ? "ALL CHECKS PASSED ✓" : "SOME CHECKS FAILED ✗"}`);
    return { passed: allPassed, toggles: actualToggles, glitches, qHistory, clkHistory };
  } catch (e: any) {
    console.error(`  ERROR: ${e.message}`);
    if (e.stack) console.error(e.stack);
    return { passed: false, toggles: 0, glitches: -1, qHistory: [], clkHistory: [] };
  }
}

// ============================================================
// Test Design G (clock-input, simpler to verify)
// ============================================================
testCircuit("Design G: Clock-input T-FF with pulse shortener", designG, [
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
      { setInputs: { T: true } },              // tick 3: rising edge
      { setInputs: { T: false }, expectQ: true },  // tick 4: Q toggled
      { setInputs: { T: true } },              // tick 5: rising edge
      { setInputs: { T: false }, expectQ: false }, // tick 6: Q toggled back
      { setInputs: { T: true } },              // tick 7: rising edge
      { setInputs: { T: false }, expectQ: true },  // tick 8: Q toggled
      { setInputs: { T: true } },              // tick 9: rising edge
      { setInputs: { T: false }, expectQ: false }, // tick 10: Q toggled back
    ]
  },
  {
    label: "T held high (no new edges, Q should hold at 0)",
    ticks: [
      { setInputs: { T: true }, expectQ: false },
      { setInputs: { T: true }, expectQ: false },
      { setInputs: { T: true }, expectQ: false },
      { setInputs: { T: true }, expectQ: false },
      { setInputs: { T: true }, expectQ: false },
    ]
  },
  {
    label: "Another rising edge (T goes 0 then 1)",
    ticks: [
      { setInputs: { T: false } },
      { setInputs: { T: true } },
      { setInputs: { T: false }, expectQ: true },
    ]
  }
]);

// ============================================================
// Test Design F (self-oscillating)
// ============================================================
const resultF = testCircuit("Design F: Self-oscillating T-FF with pulse shortener", designF, [
  {
    label: "T=0 for 8 ticks (oscillator gated off, Q should hold)",
    ticks: Array(8).fill(null).map((_, i) => ({ 
      setInputs: { T: false },
      expectQ: i >= 1 ? false : undefined 
    }))
  },
  {
    label: "T=1 for 40 ticks (should toggle cleanly, no glitches)",
    ticks: Array(40).fill(null).map(() => ({ setInputs: { T: true } }))
  },
  {
    label: "T=0 for 15 ticks (should hold current Q)",
    ticks: Array(15).fill(null).map(() => ({ setInputs: { T: false } }))
  }
]);

// Detailed analysis
const t1Q = resultF.qHistory.slice(8, 48); // T=1 phase
let t1Toggles = 0;
for (let i = 1; i < t1Q.length; i++) {
  if (t1Q[i] !== t1Q[i-1]) t1Toggles++;
}
console.log(`\n  T=1 phase toggles: ${t1Toggles}`);
console.log(`  T=1 phase glitches: ${resultF.glitches}`);

const t0Q = resultF.qHistory.slice(48);
let t0Toggles = 0;
for (let i = 1; i < t0Q.length; i++) {
  if (t0Q[i] !== t0Q[i-1]) t0Toggles++;
}
console.log(`  T=0 hold phase changes: ${t0Toggles} (should be 0)`);

// Check Q holds stable value in T=0 hold phase
const t0Stable = t0Q.every(v => v === t0Q[0]);
console.log(`  T=0 hold phase stable: ${t0Stable ? "YES ✓" : "NO ✗"} (final Q=${t0Q[0] ? 1 : 0})`);