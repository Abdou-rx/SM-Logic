/**
 * SimulationEngine implements tick-by-tick simulation of Scrap Mechanic circuits.
 *
 * Key SM behaviors modeled:
 * - Gates read from previous tick state (1-tick propagation delay per gate)
 * - Timers are shift registers with configurable delay
 * - Feedback loops are handled via iterative evaluation until stable
 *
 * Resolution process (in constructor):
 * 1. Create internal CircuitNode for each gate
 * 2. Map signal names to producing gate IDs
 * 3. Build source gate dependencies
 * 4. Compute topological order via Kahn's algorithm
 * 5. Identify cycle gates (feedback loops)
 * 6. Initialize timer models
 */

import type {
  CircuitDefinition,
  CircuitNode,
  ResolvedCircuit,
  FeedbackMapping,
} from "../types/circuit.js";
import type { GateConfig, GateType, LogicGateType } from "../types/gate.js";
import type {
  TickResult,
  WaveformRecord,
  VCDExportOptions,
} from "../types/simulation.js";
import { evaluateGateFromInputs } from "../core/gates.js";
import { SM_TIMING } from "../types/simulation.js";
import { TimerModel } from "./timer-model.js";
import { WaveformRecorder } from "./waveform.js";
import { writeFileSync } from "node:fs";

// ---------------------------------------------------------------------------
// Extended tick result used by the engine (extends the base TickResult type
// with additional fields needed by CLI output and test runners)
// ---------------------------------------------------------------------------

/** Result of a single simulation tick with full signal detail */
export interface EngineTickResult extends TickResult {
  /** Tick number (alias for tickNumber for convenience) */
  readonly tick: number;
  /** Time in seconds at this tick */
  readonly timeSeconds: number;
  /** Current input signal values */
  readonly inputs: ReadonlyMap<string, boolean>;
  /** Current output signal values */
  readonly outputs: ReadonlyMap<string, boolean>;
  /** Internal (non-input, non-output) signal values */
  readonly internalSignals: ReadonlyMap<string, boolean>;
  /** Names of signals that changed value on this tick */
  readonly changedSignals: readonly string[];
}

/** Summary of a completed simulation run */
export interface SimulationSummary {
  readonly totalTicks: number;
  readonly totalSignalChanges: number;
  readonly finalOutputs: ReadonlyMap<string, boolean>;
  readonly reachedStability: boolean;
  readonly stabilityTick: number | undefined;
}

/** Configuration options for the SimulationEngine constructor */
export interface EngineConfig {
  readonly recordWaveform?: boolean;
}

/** Maximum iterations for feedback loop resolution per tick */
const MAX_FEEDBACK_ITERATIONS = 10;

// ---------------------------------------------------------------------------
// Type guard
// ---------------------------------------------------------------------------

/**
 * Check if a GateType is a combinational logic gate (not timer/input/output).
 */
function isLogicGateType(type: GateType): type is LogicGateType {
  return (
    type === "and" ||
    type === "or" ||
    type === "xor" ||
    type === "nand" ||
    type === "nor" ||
    type === "xnor"
  );
}

// ---------------------------------------------------------------------------
// Circuit resolution
// ---------------------------------------------------------------------------

interface CircuitResolution {
  readonly resolved: ResolvedCircuit;
  readonly gateById: Map<string, GateConfig>;
  readonly signalToGateId: Map<string, string>;
  readonly combinationalOrder: readonly string[];
  readonly cycleGateIds: ReadonlySet<string>;
  readonly timerGateIds: ReadonlySet<string>;
  readonly allSignalNames: readonly string[];
}

interface KahnSortResult {
  readonly combinationalOrder: readonly string[];
  readonly cycleGateIds: ReadonlySet<string>;
}

/**
 * Resolve a CircuitDefinition into internal simulation structures.
 * Builds node graph, computes topological order, identifies cycles.
 */
