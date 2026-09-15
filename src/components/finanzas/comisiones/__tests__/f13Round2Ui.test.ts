/// <reference types="jest" />
/**
 * F13 — ronda 2, UI de comisiones y cuotas: foco tras confirmar (modelo puro
 * + contrato de fuente), plural correcto por función pura, motivo del rechazo
 * visible, porcentaje real en el historial y contraste explícito en la hoja.
 */
import * as fs from 'fs';
import * as path from 'path';
import { commissionActionMessage, focusAfterCommissionAction, pluralComisiones } from '../comisionesModel';
import { commissionsWidgetModel } from '@/components/inicio/widgets/widgetModels';

const ROOT = path.resolve(__dirname, '../../../../..');
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const stripComments = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const el = (connected: boolean) => ({ isConnected: connected, name: connected ? 'ok' : 'gone' });

describe('focusAfterCommissionAction — puro', () => {
  it('disparador vivo → el disparador', () => {
    const opener = el(true);
    expect(focusAfterCommissionAction(opener, [el(true)])).toBe(opener);
  });
  it('disparador desmontado → primer candidato conectado en orden: fila siguiente → Actualizar → Seleccionar todas', () => {
    const next = el(true);
    const refresh = el(true);
    const all = el(true);
    expect(focusAfterCommissionAction(el(false), [next, refresh, all])).toBe(next);
    expect(focusAfterCommissionAction(el(false), [el(false), refresh, all])).toBe(refresh);
    expect(focusAfterCommissionAction(null, [null, undefined, el(false), all])).toBe(all);
  });
  it('nada conectado → null (quien llama no enfoca el body a ciegas)', () => {
    expect(focusAfterCommissionAction(el(false), [el(false), null])).toBeNull();
    expect(focusAfterCommissionAction(null, [])).toBeNull();
  });
});

describe('plural de «comisión» por función pura', () => {
  it('1 comisión / 2 comisiones, con participio concordado', () => {
    expect(pluralComisiones(1)).toBe('1 comisión');
    expect(pluralComisiones(2)).toBe('2 comisiones');
    expect(pluralComisiones(0)).toBe('0 comisiones');
    expect(pluralComisiones(1, 'pagada')).toBe('1 comisión pagada');
    expect(pluralComisiones(3, 'pagada')).toBe('3 comisiones pagadas');
    expect(pluralComisiones(1, 'pendiente')).toBe('1 comisión pendiente');
    expect(pluralComisiones(2, 'pendiente')).toBe('2 comisiones pendientes');
  });
  it('mensajes de resultado: pagadas / no se pudo(ieron) pagar', () => {
    expect(commissionActionMessage('pagar', 1, 0)).toBe('1 comisión pagada');
    expect(commissionActionMessage('pagar', 2, 0)).toBe('2 comisiones pagadas');
    expect(commissionActionMessage('pagar', 2, 1, 'Ya estaba pagada')).toBe('2 comisiones pagadas · 1 no se pudo pagar (Ya estaba pagada)');
    expect(commissionActionMessage('pagar', 0, 2, 'x')).toBe('0 comisiones pagadas · 2 no se pudieron pagar (x)');
    expect(commissionActionMessage('rechazar', 1, 0)).toBe('1 comisión rechazada');
    expect(commissionActionMessage('rechazar', 3, 2, 'boom')).toBe('3 comisiones rechazadas · 2 no se pudieron rechazar (boom)');
  });
  it('ninguna fuente de la zona escribe «comisiónes» ni el patrón comisión${…es}', () => {
    const files = [
      'src/components/finanzas/comisiones/ComisionesToolbar.tsx',
      'src/components/finanzas/comisiones/useComisiones.ts',
      'src/components/finanzas/comisiones/ComisionesSummary.tsx',
      'src/components/inicio/widgets/CommissionsWidget.tsx',
    ];
    for (const f of files) {
      const s = read(f);
      expect({ f, bad: /comisi[oó]n\$\{[^}]*'es'/.test(s) || /comisiónes/.test(s) }).toEqual({ f, bad: false });
    }
  });
  it('widget: las comisiones en otra moneda salen como líneas aparte, nunca sumadas', () => {
    const m = commissionsWidgetModel({ accrued: 100, paid: 100, total: 200, count: 2 }, 'COP', [{ currency: 'USD', accrued: 11344.54, paid: 0, total: 11344.54, count: 1 }]);
    if (m.kind !== 'data') throw new Error('esperaba datos');
    expect(m.otherLines).toHaveLength(1);
    expect(m.otherLines[0]).toMatch(/^\+ 1 comisión en USD: /);
    expect(m.otherLines[0]).toMatch(/11\.344,54/);
    for (const label of [m.totalLabel, m.accruedLabel, m.paidLabel, m.pendingLabel]) {
      expect(label).not.toMatch(/11\.[35]44/);
    }
    expect(m.totalLabel).toMatch(/200,00/);
    expect(m.accruedLabel).toMatch(/200,00/);
    const only = commissionsWidgetModel({ accrued: 0, paid: 0, total: 0, count: 0 }, 'COP', [{ currency: 'USD', accrued: 5, paid: 0, total: 5, count: 1 }]);
    expect(only.kind).toBe('data');
  });
});

