/**
 * Test Design H: Self-oscillating T-FF with cold-start fix.
 * 
 * Key improvements over previous designs:
 * 1. SR latch NOR1 has NOT(T) as forced-reset input → Q=0 when T=0, no cold-start oscillation
 * 2. SET = AND(pulse, Q_bar) instead of AND(pulse, NOT(Q)) → symmetric gate levels with RESET
 * 3. Internal oscillator generates clock pulses gated by T
 */
import { SimulationEngine } from "../src/simulator/engine.js";

// ============================================================
// Design H: Self-oscillating T-FF with cold-start-fixed SR latch
// ============================================================
const designH = {
  name: "t_flipflop",
  description: "T flip-flop: Q toggles repeatedly while T is held high. SM-accurate design with NOT+timer oscillator, timer edge detection, gated clock, and NOR SR latch with cold-start fix (NOT(T) forces Q=0 when T=0).",
  version: "3.0.0",
  inputs: ["T"],
  outputs: ["Q", "CLK"],
  gates: [
    // --- Internal clock oscillator: NOT(osc) → timer(delay=2) → osc ---
    { id: "osc_not", type: "nand", inputs: ["osc", "osc"], output: "osc_inv" },
    { id: "osc_timer", type: "timer", delay: 2, inputs: ["osc_inv"], output: "osc" },

    // --- Edge detection on oscillator: timer delay → NOT → AND ---
    { id: "osc_del", type: "timer", delay: 1, inputs: ["osc"], output: "osc_d" },
    { id: "not_od", type: "nand", inputs: ["osc_d", "osc_d"], output: "osc_d_bar" },
    { id: "clk_rise", type: "and", inputs: ["osc", "osc_d_bar"], output: "osc_edge" },

    // --- Gate clock with T input ---
    { id: "gated", type: "and", inputs: ["osc_edge", "T"], output: "CLK" },

    // --- NOT(T) for cold-start fix: forces Q=0 when T=0 via NOR1 ---
    { id: "not_t", type: "nand", inputs: ["T", "T"], output: "T_bar" },

    // --- Toggle logic: SET when Q=0 (use Q_bar), RESET when Q=1 (use Q) ---
    { id: "set_g", type: "and", inputs: ["CLK", "Q_bar"], output: "S" },
    { id: "rst_g", type: "and", inputs: ["CLK", "Q"], output: "R" },

    // --- SR latch (cross-coupled NOR) with cold-start fix ---
    // NOR1 gets T_bar: when T=0, T_bar=1, forces Q=0 regardless of other inputs
    { id: "nor1", type: "nor", inputs: ["R", "T_bar", "Q_bar"], output: "Q" },
    { id: "nor2", type: "nor", inputs: ["S", "Q"], output: "Q_bar" }
  ]
};

// ============================================================
// Design H2: Same but clock-input version (no internal oscillator)
// ============================================================
const designH2 = {
  name: "t_flipflop_clock",
  description: "T flip-flop: Q toggles on each rising edge of T (clock input). Timer edge detection + NOR SR latch with cold-start fix.",
  version: "3.0.0",
  inputs: ["T"],
  outputs: ["Q"],
  gates: [
    // Edge detection
    { id: "t_del", type: "timer", delay: 1, inputs: ["T"], output: "T_d" },
    { id: "not_td", type: "nand", inputs: ["T_d", "T_d"], output: "T_d_bar" },
    { id: "edge", type: "and", inputs: ["T", "T_d_bar"], output: "pulse" },
    // Cold-start fix
    { id: "not_t", type: "nand", inputs: ["T", "T"], output: "T_bar" },
    // Toggle logic
    { id: "set_g", type: "and", inputs: ["pulse", "Q_bar"], output: "S" },
    { id: "rst_g", type: "and", inputs: ["pulse", "Q"], output: "R" },
    // SR latch with cold-start fix
    { id: "nor1", type: "nor", inputs: ["R", "T_bar", "Q_bar"], output: "Q" },
    { id: "nor2", type: "nor", inputs: ["S", "Q"], output: "Q_bar" }
  ]
};

