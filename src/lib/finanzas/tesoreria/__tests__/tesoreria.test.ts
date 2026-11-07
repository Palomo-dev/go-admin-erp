/**
 * Tesorería, ronda 3 (frente T): lógica de Movimientos, Ingresos, Cuentas de
 * dinero, efecto en la cuenta, consignación y redirección de rutas viejas.
 * Incluye la caracterización de lo que hacían las listas viejas (búsqueda por
 * concepto o notas, columnas del CSV, KPIs de total / mes / hoy / registros).
 */
import {
  accionesFila,
  contarPorTipo,
  csvMovimientos,
  filtrarMovimientos,
  resumirMovimientos,
  signoFila,
  unirMovimientos,
  type MovimientoOrigen,
  type TransferenciaOrigen,
} from '../movimientosLista';
import {
  cajaVencida,
  filtrarCuentas,
  horasAbierta,
  mascaraCuenta,
  resumirCuentasDinero,
  validarCuentaBancaria,
  type BancoDinero,
  type CajaDinero,
} from '../cuentasDinero';
import { efectoEnCuenta } from '../efectoEnCuenta';
import { codigoErrorConsignacion, parametrosConsignacion, totalSaleDeCaja, validarConsignacion } from '../consignacion';
import {
  destinoAnomalias,
  destinoBancos,
  destinoConciliacion,
  destinoCuentaBancaria,
  destinoNuevaCuenta,
  destinoTesoreriaConsolidada,
  destinoTransferencia,
  RUTAS_TESORERIA,
} from '../rutas';

const ingreso = (id: number, fecha: string, extra: Partial<MovimientoOrigen> = {}): MovimientoOrigen => ({
  id,
  uuid: `u-in-${id}`,
  source: 'cash',
  concept: `Ingreso ${id}`,
  amount: 100,
  created_at: fecha,
  ...extra,
});
const egreso = (id: number, fecha: string, extra: Partial<MovimientoOrigen> = {}): MovimientoOrigen => ({
  id,
  uuid: `u-out-${id}`,
  source: 'bank',
  concept: `Egreso ${id}`,
  amount: 40,
  created_at: fecha,
  bank_account_name: 'Bancolombia',
  ...extra,
});
const traslado = (id: string, fecha: string, status = 'completed'): TransferenciaOrigen => ({
  id,
  amount: '250',
  transfer_date: fecha,
  reference: 'TR-1',
  status,
  from_account: { name: 'Ahorros' },
  to_account: { name: 'Corriente' },
});