function resolveCircuit(circuit: CircuitDefinition): CircuitResolution {
  const gateById = new Map<string, GateConfig>();
  const signalToGateId = new Map<string, string>();

  // First pass: build signal-to-gate mapping
  for (const gate of circuit.gates) {
    gateById.set(gate.id, gate);
    signalToGateId.set(gate.output, gate.id);
  }

  // Second pass: create nodes with resolved source dependencies
  const nodes = new Map<string, CircuitNode>();
  for (const gate of circuit.gates) {
    const sourceIds: string[] = [];
    for (const inputSig of gate.inputs) {
      const srcId = signalToGateId.get(inputSig);
      if (srcId !== undefined && srcId !== gate.id) {
        sourceIds.push(srcId);
      }
    }

    const node: CircuitNode = {
      id: gate.id,
      type: gate.type,
      isInput: circuit.inputs.includes(gate.output),
      isOutput: circuit.outputs.includes(gate.output),
      delay: gate.delay ?? 0,
      sourceGateIds: sourceIds,
      state: { currentState: false, prevState: false },
    };

    nodes.set(gate.id, node);
  }

  // Topological sort via Kahn's algorithm
  const { combinationalOrder, cycleGateIds } = kahnSort(nodes);

  // Identify timer gates
  const timerGateIds = new Set<string>();
  for (const gate of circuit.gates) {
    if (gate.type === "timer") {
      timerGateIds.add(gate.id);
    }
  }

  const feedback: FeedbackMapping = circuit.feedback ?? {};
  const hasFeedback = cycleGateIds.size > 0 || Object.keys(feedback).length > 0;

  // Collect all signal names (inputs + all gate outputs)
  const allSignalNames = [...circuit.inputs];
  for (const gate of circuit.gates) {
    if (!allSignalNames.includes(gate.output)) {
      allSignalNames.push(gate.output);
    }
  }

  const resolved: ResolvedCircuit = {
    name: circuit.name,
    description: circuit.description ?? "",
    version: circuit.version ?? "1.0.0",
    inputNames: circuit.inputs,
    outputNames: circuit.outputs,
    nodes,
    feedback,
    topologicalOrder: [...combinationalOrder, ...cycleGateIds],
    hasFeedback,
  };

  return {
    resolved,
    gateById,
    signalToGateId,
    combinationalOrder,
    cycleGateIds,
    timerGateIds,
    allSignalNames,
  };
}

/**
 * Kahn's algorithm for topological sorting.
 * Returns gates in dependency order. Gates remaining after the algorithm
 * completes are in cycles (feedback loops).
 */
function kahnSort(nodes: ReadonlyMap<string, CircuitNode>): KahnSortResult {
  // Build in-degree map and adjacency list
  const inDegree = new Map<string, number>();
  const dependents = new Map<string, string[]>(); // gateId → list of gate IDs that depend on it

  for (const [id, node] of nodes) {
    inDegree.set(id, node.sourceGateIds.length);
    dependents.set(id, []);
  }

  for (const [id, node] of nodes) {
    for (const srcId of node.sourceGateIds) {
      const deps = dependents.get(srcId);
      if (deps !== undefined) {
        deps.push(id);
      }
    }
  }

  // Initialize queue with zero-in-degree nodes
  const queue: string[] = [];
  for (const [id, degree] of inDegree) {
    if (degree === 0) {
      queue.push(id);
    }
  }

  const combinationalOrder: string[] = [];

  while (queue.length > 0) {
    const id = queue.shift()!;
    combinationalOrder.push(id);

    for (const depId of dependents.get(id) ?? []) {
      const newDegree = (inDegree.get(depId) ?? 1) - 1;
      inDegree.set(depId, newDegree);
      if (newDegree === 0) {
        queue.push(depId);
      }
    }
  }

  // Remaining nodes are in cycles (feedback loops)
  const combinationalSet = new Set(combinationalOrder);
  const cycleGateIds = new Set<string>();
  for (const [id] of nodes) {
    if (!combinationalSet.has(id)) {
      cycleGateIds.add(id);
    }
  }

  return { combinationalOrder, cycleGateIds };
}