function testCircuit(name: string, circuit: any, phases: Array<{label: string, ticks: Array<{setInputs?: Record<string,boolean>, expectQ?: boolean}>}>) {
  console.log(`\n${"=".repeat(70)}`);
  console.log(`  ${name}`);
  console.log(`${"=".repeat(70)}`);
  
  try {
    const engine = new SimulationEngine(circuit, { recordWaveform: true });
    const qHistory: boolean[] = [];
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
        
        const inputs = Object.entries(result.inputStates).map(([k,v]) => `${k}=${v?1:0}`).join(",");
        const outputs = Object.entries(result.outputStates).map(([k,v]) => `${k}=${v?1:0}`).join(",");
        const internals = Array.from((result as any).internalSignals?.entries() ?? [])
          .filter(([k]) => ["osc","osc_inv","osc_d","osc_d_bar","osc_edge","T_d","T_d_bar","pulse","S","R","Q_bar","T_bar","Q_fb","gated","not_t"].includes(k))
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
    
    // Count toggles in each phase
    let actualToggles = 0;
    for (let i = 1; i < qHistory.length; i++) {
      if (qHistory[i] !== qHistory[i-1]) actualToggles++;
    }
    
    console.log(`\n  Q history: [${qHistory.map(v=>v?1:0).join("")}]`);
    console.log(`  Total toggles: ${actualToggles}`);
    console.log(`  Result: ${allPassed ? "ALL CHECKS PASSED ✓" : "SOME CHECKS FAILED ✗"}`);
    return { passed: allPassed, toggles: actualToggles, qHistory };
  } catch (e: any) {
    console.error(`  ERROR: ${e.message}`);
    if (e.stack) console.error(e.stack);
    return { passed: false, toggles: 0, qHistory: [] };
  }
}

// ============================================================
// Test H2 (clock-input version) first - simpler to verify
// ============================================================
testCircuit("Design H2: Clock-input T-FF with cold-start fix", designH2, [
  {
    label: "Cold start: T=0 for 5 ticks (Q should stay 0, NO oscillation)",
    ticks: Array(5).fill(null).map(() => ({ setInputs: { T: false }, expectQ: false }))
  },
  {
    label: "4 rising edges: T alternates 1,0,1,0,1,0,1,0",
    ticks: [
      { setInputs: { T: true } },             // tick 5: rising edge
      { setInputs: { T: false }, expectQ: true },  // tick 6: Q should be 1
      { setInputs: { T: true } },             // tick 7: rising edge
      { setInputs: { T: false }, expectQ: false }, // tick 8: Q should be 0
      { setInputs: { T: true } },             // tick 9: rising edge
      { setInputs: { T: false }, expectQ: true },  // tick 10: Q should be 1
      { setInputs: { T: true } },             // tick 11: rising edge
      { setInputs: { T: false }, expectQ: false }, // tick 12: Q should be 0
    ]
  },
  {
    label: "T held high after stable low (clean single edge)",
    ticks: [
      { setInputs: { T: true } },              // tick 13: rising edge (T was 0)
      { setInputs: { T: true }, expectQ: true },  // tick 14: Q should toggle to 1
      { setInputs: { T: true }, expectQ: true },  // tick 15: should hold
      { setInputs: { T: true }, expectQ: true },  // tick 16: should hold
      { setInputs: { T: true }, expectQ: true },  // tick 17: should hold
      { setInputs: { T: true }, expectQ: true },  // tick 18: should hold
      { setInputs: { T: true }, expectQ: true },  // tick 19: should hold
      { setInputs: { T: true }, expectQ: true },  // tick 20: should hold
    ]
  }
]);

// ============================================================
// Test H (self-oscillating version)
// ============================================================
const resultH = testCircuit("Design H: Self-oscillating T-FF with cold-start fix", designH, [
  {
    label: "T=0 for 10 ticks (oscillator gated off, Q should stay 0)",
    ticks: Array(10).fill(null).map((_, i) => ({ 
      setInputs: { T: false },
      expectQ: false
    }))
  },
  {
    label: "T=1 for 40 ticks (should toggle repeatedly, clean alternation)",
    ticks: Array(40).fill(null).map(() => ({ setInputs: { T: true } }))
  },
  {
    label: "T=0 for 15 ticks (should hold Q stable)",
    ticks: Array(15).fill(null).map(() => ({ setInputs: { T: false } }))
  }
]);

// Analyze T=1 phase for clean toggling
const t1Q = resultH.qHistory.slice(10, 50); // T=1 phase
let t1Toggles = 0;
let doubleToggles = 0;
let cleanToggles = 0;
for (let i = 1; i < t1Q.length; i++) {
  if (t1Q[i] !== t1Q[i-1]) {
    t1Toggles++;
    // Check if this is a double-toggle (change again within 2 ticks)
    if (i + 1 < t1Q.length && t1Q[i+1] !== t1Q[i]) {
      doubleToggles++;
    } else {
      cleanToggles++;
    }
  }
}
console.log(`\n  T=1 phase analysis: ${t1Toggles} total toggles, ${cleanToggles} clean, ${doubleToggles} double-toggles`);

// Analyze T=0 hold phase
const t0Q = resultH.qHistory.slice(50);
let t0Changes = 0;
for (let i = 1; i < t0Q.length; i++) {
  if (t0Q[i] !== t0Q[i-1]) t0Changes++;
}
console.log(`  T=0 hold phase: ${t0Changes} changes (should be 0)`);