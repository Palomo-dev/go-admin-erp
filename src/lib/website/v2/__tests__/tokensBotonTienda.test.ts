/**
 * Mayúsculas y hover de botón (PLANO §2 ítems 11-12). Van aparte de `variablesDeTokens`: hay sitios
 * publicados con `boton.mayusculas: true` (presets) y su `style` de hoy no debe cambiar. Las
 * mayúsculas solo se pintan con `buttons_uppercase_active` (lo escriben las plantillas nuevas).
 */
import { hoverDeTokens, variablesDeTokens, variablesMayusculasBoton } from '@/lib/website/v2/tokensDiseno';
import { presetDisenoPorId } from '@/lib/website/v2/presetsDiseno';
import { normalizarOpcionShell, OPCIONES_SHELL } from '@/lib/website/v2/mapeoAjustes';

const MAYUS = { boton: { mayusculas: { mode: 'value', value: true } } } as const;

/** Forma de `tema.tokens.boton` de los 4 sitios publicados que ya guardan mayúsculas (SQL 2026-11-07). */
const PUBLICADOS = [
  { boton: { forma: { mode: 'value', value: 'cuadrado' }, mayusculas: { mode: 'value', value: true } } },
  { boton: { forma: { mode: 'value', value: 'pildora' }, mayusculas: { mode: 'value', value: true } } },
] as const;

describe('mayúsculas y hover de botón', () => {
  test('ausentes: nada (el botón de hoy)', () => {
    expect(variablesMayusculasBoton(undefined, true)).toEqual({});
    expect(variablesMayusculasBoton(null, true)).toEqual({});
    expect(variablesMayusculasBoton({}, true)).toEqual({});
    expect(hoverDeTokens(undefined)).toBeNull();
    expect(hoverDeTokens({})).toBeNull();
  });

  test('la opción que las activa: nueva, default false, fuera del select legacy', () => {
    const def = OPCIONES_SHELL.buttons_uppercase_active;
    expect(def).toMatchObject({ zona: 'header', porDefecto: false, nueva: true, regla: { tipo: 'booleano' } });
    expect(normalizarOpcionShell('buttons_uppercase_active', undefined)).toBe(false);
    expect(normalizarOpcionShell('buttons_uppercase_active', 'true')).toBe(false);
    expect(normalizarOpcionShell('buttons_uppercase_active', true)).toBe(true);
  });

  test('sitios publicados con mayúsculas por preset y sin la opción: no cambian', () => {
    for (const tokens of PUBLICADOS) {
      const activa = normalizarOpcionShell('buttons_uppercase_active', undefined) as boolean;
      expect(variablesMayusculasBoton(tokens, activa)).toEqual({});
      expect(Object.keys(variablesDeTokens(tokens))).not.toContain('--gw-btn-case');
    }
  });

  test('variablesDeTokens no cambia con mayúsculas ni hover', () => {
    const base = { radio: { mode: 'value', value: 'suave' } } as const;
    const con = { ...base, ...MAYUS, hover: { mode: 'value', value: 'expresivo' } } as const;
    expect(variablesDeTokens(con)).toEqual(variablesDeTokens(base));
    // Un sitio con solo mayúsculas sigue sin perillas (no se pone `data-tokens-diseno`).
    expect(variablesDeTokens(MAYUS)).toEqual({});
    expect(Object.keys(variablesDeTokens(presetDisenoPorId('lujo_oscuro').tokens))).not.toContain('--gw-btn-case');
  });

  test('token y opción encendidos emiten caja y espaciado', () => {
    expect(variablesMayusculasBoton(MAYUS, true)).toEqual({ '--gw-btn-case': 'uppercase', '--gw-btn-tracking': '.08em' });
    expect(variablesMayusculasBoton(MAYUS, false)).toEqual({});
  });

  test('mayúsculas apagadas, borradas o inválidas: nada aunque la opción esté', () => {
    expect(variablesMayusculasBoton({ boton: { mayusculas: { mode: 'value', value: false } } }, true)).toEqual({});
    expect(variablesMayusculasBoton({ boton: { mayusculas: { mode: 'clear' } } }, true)).toEqual({});
    expect(variablesMayusculasBoton({ boton: { mayusculas: { mode: 'value', value: 'true' as unknown as boolean } } }, true)).toEqual({});
  });

  test('hover: sutil y expresivo; ninguno, borrado e inválido = null', () => {
    expect(hoverDeTokens({ hover: { mode: 'value', value: 'sutil' } })).toBe('sutil');
    expect(hoverDeTokens({ hover: { mode: 'value', value: 'expresivo' } })).toBe('expresivo');
    expect(hoverDeTokens({ hover: { mode: 'value', value: 'ninguno' } })).toBeNull();
    expect(hoverDeTokens({ hover: { mode: 'clear' } })).toBeNull();
    expect(hoverDeTokens({ hover: { mode: 'value', value: 'brillante' as 'sutil' } })).toBeNull();
  });
});
