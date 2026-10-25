import type { DocumentoInforme, TablaInforme } from '@/components/finanzas/contabilidad/informes/catalogo';
import { movimientosContabilizados, generarEstados, type EntradaEstados, type MovimientoInforme } from './estados';
import { z } from 'zod';
import { IDS_BORRADORES_TRIBUTARIOS, INFORMES_CONTABLES } from '@/components/finanzas/contabilidad/informes/catalogo';
import { avisoMonedaTributaria } from './monedaTributaria';

/** Datos históricos, ya aislados por organización y enlazados a asientos contabilizados. */
export interface MovimientoTributario extends MovimientoInforme {
  /** Moneda histórica original de la línea/documento; los importes del movimiento ya están en base. */
  currency_code?: string | null;
  source_id?: string | null;
  tercero_nit?: string | null;
  tercero_nombre?: string | null;
  concepto_exogena?: string | null;
}

export interface LineaIva {
  factura: string;
  fecha: string;
  tipo: 'venta' | 'compra';
  devolucion: boolean;
  tercero: string | null;
  base: number;
  iva: number;
  /** La tarifa se toma del snapshot de esta línea, nunca de la cuenta 41 ni del producto actual. */
  tarifa: number | null;
  tratamiento: 'gravado' | 'exento' | 'excluido' | 'sin_clasificar';
  contabilizada: boolean;
}

export interface RetencionTributaria {
  documento: string;
  fecha: string;
  tercero: string | null;
  nombre?: string | null;
  cuenta: string;
  concepto: string;
  base: number | null;
  tarifa: number | null;
  valor: number;
  contabilizada: boolean;
  autorretencion?: boolean;
}

export interface NominaTributaria {
  id: string;
  fecha: string;
  empleadoId: string;
  identificacion: string | null;
  nombre: string | null;
  /** Solo empleados con vínculo laboral. Contratistas no pueden generar un 220. */
  empleado: boolean;
  contabilizada: boolean;
  devengado: number;
  saludEmpleado: number;
  pensionEmpleado: number;
  solidaridad: number;
  retencion: number;
  saludEmpleador: number;
  pensionEmpleador: number;
  arl: number;
  parafiscales: number;
  eps?: string | null;
  afp?: string | null;
  arlCodigo?: string | null;
  ibc?: number | null;
  dias?: number | null;
}

export interface ActividadIca {
  codigo: string;
  tarifa_por_mil: number | null;
  cuentas: string[];
  exclusiones?: string[];
}
export interface MunicipioIca {
  codigo: string;
  nombre: string;
  /** La asignación municipal debe persistirse por cuenta/auxiliar; nunca se reparte por proporción. */
  actividades: ActividadIca[];
  cuentas_anticipo?: string[];
}
export interface AccionistaRegistrado {
  identificacion: string;
  nombre: string;
  acciones: number;
  valor_nominal: number;
  fecha_inscripcion: string;
}
export interface ParametrosAnioTributario {
  periodicidad_iva?: 'bimestral' | 'cuatrimestral';
  responsable_iva?: boolean;
  /** Pesos definidos por el contador para el año; ausencia ≠ cero. */
  topes_exogena?: Record<string, number>;
  municipios_ica?: MunicipioIca[];
  auxiliares_reteiva_recibida?: string[];
  auxiliares_reteica_recibida?: string[];
  auxiliares_autorretencion?: string[];
  saldos_fiscales?: Record<string, number>;
  formato_conciliacion?: '2516' | '2517';
  informe_gestion?: string;
  accionistas?: AccionistaRegistrado[];
}
export interface ParametrosTributarios { anios?: Record<string, ParametrosAnioTributario> }
export interface EntradaTributarios {
  organizationId: number;
  monedaBase: string | null;
  desde: string;
  hasta: string;
  movimientos: MovimientoTributario[];
  lineasIva: LineaIva[];
  retenciones: RetencionTributaria[];
  nomina: NominaTributaria[];
  parametros: ParametrosTributarios;
  estados?: EntradaEstados;
  pendientesFuente?: string[];
}

