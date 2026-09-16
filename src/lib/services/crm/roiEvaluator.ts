/**
 * F10 — evaluador aritmético seguro para `roi_calculators.formula`.
 *
 * Sustituye al `Function("return (…)")` de `roiService` (que ejecutaba texto
 * de una fila jsonb). Aquí no hay ejecución: un tokenizador con alfabeto
 * cerrado y un parser de descenso recursivo que solo conoce
 *   expr   := term (('+'|'-') term)*
 *   term   := unary (('*'|'/') unary)*
 *   unary  := '-' unary | primary
 *   primary:= NUMBER | IDENT | '(' expr ')'
 * Las variables se resuelven contra un scope propio (sin prototipo). Todo lo
 * demás (`;`, `=`, `[`, `"`, `**`, `%`, `?`, `&&`…) es error de tokenización.
 */

export type EvalResult = { ok: true; value: number } | { ok: false; error: string };

export interface FormulaOperation {
  output_key: string;
  expression: string;
}

export interface FormulaResult {
  outputs: Record<string, number>;
  errors: Record<string, string>;
}

const MAX_EXPRESSION_LENGTH = 500;
const MAX_DEPTH = 32;
const IDENT_RE = /^[A-Za-z_][A-Za-z0-9_]*(\.[A-Za-z_][A-Za-z0-9_]*)*$/;
const FORBIDDEN_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

type Token =
  | { kind: 'num'; value: number }
  | { kind: 'ident'; name: string }
  | { kind: 'op'; value: '+' | '-' | '*' | '/' }
  | { kind: 'lparen' }
  | { kind: 'rparen' };

/** Tokeniza; lanza ante cualquier carácter fuera de `0-9 . e E A-Za-z _ + - * / ( ) espacio`. */
export function tokenize(expression: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  const s = expression;
  while (i < s.length) {
    const ch = s[i];
    if (ch === ' ' || ch === '\t') { i += 1; continue; }
    if (ch === '(') { tokens.push({ kind: 'lparen' }); i += 1; continue; }
    if (ch === ')') { tokens.push({ kind: 'rparen' }); i += 1; continue; }
    if (ch === '+' || ch === '-' || ch === '*' || ch === '/') { tokens.push({ kind: 'op', value: ch }); i += 1; continue; }
    if (/[0-9.]/.test(ch)) {
      const m = /^(\d+(\.\d+)?|\.\d+)([eE][+-]?\d+)?/.exec(s.slice(i));
      if (!m) throw new Error(`Número inválido en la posición ${i}`);
      const value = Number(m[0]);
      if (!Number.isFinite(value)) throw new Error(`Número fuera de rango: ${m[0]}`);
      tokens.push({ kind: 'num', value });
      i += m[0].length;
      continue;
    }
    if (/[A-Za-z_]/.test(ch)) {
      const m = /^[A-Za-z_][A-Za-z0-9_.]*/.exec(s.slice(i));
      const name = m ? m[0] : ch;
      if (!IDENT_RE.test(name)) throw new Error(`Identificador inválido: ${name}`);
      tokens.push({ kind: 'ident', name });
      i += name.length;
      continue;
    }
    throw new Error(`Carácter no permitido en la posición ${i}: ${JSON.stringify(ch)}`);
  }
  return tokens;
}

/** Scope sin prototipo: solo se resuelve lo que se pasó explícitamente. */
function buildScope(scope: Record<string, number>): Map<string, number> {
  const map = new Map<string, number>();
  for (const key of Object.keys(scope)) {
    if (FORBIDDEN_KEYS.has(key)) continue;
    if (!Object.prototype.hasOwnProperty.call(scope, key)) continue;
    map.set(key, scope[key]);
  }
  return map;
}

class Parser {
  private pos = 0;
  constructor(private readonly tokens: Token[], private readonly scope: Map<string, number>) {}

  parseAll(): number {
    if (this.tokens.length === 0) throw new Error('Expresión vacía');
    const value = this.expr(0);
    if (this.pos !== this.tokens.length) throw new Error('Tokens sobrantes al final de la expresión');
    return value;
  }

  private peek(): Token | undefined { return this.tokens[this.pos]; }
  private next(): Token { const t = this.tokens[this.pos]; this.pos += 1; return t; }

  private expr(depth: number): number {
    let left = this.term(depth);
    for (;;) {
      const t = this.peek();
      if (t && t.kind === 'op' && (t.value === '+' || t.value === '-')) {
        this.next();
        const right = this.term(depth);
        left = t.value === '+' ? left + right : left - right;
        continue;
      }
      return left;
    }
  }

