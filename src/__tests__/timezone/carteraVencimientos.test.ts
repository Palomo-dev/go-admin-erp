// ============================================================================
// Fase B, tanda 2 — cartera: cuentas por cobrar, por pagar y facturas
// ============================================================================
// Aquí todas las columnas de fecha que el código trataba como «día» son
// **timestamptz** (verificado por MCP en `information_schema.columns`):
//
//   payments.payment_date · accounts_receivable.due_date · .last_reminder_date
//   accounts_payable.due_date · invoice_sales.issue_date / .due_date
//   invoice_purchase.issue_date / .due_date · ar_installments.paid_at
//
// y solo `ar_installments.due_date` / `ap_installments.due_date` son `date`.
//
// Los dos errores que se cancelaban entre sí, y que había que arreglar juntos:
//
//   ESCRITURA  `new Date(dia + 'T' + new Date().toTimeString()...)` compone el
//              instante con la hora y la zona del NAVEGADOR. Desde Madrid, un
//              abono de una tienda de Bogotá se guardaba siete horas antes.
//   LECTURA    `new Date(valorDeBD).toISOString().split('T')[0]` se queda con
//              el día UTC del instante, así que el `min` del formulario y las
//              comparaciones con la fecha de emisión iban un día corridas.
//
// Este archivo fija el comportamiento correcto de los dos lados.
// ============================================================================

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { instantForDayInTz, plainDayOfInstant } from '@/lib/services/businessInstant';
import { diasEntreDias, sumarDiasAlDia, sumarMesesAlDia } from '@/lib/services/fiscalCalendar';
import { formatDateInTz, formatTimeInTz } from '@/lib/utils/dateDisplay';
import { todayInTz } from '@/lib/utils/dateCore';

const RAIZ = join(__dirname, '..', '..', '..');
const leer = (ruta: string): string => readFileSync(join(RAIZ, ruta), 'utf8');

const MADRID = 'Europe/Madrid';
const BOGOTA = 'America/Bogota';
const MEXICO = 'America/Mexico_City';

function conReloj(iso: string, fn: () => void): void {
  jest.useFakeTimers();
  jest.setSystemTime(new Date(iso));
  try {
    fn();
  } finally {
    jest.useRealTimers();
  }
}

/** Día calendario que devuelve `formatDateInTz`, como `YYYY-MM-DD`. */
function diaLeido(instante: string, timezone: string): string {
  const [d, m, a] = formatDateInTz(instante, timezone).split('/');
  return `${a}-${m}-${d}`;
}

// ---------------------------------------------------------------------------
// 1. El caso que pide el encargo: Madrid a las 23:30
// ---------------------------------------------------------------------------

describe('un vencimiento creado «hoy» guarda el día de la organización', () => {
  it('Madrid a las 23:30 guarda el día de Madrid y su hora de pared', () => {
    // 2026-12-31T22:30Z = 31/12/2026 23:30 en Madrid (CET, +01:00).
    conReloj('2026-12-31T22:30:00.000Z', () => {
      const dia = todayInTz(MADRID);
      expect(dia).toBe('2026-12-31');

      const guardado = instantForDayInTz(dia, MADRID);
      // Se relee como el 31 en Madrid, y con la hora de pared de Madrid.
      expect(diaLeido(guardado, MADRID)).toBe('2026-12-31');
      expect(formatTimeInTz(guardado, MADRID)).toBe('23:30');
      // La hora que se guarda NO es la del reloj UTC (22:30).
      expect(formatTimeInTz(guardado, 'UTC')).toBe('22:30');
    });
  });

  it('Madrid a las 00:30: el día ya es el siguiente, UTC todavía no', () => {
    // 2026-12-31T23:30Z = 01/01/2027 00:30 en Madrid. Aquí el día UTC y el de
    // la organización caen en AÑOS distintos: un vencimiento del ejercicio que
    // viene se guardaba en el que se acaba de cerrar.
    conReloj('2026-12-31T23:30:00.000Z', () => {
      expect(todayInTz(MADRID)).toBe('2027-01-01');
      expect(new Date().toISOString().split('T')[0]).toBe('2026-12-31');

      const guardado = instantForDayInTz(todayInTz(MADRID), MADRID);
      expect(diaLeido(guardado, MADRID)).toBe('2027-01-01');
    });
  });

  it('Bogotá a las 23:30: UTC ya es el día siguiente', () => {
    // 2026-09-24T04:30Z = 23/09/2026 23:30 en Bogotá.
    conReloj('2026-09-24T04:30:00.000Z', () => {
      expect(todayInTz(BOGOTA)).toBe('2026-09-23');
      expect(new Date().toISOString().split('T')[0]).toBe('2026-09-24');

      const guardado = instantForDayInTz(todayInTz(BOGOTA), BOGOTA);
      expect(diaLeido(guardado, BOGOTA)).toBe('2026-09-23');
    });
  });

  it('mandar el día suelto a un timestamptz corre la fecha un día', () => {
    // Lo que hacía el código: '2026-09-23' llega a Postgres como medianoche
    // UTC y en Bogotá se relee como el 22.
    expect(diaLeido('2026-09-23T00:00:00.000Z', BOGOTA)).toBe('2026-09-22');
    expect(diaLeido(instantForDayInTz('2026-09-23', BOGOTA), BOGOTA)).toBe('2026-09-23');
  });
});

