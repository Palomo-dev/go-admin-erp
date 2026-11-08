/**
 * Perfil tributario de la empresa por vigencia (Finanzas R4-A, Figma 2335:136222).
 * Tablas `organization_tax_profiles` y `organization_tax_profile_ica`
 * (migración 20261108100000, aplicada) con renta e IVA separados y calidades con
 * soporte (P5/P8, migración 20261108160500); escritura solo por
 * `fn_perfil_tributario_guardar_v2`. Aquí: tipos, validación de FORMA de la
 * solicitud (lista blanca), lectura de filas y qué le falta al perfil. Las
 * combinaciones contradictorias se deciden en `combinaciones.ts`. Sin React ni Supabase.
 */
import { esDiaValido } from './periodos';
import {
  ACTIVIDADES_INC,
  CONDICIONES_IVA,
  ESTADOS_CAMBIO_PERIODICIDAD,
  MOTIVOS_CAMBIO_PERIODICIDAD,
  REGIMENES_RENTA,
  TIPOS_RTE,
  desdeRegimenCombinado,
  type ActividadInc,
  type CondicionIva,
  type DatosCombinacion,
  type EstadoCambioPeriodicidad,
  type MotivoCambioPeriodicidad,
  type RegimenRenta,
  type TipoRte,
} from './combinaciones';

export const PERIODICIDADES_IVA = ['bimestral', 'cuatrimestral', 'anual', 'no_aplica'] as const;
export type PeriodicidadIva = (typeof PERIODICIDADES_IVA)[number];

export const PERIODICIDADES_ICA = ['mensual', 'bimestral', 'cuatrimestral', 'semestral', 'anual'] as const;
export type PeriodicidadIca = (typeof PERIODICIDADES_ICA)[number];

/** Códigos del DOCUMENTO ELECTRÓNICO (`dian_fiscal_responsibilities`) con significado propio en el perfil. */
export const RESPONSABILIDAD = {
  granContribuyente: 'O-13',
  autorretenedor: 'O-15',
  agenteRetencionIva: 'O-23',
  simple: 'O-47',
  responsableIva: 'O-48',
  noResponsableIva: 'O-49',
  noAplica: 'R-99-PN',
} as const;

export interface IcaMunicipio {
  municipioId: string;
  municipio: string | null;
  departamento: string | null;
  periodicidad: PeriodicidadIca;
  tarifaPorMil: number | null;
  actividad: string | null;
}

/** Campos de la vigencia que se evalúan en `evaluarCombinacion` (y se guardan tal cual). */
export type CamposPerfil = Omit<DatosCombinacion, 'periodicidadIva' | 'responsabilidades' | 'responsabilidadesRut'> & {
  periodicidadIva: PeriodicidadIva;
  responsabilidades: string[];
  responsabilidadesRut: string[];
};

export interface VigenciaPerfil extends CamposPerfil {
  id: string;
  vigenteDesde: string;
  vigenteHasta: string | null;
  cambioPeriodicidadEstado: EstadoCambioPeriodicidad;
  advertenciasAceptadas: string[];
  /** Vigencia migrada del campo combinado viejo o con datos sin definir: alguien debe confirmarla. */
  requiereRevision: boolean;
  /** El campo combinado viejo tal como estaba al migrar (solo trazabilidad). */
  regimenOrigen: string | null;
  /** Última modificación (para la huella de las decisiones de período). */
  actualizadoEn: string | null;
  notas: string | null;
  ica: IcaMunicipio[];
}

export interface DatosEmpresa {
  nit: string | null;
  dv: number | null;
  /** Ficha de la empresa (`organizations.fiscal_responsibilities`): códigos del documento electrónico de hoy. */
  responsabilidadesRut: string[];
}

export interface SolicitudPerfil extends CamposPerfil {
  id: string | null;
  vigenteDesde: string;
  advertenciasAceptadas: string[];
  notas: string | null;
  ica: { municipioId: string; periodicidad: PeriodicidadIca; tarifaPorMil: number | null; actividad: string | null }[];
}