describe('movimientosLista', () => {
  const filas = unirMovimientos(
    [ingreso(12, '2026-11-07T15:00:00Z'), ingreso(13, '2026-10-02T15:00:00Z', { notes: 'arriendo local' })],
    [egreso(12, '2026-11-07T16:00:00Z')],
    [traslado('9f0c1d2e-0000-4000-8000-000000000001', '2026-11-06T15:00:00Z'), traslado('9f0c1d2e-0000-4000-8000-000000000002', '2026-11-05T15:00:00Z', 'cancelled')],
  );

  test('une las tres fuentes sin mezclar ids iguales de caja y banco, la más reciente primero', () => {
    expect(filas.map((f) => f.clave)).toEqual([
      'banco:12',
      'caja:12',
      'traslado:9f0c1d2e-0000-4000-8000-000000000001',
      'traslado:9f0c1d2e-0000-4000-8000-000000000002',
      'caja:13',
    ]);
    expect(filas[0].href).toBe('/app/finanzas/egresos/u-out-12');
    expect(filas[1].href).toBe('/app/finanzas/ingresos/u-in-12');
    expect(filas[2].href).toBe('/app/finanzas/tesoreria/transferencias/9f0c1d2e-0000-4000-8000-000000000001');
    expect(filas[3].anulado).toBe(true);
  });

  test('pestañas y contadores', () => {
    expect(contarPorTipo(filas)).toEqual({ todos: 5, entradas: 2, salidas: 1, traslados: 2 });
    expect(filtrarMovimientos(filas, 'entradas').every((f) => f.tipo === 'entrada')).toBe(true);
    expect(filtrarMovimientos(filas, 'traslados')).toHaveLength(2);
  });

  test('caracterización: la búsqueda vieja encontraba por concepto o notas (sin importar mayúsculas)', () => {
    expect(filtrarMovimientos(filas, 'todos', 'INGRESO 12').map((f) => f.clave)).toEqual(['caja:12']);
    expect(filtrarMovimientos(filas, 'todos', 'arriendo').map((f) => f.clave)).toEqual(['caja:13']);
    // Ahora también por cuenta y sin tildes.
    expect(filtrarMovimientos(filas, 'salidas', 'bancólombia').map((f) => f.clave)).toEqual(['banco:12']);
  });

  test('KPI con el día de la organización: total, mes, hoy y registros; traslado anulado fuera', () => {
    const diaDe = (iso: string) => iso.slice(0, 10);
    const r = resumirMovimientos(filas, '2026-11-07', diaDe);
    expect(r.registros).toBe(4);
    expect(r.total).toBe(100 + 100 + 40 + 250);
    expect(r.hoy).toBe(140);
    expect(r.mes).toBe(100 + 40 + 250);
    expect(r.entradasMes).toBe(100);
    expect(r.salidasMes).toBe(40);
    expect(r.netoMes).toBe(60);
    expect(r.trasladosMes).toBe(1);
  });

  test('sin día de la organización todavía, «hoy» y «mes» quedan en cero (no se usa el del navegador)', () => {
    const r = resumirMovimientos(filas, '', (iso) => iso.slice(0, 10));
    expect(r.hoy).toBe(0);
    expect(r.mes).toBe(0);
    expect(r.total).toBeGreaterThan(0);
  });

  test('signo y acciones: un reverso no se anula ni se duplica; un traslado anulado no se anula otra vez', () => {
    expect(signoFila({ tipo: 'entrada' })).toBe('+');
    expect(signoFila({ tipo: 'salida' })).toBe('-');
    expect(signoFila({ tipo: 'traslado' })).toBe('');
    const [rev] = unirMovimientos([ingreso(1, '2026-11-01T00:00:00Z', { es_reverso: true })], []);
    expect(accionesFila(rev)).toEqual({ duplicar: false, anular: false });
    expect(accionesFila(filas[3])).toEqual({ duplicar: false, anular: false });
    expect(accionesFila(filas[2])).toEqual({ duplicar: false, anular: true });
    expect(accionesFila(filas[1])).toEqual({ duplicar: true, anular: true });
  });

  test('caracterización del CSV: conserva ID, Fecha, Concepto, Monto, Notas y escapa comas', () => {
    const csv = csvMovimientos(
      unirMovimientos([ingreso(7, '2026-11-01T00:00:00Z', { concept: 'Arriendo, local 2', notes: 'dijo "ya"' })], []),
      (iso) => iso.slice(0, 10),
      { tipo: { entrada: 'Entrada', salida: 'Salida', traslado: 'Traslado' }, caja: 'Caja', encabezados: ['ID', 'Fecha', 'Concepto', 'Monto', 'Notas', 'Tipo', 'Cuenta'] },
    );
    expect(csv.split('\n')).toEqual(['ID,Fecha,Concepto,Monto,Notas,Tipo,Cuenta', '7,2026-11-01,"Arriendo, local 2",100,"dijo ""ya""",Entrada,Caja']);
  });
});

