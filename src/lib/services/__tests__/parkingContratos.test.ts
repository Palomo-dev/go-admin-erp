// ============================================================================
// Parqueadero — contratos con el esquema real (2026-10-06)
// ============================================================================
// El dueño probó el módulo con una organización nueva y los errores salieron en
// cadena: 23502 (organization_id), 22P02 (enum sin 'motorcycle', sin
// 'maintenance'), 42703 (columnas que no existen), 23514 (CHECK de estado).
// Cada prueba de aquí fija uno de esos contratos para que no vuelva.
//
// Los valores de los enums y CHECK salen de `parkingValores.ts`, copiados del
// esquema por MCP. Si la base cambia, se cambia esa lista y estas pruebas dicen
// qué pantalla quedó desalineada.
// ============================================================================

import fs from 'fs';
import path from 'path';
import { DobleSupabase } from '@/__tests__/timezone/dobleSupabase';
import {
  ESTADOS_ESPACIO_BD,
  ESTADOS_FACTURA_VENTA_BD,
  TIPOS_ESPACIO_BD,
  TIPOS_VEHICULO_ABONADO_BD,
  UNIDADES_TARIFA_BD,
  etiquetaEstadoEspacio,
  etiquetaTipoEspacio,
} from '@/lib/services/parkingValores';

let doble = new DobleSupabase();

jest.mock('@/lib/supabase/config', () => ({
  get supabase() {
    return doble;
  },
}));

jest.mock('@/lib/services/timezoneResolver', () => ({
  resolveTimezone: async () => 'America/Bogota',
}));

jest.mock('@/lib/services/monedaOrganizacion', () => ({
  resolveOrgCurrency: async () => ({ code: 'COP' }),
}));

import parkingService from '@/lib/services/parkingService';
import parkingPaymentService from '@/lib/services/parkingPaymentService';
import parkingFinanceService from '@/lib/services/parkingFinanceService';

const SRC = path.resolve(__dirname, '../../..');
const leer = (rel: string): string => fs.readFileSync(path.join(SRC, rel), 'utf8');

/** Los `value: '…'` de la constante `nombre` (hasta su `];`). */
function valoresDe(rel: string, nombre: string): string[] {
  const fuente = leer(rel);
  const inicio = fuente.indexOf(nombre);
  if (inicio < 0) throw new Error(`${nombre} no está en ${rel}`);
  const fin = fuente.indexOf('];', inicio);
  const bloque = fuente.slice(inicio, fin);
  const vistos = Array.from(bloque.matchAll(/value:\s*'([^']+)'/g)).map((m) => m[1]);
  // Las literales de un arreglo sin `value:` (p. ej. validTypes = ['car', ...]).
  if (vistos.length === 0) {
    return Array.from(bloque.slice(bloque.indexOf('[')).matchAll(/'([^']+)'/g)).map((m) => m[1]);
  }
  return vistos.filter((v) => v !== '__all__');
}

function archivosDelModulo(): string[] {
  const raices = ['app/app/parking', 'components/parking', 'components/pms/parking'];
  const salida: string[] = [];
  const recorrer = (dir: string) => {
    for (const entrada of fs.readdirSync(path.join(SRC, dir), { withFileTypes: true })) {
      const rel = path.join(dir, entrada.name);
      if (entrada.isDirectory()) recorrer(rel);
      else if (/\.(ts|tsx)$/.test(entrada.name)) salida.push(rel);
    }
  };
  raices.forEach(recorrer);
  const servicios = fs
    .readdirSync(path.join(SRC, 'lib/services'))
    .filter((f) => /^parking\w*\.ts$/.test(f))
    .map((f) => path.join('lib/services', f));
  return [...salida, ...servicios];
}

beforeEach(() => {
  doble = new DobleSupabase();
});

