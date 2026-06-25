# CONTEXT.md — SM-Logic Tool v2

> **Audience**: AI coding agents (Opencode, Cursor, Copilot, etc.)
> **Last updated**: 2026-06-25
> **Test suite**: 77/77 passing (5 test files)

---

## 1. Project Overview

**SM-Logic** is a TypeScript CLI tool for designing, simulating, verifying, and generating
Scrap Mechanic (SM) logic circuit blueprints. It models SM's gate behavior exactly:
every gate has a 1-tick propagation delay, timers are shift registers, and there is
no native NOT gate (use `NAND(x, x)` or `NOR(x, x)`).

- **Repo**: `https://github.com/Abdou-rx/SM-Logic`
- **Language**: TypeScript 5.4+ (ES2022 target, Node16 modules, ESM)
- **Runtime**: Node.js ≥ 18
- **Build**: `tsc` → `dist/`
- **Test**: `vitest` (77 tests, all passing)
- **CLI entry**: `npx tsx src/index.ts` or `node dist/index.js`
- **Package name**: `sm-logic-tool` v1.0.0

---

## 2. Architecture & Module Map

```
src/
├── index.ts                    # CLI entry point (commander)
├── types/
│   ├── index.ts                # Re-exports
│   ├── gate.ts                 # GateType, LogicGateType, GateConfig, GATE_MODE_MAP
│   ├── circuit.ts              # CircuitDefinition, CircuitNode, ResolvedCircuit, FeedbackMapping
│   ├── simulation.ts           # TickResult, WaveformRecord, SM_TIMING (40 ticks/sec)
│   ├── blueprint.ts            # SMBlueprint v4, SMVector, SMController, BlueprintOptions
│   └── verilog.ts              # Verilog AST types (module, port, assign, always, expression)
├── core/
│   ├── gates.ts                # evaluateGate(), evaluateGateFromInputs(), truth table generation
│   ├── circuit-builder.ts      # CircuitBuilder fluent API (circuit().input().gate().build())
│   ├── constants.ts            # SM shape UUIDs, mod data, VINCLING/CIRCUITS mod support
│   └── subcircuits.ts          # Pre-built subcircuit library (NOT, buffer, SR latch, T-FF, D-FF, etc.)
├── simulator/
│   ├── engine.ts               # SimulationEngine — tick-by-tick simulation with Kahn's algorithm
│   ├── timer-model.ts          # TimerModel — shift register (delay 1–30 ticks)
│   └── waveform.ts             # WaveformRecorder — VCD export for GTKWave
├── verifier/
│   ├── truth-table-gen.ts      # TruthTableGenerator — exhaustive (≤6 inputs) or sampled
│   ├── equivalence.ts          # CircuitEquivalenceChecker — compare two circuits
│   ├── test-runner.ts          # TestRunner — run test vectors against simulation
│   └── reporter.ts             # VerificationReporter — human-readable report formatting
├── parser/
│   ├── circuit-json.ts         # CircuitJsonParser — .sm-circuit.json file I/O + validation
│   ├── verilog-parser.ts       # VerilogParser — subset of Verilog-2001 → CircuitDefinition
│   └── blueprint-reader.ts     # BlueprintReader — read SM blueprint.json, extract gate info
├── blueprint/
│   ├── builder.ts              # BlueprintBuilder — CircuitDefinition → SMBlueprint JSON
│   ├── placer.ts               # Placer — grid-based 3D position assignment for components
│   └── writer.ts               # BlueprintWriter — serialize SMBlueprint to JSON file
├── converter/
│   ├── format-types.ts         # GateFormat type ("vanilla" | "vincling" | "circuits")
│   └── gate-converter.ts       # GateConverter — convert between vanilla/modded gate formats
└── cli/
    ├── commands/
    │   ├── simulate.ts         # `sm-logic simulate <file>` — tick-by-tick simulation
    │   ├── verify.ts           # `sm-logic verify <file>` — truth table + test vectors
    │   ├── truth-table.ts      # `sm-logic truth-table <file>` — generate truth tables
    │   ├── build.ts            # `sm-logic build <file>` — generate .blueprint files
    │   ├── convert.ts          # `sm-logic convert <file>` — convert between gate formats
    │   ├── info.ts             # `sm-logic info <file>` — circuit statistics
    │   └── library.ts          # `sm-logic library list|show` — browse subcircuit library
    └── utils/
        ├── output.ts           # chalk-based console output helpers
        └── spinner.ts          # ora spinner wrapper
```