describe('cuentasDinero', () => {
  const ahora = Date.parse('2026-11-07T12:00:00Z');
  const caja = (id: number, abierta: string, saldo: number | null): CajaDinero => ({
    sesion_id: id,
    uuid: `c-${id}`,
    alcance: 'sucursal',
    sucursal: { id: 1, nombre: 'Centro' },
    responsable: { id: 'u', nombre: 'Ana' },
    abierta_desde: abierta,
    saldo,
    href: `/app/pos/cajas/c-${id}`,
  });
  const banco = (id: number, extra: Partial<BancoDinero> = {}): BancoDinero => ({
    id,
    name: `Banco ${id}`,
    bank_name: 'Bancolombia',
    account_number: '0123 4567 4321',
    account_type: 'savings',
    currency: 'COP',
    balance: '1000',
    is_active: true,
    account_code: '111005',
    ...extra,
  });

  test('máscara: solo los últimos 4 dígitos', () => {
    expect(mascaraCuenta('0123 4567 4321')).toBe('··4321');
    expect(mascaraCuenta(null)).toBe('');
  });

  test('caja vencida: más de 24 h abierta', () => {
    expect(cajaVencida('2026-11-06T10:00:00Z', ahora)).toBe(true);
    expect(cajaVencida('2026-11-07T07:00:00Z', ahora)).toBe(false);
    expect(horasAbierta('2026-11-06T10:00:00Z', ahora)).toBe(26);
  });

  test('resumen: bancos activos en moneda base + cajas; inactivos y otra moneda fuera del total', () => {
    const r = resumirCuentasDinero(
      [banco(1), banco(2, { is_active: false }), banco(3, { currency: 'USD' }), banco(4, { account_code: null })],
      [caja(1, '2026-11-07T07:00:00Z', 500), caja(2, '2026-11-06T10:00:00Z', 200)],
      'cop',
      ahora,
    );
    expect(r.enBancos).toBe(2000);
    expect(r.enCajas).toBe(700);
    expect(r.disponible).toBe(2700);
    expect(r.cajasVencidas).toBe(1);
    expect(r.bancosActivos).toBe(3);
    expect(r.bancosOtraMoneda).toBe(1);
    expect(r.sinCuentaContable).toBe(1);
  });

  test('cierre ciego: una caja oculta deja «En cajas» en null y no suma su saldo', () => {
    const r = resumirCuentasDinero([banco(1)], [caja(1, '2026-11-07T07:00:00Z', null)], 'COP', ahora);
    expect(r.enCajas).toBeNull();
    expect(r.cajasOcultas).toBe(1);
    expect(r.disponible).toBe(1000);
  });

  test('buscador por sucursal, responsable o últimos dígitos', () => {
    const { cajas, bancos } = filtrarCuentas([caja(1, '2026-11-07T07:00:00Z', 1)], [banco(1), banco(2, { account_number: '999' })], '4321');
    expect(cajas).toHaveLength(0);
    expect(bancos.map((b) => b.id)).toEqual([1]);
    expect(filtrarCuentas([caja(1, '2026-11-07T07:00:00Z', 1)], [], 'ána').cajas).toHaveLength(1);
  });

  test('caracterización del alta: nombre, banco y PUC obligatorios', () => {
    const base = { name: 'X', bank_name: 'Bancolombia', account_number: '', account_type: 'savings', currency: 'COP', account_code: '111005', initial_balance: 0 };
    expect(validarCuentaBancaria(base)).toEqual([]);
    expect(validarCuentaBancaria({ ...base, name: ' ', bank_name: '', account_code: '', initial_balance: -1 })).toEqual([
      'nombre',
      'banco',
      'cuentaContable',
      'saldoInicial',
    ]);
  });
});

describe('efectoEnCuenta (decisión del dueño: bloquear en bancos, avisar en caja)', () => {
  test('entrada suma y no supera', () => {
    expect(efectoEnCuenta({ saldo: 1000, importe: 200, sentido: 'entrada', cuenta: 'caja' })).toMatchObject({ antes: 1000, despues: 1200, supera: false });
  });
  test('salida que supera: banco bloquea, caja avisa', () => {
    expect(efectoEnCuenta({ saldo: 100, importe: 200, sentido: 'salida', cuenta: 'banco' })).toMatchObject({ despues: -100, bloquea: true, avisa: false });
    expect(efectoEnCuenta({ saldo: 100, importe: 200, sentido: 'salida', cuenta: 'caja' })).toMatchObject({ bloquea: false, avisa: true });
  });
  test('saldo oculto por cierre ciego: sin después ni bloqueo', () => {
    expect(efectoEnCuenta({ saldo: null, importe: 200, sentido: 'salida', cuenta: 'caja' })).toMatchObject({ antes: null, despues: null, supera: false });
  });
});

