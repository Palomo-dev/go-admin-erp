import type { SupabaseClient } from '@supabase/supabase-js';
import { movimientosContabilizados } from '@/lib/finanzas/informes/estados';
import { esImpuestoIva } from '@/lib/finanzas/mapeoImpuesto';
import { calcularLineaVenta, type ImpuestoLineaVenta } from '@/lib/finanzas/ventas/lineasFacturaVenta';
import { normalizarCodigoMoneda } from '@/lib/utils/moneda';
import { avisoMonedaTributaria } from '@/lib/finanzas/informes/monedaTributaria';
import type { LineaIva, MovimientoTributario, NominaTributaria, ParametrosAnioTributario, RetencionTributaria } from '@/lib/finanzas/informes/tributarios';

interface FiltrosTributarios { desde: string; hasta: string; branchId?: number; costCenterId?: string; monedaBase: string | null }
interface MovimientoFuente extends MovimientoTributario { description?: string | null; descripcion?: string | null }
type Fila = Record<string, unknown>;
export interface FuenteTributaria {
  lineasIva: LineaIva[];
  retenciones: RetencionTributaria[];
  nomina: NominaTributaria[];
  pendientesFuente: string[];
}

const n = (v: unknown): number | null => {
  if (v === null || v === undefined || v === '') return null;
  const numero = Number(v);
  return Number.isFinite(numero) ? numero : null;
};
const texto = (v: unknown): string | null => typeof v === 'string' && v.trim() ? v : null;
const objeto = (v: unknown): Fila => v !== null && typeof v === 'object' && !Array.isArray(v) ? v as Fila : {};

/**
 * Las tablas hijas sin organization_id se leen exclusivamente después de verificar
 * los padres de esta organización. Las listas largas se fragmentan y paginan.
 */
async function leerPorIds(db: SupabaseClient, tabla: string, columnas: string, columnaId: string, ids: string[], organizationId?: number): Promise<Fila[]> {
  const resultado: Fila[] = [];
  for (let inicio = 0; inicio < ids.length; inicio += 100) {
    const lote = ids.slice(inicio, inicio + 100);
    for (let offset = 0; ; offset += 1000) {
      let consulta = db.from(tabla).select(columnas).in(columnaId, lote).order('id');
      if (organizationId !== undefined) consulta = consulta.eq('organization_id', organizationId);
      const { data, error } = await consulta.range(offset, offset + 999);
      if (error) throw new Error(`No se pudo leer ${tabla} para los borradores tributarios.`);
      const filas = (data ?? []) as unknown as Fila[];
      resultado.push(...filas);
      if (filas.length < 1000) break;
    }
  }
  return resultado;
}

/** Solo impuestos históricos; nunca se consulta el impuesto actual del producto. */
export function impuestosHistoricosLinea(item: Fila): ImpuestoLineaVenta[] {
  if (Array.isArray(item.impuestos_linea) && item.impuestos_linea.length) {
    return item.impuestos_linea.map((v, i) => {
      const f = objeto(v);
      return { id: texto(f.id) ?? `historico-${i}`, codigo: texto(f.codigo), nombre: texto(f.nombre) ?? '', tarifa: n(f.tarifa) ?? 0 };
    });
  }
  const tarifa = n(item.tax_rate);
  const codigo = texto(item.tax_code);
  return tarifa !== null ? [{ id: 'historico', codigo, nombre: codigo ?? '', tarifa }] : [];
}