// ---------------------------------------------------------------------------
// Signal snapshot equality
// ---------------------------------------------------------------------------

function snapshotsEqual(
  a: Readonly<Record<string, boolean>>,
  b: Readonly<Record<string, boolean>>,
): boolean {
  const keysA = Object.keys(a);
  const keysB = Object.keys(b);
  if (keysA.length !== keysB.length) return false;
  for (const key of keysA) {
    if (a[key] !== b[key]) return false;
  }
  return true;
}

// ---------------------------------------------------------------------------
// SimulationEngine
// ---------------------------------------------------------------------------

/**
 * SimulationEngine implements tick-by-tick simulation of Scrap Mechanic circuits.
 *
 * The engine resolves the circuit definition on construction, builds a
 * topological evaluation order, and supports both combinational and sequential
 * (timer/feedback) circuits.
 */
export class SimulationEngine {
  private readonly circuit: CircuitDefinition;
  private readonly resolution: CircuitResolution;
  private readonly timerModels: Map<string, TimerModel>;
  private readonly waveformRecorder: WaveformRecorder;
  private recordWaveform: boolean;
  private inputValues: Map<string, boolean>;
  private feedbackValues: Map<string, boolean>;
  private tickCount: number;
  private stableCount: number;
  private reachedStability: boolean;
  private stabilityTick: number | undefined;

  /**
   * Create a new simulation engine for the given circuit.
   *
   * @param circuit - The circuit definition to simulate
   * @param config  - Optional engine configuration
   */
  constructor(circuit: CircuitDefinition, config?: Partial<EngineConfig>) {
    this.circuit = circuit;
    this.resolution = resolveCircuit(circuit);
    this.timerModels = new Map<string, TimerModel>();
    this.waveformRecorder = new WaveformRecorder();
    this.recordWaveform = config?.recordWaveform ?? false;
    this.inputValues = new Map<string, boolean>();
    this.feedbackValues = new Map<string, boolean>();
    this.tickCount = 0;
    this.stableCount = 0;
    this.reachedStability = false;
    this.stabilityTick = undefined;

    // Initialize all input values to false
    for (const name of circuit.inputs) {
      this.inputValues.set(name, false);
    }

    // Initialize timer models for each timer gate
    for (const gateId of this.resolution.timerGateIds) {
      const gate = this.resolution.gateById.get(gateId);
      if (gate !== undefined && gate.delay !== undefined) {
        this.timerModels.set(gateId, new TimerModel(gate.delay));
      }
    }

    // Initialize waveform recording
    if (this.recordWaveform) {
      this.waveformRecorder.initSignals(this.resolution.allSignalNames);
    }
  }

  // -----------------------------------------------------------------------
  // Input control
  // -----------------------------------------------------------------------

  /**
   * Set input signal values from a Record (object).
   * Accepts either Record<string, boolean> or ReadonlyMap<string, boolean>.
   */
  setInputs(inputs: ReadonlyMap<string, boolean> | Readonly<Record<string, boolean>>): void {
    const entries =
      inputs instanceof Map ? inputs.entries() : Object.entries(inputs);
    for (const [name, value] of entries) {
      if (!this.circuit.inputs.includes(name)) {
        throw new Error(
          `Unknown input: "${name}". Available inputs: ${this.circuit.inputs.join(", ")}`,
        );
      }
      this.inputValues.set(name, value);
    }
  }

  /**
   * Set a single input signal value.
   */
  setInput(name: string, value: boolean): void {
    if (!this.circuit.inputs.includes(name)) {
      throw new Error(
        `Unknown input: "${name}". Available inputs: ${this.circuit.inputs.join(", ")}`,
      );
    }
    this.inputValues.set(name, value);
  }

  // -----------------------------------------------------------------------
  // Tick execution
  // -----------------------------------------------------------------------

