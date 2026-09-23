// ============================================================================
// Fase B, tandas 9 y 10 — open finance, tesorería y monedas
// ============================================================================
// Las dos tandas comparten módulo (finanzas) pero NO comparten regla, y esa es
// justamente la distinción que esta red protege:
//
//   Tanda 9 (tesorería / open finance) — las tablas que se filtran llevan
//   organización: `accounts_receivable.due_date`, `accounts_payable.due_date`,
//   `payments.payment_date`, `bank_transactions.trans_date` y
//   `open_finance_transactions.transaction_date` son todas **timestamptz**
//   (verificado en `information_schema.columns`). Dos errores encadenados: el
//   día salía en UTC, y esa cadena de día se comparaba contra un timestamptz,
//   que Postgres lee como medianoche UTC. En Bogotá el corte de «hoy» caía a
//   las 19:00 del día anterior.
//
//   Tanda 10 (monedas) — `currency_rates` NO tiene `organization_id` ni
//   `branch_id`: es un catálogo global. ADR-004 decide que su día es el del
//   sistema y que **no** se le fuerza la zona de ninguna organización. Lo que
//   sí lleva la zona de la organización es LEER ese catálogo para un informe
//   contable, y escribir `exchange_rates`, que sí es por organización.
//
// Las cuatro zonas del encargo aparecen en los casos: UTC, America/Bogota,
// Europe/Madrid (el rango cruza el cambio de hora y el offset cambia DENTRO
// del rango) y Asia/Kathmandu (+05:45, offset no entero).
//
// El reloj es falso en todos los casos. Sin eso la prueba solo fallaría unas
// horas al día, que es exactamente por qué el bug sobrevivió tanto.
// ============================================================================

import { DobleSupabase } from './dobleSupabase';

// ---------------------------------------------------------------------------
// Dobles
// ---------------------------------------------------------------------------

/**
 * `resolveTimezone` sustituido para (a) fijar la zona y (b) dejar constancia de
 * CON QUÉ IDENTIDAD se le llamó. ADR-003 exige organización y, cuando el dato
 * tiene sucursal, el `branch_id` de la fila. Y ADR-004 exige lo contrario en un
 * sitio concreto: que al catálogo global NO se le pregunte por ninguna.
 */
const zonas = {
  porOrganizacion: new Map<number, string>(),
  porSucursal: new Map<number, string>(),
  llamadas: [] as Array<{ organizationId: number; branchId: number | null | undefined }>,
};

jest.mock('@/lib/services/timezoneResolver', () => ({
  resolveTimezone: async (organizationId: number, branchId?: number | null): Promise<string> => {
    zonas.llamadas.push({ organizationId, branchId });
    if (branchId != null && zonas.porSucursal.has(branchId)) {
      return zonas.porSucursal.get(branchId) as string;
    }
    return zonas.porOrganizacion.get(organizationId) ?? 'America/Bogota';
  },
}));

let doble = new DobleSupabase();

jest.mock('@/lib/supabase/config', () => ({
  get supabase() {
    return doble;
  },
  createSupabaseClient: () => doble,
}));

jest.mock('@/lib/supabase/admin', () => ({
  getSupabaseAdmin: () => doble,
}));

/** Organización «activa» para los servicios que la leen del contexto. */
let organizacionActiva: { id: number } | null = { id: 120 };

jest.mock('@/lib/hooks/useOrganization', () => ({
  obtenerOrganizacionActiva: () => organizacionActiva,
  getOrganizationId: () => organizacionActiva?.id ?? 0,
}));

/** Movimientos pedidos al proveedor: aquí se observan las fechas por defecto. */
const proveedor = {
  movimientosPedidos: [] as Array<{ dateFrom: string; dateTo: string }>,
};

jest.mock('@/lib/services/integrations/openFinance/openFinanceService', () => ({
  openFinanceService: {
    getMovements: async (
      _linkId: string,
      _externalAccountId: string,
      dateFrom: string,
      dateTo: string,
    ) => {
      proveedor.movimientosPedidos.push({ dateFrom, dateTo });
      return [];
    },
    saveTransactions: async () => ({ imported: 0, duplicates: 0 }),
  },
}));