// ===========================================================================
describe('las opciones de cada pantalla son valores que la base acepta', () => {
  const casos: Array<[string, string, string, readonly string[]]> = [
    ['tipo de espacio (crear/editar)', 'components/parking/espacios/EspacioDialog.tsx', 'spaceTypes', TIPOS_ESPACIO_BD],
    ['estado de espacio (crear/editar)', 'components/parking/espacios/EspacioDialog.tsx', 'spaceStates', ESTADOS_ESPACIO_BD],
    ['tipo de espacio (filtros)', 'components/parking/espacios/EspaciosFilters.tsx', 'spaceTypes', TIPOS_ESPACIO_BD],
    ['estado de espacio (filtros)', 'components/parking/espacios/EspaciosFilters.tsx', 'spaceStates', ESTADOS_ESPACIO_BD],
    ['estado de espacio (acciones masivas)', 'components/parking/espacios/BulkActionsBar.tsx', 'stateOptions', ESTADOS_ESPACIO_BD],
    ['tipo de espacio (importar)', 'components/parking/espacios/ImportDialog.tsx', 'validTypes', TIPOS_ESPACIO_BD],
    ['estado de espacio (importar)', 'components/parking/espacios/ImportDialog.tsx', 'validStates', ESTADOS_ESPACIO_BD],
    ['unidad de tarifa (crear/editar)', 'components/parking/tarifas/TarifaDialog.tsx', 'unitTypes', UNIDADES_TARIFA_BD],
    ['unidad de tarifa (importar)', 'components/parking/tarifas/ImportDialog.tsx', 'validUnits', UNIDADES_TARIFA_BD],
  ];

  it.each(casos)('%s', (_nombre, archivo, constante, permitidos) => {
    const valores = valoresDe(archivo, constante);
    expect(valores.length).toBeGreaterThan(0);
    for (const v of valores) expect(permitidos).toContain(v);
  });

  it('el mapa solo cambia el estado a valores del enum', () => {
    const fuente = leer('components/parking/mapa/SpaceDetailDialog.tsx');
    const estados = Array.from(fuente.matchAll(/handleChangeState\('([^']+)'\)/g)).map((m) => m[1]);
    expect(estados.length).toBeGreaterThan(0);
    for (const e of estados) expect(ESTADOS_ESPACIO_BD).toContain(e);
  });

  it('los vehículos de abonados solo usan los tipos del CHECK de parking_vehicles', () => {
    for (const archivo of [
      'components/pms/parking/abonados/PassFormDialog.tsx',
      'components/pms/parking/abonados/PassVehiclesDialog.tsx',
      'components/pms/parking/abonados/PassDialog.tsx',
    ]) {
      const valores = Array.from(leer(archivo).matchAll(/<SelectItem value="([^"]+)">/g))
        .map((m) => m[1])
        .filter((v) => ['car', 'motorcycle', 'truck', 'other', 'bicycle', 'motor'].includes(v));
      expect(valores.length).toBeGreaterThan(0);
      for (const v of valores) expect(TIPOS_VEHICULO_ABONADO_BD).toContain(v);
    }
  });

  it('todo valor del enum de espacios tiene etiqueta (también motor y disabled)', () => {
    for (const t of TIPOS_ESPACIO_BD) expect(etiquetaTipoEspacio(t)).not.toBe(t);
    for (const e of ESTADOS_ESPACIO_BD) expect(etiquetaEstadoEspacio(e)).not.toBe(e);
  });
});

// ===========================================================================
describe('columnas y valores que no existen no vuelven al módulo', () => {
  const archivos = archivosDelModulo();

  it('ningún pago de parqueadero se registra con source "parking"', () => {
    for (const rel of archivos) {
      expect({ rel, hit: /source:\s*'parking'/.test(leer(rel)) }).toEqual({ rel, hit: false });
    }
  });

  it('parking_passes no se filtra por vehicle_plate (la placa vive en parking_vehicles)', () => {
    for (const rel of archivos) {
      const fuente = leer(rel);
      const malo = /from\('parking_passes'\)[\s\S]{0,300}?\.eq\('vehicle_plate'/.test(fuente);
      expect({ rel, malo }).toEqual({ rel, malo: false });
    }
  });

  it('no queda la unidad de tarifa "fraction" (el enum no la tiene)', () => {
    for (const rel of archivos) {
      expect({ rel, hit: /'fraction'/.test(leer(rel)) }).toEqual({ rel, hit: false });
    }
  });

  it('no se deriva el día con toISOString().split', () => {
    for (const rel of archivos) {
      expect({ rel, hit: /toISOString\(\)\.split\('T'\)/.test(leer(rel)) }).toEqual({ rel, hit: false });
    }
  });
});

// ===========================================================================
describe('cierre de sesión y cobro', () => {
  it('registerExit manda el monto cobrado, la hora de salida y closed', async () => {
    doble = new DobleSupabase({ parking_sessions: [{ data: { id: 's1' } }] });
    await parkingService.registerExit('s1', 50000);
    const escrito = doble.ultimaEscritura('parking_sessions')?.payload as Record<string, unknown>;
    expect(escrito.status).toBe('closed');
    expect(escrito.amount).toBe(50000);
    expect(typeof escrito.exit_at).toBe('string');
  });

  it('registrarPago escribe el pago con source parking_session y su vínculo en parking_payments', async () => {
    doble = new DobleSupabase({ payments: [{ data: { id: 'p1' } }] });
    await parkingPaymentService.registrarPago({
      organization_id: 325,
      branch_id: 529,
      source: 'parking_session',
      source_id: 's1',
      method: 'cash',
      amount: 3000,
    });
    const pago = doble.ultimaEscritura('payments')?.payload as Record<string, unknown>;
    expect(pago).toMatchObject({ source: 'parking_session', source_id: 's1', currency: 'COP', status: 'completed' });
    const vinculo = doble.ultimaEscritura('parking_payments')?.payload as Record<string, unknown>;
    expect(vinculo).toMatchObject({ payment_id: 'p1', parking_session_id: 's1', parking_pass_id: null, branch_id: 529 });
  });

  it('el pago manual de una sesión la cierra con el monto (antes quedaba en 0 y sin salida)', async () => {
    doble = new DobleSupabase({ payments: [{ data: { id: 'p1' } }], parking_sessions: [{ data: { id: 's1' } }] });
    await parkingPaymentService.createPayment({
      organization_id: 325,
      branch_id: 529,
      source: 'parking_session',
      source_id: 's1',
      method: 'cash',
      amount: 4500,
    });
    const cierre = doble.ultimaEscritura('parking_sessions')?.payload as Record<string, unknown>;
    expect(cierre).toMatchObject({ status: 'closed', amount: 4500 });
    expect(cierre.exit_at).toBeTruthy();
  });

  it('los filtros de fecha de Pagos son instantes con offset, no días sueltos', async () => {
    await parkingPaymentService.getPayments(325, { startDate: '2026-10-06', endDate: '2026-10-06' });
    expect(doble.filtro('payments', 'gte', 'created_at')).toBe('2026-10-06T00:00:00.000-05:00');
    expect(doble.filtro('payments', 'lte', 'created_at')).toBe('2026-10-06T23:59:59.999-05:00');
  });

  it('el abonado se busca por la placa del vehículo del pase', async () => {
    await parkingService.getActivePassPlates(325, ['abc123']);
    expect(doble.deTabla('parking_passes')).toHaveLength(0);
    expect(doble.filtro('parking_pass_vehicles', 'in', 'vehicle.plate')).toEqual(['ABC123']);
    expect(doble.filtro('parking_pass_vehicles', 'eq', 'pass.status')).toBe('active');
  });
});

// ===========================================================================
describe('factura y crédito de parqueadero', () => {
  it('la línea de factura usa las columnas reales de invoice_items', async () => {
    doble = new DobleSupabase({ invoice_sales: [{ data: { id: 'f1' } }], invoice_sequences: [{ data: null }] });
    await parkingFinanceService.createInvoiceFromParking({
      organization_id: 325,
      branch_id: 529,
      amount: 3000,
      description: 'Servicio de parqueadero',
      payment_method_code: 'cash',
      source_type: 'parking_session',
      source_id: 's1',
    });
    const linea = doble.ultimaEscritura('invoice_items')?.payload as Record<string, unknown>;
    expect(linea).toMatchObject({
      invoice_id: 'f1',
      invoice_sales_id: 'f1',
      invoice_type: 'sale',
      qty: 1,
      total_line: 3000,
    });
    expect(linea).not.toHaveProperty('quantity');
    expect(linea).not.toHaveProperty('total');
  });

  it('la factura a crédito queda en un estado que el CHECK acepta', async () => {
    doble = new DobleSupabase({
      invoice_sales: [{ data: { id: 'f1' } }],
      invoice_sequences: [{ data: null }],
      accounts_receivable: [{ data: { id: 'cxc1' } }],
      parking_sessions: [{ data: { id: 's1' } }],
    });
    await parkingFinanceService.registerParkingExitOnCredit({
      organization_id: 325,
      branch_id: 529,
      source_type: 'parking_session',
      source_id: 's1',
      amount: 3000,
      customer_id: 'c1',
    });
    const estados = doble
      .deTabla('invoice_sales')
      .filter((l) => l.operacion === 'update')
      .map((l) => (l.payload as { status?: string }).status);
    expect(estados).toEqual(['issued']);
    for (const e of estados) expect(ESTADOS_FACTURA_VENTA_BD).toContain(e);
    expect(doble.ultimaEscritura('accounts_receivable')?.payload).toMatchObject({ branch_id: 529 });
    expect(doble.ultimaEscritura('parking_sessions')?.payload).toMatchObject({ status: 'closed', amount: 3000 });
  });
});
