/// <reference types="jest" />
/**
 * UX móvil — ronda 1 (UXM-C): «Nueva regla» y la lista a 375 px.
 *
 * Defecto reportado por el dueño (iPhone): las fichas de acción («enviar un
 * email con asunto…», «crear la tarea…») sobresalían por la derecha y el pie
 * quedaba con el interruptor descolgado. Causa raíz medida con el arnés:
 *  1. Cada ficha va en un `motion.div` (`Chip`) dentro de `flex flex-wrap`;
 *     como elemento flex sin `min-w-0` su mínimo era el ancho del texto sin
 *     cortar (`truncate` = nowrap), así que `max-w-full` del botón no servía
 *     y el formulario medía 659 px de scroll en 374 de ancho.
 *  2. El `<form>` no tenía `min-h-0`: no encogía, la hoja entera (con
 *     `overflow-y-auto` del Sheet base) se desplazaba y el pie no quedaba fijo.
 *  3. `SheetFooter` apila en columna inversa bajo `sm`: el interruptor caía
 *     debajo de los botones. A 375 px no caben las cuatro piezas en una fila
 *     (395 px frente a 342), así que en móvil el interruptor va arriba
 *     alineado y los botones a mitades debajo.
 *  4. La tarjeta de la lista (`li` de una rejilla) sin `min-w-0` heredaba el
 *     ancho del nombre `truncate` y sobresalía (649 px medidos).
 *
 * `chipClass` se prueba EJECUTADA; el resto es cableado sobre el fuente con
 * lectores tolerantes a orden de clases y saltos de línea (en jsdom no hay
 * layout: el real se midió con clic real en el navegador integrado).
 */
import fs from 'fs';
import path from 'path';
import { CHIP_ICON_CLASS, CHIP_LIST_CLASS, CHIP_TEXT_CLASS, chipClass } from '../chipClasses';

const ROOT = process.cwd();
const DIR = 'src/components/crm/automatizaciones';
const read = (rel: string) => fs.readFileSync(path.join(ROOT, DIR, rel), 'utf8');
const classes = (s: string) => s.split(/\s+/).filter(Boolean);
const hasAll = (list: string[], ...wanted: string[]) => wanted.every((w) => list.includes(w));

/** Etiqueta JSX de apertura `<Name …>` completa (llaves balanceadas), la n-ésima. */
function openingTag(src: string, name: string, nth = 0): string {
  const re = new RegExp(`<${name}\\b`, 'g');
  let m: RegExpExecArray | null;
  let i = -1;
  for (let k = 0; k <= nth; k += 1) { m = re.exec(src); if (!m) return ''; i = m.index; }
  let depth = 0;
  for (let j = i; j < src.length; j += 1) {
    if (src[j] === '{') depth += 1;
    else if (src[j] === '}') depth -= 1;
    else if (src[j] === '>' && depth === 0) return src.slice(i, j + 1);
  }
  return '';
}

describe('fichas apiladas en móvil (chipClass ejecutada)', () => {
  it('stacked: tarjeta a ancho completo y texto arriba en móvil; píldora en línea desde sm', () => {
    const cls = classes(chipClass(false, 'emerald', true));
    expect(hasAll(cls, 'min-w-0', 'max-w-full', 'w-full', 'items-start', 'rounded-lg', 'sm:w-auto', 'sm:items-center', 'sm:rounded-full')).toBe(true);
    expect(cls).not.toContain('rounded-full');
    expect(cls).not.toContain('items-center');
  });

  it('inline (toolbar, prueba en seco, todas/alguna): la píldora de siempre, nunca w-full', () => {
    const cls = classes(chipClass(true));
    expect(hasAll(cls, 'min-w-0', 'max-w-full', 'items-center', 'rounded-full')).toBe(true);
    expect(cls).not.toContain('w-full');
    expect(cls).not.toContain('items-start');
  });

  it('el texto de la ficha envuelve en móvil (min-w-0 break-words) y se trunca solo desde sm', () => {
    const cls = classes(CHIP_TEXT_CLASS);
    expect(hasAll(cls, 'min-w-0', 'flex-1', 'break-words', 'sm:truncate')).toBe(true);
    expect(cls).not.toContain('truncate');
  });

  it('la lista de fichas se apila en móvil y envuelve en línea desde sm', () => {
    expect(hasAll(classes(CHIP_LIST_CLASS), 'flex', 'flex-col', 'sm:flex-row', 'sm:flex-wrap')).toBe(true);
    expect(hasAll(classes(CHIP_ICON_CLASS), 'shrink-0', 'sm:mt-0')).toBe(true);
  });
});

