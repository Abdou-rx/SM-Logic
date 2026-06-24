import { describe, it, expect } from 'vitest';
import { BlueprintBuilder } from '../src/blueprint/builder.ts';
import { Placer } from '../src/blueprint/placer.ts';
import { BlueprintWriter } from '../src/blueprint/writer.ts';
import { createHalfAdder, createNotGate } from '../src/core/subcircuits.ts';
import { CircuitBuilder } from '../src/core/circuit-builder.ts';
import { writeFileSync, readFileSync, unlinkSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

describe('Placer', () => {
  it('places all gates and I/O devices', () => {
    const circuit = createHalfAdder();
    const placer = new Placer(circuit);
    const result = placer.place();

    // Should have: 2 inputs + 2 gates + 2 outputs = 6 placements
    expect(result.placements.length).toBe(6);

    // Check that all inputs are placed
    const inputs = result.placements.filter((p) => p.isInput);
    expect(inputs.length).toBe(2);

    // Check that all outputs are placed
    const outputs = result.placements.filter((p) => p.isOutput);
    expect(outputs.length).toBe(2);

    // Check IDs are unique
    const ids = result.placements.map((p) => p.childId);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('places gates in order with increasing X coordinates', () => {
    const circuit = createHalfAdder();
    const placer = new Placer(circuit);
    const result = placer.place();

    const gates = result.placements.filter((p) => !p.isInput && !p.isOutput);
    for (let i = 1; i < gates.length; i++) {
      expect(gates[i]!.x).toBeGreaterThan(gates[i - 1]!.x);
    }
  });
});

describe('BlueprintBuilder', () => {
  it('builds a valid blueprint structure', () => {
    const circuit = createHalfAdder();
    const builder = new BlueprintBuilder(circuit);
    const blueprint = builder.build();

    expect(blueprint.version).toBe(4);
    expect(blueprint.bodies).toHaveLength(1);
    expect(blueprint.name).toBe('half_adder');
    expect(blueprint.blueprintId).toBeDefined();

    const body = blueprint.bodies[0]!;
    expect(body.childs.length).toBeGreaterThan(0);

    // Check that child IDs are unique
    const ids = body.childs.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('produces valid JSON', () => {
    const circuit = createNotGate();
    const builder = new BlueprintBuilder(circuit);
    const json = builder.toString();

    const parsed = JSON.parse(json);
    expect(parsed.version).toBe(4);
    expect(parsed.bodies).toBeDefined();
    expect(Array.isArray(parsed.bodies)).toBe(true);
  });

  it('places input buttons with correct shape ID', () => {
    const circuit = createNotGate();
    const builder = new BlueprintBuilder(circuit);
    const blueprint = builder.build();

    const body = blueprint.bodies[0]!;
    const button = body.childs.find((c) => c.shapeId === '1e8d93a4-506b-470d-9ada-9c0a321e2db5');
    expect(button).toBeDefined();
  });

  it('places output LEDs with correct shape ID', () => {
    const circuit = createNotGate();
    const builder = new BlueprintBuilder(circuit);
    const blueprint = builder.build();

    const body = blueprint.bodies[0]!;
    const led = body.childs.find((c) => c.shapeId === '020fc24a-61b5-4cf3-bd4f-e876d89bd905');
    expect(led).toBeDefined();
  });
});

describe('BlueprintWriter', () => {
  it('writes blueprint to file and can be read back', () => {
    const circuit = new CircuitBuilder('write_test')
      .input('A').output('OUT')
      .gate('not1', 'nand', ['A', 'A'], 'OUT')
      .build();

    const builder = new BlueprintBuilder(circuit);
    const blueprint = builder.build();

    const tmpDir = join(tmpdir(), 'sm-logic-test-' + Date.now());
    mkdirSync(tmpDir, { recursive: true });

    const filePath = join(tmpDir, 'test.blueprint.json');

    try {
      BlueprintWriter.writeToFile(blueprint, filePath);

      const content = readFileSync(filePath, 'utf-8');
      const parsed = JSON.parse(content);
      expect(parsed.version).toBe(4);
      expect(parsed.name).toBe('write_test');
    } finally {
      try { unlinkSync(filePath); } catch { /* ignore */ }
      try { unlinkSync(tmpDir); } catch { /* ignore */ }
    }
  });
});