const cuentaFiscal = z.string().regex(/^\d{1,30}$/);
const auxiliaresAnticipo = z.array(z.string().regex(/^1355\d+$/)).max(200);
const parametrosAnio = z.object({
  periodicidad_iva: z.enum(['bimestral', 'cuatrimestral']).optional(),
  responsable_iva: z.boolean().optional(),
  topes_exogena: z.record(z.number().finite().nonnegative()).optional(),
  municipios_ica: z.array(z.object({
    codigo: z.string().min(1).max(30), nombre: z.string().min(1).max(120),
    actividades: z.array(z.object({ codigo: z.string().min(1).max(30), tarifa_por_mil: z.number().finite().min(0).max(1000).nullable(), cuentas: z.array(cuentaFiscal).max(1000), exclusiones: z.array(cuentaFiscal).max(1000).optional() })).max(100),
    cuentas_anticipo: auxiliaresAnticipo.optional(),
  })).max(100).optional(),
  auxiliares_reteiva_recibida: auxiliaresAnticipo.optional(),
  auxiliares_reteica_recibida: auxiliaresAnticipo.optional(),
  auxiliares_autorretencion: z.array(z.string().regex(/^2365\d+$/)).max(200).optional(),
  saldos_fiscales: z.record(z.number().finite()).optional(),
  formato_conciliacion: z.enum(['2516', '2517']).optional(),
  informe_gestion: z.string().max(100000).optional(),
  accionistas: z.array(z.object({ identificacion: z.string().min(1).max(80), nombre: z.string().min(1).max(200), acciones: z.number().finite().nonnegative(), valor_nominal: z.number().finite().nonnegative(), fecha_inscripcion: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) })).max(10000).optional(),
}).strip();

/** JSON configurable por organización; no se permite que un valor inválido produzca NaN en un borrador. */
export function leerParametrosTributarios(crudo: unknown): { parametros: ParametrosTributarios; avisos: string[] } {
  const esquema = z.object({ anios: z.record(parametrosAnio).optional() }).strip();
  const resultado = esquema.safeParse(crudo ?? {});
  return resultado.success ? { parametros: resultado.data, avisos: [] } : {
    parametros: {},
    avisos: ['Los parámetros tributarios guardados contienen valores inválidos; corríjalos antes de usar los borradores.'],
  };
}

const columnasConcepto: TablaInforme['columnas'] = [{ clave: 'concepto', titulo: 'Concepto' }, { clave: 'valor', titulo: 'Valor', formato: 'pesos' }];
const columnasIva: TablaInforme['columnas'] = [
  { clave: 'tipo', titulo: 'Operación' }, { clave: 'tratamiento', titulo: 'Tratamiento' },
  { clave: 'tarifa', titulo: 'Tarifa %', formato: 'numero' }, { clave: 'base', titulo: 'Base neta', formato: 'pesos' },
  { clave: 'iva', titulo: 'IVA neto', formato: 'pesos' }, { clave: 'devoluciones', titulo: 'IVA devoluciones', formato: 'pesos' },
];
const columnasRetencion: TablaInforme['columnas'] = [
  { clave: 'tercero', titulo: 'Identificación' }, { clave: 'nombre', titulo: 'Nombre' },
  { clave: 'cuenta', titulo: 'Auxiliar' }, { clave: 'concepto', titulo: 'Concepto' },
  { clave: 'base', titulo: 'Base', formato: 'pesos' }, { clave: 'tarifa', titulo: 'Tarifa %', formato: 'numero' },
  { clave: 'valor', titulo: 'Retenido', formato: 'pesos' },
];
const textoBorrador = 'Borrador precalculado. El contador debe revisar las fuentes, los parámetros del año y las diferencias antes de presentarlo.';
const esFinito = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n);
const valor = (n: number) => Math.abs(n) < 0.000001 ? 0 : n;
const pertenece = (cuenta: string, prefijos: readonly string[]) => prefijos.some((p) => /^\d+$/.test(p) && cuenta.startsWith(p));
const suma = <T>(filas: T[], obtener: (f: T) => number) => valor(filas.reduce((ac, f) => ac + obtener(f), 0));

function documento(titulo: string, tablas: TablaInforme[], avisos: string[] = [], textos: string[] = []): DocumentoInforme {
  return { titulo, textos: [textoBorrador, ...textos], tablas, avisos: [...new Set(avisos)] };
}

/** Una cuenta 1355 puede contener anticipos distintos. Se exige auxiliar explícito. */
function anticipo(movimientos: MovimientoTributario[], auxiliares: string[] | undefined): number | null {
  if (!auxiliares?.length || auxiliares.some((c) => !c.startsWith('1355') || c.length <= 4)) return null;
  return suma(movimientos.filter((m) => pertenece(m.account_code, auxiliares)), (m) => m.debit - m.credit);
}