  private term(depth: number): number {
    let left = this.unary(depth);
    for (;;) {
      const t = this.peek();
      if (t && t.kind === 'op' && (t.value === '*' || t.value === '/')) {
        this.next();
        const right = this.unary(depth);
        if (t.value === '/') {
          if (right === 0) throw new Error('División por cero');
          left = left / right;
        } else {
          left = left * right;
        }
        continue;
      }
      return left;
    }
  }

  private unary(depth: number): number {
    if (depth > MAX_DEPTH) throw new Error('Expresión demasiado anidada');
    const t = this.peek();
    if (t && t.kind === 'op' && t.value === '-') {
      this.next();
      return -this.unary(depth + 1);
    }
    if (t && t.kind === 'op' && t.value === '+') {
      throw new Error('Signo + unario no permitido');
    }
    return this.primary(depth);
  }

  private primary(depth: number): number {
    const t = this.next();
    if (!t) throw new Error('Expresión incompleta');
    if (t.kind === 'num') return t.value;
    if (t.kind === 'ident') {
      if (!this.scope.has(t.name)) throw new Error(`Variable desconocida: ${t.name}`);
      const v = this.scope.get(t.name) as number;
      if (typeof v !== 'number' || !Number.isFinite(v)) throw new Error(`Variable sin valor numérico: ${t.name}`);
      return v;
    }
    if (t.kind === 'lparen') {
      const v = this.expr(depth + 1);
      const close = this.next();
      if (!close || close.kind !== 'rparen') throw new Error('Falta el paréntesis de cierre');
      return v;
    }
    throw new Error('Token inesperado');
  }
}

/** Evalúa una expresión contra un scope. Nunca lanza: devuelve `{ok:false,error}`. */
export function evaluateExpression(expression: unknown, scope: Record<string, number>): EvalResult {
  if (typeof expression !== 'string') return { ok: false, error: 'La expresión debe ser texto' };
  if (expression.length > MAX_EXPRESSION_LENGTH) return { ok: false, error: `Expresión demasiado larga (máx. ${MAX_EXPRESSION_LENGTH})` };
  if (expression.trim().length === 0) return { ok: false, error: 'Expresión vacía' };
  try {
    const tokens = tokenize(expression);
    const value = new Parser(tokens, buildScope(scope)).parseAll();
    if (!Number.isFinite(value)) return { ok: false, error: 'Resultado no finito' };
    return { ok: true, value };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Expresión inválida' };
  }
}

function toFiniteNumber(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'string' && value.trim() !== '') {
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

/**
 * Ejecuta las operaciones en orden. Cada salida entra al scope como `<clave>`
 * y `outputs.<clave>`; los inputs como `<clave>` e `inputs.<clave>`.
 * Un input no numérico o una clave hostil se reportan en `errors`, nunca se
 * convierten a 0 en silencio.
 */
export function evaluateFormula(operations: FormulaOperation[], inputs: Record<string, unknown>): FormulaResult {
  const outputs: Record<string, number> = {};
  const errors: Record<string, string> = {};
  if (!Array.isArray(operations)) {
    errors._formula = 'La fórmula no tiene una lista de operaciones';
    return { outputs, errors };
  }
  const scope: Record<string, number> = {};
  const badInputs: string[] = [];
  for (const key of Object.keys(inputs ?? {})) {
    if (FORBIDDEN_KEYS.has(key)) continue;
    const n = toFiniteNumber(inputs[key]);
    if (n === null) { badInputs.push(key); continue; }
    scope[key] = n;
    scope[`inputs.${key}`] = n;
  }
  for (const op of operations) {
    const key = op?.output_key;
    if (typeof key !== 'string' || !/^[A-Za-z_][A-Za-z0-9_]*$/.test(key) || FORBIDDEN_KEYS.has(key)) {
      // `errors['__proto__'] = …` cambiaría el prototipo: se define como propiedad propia.
      Object.defineProperty(errors, String(key), { value: 'Clave de salida inválida', enumerable: true, writable: true, configurable: true });
      continue;
    }
    const r = evaluateExpression(op.expression, scope);
    if (!r.ok) {
      const unknown = /^Variable desconocida: (.+)$/.exec(r.error)?.[1]?.replace(/^inputs\./, '');
      errors[key] = unknown && badInputs.includes(unknown) ? `Entrada no numérica: ${unknown}` : r.error;
      continue;
    }
    outputs[key] = r.value;
    scope[key] = r.value;
    scope[`outputs.${key}`] = r.value;
  }
  return { outputs, errors };
}