export type ErrorPerfil =
  | 'datos_invalidos'
  | 'vigencia_invalida'
  | 'regimen_invalido'
  | 'condicion_iva_invalida'
  | 'periodicidad_invalida'
  | 'responsabilidad_invalida'
  | 'responsabilidad_rut_invalida'
  | 'motivo_invalido'
  | 'ica_invalido';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const CODIGO_FE_RE = /^[A-Z]-\d{2}(-[A-Z]{2})?$/;
const CODIGO_RUT_RE = /^\d{2}$/;

const en = <T extends string>(lista: readonly T[], v: unknown): v is T => typeof v === 'string' && (lista as readonly string[]).includes(v);
const vacio = (v: unknown) => v === null || v === undefined || v === '';
const textoCorto = (v: unknown, max: number) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : null);
const diaONull = (v: unknown): string | null | false => (vacio(v) ? null : esDiaValido(String(v)) ? String(v) : false);
const boolONull = (v: unknown): boolean | null => (v === true ? true : v === false ? false : null);

function listaCodigos(v: unknown, re: RegExp, mayusculas: boolean): string[] | null {
  if (v === undefined || v === null) return [];
  if (!Array.isArray(v) || v.length > 60) return null;
  const lista = Array.from(new Set(v.map((r) => (mayusculas ? String(r).trim().toUpperCase() : String(r).trim()))));
  return lista.every((r) => re.test(r)) ? lista : null;
}

/**
 * Lista blanca del cuerpo de `POST /api/finanzas/tributario/perfil`: solo la
 * FORMA. Que la combinación tenga sentido lo decide `evaluarCombinacion`.
 */