import { TreasuryService } from '@/lib/services/integrations/openFinance/treasuryService';
import { BalanceService } from '@/lib/services/integrations/openFinance/balanceService';
import { TransactionSyncService } from '@/lib/services/integrations/openFinance/transactionSyncService';
import { guardarTasasDeCambio, ZONA_DEL_CATALOGO_GLOBAL } from '@/lib/services/openexchangerates';
import { currencyService } from '@/lib/services/currencyService';
import { ReportesContablesService } from '@/components/finanzas/contabilidad/ReportesContablesService';
import { AnomalyDetectionService } from '@/lib/services/integrations/openFinance/anomalyDetectionService';
import { addPlainDays } from '@/lib/utils/dateCore';

const ORG = 120;
const SUCURSAL_MADRID = 77;

beforeEach(() => {
  zonas.porOrganizacion.clear();
  zonas.porSucursal.clear();
  zonas.llamadas.length = 0;
  proveedor.movimientosPedidos.length = 0;
  organizacionActiva = { id: ORG };
  doble = new DobleSupabase();
  jest.useFakeTimers();
  jest.spyOn(console, 'log').mockImplementation(() => undefined);
  jest.spyOn(console, 'warn').mockImplementation(() => undefined);
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
});

afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
});

/** Fija el instante del reloj del sistema. */
function enElInstante(iso: string): void {
  jest.setSystemTime(new Date(iso));
}

/** Guion mínimo para que `getConsolidatedPosition` no reviente. */
function sinCuentasBancarias(): Record<string, Array<{ data: unknown; error: null }>> {
  return {
    bank_accounts: [{ data: [], error: null }],
    open_finance_accounts: [{ data: [], error: null }],
  };
}

// ===========================================================================
describe('treasuryService — la proyección de flujo de caja', () => {
  // El 28 de marzo de 2026 a las 23:30 UTC ya es el 29 de marzo en Madrid, y el
  // 29 de marzo es justo el día en que el reloj español salta de +01:00 a
  // +02:00. Un horizonte de tres días sale con un offset en cada extremo.
  const INSTANTE_MADRID = '2026-03-28T23:30:00Z';

  it('arranca en el día de la organización, no en el día UTC', async () => {
    zonas.porOrganizacion.set(ORG, 'Europe/Madrid');
    enElInstante(INSTANTE_MADRID);
    doble = new DobleSupabase(sinCuentasBancarias());

    const proyeccion = await TreasuryService.getCashFlowProjection(ORG, 3);

    // Día UTC = 2026-03-28. Día de Madrid = 2026-03-29. La proyección empieza
    // el 29: un día menos de horizonte y una fila menos de la que tocaba.
    expect(proyeccion.entries[0].date).toBe('2026-03-29');
    expect(proyeccion.entries.map((e) => e.date)).toEqual([
      '2026-03-29',
      '2026-03-30',
      '2026-03-31',
      '2026-04-01',
    ]);
  });

  it('filtra la columna timestamptz con instantes, y con el offset real de cada extremo', async () => {
    zonas.porOrganizacion.set(ORG, 'Europe/Madrid');
    enElInstante(INSTANTE_MADRID);
    doble = new DobleSupabase(sinCuentasBancarias());

    await TreasuryService.getCashFlowProjection(ORG, 3);

    // El día de salida está en +01:00 (horario de invierno) y el de llegada en
    // +02:00: el cambio de hora ocurre DENTRO del rango. Un rango calculado con
    // un offset único se come o regala una hora en un extremo.
    expect(doble.filtro('accounts_receivable', 'gte', 'due_date')).toBe(
      '2026-03-29T00:00:00.000+01:00',
    );
    expect(doble.filtro('accounts_receivable', 'lte', 'due_date')).toBe(
      '2026-04-01T23:59:59.999+02:00',
    );
    expect(doble.filtro('accounts_payable', 'gte', 'due_date')).toBe(
      '2026-03-29T00:00:00.000+01:00',
    );
  });

  it('agrupa cada vencimiento en el día de la organización, no en su día UTC', async () => {
    zonas.porOrganizacion.set(ORG, 'Europe/Madrid');
    enElInstante(INSTANTE_MADRID);
    doble = new DobleSupabase({
      ...sinCuentasBancarias(),
      // PostgREST devuelve el timestamptz en UTC. 23:30 UTC del 29 ya son las
      // 01:30 del 30 en Madrid: con `.split('T')[0]` el cobro caía en el día
      // anterior y el saldo proyectado de ese día salía mal.
      accounts_receivable: [
        {
          data: [
            {
              id: 'ar-1',
              customer_id: null,
              amount: 500,
              balance: 500,
              due_date: '2026-03-29T23:30:00+00:00',
              status: 'pending',
            },
          ],
          error: null,
        },
      ],
      accounts_payable: [{ data: [], error: null }],
    });

    const proyeccion = await TreasuryService.getCashFlowProjection(ORG, 3);

    const dia29 = proyeccion.entries.find((e) => e.date === '2026-03-29');
    const dia30 = proyeccion.entries.find((e) => e.date === '2026-03-30');
    expect(dia29?.inflow).toBe(0);
    expect(dia30?.inflow).toBe(500);
  });

  it('en Asia/Kathmandu (+05:45) el día del negocio va por delante del UTC', async () => {
    zonas.porOrganizacion.set(ORG, 'Asia/Kathmandu');
    // 18:30 UTC del 15 son las 00:15 del 16 en Katmandú.
    enElInstante('2026-06-15T18:30:00Z');
    doble = new DobleSupabase(sinCuentasBancarias());

    const proyeccion = await TreasuryService.getCashFlowProjection(ORG, 1);

    expect(proyeccion.entries[0].date).toBe('2026-06-16');
    expect(doble.filtro('accounts_receivable', 'gte', 'due_date')).toBe(
      '2026-06-16T00:00:00.000+05:45',
    );
  });
});

