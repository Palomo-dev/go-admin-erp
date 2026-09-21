/**
 * Rediseño UX de Secuencias (brief 6.3) — contrato sobre el fuente de lo que
 * jsdom no cubre: que los tres botones «Inscribir» usan el motivo probado
 * (`enrollBlockReason`), que los códigos de la RPC pasan por `enrollErrorText`,
 * que la X del `Sheet` compartido es visible en oscuro y que la confirmación de
 * borrado ya no sondea el DOM.
 * Origen: builder de UX-Secuencias ronda 4 (`round4SourceContract`, cierre);
 * consolidado el 2026-09-21.
 */
import { readFileSync } from 'fs';
import { join } from 'path';

const ROOT = process.cwd();
const read = (rel: string) => readFileSync(join(ROOT, rel), 'utf8').replace(/\r\n/g, '\n');

describe('«Inscribir» deshabilitado con motivo (tester r3: la RPC lanza sequence_inactive)', () => {
  it.each([
    'src/components/crm/secuencias/SequenceCard.tsx',
    'src/components/crm/secuencias/EnrollmentsSheet.tsx',
  ])('%s: el botón se deshabilita por `enrollBlockReason` y lo describe con aria-describedby', (rel) => {
    const src = read(rel);
    expect(src).toMatch(/enrollBlockReason\(/);
    expect(src).toMatch(/disabled=\{blockReason !== null\}/);
    expect(src).toMatch(/aria-describedby=\{blockReason \? /);
    expect(src).not.toMatch(/disabled=\{!hasSteps\}/);
  });
  it('EnrollDialog: la confirmación exige el preview sin bloqueo (`is_active` del servidor + pasos activos)', () => {
    const src = read('src/components/crm/secuencias/EnrollDialog.tsx');
    expect(src).toMatch(/enrollBlockReason\(\{ is_active: previewActive, steps \}\)/);
    expect(src).toMatch(/const canConfirm = !!selected && blockReason === null/);
    expect(src).toMatch(/setPreviewActive\(preview\.sequence\.is_active\)/);
  });
});

describe('códigos de la RPC en castellano', () => {
  it('useSequences traduce el `skipped[0].reason` de inscribir y el `reason` de reanudar', () => {
    const src = read('src/components/crm/secuencias/useSequences.ts');
    expect(src.match(/enrollErrorText\(/g)?.length).toBeGreaterThanOrEqual(2);
    expect(src).not.toMatch(/\$\{skipped\[0\]\.reason\}/);
  });
  it('EnrollDialog traduce el motivo del «No se inscribió»', () => {
    expect(read('src/components/crm/secuencias/EnrollDialog.tsx')).toMatch(/enrollErrorText\(result\.skipped\[0\]\?\.reason\)/);
  });
});

describe('X de cierre del Sheet compartido (kit)', () => {
  const src = read('src/components/ui/sheet.tsx');
  it('lleva `dark:text-gray-400` como dialog.tsx: negra sobre gray-900 era ≈1,3:1', () => {
    const close = src.match(/<SheetPrimitive\.Close className="([^"]+)"/)?.[1] ?? '';
    expect(close).toContain('dark:text-gray-400');
    expect(read('src/components/ui/dialog.tsx')).toMatch(/DialogPrimitive\.Close className="[^"]*dark:text-gray-400/);
  });
  it('el texto para lector de pantalla está en castellano', () => {
    expect(src).toContain('<span className="sr-only">Cerrar</span>');
    expect(src).not.toContain('>Close<');
  });
});

describe('SecuenciasPage: foco tras eliminar por `onCloseAutoFocus`, sin sondeo', () => {
  const src = read('src/components/crm/secuencias/SecuenciasPage.tsx');
  it('usa la prop del ConfirmDialog con useReturnFocus', () => {
    expect(src).toMatch(/useReturnFocus\(deleting !== null, focusFallback\)/);
    expect(src).toMatch(/onCloseAutoFocus=\{onDeleteCloseAutoFocus\}/);
  });
  it('no queda el sondeo de 3 s ni el comentario falso', () => {
    expect(src).not.toMatch(/querySelector\('\[role="alertdialog"\]'\)/);
    expect(src).not.toMatch(/no expone `onCloseAutoFocus`/);
    expect(src).not.toMatch(/tries\+\+/);
  });
});