describe('consignacion', () => {
  const ok = { id: '9f0c1d2e-0000-4000-8000-000000000001', sesionId: 4, cuentaBancoId: 2, monto: '1000000', comision: 4000, fecha: '2026-11-07', referencia: ' 4471 ' };
  test('lista blanca y normalización', () => {
    const v = validarConsignacion({ ...ok, organization_id: 999 });
    expect(v).toEqual({ ok: true, datos: { id: ok.id, sesionId: 4, cuentaBancoId: 2, monto: 1000000, comision: 4000, fecha: '2026-11-07', referencia: '4471' } });
    if (v.ok) expect(parametrosConsignacion(7, v.datos)).toMatchObject({ p_organization_id: 7, p_sesion_id: 4, p_cuenta_banco: 2 });
  });
  test('errores', () => {
    expect(validarConsignacion({ ...ok, id: 'x' })).toEqual({ ok: false, error: 'datos_invalidos' });
    expect(validarConsignacion({ ...ok, sesionId: 0 })).toEqual({ ok: false, error: 'caja_requerida' });
    expect(validarConsignacion({ ...ok, cuentaBancoId: null })).toEqual({ ok: false, error: 'cuenta_requerida' });
    expect(validarConsignacion({ ...ok, monto: -1 })).toEqual({ ok: false, error: 'monto_invalido' });
    expect(validarConsignacion(ok, '2026-11-06')).toEqual({ ok: false, error: 'fecha_futura' });
  });
  test('errores de la RPC → códigos estables', () => {
    expect(codigoErrorConsignacion({ message: 'caja_no_encontrada' })).toBe('caja_no_encontrada');
    expect(codigoErrorConsignacion({ message: 'datos_invalidos' })).toBe('datos_invalidos');
    expect(codigoErrorConsignacion({ message: 'saldo raro de postgres' })).toBe('desconocido');
    expect(codigoErrorConsignacion({ message: 'caja_cerrada' })).toBe('caja_cerrada');
    expect(totalSaleDeCaja(1000000, 4000)).toBe(1004000);
  });
});

describe('rutas viejas → nuevas (conservan el filtro)', () => {
  test('bancos y sus pestañas', () => {
    expect(destinoBancos({})).toBe(RUTAS_TESORERIA.cuentas);
    expect(destinoBancos({ tab: 'alertas' })).toBe('/app/finanzas/tesoreria/cuentas?tab=alertas');
    expect(destinoBancos({ tab: 'conciliacion' })).toBe(RUTAS_TESORERIA.conciliacion);
    expect(destinoTesoreriaConsolidada()).toBe('/app/finanzas/tesoreria/cuentas?tab=posicion');
    expect(destinoAnomalias()).toBe('/app/finanzas/tesoreria/cuentas?tab=alertas');
    expect(destinoNuevaCuenta()).toBe('/app/finanzas/tesoreria/cuentas?nueva=1');
  });
  test('detalle de cuenta, edición y movimientos', () => {
    expect(destinoCuentaBancaria('12')).toBe('/app/finanzas/tesoreria/cuentas/12');
    expect(destinoCuentaBancaria('12', { edit: 'true' })).toBe('/app/finanzas/tesoreria/cuentas/12?tab=datos');
    expect(destinoCuentaBancaria('12', { desde: '2026-11-01' }, true)).toBe('/app/finanzas/tesoreria/cuentas/12?desde=2026-11-01&tab=movimientos');
    expect(destinoCuentaBancaria('<script>')).toBe(RUTAS_TESORERIA.cuentas);
  });
  test('conciliación y transferencias', () => {
    const id = '9f0c1d2e-0000-4000-8000-000000000001';
    expect(destinoConciliacion()).toBe(RUTAS_TESORERIA.conciliacion);
    expect(destinoConciliacion('nuevo')).toBe('/app/finanzas/tesoreria/conciliacion/nueva');
    expect(destinoConciliacion(id)).toBe(`/app/finanzas/tesoreria/conciliacion/${id}`);
    expect(destinoConciliacion('x', { q: 'ahorros' })).toBe('/app/finanzas/tesoreria/conciliacion?q=ahorros');
    expect(destinoTransferencia(id)).toBe(`/app/finanzas/tesoreria/transferencias/${id}`);
    expect(destinoTransferencia(null, { q: 'a"b' })).toBe(RUTAS_TESORERIA.transferencias);
  });
});

