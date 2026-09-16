/// <reference types="jest" />
/**
 * F12-misc (sprint de deuda) — dos hallazgos no bloqueantes del tester de F12:
 *
 * 1. Los filtros `or` de PostgREST rompen (PGRST100) cuando el texto del
 *    usuario trae comas, paréntesis o comillas. El helper único
 *    `src/lib/utils/postgrestFilters.ts` entrecomilla el valor (`"…"` con
 *    escape de `"` y `\`) y escapa los comodines de `ilike`.
 * 2. `formatMoney(250000.5)` → «$ 250.000,5»: con fracción se muestran dos
 *    decimales fijos; los enteros siguen sin decimales.
 */
import { ilikeAnyOf, likePattern, quoteFilterValue } from '@/lib/utils/postgrestFilters';
import { formatMoney } from '@/lib/services/crm/partnerModel';

describe('postgrestFilters.quoteFilterValue', () => {
  it('envuelve en comillas dobles y deja pasar texto corriente', () => {
    expect(quoteFilterValue('ana')).toBe('"ana"');
    expect(quoteFilterValue('')).toBe('""');
  });
  it('comas y paréntesis quedan dentro de las comillas (ya no son sintaxis del filtro)', () => {
    expect(quoteFilterValue('Pérez, Juan (hijo)')).toBe('"Pérez, Juan (hijo)"');
  });
  it('escapa comillas dobles y barras invertidas', () => {
    expect(quoteFilterValue('a"b')).toBe('"a\\"b"');
    expect(quoteFilterValue('a\\b')).toBe('"a\\\\b"');
  });
  it('bytes de control (salto de línea, NUL) se retiran: no viajan a PostgREST', () => {
    expect(quoteFilterValue('a\nb\u0000c')).toBe('"abc"');
  });
});

describe('postgrestFilters.likePattern', () => {
  it('envuelve en % y escapa los comodines del usuario', () => {
    expect(likePattern('50%')).toBe('%50\\%%');
    expect(likePattern('a_b')).toBe('%a\\_b%');
    expect(likePattern('a\\b')).toBe('%a\\\\b%');
  });
});

describe('postgrestFilters.ilikeAnyOf', () => {
  it('una condición por columna, valor entrecomillado y con comodines', () => {
    expect(ilikeAnyOf(['full_name', 'email'], 'ana')).toBe('full_name.ilike."%ana%",email.ilike."%ana%"');
  });
  it('coma, paréntesis y comillas del usuario no rompen el filtro `or`', () => {
    expect(ilikeAnyOf(['full_name'], 'Pérez, Juan (hijo)')).toBe('full_name.ilike."%Pérez, Juan (hijo)%"');
    expect(ilikeAnyOf(['full_name'], 'Juan "el flaco"')).toBe('full_name.ilike."%Juan \\"el flaco\\"%"');
  });
  it('el escape de `%` sobrevive al entrecomillado: `\\%` se manda como `\\\\%`', () => {
    // PostgREST desescapa `\\` → `\`, y Postgres lee `\%` como el carácter literal.
    expect(ilikeAnyOf(['notes'], '50%')).toBe('notes.ilike."%50\\\\%%"');
  });
  it('recorta espacios; con texto vacío devuelve cadena vacía (el llamador no aplica el filtro)', () => {
    expect(ilikeAnyOf(['a', 'b'], '   ')).toBe('');
    expect(ilikeAnyOf(['a'], '  ana  ')).toBe('a.ilike."%ana%"');
  });
  it('sin columnas devuelve cadena vacía', () => {
    expect(ilikeAnyOf([], 'ana')).toBe('');
  });
});

describe('partnerModel.formatMoney', () => {
  it('con fracción muestra dos decimales fijos (250000.5 → «…,50»)', () => {
    expect(formatMoney(250000.5, 'COP')).toMatch(/250\.000,50$/);
    expect(formatMoney(250000.5, null)).toBe('250.000,50');
    expect(formatMoney('1234.5', 'USD')).toMatch(/1\.234,50$/);
  });
  it('entero → sin decimales', () => {
    expect(formatMoney(250000, 'COP')).toMatch(/250\.000$/);
    expect(formatMoney(250000, null)).toBe('250.000');
  });
  it('redondea a dos decimales y nunca más', () => {
    expect(formatMoney(1234.567, null)).toBe('1.234,57');
    expect(formatMoney(0.005, null)).toBe('0,01');
  });
  it('la fracción se decide DESPUÉS de redondear: 100.001 es «100», no «100,00»', () => {
    expect(formatMoney(100.001, null)).toBe('100');
    expect(formatMoney(99.999, 'COP')).toMatch(/100$/);
  });
  it('valores inválidos → 0 sin decimales; moneda desconocida → cifra + código', () => {
    expect(formatMoney('abc', null)).toBe('0');
    expect(formatMoney(null, 'COP')).toMatch(/0$/);
    expect(formatMoney(10.5, 'XXX-NO')).toBe('10,50 XXX-NO');
  });
});