  /**
   * Execute one simulation tick.
   *
   * Process:
   * 1. Copy currentState → prevState for ALL nodes
   * 2. Set input nodes' currentState from setInput values
   * 3. Evaluate gates in topological order using evaluateGateFromInputs()
   * 4. Timer gates: shift register behavior
   * 5. Feedback loops: run multiple passes until stable (max 10 iterations)
   * 6. Record waveform if enabled
   *
   * @returns Detailed tick result with all signal states
   */
  tick(): EngineTickResult {
    const prevOutputSnapshot = this.captureOutputSnapshot();

    // 1. Copy currentState → prevState for ALL nodes
    for (const node of this.resolution.resolved.nodes.values()) {
      node.state.prevState = node.state.currentState;
    }

    // 2. Set input nodes' currentState from setInput values
    for (const name of this.circuit.inputs) {
      const gateId = this.resolution.signalToGateId.get(name);
      if (gateId !== undefined) {
        const node = this.resolution.resolved.nodes.get(gateId);
        if (node !== undefined) {
          node.state.currentState = this.inputValues.get(name) ?? false;
        }
      }
    }

    // Build signal-to-previous-state map for reading during evaluation
    const signalPrev = this.buildSignalPrevMap();

    // 3. Evaluate gates in topological (combinational) order
    for (const gateId of this.resolution.combinationalOrder) {
      this.evaluateGateAt(gateId, signalPrev);
    }

    // 4. Timer gates: shift register behavior
    for (const gateId of this.resolution.timerGateIds) {
      const node = this.resolution.resolved.nodes.get(gateId);
      if (node === undefined) continue;
      const gate = this.resolution.gateById.get(gateId);
      if (gate === undefined) continue;

      const timer = this.timerModels.get(gateId);
      if (timer === undefined) continue;

      const inputSig = gate.inputs[0];
      const inputValue = signalPrev.get(inputSig ?? "") ?? false;
      node.state.currentState = timer.tick(inputValue);
    }

    // 5. Feedback loops: iterate until stable (max iterations)
    for (let iter = 0; iter < MAX_FEEDBACK_ITERATIONS; iter++) {
      let anyChanged = false;

      for (const gateId of this.resolution.cycleGateIds) {
        const node = this.resolution.resolved.nodes.get(gateId);
        if (node === undefined || node.type === "timer" || node.type === "input") {
          continue;
        }

        const gate = this.resolution.gateById.get(gateId);
        if (gate === undefined) continue;

        // Read from current state for cycle resolution
        const inputValues: boolean[] = [];
        for (const inputSig of gate.inputs) {
          const srcGateId = this.resolution.signalToGateId.get(inputSig);
          if (srcGateId !== undefined) {
            const srcNode = this.resolution.resolved.nodes.get(srcGateId);
            inputValues.push(srcNode?.state.currentState ?? false);
          } else {
            // Circuit input or feedback signal
            inputValues.push(
              this.inputValues.get(inputSig) ??
                this.feedbackValues.get(inputSig) ??
                false,
            );
          }
        }

        if (isLogicGateType(node.type)) {
          const result = evaluateGateFromInputs(node.type, inputValues);
          if (result !== node.state.currentState) {
            node.state.currentState = result;
            anyChanged = true;
          }
        } else if (node.type === "output") {
          // Output gate: passthrough from input
          const result = inputValues[0] ?? false;
          if (result !== node.state.currentState) {
            node.state.currentState = result;
            anyChanged = true;
          }
        }
      }

      if (!anyChanged) break;
    }

    // Apply explicit feedback mappings (from circuit.feedback)
    for (const [source, target] of Object.entries(this.resolution.resolved.feedback)) {
      const srcGateId = this.resolution.signalToGateId.get(source);
      if (srcGateId !== undefined) {
        const srcNode = this.resolution.resolved.nodes.get(srcGateId);
        const value = srcNode?.state.currentState ?? false;
        this.feedbackValues.set(target, value);
      }
    }

    // 6. Record waveform if enabled
    if (this.recordWaveform) {
      this.waveformRecorder.recordState(this.tickCount, this.buildAllStatesMap());
    }

    // Build result
    const currentSnapshot = this.captureOutputSnapshot();
    const changed = !snapshotsEqual(prevOutputSnapshot, currentSnapshot);

    // Track stability
    if (changed) {
      this.stableCount = 0;
      this.reachedStability = false;
      this.stabilityTick = undefined;
    } else {
      this.stableCount++;
      if (!this.reachedStability) {
        this.reachedStability = true;
        this.stabilityTick = this.tickCount;
      }
    }

    // Compute changed signal names
    const changedSignals = this.computeChangedSignals(prevOutputSnapshot, currentSnapshot);

    const result: EngineTickResult = {
      tickNumber: this.tickCount,
      tick: this.tickCount,
      timeSeconds: this.tickCount * SM_TIMING.TICK_DURATION,
      inputStates: this.buildInputStatesRecord(),
      outputStates: currentSnapshot,
      allStates: this.buildAllStatesRecord(),
      changed,
      inputs: this.buildInputStatesMap(),
      outputs: this.buildOutputStatesMap(),
      internalSignals: this.buildInternalStatesMap(),
      changedSignals,
    };

    this.tickCount++;
    return result;
  }