import { estaConciliadoBanco, filtrarMovimientosBanco, resumirMovimientosBanco } from '../cuentasDinero';

describe('detalle de cuenta bancaria', () => {
  const txs = [
    { amount: 1000, status: 'unmatched', trans_date: '2026-11-03T15:00:00Z', created_at: '2026-11-03T15:00:00Z', description: 'Consignación turno', reference: 'REF-1' },
    { amount: '-200', status: 'matched', trans_date: '2026-11-02T15:00:00Z', created_at: '2026-11-02T15:00:00Z', description: 'Comisión', reference: null },
    { amount: 50, status: 'reconciled', trans_date: '2026-10-30T15:00:00Z', created_at: '2026-10-30T15:00:00Z', description: 'Intereses', reference: null },
  ];
  test('por conciliar y del mes', () => {
    expect(resumirMovimientosBanco(txs, '2026-11-07', (iso) => iso.slice(0, 10))).toEqual({
      porConciliar: 1,
      importePorConciliar: 1000,
      mes: 2,
      entradasMes: 1000,
      salidasMes: 200,
    });
  });
  test('caracterización: filtros «Pendientes» y «Conciliados» de la pantalla vieja y búsqueda por descripción o referencia', () => {
    expect(estaConciliadoBanco('reconciled')).toBe(true);
    expect(filtrarMovimientosBanco(txs, 'pendientes', '').map((x) => x.description)).toEqual(['Consignación turno']);
    expect(filtrarMovimientosBanco(txs, 'conciliados', '')).toHaveLength(2);
    expect(filtrarMovimientosBanco(txs, 'todos', 'ref-1')).toHaveLength(1);
  });
});

import { eslabonesCadena, type TextosCadena } from '../cadenaMovimiento';
import { opcionesCuentaDinero } from '../cuentaDineroSelector';

describe('cadena del dinero (turno → movimiento → asiento → conciliación)', () => {
  const textos = Object.fromEntries(
    ['turno', 'movimiento', 'asiento', 'conciliacion', 'consignacion', 'sinAsiento', 'publicado', 'borrador', 'conciliado', 'porConciliar', 'pendiente', 'abierto', 'cerrado'].map((k) => [k, k]),
  ) as unknown as TextosCadena;
  const f = (iso: string) => iso.slice(0, 10);

  test('caja: turno con enlace al turno, movimiento actual, asiento publicado y consignación pendiente', () => {
    const e = eslabonesCadena(
      { id: 131, source: 'cash', fecha: '2026-11-07T15:00:00Z' },
      { turno: { id: 1284, uuid: 'u-1', abiertaEn: '2026-11-07T12:58:00Z', abierta: true }, asiento: { id: 9612, fecha: '2026-11-07T15:00:00Z', publicado: true, numero: null }, conciliado: null },
      textos,
      f,
    );
    expect(e.map((x) => x.etiquetaTipo)).toEqual(['turno', 'movimiento', 'asiento', 'consignacion']);
    expect(e[0].href).toBe('/app/pos/cajas/u-1');
    expect(e[1].actual).toBe(true);
    expect(e[2]).toMatchObject({ numero: '#9612', estado: 'publicado', href: '/app/finanzas/contabilidad/asientos/9612' });
    expect(e[3].pendiente).toBe(true);
  });

  test('banco: sin turno; sin asiento queda punteado; conciliación pendiente o hecha', () => {
    const base = { id: 7, source: 'bank' as const, fecha: '2026-11-07T15:00:00Z' };
    const sin = eslabonesCadena(base, { turno: null, asiento: null, conciliado: false }, textos, f);
    expect(sin.map((x) => x.etiquetaTipo)).toEqual(['movimiento', 'asiento', 'conciliacion']);
    expect(sin[1]).toMatchObject({ numero: 'sinAsiento', pendiente: true });
    expect(sin[2]).toMatchObject({ numero: 'porConciliar', pendiente: true });
    expect(eslabonesCadena(base, { turno: null, asiento: null, conciliado: true }, textos, f)[2]).toMatchObject({ numero: 'conciliado', pendiente: false });
  });
});