// ===========================================================================
describe('treasuryService — las alertas de tesorería', () => {
  it('«vencida» se mide contra el principio de hoy en la zona de la organización', async () => {
    zonas.porOrganizacion.set(ORG, 'America/Bogota');
    // 01:00 UTC del 16 son las 20:00 del 15 en Bogotá: para el negocio sigue
    // siendo el 15 y nada que venza el 15 está vencido todavía.
    enElInstante('2026-06-16T01:00:00Z');
    doble = new DobleSupabase(sinCuentasBancarias());

    await TreasuryService.getTreasuryAlerts(ORG);

    expect(doble.filtro('accounts_payable', 'lt', 'due_date')).toBe(
      '2026-06-15T00:00:00.000-05:00',
    );
  });

  it('el año de la concentración de pagos es el del negocio, no el del UTC', async () => {
    zonas.porOrganizacion.set(ORG, 'America/Bogota');
    // 02:00 UTC del 1 de enero de 2026 son las 21:00 del 31 de diciembre de
    // 2025 en Bogotá. El «año actual hasta hoy» tiene que ser el 2025 entero.
    enElInstante('2026-01-01T02:00:00Z');
    doble = new DobleSupabase(sinCuentasBancarias());

    await TreasuryService.getTreasuryAlerts(ORG);

    expect(doble.filtro('payments', 'gte', 'payment_date')).toBe(
      '2025-01-01T00:00:00.000-05:00',
    );
    expect(doble.filtro('payments', 'lte', 'payment_date')).toBe(
      '2025-12-31T23:59:59.999-05:00',
    );
  });
});