function filasRetenciones(filas: RetencionTributaria[]) {
  const grupos = new Map<string, { tercero: string; nombre: string; cuenta: string; concepto: string; base: number | null; tarifa: number | null; valor: number }>();
  for (const f of filas) {
    const clave = JSON.stringify([f.tercero, f.cuenta, f.concepto, f.tarifa, f.autorretencion]);
    const grupo = grupos.get(clave) ?? { tercero: f.tercero ?? 'Sin identificar', nombre: f.nombre ?? '', cuenta: f.cuenta, concepto: `${f.autorretencion ? 'Autorretención · ' : ''}${f.concepto}`, base: 0, tarifa: f.tarifa, valor: 0 };
    grupo.base = grupo.base === null || f.base === null ? null : grupo.base + f.base;
    grupo.valor += f.valor;
    grupos.set(clave, grupo);
  }
  return [...grupos.values()].sort((a, b) => `${a.tercero}:${a.cuenta}:${a.concepto}`.localeCompare(`${b.tercero}:${b.cuenta}:${b.concepto}`));
}

function documentoIva(input: EntradaTributarios, cfg: ParametrosAnioTributario, movimientos: MovimientoTributario[], lineas: LineaIva[]) {
  const avisos: string[] = [];
  if (!cfg.periodicidad_iva) avisos.push('Configure la periodicidad bimestral o cuatrimestral para este año.');
  if (cfg.responsable_iva === undefined) avisos.push('Confirme si la organización es responsable de IVA para este año.');
  const grupos = new Map<string, { tipo: string; tratamiento: string; tarifa: number | null; base: number; iva: number; devoluciones: number }>();
  for (const l of lineas) {
    const signo = l.devolucion ? -1 : 1;
    const clave = `${l.tipo}:${l.tratamiento}:${l.tarifa}`;
    const f = grupos.get(clave) ?? { tipo: l.tipo, tratamiento: l.tratamiento, tarifa: l.tarifa, base: 0, iva: 0, devoluciones: 0 };
    f.base += signo * l.base;
    f.iva += signo * l.iva;
    if (l.devolucion) f.devoluciones += l.iva;
    grupos.set(clave, f);
    if (l.tratamiento === 'sin_clasificar') avisos.push(`Factura ${l.factura}: tarifa cero sin distinción histórica entre exento y excluido; revise la clasificación.`);
  }
  const generado = suma(lineas.filter((l) => l.tipo === 'venta'), (l) => (l.devolucion ? -1 : 1) * l.iva);
  const descontable = suma(lineas.filter((l) => l.tipo === 'compra'), (l) => (l.devolucion ? -1 : 1) * l.iva);
  const contableGenerado = suma(movimientos.filter((m) => m.account_code.startsWith('240805')), (m) => m.credit - m.debit);
  const contableDescontable = suma(movimientos.filter((m) => m.account_code.startsWith('240810')), (m) => m.debit - m.credit);
  const recibido = anticipo(movimientos, cfg.auxiliares_reteiva_recibida);
  if (recibido === null) avisos.push('Configure los auxiliares 1355 de reteIVA que le practicaron; no se toma el total de 1355.');
  if (Math.abs(generado - contableGenerado) > 0.01 || Math.abs(descontable - contableDescontable) > 0.01) avisos.push('El IVA por línea no coincide con 240805/240810. La diferencia queda visible para conciliar.');
  if (cfg.periodicidad_iva) {
    const meses = cfg.periodicidad_iva === 'bimestral' ? 2 : 4;
    const mesInicio = Number(input.desde.slice(5, 7));
    const mesFin = Number(input.hasta.slice(5, 7));
    const ultimoDia = new Date(Date.UTC(Number(input.hasta.slice(0, 4)), mesFin, 0)).getUTCDate();
    if ((mesInicio - 1) % meses !== 0 || mesFin - mesInicio !== meses - 1 || input.desde.slice(8) !== '01' || Number(input.hasta.slice(8)) !== ultimoDia) avisos.push(`El rango no corresponde a un periodo ${cfg.periodicidad_iva} completo.`);
  }
  return documento('Formulario 300 · Borrador de IVA', [
    { titulo: 'Bases por tarifa histórica del producto en la factura', columnas: columnasIva, filas: [...grupos.values()] },
    { titulo: 'Liquidación preliminar y conciliación', columnas: columnasConcepto, filas: [
      { concepto: 'IVA generado neto de devoluciones', valor: generado },
      { concepto: 'IVA descontable neto de devoluciones', valor: descontable },
      { concepto: 'ReteIVA que le practicaron · auxiliares 1355', valor: recibido },
      { concepto: 'Saldo preliminar (sin saldos anteriores, sanciones ni ajustes)', valor: recibido === null ? null : generado - descontable - recibido },
      { concepto: 'Movimiento neto 240805', valor: contableGenerado },
      { concepto: 'Diferencia generado vs 240805', valor: generado - contableGenerado },
      { concepto: 'Movimiento neto 240810', valor: contableDescontable },
      { concepto: 'Diferencia descontable vs 240810', valor: descontable - contableDescontable },
    ] },
  ], avisos, [`Periodo ${cfg.periodicidad_iva ?? 'sin configurar'}: ${input.desde} a ${input.hasta}.`]);
}