describe('contrato de fuente — foco, motivo visible, porcentaje real, contraste', () => {
  it('los tres useReturnFocus de comisiones llevan fallback y la barra no se desmonta con el diálogo abierto', () => {
    const toolbar = stripComments(read('src/components/finanzas/comisiones/ComisionesToolbar.tsx'));
    const page = stripComments(read('src/app/app/finanzas/comisiones/page.tsx'));
    const clawback = stripComments(read('src/components/finanzas/comisiones/ClawbackDialog.tsx'));
    expect(toolbar).toMatch(/useReturnFocus\([^)]*,\s*\w+\)/);
    expect(page).toMatch(/useReturnFocus\([^)]*,\s*\w+\)/);
    expect(clawback).toMatch(/useReturnFocus\(open,\s*\w+\)/);
    // La barra solo se retira cuando no hay selección Y no hay diálogo abierto.
    expect(toolbar).toMatch(/selectedRows\.length === 0 && dialog === null\) return null/);
    expect(toolbar).not.toMatch(/if \(selectedRows\.length === 0\) return null/);
  });
  it('borrar cuota: fallback a la siguiente cuota o al botón «Guardar cuota» del bloque «Nueva cuota»', () => {
    const history = stripComments(read('src/components/organization/quotas/QuotaHistory.tsx'));
    expect(history).toMatch(/useReturnFocus\(toDelete !== null,\s*\w+\)/);
    expect(history).toContain('data-quota-delete');
    expect(read('src/components/organization/quotas/QuotaEditor.tsx')).toContain('data-quota-submit');
  });
  it('la lista muestra el motivo del rechazo/clawback como texto, no solo en title', () => {
    const list = stripComments(read('src/components/finanzas/comisiones/ComisionesList.tsx'));
    expect(list).not.toMatch(/title=\{c\.status === 'cancelled'/);
    expect(list).toMatch(/Motivo:\s*\{c\.notes\}/);
  });
  it('el historial de cuotas muestra el porcentaje real (raw_pct), no el acotado a 100', () => {
    const history = stripComments(read('src/components/organization/quotas/QuotaHistory.tsx'));
    const jsx = history.slice(history.indexOf('<ul'));
    expect(jsx).toMatch(/\{d\.raw_pct\} %/);
    expect(jsx).not.toMatch(/\{d\.pct\} %/);
  });
  it('MemberQuotasSheet: título y descripción con color explícito en ambos temas', () => {
    const sheet = stripComments(read('src/components/organization/quotas/MemberQuotasSheet.tsx'));
    expect(sheet).toMatch(/<SheetTitle className="[^"]*text-gray-900 dark:text-gray-100/);
    expect(sheet).toMatch(/<SheetDescription className="[^"]*text-gray-(600|700) dark:text-gray-(300|400)/);
  });
  it('los widgets y el resumen tienen estado de error explícito (no «Sin comisiones» cuando la BD falla)', () => {
    expect(stripComments(read('src/components/inicio/widgets/WidgetCard.tsx'))).toMatch(/error\b/);
    expect(stripComments(read('src/components/inicio/sections/SellerSection.tsx'))).toMatch(/error=\{/);
    expect(stripComments(read('src/components/finanzas/comisiones/ComisionesSummary.tsx'))).toMatch(/unavailable/);
  });
  it('ronda 3 — ConfirmDialog: «Cancelar»/«No, volver» tiene variante dark explícita (AlertDialogCancel del kit queda negro sobre gray-900 sin ella; está en el camino del pago, el clawback y el borrado de cuotas)', () => {
    const dlg = stripComments(read('src/components/ui/confirm-dialog.tsx'));
    const cancelTag = dlg.match(/<AlertDialogCancel\b[\s\S]*?>/)?.[0] ?? '';
    expect(cancelTag).toMatch(/dark:border-gray-700/);
    expect(cancelTag).toMatch(/dark:bg-gray-800/);
    expect(cancelTag).toMatch(/dark:text-gray-200/);
  });
});