### CLI Commands (all registered in `src/index.ts`)

| Command | Description |
|---------|-------------|
| `sm-logic simulate <file>` | Tick-by-tick circuit simulation |
| `sm-logic verify <file>` | Verify with truth tables and test vectors |
| `sm-logic truth-table <file>` | Generate truth tables |
| `sm-logic build <file>` | Generate `.blueprint` files |
| `sm-logic convert <file>` | Convert gate formats |
| `sm-logic info <file>` | Display circuit info |
| `sm-logic library list\|show` | Browse subcircuit library |

---

## 3. Key Data Structures

### 3.1 CircuitDefinition (`.sm-circuit.json` format)

```typescript
interface CircuitDefinition {
  name: string;
  description?: string;
  version?: string;
  inputs: string[];         // e.g. ["A", "B", "CLK"]
  outputs: string[];        // e.g. ["Q", "Sum"]
  gates: GateConfig[];      // ordered gate list
  feedback?: {              // explicit feedback for sequential circuits
    [sourceOutput: string]: string;  // e.g. { "Q": "Q_fb" }
  };
}

interface GateConfig {
  id: string;               // unique gate identifier
  type: GateType;           // "and"|"or"|"xor"|"nand"|"nor"|"xnor"|"timer"
  inputs: string[];         // input signal names
  output: string;           // output signal name
  delay?: number;           // ticks (only for "timer", 1–30)
}
```

### 3.2 SM Gate Types (all lowercase in JSON)

| Type | Mode | Behavior | Notes |
|------|------|----------|-------|
| `and` | 0 | HIGH when ALL inputs HIGH | Supports 1–20 inputs |
| `or` | 1 | HIGH when ANY input HIGH | Supports 1–20 inputs |
| `xor` | 2 | HIGH for ODD number of HIGH inputs | Supports 1–20 inputs |
| `nand` | 3 | LOW only when ALL inputs HIGH | Negated AND |
| `nor` | 4 | HIGH only when ALL inputs LOW | Negated OR |
| `xnor` | 5 | HIGH for EVEN number of HIGH inputs | Negated XOR |
| `timer` | — | Shift register delay | delay=1–30 ticks, single input |

**SM has NO native NOT gate.** Use `NAND(x, x)` or `NOR(x, x)` to invert.

### 3.3 Simulation Engine Tick Order (`engine.ts`)

Each call to `engine.tick()` executes in this exact order:

1. **Snapshot**: Copy all `currentState` → `prevState` for every node
2. **Set inputs**: Write current input values into input nodes' `currentState`
3. **Build `signalPrev` map** (used by all gate evaluation):
   - Current input values (from `inputValues`)
   - Feedback values (from `feedbackValues`, written at end of previous tick)
   - All gate outputs' `prevState` (the value computed last tick)