// ===========================================================================
describe('balanceService — el historial de saldos', () => {
  it('resuelve la zona con la identidad de la cuenta bancaria (organización y sucursal)', async () => {
    zonas.porOrganizacion.set(ORG, 'America/Bogota');
    zonas.porSucursal.set(SUCURSAL_MADRID, 'Europe/Madrid');
    enElInstante('2026-03-28T23:30:00Z');
    doble = new DobleSupabase({
      bank_accounts: [
        {
          data: [
            { id: 9, balance: 1000, organization_id: ORG, branch_id: SUCURSAL_MADRID },
          ],
          error: null,
        },
      ],
      open_finance_transactions: [{ data: [], error: null }],
    });

    const historial = await BalanceService.getBalanceHistory(9, 2);

    // La firma no cambió y no se coló ningún `timezone?: string`: la identidad
    // viene de la propia fila (ADR-003).
    expect(zonas.llamadas).toContainEqual({
      organizationId: ORG,
      branchId: SUCURSAL_MADRID,
    });
    // La cuenta es de Madrid: su historial termina el 29, no el 28 (UTC).
    expect(historial.map((h) => h.date)).toEqual([
      '2026-03-27',
      '2026-03-28',
      '2026-03-29',
    ]);
  });

  it('agrupa cada movimiento en el día de la sucursal dueña de la cuenta', async () => {
    zonas.porOrganizacion.set(ORG, 'America/Bogota');
    zonas.porSucursal.set(SUCURSAL_MADRID, 'Europe/Madrid');
    enElInstante('2026-03-28T23:30:00Z');
    doble = new DobleSupabase({
      bank_accounts: [
        {
          data: [
            { id: 9, balance: 1000, organization_id: ORG, branch_id: SUCURSAL_MADRID },
          ],
          error: null,
        },
      ],
      open_finance_transactions: [
        {
          data: [
            // 23:30 UTC del 28 = 00:30 del 29 en Madrid.
            { id: 't1', transaction_date: '2026-03-28T23:30:00+00:00', amount: 250 },
          ],
          error: null,
        },
      ],
    });

    const historial = await BalanceService.getBalanceHistory(9, 2);

    expect(historial.find((h) => h.date === '2026-03-28')?.change).toBe(0);
    expect(historial.find((h) => h.date === '2026-03-29')?.change).toBe(250);
  });
});

// ===========================================================================
describe('transactionSyncService — la ventana de sincronización', () => {
  it('«hasta hoy» es hoy en la zona de la organización dueña del link', async () => {
    zonas.porOrganizacion.set(ORG, 'Asia/Kathmandu');
    enElInstante('2026-06-15T18:30:00Z'); // 00:15 del 16 en Katmandú
    doble = new DobleSupabase({
      open_finance_links: [
        { data: [{ id: 'link-1', organization_id: ORG, status: 'active' }], error: null },
      ],
      open_finance_accounts: [
        {
          data: [{ id: 'acc-1', external_account_id: 'EXT-1', is_active: true }],
          error: null,
        },
      ],
      open_finance_transactions: [{ data: [], error: null }],
    });

    await TransactionSyncService.syncTransactions('link-1');

    // Con el día UTC la ventana terminaba el 15 y el día en curso del negocio
    // quedaba sin sincronizar hasta la vuelta siguiente.
    expect(proveedor.movimientosPedidos[0]).toEqual({
      dateFrom: '2026-05-17',
      dateTo: '2026-06-16',
    });
  });

  it('reanuda desde el día de `last_sync_at` leído en la zona, no en UTC', async () => {
    zonas.porOrganizacion.set(ORG, 'America/Bogota');
    enElInstante('2026-06-16T15:00:00Z');
    doble = new DobleSupabase({
      // syncAllLinks lista primero, y syncTransactions vuelve a pedir el link.
      open_finance_links: [
        {
          data: [
            {
              id: 'link-1',
              organization_id: ORG,
              status: 'active',
              // 01:00 UTC del 16 fueron las 20:00 del 15 en Bogotá. Con el día
              // UTC se reanudaba desde el 16 y las horas del 15 se perdían
              // para siempre, porque `last_sync_at` ya había avanzado.
              last_sync_at: '2026-06-16T01:00:00+00:00',
            },
          ],
          error: null,
        },
        {
          data: [
            {
              id: 'link-1',
              organization_id: ORG,
              status: 'active',
              last_sync_at: '2026-06-16T01:00:00+00:00',
            },
          ],
          error: null,
        },
      ],
      open_finance_accounts: [
        {
          data: [{ id: 'acc-1', external_account_id: 'EXT-1', is_active: true }],
          error: null,
        },
      ],
      open_finance_transactions: [{ data: [], error: null }],
    });

    await TransactionSyncService.syncAllLinks(ORG);

    expect(proveedor.movimientosPedidos[0].dateFrom).toBe('2026-06-15');
  });
});