function documentosRetenciones(movimientos: MovimientoTributario[], retenciones: RetencionTributaria[], cfg: ParametrosAnioTributario) {
  const avisos: string[] = [];
  const principales = retenciones.filter((r) => pertenece(r.cuenta, ['2365', '2367']));
  const reteica = retenciones.filter((r) => r.cuenta.startsWith('2368'));
  for (const r of retenciones) if (!r.tercero || r.base === null || r.tarifa === null) avisos.push(`Documento ${r.documento}: falta tercero, base o tarifa de la retención; no se estima a partir del importe.`);
  const diferencias = ['2365', '2367', '2368'].map((cuenta) => {
    const detalle = suma(retenciones.filter((r) => r.cuenta.startsWith(cuenta)), (r) => r.valor);
    const contable = suma(movimientos.filter((m) => m.account_code.startsWith(cuenta)), (m) => m.credit);
    if (Math.abs(detalle - contable) > 0.01) avisos.push(`El detalle de ${cuenta} difiere del movimiento contable en ${valor(contable - detalle)} pesos; revise retenciones manuales, nómina y reversión.`);
    return { concepto: `${cuenta}: créditos causados menos detalle`, valor: contable - detalle };
  });
  const autorretenciones = principales.filter((r) => r.autorretencion);
  const auxiliares = cfg.auxiliares_autorretencion ?? [];
  if (autorretenciones.some((r) => !pertenece(r.cuenta, auxiliares))) avisos.push('Hay autorretenciones sin auxiliar propio configurado; revise la separación dentro de 2365.');
  return {
    'formulario-350': documento('Formulario 350 · Borrador de retenciones', [
      { titulo: 'Renta 2365 e IVA retenido 2367 por concepto, base y tarifa', columnas: columnasRetencion, filas: filasRetenciones(principales) },
      { titulo: 'Conciliación con el libro', columnas: columnasConcepto, filas: diferencias.filter((f) => !f.concepto.startsWith('2368')) },
    ], avisos, ['El reteICA practicado en 2368 se declara por separado.']),
    reteica: documento('ReteICA practicado · Declaración separada', [
      { titulo: 'Retenciones municipales practicadas · 2368', columnas: columnasRetencion, filas: filasRetenciones(reteica) },
      { titulo: 'Conciliación con el libro', columnas: columnasConcepto, filas: diferencias.filter((f) => f.concepto.startsWith('2368')) },
    ], [...avisos, 'Revise el municipio y la periodicidad de cada retención antes de preparar la declaración municipal.']),
  };
}