describe('instantForDayInTz aguanta el cambio de horario', () => {
  it.each([MADRID, BOGOTA, MEXICO, 'Pacific/Kiritimati', 'Asia/Kathmandu'])(
    '%s devuelve siempre el día pedido',
    (zona) => {
      for (const dia of ['2026-01-01', '2026-03-29', '2026-10-25', '2026-12-31']) {
        conReloj('2026-06-15T09:17:41.000Z', () => {
          expect(diaLeido(instantForDayInTz(dia, zona), zona)).toBe(dia);
        });
      }
    },
  );

  it('una hora de pared que no existe cae dentro del mismo día', () => {
    // Madrid, 29/03/2026: el reloj salta de 02:00 a 03:00. Un pago registrado
    // a las 02:30 de otro día, fechado ese día, no puede saltar al 28 ni al 30.
    conReloj('2026-03-29T01:30:00.000Z', () => {
      expect(diaLeido(instantForDayInTz('2026-03-29', MADRID), MADRID)).toBe('2026-03-29');
    });
  });
});

// ---------------------------------------------------------------------------
// 2. Lectura: el día de un timestamptz no es su día UTC
// ---------------------------------------------------------------------------

describe('plainDayOfInstant (min/max y comparaciones del formulario)', () => {
  it('la emisión de una factura se lee en la zona del negocio', () => {
    // `invoice_sales.issue_date` guardado a las 21:00 del 23 en Bogotá.
    const emision = '2026-09-24T02:00:00.000Z';
    expect(plainDayOfInstant(emision, BOGOTA)).toBe('2026-09-23');
    // Lo que daba el código viejo, y por tanto el `min` del input:
    expect(new Date(emision).toISOString().split('T')[0]).toBe('2026-09-24');
  });

  it('la misma emisión da días distintos en zonas distintas', () => {
    const emision = '2026-09-23T22:30:00.000Z';
    expect(plainDayOfInstant(emision, MEXICO)).toBe('2026-09-23');
    expect(plainDayOfInstant(emision, MADRID)).toBe('2026-09-24');
  });

  it('un valor nulo o ilegible no rompe el formulario', () => {
    expect(plainDayOfInstant(null, BOGOTA)).toBe('');
    expect(plainDayOfInstant(undefined, BOGOTA)).toBe('');
    expect(plainDayOfInstant('no es una fecha', BOGOTA)).toBe('');
  });
});

// ---------------------------------------------------------------------------
// 3. Planes de cuotas: `ar_installments.due_date` es `date`
// ---------------------------------------------------------------------------

describe('vencimientos de cuotas', () => {
  it('sumar meses recorta al último día del mes, no desborda', () => {
    // `Date.setMonth` daba 03/03: dos cuotas en marzo y ninguna en febrero.
    expect(sumarMesesAlDia('2026-01-31', 1)).toBe('2026-02-28');
    expect(sumarMesesAlDia('2028-01-31', 1)).toBe('2028-02-29');
    expect(sumarMesesAlDia('2026-08-31', 1)).toBe('2026-09-30');
    expect(sumarMesesAlDia('2026-12-15', 1)).toBe('2027-01-15');
    expect(sumarMesesAlDia('2026-09-23', 0)).toBe('2026-09-23');
    expect(sumarMesesAlDia('2026-09-23', 12)).toBe('2027-09-23');
  });

  it('un plan de 12 cuotas desde el 31 de enero cae siempre en su mes', () => {
    const meses = Array.from({ length: 12 }, (_, i) => sumarMesesAlDia('2026-01-31', i));
    expect(meses.map((d) => d.slice(0, 7))).toEqual([
      '2026-01', '2026-02', '2026-03', '2026-04', '2026-05', '2026-06',
      '2026-07', '2026-08', '2026-09', '2026-10', '2026-11', '2026-12',
    ]);
  });

  it('sumar días es aritmética de calendario, no 24 h por día', () => {
    expect(sumarDiasAlDia('2026-09-23', 30)).toBe('2026-10-23');
    // Cruzando el cambio de horario de Madrid (25/10/2026, día de 25 h).
    expect(sumarDiasAlDia('2026-10-24', 2)).toBe('2026-10-26');
    expect(sumarDiasAlDia('2026-01-01', -1)).toBe('2025-12-31');
    expect(sumarDiasAlDia('2028-02-28', 1)).toBe('2028-02-29');
  });

  it('los días entre dos días no dependen de la duración del día', () => {
    expect(diasEntreDias('2026-09-23', '2026-09-23')).toBe(0);
    expect(diasEntreDias('2026-09-23', '2026-09-25')).toBe(2);
    expect(diasEntreDias('2026-10-24', '2026-10-26')).toBe(2);
    expect(diasEntreDias('2026-09-25', '2026-09-23')).toBe(-2);
  });
});

