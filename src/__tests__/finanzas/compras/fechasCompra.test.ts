// ============================================================================
// L15 · Fechas de compras y CxP.
//
// `invoice_purchase.issue_date`/`due_date` y `accounts_payable.due_date` son
// `timestamptz`: se pintan con `formatDateInTz` en la zona de la organización.
// `ap_installments.due_date` es `date`: `formatPlainDate`, sin convertir.
// Una factura emitida a las 20:00 de Bogotá (01:00 UTC del día siguiente) se
// pinta con ESE día, sea cual sea el TZ del proceso (`npm run test:tz-all`).
// ============================================================================

import { formatDateInTz, formatPlainDate } from '@/lib/utils/dateDisplay';

const OPC = { day: '2-digit', month: '2-digit', year: 'numeric' } as const;

describe('L15 · fechas', () => {
  test('timestamptz: 20:00 de Bogotá se pinta con el día de Bogotá', () => {
    const emitida = '2026-09-25T01:00:00Z'; // 24-sep 20:00 en Bogotá
    expect(formatDateInTz(emitida, 'America/Bogota', { locale: 'es-CO', ...OPC })).toBe('24/09/2026');
    expect(formatDateInTz(emitida, 'Europe/Madrid', { locale: 'es-CO', ...OPC })).toBe('25/09/2026');
  });

  test('date: la cuota vence el día escrito, sin correr', () => {
    expect(formatPlainDate('2026-02-28', { ...OPC })).toMatch(/28.*02.*2026/);
  });
});
