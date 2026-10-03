/// <reference types="jest" />
/**
 * UX móvil — UXM-C (automatizaciones): casos estables del TESTER (ronda 1),
 * consolidados el 2026-09-21 desde `mobileLayoutTester`. Fijan los cuatro
 * defectos medidos con clic real en el navegador integrado sobre el arnés
 * `/auth/verify-ux-ct` (reglas con marcadores de 60 caracteres sin espacios,
 * asuntos de 200, 6 acciones, 5 condiciones con un grupo anidado):
 *
 *  1. `CHIP_TEXT_CLASS` llevaba `sm:flex-none`: con `flex: none` el texto no
 *     encoge y `sm:truncate` nunca actuaba. A 768 px el texto medía 897 px
 *     dentro de una píldora de 670, el chevron quedaba fuera y el formulario
 *     ganaba scroll lateral (1120 px en 752). Con `flex-1` trunca (ellipsis
 *     medido) y `scrollWidth === clientWidth`.
 *  2. Ficha de grupo anidado: la nota «· grupo, se edita como JSON» iba en
 *     línea con el texto y lo estrangulaba (163 px de ancho, 194 px de alto a
 *     375; 374 px de alto a 320). En móvil la nota baja a su línea
 *     (`flex-wrap` + `basis-full`), desde `sm` vuelve en línea.
 *  3. `DryRunDialog`: el nombre de la regla era texto suelto de un título
 *     `flex`; como ítem anónimo no encogía y el diálogo ganaba scroll lateral
 *     (809 px en 293) a 375. Va en un `span` con `min-w-0 break-words`.
 *  4. `RunsSheet`: `break-words` (`overflow-wrap: break-word`) no reduce el
 *     ancho mínimo de una celda de tabla; un error de 120 caracteres sin
 *     espacios ensanchaba la tabla a 1146 px. `overflow-wrap: anywhere` sí.
 *
 * Además (pre-existente, no del móvil): al reordenar una acción por teclado
 * el editor se vuelve a montar y el botón pulsado desaparece; el foco caía al
 * contenedor de la hoja. Ahora va al mismo botón de la acción movida (o a su
 * ficha si ese botón queda deshabilitado en un extremo).
 */
import fs from 'fs';
import path from 'path';
import { CHIP_TEXT_CLASS, chipClass } from '../chipClasses';

const DIR = path.join(process.cwd(), 'src/components/crm/automatizaciones');
const read = (rel: string) => fs.readFileSync(path.join(DIR, rel), 'utf8');
const classes = (s: string) => s.split(/\s+/).filter(Boolean);

describe('1. el texto de la ficha encoge desde sm (sm:truncate vivo)', () => {
  it('CHIP_TEXT_CLASS no lleva flex-none en ningún breakpoint', () => {
    const cls = classes(CHIP_TEXT_CLASS);
    expect(cls).toEqual(expect.arrayContaining(['min-w-0', 'flex-1', 'break-words', 'sm:truncate']));
    expect(cls.some((c) => /(^|:)flex-none$/.test(c) || /(^|:)shrink-0$/.test(c))).toBe(false);
  });

  it('la ficha apilada sigue siendo píldora shrink-to-fit desde sm (sm:w-auto, max-w-full)', () => {
    const cls = classes(chipClass(false, 'emerald', true));
    expect(cls).toEqual(expect.arrayContaining(['max-w-full', 'min-w-0', 'sm:w-auto']));
  });
});

describe('2. grupo anidado conservado en móvil', () => {
  const src = read('ConditionsBlock.tsx');
  it('el resumen encoge y rompe incluso IDs largos; el grupo mantiene su editor JSON', () => {
    expect(src).toContain('min-w-0 flex-1 break-words');
    expect(src).toContain('[overflow-wrap:anywhere]');
    expect(src).toContain('onClick={openJson}');
    expect(src).toContain('· grupo, se edita como JSON');
  });
});

describe('3. DryRunDialog: el nombre largo no ensancha el diálogo', () => {
  it('el título flex lleva el texto en un span min-w-0 break-words y el icono shrink-0', () => {
    const src = read('DryRunDialog.tsx');
    expect(src).toMatch(/<span className="min-w-0 break-words">\{tr\("Probar en seco «"\)\}\{rule\?\.name\}»<\/span>/);
    expect(src).toMatch(/<FlaskConical(?: strokeWidth=\{1\.5\})? className="h-5 w-5 shrink-0/);
  });
});

describe('4. historial responsive nativo', () => {
  const src = read('RunsSheet.tsx');
  it('los errores del servidor rompen en cualquier punto dentro de la celda del kit', () => {
    expect(src).toContain('[overflow-wrap:anywhere]');
    expect(src).toContain('run.error_message');
    expect(src).toContain('<DataTable');
  });
  it('la fecha usa el timezone de la organización al filtrar y al presentar', () => {
    expect(src).toContain('toPlainDate(new Date(run.created_at), timezone)');
    expect(src).toContain('formatDateTime(run.created_at)');
  });
});

describe('5. foco tras reordenar una acción por teclado', () => {
  it('ActionsBlock pide el foco para el mismo botón de la acción movida, con la ficha como respaldo', () => {
    const src = read('ActionsBlock.tsx');
    expect(src).toMatch(/setFocusTarget\(\[`action-\$\{target\}-move-\$\{dir\}`, `action-chip-\$\{target\}`\]\)/);
    expect(src).toMatch(/Array\.isArray\(focusTarget\)[\s\S]*?!\(e as HTMLButtonElement\)\.disabled/);
  });

  it('los botones Subir/Bajar llevan id action-N-move-up / action-N-move-down', () => {
    const src = read('ActionChipEditor.tsx');
    expect(src).toMatch(/<Button id=\{id\('move-up'\)\}[^>]*aria-label=\{tr\("Subir la acción/);
    expect(src).toMatch(/<Button id=\{id\('move-down'\)\}[^>]*aria-label=\{tr\("Bajar la acción/);
  });
});