/** Conversión del snapshot compartida por el cargador y sus pruebas. */
export function lineaIvaDesdeSnapshot(item: Fila, factura: Fila, tipo: 'venta' | 'compra', fecha: string, tercero: string | null): { lineas: LineaIva[]; avisos: string[] } {
  const avisos: string[] = [];
  const id = String(factura.id);
  const cantidad = n(item.qty);
  const precio = n(item.unit_price);
  const impuestos = impuestosHistoricosLinea(item);
  if (cantidad === null || precio === null || !impuestos.length || impuestos.some((i) => i.tarifa < 0 || i.tarifa > 100)) {
    return { lineas: [], avisos: [`Factura ${id}: snapshot de cantidad, precio o impuestos incompleto; revise el IVA antes de presentar.`] };
  }
  const incluido = typeof item.tax_included === 'boolean' ? item.tax_included : typeof factura.tax_included === 'boolean' ? factura.tax_included : null;
  if (incluido === null) return { lineas: [], avisos: [`Factura ${id}: falta la condición histórica de impuestos incluidos; no se estima la base.`] };
  const calculada = calcularLineaVenta({ cantidad, precio, descuento: n(item.discount_amount) ?? 0, impuestos }, incluido);
  const totalGuardado = n(item.total_line);
  if (totalGuardado === null || Math.abs(totalGuardado - calculada.total_line) > 0.02) {
    avisos.push(`Factura ${id}, línea ${item.id}: el total guardado difiere del snapshot de precio y descuento; revise la base tributaria.`);
    return { lineas: [], avisos };
  }
  const iva = calculada.porImpuesto.filter((i) => esImpuestoIva(i.codigo, i.nombre) || String(item.tribute_id) === '1' || i.codigo === '01');
  const devolucion = factura.document_type === 'credit_note';
  if (!iva.length) {
    const totalTarifa = impuestos.reduce((ac, i) => ac + i.tarifa, 0);
    if (totalTarifa === 0) return { lineas: [{ factura: id, fecha, tipo, devolucion, tercero, base: calculada.base, iva: 0, tarifa: 0, tratamiento: item.is_excluded === true ? 'excluido' : 'sin_clasificar', contabilizada: true }], avisos };
    return { lineas: [], avisos: [...avisos, `Factura ${id}, línea ${item.id}: el snapshot no identifica un impuesto IVA; no se confunde INC u otro tributo con IVA.`] };
  }
  // La base de la operación aparece una vez aunque el snapshot contenga dos impuestos IVA.
  return { lineas: iva.map((i, indice) => ({ factura: id, fecha, tipo, devolucion, tercero, base: indice === 0 ? calculada.base : 0, iva: i.importe, tarifa: i.tarifa, tratamiento: i.tarifa > 0 ? 'gravado' : item.is_excluded === true ? 'excluido' : /EXENT/i.test(`${i.codigo ?? ''} ${i.nombre}`) ? 'exento' : 'sin_clasificar', contabilizada: true })), avisos };
}

/**
 * Caller: sesión RLS, organización y permiso ya validados. El asiento es la
 * autoridad del periodo y del centro de costo; no se reemplaza por el estado
 * actual de una factura ni por fechas UTC recortadas.
 * Esquema: /tmp/esquema-tributario-verificado.json obtenido por MCP el 2026-10-24.
 */
