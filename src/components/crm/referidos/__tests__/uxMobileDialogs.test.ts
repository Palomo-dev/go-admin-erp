/// <reference types="jest" />
/**
 * UX móvil r1 (UXM-A) — «Registrar referido» desbordaba a ~1000 px en 375 px.
 * Causa raíz medida en el navegador: la única columna del `grid` de
 * `DialogContent` no tenía tamaño mínimo 0, así que crecía al ancho
 * mín-content de los `<span class="truncate">` (nowrap) de la lista de
 * clientes de `EntitySearchList`; título, campos y pie se estiraban con ella.
 * Arreglo genérico en `src/components/ui/dialog.tsx` (`grid-cols-1` +
 * `break-words` en título/descripción) y cabecera a la
 * izquierda en los diálogos del CRM. Contrato estático sobre el fuente (jest
 * en node, sin @testing-library), como el resto de tests del módulo.
 */

import { readFileSync } from 'fs';
import { join } from 'path';

const ROOT = process.cwd();
const read = (rel: string) => readFileSync(join(ROOT, rel), 'utf8').replace(/\r\n/g, '\n');

describe('ui/dialog.tsx: la columna del grid no crece al mín-content de un hijo', () => {
  const src = read('src/components/ui/dialog.tsx');

  it('`DialogContent` lleva `grid grid-cols-1` (la columna cabe en el contenedor) y no pisa `min-w-*` de hijos', () => {
    expect(src).toMatch(/grid grid-cols-1 w-\[calc\(100%-2rem\)\]/);
    expect(src).not.toMatch(/\[&>\*\]:min-w-0/);
  });

  it('`DialogTitle` y `DialogDescription` parten palabras largas (`break-words`)', () => {
    expect(src).toMatch(/"break-words text-lg font-semibold/);
    expect(src).toMatch(/cn\("break-words text-sm text-gray-500/);
  });

  it('no cambia el ancho base del diálogo en escritorio (`max-w-lg`, `md:w-full`)', () => {
    expect(src).toMatch(/max-w-lg translate-x-\[-50%\]/);
    expect(src).toMatch(/sm:rounded-lg md:w-full/);
  });
});

describe('EntitySearchList: lista de resultados con altura acotada y scroll propio', () => {
  const src = read('src/components/crm/shared/EntitySearchList.tsx');

  it('el `<ul>` de resultados lleva `max-h-56` + `overflow-y-auto`', () => {
    expect(src).toMatch(/<ul[^>]*className="max-h-56 space-y-1 overflow-y-auto"/);
  });

  it('título y subtítulo del resultado truncan (`truncate`) en vez de forzar ancho', () => {
    expect(src).toMatch(/<span className="max-w-full truncate font-medium">/);
    expect(src).toMatch(/<span className="max-w-full truncate text-xs/);
  });

  it('en móvil el resultado se apila (título y subtítulo enteros); en `sm+` vuelve a fila', () => {
    // Tester UXM-A: en fila a 375 px «Oportunidad 2» quedaba «Oportuni…» y el subtítulo también cortado.
    expect(src).toMatch(/'flex w-full flex-col items-start gap-0\.5 [^']*sm:flex-row sm:items-center sm:justify-between sm:gap-2'/);
  });
});

// El contrato «`DialogHeader pr-6 text-left` + `DialogFooter` de 44 px» ya no vigila a
// nadie: `partners/RegisterDealDialog.tsx` pasó al `Dialogo` del kit (Figma 1318:91569)
// y los diálogos de referidos a `PanelAdaptable` (contrato al final de este archivo).

describe.each([
  ['src/components/crm/partners/PartnerEditor.tsx'],
  ['src/components/crm/partners/TierEditor.tsx'],
])('%s: cabecera de la hoja a la izquierda, sin pisar el botón de cerrar', (rel) => {
  it('`SheetHeader` lleva `text-left` y `pr-8` DESPUÉS de `px-6` (tailwind-merge descarta un `pr-8` anterior a `px-6`)', () => {
    // Tester UXM-A: con `pr-8 ... px-6` el `pr-8` desaparecía en runtime (twMerge) y el texto pisaba la X (right-4).
    expect(read(rel)).toMatch(/<SheetHeader className="text-left border-b[^"]* px-6 pr-8 py-4/);
  });
});

describe.each([
  ['src/components/crm/partners/PartnerEditor.tsx', 1],
  // RegisterDealDialog: el tipo de deal pasó a chips (`ChipsOpcion`, Figma 1318:91569); ya no tiene `SelectTrigger`.
])('%s: los `SelectTrigger` no centran ni parten en dos líneas el valor largo', (rel, count) => {
  it('cada disparador lleva `text-left [&>span]:line-clamp-1`', () => {
    const src = read(rel);
    const triggers = src.match(/<SelectTrigger /g) ?? [];
    const fixed = src.match(/<SelectTrigger [^>]*className="text-left \[&>span\]:line-clamp-1"/g) ?? [];
    expect(triggers).toHaveLength(count);
    expect(fixed).toHaveLength(count);
  });
});

/*
 * Referidos al Figma (zona F, 2026-11-15): «Registrar referido» y «Convertir en
 * lead» pasaron a `PanelAdaptable` del kit (diálogo en escritorio, hoja inferior
 * con asa en móvil, pie con botones a lo ancho), la hoja «Programas» a
 * `HojaDetalle` y el formulario de programa usa chips (`ChipsOpcion`) en vez de
 * `Select`. Los contratos de arriba siguen vigilando a partners; estos, a referidos.
 */
describe.each([
  ['src/components/crm/referidos/RegisterReferralDialog.tsx'],
  ['src/components/crm/referidos/ConvertReferralDialog.tsx'],
])('%s: diálogo adaptable del kit (hoja inferior en móvil)', (rel) => {
  const src = read(rel);
  it('usa `PanelAdaptable` y no el `Dialog` suelto de ui', () => {
    expect(src).toMatch(/<PanelAdaptable\b/);
    expect(src).not.toMatch(/from '@\/components\/ui\/dialog'/);
  });
  it('el pie ocupa el ancho en móvil (`anchoCompleto: !escritorio`)', () => {
    expect(src).toMatch(/anchoCompleto: !escritorio/);
  });
  it('no fija anchos mínimos ni `whitespace-nowrap` que reabran el desborde', () => {
    expect(src).not.toMatch(/min-w-\[|whitespace-nowrap/);
  });
});

describe('RegisterReferralDialog: en móvil el correo se oculta tras «Añadir correo» (Figma 1313:89380)', () => {
  const src = read('src/components/crm/referidos/RegisterReferralDialog.tsx');
  it('muestra el correo en escritorio, si ya tiene valor o tras pulsar «Añadir correo»', () => {
    expect(src).toMatch(/const mostrarCorreo = escritorio \|\| conCorreo \|\| !!form\.referred_email;/);
    expect(src).toMatch(/registrarDialogo\.anadirCorreo/);
  });
});

describe('ReferralProgramForm: chips del kit para tipo y destinatario, sin `Select`', () => {
  const src = read('src/components/crm/referidos/ReferralProgramForm.tsx');
  it('tipo y «Recompensa para» con `ChipsOpcion` sobre los valores del CHECK', () => {
    expect(src.match(/<ChipsOpcion</g) ?? []).toHaveLength(2);
    expect(src).toMatch(/REWARD_TYPES\.map/);
    expect(src).toMatch(/REWARD_TO\.map/);
    expect(src).not.toMatch(/<SelectTrigger /);
  });
  it('el valor lleva el símbolo de la moneda base (nunca «COP» cableado) o % si es descuento', () => {
    expect(src).toMatch(/prefijo=\{esDescuento \? undefined : simbolo\}/);
    expect(src).not.toMatch(/'COP'/);
  });
});