  /**
   * Run N ticks and return all results.
   */
  tickN(n: number): EngineTickResult[] {
    const results: EngineTickResult[] = [];
    for (let i = 0; i < n; i++) {
      results.push(this.tick());
    }
    return results;
  }

  /**
   * Run simulation until stability is reached or max ticks.
   * Stability is defined as no signal changes for `threshold` consecutive ticks.
   */
  runUntilStable(maxTicks: number, threshold: number = 3): EngineTickResult[] {
    const results: EngineTickResult[] = [];
    let consecutiveStable = 0;

    for (let i = 0; i < maxTicks; i++) {
      const result = this.tick();
      results.push(result);

      if (!result.changed) {
        consecutiveStable++;
        if (consecutiveStable >= threshold) {
          break;
        }
      } else {
        consecutiveStable = 0;
      }
    }

    return results;
  }

  // -----------------------------------------------------------------------
  // State queries
  // -----------------------------------------------------------------------

  /**
   * Get the current state of all named signals as a Record.
   */
  getState(): Record<string, boolean> {
    return this.buildAllStatesRecord();
  }

  /**
   * Get the current value of a specific signal by name.
   */
  getSignal(name: string): boolean {
    // Check input values
    if (this.inputValues.has(name)) {
      return this.inputValues.get(name) ?? false;
    }
    // Check gate outputs
    for (const [id, node] of this.resolution.resolved.nodes) {
      const gate = this.resolution.gateById.get(id);
      if (gate !== undefined && gate.output === name) {
        return node.state.currentState;
      }
    }
    return false;
  }

  /**
   * Get the current output signal values as a Map.
   */
  getOutputs(): ReadonlyMap<string, boolean> {
    return this.buildOutputStatesMap();
  }

  /**
   * Get the current input signal values as a Map.
   */
  getInputs(): ReadonlyMap<string, boolean> {
    return this.buildInputStatesMap();
  }

  /**
   * Get the current tick count.
   */
  getCurrentTick(): number {
    return this.tickCount;
  }

  /**
   * Check if the simulation has reached stability.
   */
  isStable(): boolean {
    return this.reachedStability;
  }

  /**
   * Get the tick number at which stability was first reached.
   */
  getStabilityTick(): number | undefined {
    return this.stabilityTick;
  }

  // -----------------------------------------------------------------------
  // Reset
  // -----------------------------------------------------------------------