export async function cargarFuenteTributaria(
  db: SupabaseClient,
  organizationId: number,
  filtros: FiltrosTributarios,
  movimientosFuente: MovimientoFuente[],
  parametrosAnio: ParametrosAnioTributario = {},
): Promise<FuenteTributaria> {
  if (!Number.isSafeInteger(organizationId) || organizationId <= 0) throw new Error('Organización inválida para borradores tributarios.');
  const avisoMoneda = avisoMonedaTributaria(filtros.monedaBase);
  if (avisoMoneda) return { lineasIva: [], retenciones: [], nomina: [], pendientesFuente: [avisoMoneda] };
  const monedaBase = normalizarCodigoMoneda(filtros.monedaBase);
  const movimientos = (movimientosContabilizados(movimientosFuente, filtros.hasta) as MovimientoFuente[]).filter((m) => m.entry_date >= filtros.desde && m.entry_date <= filtros.hasta);
  const pendientesFuente: string[] = [];
  const lineasIva: LineaIva[] = [];
  const retenciones: RetencionTributaria[] = [];
  const nomina: NominaTributaria[] = [];
  const movimientosPorDocumento = (source: string) => {
    const mapa = new Map<string, MovimientoFuente[]>();
    for (const m of movimientos) if (m.source === source && m.source_id) mapa.set(m.source_id, [...(mapa.get(m.source_id) ?? []), m]);
    return mapa;
  };
  const ventasMovimiento = movimientosPorDocumento('invoice_sales');
  const comprasMovimiento = movimientosPorDocumento('invoice_purchase');
  const ventas = await leerPorIds(db, 'invoice_sales', 'id,organization_id,branch_id,document_type,tax_included,currency,sale_id', 'id', [...ventasMovimiento.keys()], organizationId);
  const compras = await leerPorIds(db, 'invoice_purchase', 'id,organization_id,branch_id,tax_included,currency,supplier_id', 'id', [...comprasMovimiento.keys()], organizationId);
  const tercerosPorFactura = new Map<string, string | null>();
  const facturaPorId = new Map<string, Fila & { tipo: 'venta' | 'compra' }>([...ventas.map((f) => [String(f.id), { ...f, tipo: 'venta' as const }] as const), ...compras.map((f) => [String(f.id), { ...f, tipo: 'compra' as const }] as const)]);
  for (const [id, f] of facturaPorId) {
    if (f.organization_id !== organizationId || filtros.branchId !== undefined && f.branch_id !== filtros.branchId) { facturaPorId.delete(id); continue; }
    const mov = f.tipo === 'venta' ? ventasMovimiento.get(id) ?? [] : comprasMovimiento.get(id) ?? [];
    const terceros = [...new Set(mov.map((m) => m.tercero_nit).filter((v): v is string => !!v))];
    tercerosPorFactura.set(id, terceros.length === 1 ? terceros[0] : null);
    if (normalizarCodigoMoneda(texto(f.currency)) !== monedaBase) pendientesFuente.push(`Factura ${id}: moneda ${texto(f.currency) ?? 'sin verificar'}; no se mezcla el snapshot con la moneda base ${monedaBase} sin conversión histórica revisada.`);
  }
  const columnasLinea = 'id,invoice_id,invoice_type,invoice_sales_id,invoice_purchase_id,qty,unit_price,discount_amount,tax_rate,tax_code,tax_included,total_line,is_excluded,tribute_id,impuestos_linea,cost_center_id';
  const itemsVenta = await leerPorIds(db, 'invoice_items', columnasLinea, 'invoice_sales_id', ventas.map((f) => String(f.id)));
  const itemsCompra = await leerPorIds(db, 'invoice_items', columnasLinea, 'invoice_purchase_id', compras.map((f) => String(f.id)));
  const itemsLegados = await leerPorIds(db, 'invoice_items', columnasLinea, 'invoice_id', [...facturaPorId.keys()]);
  const items = new Map([...itemsVenta, ...itemsCompra, ...itemsLegados].map((i) => [String(i.id), i]));
  const facturasConLinea = new Set<string>();
  for (const item of items.values()) {
    const facturaId = String(item.invoice_sales_id ?? item.invoice_purchase_id ?? item.invoice_id);
    const factura = facturaPorId.get(facturaId);
    if (!factura || normalizarCodigoMoneda(texto(factura.currency)) !== monedaBase) continue;
    if (item.invoice_type !== (factura.tipo === 'venta' ? 'sale' : 'purchase')) continue;
    if (filtros.costCenterId && item.cost_center_id !== filtros.costCenterId) continue;
    facturasConLinea.add(facturaId);
    const mov = factura.tipo === 'venta' ? ventasMovimiento.get(facturaId) ?? [] : comprasMovimiento.get(facturaId) ?? [];
    const fecha = mov.map((m) => m.entry_date).sort()[0];
    if (!fecha) continue;
    const resultado = lineaIvaDesdeSnapshot(item, factura, factura.tipo, fecha, tercerosPorFactura.get(facturaId) ?? null);
    lineasIva.push(...resultado.lineas);
    pendientesFuente.push(...resultado.avisos);
  }
  for (const id of facturaPorId.keys()) if (!facturasConLinea.has(id)) pendientesFuente.push(`Factura ${id}: no hay líneas históricas para el alcance seleccionado; concilie el IVA contable.`);

  // POS conserva la tarifa y el importe por producto en sale_items. Solo se usa
  // si el desglose histórico identifica IVA, nunca según la cuenta de ingreso.
  const posMovimiento = movimientosPorDocumento('sales');
  const ventasFacturadas = new Set(ventas.map((f) => texto(f.sale_id)).filter((id): id is string => !!id));
  const ventasPos = await leerPorIds(db, 'sales', 'id,organization_id,branch_id,tax_breakdown', 'id', [...posMovimiento.keys()].filter((id) => !ventasFacturadas.has(id)), organizationId);
  const ventasPosOrg = new Map(ventasPos.filter((v) => v.organization_id === organizationId && (filtros.branchId === undefined || v.branch_id === filtros.branchId)).map((v) => [String(v.id), v]));
  const itemsPos = await leerPorIds(db, 'sale_items', 'id,sale_id,quantity,unit_price,total,tax_amount,tax_rate,discount_amount,tax_included', 'sale_id', [...ventasPosOrg.keys()]);
  for (const item of itemsPos) {
    const venta = ventasPosOrg.get(String(item.sale_id));
    if (!venta) continue;
    if (filtros.costCenterId) { pendientesFuente.push('Las líneas POS no guardan centro de costo; revise el IVA antes de presentar este alcance parcial.'); continue; }
    const mov = posMovimiento.get(String(venta.id)) ?? [];
    if (!mov.length || mov.some((m) => normalizarCodigoMoneda(m.currency_code) !== monedaBase)) {
      pendientesFuente.push(`Venta POS ${venta.id}: moneda histórica sin verificar o distinta de ${monedaBase}; no se utiliza el snapshot sin conversión histórica revisada.`);
      continue;
    }
    const desglose = Array.isArray(venta.tax_breakdown) ? venta.tax_breakdown.map(objeto) : [];
    const tarifa = n(item.tax_rate);
    const importe = n(item.tax_amount);
    const ivas = desglose.filter((i) => esImpuestoIva(texto(i.codigo) ?? texto(i.code), texto(i.name) ?? texto(i.nombre)) && n(i.rate ?? i.tarifa) === tarifa);
    if (tarifa === null || importe === null || tarifa > 0 && ivas.length !== 1 || importe < 0) { pendientesFuente.push(`Venta POS ${venta.id}: falta desglose histórico inequívoco del IVA por producto; no se clasifica por la cuenta 41.`); continue; }
    const cantidad = n(item.quantity);
    const precio = n(item.unit_price);
    const descuento = n(item.discount_amount);
    if (cantidad === null || precio === null || descuento === null || typeof item.tax_included !== 'boolean') { pendientesFuente.push(`Venta POS ${venta.id}: falta snapshot histórico para determinar la base.`); continue; }
    const neto = cantidad * precio - descuento;
    const base = item.tax_included ? neto - importe : neto;
    const fecha = mov.map((m) => m.entry_date).sort()[0];
    const tercero = mov.find((m) => m.tercero_nit)?.tercero_nit ?? null;
    lineasIva.push({ factura: String(venta.id), fecha, tipo: 'venta', devolucion: false, tercero, base, iva: importe, tarifa, tratamiento: tarifa === 0 ? 'sin_clasificar' : 'gravado', contabilizada: true });
  }

  const withholdings = await leerPorIds(db, 'invoice_purchase_withholdings', 'id,organization_id,invoice_id,concept,base,rate,amount,tax_code', 'invoice_id', compras.map((f) => String(f.id)), organizationId);
  const movUsados = new Set<string | number>();
  for (const w of withholdings) {
    if (w.organization_id !== organizationId) continue;
    const factura = facturaPorId.get(String(w.invoice_id));
    if (!factura || normalizarCodigoMoneda(texto(factura.currency)) !== monedaBase) continue;
    const importe = n(w.amount);
    if (importe === null) { pendientesFuente.push(`Retención ${w.id}: importe inválido.`); continue; }
    const mov = comprasMovimiento.get(String(w.invoice_id)) ?? [];
    // Usa la línea histórica real: nunca el mapeo actual de la organización.
    const candidatas = mov.filter((m) => /^(2365|2367|2368)/.test(m.account_code) && Math.abs(m.credit - m.debit - importe) < 0.02 && (!m.id || !movUsados.has(m.id)));
    const concepto = texto(w.concept) ?? 'Sin concepto';
    const exactas = candidatas.filter((m) => (m.description ?? m.descripcion ?? '').startsWith(`${concepto} - `));
    const elegibles = exactas.length ? exactas : candidatas;
    if (elegibles.length !== 1) { pendientesFuente.push(`Retención ${w.id}: no se identifica un auxiliar histórico único en el asiento; revise antes de presentar.`); continue; }
    const m = elegibles[0];
    if (m.id !== undefined) movUsados.add(m.id);
    retenciones.push({ documento: String(w.invoice_id), fecha: m.entry_date, tercero: m.tercero_nit ?? tercerosPorFactura.get(String(w.invoice_id)) ?? null, nombre: m.tercero_nombre, cuenta: m.account_code, concepto, base: n(w.base), tarifa: n(w.rate), valor: importe, contabilizada: true, autorretencion: (parametrosAnio.auxiliares_autorretencion ?? []).some((c) => m.account_code.startsWith(c)) });
  }
  // Los asientos manuales y la nómina sin snapshot también deben aparecer, con base y tarifa pendientes.
  for (const m of movimientos) if (/^(2365|2367|2368)/.test(m.account_code) && m.credit > 0 && (m.id === undefined || !movUsados.has(m.id))) {
    retenciones.push({ documento: String(m.entry_id), fecha: m.entry_date, tercero: m.tercero_nit ?? null, nombre: m.tercero_nombre, cuenta: m.account_code, concepto: m.description ?? m.descripcion ?? 'Movimiento contable sin snapshot de retención', base: null, tarifa: null, valor: m.credit - m.debit, contabilizada: true, autorretencion: (parametrosAnio.auxiliares_autorretencion ?? []).some((c) => m.account_code.startsWith(c)) });
  }

  // Los IDs de nómina salen del libro filtrado: nunca de una nómina de otro tenant.
  const nominaMovimiento = new Map<string, MovimientoFuente[]>();
  for (const m of movimientos) {
    if (m.source !== 'payroll_slips' || !m.source_id) continue;
    // El source_id del disparador es «uuid:created» o «uuid:paid».
    // El pago cancela el pasivo y no vuelve a devengar ingreso laboral.
    const reconocimiento = /^([0-9a-f-]{36}):created$/i.exec(m.source_id);
    if (!reconocimiento) continue;
    const id = reconocimiento[1];
    nominaMovimiento.set(id, [...(nominaMovimiento.get(id) ?? []), m]);
  }
  const nominas = await leerPorIds(db, 'payroll_slips', 'id,payroll_run_id,employment_id,currency_code,gross_pay,health_deduction,pension_deduction,solidarity_fund,tax_withholding,employer_health,employer_pension,employer_arl,employer_parafiscales,metadata,status', 'id', [...nominaMovimiento.keys()]);
  const runs = await leerPorIds(db, 'payroll_runs', 'id,payroll_period_id,superseded_by', 'id', [...new Set(nominas.map((f) => String(f.payroll_run_id)))]);
  const periodos = await leerPorIds(db, 'payroll_periods', 'id,organization_id', 'id', [...new Set(runs.map((f) => String(f.payroll_period_id)))], organizationId);
  const periodosOrg = new Set(periodos.filter((p) => p.organization_id === organizationId).map((p) => String(p.id)));
  const runsOrg = new Set(runs.filter((r) => periodosOrg.has(String(r.payroll_period_id)) && !r.superseded_by).map((r) => String(r.id)));
  const nominasOrg = nominas.filter((f) => runsOrg.has(String(f.payroll_run_id)));
  // El vínculo se valida por la cadena nómina→periodo→organización, sin leer cap_shareholders global.
  const empleos = await leerPorIds(db, 'employments', 'id,employment_type,contract_type,eps_code,afp_code,arl_code,metadata', 'id', [...new Set(nominasOrg.map((f) => String(f.employment_id)))]);
  const empleosMapa = new Map(empleos.map((e) => [String(e.id), e]));
  for (const f of nominasOrg) {
    const empleo = empleosMapa.get(String(f.employment_id));
    const mov = nominaMovimiento.get(String(f.id)) ?? [];
    const meta = objeto(f.metadata);
    const contrato = texto(empleo?.contract_type);
    // La naturaleza del vínculo manda: un contratista con término fijo no es empleado.
    const empleado = ['employee', 'temporary', 'part_time'].includes(texto(empleo?.employment_type) ?? '') && contrato !== 'service';
    if (!empleado) { pendientesFuente.push(`Vínculo ${f.employment_id}: confirme contrato laboral para el 220; se excluye el contratista o vínculo sin clasificación verificable.`); continue; }
    if (normalizarCodigoMoneda(texto(f.currency_code)) !== monedaBase) { pendientesFuente.push(`Nómina ${f.id}: moneda sin verificar o distinta de ${monedaBase}; requiere conversión histórica revisada.`); continue; }
    const identidades = [...new Set(mov.map((m) => m.tercero_nit).filter((v): v is string => !!v))];
    const nombres = [...new Set(mov.map((m) => m.tercero_nombre).filter((v): v is string => !!v))];
    nomina.push({ id: String(f.id), fecha: mov.map((m) => m.entry_date).sort()[0], empleadoId: String(f.employment_id), identificacion: identidades.length === 1 ? identidades[0] : null, nombre: nombres.length === 1 ? nombres[0] : null, empleado, contabilizada: true, devengado: n(f.gross_pay) ?? 0, saludEmpleado: n(f.health_deduction) ?? 0, pensionEmpleado: n(f.pension_deduction) ?? 0, solidaridad: n(f.solidarity_fund) ?? 0, retencion: n(f.tax_withholding) ?? 0, saludEmpleador: n(f.employer_health) ?? 0, pensionEmpleador: n(f.employer_pension) ?? 0, arl: n(f.employer_arl) ?? 0, parafiscales: n(f.employer_parafiscales) ?? 0, eps: texto(empleo?.eps_code), afp: texto(empleo?.afp_code), arlCodigo: texto(empleo?.arl_code), ibc: n(meta.ibc), dias: n(meta.dias_cotizados) });
  }
  return { lineasIva, retenciones, nomina, pendientesFuente: [...new Set(pendientesFuente)] };
}
