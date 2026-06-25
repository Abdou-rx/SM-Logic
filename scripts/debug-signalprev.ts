/**
 * Debug script: trace signalPrev values to understand gate evaluation timing.
 */
import { SimulationEngine } from "../src/simulator/engine.js";

const circuit = {
  name: "debug",
  inputs: ["T"],
  outputs: ["Q", "CLK"],
  gates: [
    { id: "osc_not", type: "nand", inputs: ["osc", "osc"], output: "osc_inv" },
    { id: "osc_timer", type: "timer", delay: 2, inputs: ["osc_inv"], "output": "osc" },
    { id: "osc_del", type: "timer", delay: 1, inputs: ["osc"], "output": "osc_d" },
    { id: "not_od", type: "nand", inputs: ["osc_d", "osc_d"], "output": "osc_d_bar" },
    { id: "raw_pulse", type: "and", inputs: ["osc", "osc_d_bar"], "output": "raw" },
    { id: "gated", type: "and", inputs: ["raw", "T"], "output": "CLK" },
    { id: "toggle", type: "xor", inputs: ["Q_fb", "CLK"], "output": "Q" }
  ],
  feedback: { "Q": "Q_fb" }
};

const engine = new SimulationEngine(circuit);

// Access internal resolution
const resolution = (engine as any).resolution;
console.log("Combinational order:", resolution.combinationalOrder);
console.log("Cycle gates:", [...resolution.cycleGateIds]);
console.log("Timer gates:", [...resolution.timerGateIds]);

// Run ticks and trace
for (let i = 0; i < 10; i++) {
  engine.setInput("T", i >= 4); // T goes high at tick 4
  const result = engine.tick();
  
  // Build what signalPrev would look like for NEXT tick
  const allStates = result.allStates;
  console.log(`\nTick ${i}: T=${result.inputStates.T?1:0}`);
  console.log(`  Current: osc=${allStates.osc?1:0} osc_inv=${allStates.osc_inv?1:0} osc_d=${allStates.osc_d?1:0} osc_d_bar=${allStates.osc_d_bar?1:0} raw=${allStates.raw?1:0} CLK=${allStates.CLK?1:0} Q=${allStates.Q?1:0}`);
  
  // For the NEXT tick, signalPrev will have these current values
  // So next tick's raw = AND(current_osc, current_osc_d_bar)
  const nextRaw = allStates.osc && allStates.osc_d_bar;
  console.log(`  Predicted raw@tick${i+1} = AND(osc=${allStates.osc?1:0}, osc_d_bar=${allStates.osc_d_bar?1:0}) = ${nextRaw?1:0}`);
}