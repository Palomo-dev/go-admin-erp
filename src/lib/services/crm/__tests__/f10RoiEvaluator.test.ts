/// <reference types="jest" />
/**
 * F10 — evaluador aritmético seguro para las calculadoras de ROI.
 * Sin `eval` ni `Function`: parser propio con `+ - * / ( )`, unario `-` y
 * variables del scope. Entradas hostiles → error, nunca ejecución.
 */
import { evaluateExpression, evaluateFormula, tokenize } from '@/lib/services/crm/roiEvaluator';

describe('F10 roiEvaluator — aritmética', () => {
  const scope = { a: 10, b: 4, 'inputs.cost': 100, savings_monthly: 25 };

  it.each([
    ['1 + 2', 3],
    ['2 * 3 + 4', 10],
    ['2 * (3 + 4)', 14],
    ['10 / 4', 2.5],
    ['-a + b', -6],
    ['a - -b', 14],
    ['inputs.cost - a * b', 60],
    ['(savings_monthly * 12 / inputs.cost) * 100', 300],
    ['1.5e2 + 0.5', 150.5],
    ['  a  ', 10],
  ])('evalúa %s', (expr, expected) => {
    const r = evaluateExpression(expr, scope);
    expect(r).toEqual({ ok: true, value: expected });
  });

  it('precedencia: la multiplicación gana a la suma y el paréntesis a todo', () => {
    expect(evaluateExpression('1 + 2 * 3', {})).toEqual({ ok: true, value: 7 });
    expect(evaluateExpression('(1 + 2) * 3', {})).toEqual({ ok: true, value: 9 });
    expect(evaluateExpression('8 / 2 / 2', {})).toEqual({ ok: true, value: 2 });
    expect(evaluateExpression('8 - 2 - 2', {})).toEqual({ ok: true, value: 4 });
  });

  it('división por cero → error, no Infinity', () => {
    const r = evaluateExpression('a / 0', scope);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/cero/i);
  });

  it('variable desconocida → error que la nombra', () => {
    const r = evaluateExpression('a + zeta', scope);
    expect(r).toEqual({ ok: false, error: expect.stringContaining('zeta') });
  });
});

describe('F10 roiEvaluator — entradas hostiles', () => {
  const scope = { a: 1 };
  it.each([
    'constructor.constructor("return process")()',
    'Function("return 1")()',
    'process.exit(1)',
    'a; b',
    'a = 5',
    '[1,2]',
    '{ a: 1 }',
    '"cadena"',
    "'cadena'",
    'a ** 2',
    'a % 2',
    'Math.PI',
    '__proto__',
    'a++',
    'a && 1',
    'a ? 1 : 2',
    'import("x")',
    '`${a}`',
    'a' + String.fromCharCode(0), // byte NUL construido en runtime: el fuente no lleva bytes de control
    '1 +',
    '(1 + 2',
    '1 2',
    '',
    '   ',
  ])('rechaza %j sin ejecutar', (expr) => {
    const r = evaluateExpression(expr, scope);
    expect(r.ok).toBe(false);
  });

  it('el scope no hereda del prototipo: toString / valueOf / hasOwnProperty no son variables', () => {
    expect(evaluateExpression('toString', {}).ok).toBe(false);
    expect(evaluateExpression('valueOf + 1', {}).ok).toBe(false);
    expect(evaluateExpression('hasOwnProperty', {}).ok).toBe(false);
  });

  it('valores no finitos del scope → error', () => {
    expect(evaluateExpression('a', { a: Number.NaN }).ok).toBe(false);
    expect(evaluateExpression('a', { a: Number.POSITIVE_INFINITY }).ok).toBe(false);
  });

  it('desbordamiento numérico → error', () => {
    expect(evaluateExpression('1e308 * 10', {}).ok).toBe(false);
  });

  it('expresiones demasiado largas o demasiado anidadas → error', () => {
    expect(evaluateExpression('1'.padEnd(2001, '+1'), {}).ok).toBe(false);
    expect(evaluateExpression('('.repeat(80) + '1' + ')'.repeat(80), {}).ok).toBe(false);
  });

  it('tokenize no produce tokens para caracteres fuera del alfabeto', () => {
    expect(() => tokenize('a $ b')).toThrow();
    expect(() => tokenize('a; b')).toThrow();
  });
});

describe('F10 roiEvaluator — fórmula en cadena', () => {
  it('cada salida alimenta a la siguiente y se expone como outputs.<clave> y <clave>', () => {
    const r = evaluateFormula(
      [
        { output_key: 'savings_monthly', expression: 'inputs.current_cost - inputs.proposed_cost' },
        { output_key: 'savings_yearly', expression: 'outputs.savings_monthly * 12' },
        { output_key: 'roi_pct', expression: '(savings_yearly / inputs.investment) * 100' },
        { output_key: 'payback_months', expression: 'inputs.investment / savings_monthly' },
      ],
      { current_cost: 1000, proposed_cost: 700, investment: 3600 },
    );
    expect(r.errors).toEqual({});
    expect(r.outputs).toEqual({ savings_monthly: 300, savings_yearly: 3600, roi_pct: 100, payback_months: 12 });
  });

  it('una operación inválida no tumba las demás: queda en errors y su clave no aparece en outputs', () => {
    const r = evaluateFormula(
      [
        { output_key: 'ok', expression: 'inputs.x * 2' },
        { output_key: 'bad', expression: 'Function("x")' },
        { output_key: 'dep', expression: 'bad + 1' },
      ],
      { x: 2 },
    );
    expect(r.outputs).toEqual({ ok: 4 });
    expect(Object.keys(r.errors).sort()).toEqual(['bad', 'dep']);
  });

  it('inputs no numéricos se rechazan (no se convierten a 0 en silencio)', () => {
    const r = evaluateFormula([{ output_key: 'y', expression: 'inputs.x' }], { x: 'abc' as unknown as number });
    expect(r.outputs).toEqual({});
    expect(r.errors.y).toMatch(/x/);
  });

  it('claves de salida hostiles (__proto__, constructor) se rechazan', () => {
    const r = evaluateFormula([{ output_key: '__proto__', expression: '1' }, { output_key: 'constructor', expression: '1' }], {});
    expect(r.outputs).toEqual({});
    expect(Object.keys(r.errors).sort()).toEqual(['__proto__', 'constructor']);
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });

  it('operations que no son array → sin salidas y error general', () => {
    const r = evaluateFormula(undefined as unknown as [], {});
    expect(r.outputs).toEqual({});
    expect(r.errors._formula).toBeTruthy();
  });
});
