import { describe, it, expect } from 'vitest';
import { SimulationEngine } from '../src/simulator/engine.ts';
import { TimerModel } from '../src/simulator/timer-model.ts';
import { createHalfAdder, createNotGate, createDelayLine, createBuffer } from '../src/core/subcircuits.ts';
import { CircuitBuilder } from '../src/core/circuit-builder.ts';

describe('TimerModel', () => {
  it('creates with valid delay', () => {
    const timer = new TimerModel(5);
    expect(timer.getDelay()).toBe(5);
  });

  it('throws for invalid delay', () => {
    expect(() => new TimerModel(0)).toThrow();
    expect(() => new TimerModel(31)).toThrow();
    expect(() => new TimerModel(2.5)).toThrow();
  });

  it('delays signal by configured ticks', () => {
    const timer = new TimerModel(3);

    // First 3 ticks: output should be false (register filling up)
    expect(timer.tick(true)).toBe(false);
    expect(timer.tick(true)).toBe(false);
    expect(timer.tick(true)).toBe(false);

    // After 3 ticks: output should be the value from 3 ticks ago
    expect(timer.tick(false)).toBe(true); // The true from tick 0 comes out
    expect(timer.tick(false)).toBe(true); // The true from tick 1 comes out
    expect(timer.tick(false)).toBe(true); // The true from tick 2 comes out
    expect(timer.tick(false)).toBe(false); // The false from tick 3 comes out
  });

  it('resets to all zeros', () => {
    const timer = new TimerModel(2);
    timer.tick(true);
    timer.tick(true);
    timer.reset();
    expect(timer.getRegisterContents()).toEqual([false, false]);
  });

  it('clones correctly', () => {
    const timer = new TimerModel(2);
    timer.tick(true);
    timer.tick(false);
    const clone = timer.clone();
    expect(clone.getDelay()).toBe(2);
    expect(clone.peekOutput()).toBe(false);
  });
});

describe('SimulationEngine', () => {
  it('simulates a simple AND gate', () => {
    const circuit = new CircuitBuilder('test_and')
      .input('A').input('B')
      .output('OUT')
      .gate('and1', 'and', ['A', 'B'], 'OUT')
      .build();

    const engine = new SimulationEngine(circuit);
    engine.setInput('A', true);
    engine.setInput('B', true);

    engine.tick(); // Tick 0: apply, gates evaluate from prev state
    engine.tick(); // Tick 1: gates now see the inputs

    const outputs = engine.getOutputs();
    expect(outputs.get('OUT')).toBe(true);
  });

  it('simulates a NOT gate correctly', () => {
    const circuit = createNotGate();
    const engine = new SimulationEngine(circuit);

    engine.setInput('IN', true);
    engine.tick(); // Load inputs
    engine.tick(); // Gate evaluates

    expect(engine.getOutputs().get('OUT')).toBe(false);
  });

  it('simulates a buffer correctly', () => {
    const circuit = createBuffer();
    const engine = new SimulationEngine(circuit);

    engine.setInput('IN', true);
    engine.runUntilStable(10);
    expect(engine.getOutputs().get('OUT')).toBe(true);
  });

  it('simulates a half adder', () => {
    const circuit = createHalfAdder();

    // Test all input combinations
    const tests: Array<[boolean, boolean, boolean, boolean]> = [
      [false, false, false, false],
      [true, false, true, false],
      [false, true, true, false],
      [true, true, false, true],
    ];

    for (const [a, b, expectedSum, expectedCarry] of tests) {
      const engine = new SimulationEngine(circuit);
      engine.setInput('A', a);
      engine.setInput('B', b);
      engine.runUntilStable(10);

      expect(engine.getOutputs().get('Sum')).toBe(expectedSum);
      expect(engine.getOutputs().get('Carry')).toBe(expectedCarry);
    }
  });

  it('simulates a delay line', () => {
    const circuit = createDelayLine(5);
    const engine = new SimulationEngine(circuit);

    engine.setInput('IN', true);

    // Run 4 ticks - output should still be false
    engine.tickN(4);
    expect(engine.getOutputs().get('OUT')).toBe(false);

    // Run 1 more tick - output should now be true (5 ticks total)
    engine.tick();
    expect(engine.getOutputs().get('OUT')).toBe(true);
  });

  it('handles input changes mid-simulation', () => {
    const circuit = new CircuitBuilder('test')
      .input('A')
      .output('OUT')
      .gate('and1', 'and', ['A', 'A'], 'OUT')
      .build();

    const engine = new SimulationEngine(circuit);
    engine.setInput('A', true);
    engine.runUntilStable(5);
    expect(engine.getOutputs().get('OUT')).toBe(true);

    engine.setInput('A', false);
    engine.tick();
    expect(engine.getOutputs().get('OUT')).toBe(false);
  });

  it('resets state correctly', () => {
    const circuit = createNotGate();
    const engine = new SimulationEngine(circuit);
    engine.setInput('IN', true);
    engine.runUntilStable(5);
    expect(engine.getOutputs().get('OUT')).toBe(false);

    engine.reset();
    expect(engine.getCurrentTick()).toBe(0);
    expect(engine.getOutputs().get('OUT')).toBe(false); // All signals reset to false
  });

  it('tracks current tick count', () => {
    const circuit = createNotGate();
    const engine = new SimulationEngine(circuit);
    expect(engine.getCurrentTick()).toBe(0);

    engine.tick();
    expect(engine.getCurrentTick()).toBe(1);

    engine.tickN(5);
    expect(engine.getCurrentTick()).toBe(6);
  });

  it('detects stability', () => {
    const circuit = new CircuitBuilder('stable_test')
      .input('A')
      .output('OUT')
      .gate('buf1', 'nand', ['A', 'A'], 'n1')
      .gate('buf2', 'nand', ['n1', 'n1'], 'OUT')
      .build();

    const engine = new SimulationEngine(circuit);
    engine.setInput('A', true);
    engine.runUntilStable(10);

    expect(engine.isStable()).toBe(true);
    expect(engine.getStabilityTick()).toBeDefined();
  });

  it('generates VCD string', () => {
    const circuit = new CircuitBuilder('vcd_test')
      .input('A')
      .output('OUT')
      .gate('not1', 'nand', ['A', 'A'], 'OUT')
      .build();

    const engine = new SimulationEngine(circuit, { recordWaveform: true });
    engine.setInput('A', true);
    engine.runUntilStable(5);

    const vcd = engine.getVCDString();
    expect(vcd).toContain('$date');
    expect(vcd).toContain('$timescale');
    expect(vcd).toContain('$var');
    expect(vcd).toContain('$dumpvars');
    expect(vcd).toContain('sm_logic');
  });
});