  /**
   * Reset the simulation to initial state (all signals false, tick count 0).
   */
  reset(): void {
    this.tickCount = 0;
    this.stableCount = 0;
    this.reachedStability = false;
    this.stabilityTick = undefined;

    this.inputValues = new Map<string, boolean>();
    for (const name of this.circuit.inputs) {
      this.inputValues.set(name, false);
    }

    this.feedbackValues = new Map<string, boolean>();

    for (const node of this.resolution.resolved.nodes.values()) {
      node.state.currentState = false;
      node.state.prevState = false;
    }

    for (const timer of this.timerModels.values()) {
      timer.reset();
    }

    this.waveformRecorder.clear();
    if (this.recordWaveform) {
      this.waveformRecorder.initSignals(this.resolution.allSignalNames);
    }
  }

  // -----------------------------------------------------------------------
  // Waveform
  // -----------------------------------------------------------------------

  /**
   * Get the recorded waveform data.
   */
  getWaveform(): WaveformRecord[] {
    return this.waveformRecorder.getAllWaveforms();
  }

  /**
   * Get the waveform recorder instance for advanced usage.
   */
  getWaveformRecorder(): WaveformRecorder {
    return this.waveformRecorder;
  }

  /**
   * Enable waveform recording (can be called after construction).
   */
  enableWaveformRecording(): void {
    this.recordWaveform = true;
    this.waveformRecorder.initSignals(this.resolution.allSignalNames);
  }

  // -----------------------------------------------------------------------
  // VCD Export
  // -----------------------------------------------------------------------

  /**
   * Export the recorded waveform to a VCD file.
   */
  exportVCD(path: string): void {
    const options: VCDExportOptions = {
      timescale: `${SM_TIMING.TICK_MS}ms`,
      moduleName: this.circuit.name.replace(/\s+/g, "_"),
    };
    const content = this.waveformRecorder.exportVCD(options);
    writeFileSync(path, content, "utf-8");
  }

  /**
   * Get the VCD file content as a string.
   */
  getVCDString(): string {
    return this.waveformRecorder.vcdToString();
  }

  // -----------------------------------------------------------------------
  // Summary
  // -----------------------------------------------------------------------

  /**
   * Get a summary of the simulation run.
   */
  getSummary(): SimulationSummary {
    const finalOutputs = this.buildOutputStatesMap();
    return {
      totalTicks: this.tickCount,
      totalSignalChanges: this.waveformRecorder.getTotalChanges(),
      finalOutputs,
      reachedStability: this.reachedStability,
      stabilityTick: this.stabilityTick,
    };
  }

  // -----------------------------------------------------------------------
  // Private helpers
  // -----------------------------------------------------------------------

  /**
   * Build a map of signal name → previous-tick value.
   * Includes circuit inputs, feedback values, and all gate output signals.
   */
  private buildSignalPrevMap(): Map<string, boolean> {
    const map = new Map<string, boolean>();

    // Circuit input values
    for (const [name, value] of this.inputValues) {
      map.set(name, value);
    }

    // Feedback values
    for (const [name, value] of this.feedbackValues) {
      map.set(name, value);
    }

    // All gate output previous states
    for (const [id, node] of this.resolution.resolved.nodes) {
      const gate = this.resolution.gateById.get(id);
      if (gate !== undefined) {
        map.set(gate.output, node.state.prevState);
      }
    }

    return map;
  }

  /**
   * Evaluate a single gate during combinational evaluation.
   * Reads input values from the signalPrev map (previous tick).
   */
  private evaluateGateAt(gateId: string, signalPrev: Map<string, boolean>): void {
    const node = this.resolution.resolved.nodes.get(gateId);
    if (node === undefined) return;
    const gate = this.resolution.gateById.get(gateId);
    if (gate === undefined) return;

    // Skip input and timer gates (handled separately)
    if (node.type === "input" || node.type === "timer") return;

    if (isLogicGateType(node.type)) {
      const inputValues: boolean[] = [];
      for (const inputSig of gate.inputs) {
        inputValues.push(signalPrev.get(inputSig) ?? false);
      }
      node.state.currentState = evaluateGateFromInputs(node.type, inputValues);
    } else if (node.type === "output") {
      // Output gate: passthrough from its first input signal
      const inputSig = gate.inputs[0];
      node.state.currentState = signalPrev.get(inputSig ?? "") ?? false;
    }
  }