// ---------------------------------------------------------------------------
// 4. Guardas estáticas sobre los archivos de la tanda
// ---------------------------------------------------------------------------

const PROHIBIDO = /toISOString\(\)\.(split\('T'\)|slice\(0, *10\))/;
const HORA_DEL_NAVEGADOR = /new Date\([^)]*\+ 'T' \+ new Date\(\)\.toTimeString\(\)/;

const ARCHIVOS_TANDA_2 = [
  'src/components/finanzas/cuentas-por-cobrar/AplicarAbonoModal.tsx',
  'src/components/finanzas/cuentas-por-cobrar/id/AccountActionsCard.tsx',
  'src/components/finanzas/cuentas-por-cobrar/id/service.ts',
  'src/components/finanzas/facturas-compra/RegistrarPagoModal.tsx',
  'src/components/finanzas/facturas-compra/FacturasCompraService.ts',
  'src/components/finanzas/facturas-venta/id/RegistrarPagoDialog.tsx',
  'src/components/finanzas/facturas-venta/id/DetalleFactura.tsx',
  'src/components/finanzas/facturas-venta/ImportarCSVDialog.tsx',
  'src/components/finanzas/facturas-venta/FacturasProximasVencer.tsx',
];

describe('los archivos de la tanda 2 no vuelven al día UTC', () => {
  it.each(ARCHIVOS_TANDA_2)('%s', (ruta) => {
    expect(leer(ruta)).not.toMatch(PROHIBIDO);
  });

  it('ningún pago compone ya el instante con la hora del navegador', () => {
    for (const ruta of [
      ...ARCHIVOS_TANDA_2,
      'src/components/finanzas/cuentas-por-cobrar/service.ts',
    ]) {
      expect(leer(ruta)).not.toMatch(HORA_DEL_NAVEGADOR);
    }
  });

  it('los cuatro servicios que insertan un pago resuelven la zona', () => {
    for (const ruta of [
      'src/components/finanzas/cuentas-por-cobrar/service.ts',
      'src/components/finanzas/cuentas-por-cobrar/id/service.ts',
      'src/components/finanzas/facturas-compra/FacturasCompraService.ts',
    ]) {
      const fuente = leer(ruta);
      expect(fuente).toContain('resolveTimezone(');
      expect(fuente).toContain('instantForDayInTz(');
    }
    // El dialogo de venta compone el instante en el cliente, con la zona de la
    // sucursal de la factura que ya tiene el contexto.
    const dialogo = leer('src/components/finanzas/facturas-venta/id/RegistrarPagoDialog.tsx');
    expect(dialogo).toContain('instantForDayInTz(fechaPago, timezone)');
    expect(dialogo).toContain('useFormatDate(factura?.branch_id)');
  });

  it('los min/max y las comparaciones usan el día en la zona, no el UTC', () => {
    for (const ruta of [
      'src/components/finanzas/cuentas-por-cobrar/id/AccountActionsCard.tsx',
      'src/components/finanzas/facturas-compra/RegistrarPagoModal.tsx',
      'src/components/finanzas/facturas-venta/id/RegistrarPagoDialog.tsx',
      'src/components/finanzas/facturas-venta/id/DetalleFactura.tsx',
    ]) {
      const fuente = leer(ruta);
      expect(fuente).toContain('plainDayOfInstant(');
      expect(fuente).toContain('diaEmision');
    }
  });

  it('las cuotas se generan con aritmética de día calendario', () => {
    const servicio = leer('src/components/finanzas/cuentas-por-cobrar/id/service.ts');
    expect(servicio).toContain('sumarMesesAlDia(primerVencimiento, i - 1)');
    expect(servicio).not.toContain('dueDate.setMonth(');
  });

  it('el filtro de facturas próximas a vencer compara instantes', () => {
    const fuente = leer('src/components/finanzas/facturas-venta/FacturasProximasVencer.tsx');
    expect(fuente).toContain('getDateRange(hoy, fechaLimite, timezone)');
    expect(fuente).toContain(".gte('due_date', start)");
    expect(fuente).toContain(".lte('due_date', end)");
    // Y ya no formatea con la zona del navegador ni con el helper deprecado.
    expect(fuente).not.toContain('parseLocalDate');
  });

  it('el CSV de facturas convierte el día a instante antes de guardarlo', () => {
    const fuente = leer('src/components/finanzas/facturas-venta/ImportarCSVDialog.tsx');
    expect(fuente).toContain('diaDelCsvAInstante(invoice.issue_date, timezone)');
    expect(fuente).toContain('diaDelCsvAInstante(invoice.due_date, timezone)');
    expect(fuente).toContain('sumarDiasAlDia(getToday(), 30)');
  });
});