// ===========================================================================
describe('openexchangerates — ADR-004: el catálogo global se queda con el día del sistema', () => {
  // 02:00 UTC del 16 de junio. Los tres días posibles son distintos:
  //   UTC            -> 2026-06-16
  //   sistema/Bogotá -> 2026-06-15  (21:00 del día anterior)
  //   Katmandú       -> 2026-06-16  (07:45)
  const INSTANTE = '2026-06-16T02:00:00Z';

  it('la zona del catálogo es la del sistema, la misma que `fn_today_system()`', () => {
    // Si alguien cambia `fn_today_system()` en la base y no aquí, el catálogo
    // acaba con dos criterios de día dentro de la misma tabla.
    expect(ZONA_DEL_CATALOGO_GLOBAL).toBe('America/Bogota');
  });

  it('el `rate_date` que se escribe es el día del sistema, no el UTC', async () => {
    enElInstante(INSTANTE);
    doble = new DobleSupabase({ currency_rates: [{ data: [], error: null }] });

    await guardarTasasDeCambio({ EUR: 0.92 }, undefined, 'openexchangerates', 1, 'USD');

    const escritura = doble.ultimaEscritura('currency_rates');
    const filas = escritura?.payload as Array<{ rate_date: string }>;
    expect(filas[0].rate_date).toBe('2026-06-15');
  });

  it('no consulta la zona de ninguna organización: el dato no es de nadie', async () => {
    // El punto de ADR-004. `currency_rates` no tiene `organization_id`: si dos
    // organizaciones en husos distintos escribieran su propio día, la clave
    // (code, rate_date) tendría dos verdades para el mismo instante.
    zonas.porOrganizacion.set(ORG, 'Asia/Kathmandu');
    enElInstante(INSTANTE);
    doble = new DobleSupabase({ currency_rates: [{ data: [], error: null }] });

    await guardarTasasDeCambio({ EUR: 0.92 }, undefined, 'openexchangerates', 1, 'USD');

    expect(zonas.llamadas).toHaveLength(0);
  });

  it('una fecha explícita se convierte con la zona del catálogo, no con la del navegador', async () => {
    enElInstante(INSTANTE);
    doble = new DobleSupabase({ currency_rates: [{ data: [], error: null }] });

    // Lo que hacía antes era `date.getTime() - date.getTimezoneOffset()*60000`:
    // el resultado dependía del TZ del proceso. Esta prueba corre con TZ=UTC y
    // con TZ=America/Bogota y tiene que dar lo mismo en las dos.
    await guardarTasasDeCambio(
      { EUR: 0.92 },
      new Date(INSTANTE),
      'openexchangerates',
      1,
      'USD',
    );

    const filas = doble.ultimaEscritura('currency_rates')?.payload as Array<{
      rate_date: string;
    }>;
    expect(filas[0].rate_date).toBe('2026-06-15');
  });
});

// ===========================================================================
describe('currencyService — `exchange_rates` SÍ es por organización', () => {
  const INSTANTE = '2026-06-16T02:00:00Z';

  it('`effective_date` sale del día de la organización', async () => {
    zonas.porOrganizacion.set(ORG, 'America/Bogota');
    enElInstante(INSTANTE);
    doble = new DobleSupabase({ exchange_rates: [{ data: [], error: null }] });

    await currencyService.updateExchangeRate(ORG, 'USD', 'COP', 4000);

    const fila = doble.ultimaEscritura('exchange_rates')?.payload as {
      effective_date: string;
    };
    expect(fila.effective_date).toBe('2026-06-15');
  });

  it('la misma llamada desde una organización en Katmandú escribe otro día', async () => {
    zonas.porOrganizacion.set(ORG, 'Asia/Kathmandu');
    enElInstante(INSTANTE);
    doble = new DobleSupabase({ exchange_rates: [{ data: [], error: null }] });

    await currencyService.updateExchangeRate(ORG, 'USD', 'NPR', 133);

    const fila = doble.ultimaEscritura('exchange_rates')?.payload as {
      effective_date: string;
    };
    // Aquí sí, y esta es la diferencia con `currency_rates`: la fila lleva
    // `organization_id`, así que su día es el de esa organización.
    expect(fila.effective_date).toBe('2026-06-16');
    expect(zonas.llamadas).toContainEqual({ organizationId: ORG, branchId: undefined });
  });
});