export function validarSolicitudPerfil(cuerpo: unknown): { ok: true; datos: SolicitudPerfil } | { ok: false; error: ErrorPerfil } {
  if (!cuerpo || typeof cuerpo !== 'object' || Array.isArray(cuerpo)) return { ok: false, error: 'datos_invalidos' };
  const b = cuerpo as Record<string, unknown>;
  const id = vacio(b.id) ? null : String(b.id);
  if (id !== null && !UUID_RE.test(id)) return { ok: false, error: 'datos_invalidos' };
  const vigenteDesde = typeof b.vigenteDesde === 'string' ? b.vigenteDesde : '';
  if (!esDiaValido(vigenteDesde)) return { ok: false, error: 'vigencia_invalida' };
  if (!vacio(b.regimenRenta) && !en(REGIMENES_RENTA, b.regimenRenta)) return { ok: false, error: 'regimen_invalido' };
  if (!vacio(b.condicionIva) && !en(CONDICIONES_IVA, b.condicionIva)) return { ok: false, error: 'condicion_iva_invalida' };
  if (!en(PERIODICIDADES_IVA, b.periodicidadIva)) return { ok: false, error: 'periodicidad_invalida' };
  if (!vacio(b.motivoCambioPeriodicidad) && !en(MOTIVOS_CAMBIO_PERIODICIDAD, b.motivoCambioPeriodicidad)) return { ok: false, error: 'motivo_invalido' };
  if (!vacio(b.incActividad) && !en(ACTIVIDADES_INC, b.incActividad)) return { ok: false, error: 'datos_invalidos' };
  if (!vacio(b.rteTipo) && !en(TIPOS_RTE, b.rteTipo)) return { ok: false, error: 'datos_invalidos' };
  const fechas = [diaONull(b.granContribuyenteDesde), diaONull(b.autorretenedorActoFecha), diaONull(b.cambioPeriodicidadFecha)];
  if (fechas.some((f) => f === false)) return { ok: false, error: 'datos_invalidos' };
  const responsabilidades = listaCodigos(b.responsabilidades, CODIGO_FE_RE, true);
  if (responsabilidades === null) return { ok: false, error: 'responsabilidad_invalida' };
  const responsabilidadesRut = listaCodigos(b.responsabilidadesRut, CODIGO_RUT_RE, false);
  if (responsabilidadesRut === null) return { ok: false, error: 'responsabilidad_rut_invalida' };
  const aceptadasCrudo = b.advertenciasAceptadas;
  if (aceptadasCrudo !== undefined && aceptadasCrudo !== null && (!Array.isArray(aceptadasCrudo) || aceptadasCrudo.length > 40)) {
    return { ok: false, error: 'datos_invalidos' };
  }
  const advertenciasAceptadas = Array.from(
    new Set(((aceptadasCrudo as unknown[] | null | undefined) ?? []).map(String).filter((x) => /^[a-z0-9_]{3,60}$/.test(x))),
  );

  const icaCrudo = b.ica === undefined || b.ica === null ? [] : b.ica;
  if (!Array.isArray(icaCrudo) || icaCrudo.length > 50) return { ok: false, error: 'ica_invalido' };
  const ica: SolicitudPerfil['ica'] = [];
  const vistos = new Set<string>();
  for (const crudo of icaCrudo) {
    if (!crudo || typeof crudo !== 'object') return { ok: false, error: 'ica_invalido' };
    const f = crudo as Record<string, unknown>;
    const municipioId = typeof f.municipioId === 'string' ? f.municipioId : '';
    if (!UUID_RE.test(municipioId) || vistos.has(municipioId)) return { ok: false, error: 'ica_invalido' };
    if (!en(PERIODICIDADES_ICA, f.periodicidad)) return { ok: false, error: 'ica_invalido' };
    let tarifaPorMil: number | null = null;
    if (!vacio(f.tarifaPorMil)) {
      const n = Number(f.tarifaPorMil);
      if (!Number.isFinite(n) || n < 0 || n > 100) return { ok: false, error: 'ica_invalido' };
      tarifaPorMil = Math.round(n * 1000) / 1000;
    }
    vistos.add(municipioId);
    ica.push({ municipioId, periodicidad: f.periodicidad, tarifaPorMil, actividad: textoCorto(f.actividad, 200) });
  }

  return {
    ok: true,
    datos: {
      id,
      vigenteDesde,
      regimenRenta: vacio(b.regimenRenta) ? null : (b.regimenRenta as RegimenRenta),
      condicionIva: vacio(b.condicionIva) ? null : (b.condicionIva as CondicionIva),
      periodicidadIva: b.periodicidadIva,
      granContribuyente: b.granContribuyente === true,
      granContribuyenteActo: textoCorto(b.granContribuyenteActo, 120),
      granContribuyenteDesde: fechas[0] || null,
      autorretenedor: b.autorretenedor === true,
      autorretenedorActo: textoCorto(b.autorretenedorActo, 120),
      autorretenedorActoFecha: fechas[1] || null,
      autorretencionEspecial: b.autorretencionEspecial === true,
      agenteRetencionIva: b.agenteRetencionIva === true,
      agenteRetencion: b.agenteRetencion === true,
      responsableInc: b.responsableInc === true,
      incActividad: vacio(b.incActividad) ? null : (b.incActividad as ActividadInc),
      rteTipo: vacio(b.rteTipo) ? null : (b.rteTipo as TipoRte),
      rteIngresosSuperan160000Uvt: boolONull(b.rteIngresosSuperan160000Uvt),
      noContribuyenteNaturaleza: textoCorto(b.noContribuyenteNaturaleza, 300),
      motivoCambioPeriodicidad: vacio(b.motivoCambioPeriodicidad) ? null : (b.motivoCambioPeriodicidad as MotivoCambioPeriodicidad),
      cambioPeriodicidadHecho: textoCorto(b.cambioPeriodicidadHecho, 1000),
      cambioPeriodicidadNorma: textoCorto(b.cambioPeriodicidadNorma, 300),
      cambioPeriodicidadFecha: fechas[2] || null,
      responsabilidades,
      responsabilidadesRut,
      advertenciasAceptadas,
      notas: textoCorto(b.notas, 1000),
      ica,
    },
  };
}

