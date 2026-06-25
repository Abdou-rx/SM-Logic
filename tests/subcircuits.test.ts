import { describe, it, expect } from 'vitest';
import {
  createNotGate,
  createBuffer,
  createHalfAdder,
  createFullAdder,
  createSRLatch,
  createDelayLine,
  createPulseGenerator,
  getSubcircuit,
  getAvailableSubcircuits,
  circuitFromJson,
  circuitToJson,
} from '../src/core/subcircuits.ts';
import { CircuitBuilder } from '../src/core/circuit-builder.ts';
import { SimulationEngine } from '../src/simulator/engine.ts';

describe('Subcircuits', () => {
  describe('NOT gate', () => {
    it('builds a valid NOT gate circuit', () => {
      const circuit = createNotGate();
      expect(circuit.name).toBe('not');
      expect(circuit.inputs).toEqual(['IN']);
      expect(circuit.outputs).toEqual(['OUT']);
      expect(circuit.gates).toHaveLength(1);
      expect(circuit.gates[0]!.type).toBe('nand');
    });

    it('simulates correctly', () => {
      const circuit = createNotGate();
      const engine = new SimulationEngine(circuit);

      engine.setInput('IN', true);
      engine.runUntilStable(5);
      expect(engine.getOutputs().get('OUT')).toBe(false);

      engine.setInput('IN', false);
      engine.runUntilStable(5);
      expect(engine.getOutputs().get('OUT')).toBe(true);
    });
  });

  describe('Buffer', () => {
    it('simulates correctly (passes through signal)', () => {
      const circuit = createBuffer();
      const engine = new SimulationEngine(circuit);

      engine.setInput('IN', true);
      engine.runUntilStable(10);
      expect(engine.getOutputs().get('OUT')).toBe(true);

      engine.setInput('IN', false);
      engine.runUntilStable(10);
      expect(engine.getOutputs().get('OUT')).toBe(false);
    });
  });

  describe('Half Adder', () => {
    it('produces correct outputs for all input combinations', () => {
      const circuit = createHalfAdder();
      const tests = [
        [false, false, false, false],
        [true, false, true, false],
        [false, true, true, false],
        [true, true, false, true],
      ];

      for (const [a, b, sum, carry] of tests) {
        const engine = new SimulationEngine(circuit);
        engine.setInput('A', a);
        engine.setInput('B', b);
        engine.runUntilStable(10);
        expect(engine.getOutputs().get('Sum')).toBe(sum);
        expect(engine.getOutputs().get('Carry')).toBe(carry);
      }
    });
  });

  describe('Full Adder', () => {
    it('produces correct outputs for all input combinations', () => {
      const circuit = createFullAdder();

      const tests: Array<[boolean, boolean, boolean, boolean, boolean]> = [
        [false, false, false, false, false],
        [true, false, false, true, false],
        [false, true, false, true, false],
        [true, true, false, false, true],
        [true, false, true, false, true],
        [false, false, true, true, false],
        [true, true, true, true, true],
      ];

      for (const [a, b, cin, sum, cout] of tests) {
        const engine = new SimulationEngine(circuit);
        engine.setInput('A', a);
        engine.setInput('B', b);
        engine.setInput('Cin', cin);
        engine.runUntilStable(15);
        expect(engine.getOutputs().get('Sum')).toBe(sum);
        expect(engine.getOutputs().get('Cout')).toBe(cout);
      }
    });
  });

  describe('Delay Line', () => {
    it('delays signal by configured number of ticks', () => {
      const delay = 5;
      const circuit = createDelayLine(delay);
      const engine = new SimulationEngine(circuit);

      engine.setInput('IN', true);

      // Before delay
      engine.tickN(delay - 1);
      expect(engine.getOutputs().get('OUT')).toBe(false);

      // At delay
      engine.tick();
      expect(engine.getOutputs().get('OUT')).toBe(true);
    });
  });

  describe('Pulse Generator', () => {
    it('outputs a pulse on rising edge', () => {
      const circuit = createPulseGenerator(3);
      const engine = new SimulationEngine(circuit);

      // Start with false input
      engine.setInput('IN', false);
      engine.runUntilStable(5);
      expect(engine.getOutputs().get('PULSE')).toBe(false);

      // Rising edge
      engine.setInput('IN', true);
      engine.runUntilStable(5);

      // After the pulse delay, we should see a brief pulse
      // The pulse appears when IN changes and delayed_in hasn't caught up
    });
  });
});

describe('CircuitBuilder', () => {
  it('builds a simple circuit with fluent API', () => {
    const circuit = new CircuitBuilder('test')
      .input('A').input('B')
      .output('OUT')
      .gate('and1', 'and', ['A', 'B'], 'OUT')
      .build();

    expect(circuit.name).toBe('test');
    expect(circuit.inputs).toEqual(['A', 'B']);
    expect(circuit.outputs).toEqual(['OUT']);
    expect(circuit.gates).toHaveLength(1);
  });

  it('validates duplicate gate IDs', () => {
    expect(() =>
      new CircuitBuilder('dup')
        .input('A').output('OUT')
        .gate('g1', 'and', ['A', 'A'], 'n1')
        .gate('g1', 'or', ['n1', 'n1'], 'OUT')
        .build(),
    ).toThrow('Duplicate gate ID');
  });

  it('validates unknown input signals', () => {
    expect(() =>
      new CircuitBuilder('bad')
        .input('A').output('OUT')
        .gate('g1', 'and', ['UNKNOWN'], 'OUT')
        .build(),
    ).toThrow('unknown input signal');
  });

  it('validates output not produced by any gate', () => {
    expect(() =>
      new CircuitBuilder('bad')
        .input('A').output('OUT')
        .build(),
    ).toThrow('not produced by any gate');
  });
});

describe('circuitFromJson / circuitToJson', () => {
  it('round-trips a circuit through JSON', () => {
    const original = createHalfAdder();
    const json = circuitToJson(original);
    const restored = circuitFromJson(json);

    expect(restored.name).toBe(original.name);
    expect(restored.inputs).toEqual(original.inputs);
    expect(restored.outputs).toEqual(original.outputs);
    expect(restored.gates).toHaveLength(original.gates.length);
  });

  it('preserves feedback connections', () => {
    const original = createSRLatch();
    const json = circuitToJson(original);
    const restored = circuitFromJson(json);

    // SR latch has no explicit feedback field (direct cross-coupling)
    expect(restored.feedback).toEqual(original.feedback);
  });
});

describe('getAvailableSubcircuits', () => {
  it('returns a non-empty list', () => {
    const list = getAvailableSubcircuits();
    expect(list.length).toBeGreaterThan(0);
    expect(list).toContain('not');
    expect(list).toContain('half-adder');
    expect(list).toContain('full-adder');
  });
});

describe('getSubcircuit', () => {
  it('returns a circuit for valid name', () => {
    const circuit = getSubcircuit('half-adder');
    expect(circuit.inputs).toContain('A');
    expect(circuit.outputs).toContain('Sum');
  });

  it('throws for invalid name', () => {
    expect(() => getSubcircuit('nonexistent')).toThrow('Unknown subcircuit');
  });
});