function documentoIca(movimientos: MovimientoTributario[], cfg: ParametrosAnioTributario) {
  const avisos: string[] = [];
  const municipios = cfg.municipios_ica ?? [];
  if (!municipios.length) avisos.push('Configure municipio, actividades, auxiliares de ingreso y tarifas por mil del año.');
  const filas: Record<string, string | number | null>[] = [];
  const asignadas = new Set<MovimientoTributario>();
  for (const municipio of municipios) for (const actividad of municipio.actividades) {
    const ingresos = movimientos.filter((m) => m.account_code.startsWith('41') && pertenece(m.account_code, actividad.cuentas));
    for (const m of ingresos) {
      if (asignadas.has(m)) avisos.push(`Auxiliar ${m.account_code}: está asignado a más de una actividad o municipio. Corrija la configuración antes de liquidar ICA.`);
      asignadas.add(m);
    }
    const excluidas = ingresos.filter((m) => pertenece(m.account_code, actividad.exclusiones ?? []));
    const ingreso = suma(ingresos, (m) => m.credit - m.debit);
    const exclusiones = suma(excluidas, (m) => m.credit - m.debit);
    const base = ingreso - exclusiones;
    filas.push({ municipio: `${municipio.codigo} · ${municipio.nombre}`, actividad: actividad.codigo, ingreso, exclusiones, base, tarifa: actividad.tarifa_por_mil, impuesto: esFinito(actividad.tarifa_por_mil) && actividad.tarifa_por_mil >= 0 ? base * actividad.tarifa_por_mil / 1000 : null, anticipo: anticipo(movimientos, municipio.cuentas_anticipo) });
  }
  const sinAsignar = movimientos.filter((m) => m.account_code.startsWith('41') && !asignadas.has(m));
  if (sinAsignar.length) avisos.push(`${new Set(sinAsignar.map((m) => m.account_code)).size} auxiliares de ingreso no tienen actividad/municipio de ICA; no se incluyen en la liquidación.`);
  return documento('ICA municipal · Borrador', [
    { titulo: 'Base por actividad y municipio', columnas: [
      { clave: 'municipio', titulo: 'Municipio' }, { clave: 'actividad', titulo: 'Actividad' },
      { clave: 'ingreso', titulo: 'Ingreso 41 neto', formato: 'pesos' }, { clave: 'exclusiones', titulo: 'Exclusiones', formato: 'pesos' },
      { clave: 'base', titulo: 'Base', formato: 'pesos' }, { clave: 'tarifa', titulo: 'Tarifa ‰', formato: 'numero' },
      { clave: 'impuesto', titulo: 'Impuesto calculado', formato: 'pesos' }, { clave: 'anticipo', titulo: 'Anticipos 1355 del municipio', formato: 'pesos' },
    ], filas },
    { titulo: 'Control contable', columnas: columnasConcepto, filas: [
      { concepto: 'Impuesto municipal registrado · 2412', valor: suma(movimientos.filter((m) => m.account_code.startsWith('2412')), (m) => m.credit - m.debit) },
      { concepto: 'Ingresos 41 sin asignar', valor: suma(sinAsignar, (m) => m.credit - m.debit) },
      { concepto: 'ReteICA que le practicaron · auxiliares 1355 configurados', valor: anticipo(movimientos, cfg.auxiliares_reteica_recibida) },
    ] },
  ], avisos, ['Medellín corresponde a su Secretaría de Hacienda; cada municipio conserva sus actividades, exclusiones y tarifas configuradas. El reteICA practicado en 2368 tiene declaración independiente.']);
}