describe('selector de cuenta de dinero', () => {
  const caja = (id: number, sucursal: string | null, saldo: number | null) => ({
    sesion_id: id, uuid: `c${id}`, alcance: 'sucursal' as const, sucursal: sucursal ? { id, nombre: sucursal } : null,
    responsable: { id: 'u', nombre: 'Ana' }, abierta_desde: '2026-11-07T07:00:00Z', saldo, href: '',
  });
  test('la caja de la sucursal primero; las demás deshabilitadas con su motivo; luego bancos', () => {
    const o = opcionesCuentaDinero({ sesionSucursal: 2, cajas: [caja(1, 'Norte', 10), caja(2, 'Centro', 500)], bancos: [{ id: 9, nombre: 'Ahorros', saldo: 1000 }], modo: 'branch' });
    expect(o.map((x) => [x.valor, x.motivo])).toEqual([['caja', null], ['caja:1', 'otraSucursal'], ['banco:9', null]]);
    expect(o[0]).toMatchObject({ nombre: 'Centro', saldo: 500, propia: false });
  });
  test('sin caja abierta en la sucursal: solo bancos habilitados; modo por cajero marca la ajena', () => {
    const o = opcionesCuentaDinero({ sesionSucursal: null, cajas: [caja(1, 'Norte', null)], bancos: [], modo: 'user' });
    expect(o).toEqual([expect.objectContaining({ valor: 'caja:1', motivo: 'otroCajero', saldo: null })]);
  });
});

import { resumirExtracto } from '../cuentasDinero';

describe('extractos de la cuenta y «Por conciliar» de Movimientos', () => {
  test('resumen de un extracto', () => {
    expect(resumirExtracto([{ estado: 'emparejada', valor: 100 }, { estado: 'creada', valor: -20 }, { estado: 'pendiente', valor: 5 }])).toEqual({
      lineas: 3, emparejadas: 1, creadas: 1, pendientes: 1, entradas: 105, salidas: 20,
    });
  });
  test('por conciliar: solo movimientos bancarios sin conciliar, con su importe y cuántos bancos', () => {
    const filas = unirMovimientos(
      [ingreso(1, '2026-11-01T00:00:00Z', { source: 'bank', bank_account_name: 'A', conciliado: false }), ingreso(2, '2026-11-01T00:00:00Z')],
      [egreso(3, '2026-11-02T00:00:00Z', { conciliado: true }), egreso(4, '2026-11-02T00:00:00Z', { bank_account_name: 'B', conciliado: false })],
    );
    expect(filas.find((f) => f.clave === 'caja:2')?.conciliacion).toBeNull();
    const r = resumirMovimientos(filas, '2026-11-07', (iso) => iso.slice(0, 10));
    expect([r.porConciliar, r.importePorConciliar, r.bancosPorConciliar]).toEqual([2, 140, 2]);
  });
});
