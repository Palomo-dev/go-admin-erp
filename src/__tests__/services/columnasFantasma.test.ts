// ============================================================================
// Columnas fantasma — código escrito contra un esquema imaginado
// ============================================================================
// Regla dura 3 de CLAUDE.md: se verifica tabla y columna con el MCP ANTES de
// escribir la consulta. Esta red fija tres sitios donde eso no se hizo y el
// código quedó apuntando a columnas que no existen o a columnas de otro tipo.
// PostgREST no avisa en compilación: rechaza en tiempo de ejecución, y cuando
// el error se traga con un `console.warn` la funcionalidad queda muerta en
// silencio.
//
//   1. `vehicles` — el formulario, el importador y el servicio nombraban
//      `plate_number`, `capacity_seats`, `fuel_type`, `insurance_policy` y
//      `tech_review_expiry`. Ninguna existe. Las reales (verificadas por MCP en
//      `information_schema.columns`) son `plate`, `passenger_capacity` y
//      `techno_expiry`; de combustible y póliza no hay columna. Resultado:
//      `getVehicles` fallaba al ordenar y el alta/edición era imposible.
//   2. `open_finance_transactions.account_id` es **uuid** y apunta a
//      `open_finance_accounts.id`. Se le pasaba el entero de `bank_accounts.id`.
//      El puente es `open_finance_accounts.bank_account_id`.
//   3. `transport_events` SÍ tiene `organization_id`. `trackingService` no lo
//      filtraba: la RLS acota por pertenencia, así que no hay fuga entre
//      inquilinos, pero quien pertenece a dos organizaciones veía la suma.
//
// El caso 1 se comprueba además LEYENDO EL CÓDIGO FUENTE: lo que hay que
// impedir no es un valor concreto, es que vuelva a aparecer el nombre.
// ============================================================================

import { readFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';
import { DobleSupabase } from '../timezone/dobleSupabase';

// ---------------------------------------------------------------------------
// Dobles
// ---------------------------------------------------------------------------
jest.mock('@/lib/services/timezoneResolver', () => ({
  resolveTimezone: async (): Promise<string> => 'America/Bogota',
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

import { transportService } from '@/lib/services/transportService';
import { trackingService } from '@/lib/services/trackingService';
import { BalanceService } from '@/lib/services/integrations/openFinance/balanceService';

const ORG = 120;
const RAIZ = join(__dirname, '..', '..');

/**
 * Columnas reales de `public.vehicles`, tal como las devuelve
 * `information_schema.columns` por el MCP de Supabase (proyecto
 * jgmgphmzusbluqhuqihj). Si alguien añade una columna por migración, este
 * listado se amplía en el mismo commit.
 */
const COLUMNAS_VEHICLES = [
  'id',
  'organization_id',
  'carrier_id',
  'branch_id',
  'plate',
  'vehicle_type',
  'capacity_kg',
  'capacity_m3',
  'passenger_capacity',
  'brand',
  'model',
  'year',
  'color',
  'vin',
  'soat_expiry',
  'techno_expiry',
  'insurance_expiry',
  'operating_card_expiry',
  'current_driver_id',
  'status',
  'is_active',
  'metadata',
  'created_at',
  'updated_at',
] as const;

/** Nombres que NO existen en el esquema y no deben reaparecer. */
const NOMBRES_FANTASMA = [
  'plate_number',
  'capacity_seats',
  'capacity_passengers',
  'fuel_type',
  'insurance_policy',
  'tech_review_expiry',
];

function leer(ruta: string): string {
  return readFileSync(join(RAIZ, ruta), 'utf8');
}

function ficherosDe(dir: string): string[] {
  const base = join(RAIZ, dir);
  const salida: string[] = [];
  const recorrer = (actual: string) => {
    for (const entrada of readdirSync(actual)) {
      const completo = join(actual, entrada);
      if (statSync(completo).isDirectory()) recorrer(completo);
      else if (/\.tsx?$/.test(entrada)) salida.push(completo);
    }
  };
  recorrer(base);
  return salida;
}

beforeEach(() => {
  doble = new DobleSupabase();
});

// ===========================================================================
// 1. vehicles — el payload que sale hacia la tabla
// ===========================================================================
describe('vehicles — solo columnas que existen', () => {
  /** El objeto que produce hoy `VehicleDialog.onSubmit` (`{...data}`). */
  const formularioCompleto = {
    plate: 'ABC-123',
    vehicle_type: 'truck' as const,
    brand: 'Marca',
    model: 'Modelo',
    year: 2023,
    color: 'Blanco',
    capacity_kg: 1000,
    capacity_m3: 10,
    passenger_capacity: 40,
    vin: '1HGBH41JXMN109186',
    soat_expiry: '2026-12-31',
    techno_expiry: '2026-06-30',
    insurance_expiry: '2026-12-31',
    operating_card_expiry: '2026-11-30',
    carrier_id: null,
    branch_id: 7,
    status: 'available' as const,
    is_active: true,
  };

  it('el insert de createVehicle no lleva ninguna columna inventada', async () => {
    await transportService.createVehicle(formularioCompleto);

    const escritura = doble.ultimaEscritura('vehicles');
    expect(escritura).toBeDefined();
    const claves = Object.keys(escritura?.payload as Record<string, unknown>);
    expect(claves.length).toBeGreaterThan(0);
    for (const clave of claves) {
      expect(COLUMNAS_VEHICLES).toContain(clave);
    }
  });

  it('el update de updateVehicle no lleva ninguna columna inventada', async () => {
    await transportService.updateVehicle('veh-1', formularioCompleto);

    const escritura = doble.ultimaEscritura('vehicles');
    const claves = Object.keys(escritura?.payload as Record<string, unknown>);
    for (const clave of claves) {
      expect(COLUMNAS_VEHICLES).toContain(clave);
    }
  });

  it('los campos del formulario y del importador son columnas reales', () => {
    // `VehicleDialog.onSubmit` hace `{...data}`: cada clave del esquema zod
    // viaja tal cual a PostgREST. Se leen del propio fuente para que añadir un
    // campo nuevo inexistente rompa esta prueba.
    const dialogo = leer('components/transporte/vehiculos/VehicleDialog.tsx');
    const esquema = dialogo.slice(
      dialogo.indexOf('const vehicleSchema'),
      dialogo.indexOf('type VehicleFormData'),
    );
    const campos = Array.from(esquema.matchAll(/^\s{2}(\w+):\s*z\./gm)).map((m) => m[1]);
    expect(campos.length).toBeGreaterThan(10);
    for (const campo of campos) {
      expect(COLUMNAS_VEHICLES).toContain(campo);
    }

    // La plantilla CSV del importador es el contrato con el usuario: sus
    // cabeceras acaban siendo claves del insert.
    const importador = leer('components/transporte/vehiculos/ImportVehiclesDialog.tsx');
    const plantilla = importador.slice(
      importador.indexOf('const headers = ['),
      importador.indexOf('const exampleRow'),
    );
    const cabeceras = Array.from(plantilla.matchAll(/'(\w+)'/g)).map((m) => m[1]);
    expect(cabeceras).toContain('plate');
    for (const cabecera of cabeceras) {
      expect(COLUMNAS_VEHICLES).toContain(cabecera);
    }
  });

  it('el aviso de documentos por vencer nombra las cuatro columnas reales', async () => {
    await transportService.getVehiclesWithExpiringDocs(ORG, 30);

    const llamada = doble.deTabla('vehicles')[0];
    const filtro = llamada.filtros.find((f) => f.metodo === 'or');
    expect(filtro).toBeDefined();
    const expresion = String(filtro?.columna);

    // Antes nombraba `tech_review_expiry`: PostgREST rechazaba el `.or()`
    // entero y la función lanzaba siempre, así que no se vigilaba NINGÚN
    // documento de vehículo.
    expect(expresion).not.toContain('tech_review_expiry');
    expect(expresion).toContain('soat_expiry.lte.');
    expect(expresion).toContain('techno_expiry.lte.');
    expect(expresion).toContain('insurance_expiry.lte.');
    expect(expresion).toContain('operating_card_expiry.lte.');
  });

  it('ningún nombre fantasma sobrevive en el módulo de transporte', () => {
    const ficheros = [
      ...ficherosDe('components/transporte'),
      join(RAIZ, 'lib/services/transportService.ts'),
      join(RAIZ, 'lib/services/transportRoutesService.ts'),
    ];

    const reincidencias: string[] = [];
    for (const fichero of ficheros) {
      const texto = readFileSync(fichero, 'utf8');
      for (const nombre of NOMBRES_FANTASMA) {
        if (new RegExp(`\\b${nombre}\\b`).test(texto)) {
          reincidencias.push(`${fichero}: ${nombre}`);
        }
      }
    }

    expect(reincidencias).toEqual([]);
  });
});

// ===========================================================================
// 2. balanceService — el puente uuid ↔ entero
// ===========================================================================
describe('balanceService.getBalanceHistory — account_id es uuid', () => {
  const cuentaBancaria = {
    bank_accounts: [
      { data: [{ id: 9, balance: 1000, organization_id: ORG, branch_id: null }], error: null },
    ],
  };

  it('pasa por open_finance_accounts en vez de filtrar el uuid con el entero', async () => {
    doble = new DobleSupabase({
      ...cuentaBancaria,
      open_finance_accounts: [
        {
          data: [
            { id: '11111111-1111-1111-1111-111111111111' },
            { id: '22222222-2222-2222-2222-222222222222' },
          ],
          error: null,
        },
      ],
      open_finance_transactions: [{ data: [], error: null }],
    });

    await BalanceService.getBalanceHistory(9, 2);

    // Se resuelven las cuentas de open finance de esa cuenta bancaria...
    expect(doble.filtro('open_finance_accounts', 'eq', 'bank_account_id')).toBe(9);

    // ...y los movimientos se piden por los uuid resueltos, nunca por el entero.
    const movimientos = doble.deTabla('open_finance_transactions');
    expect(movimientos).toHaveLength(1);
    const porCuenta = movimientos[0].filtros.find((f) => f.columna === 'account_id');
    expect(porCuenta?.metodo).toBe('in');
    expect(porCuenta?.valor).toEqual([
      '11111111-1111-1111-1111-111111111111',
      '22222222-2222-2222-2222-222222222222',
    ]);
  });

  it('una cuenta bancaria sin vinculación no consulta movimientos y devuelve la curva plana', async () => {
    doble = new DobleSupabase({
      ...cuentaBancaria,
      open_finance_accounts: [{ data: [], error: null }],
    });

    const historial = await BalanceService.getBalanceHistory(9, 2);

    expect(doble.deTabla('open_finance_transactions')).toHaveLength(0);
    expect(historial).toHaveLength(3);
    expect(historial.every((h) => h.balance === 1000 && h.change === 0)).toBe(true);
  });
});

// ===========================================================================
// 3. trackingService — organización en cada consulta a transport_events
// ===========================================================================
describe('trackingService — transport_events se filtra por organización', () => {
  const conOrganizacion = (llamadas: ReturnType<DobleSupabase['deTabla']>) =>
    llamadas.every((l) =>
      l.filtros.some((f) => f.metodo === 'eq' && f.columna === 'organization_id' && f.valor === ORG),
    );

  it('getTrackingStats acota sus cuatro consultas', async () => {
    await trackingService.getTrackingStats(ORG);

    const llamadas = doble.deTabla('transport_events');
    expect(llamadas).toHaveLength(4);
    expect(conOrganizacion(llamadas)).toBe(true);
  });

  it('getTrackingEvents acota el listado', async () => {
    await trackingService.getTrackingEvents(ORG);

    expect(conOrganizacion(doble.deTabla('transport_events'))).toBe(true);
  });

  it('getEventsByReference acota la línea de tiempo de un viaje', async () => {
    await trackingService.getEventsByReference(ORG, 'trip', 'viaje-1');

    expect(conOrganizacion(doble.deTabla('transport_events'))).toBe(true);
  });

  it('registerEvent acota el antiduplicado y el cálculo de la secuencia', async () => {
    doble = new DobleSupabase({
      transport_events: [
        { data: [], error: null }, // antiduplicado: no hay evento externo igual
        { data: [{ sequence: 3 }], error: null }, // última secuencia
        { data: [{ id: 'ev-1' }], error: null }, // insert
      ],
    });

    await trackingService.registerEvent({
      organization_id: ORG,
      reference_type: 'trip',
      reference_id: 'viaje-1',
      event_type: 'departed',
      external_event_id: 'ext-1',
    });

    const lecturas = doble.deTabla('transport_events').filter((l) => l.operacion === 'select');
    expect(lecturas.length).toBeGreaterThanOrEqual(2);
    expect(conOrganizacion(lecturas)).toBe(true);
  });
});