/** Parámetros de `fn_perfil_tributario_guardar_v2`: la organización es SIEMPRE la de la sesión. */
export function parametrosGuardarPerfil(organizationId: number, d: SolicitudPerfil, advertenciasAceptadas: readonly string[]) {
  return {
    p_organization_id: organizationId,
    p_id: d.id,
    p_vigente_desde: d.vigenteDesde,
    p_datos: {
      regimen_renta: d.regimenRenta,
      condicion_iva: d.condicionIva,
      periodicidad_iva: d.periodicidadIva,
      gran_contribuyente: d.granContribuyente,
      gran_contribuyente_acto: d.granContribuyenteActo,
      gran_contribuyente_desde: d.granContribuyenteDesde,
      autorretenedor: d.autorretenedor,
      autorretenedor_acto: d.autorretenedorActo,
      autorretenedor_acto_fecha: d.autorretenedorActoFecha,
      autorretencion_especial: d.autorretencionEspecial,
      agente_retencion_iva: d.agenteRetencionIva,
      agente_retencion: d.agenteRetencion,
      responsable_inc: d.responsableInc,
      inc_actividad: d.incActividad,
      rte_tipo: d.rteTipo,
      rte_ingresos_superan_160000_uvt: d.rteIngresosSuperan160000Uvt,
      no_contribuyente_naturaleza: d.noContribuyenteNaturaleza,
      motivo_cambio_periodicidad: d.motivoCambioPeriodicidad,
      cambio_periodicidad_hecho: d.cambioPeriodicidadHecho,
      cambio_periodicidad_norma: d.cambioPeriodicidadNorma,
      cambio_periodicidad_fecha: d.cambioPeriodicidadFecha,
      responsabilidades: d.responsabilidades,
      responsabilidades_rut: d.responsabilidadesRut,
      advertencias_aceptadas: [...advertenciasAceptadas],
    },
    p_ica: d.ica.map((i) => ({ municipality_id: i.municipioId, periodicidad: i.periodicidad, tarifa_por_mil: i.tarifaPorMil, actividad: i.actividad })),
    p_notas: d.notas,
  };
}

export type CodigoErrorGuardarPerfil =
  | 'sin_permiso'
  | 'no_encontrado'
  | 'vigencia_duplicada'
  | 'pendiente_activar'
  | 'combinacion_contradictoria'
  | 'datos_invalidos'
  | 'desconocido';

/** Error de la RPC → código estable para la pantalla. */
export function codigoErrorGuardarPerfil(error: { code?: string; message?: string } | null | undefined): CodigoErrorGuardarPerfil {
  if (!error) return 'desconocido';
  if (esObjetoInexistente(error)) return 'pendiente_activar';
  if (error.code === '42501') return 'sin_permiso';
  if (error.code === 'P0002') return 'no_encontrado';
  if (error.code === '23505') return 'vigencia_duplicada';
  if (error.code === '22023' && /COMBINACION_CONTRADICTORIA/.test(error.message ?? '')) return 'combinacion_contradictoria';
  if (error.code === '22023' || error.code === '23514') return 'datos_invalidos';
  return 'desconocido';
}

/** Códigos de bloqueo que la base devuelve en `details` («a,b,c»). */
export function bloqueosDeError(error: { details?: string | null } | null | undefined): string[] {
  return (error?.details ?? '')
    .split(',')
    .map((x) => x.trim())
    .filter((x) => /^[a-z0-9_]{3,60}$/.test(x));
}

/**
 * La tabla o la función todavía no existen en la base (migración sin aplicar):
 * PostgREST 205/202 o Postgres 42P01/42883. Solo en ese caso la pantalla dice
 * «pendiente de activar»; cualquier otro error se ve como error.
 */
export function esObjetoInexistente(error: { code?: string; message?: string } | null | undefined): boolean {
  if (!error) return false;
  if (['PGRST205', 'PGRST202', '42P01', '42883'].includes(error.code ?? '')) return true;
  return /Could not find the (table|function)/i.test(error.message ?? '');
}

