import { describe, it, expect } from 'vitest';
import { TestRunner, type TestVector, parseTestVectorsFromJson } from '../src/verifier/test-runner.ts';
import { TruthTableGenerator, formatTruthTable } from '../src/verifier/truth-table-gen.ts';
import { checkEquivalence } from '../src/verifier/equivalence.ts';
import { createHalfAdder, createNotGate } from '../src/core/subcircuits.ts';
import { CircuitBuilder } from '../src/core/circuit-builder.ts';

describe('TestRunner', () => {
  it('runs a single test vector', () => {
    const circuit = createHalfAdder();
    const runner = new TestRunner(circuit);

    const result = runner.runVector({
      name: '0+0',
      inputs: new Map([['A', false], ['B', false]]),
      expectedOutputs: new Map([['Sum', false], ['Carry', false]]),
    });

    expect(result.passed).toBe(true);
    expect(result.mismatches).toHaveLength(0);
  });

  it('detects mismatches', () => {
    const circuit = createNotGate();
    const runner = new TestRunner(circuit);

    const result = runner.runVector({
      name: 'wrong',
      inputs: new Map([['IN', true]]),
      expectedOutputs: new Map([['OUT', true]]), // Wrong: NOT gate should output false
    });

    expect(result.passed).toBe(false);
    expect(result.mismatches).toHaveLength(1);
    expect(result.mismatches[0]!.signal).toBe('OUT');
    expect(result.mismatches[0]!.expected).toBe(true);
    expect(result.mismatches[0]!.actual).toBe(false);
  });

  it('runs all test vectors', () => {
    const circuit = createHalfAdder();
    const runner = new TestRunner(circuit);

    const vectors: TestVector[] = [
      {
        name: '0+0',
        inputs: new Map([['A', false], ['B', false]]),
        expectedOutputs: new Map([['Sum', false], ['Carry', false]]),
      },
      {
        name: '1+0',
        inputs: new Map([['A', true], ['B', false]]),
        expectedOutputs: new Map([['Sum', true], ['Carry', false]]),
      },
      {
        name: '0+1',
        inputs: new Map([['A', false], ['B', true]]),
        expectedOutputs: new Map([['Sum', true], ['Carry', false]]),
      },
      {
        name: '1+1',
        inputs: new Map([['A', true], ['B', true]]),
        expectedOutputs: new Map([['Sum', false], ['Carry', true]]),
      },
    ];

    const result = runner.runAll(vectors);
    expect(result.total).toBe(4);
    expect(result.passed).toBe(4);
    expect(result.failed).toBe(0);
    expect(result.success).toBe(true);
  });
});

describe('parseTestVectorsFromJson', () => {
  it('parses test vectors from JSON format', () => {
    const data = {
      vectors: [
        { name: 'test1', inputs: { A: 0, B: 0 }, expectedOutputs: { Sum: 0, Carry: 0 } },
        { name: 'test2', inputs: { A: 1, B: 1 }, expectedOutputs: { Sum: 0, Carry: 1 } },
      ],
    };

    const vectors = parseTestVectorsFromJson(data);
    expect(vectors).toHaveLength(2);
    expect(vectors[0]!.name).toBe('test1');
    expect(vectors[0]!.inputs.get('A')).toBe(false);
    expect(vectors[1]!.inputs.get('A')).toBe(true);
  });
});

