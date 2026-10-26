/**
 * Lee lo que el motor necesita. La organización y el cliente vienen de la
 * sesión: aquí no hay service role. Las cifras se calculan después, en el motor.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { supabase as navegador } from '@/lib/supabase/config';
import { resolveTimezone } from '@/lib/services/timezoneResolver';
import { addPlainDays, toPlainDate } from '@/lib/utils/dateDisplay';
import { restarAnio, anioDe } from './fechas';
import { pesos } from './saldos';
import {
  PERFIL_DEFECTO,
  type AjusteFiscal,
  type Accionista,
  type ComportamientoCosto,
  type Cuenta,
  type EntradaInforme,
  type FilaNomina,
  type LineaContribucion,
  type LineaIva,
  type Movimiento,
  type MovimientoKardex,
  type PerfilEstados,
  type PresentacionNiif,
  type TopeExogena,
} from './tipos';

export interface PedidoCarga {
  organizationId: number;
  desde: string;
  hasta: string;
  sucursalId?: number | null;
  centroId?: string | null;
  cuenta?: string | null;
  client?: SupabaseClient;
}

interface Respuesta<T> {
  data: T | null;
  error: { message: string } | null;
}

interface Constructor {
  select(columnas: string): Constructor;
  eq(columna: string, valor: unknown): Constructor;
  gte(columna: string, valor: unknown): Constructor;
  lte(columna: string, valor: unknown): Constructor;
  in(columna: string, valor: unknown[]): Constructor;
  order(columna: string, opciones?: { ascending: boolean }): Constructor;
  range(desde: number, hasta: number): PromiseLike<Respuesta<unknown[]>>;
  maybeSingle(): PromiseLike<Respuesta<unknown>>;
  upsert(fila: unknown, opciones?: { onConflict: string }): PromiseLike<Respuesta<unknown>>;
  insert(fila: unknown): PromiseLike<Respuesta<unknown>>;
  update(fila: unknown): Constructor;
  delete(): Constructor;
}

const OMITIR_ESTADO = new Set(['draft', 'borrador', 'cancelled', 'canceled', 'void', 'voided', 'anulada', 'anulado']);

function clienteDe(db: SupabaseClient): { from: (tabla: string) => Constructor; rpc: (nombre: string, args: Record<string, unknown>) => PromiseLike<Respuesta<unknown>> } {
  return db as unknown as { from: (tabla: string) => Constructor; rpc: (nombre: string, args: Record<string, unknown>) => PromiseLike<Respuesta<unknown>> };
}

function texto(valor: unknown): string {
  return valor == null ? '' : String(valor);
}

function numero(valor: unknown): number {
  const n = typeof valor === 'number' ? valor : Number(valor);
  return Number.isFinite(n) ? n : 0;
}

function dia(valor: unknown): string {
  return texto(valor).slice(0, 10);
}

function registro(valor: unknown): Record<string, unknown> {
  return valor && typeof valor === 'object' ? (valor as Record<string, unknown>) : {};
}

function lista(valor: unknown): Record<string, unknown>[] {
  return Array.isArray(valor) ? valor.map(registro) : [];
}

async function paginar(pedir: (desde: number, hasta: number) => PromiseLike<Respuesta<unknown[]>>): Promise<Record<string, unknown>[]> {
  const filas: Record<string, unknown>[] = [];
  let desde = 0;
  for (;;) {
    const { data, error } = await pedir(desde, desde + 999);
    if (error) throw new Error(error.message);
    const pagina = lista(data);
    filas.push(...pagina);
    if (pagina.length < 1000) return filas;
    desde += 1000;
  }
}

function naturalezaDe(valor: unknown): 'debito' | 'credito' | null {
  const n = texto(valor).toLowerCase();
  if (n === 'debito' || n === 'debit' || n === 'd') return 'debito';
  if (n === 'credito' || n === 'credit' || n === 'c') return 'credito';
  return null;
}

function presentacionDe(valor: unknown): PresentacionNiif | null {
  const n = texto(valor);
  if (n === 'corriente' || n === 'no_corriente' || n === 'segun_plazo') return n;
  return null;
}

function comportamientoDe(valor: unknown): ComportamientoCosto | null {
  const n = texto(valor);
  if (n === 'fijo' || n === 'variable') return n;
  return null;
}

function notasDe(valor: unknown): Record<string, string> {
  const origen = registro(valor);
  const notas: Record<string, string> = {};
  for (const [clave, textoNota] of Object.entries(origen)) {
    if (typeof textoNota === 'string') notas[clave] = textoNota;
  }
  return notas;
}

function perfilDe(fila: Record<string, unknown> | null, entidad: string, nit: string): PerfilEstados {
  if (!fila) return { ...PERFIL_DEFECTO, entidad, nit };
  const grupo = numero(fila.grupo_niif) === 3 ? 3 : 2;
  const periodo = texto(fila.periodo_iva) === 'cuatrimestral' ? 'cuatrimestral' : 'bimestral';
  const digitos = numero(fila.digitos_nota) === 6 ? 6 : 4;
  return {
    grupo,
    cambiosPatrimonio: fila.cambios_patrimonio !== false,
    periodoIva: periodo,
    responsableIva: fila.responsable_iva !== false,
    actividad: texto(fila.actividad),
    municipioIca: texto(fila.municipio_ica),
    tarifaIca: numero(fila.tarifa_ica),
    exclusionesIca: texto(fila.exclusiones_ica),
    exclusionesIcaValor: numero(fila.exclusiones_ica_valor),
    representanteNombre: texto(fila.representante_nombre),
    representanteDocumento: texto(fila.representante_documento),
    contadorNombre: texto(fila.contador_nombre),
    contadorCedula: texto(fila.contador_cedula),
    contadorTarjeta: texto(fila.contador_tarjeta),
    revisorNombre: texto(fila.revisor_nombre),
    revisorTarjeta: texto(fila.revisor_tarjeta),
    incluirDictamen: fila.incluir_dictamen === true,
    notas: notasDe(fila.notas),
    informeGestion: texto(fila.informe_gestion),
    entidad,
    nit,
    digitosNota: digitos,
  };
}

function tarifaDe(tasa: number): number {
  if (!Number.isFinite(tasa) || tasa <= 0) return 0;
  return tasa > 1 ? tasa : Math.round(tasa * 10000) / 100;
}

function lineaIva(origen: LineaIva['origen'], tasaCruda: number, incluido: boolean, excluido: boolean, total: number): LineaIva {
  const tarifa = tarifaDe(tasaCruda);
  if (excluido) return { origen, tarifa, base: pesos(total), iva: 0, excluido: true };
  if (tarifa === 0) return { origen, tarifa: 0, base: pesos(total), iva: 0, excluido: false };
  const factor = tasaCruda > 1 ? tasaCruda / 100 : tasaCruda;
  if (incluido) {
    const base = pesos(total / (1 + factor));
    return { origen, tarifa, base, iva: pesos(total - base), excluido: false };
  }
  const base = pesos(total);
  return { origen, tarifa, base, iva: pesos(base * factor), excluido: false };
}

function estadoVigente(fila: Record<string, unknown>): boolean {
  const estado = texto(fila.status).toLowerCase();
  return !OMITIR_ESTADO.has(estado);
}

function enDia(instante: unknown, tz: string, desde: string, hasta: string): boolean {
  if (!instante) return false;
  const plano = toPlainDate(new Date(texto(instante)), tz);
  return plano >= desde && plano <= hasta;
}

function diaPlano(instante: unknown, tz: string): string {
  return toPlainDate(new Date(texto(instante)), tz);
}

export async function cargarEntrada(pedido: PedidoCarga): Promise<EntradaInforme> {
  if (!pedido.organizationId) throw new Error('No hay una organización activa.');
  const db = clienteDe(pedido.client ?? navegador);
  const sucursalId = pedido.sucursalId ?? null;
  const centroId = pedido.centroId ?? null;
  const tz = await resolveTimezone(pedido.organizationId, sucursalId);
  const anio = anioDe(pedido.hasta);
  const padInicio = `${addPlainDays(pedido.desde, -2)}T00:00:00.000Z`;
  const padFin = `${addPlainDays(pedido.hasta, 2)}T23:59:59.999Z`;

  const [crudo, orgRes, perfilRes, topes, accionistas, ajustes, cuentas, metadatos, sedes, centros] = await Promise.all([
    db.rpc('fn_movimientos_informe', {
      p_organization_id: pedido.organizationId,
      p_hasta: pedido.hasta,
      p_sucursal: sucursalId,
      p_centro: centroId,
      p_detalle_desde: restarAnio(pedido.desde),
    }),
    db.from('organizations').select('legal_name, name, nit, dv').eq('id', pedido.organizationId).maybeSingle(),
    db.from('perfil_estados_financieros').select('*').eq('organization_id', pedido.organizationId).maybeSingle(),
    paginar((desde, hasta) => db.from('topes_exogena').select('formato, tope, anio').eq('organization_id', pedido.organizationId).eq('anio', anio).range(desde, hasta)),
    paginar((desde, hasta) => db.from('accionistas_org').select('id, nombre, documento, acciones, valor_nominal, porcentaje, fecha_ingreso').eq('organization_id', pedido.organizationId).order('nombre', { ascending: true }).range(desde, hasta)),
    paginar((desde, hasta) => db.from('ajustes_conciliacion_fiscal').select('id, concepto, tipo, valor, formulario, anio').eq('organization_id', pedido.organizationId).eq('anio', anio).range(desde, hasta)),
    paginar((desde, hasta) => db.from('chart_of_accounts').select('account_code, name, nivel, naturaleza, presentacion_niif, es_movimiento').eq('organization_id', pedido.organizationId).eq('is_active', true).order('account_code', { ascending: true }).range(desde, hasta)),
    paginar((desde, hasta) => db.from('financial_report_account_metadata').select('account_code, costo_comportamiento, es_ori, equivalente_efectivo, plazo_meses').eq('organization_id', pedido.organizationId).range(desde, hasta)),
    paginar((desde, hasta) => db.from('branches').select('id, name').eq('organization_id', pedido.organizationId).range(desde, hasta)),
    paginar((desde, hasta) => db.from('cost_centers').select('id, name').eq('organization_id', pedido.organizationId).range(desde, hasta)),
  ]);
  if (crudo.error) throw new Error(crudo.error.message);
  if (orgRes.error) throw new Error(orgRes.error.message);
  if (perfilRes.error) throw new Error(perfilRes.error.message);

  const org = registro(orgRes.data);
  const nitBase = texto(org.nit) || texto(org.tax_id);
  const nit = org.dv != null && nitBase ? `${nitBase}-${texto(org.dv)}` : nitBase;
  const perfil = perfilDe(perfilRes.data ? registro(perfilRes.data) : null, texto(org.legal_name) || texto(org.name), nit);

  const meta = new Map(metadatos.map((m) => [texto(m.account_code), m]));
  const plan: Cuenta[] = cuentas.map((c) => {
    const codigo = texto(c.account_code);
    const marca = meta.get(codigo);
    const nivel = Number.parseInt(texto(c.nivel), 10);
    return {
      codigo,
      nombre: texto(c.name) || codigo,
      nivel: Number.isFinite(nivel) ? nivel : Math.min(codigo.length, 6),
      naturaleza: naturalezaDe(c.naturaleza),
      presentacion: presentacionDe(c.presentacion_niif),
      plazoMeses: marca && marca.plazo_meses != null ? numero(marca.plazo_meses) : null,
      esOri: marca?.es_ori === true,
      equivalenteEfectivo: marca?.equivalente_efectivo === true,
      comportamiento: comportamientoDe(marca?.costo_comportamiento),
      esMovimiento: c.es_movimiento == null ? null : c.es_movimiento === true,
    };
  });

  const movimientos: Movimiento[] = lista(crudo.data).map((m) => ({
    asientoId: numero(m.asientoId),
    fecha: dia(m.fecha),
    cuenta: texto(m.cuenta),
    debito: numero(m.debito),
    credito: numero(m.credito),
    sucursalId: m.sucursalId == null ? null : numero(m.sucursalId),
    centroId: m.centroId == null ? null : texto(m.centroId),
    terceroNit: texto(m.terceroNit),
    terceroNombre: texto(m.terceroNombre),
    source: texto(m.source),
  }));

  const nombresSucursal: Record<string, string> = {};
  for (const sede of sedes) nombresSucursal[texto(sede.id)] = texto(sede.name) || `Sede ${texto(sede.id)}`;
  const nombresCentro: Record<string, string> = {};
  for (const centro of centros) nombresCentro[texto(centro.id)] = texto(centro.name);

  const [iva, kardex, nomina, contribucion] = await Promise.all([
    cargarIva(db, pedido, tz, padInicio, padFin),
    cargarKardex(db, pedido, tz, padFin),
    cargarNomina(db, pedido),
    cargarContribucion(db, pedido, tz, padInicio, padFin),
  ]);

  const topesAnio: TopeExogena[] = topes.map((t) => ({ formato: texto(t.formato), tope: numero(t.tope) }));
  return {
    desde: pedido.desde,
    hasta: pedido.hasta,
    movimientos,
    cuentas: plan,
    perfil,
    kardex,
    iva,
    nomina,
    topes: topesAnio,
    topesConfigurados: topesAnio.length > 0,
    accionistas: accionistas.map(accionistaDe),
    ajustesFiscales: ajustes.map(ajusteDe),
    contribucion,
    cuenta: pedido.cuenta ?? null,
    nombresCentro,
    nombresSucursal,
  };
}

function accionistaDe(fila: Record<string, unknown>): Accionista {
  return {
    id: texto(fila.id),
    nombre: texto(fila.nombre),
    documento: texto(fila.documento),
    acciones: numero(fila.acciones),
    valorNominal: numero(fila.valor_nominal),
    porcentaje: numero(fila.porcentaje),
    fechaIngreso: dia(fila.fecha_ingreso),
  };
}

function ajusteDe(fila: Record<string, unknown>): AjusteFiscal {
  return {
    id: texto(fila.id),
    concepto: texto(fila.concepto),
    tipo: texto(fila.tipo) === 'deduccion' ? 'deduccion' : 'adicion',
    valor: numero(fila.valor),
    formulario: texto(fila.formulario) === '2517' ? '2517' : '2516',
  };
}

async function cargarIva(db: ReturnType<typeof clienteDe>, pedido: PedidoCarga, tz: string, padInicio: string, padFin: string): Promise<LineaIva[]> {
  const lineas: LineaIva[] = [];
  const tomar = (filas: Record<string, unknown>[], relacion: string, origen: LineaIva['origen']) => {
    for (const fila of filas) {
      const doc = registro(fila[relacion]);
      if (!estadoVigente(doc) || !enDia(doc.issue_date, tz, pedido.desde, pedido.hasta)) continue;
      if (pedido.sucursalId && numero(doc.branch_id) !== pedido.sucursalId) continue;
      lineas.push(lineaIva(origen, numero(fila.tax_rate), fila.tax_included === true, numero(fila.is_excluded) !== 0, numero(fila.total_line)));
    }
  };
  try {
    const ventas = await paginar((desde, hasta) =>
      db.from('invoice_items').select('tax_rate, tax_included, is_excluded, total_line, invoice_sales!inner(organization_id, issue_date, status, branch_id)').eq('invoice_sales.organization_id', pedido.organizationId).gte('invoice_sales.issue_date', padInicio).lte('invoice_sales.issue_date', padFin).range(desde, hasta),
    );
    tomar(ventas, 'invoice_sales', 'venta');
  } catch {
    // Una compra mal embebida no puede dejar el formulario sin las ventas.
  }
  try {
    const compras = await paginar((desde, hasta) =>
      db.from('invoice_items').select('tax_rate, tax_included, is_excluded, total_line, invoice_purchase!inner(organization_id, issue_date, status, branch_id)').eq('invoice_purchase.organization_id', pedido.organizationId).gte('invoice_purchase.issue_date', padInicio).lte('invoice_purchase.issue_date', padFin).range(desde, hasta),
    );
    tomar(compras, 'invoice_purchase', 'compra');
  } catch {
    // Sin líneas de compra, el formulario sigue con las ventas y las cuentas.
  }
  return lineas;
}

async function cargarKardex(db: ReturnType<typeof clienteDe>, pedido: PedidoCarga, tz: string, padFin: string): Promise<MovimientoKardex[]> {
  const filas = await paginar((desde, hasta) => {
    let consulta = db.from('stock_movements').select('id, branch_id, product_id, direction, qty, unit_cost, source, source_id, created_at, products(name)').eq('organization_id', pedido.organizationId).lte('created_at', padFin).order('id', { ascending: true });
    if (pedido.sucursalId) consulta = consulta.eq('branch_id', pedido.sucursalId);
    return consulta.range(desde, hasta);
  });
  const movimientos: MovimientoKardex[] = [];
  for (const fila of filas) {
    const fecha = diaPlano(fila.created_at, tz);
    if (fecha > pedido.hasta) continue;
    const sentido = texto(fila.direction).toLowerCase();
    const producto = registro(fila.products);
    movimientos.push({
      fecha,
      documento: texto(fila.source_id) || texto(fila.id),
      source: texto(fila.source),
      direction: sentido === 'out' || sentido === 'salida' ? 'out' : 'in',
      cantidad: Math.abs(numero(fila.qty)),
      costoUnitario: numero(fila.unit_cost),
      sucursalId: numero(fila.branch_id),
      productoId: texto(producto.name) || texto(fila.product_id),
      orden: numero(fila.id),
    });
  }
  return movimientos;
}

async function cargarNomina(db: ReturnType<typeof clienteDe>, pedido: PedidoCarga): Promise<FilaNomina[]> {
  try {
    const periodos = await paginar((desde, hasta) =>
      db.from('payroll_periods').select('id, period_start, period_end, status').eq('organization_id', pedido.organizationId).lte('period_start', pedido.hasta).gte('period_end', pedido.desde).range(desde, hasta),
    );
    const ids = periodos.filter((p) => !OMITIR_ESTADO.has(texto(p.status).toLowerCase())).map((p) => texto(p.id)).filter(Boolean);
    if (ids.length === 0) return [];
    const corridas = await paginar((desde, hasta) => db.from('payroll_runs').select('id, status, payroll_period_id').in('payroll_period_id', ids).range(desde, hasta));
    const corridasIds = corridas.filter((c) => !OMITIR_ESTADO.has(texto(c.status).toLowerCase())).map((c) => texto(c.id)).filter(Boolean);
    if (corridasIds.length === 0) return [];
    const colillas = await paginar((desde, hasta) =>
      db.from('payroll_slips').select('employment_id, gross_pay, tax_withholding, health_deduction, pension_deduction, employer_health, employer_pension, employer_arl, employer_parafiscales, status').in('payroll_run_id', corridasIds).range(desde, hasta),
    );
    return colillas.filter((c) => !OMITIR_ESTADO.has(texto(c.status).toLowerCase())).map((c) => ({
      nombre: texto(c.employment_id) || 'Empleado',
      documento: '',
      devengado: numero(c.gross_pay),
      retencion: numero(c.tax_withholding),
      saludTrabajador: numero(c.health_deduction),
      pensionTrabajador: numero(c.pension_deduction),
      saludEmpleador: numero(c.employer_health),
      pensionEmpleador: numero(c.employer_pension),
      arl: numero(c.employer_arl),
      parafiscales: numero(c.employer_parafiscales),
    }));
  } catch {
    return [];
  }
}

async function cargarContribucion(db: ReturnType<typeof clienteDe>, pedido: PedidoCarga, tz: string, padInicio: string, padFin: string): Promise<LineaContribucion[]> {
  try {
    const filas = await paginar((desde, hasta) => {
      let consulta = db.from('sale_items').select('quantity, total, product_id, products(name), sales!inner(organization_id, sale_date, branch_id, status)').eq('sales.organization_id', pedido.organizationId).gte('sales.sale_date', padInicio).lte('sales.sale_date', padFin);
      if (pedido.sucursalId) consulta = consulta.eq('sales.branch_id', pedido.sucursalId);
      return consulta.range(desde, hasta);
    });
    const porProducto = new Map<string, LineaContribucion>();
    for (const fila of filas) {
      const venta = registro(fila.sales);
      if (!estadoVigente(venta) || !enDia(venta.sale_date, tz, pedido.desde, pedido.hasta)) continue;
      const producto = registro(fila.products);
      const nombre = texto(producto.name) || texto(fila.product_id) || 'Producto';
      const actual = porProducto.get(nombre) ?? { producto: nombre, linea: '', ventas: 0, costoVariable: 0, unidades: 0 };
      actual.ventas += numero(fila.total);
      actual.unidades += numero(fila.quantity);
      porProducto.set(nombre, actual);
    }
    return [...porProducto.values()].map((l) => ({ ...l, ventas: pesos(l.ventas) }));
  } catch {
    return [];
  }
}