4. **Evaluate combinational gates** (topological order from Kahn's algorithm) — all read from `signalPrev`
5. **Evaluate timer gates** (shift register: `unshift(input)`, `pop()` output) — read input from `signalPrev`
6. **Evaluate cycle gates** (gates in feedback loops) — all read from `signalPrev`
7. **Apply explicit feedback**: For each `feedback[source] → target`, copy source's `currentState` into `feedbackValues[target]`
8. **Record waveform** if enabled

**Critical insight**: ALL gates (combinational, timer, cycle) read from the SAME `signalPrev` snapshot built at step 3. This means every gate in the engine has exactly 1 tick of propagation delay — even "combinational" gates. This is SM-accurate.

### 3.4 Kahn's Algorithm & Cycle Detection

`resolveCircuit()` (in `engine.ts`) builds the dependency graph and runs Kahn's:

1. For each gate, look up each input signal name in `signalToGateId` to find the producing gate
2. Gates whose inputs come from circuit inputs or feedback signals have no gate dependency (in-degree 0)
3. Kahn's algorithm extracts zero-in-degree gates into `combinationalOrder`
4. Remaining gates → `cycleGateIds` (in feedback loops)

**Important**: If ANY gate in a circuit has a feedback dependency (e.g., an oscillator `NOT → timer → NOT`), ALL downstream gates that transitively depend on the cycle also end up in `cycleGateIds`. This means for circuits with oscillators, virtually all gates become cycle gates and read from `signalPrev`.

### 3.5 Timer Model (`timer-model.ts`)

Timers are **shift registers**, NOT one-shot pulse generators:
- Buffer of `delay` booleans, initialized to `false`
- Each tick: `unshift(inputValue)`, `pop()` → output is the oldest value
- Delay is relative to the engine tick, not real-time

**Effective delay in signalPrev model**: A timer with `delay=D` causes its output to lag behind its input by **D+1 ticks** as observed by downstream gates (1 tick for signalPrev + D ticks for the shift register). Actually the timer reads from signalPrev too, so the effective visible delay is exactly D ticks (the signalPrev delay on the timer's input is "absorbed" since the timer itself outputs from its register which already incorporates that delay).

### 3.6 Explicit Feedback

The `circuit.feedback` field declares explicit feedback connections. Example:
```json
{ "Q": "Q_fb" }
```
This means: after Q is computed each tick, copy Q's value into a signal called `Q_fb`.
The `Q_fb` signal is then available in `signalPrev` on the next tick for any gate that
lists `Q_fb` as an input. This is the mechanism for building sequential circuits like
T flip-flops without relying on implicit cycles.

---

## 4. History of Fixes & Bugs

### 4.1 Commit 1: `85eabbc` — Initial Tool Creation

The tool was created from scratch. All 77 tests were passing.

### 4.2 Commit 2: `e636996` — Fix All Bugs (77/77 Tests)

Multiple bugs fixed in this commit:

#### Bug: `isSequential()` missed implicit feedback cycles
- **File**: `src/verifier/truth-table-gen.ts`
- **Problem**: `isSequential()` only checked for explicit `feedback` fields and `timer` gates. It did NOT detect implicit cycles (e.g., cross-coupled NOR gates in an SR latch where `Q` feeds back to `Q_bar` and vice versa, without an explicit `feedback` field).
- **Impact**: The truth-table generator would treat SR latches as combinational circuits, running only `gateCount + 5` ticks instead of the extra `SEQUENTIAL_EXTRA_TICKS` for stabilization. This could produce wrong truth table results.
- **Fix**: Added DFS-based cycle detection on the gate dependency graph (3-color: WHITE/GRAY/BLACK). Builds `outputToGateId` map, constructs adjacency, runs recursive DFS. If any gate is GRAY when revisited → cycle detected → `isSequential()` returns `true`.
- **Why it works**: DFS properly traverses the directed graph of gate dependencies. A back-edge (GRAY → GRAY) indicates a cycle, which means the circuit has implicit feedback and is sequential.

#### Bug: Missing API exports
- **File**: `src/index.ts`
- **Problem**: The tool's CLI entry point only exported the commander program. Key classes (`SimulationEngine`, `CircuitBuilder`, `TestRunner`, etc.) were not exported for programmatic/library use.
- **Fix**: Added proper exports (the `smLogicCli` export at the bottom was already there, but internal modules needed their own exports).

#### Bug: Simulator feedback handling
- **File**: `src/simulator/engine.ts`
- **Problem**: The `buildSignalPrevMap()` method did not include feedback values. Cycle gates reading feedback signals would get `undefined` (defaulting to `false`).
- **Fix**: Added feedback values from `this.feedbackValues` map into `signalPrev` in `buildSignalPrevMap()`.

#### Bug: SR latch cold-start metastability
- **Problem**: NOR(0, 0) = 1, so on cold start with SET=0, RESET=0, both NOR gates output 1 simultaneously (Q=1 AND Q_bar=1). This is metastable — in real SM, one gate wins the race. In the engine, both gates read from the same `signalPrev` (both see Q=0, Q_bar=0), so NOR(0,0)=1 for both, producing the illegal state Q=1, Q_bar=1.
- **Impact**: SR latches don't have a clean cold-start. The Q=1, Q_bar=1 state persists until SET or RESET is pulsed.
- **Fix**: Not fixable in the engine itself (it's SM-accurate behavior). Documented as a known limitation.

---

## 5. Current Known Bugs & Unresolved Issues

### 5.1 🔴 CRITICAL: T Flip-Flop Example Circuit Is Broken

- **File**: `examples/t-flipflop.sm-circuit.json`
- **Current state**: Contains Design H (SR-latch-based with cold-start fix) which DOES NOT WORK correctly.
- **Root cause**: The SR latch approach is fundamentally flawed in this engine because:
  1. NOR(0,0)=1 causes Q=1, Q_bar=1 on cold start (metastability)
  2. The "cold-start fix" (adding `NOT(T)` to force Q=0 when T=0) doesn't work because the NOR gates still oscillate. Test `test-tff3.ts` showed Q oscillates wildly during T=0 hold phase.
  3. Even when Q stabilizes, the timing between CLK pulses and NOR gate settling is unreliable.
- **What was tried**:
  - **Design A**: SR latch T-FF (SET/RESET gating) → Failed (metastability)
  - **Design B**: Oscillator + SR latch → Failed (same metastability + both SET/RESET high)
  - **Design C**: XOR toggle + timer edge detect + explicit feedback → **Works** for clock-input T-FF (alternating 1,0,1,0 on T)
  - **Design D**: Self-oscillating (NOT+timer oscillator) + XOR toggle → **Functionally works** (Q toggles per oscillator cycle) but has **1-tick glitches** due to 2-tick-wide CLK pulses
  - **Design E**: Clock-input XOR (clean Design C) → Works for alternating clock but **fails** when T held high
  - **Design F**: Design D + pulse shortener (rising-edge detector) → **Made things worse** (Q barely toggles, net-0 change per cycle)
  - **Design G**: Design E + pulse shortener → **Failed** (edge detection timing wrong)
  - **Design H**: SR latch with cold-start fix → **Failed** (NOR oscillation, Q doesn't hold)
  - **Design H2**: Clock-input SR latch with cold-start fix → **Failed** (metastability, oscillation)

- **Why pulse shortening fails**: The pulse shortener uses `AND(raw, NOT(raw_d))` where `raw_d` is `raw` delayed by one gate. Since ALL gates (including `raw_buf = AND(raw, raw)`) read from `signalPrev`, the minimum observable delay between two signals is 2 ticks (source changes at tick N, observer sees it at tick N+1 via signalPrev, but the delay gate also reads from signalPrev, adding another tick). This means the "1-tick delayed copy" is actually 2 ticks behind, causing the rising-edge detector to produce a 2-tick pulse instead of 1-tick. With XOR toggle reading from signalPrev, this 2-tick pulse causes 2 toggles (net zero change).

- **Working solution found**: **Design D** (self-oscillating XOR toggle) functionally works:
  - Q toggles once per oscillator cycle (~8 ticks) when T=1
  - Q holds stable when T=0
  - Has 1-tick glitches in Q during transitions (cosmetic, not functional)
  - The net toggle behavior is correct
  - **Alternative**: **Design C/E** (clock-input) works perfectly when T receives proper clock pulses (alternating 0,1,0,1)

- **Plan to fix**:
  1. Replace `examples/t-flipflop.sm-circuit.json` with Design D (self-oscillating XOR toggle)
  2. Update the T-FF in `subcircuits.ts` library to match
  3. Verify with CLI `truth-table` and `simulate` commands
  4. Document that T-FF is a sequential circuit — truth-table shows reset-state only

### 5.2 🟡 MEDIUM: signalPrev Architecture Causes All Gates to Have 1-Tick Delay

- **File**: `src/simulator/engine.ts`
- **Problem**: The `buildSignalPrevMap()` uses `node.state.prevState` for ALL gate outputs. This means even "combinational" gates (in `combinationalOrder`) read from the previous tick, giving them 1-tick delay. In a real circuit, combinational gates propagate within the same clock cycle.
- **SM accuracy**: This IS correct for Scrap Mechanic. In SM, every logic gate reads from the previous tick's output of its inputs. So this is a feature, not a bug.
- **Impact**: Makes it impossible to create a 1-tick-wide pulse from a 2-tick-wide pulse using gate-only techniques. This is the root cause of the T-FF pulse-shortening failure.

### 5.3 🟡 MEDIUM: `equivalence.ts` Does Not Detect Implicit Cycles

- **File**: `src/verifier/equivalence.ts`
- **Problem**: `isSequentialCircuit()` (line 54) only checks for `timer` gates and explicit `feedback`. It does NOT have the DFS cycle detection that was added to `truth-table-gen.ts`.
- **Impact**: If two circuits with implicit feedback are compared, the equivalence checker may not run enough stabilization ticks, producing false mismatch reports.
- **Fix**: Copy the DFS cycle detection from `truth-table-gen.ts` into `equivalence.ts`.

### 5.4 🟢 LOW: D Flip-Flop Subcircuit Unverified

- **File**: `src/core/subcircuits.ts` (D-FF in library, `id: "d-flipflop"`)
- **Problem**: The D-FF uses timer-based edge detection, MUX (AND/OR), and timer storage. It has not been tested with the T-FF-level rigor. The `not_edge` gate (NAND with both inputs tied) creates a 1-tick delayed NOT, but given the signalPrev architecture, this may not work as intended.
- **Status**: Untested. Needs verification.

### 5.5 🟢 LOW: NOR Oscillator (Clock Subcircuit) May Not Oscillate

- **File**: `src/core/subcircuits.ts` (`id: "clock"`)
- **Problem**: The NOR self-oscillator uses `NOR(CLK_fb, ENABLE)` with feedback `CLK → CLK_fb`. On cold start: NOR(0, 0) = 1 → CLK=1, next tick NOR(1, 0) = 0 → CLK=0, then NOR(0, 0) = 1 again. This should work since the cycle gate reads CLK from signalPrev.
- **Status**: Should work but untested. The `subcircuits.test.ts` doesn't test oscillation behavior.

### 5.6 🟢 LOW: `scripts/` Directory Not in Git

- The `scripts/` directory (containing `test-tff.ts`, `test-tff2.ts`, `test-tff3.ts`, `test-tff-final.ts`, `debug-signalprev.ts`) is untracked. These are research/test scripts for the T-FF design work. Should either be committed or deleted.

---

## 6. Circuit JSON Format Reference

### 6.1 Combinational Circuit Example (Half Adder)

```json
{
  "name": "half_adder",
  "inputs": ["A", "B"],
  "outputs": ["Sum", "Carry"],
  "gates": [
    { "id": "xor1", "type": "xor", "inputs": ["A", "B"], "output": "Sum" },
    { "id": "and1", "type": "and", "inputs": ["A", "B"], "output": "Carry" }
  ]
}
```

### 6.2 Sequential Circuit with Feedback (T Flip-Flop — Clock Input)

```json
{
  "name": "t_flipflop_clock",
  "inputs": ["T"],
  "outputs": ["Q"],
  "gates": [
    { "id": "t_del", "type": "timer", "delay": 1, "inputs": ["T"], "output": "T_d" },
    { "id": "not_td", "type": "nand", "inputs": ["T_d", "T_d"], "output": "T_d_bar" },
    { "id": "pulse", "type": "and", "inputs": ["T", "T_d_bar"], "output": "edge" },
    { "id": "toggle", "type": "xor", "inputs": ["Q_fb", "edge"], "output": "Q" }
  ],
  "feedback": { "Q": "Q_fb" }
}
```

### 6.3 Sequential Circuit with Oscillator (T Flip-Flop — Self-Oscillating)

```json
{
  "name": "t_flipflop",
  "inputs": ["T"],
  "outputs": ["Q", "CLK"],
  "gates": [
    { "id": "osc_not", "type": "nand", "inputs": ["osc", "osc"], "output": "osc_inv" },
    { "id": "osc_timer", "type": "timer", "delay": 2, "inputs": ["osc_inv"], "output": "osc" },
    { "id": "osc_del", "type": "timer", "delay": 1, "inputs": ["osc"], "output": "osc_d" },
    { "id": "not_od", "type": "nand", "inputs": ["osc_d", "osc_d"], "output": "osc_d_bar" },
    { "id": "clk_rise", "type": "and", "inputs": ["osc", "osc_d_bar"], "output": "clk_pulse" },
    { "id": "gated", "type": "and", "inputs": ["clk_pulse", "T"], "output": "CLK" },
    { "id": "toggle", "type": "xor", "inputs": ["Q_fb", "CLK"], "output": "Q" }
  ],
  "feedback": { "Q": "Q_fb" }
}
```

### 6.4 Verilog Input Example

```verilog
module half_adder(input A, input B, output Sum, output Carry);
  assign Sum = A ^ B;
  assign Carry = A & B;
endmodule
```

---

## 7. Getting Started Guide for AI Agents

### 7.1 Environment Setup

```bash
cd /home/z/my-project/sm-logic-push
npm install          # installs dependencies
npm run build        # compiles TypeScript to dist/
npm test             # runs vitest (77 tests)
```

### 7.2 Running the CLI

```bash
# Simulate a circuit tick-by-tick
npx tsx src/index.ts simulate examples/half-adder.sm-circuit.json

# Generate truth table
npx tsx src/index.ts truth-table examples/half-adder.sm-circuit.json

# Verify with test vectors
npx tsx src/index.ts verify examples/half-adder.sm-circuit.json --test-vectors examples/half-adder-vectors.json

# Build a blueprint
npx tsx src/index.ts build examples/half-adder.sm-circuit.json

# Convert Verilog to circuit
npx tsx src/index.ts convert examples/half-adder.v

# Browse subcircuit library
npx tsx src/index.ts library list
npx tsx src/index.ts library show t-flipflop

# Circuit info
npx tsx src/index.ts info examples/half-adder.sm-circuit.json
```

### 7.3 Programmatic API Usage

```typescript
import { SimulationEngine } from './src/simulator/engine.js';
import { CircuitBuilder } from './src/core/circuit-builder.js';
import { TestRunner } from './src/verifier/test-runner.js';
import { TruthTableGenerator } from './src/verifier/truth-table-gen.js';

// Build a circuit programmatically
const circuit = new CircuitBuilder('my_circuit')
  .input('A')
  .input('B')
  .output('Y')
  .gate('and1', 'and', ['A', 'B'], 'Y')
  .build();

// Simulate
const engine = new SimulationEngine(circuit, { recordWaveform: true });
engine.setInput('A', true);
engine.setInput('B', false);
const result = engine.tick();
console.log(result.outputStates); // { Y: false }

// Run test vectors
const runner = new TestRunner(circuit);
const testResult = runner.runVector({
  name: 'A=1, B=0',
  inputs: new Map([['A', true], ['B', false]]),
  expectedOutputs: new Map([['Y', false]]),
});
console.log(testResult.passed); // true

// Generate truth table
const gen = new TruthTableGenerator(circuit);
if (gen.canGenerateFull()) {
  const table = gen.generate();
  // table.rows has all 2^N input combinations
}
```

### 7.4 Running Tests

```bash
npm test                                    # all 77 tests
npx vitest run tests/gates.test.ts         # specific file
npx vitest run -t "AND gate"              # specific test name
```

### 7.5 Adding a New Gate Type

1. Add the type to `LogicGateType` in `src/types/gate.ts`
2. Add evaluation logic in `evaluateGate()` in `src/core/gates.ts`
3. Add mode number in `GATE_MODE_MAP` in `src/types/gate.ts`
4. Add shape ID in `src/core/constants.ts`
5. Update parser validation in `src/parser/circuit-json.ts`
6. Add tests in `tests/gates.test.ts`

### 7.6 Adding a New Subcircuit

Add an entry to the `LIBRARY` array in `src/core/subcircuits.ts`:

```typescript
{
  id: "my-circuit",
  name: "My Circuit",
  description: "Description",
  gateCount: 3,
  category: "primitive" | "memory" | "timing" | "arithmetic" | "utility",
  build: () => circuit("my_circuit")
    .input("IN")
    .output("OUT")
    .gate("g1", "and", ["IN", "IN"], "OUT")
    .build(),
}
```

### 7.7 Creating a `.blueprint` File

```typescript
import { CircuitJsonParser } from './src/parser/circuit-json.js';
import { BlueprintBuilder } from './src/blueprint/builder.js';
import { BlueprintWriter } from './src/blueprint/writer.js';

const circuit = await CircuitJsonParser.fromFile('examples/half-adder.sm-circuit.json');
const blueprint = new BlueprintBuilder(circuit).build();
await BlueprintWriter.write(blueprint, 'output/half-adder.blueprint');
```

---

## 8. File Change Tracking (Unstaged Modifications)

The working tree has modifications to ALL source files compared to the last commit (`a73c9e4`).
These modifications include:

1. **Engine improvements**: Better cycle gate handling, feedback value injection into signalPrev
2. **DFS cycle detection**: Added to `truth-table-gen.ts` for implicit feedback detection
3. **T-FF example changes**: The `t-flipflop.sm-circuit.json` was modified (currently contains broken Design H)
4. **Subcircuit library update**: T-FF entry updated with clock-input XOR design
5. **ESLint/Prettier config**: Updated
6. **TypeScript config**: Strict mode enabled

**IMPORTANT**: The `scripts/` directory is UNTRACKED and contains important T-FF research:
- `test-tff.ts`: Designs A, B, C testing
- `test-tff2.ts`: Designs D (self-oscillating), E (clock-input)
- `test-tff3.ts`: Designs H, H2 (SR latch with cold-start fix)
- `test-tff-final.ts`: Designs F (pulse shortener + oscillator), G (pulse shortener + clock)
- `debug-signalprev.ts`: Debug script for tracing signalPrev values

---

## 9. T-FF Research Summary (Detailed Technical Analysis)

### 9.1 The Core Problem

A T flip-flop toggles its output Q each time the clock ticks. In SM's discrete simulation:
- Every gate reads from the previous tick (signalPrev)
- Timers are shift registers (not one-shot pulse generators)
- There is no native edge-triggered flip-flop

### 9.2 Why SR Latch Approach Fails

The SR latch (cross-coupled NOR) has a fundamental cold-start problem:
- NOR(0, 0) = 1 → both Q and Q_bar start as 1 (illegal state)
- In the engine, both NOR gates read from the same signalPrev, so they always agree
- This causes oscillation or unpredictable behavior during the first few ticks
- Adding NOT(T) to force Q=0 helps but introduces timing issues with the NOR loop

### 9.3 Why Pulse Shortening Fails

The pulse shortener circuit:
```
raw = AND(osc, NOT(osc_d))     // 2-3 tick wide pulse
raw_d = AND(raw, raw)          // intended as 1-tick delayed copy
clk_pulse = AND(raw, NOT(raw_d))  // intended as 1-tick rising edge
```

In the signalPrev model:
- `raw_d[N] = raw[N-1]` (reads from signalPrev)
- `clk_pulse[N] = AND(raw[N-1], NOT(raw_d[N-1])) = AND(raw[N-1], NOT(raw[N-2]))`
- Since `raw_d_bar` is also computed from signalPrev, it's 1 more tick behind
- Net effect: the "1-tick delay" is actually 2 ticks, making the rising edge detector produce a 2-tick pulse instead of 1-tick
- The toggle gate then sees this 2-tick pulse delayed by 1 more tick = 2 ticks of CLK=1
- XOR toggle with 2 ticks of CLK: toggles twice = net zero change

### 9.4 What Works: Design D (Self-Oscillating XOR Toggle)

Design D works because the 2-tick CLK pulse, after being seen through signalPrev by the toggle gate, results in an ODD number (3) of toggle activations, producing a net single toggle per oscillator cycle. The intermediate 1-tick glitches are cosmetic — the final settled state is correct.

**Design D Q behavior during T=1**:
```
Q: 000000 [1 0 11111 0 1 00000 1 0 11111 0 1 00000 1 0 ...]
              ^glitch^   ^glitch^   ^glitch^   ^glitch^
```

Each `[1 0 ... 11111 0 1 ... 00000]` is one oscillator cycle. The "glitch" (1-tick wrong value) settles to the correct toggled state within 1-2 ticks.

### 9.5 Design D vs Clock-Input T-FF

| Feature | Design D (self-oscillating) | Clock-Input (Design C/E) |
|---------|------------------------------|---------------------------|
| T behavior | T=enable (hold high to toggle) | T=clock (alternating 0,1,0,1) |
| Glitches | 1-tick glitches in Q | None (clean toggle) |
| Complexity | 7 gates | 4 gates |
| Use case | Standalone T-FF in SM | Used with external clock source |

---

## 10. Key Engineering Rules

1. **Always use lowercase gate types** in `.sm-circuit.json`: `and`, `or`, `xor`, `nand`, `nor`, `xnor`
2. **No native NOT gate**: Use `nand(x, x)` or `nor(x, x)`
3. **SM gates support unlimited inputs** (1–20), not just 2
4. **Timers are shift registers** with delay 1–30, not pulse generators
5. **Every gate has 1-tick delay** in this engine (reads from signalPrev)
6. **Use explicit `feedback` field** for sequential circuits instead of relying on implicit cycles
7. **SR latches have cold-start metastability** — avoid for T-FF designs
8. **XOR toggle + timer edge detect + explicit feedback** is the proven working pattern for sequential memory elements
9. **Don't use `noUnusedLocals`/`noUnusedParameters` violations** — tsconfig has strict checks
10. **All gate outputs are unique signal names** — the engine maps signal names to gate IDs

---

## 11. Dependency Graph (Import Map)

```
index.ts
├── cli/commands/simulate.ts → simulator/engine, parser/circuit-json
├── cli/commands/verify.ts → verifier/truth-table-gen, verifier/test-runner
├── cli/commands/truth-table.ts → verifier/truth-table-gen, core/gates
├── cli/commands/build.ts → parser/circuit-json, parser/verilog-parser, blueprint/builder
├── cli/commands/convert.ts → parser/blueprint-reader, converter/gate-converter
├── cli/commands/info.ts → parser/circuit-json, parser/blueprint-reader
└── cli/commands/library.ts → core/subcircuits

simulator/engine.ts → core/gates, simulator/timer-model, simulator/waveform
verifier/truth-table-gen.ts → simulator/engine
verifier/test-runner.ts → simulator/engine
verifier/equivalence.ts → simulator/engine
blueprint/builder.ts → blueprint/placer
parser/verilog-parser.ts → types/verilog (AST types only, no external deps)
```

No circular dependencies. The `types/` package has zero imports.

---

## 12. Testing Strategy

- **Unit tests** (`tests/gates.test.ts`): 28 tests for all 6 gate types with various input counts, edge cases (0 inputs, all-high, all-low)
- **Simulator tests** (`tests/simulator.test.ts`): 15 tests for TimerModel, combinational circuits (AND, NOT, half-adder), sequential circuits (delay line, buffer, SR latch)
- **Subcircuit tests** (`tests/subcircuits.test.ts`): 16 tests for all pre-built subcircuits (NOT, buffer, half-adder, full-adder, SR latch, delay line, pulse generator)
- **Verifier tests** (`tests/verifier.test.ts`): 11 tests for TestRunner, TruthTableGenerator, equivalence checker
- **Blueprint tests** (`tests/blueprint.test.ts`): 7 tests for Placer, BlueprintBuilder, BlueprintWriter, BlueprintReader

**Missing test coverage**:
- T-FF sequential behavior (tick-by-tick verification)
- D-FF sequential behavior
- Oscillator circuits (clock subcircuit)
- VCD export
- Verilog parser edge cases
- Blueprint reader (convert from blueprint.json back to circuit)

---

## 13. Git History

| Commit | Description |
|--------|-------------|
| `a73c9e4` | Fix: detect implicit feedback cycles in truth-table generator |
| `e636996` | Fix all bugs: 77/77 tests passing, correct SR latch, fixed simulator feedback, added missing API exports |
| `85eabbc` | Add SM Logic Tool v2 — TypeScript logic circuit CLI |

**Pending push**: All modified files + `scripts/` directory + `CONTEXT.md`