function documentoExogena(input: EntradaTributarios, cfg: ParametrosAnioTributario, movimientos: MovimientoTributario[], historico: MovimientoTributario[], lineas: LineaIva[], retenciones: RetencionTributaria[]) {
  const avisos: string[] = [];
  const formatos = ['1001', '1007', '1008', '1009', ...(cfg.responsable_iva === true ? ['1005', '1006'] : [])];
  if (cfg.responsable_iva === undefined) avisos.push('Confirme responsabilidad de IVA para incluir o excluir los formatos 1005/1006.');
  if (input.desde !== `${input.hasta.slice(0, 4)}-01-01` || input.hasta.slice(5) !== '12-31') avisos.push('Exógena requiere el año completo y saldos al 31 de diciembre; el rango actual es una vista parcial.');
  const tablas: TablaInforme[] = [];
  for (const formato of formatos) {
    const tope = cfg.topes_exogena?.[formato];
    const configurado = esFinito(tope) && tope >= 0;
    if (!configurado) avisos.push(`Formato ${formato}: configure el tope del año; se muestran todos como pendientes de evaluación, sin excluir terceros.`);
    const grupos = new Map<string, { tercero: string; concepto: string; cuenta: string; valor: number; retencionRenta: number; retencionIva: number }>();
    const agregar = (tercero: string | null | undefined, concepto: string | null | undefined, cuenta: string, importe: number) => {
      const clave = JSON.stringify([tercero, concepto, cuenta]);
      const g = grupos.get(clave) ?? { tercero: tercero || 'Sin identificar', concepto: concepto || 'Pendiente de concepto', cuenta, valor: 0, retencionRenta: 0, retencionIva: 0 };
      g.valor += importe;
      grupos.set(clave, g);
    };
    if (formato === '1005' || formato === '1006') {
      for (const l of lineas.filter((l) => l.tipo === (formato === '1005' ? 'compra' : 'venta'))) agregar(l.tercero, 'IVA', formato === '1005' ? '240810' : '240805', (l.devolucion ? -1 : 1) * l.iva);
    } else {
      const saldos = formato === '1008' || formato === '1009';
      const fuente = saldos ? historico : movimientos;
      for (const m of fuente) {
        const incluir = formato === '1001' ? /^[567]/.test(m.account_code) || pertenece(m.account_code, ['12', '15', '16', '18'])
          : formato === '1007' ? /^(41|42)/.test(m.account_code)
            : formato === '1008' ? m.account_code.startsWith('13') : pertenece(m.account_code, ['22', '23', '2380']);
        if (!incluir) continue;
        // 1001 es base de pagos/adquisiciones: solo movimientos débito; saldos de activos no son compras.
        const importe = formato === '1001' ? m.debit : formato === '1007' || formato === '1009' ? m.credit - m.debit : m.debit - m.credit;
        if (importe) agregar(m.tercero_nit, m.concepto_exogena, m.account_code, importe);
      }
      if (formato === '1001') {
        // Una sola fila de retenciones por tercero: evita duplicar el retenido al tener varias cuentas de gasto.
        for (const r of retenciones.filter((r) => pertenece(r.cuenta, ['2365', '2367']))) {
          const clave = JSON.stringify([r.tercero, r.concepto, r.cuenta]);
          const g = grupos.get(clave) ?? { tercero: r.tercero || 'Sin identificar', concepto: r.concepto, cuenta: r.cuenta, valor: 0, retencionRenta: 0, retencionIva: 0 };
          if (r.cuenta.startsWith('2365')) g.retencionRenta += r.valor;
          else g.retencionIva += r.valor;
          grupos.set(clave, g);
        }
      }
    }
    const totalesTercero = new Map<string, number>();
    for (const g of grupos.values()) totalesTercero.set(g.tercero, (totalesTercero.get(g.tercero) ?? 0) + g.valor);
    const filas = [...grupos.values()].filter((g) => Math.abs(g.valor) > 0.005 || g.retencionRenta !== 0 || g.retencionIva !== 0).map((g) => ({ ...g, tope: configurado ? tope : null, supera: configurado ? Math.abs(totalesTercero.get(g.tercero) ?? 0) >= tope ? 'Sí' : 'No' : 'Pendiente' }));
    if (filas.some((f) => f.tercero === 'Sin identificar')) avisos.push(`Formato ${formato}: hay movimientos sin identificación del tercero.`);
    if (filas.some((f) => f.concepto === 'Pendiente de concepto')) avisos.push(`Formato ${formato}: configure concepto_exogena en las cuentas; el borrador no inventa conceptos DIAN.`);
    tablas.push({ titulo: `Formato ${formato}`, columnas: [
      { clave: 'tercero', titulo: 'Identificación' }, { clave: 'concepto', titulo: 'Concepto' }, { clave: 'cuenta', titulo: 'Cuenta' },
      { clave: 'valor', titulo: formato === '1008' || formato === '1009' ? 'Saldo al corte' : 'Base / importe', formato: 'pesos' },
      { clave: 'retencionRenta', titulo: 'Retención renta', formato: 'pesos' }, { clave: 'retencionIva', titulo: 'Retención IVA', formato: 'pesos' },
      { clave: 'tope', titulo: 'Tope del año', formato: 'pesos' }, { clave: 'supera', titulo: 'Supera tope por tercero' },
    ], filas });
  }
  return documento('Información exógena · Borradores por formato', tablas, avisos, ['Revise conceptos, identificación, deducibilidad y topes de la resolución vigente. Los movimientos débito 5/6/7 y adquisiciones de activos son una base preliminar del formato 1001; requieren depurar reclasificaciones y operaciones no reportables.']);
}

