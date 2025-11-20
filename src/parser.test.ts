import { describe, expect, test } from '@jest/globals';
import { parse_spec_old, parse_spec, parse_spec_with_errors } from './parser-export';

describe('Parser Tests', () => {
  describe('Basic Matcher Parsing', () => {
    test('simple matcher without capture groups', () => {
      const input = `budget\n\nhistogram(budget)\n`;
      const result = parse_spec(input);

      expect(result.matchers).toHaveLength(1);
      expect(result.matchers[0].regexp).toBe('budget');
      expect(result.matchers[0].labels).toEqual(['budget']);
      expect(result.matchers[0].fields).toEqual([]);

      expect(result.processing).toHaveLength(1);
      expect(result.processing[0].operator).toBe('histogram');
      expect(result.processing[0].args).toBe('budget');
    });

    test('matcher with label markers ##', () => {
      const input = `Popping ##frames frames\n\nplot(frames)\n`;
      const result = parse_spec(input);

      expect(result.matchers).toHaveLength(1);
      expect(result.matchers[0].regexp).toBe('Popping (-?[0-9.]+) frames');
      expect(result.matchers[0].labels).toEqual(['frames']);
    });

    test('matcher with multiple label markers', () => {
      const input = `Popping ##frames frames. Remaining ##remaining\n\nplot(frames, remaining)\n`;
      const result = parse_spec(input);

      expect(result.matchers).toHaveLength(1);
      expect(result.matchers[0].labels).toEqual(['frames', 'remaining']);
      expect(result.matchers[0].regexp).toContain('(-?[0-9.]+)');
    });

    test('matcher with field markers ###', () => {
      const input = `Audio Sink ##position ###duration\n\nplot(position)\n`;
      const result = parse_spec(input);

      expect(result.matchers).toHaveLength(1);
      expect(result.matchers[0].labels).toEqual(['position']);
      expect(result.matchers[0].fields).toEqual(['duration']);
    });

    test('quoted matcher for exact match', () => {
      const input = `"exact match"\n\nhistogram(exact match)\n`;
      const result = parse_spec(input);

      expect(result.matchers).toHaveLength(1);
      expect(result.matchers[0].regexp).toBe('^exact match$');
      expect(result.matchers[0].labels).toEqual(['exact match']);
    });

    test('multiple matchers', () => {
      const input = `matcher1 ##value1\nmatcher2 ##value2\n\nplot(value1, value2)\n`;
      const result = parse_spec(input);

      expect(result.matchers).toHaveLength(2);
      expect(result.matchers[0].labels).toEqual(['value1']);
      expect(result.matchers[1].labels).toEqual(['value2']);
    });
  });

  describe('Processing Operations', () => {
    test('operation without assignment', () => {
      const input = `test ##value\n\nhistogram(value)\n`;
      const result = parse_spec(input);

      expect(result.processing).toHaveLength(1);
      expect(result.processing[0].operator).toBe('histogram');
      expect(result.processing[0].args).toBe('value');
      expect(result.processing[0].assignment).toBeUndefined();
    });

    test('operation with assignment', () => {
      const input = `test ##value\n\ndiff = derivative(value)\n`;
      const result = parse_spec(input);

      expect(result.processing).toHaveLength(1);
      expect(result.processing[0].operator).toBe('derivative');
      expect(result.processing[0].args).toBe('value');
      expect(result.processing[0].assignment).toBe('diff');
    });

    test('operation with multiple arguments', () => {
      const input = `a ##x\nb ##y\n\nsum = add(x, y)\n`;
      const result = parse_spec(input);

      expect(result.processing).toHaveLength(1);
      expect(result.processing[0].operator).toBe('add');
      expect(result.processing[0].args).toBe('x, y');
      expect(result.processing[0].assignment).toBe('sum');
    });

    test('operation with numeric argument', () => {
      const input = `test ##value\n\nscaled = mul(value, 100)\n`;
      const result = parse_spec(input);

      expect(result.processing).toHaveLength(1);
      expect(result.processing[0].operator).toBe('mul');
      expect(result.processing[0].args).toBe('value, 100');
    });

    test('multiple processing operations', () => {
      const input = `test ##value\n\nhistogram(value)\nstats(value)\nplot(value)\n`;
      const result = parse_spec(input);

      expect(result.processing).toHaveLength(3);
      expect(result.processing[0].operator).toBe('histogram');
      expect(result.processing[1].operator).toBe('stats');
      expect(result.processing[2].operator).toBe('plot');
    });
  });

  describe('Comments', () => {
    test('line comments are ignored', () => {
      const input = `// This is a comment\ntest ##value\n\nhistogram(value) // another comment\n`;
      const result = parse_spec(input);

      expect(result.matchers).toHaveLength(1);
      expect(result.processing).toHaveLength(1);
    });
  });

  describe('Complex Examples', () => {
    test('INITIAL example from code', () => {
      const input = `budget\nUnprocessed\n\nload = div(Unprocessed, budget)\npercent_load = mul(load, 100)\nplot(percent_load)\n`;
      const result = parse_spec(input);

      expect(result.matchers).toHaveLength(2);
      expect(result.matchers[0].labels).toEqual(['budget']);
      expect(result.matchers[1].labels).toEqual(['Unprocessed']);

      expect(result.processing).toHaveLength(3);
      expect(result.processing[0].assignment).toBe('load');
      expect(result.processing[1].assignment).toBe('percent_load');
      expect(result.processing[2].operator).toBe('plot');
    });

    test('INITIAL2 example from code', () => {
      const input = `Popping ##frames frames. Remaining in ringbuffer ##remaining / ##total\nAudio Sink ##position\n\nplot(frames, remaining)\ndiff = derivative(position)\nintegral(frames)\nhistogram(remaining)\nhistogram(diff)\nstats(diff)\nfullness = eval(remaining / total)\n`;
      const result = parse_spec(input);

      expect(result.matchers).toHaveLength(2);
      expect(result.matchers[0].labels).toEqual(['frames', 'remaining', 'total']);
      expect(result.matchers[1].labels).toEqual(['position']);

      expect(result.processing.length).toBeGreaterThanOrEqual(6);
    });
  });
});