  /**
   * Capture a snapshot of current output signal values as a Record.
   */
  private captureOutputSnapshot(): Record<string, boolean> {
    const snapshot: Record<string, boolean> = {};
    for (const name of this.circuit.outputs) {
      const gateId = this.resolution.signalToGateId.get(name);
      if (gateId !== undefined) {
        const node = this.resolution.resolved.nodes.get(gateId);
        snapshot[name] = node?.state.currentState ?? false;
      } else {
        snapshot[name] = false;
      }
    }
    return snapshot;
  }

  /**
   * Build input states as a Record.
   */
  private buildInputStatesRecord(): Record<string, boolean> {
    const states: Record<string, boolean> = {};
    for (const name of this.circuit.inputs) {
      states[name] = this.inputValues.get(name) ?? false;
    }
    return states;
  }

  /**
   * Build all signal states as a Record.
   */
  private buildAllStatesRecord(): Record<string, boolean> {
    const states: Record<string, boolean> = {};

    // Circuit inputs
    for (const name of this.circuit.inputs) {
      states[name] = this.inputValues.get(name) ?? false;
    }

    // All gate output signals
    for (const [id, node] of this.resolution.resolved.nodes) {
      const gate = this.resolution.gateById.get(id);
      if (gate !== undefined) {
        states[gate.output] = node.state.currentState;
      }
    }

    return states;
  }

  /**
   * Build all signal states as a Map.
   */
  private buildAllStatesMap(): Map<string, boolean> {
    const map = new Map<string, boolean>();

    for (const name of this.circuit.inputs) {
      map.set(name, this.inputValues.get(name) ?? false);
    }

    for (const [id, node] of this.resolution.resolved.nodes) {
      const gate = this.resolution.gateById.get(id);
      if (gate !== undefined) {
        map.set(gate.output, node.state.currentState);
      }
    }

    return map;
  }

  /**
   * Build output states as a Map.
   */
  private buildOutputStatesMap(): Map<string, boolean> {
    const map = new Map<string, boolean>();
    for (const name of this.circuit.outputs) {
      const gateId = this.resolution.signalToGateId.get(name);
      if (gateId !== undefined) {
        const node = this.resolution.resolved.nodes.get(gateId);
        map.set(name, node?.state.currentState ?? false);
      } else {
        map.set(name, false);
      }
    }
    return map;
  }

  /**
   * Build input states as a Map.
   */
  private buildInputStatesMap(): Map<string, boolean> {
    const map = new Map<string, boolean>();
    for (const name of this.circuit.inputs) {
      map.set(name, this.inputValues.get(name) ?? false);
    }
    return map;
  }

  /**
   * Build internal (non-input, non-output) signal states as a Map.
   */
  private buildInternalStatesMap(): Map<string, boolean> {
    const map = new Map<string, boolean>();
    const inputSet = new Set(this.circuit.inputs);
    const outputSet = new Set(this.circuit.outputs);

    for (const [id, node] of this.resolution.resolved.nodes) {
      const gate = this.resolution.gateById.get(id);
      if (gate !== undefined && !inputSet.has(gate.output) && !outputSet.has(gate.output)) {
        map.set(gate.output, node.state.currentState);
      }
    }

    return map;
  }

  /**
   * Compute the list of signal names that changed between two snapshots.
   */
  private computeChangedSignals(
    prev: Readonly<Record<string, boolean>>,
    curr: Readonly<Record<string, boolean>>,
  ): readonly string[] {
    const changed: string[] = [];
    for (const key of Object.keys(curr)) {
      if (curr[key] !== prev[key]) {
        changed.push(key);
      }
    }
    return changed;
  }
}
