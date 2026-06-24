import { describe, it, expect } from 'vitest';
import { evaluateGate, evaluateGateDetailed, getGateDefinition, generateGateTruthTable, getInverseGateType, evaluateNotGate, evaluateNorNotGate, isValidGateType } from '../src/core/gates.ts';

describe('evaluateGate', () => {
  describe('AND gate', () => {
    it('outputs true when all inputs are HIGH', () => {
      expect(evaluateGate('and', 2, 2)).toBe(true);
      expect(evaluateGate('and', 1, 1)).toBe(true);
      expect(evaluateGate('and', 3, 3)).toBe(true);
    });

    it('outputs false when not all inputs are HIGH', () => {
      expect(evaluateGate('and', 0, 2)).toBe(false);
      expect(evaluateGate('and', 1, 2)).toBe(false);
      expect(evaluateGate('and', 0, 1)).toBe(false);
    });

    it('outputs false with 0 inputs', () => {
      expect(evaluateGate('and', 0, 0)).toBe(false);
    });
  });

  describe('OR gate', () => {
    it('outputs true when any input is HIGH', () => {
      expect(evaluateGate('or', 1, 2)).toBe(true);
      expect(evaluateGate('or', 2, 2)).toBe(true);
      expect(evaluateGate('or', 1, 1)).toBe(true);
    });

    it('outputs false when all inputs are LOW', () => {
      expect(evaluateGate('or', 0, 2)).toBe(false);
      expect(evaluateGate('or', 0, 1)).toBe(false);
    });

    it('outputs false with 0 inputs', () => {
      expect(evaluateGate('or', 0, 0)).toBe(false);
    });
  });

  describe('XOR gate', () => {
    it('outputs true for odd number of activated inputs', () => {
      expect(evaluateGate('xor', 1, 2)).toBe(true);
      expect(evaluateGate('xor', 1, 1)).toBe(true);
      expect(evaluateGate('xor', 3, 4)).toBe(true);
    });

    it('outputs false for even number of activated inputs', () => {
      expect(evaluateGate('xor', 0, 2)).toBe(false);
      expect(evaluateGate('xor', 2, 2)).toBe(false);
      expect(evaluateGate('xor', 0, 0)).toBe(false);
    });
  });

  describe('NAND gate', () => {
    it('outputs true when not all inputs are HIGH', () => {
      expect(evaluateGate('nand', 0, 2)).toBe(true);
      expect(evaluateGate('nand', 1, 2)).toBe(true);
    });

    it('outputs false when all inputs are HIGH', () => {
      expect(evaluateGate('nand', 2, 2)).toBe(false);
      expect(evaluateGate('nand', 1, 1)).toBe(false);
    });

    it('outputs false with 0 inputs (all 0 of 0 are activated)', () => {
      expect(evaluateGate('nand', 0, 0)).toBe(false);
    });
  });

  describe('NOR gate', () => {
    it('outputs true when all inputs are LOW', () => {
      expect(evaluateGate('nor', 0, 2)).toBe(true);
      expect(evaluateGate('nor', 0, 1)).toBe(true);
    });

    it('outputs false when any input is HIGH', () => {
      expect(evaluateGate('nor', 1, 2)).toBe(false);
      expect(evaluateGate('nor', 2, 2)).toBe(false);
    });

    it('outputs false with 0 inputs', () => {
      expect(evaluateGate('nor', 0, 0)).toBe(false);
    });
  });

  describe('XNOR gate', () => {
    it('outputs true for even number of activated inputs', () => {
      expect(evaluateGate('xnor', 0, 2)).toBe(true);
      expect(evaluateGate('xnor', 2, 2)).toBe(true);
    });

    it('outputs false for odd number of activated inputs', () => {
      expect(evaluateGate('xnor', 1, 2)).toBe(false);
      expect(evaluateGate('xnor', 1, 1)).toBe(false);
    });

    it('outputs false with 0 inputs', () => {
      expect(evaluateGate('xnor', 0, 0)).toBe(false);
    });
  });
});

describe('evaluateGateDetailed', () => {
  it('returns detailed evaluation result', () => {
    const result = evaluateGateDetailed('and', 2, 2);
    expect(result.output).toBe(true);
    expect(result.activatedInputs).toBe(2);
    expect(result.totalInputs).toBe(2);
  });
});

describe('getGateDefinition', () => {
  it('returns definition for valid gate type', () => {
    const def = getGateDefinition('and');
    expect(def.type).toBe('and');
    expect(def.mode).toBe(0);
    expect(def.minInputs).toBe(1);
  });

  it('throws for invalid gate type', () => {
    expect(() => getGateDefinition('invalid' as 'and')).toThrow('Unknown gate type');
  });
});

describe('generateGateTruthTable', () => {
  it('generates correct truth table for AND gate with 2 inputs', () => {
    const table = generateGateTruthTable('and', 2);
    expect(table).toHaveLength(4);
    expect(table[0]).toEqual({ inputs: [false, false], output: false });
    expect(table[1]).toEqual({ inputs: [true, false], output: false });
    expect(table[2]).toEqual({ inputs: [false, true], output: false });
    expect(table[3]).toEqual({ inputs: [true, true], output: true });
  });

  it('generates correct truth table for XOR gate with 2 inputs', () => {
    const table = generateGateTruthTable('xor', 2);
    expect(table).toHaveLength(4);
    expect(table[0]).toEqual({ inputs: [false, false], output: false });
    expect(table[1]).toEqual({ inputs: [true, false], output: true });
    expect(table[2]).toEqual({ inputs: [false, true], output: true });
    expect(table[3]).toEqual({ inputs: [true, true], output: false });
  });

  it('throws for invalid input count', () => {
    expect(() => generateGateTruthTable('and', 0)).toThrow();
    expect(() => generateGateTruthTable('and', 9)).toThrow();
  });
});

describe('getInverseGateType', () => {
  it('returns correct inverse for all gate types', () => {
    expect(getInverseGateType('and')).toBe('nand');
    expect(getInverseGateType('nand')).toBe('and');
    expect(getInverseGateType('or')).toBe('nor');
    expect(getInverseGateType('nor')).toBe('or');
    expect(getInverseGateType('xor')).toBe('xnor');
    expect(getInverseGateType('xnor')).toBe('xor');
  });
});

describe('evaluateNotGate', () => {
  it('inverts the input signal', () => {
    expect(evaluateNotGate(true)).toBe(false);
    expect(evaluateNotGate(false)).toBe(true);
  });
});

describe('evaluateNorNotGate', () => {
  it('inverts the input signal using NOR', () => {
    expect(evaluateNorNotGate(true)).toBe(false);
    expect(evaluateNorNotGate(false)).toBe(true);
  });
});

describe('isValidGateType', () => {
  it('returns true for valid gate types', () => {
    expect(isValidGateType('and')).toBe(true);
    expect(isValidGateType('or')).toBe(true);
    expect(isValidGateType('xor')).toBe(true);
    expect(isValidGateType('nand')).toBe(true);
    expect(isValidGateType('nor')).toBe(true);
    expect(isValidGateType('xnor')).toBe(true);
  });

  it('returns false for invalid gate types', () => {
    expect(isValidGateType('invalid')).toBe(false);
    expect(isValidGateType('NOT')).toBe(false);
    expect(isValidGateType('')).toBe(false);
  });
});