describe('Error Reporting', () => {
  test('reports unknown operator error', () => {
    const input = `budget\n\nunknown_op(budget)\n`;
    const result = parse_spec_with_errors(input);

    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].line).toBe(3);
    expect(result.errors[0].message).toContain('Unknown operator');
    expect(result.errors[0].message).toContain('unknown_op');
    expect(result.spec).toBeNull();
  });

  test('reports invalid processing syntax', () => {
    const input = `budget\n\nthis is not valid syntax\n`;
    const result = parse_spec_with_errors(input);

    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].line).toBe(3);
    expect(result.errors[0].message).toContain('Invalid processing');
    expect(result.spec).toBeNull();
  });

  test('valid input has no errors', () => {
    const input = `budget\n\nhistogram(budget)\n`;
    const result = parse_spec_with_errors(input);

    expect(result.errors).toHaveLength(0);
    expect(result.spec).not.toBeNull();
    expect(result.spec!.matchers).toHaveLength(1);
    expect(result.spec!.processing).toHaveLength(1);
  });

  test('reports multiple errors', () => {
    const input = `budget\n\nbadop(budget)\nanotherbad(value)\n`;
    const result = parse_spec_with_errors(input);

    expect(result.errors.length).toBeGreaterThanOrEqual(2);
    expect(result.spec).toBeNull();
  });

  test('detects processing operation in matchers section', () => {
    const input = `budget\nUnprocessed\nload div(Unprocessed, budget)\n\nhistogram(budget)\n`;
    const result = parse_spec_with_errors(input);

    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].line).toBe(3);
    expect(result.errors[0].message).toContain('matchers section');
    expect(result.errors[0].message).toContain('blank line');
    expect(result.spec).toBeNull();
  });

  test('detects processing operation without assignment in matchers section', () => {
    const input = `budget\ndiv(Unprocessed, budget)\n\n`;
    const result = parse_spec_with_errors(input);

    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].line).toBe(2);
    expect(result.errors[0].message).toContain('matchers section');
    expect(result.spec).toBeNull();
  });

  test('detects malformed assignment with extra spaces', () => {
    const input = `budget\nUnprocessed\n\nload  div(Unprocessed, budget)\n`;
    const result = parse_spec_with_errors(input);

    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].line).toBe(4);
    expect(result.errors[0].message).toContain('Invalid');
    expect(result.spec).toBeNull();
  });
});

describe('Old vs New Parser Cross-Check', () => {
  const testCases = [
    {
      name: 'simple matcher',
      input: `budget\n\nhistogram(budget)\n`,
    },
    {
      name: 'matcher with labels',
      input: `Popping ##frames frames\n\nplot(frames)\n`,
    },
    {
      name: 'matcher with multiple labels',
      input: `Popping ##frames frames. Remaining ##remaining\n\nplot(frames, remaining)\n`,
    },
    {
      name: 'matcher with fields',
      input: `Audio Sink ##position ###duration\n\nplot(position)\n`,
    },
    {
      name: 'quoted matcher',
      input: `"exact match"\n\nhistogram(exact match)\n`,
    },
    {
      name: 'operation with assignment',
      input: `test ##value\n\ndiff = derivative(value)\n`,
    },
    {
      name: 'operation with multiple args',
      input: `a ##x\nb ##y\n\nsum = add(x, y)\n`,
    },
    {
      name: 'multiple matchers and operations',
      input: `budget\nUnprocessed\n\nload = div(Unprocessed, budget)\npercent_load = mul(load, 100)\nplot(percent_load)\n`,
    },
    {
      name: 'with comments',
      input: `// comment\nbudget\n\n// another comment\nhistogram(budget)\n`,
    },
  ];

  testCases.forEach(({ name, input }) => {
    test(`cross-check: ${name}`, () => {
      const oldResult = parse_spec_old(input);
      const newResult = parse_spec(input);

      expect(newResult.matchers.length).toBe(oldResult.matchers.length);
      expect(newResult.processing.length).toBe(oldResult.processing.length);

      for (let i = 0; i < oldResult.matchers.length; i++) {
        expect(newResult.matchers[i].regexp).toBe(oldResult.matchers[i].regexp);
        expect(newResult.matchers[i].labels).toEqual(oldResult.matchers[i].labels);
        expect(newResult.matchers[i].fields).toEqual(oldResult.matchers[i].fields);
      }

      for (let i = 0; i < oldResult.processing.length; i++) {
        expect(newResult.processing[i].operator).toBe(oldResult.processing[i].operator);
        expect(newResult.processing[i].args).toBe(oldResult.processing[i].args);
        expect(newResult.processing[i].assignment).toBe(oldResult.processing[i].assignment);
      }
    });
  });
});