// ===========================================================================
describe('ReportesContablesService — leer el catálogo con el día contable', () => {
  it('la tasa vigente se busca contra el día de la organización', async () => {
    zonas.porOrganizacion.set(ORG, 'America/Bogota');
    enElInstante('2026-06-16T02:00:00Z');
    doble = new DobleSupabase({
      currency_rates: [
        { data: [{ code: 'USD', rate: '4000', rate_date: '2026-06-15', source: 'api' }], error: null },
      ],
    });

    await ReportesContablesService.getExchangeRate('USD');

    // ADR-004 deja la ESCRITURA del catálogo en el día del sistema, pero
    // prohíbe expresamente LEERLO con el día UTC: el informe contable de una
    // organización se cierra con su día, no con el de Greenwich.
    expect(doble.filtro('currency_rates', 'lte', 'rate_date')).toBe('2026-06-15');
  });

  it('en Katmandú el corte del informe es un día más adelante', async () => {
    zonas.porOrganizacion.set(ORG, 'Asia/Kathmandu');
    enElInstante('2026-06-15T18:30:00Z');
    doble = new DobleSupabase({
      currency_rates: [
        { data: [{ code: 'USD', rate: '133', rate_date: '2026-06-15', source: 'api' }], error: null },
      ],
    });

    await ReportesContablesService.getExchangeRate('USD');

    expect(doble.filtro('currency_rates', 'lte', 'rate_date')).toBe('2026-06-16');
  });

  it('la moneda base también responde con el día contable, no con el UTC', async () => {
    zonas.porOrganizacion.set(ORG, 'America/Bogota');
    enElInstante('2026-06-16T02:00:00Z');

    const base = await ReportesContablesService.getExchangeRate('COP');

    expect(base?.rate_date).toBe('2026-06-15');
  });
});

// ===========================================================================
describe('anomalyDetectionService — la clave de duplicados lleva el día dentro', () => {
  it('dos cargos iguales del mismo día del negocio caen en el mismo grupo', async () => {
    zonas.porOrganizacion.set(ORG, 'America/Bogota');
    enElInstante('2026-06-16T15:00:00Z');
    doble = new DobleSupabase({
      bank_transactions: [
        {
          data: [
            // 01:00 UTC del 16 = 20:00 del 15 en Bogotá. Va primero a
            // propósito: es el que encabeza el grupo y, por tanto, el que
            // fecha la alerta. Su día UTC (16) NO es su día de negocio (15).
            {
              id: 1,
              organization_id: ORG,
              bank_account_id: 3,
              trans_date: '2026-06-16T01:00:00+00:00',
              description: 'Pago proveedor',
              amount: 100,
            },
            // 23:00 UTC del 15 = 18:00 del 15 en Bogotá: MISMO día del negocio,
            // pero día UTC distinto. Este par separa las dos lecturas.
            {
              id: 2,
              organization_id: ORG,
              bank_account_id: 3,
              trans_date: '2026-06-15T23:00:00+00:00',
              description: 'Pago proveedor',
              amount: 100,
            },
          ],
          error: null,
        },
      ],
      open_finance_transactions: [{ data: [], error: null }],
    });

    const alertas = await AnomalyDetectionService.detectDuplicates(ORG);

    // Con el día UTC los dos cargos caen en grupos distintos (15 y 16) y el
    // duplicado no se detecta: se paga dos veces la misma factura. Con el día
    // de Bogotá son el mismo grupo, y la alerta va fechada el 15.
    expect(alertas).toHaveLength(1);
    expect(alertas[0].count).toBe(2);
    expect(alertas[0].date).toBe('2026-06-15');
  });
});

// ===========================================================================
describe('addPlainDays — aritmética de días calendario, no de horas', () => {
  it('suma un día también el día de 23 horas (Europe/Madrid, marzo)', () => {
    // El 29 de marzo de 2026 dura 23 h en Madrid. Sumar 24 h a un instante se
    // salta el día; sumar un día calendario no.
    expect(addPlainDays('2026-03-28', 1)).toBe('2026-03-29');
    expect(addPlainDays('2026-03-29', 1)).toBe('2026-03-30');
  });

  it('resta 30 días cruzando el cambio de mes y de año', () => {
    expect(addPlainDays('2026-01-15', -30)).toBe('2025-12-16');
    expect(addPlainDays('2026-06-16', -30)).toBe('2026-05-17');
  });

  it('el día 0 es el mismo día', () => {
    expect(addPlainDays('2026-02-29', 0)).toBe('2026-03-01'); // 2026 no es bisiesto
    expect(addPlainDays('2026-03-01', 0)).toBe('2026-03-01');
  });
});