function documentosNomina(nomina: NominaTributaria[]) {
  const empleados = nomina.filter((n) => n.empleado && n.contabilizada);
  const grupos = new Map<string, { tercero: string; nombre: string; devengado: number; salud: number; pension: number; solidaridad: number; retencion: number }>();
  const avisos: string[] = [];
  for (const n of empleados) {
    const g = grupos.get(n.empleadoId) ?? { tercero: n.identificacion ?? 'Sin identificar', nombre: n.nombre ?? n.empleadoId, devengado: 0, salud: 0, pension: 0, solidaridad: 0, retencion: 0 };
    g.devengado += n.devengado; g.salud += n.saludEmpleado; g.pension += n.pensionEmpleado; g.solidaridad += n.solidaridad; g.retencion += n.retencion;
    grupos.set(n.empleadoId, g);
    if (!n.identificacion) avisos.push(`Empleado ${n.empleadoId}: complete la identificación antes de expedir el 220.`);
  }
  const pila = empleados.map((n) => ({ tercero: n.identificacion ?? 'Sin identificar', nombre: n.nombre ?? n.empleadoId, fecha: n.fecha, ibc: n.ibc ?? null, dias: n.dias ?? null, eps: n.eps ?? null, afp: n.afp ?? null, arlCodigo: n.arlCodigo ?? null, salud: n.saludEmpleado + n.saludEmpleador, pension: n.pensionEmpleado + n.pensionEmpleador, solidaridad: n.solidaridad, arl: n.arl, parafiscales: n.parafiscales }));
  return {
    'certificado-220': documento('Certificado 220 · Borrador de ingresos y retenciones de empleados', [
      { titulo: 'Consolidado de nómina contabilizada por empleado', columnas: [
        { clave: 'tercero', titulo: 'Identificación' }, { clave: 'nombre', titulo: 'Empleado' },
        { clave: 'devengado', titulo: 'Devengado', formato: 'pesos' }, { clave: 'salud', titulo: 'Aportes salud', formato: 'pesos' },
        { clave: 'pension', titulo: 'Aportes pensión', formato: 'pesos' }, { clave: 'solidaridad', titulo: 'Solidaridad', formato: 'pesos' },
        { clave: 'retencion', titulo: 'Retención salarios', formato: 'pesos' },
      ], filas: [...grupos.values()] },
    ], avisos, ['Solo vínculos laborales: los proveedores y contratistas tienen su certificado de retenciones separado. El contador debe distribuir los conceptos del 220 vigente y conciliar con 5105, 5205 y el auxiliar de retención salarial de 2365.']),
    pila: documento('PILA · Borrador de aportes de nómina', [
      { titulo: 'Aportes calculados en la nómina contabilizada', columnas: [
        { clave: 'tercero', titulo: 'Identificación' }, { clave: 'nombre', titulo: 'Empleado' }, { clave: 'fecha', titulo: 'Periodo' },
        { clave: 'ibc', titulo: 'IBC persistido', formato: 'pesos' }, { clave: 'dias', titulo: 'Días cotizados', formato: 'numero' },
        { clave: 'eps', titulo: 'EPS' }, { clave: 'afp', titulo: 'AFP' }, { clave: 'arlCodigo', titulo: 'ARL' },
        { clave: 'salud', titulo: 'Salud total', formato: 'pesos' }, { clave: 'pension', titulo: 'Pensión total', formato: 'pesos' },
        { clave: 'solidaridad', titulo: 'Solidaridad', formato: 'pesos' }, { clave: 'arl', titulo: 'ARL', formato: 'pesos' },
        { clave: 'parafiscales', titulo: 'Parafiscales', formato: 'pesos' },
      ], filas: pila },
    ], [...avisos, 'Antes de generar el archivo del operador: complete IBC, días, tipos/subtipos de cotizante, novedades y distribución de parafiscales. El salario no reemplaza el IBC.', ...(pila.some((n) => n.ibc === null || n.dias === null || !n.eps || !n.afp || !n.arlCodigo) ? ['Hay empleados sin IBC, días o administradoras; el borrador no está listo para presentación.'] : [])]),
  };
}