/** Fila de `organization_tax_profiles` leída con `select('*')`: antes de 20261108160500 no trae las columnas nuevas. */
export interface FilaPerfil {
  id: string;
  vigente_desde: string;
  vigente_hasta: string | null;
  regimen?: string | null;
  regimen_renta?: string | null;
  condicion_iva?: string | null;
  gran_contribuyente?: boolean | null;
  gran_contribuyente_acto?: string | null;
  gran_contribuyente_desde?: string | null;
  autorretenedor?: boolean | null;
  autorretenedor_acto?: string | null;
  autorretenedor_acto_fecha?: string | null;
  autorretencion_especial?: boolean | null;
  agente_retencion_iva?: boolean | null;
  inc_actividad?: string | null;
  rte_tipo?: string | null;
  rte_ingresos_superan_160000_uvt?: boolean | null;
  no_contribuyente_naturaleza?: string | null;
  responsabilidades_rut?: string[] | null;
  motivo_cambio_periodicidad?: string | null;
  cambio_periodicidad_hecho?: string | null;
  cambio_periodicidad_norma?: string | null;
  cambio_periodicidad_fecha?: string | null;
  cambio_periodicidad_estado?: string | null;
  advertencias_aceptadas?: string[] | null;
  requiere_revision?: boolean | null;
  regimen_origen?: string | null;
  updated_at?: string | null;
  responsabilidades: string[] | null;
  agente_retencion: boolean | null;
  responsable_inc: boolean | null;
  periodicidad_iva: string;
  notas: string | null;
}

interface FilaIca {
  profile_id: string;
  municipality_id: string;
  periodicidad: string;
  tarifa_por_mil: number | string | null;
  actividad: string | null;
}

type CamposFila = Omit<VigenciaPerfil, 'id' | 'vigenteDesde' | 'vigenteHasta' | 'agenteRetencion' | 'responsableInc' | 'periodicidadIva' | 'responsabilidades' | 'notas' | 'ica'>;

/** Una fila → los campos separados. Sin las columnas nuevas, la misma regla conservadora de la migración. */
function camposSeparados(p: FilaPerfil): CamposFila {
  const nuevos = 'regimen_renta' in p;
  const base = nuevos
    ? {
        regimenRenta: en(REGIMENES_RENTA, p.regimen_renta) ? p.regimen_renta : null,
        condicionIva: en(CONDICIONES_IVA, p.condicion_iva) ? p.condicion_iva : null,
        granContribuyente: p.gran_contribuyente ?? null,
        autorretenedor: p.autorretenedor ?? null,
        agenteRetencionIva: p.agente_retencion_iva ?? null,
      }
    : desdeRegimenCombinado(p.regimen, p.responsabilidades ?? []);
  return {
    ...base,
    granContribuyenteActo: p.gran_contribuyente_acto ?? null,
    granContribuyenteDesde: p.gran_contribuyente_desde ?? null,
    autorretenedorActo: p.autorretenedor_acto ?? null,
    autorretenedorActoFecha: p.autorretenedor_acto_fecha ?? null,
    autorretencionEspecial: p.autorretencion_especial ?? null,
    incActividad: en(ACTIVIDADES_INC, p.inc_actividad) ? p.inc_actividad : null,
    rteTipo: en(TIPOS_RTE, p.rte_tipo) ? p.rte_tipo : null,
    rteIngresosSuperan160000Uvt: p.rte_ingresos_superan_160000_uvt ?? null,
    noContribuyenteNaturaleza: p.no_contribuyente_naturaleza ?? null,
    responsabilidadesRut: p.responsabilidades_rut ?? [],
    motivoCambioPeriodicidad: en(MOTIVOS_CAMBIO_PERIODICIDAD, p.motivo_cambio_periodicidad) ? p.motivo_cambio_periodicidad : null,
    cambioPeriodicidadHecho: p.cambio_periodicidad_hecho ?? null,
    cambioPeriodicidadNorma: p.cambio_periodicidad_norma ?? null,
    cambioPeriodicidadFecha: p.cambio_periodicidad_fecha ?? null,
    cambioPeriodicidadEstado: en(ESTADOS_CAMBIO_PERIODICIDAD, p.cambio_periodicidad_estado) ? p.cambio_periodicidad_estado : 'no_aplica',
    advertenciasAceptadas: p.advertencias_aceptadas ?? [],
    requiereRevision: !nuevos || p.requiere_revision === true || base.regimenRenta === null || base.condicionIva === null,
    regimenOrigen: nuevos ? (p.regimen_origen ?? null) : (p.regimen ?? null),
    actualizadoEn: p.updated_at ?? null,
  };
}