describe('TruthTableGenerator', () => {
  it('generates correct truth table for NOT gate', () => {
    const circuit = createNotGate();
    const gen = new TruthTableGenerator(circuit);

    expect(gen.canGenerateFull()).toBe(true);
    expect(gen.getRowCount()).toBe(2);

    const table = gen.generate();
    expect(table.rows).toHaveLength(2);

    // IN=false → OUT=true
    expect(table.rows[0]!.inputs.get('IN')).toBe(false);
    expect(table.rows[0]!.outputs.get('OUT')).toBe(true);

    // IN=true → OUT=false
    expect(table.rows[1]!.inputs.get('IN')).toBe(true);
    expect(table.rows[1]!.outputs.get('OUT')).toBe(false);
  });

  it('generates correct truth table for half adder', () => {
    const circuit = createHalfAdder();
    const gen = new TruthTableGenerator(circuit);

    const table = gen.generate();
    expect(table.rows).toHaveLength(4);

    const expected = [
      { a: false, b: false, sum: false, carry: false },
      { a: true, b: false, sum: true, carry: false },
      { a: false, b: true, sum: true, carry: false },
      { a: true, b: true, sum: false, carry: true },
    ];

    for (let i = 0; i < 4; i++) {
      const row = table.rows[i]!;
      const exp = expected[i]!;
      expect(row.inputs.get('A')).toBe(exp.a);
      expect(row.inputs.get('B')).toBe(exp.b);
      expect(row.outputs.get('Sum')).toBe(exp.sum);
      expect(row.outputs.get('Carry')).toBe(exp.carry);
    }
  });

  it('generates sampled truth table for large circuits', () => {
    // Create a circuit with 6 inputs (64 combinations)
    const builder = new CircuitBuilder('big')
      .input('A').input('B').input('C')
      .input('D').input('E').input('F')
      .output('OUT')
      .gate('and1', 'and', ['A', 'B'], 'ab')
      .gate('and2', 'and', ['C', 'D'], 'cd')
      .gate('and3', 'and', ['E', 'F'], 'ef')
      .gate('or1', 'or', ['ab', 'cd', 'ef'], 'OUT')
      .build();

    const gen = new TruthTableGenerator(builder);
    expect(gen.canGenerateFull()).toBe(true);
    expect(gen.shouldWarnSize()).toBe(true);

    const sampled = gen.generateSampled(10);
    expect(sampled.rows.length).toBeLessThanOrEqual(10);
    expect(sampled.rows.length).toBeGreaterThan(0);
  });
});

describe('formatTruthTable', () => {
  it('formats a truth table as a readable string', () => {
    const circuit = createNotGate();
    const gen = new TruthTableGenerator(circuit);
    const table = gen.generate();
    const formatted = formatTruthTable(table);

    expect(formatted).toContain('IN');
    expect(formatted).toContain('OUT');
    expect(formatted).toContain('0');
    expect(formatted).toContain('1');
    expect(formatted).toContain('│');
  });
});

describe('checkEquivalence', () => {
  it('detects equivalent circuits', () => {
    // Two NOT gate implementations: NAND vs NOR
    const nandNot = new CircuitBuilder('not_nand')
      .input('IN').output('OUT')
      .gate('nand1', 'nand', ['IN', 'IN'], 'OUT')
      .build();

    const norNot = new CircuitBuilder('not_nor')
      .input('IN').output('OUT')
      .gate('nor1', 'nor', ['IN', 'IN'], 'OUT')
      .build();

    const result = checkEquivalence(nandNot, norNot);
    expect(result.equivalent).toBe(true);
    expect(result.mismatches).toBe(0);
  });

  it('detects non-equivalent circuits', () => {
    const andGate = new CircuitBuilder('and_gate')
      .input('A').input('B').output('OUT')
      .gate('and1', 'and', ['A', 'B'], 'OUT')
      .build();

    const orGate = new CircuitBuilder('or_gate')
      .input('A').input('B').output('OUT')
      .gate('or1', 'or', ['A', 'B'], 'OUT')
      .build();

    const result = checkEquivalence(andGate, orGate);
    expect(result.equivalent).toBe(false);
    expect(result.mismatches).toBeGreaterThan(0);
  });

  it('rejects circuits with incompatible I/O', () => {
    const circuit1 = new CircuitBuilder('c1')
      .input('A').output('X')
      .gate('buf', 'nand', ['A', 'A'], 'X')
      .build();

    const circuit2 = new CircuitBuilder('c2')
      .input('A').output('Y')
      .gate('buf', 'nand', ['A', 'A'], 'Y')
      .build();

    const result = checkEquivalence(circuit1, circuit2);
    expect(result.equivalent).toBe(false);
  });
});