function documentosGestion(input: EntradaTributarios, cfg: ParametrosAnioTributario, historico: MovimientoTributario[]) {
  const saldos = new Map<string, number>();
  for (const m of historico) saldos.set(m.account_code, (saldos.get(m.account_code) ?? 0) + m.debit - m.credit);
  const filas = [...saldos.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([cuenta, contable]) => ({ cuenta, contable, fiscal: cfg.saldos_fiscales?.[cuenta] ?? null, diferencia: cfg.saldos_fiscales?.[cuenta] === undefined ? null : cfg.saldos_fiscales[cuenta] - contable }));
  const pendientes = filas.filter((f) => f.fiscal === null).length;
  const estados = input.estados ? generarEstados(input.estados).actual : null;
  return {
    'conciliacion-fiscal': documento(`Conciliación fiscal ${cfg.formato_conciliacion ?? '2516/2517'} · Borrador`, [
      { titulo: 'Base contable y fiscal por cuenta (convención débito positivo)', columnas: [
        { clave: 'cuenta', titulo: 'Cuenta' }, { clave: 'contable', titulo: 'Saldo contable', formato: 'pesos' },
        { clave: 'fiscal', titulo: 'Saldo fiscal revisado', formato: 'pesos' }, { clave: 'diferencia', titulo: 'Fiscal − contable', formato: 'pesos' },
      ], filas },
    ], [!cfg.formato_conciliacion ? 'Seleccione 2516 o 2517 según la obligación de la entidad y el año.' : '', pendientes ? `${pendientes} cuentas no tienen saldo fiscal revisado. No se presume que el saldo fiscal sea igual al contable.` : '', 'Falta distribuir las diferencias temporarias y permanentes en las casillas del formato vigente; esta base no es un archivo DIAN.'].filter(Boolean)),
    'informe-gestion': documento('Informe de gestión · Borrador para revisión', estados ? [{ titulo: 'Cifras contables de apoyo', columnas: columnasConcepto, filas: [
      { concepto: 'Ingresos', valor: estados.ingresos }, { concepto: 'Utilidad neta', valor: estados.utilidadNeta },
      { concepto: 'Activos al corte', valor: estados.activo }, { concepto: 'Pasivos al corte', valor: estados.pasivo }, { concepto: 'Patrimonio al corte', valor: estados.patrimonio },
    ] }] : [], [!cfg.informe_gestion ? 'Complete la narración de gestión, hechos posteriores, operaciones con vinculados, evolución previsible y cumplimiento legal antes de presentar.' : 'La narración guardada debe ser revisada y aprobada por los administradores.'], cfg.informe_gestion ? [cfg.informe_gestion] : []),
    'registro-accionistas': documento('Registro de accionistas · Borrador', [{
      titulo: 'Inscripciones suministradas por la organización', columnas: [
        { clave: 'identificacion', titulo: 'Identificación' }, { clave: 'nombre', titulo: 'Accionista' },
        { clave: 'fecha_inscripcion', titulo: 'Inscripción' }, { clave: 'acciones', titulo: 'Acciones', formato: 'numero' },
        { clave: 'valor_nominal', titulo: 'Valor nominal', formato: 'pesos' }, { clave: 'capital', titulo: 'Capital nominal', formato: 'pesos' },
      ], filas: (cfg.accionistas ?? []).map((a) => ({ ...a, capital: a.acciones * a.valor_nominal })),
    }], [!(cfg.accionistas?.length) ? 'No hay inscripciones de accionistas de esta organización. El libro contable no permite inferir titulares ni acciones.' : 'Revise títulos, endosos, gravámenes, transferencias y actas. Los datos guardados son inscripciones de apoyo y requieren validación jurídica.']),
  };
}

/** Borradores siempre revisables; ninguna llamada presenta impuestos ni expide certificados. */
export function generarBorradoresTributarios(input: EntradaTributarios): Record<string, DocumentoInforme> {
  const avisoMoneda = avisoMonedaTributaria(input.monedaBase);
  if (avisoMoneda) return Object.fromEntries(IDS_BORRADORES_TRIBUTARIOS.map((id) => [id,
    documento(INFORMES_CONTABLES.find((informe) => informe.id === id)!.titulo, [], [avisoMoneda, ...(input.pendientesFuente ?? [])]),
  ]));
  const cfg = input.parametros.anios?.[input.hasta.slice(0, 4)] ?? {};
  const historico = (movimientosContabilizados(input.movimientos, input.hasta) as MovimientoTributario[])
    .filter((m) => m.entry_date <= input.hasta);
  const movimientos = historico.filter((m) => m.entry_date >= input.desde && m.source !== 'cierre_ejercicio' && m.source !== 'cierre_periodo');
  const lineas = input.lineasIva.filter((l) => l.contabilizada && l.fecha >= input.desde && l.fecha <= input.hasta);
  const retenciones = input.retenciones.filter((r) => r.contabilizada && r.fecha >= input.desde && r.fecha <= input.hasta);
  const nomina = input.nomina.filter((n) => n.contabilizada && n.fecha >= input.desde && n.fecha <= input.hasta);
  const documentos = {
    'formulario-300': documentoIva(input, cfg, movimientos, lineas),
    ...documentosRetenciones(movimientos, retenciones, cfg),
    'ica-municipal': documentoIca(movimientos, cfg),
    exogena: documentoExogena(input, cfg, movimientos, historico, lineas, retenciones),
    ...documentosNomina(nomina),
    ...documentosGestion(input, cfg, historico),
  };
  for (const doc of Object.values(documentos)) {
    doc.avisos = [...new Set([...(doc.avisos ?? []), ...(input.pendientesFuente ?? [])])];
    if (input.desde.slice(0, 4) !== input.hasta.slice(0, 4)) doc.avisos.push('El rango cruza años; divida el borrador para aplicar los parámetros de cada año.');
  }
  return documentos;
}