/** Filas de la base → vigencias (la más nueva primero) con su ICA y el nombre del municipio. */
export function leerVigencias(
  perfiles: readonly FilaPerfil[],
  ica: readonly FilaIca[],
  municipios: ReadonlyMap<string, { nombre: string; departamento: string | null }>,
): VigenciaPerfil[] {
  return perfiles
    .filter((p) => en(PERIODICIDADES_IVA, p.periodicidad_iva))
    .map((p) => ({
      id: p.id,
      vigenteDesde: p.vigente_desde,
      vigenteHasta: p.vigente_hasta,
      ...camposSeparados(p),
      agenteRetencion: p.agente_retencion === true,
      responsableInc: p.responsable_inc === true,
      periodicidadIva: p.periodicidad_iva as PeriodicidadIva,
      responsabilidades: p.responsabilidades ?? [],
      notas: p.notas,
      ica: ica
        .filter((i) => i.profile_id === p.id && en(PERIODICIDADES_ICA, i.periodicidad))
        .map((i) => ({
          municipioId: i.municipality_id,
          municipio: municipios.get(i.municipality_id)?.nombre ?? null,
          departamento: municipios.get(i.municipality_id)?.departamento ?? null,
          periodicidad: i.periodicidad as PeriodicidadIca,
          tarifaPorMil: i.tarifa_por_mil === null || i.tarifa_por_mil === undefined ? null : Number(i.tarifa_por_mil),
          actividad: i.actividad,
        }))
        .sort((a, b) => (a.municipio ?? '').localeCompare(b.municipio ?? '')),
    }))
    .sort((a, b) => b.vigenteDesde.localeCompare(a.vigenteDesde));
}

/** La vigencia que cubre el día `dia` (`YYYY-MM-DD`), o null. */
export function vigenciaEn(vigencias: readonly VigenciaPerfil[], dia: string): VigenciaPerfil | null {
  return vigencias.find((v) => v.vigenteDesde <= dia && (v.vigenteHasta === null || v.vigenteHasta >= dia)) ?? null;
}

/** Vigencias contiguas a la que empieza en `desde` (sin contar la vigencia `id`). */
export function contiguas(
  vigencias: readonly VigenciaPerfil[],
  desde: string,
  id: string | null,
): { anterior: VigenciaPerfil | null; siguiente: VigenciaPerfil | null } {
  const otras = vigencias.filter((v) => v.id !== id);
  const anterior = otras.filter((v) => v.vigenteDesde < desde).sort((a, b) => b.vigenteDesde.localeCompare(a.vigenteDesde))[0] ?? null;
  const siguiente = otras.filter((v) => v.vigenteDesde > desde).sort((a, b) => a.vigenteDesde.localeCompare(b.vigenteDesde))[0] ?? null;
  return { anterior, siguiente };
}

export type FaltaPerfil = 'perfil' | 'nit' | 'revisar_perfil' | 'periodicidad_iva' | 'cambio_periodicidad_pendiente';

/** Lo que impide derivar las obligaciones con certeza (banda «Faltan datos para los borradores tributarios»). */
export function faltantesPerfil(empresa: DatosEmpresa, vigente: VigenciaPerfil | null): FaltaPerfil[] {
  const faltan: FaltaPerfil[] = [];
  if (!vigente) faltan.push('perfil');
  if (!empresa.nit || !/\d/.test(empresa.nit)) faltan.push('nit');
  if (vigente) {
    if (vigente.requiereRevision) faltan.push('revisar_perfil');
    if (vigente.condicionIva === 'responsable' && vigente.periodicidadIva === 'no_aplica') faltan.push('periodicidad_iva');
    if (vigente.cambioPeriodicidadEstado === 'pendiente_soporte') faltan.push('cambio_periodicidad_pendiente');
  }
  return faltan;
}

/**
 * Fecha que propone «Nueva vigencia»: el 1 de enero del año en curso si aún no
 * hay vigencia que empiece este año; si ya la hay, el 1 de enero del siguiente.
 * Es solo la propuesta: la persona la cambia.
 */
export function inicioPropuesto(vigencias: readonly VigenciaPerfil[], hoy: string): string {
  const anio = Number(hoy.slice(0, 4));
  const masNueva = vigencias[0];
  if (!masNueva) return `${anio}-01-01`;
  return masNueva.vigenteDesde < `${anio}-01-01` ? `${anio}-01-01` : `${anio + 1}-01-01`;
}