describe('cableado: acciones, condiciones y Chip', () => {
  const actions = read('ActionsBlock.tsx');
  const conditions = read('ConditionsBlock.tsx');
  const motion = read('motion.tsx');

  it('ActionsBlock y ConditionsBlock usan la ficha apilada y el texto que envuelve', () => {
    for (const [src, tone] of [[actions, 'emerald'], [conditions, 'amber']] as const) {
      expect(src).toMatch(new RegExp(`chipClass\\(\\s*open\\s*,\\s*'${tone}'\\s*,\\s*true\\s*\\)`));
      expect(src).toMatch(/className=\{CHIP_LIST_CLASS\}/);
      expect(src).toMatch(/<span className=\{CHIP_TEXT_CLASS\}>/);
      expect(src).not.toMatch(/<span className="truncate">/);
    }
  });

  it('Chip (motion.div, elemento flex) nunca mide más que su contenedor', () => {
    expect(motion).toMatch(/\['min-w-0 max-w-full', className\]/);
  });
});

describe('hoja «Nueva regla»: h-dvh, cuerpo con scroll propio, pie alineado', () => {
  const sheet = read('RuleEditorSheet.tsx');

  it('la hoja mide h-dvh y no se desplaza como un todo; el formulario es el único con scroll', () => {
    const content = classes((openingTag(sheet, 'SheetContent').match(/className="([^"]+)"/) ?? [])[1] ?? '');
    expect(hasAll(content, 'flex', 'flex-col', 'h-dvh', 'overflow-hidden', 'w-full', 'p-0', 'gap-0')).toBe(true);
    expect(content).not.toContain('overflow-y-auto');
    const form = classes((openingTag(sheet, 'form').match(/className="([^"]+)"/) ?? [])[1] ?? '');
    expect(hasAll(form, 'relative', 'min-h-0', 'flex-1', 'overflow-y-auto')).toBe(true);
  });

  it('el pie: interruptor arriba alineado y botones a mitades en móvil; una fila desde sm; safe-area', () => {
    const tag = openingTag(sheet, 'SheetFooter');
    const cls = classes([...tag.matchAll(/'([^']+)'/g)].map((m) => m[1]).join(' '));
    expect(hasAll(cls, 'flex-col', 'sm:flex-row', 'sm:items-center', 'sm:justify-between')).toBe(true);
    expect(cls).not.toContain('flex-col-reverse');
    expect(cls.some((c) => c.startsWith('pb-[') && c.includes('env(safe-area-inset-bottom)'))).toBe(true);
    expect(sheet).toMatch(/className="grid grid-cols-2 gap-2 sm:flex sm:shrink-0"/);
  });
});

describe('editor de una acción, vista previa, tarjeta, prueba en seco e historial', () => {
  it('ActionChipEditor: selector de tipo a ancho completo en móvil y campos con min-w-0', () => {
    const src = read('ActionChipEditor.tsx');
    expect(src).toMatch(/className="w-full min-w-0 sm:w-auto sm:min-w-\[200px\] sm:flex-1"/);
    expect(src).toMatch(/cn\('min-w-0', f\.kind === 'textarea' && 'sm:col-span-2'\)/);
    // Todos los <select> del editor comparten SELECT_CLASS, que es w-full.
    expect(classes((read('TriggerBlock.tsx').match(/SELECT_CLASS\s*=\s*'([^']+)'/) ?? [])[1] ?? '')).toContain('w-full');
    expect(src.match(/className=\{SELECT_CLASS\}/g)?.length ?? 0).toBeGreaterThanOrEqual(4);
  });

  it('RulePreview («Así funcionará»): la frase envuelve, también los marcadores {{…}}', () => {
    expect(read('RulePreview.tsx')).toMatch(/aria-live="polite" className="[^"]*\bbreak-words\b[^"]*"/);
  });

  it('RuleCard: la celda de la rejilla tiene min-w-0 y el nombre corta por palabra en dos líneas', () => {
    const src = read('RuleCard.tsx');
    expect(src).toMatch(/'flex min-w-0 flex-col gap-3 rounded-xl/);
    expect(src).toMatch(/className="line-clamp-2 break-words font-semibold/);
    expect(src).not.toMatch(/className="truncate font-semibold/);
    expect(src.match(/line-clamp-2 min-w-0 break-words/g)?.length).toBe(2);
  });

  it('DryRunDialog: cada resultado (li) tiene min-w-0 max-w-full para que la píldora trunque', () => {
    const src = read('DryRunDialog.tsx');
    expect(src.match(/<li[^>]*className="min-w-0 max-w-full"/g)?.length).toBe(2);
  });

  it('RunsSheet: la columna Fecha se oculta bajo sm y la fecha va bajo el estado', () => {
    const src = read('RunsSheet.tsx');
    expect(src).toMatch(/<TableHead scope="col" className="hidden sm:table-cell">Fecha<\/TableHead>/);
    expect(src).toMatch(/className="hidden whitespace-nowrap align-top [^"]*sm:table-cell"/);
    expect(src).toMatch(/className="mt-0\.5 block text-xs font-normal [^"]*sm:hidden"/);
  });
});
