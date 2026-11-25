/// <reference types="jest" />
/**
 * UX móvil de Automatizaciones tras el rediseño de Figma (CRM 1373:17 lista,
 * 1375:17 constructor, 1373:1161 historial; 2026-11-15).
 *
 * Las fichas, la hoja lateral «Nueva regla», `DryRunDialog` y `RunsSheet` que
 * fijaban las rondas UXM-C ya no existen: el editor es una página y la lista y
 * el historial son `DataTable` del kit. Lo que se conserva de aquellas rondas:
 *  - nada debe ensanchar la pantalla a 375 px: el constructor apila sus dos
 *    columnas bajo `lg`, las filas de condición apilan sus tres campos bajo
 *    `sm` y los textos largos (errores sin espacios) rompen en cualquier punto
 *    (`overflow-wrap: anywhere`, no `break-words`, que no encoge una celda);
 *  - la lista y el historial pintan una tarjeta por registro en móvil
 *    (`tarjetaMovil`), sin scroll horizontal;
 *  - el editor de una acción: selector de tipo a ancho completo en móvil.
 */
import fs from 'fs';
import path from 'path';

const DIR = path.join(process.cwd(), 'src/components/crm/automatizaciones');
const read = (rel: string) => fs.readFileSync(path.join(DIR, rel), 'utf8');

describe('constructor de reglas (página)', () => {
  const builder = read('RuleBuilderPage.tsx');
  const bloques = read('BloquesConstructor.tsx');

  it('las dos columnas (bloques y panel lateral) se apilan bajo lg', () => {
    expect(builder).toMatch(/grid items-start gap-4 lg:grid-cols-\[minmax\(0,1fr\)_360px\]/);
    expect(builder).toMatch(/<div className="min-w-0">/);
    expect(builder).toMatch(/<aside className="min-w-0 space-y-4"/);
  });

  it('cada fila de condición apila campo, operador y valor bajo sm', () => {
    expect(bloques).toMatch(/grid min-w-0 gap-2 sm:grid-cols-3/);
    expect(bloques).toMatch(/grid-cols-\[32px_minmax\(0,1fr\)_40px\]/);
  });

  it('la frase de la acción y «En palabras» envuelven (marcadores {{…}} sin espacios)', () => {
    expect(bloques).toMatch(/block break-words text-sm font-medium text-fg/);
    expect(builder).toMatch(/aria-live="polite" className="[^"]*\bbreak-words\b[^"]*"/);
  });

  it('ActionChipEditor: selector de tipo a ancho completo en móvil y campos con min-w-0', () => {
    const src = read('ActionChipEditor.tsx');
    expect(src).toMatch(/className="w-full min-w-0 sm:w-auto sm:min-w-\[200px\] sm:flex-1"/);
    expect(src).toMatch(/cn\('min-w-0', f\.kind === 'textarea' && 'sm:col-span-2'\)/);
    expect(src).toMatch(/const SELECT_CLASS =\s*'h-10 w-full /);
    expect(src).not.toMatch(/\bdark:/);
  });
});

describe('lista e historial: tarjetas en móvil y textos que no ensanchan', () => {
  it('la lista y el historial dan tarjetaMovil a la DataTable', () => {
    expect(read('AutomatizacionesPage.tsx')).toMatch(/tarjetaMovil=\{/);
    expect(read('HistorialEjecucionesPage.tsx')).toMatch(/tarjetaMovil=\{/);
  });

  it('el detalle del historial rompe en cualquier punto (overflow-wrap: anywhere)', () => {
    const src = read('HistorialEjecucionesPage.tsx');
    expect(src.match(/\[overflow-wrap:anywhere\]/g)?.length ?? 0).toBeGreaterThanOrEqual(3);
    expect(src).not.toMatch(/break-words/);
  });

  it('ninguna pantalla de automatizaciones usa dark: ni colores sueltos', () => {
    for (const f of ['AutomatizacionesPage.tsx', 'RuleBuilderPage.tsx', 'BloquesConstructor.tsx', 'HistorialEjecucionesPage.tsx', 'PlantillasRegla.tsx', 'celdasRegla.tsx']) {
      const src = read(f);
      expect({ f, dark: /\bdark:/.test(src), gris: /\b(?:text|bg|border)-(?:gray|slate|blue|red|amber|emerald)-\d/.test(src) }).toEqual({ f, dark: false, gris: false });
    }
  });
});
