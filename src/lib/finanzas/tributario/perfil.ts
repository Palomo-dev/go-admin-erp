/**
 * Perfil tributario de la empresa por vigencia (Finanzas R4-A, Figma 2335:136222).
 * Tablas `organization_tax_profiles` y `organization_tax_profile_ica`
 * (migración 20261108100000, aplicada) con renta e IVA separados (P5,
 * migración 20261108160500); escritura solo por `fn_perfil_tributario_guardar_v2`.
 * Aquí: tipos, validación de FORMA de la solicitud (lista blanca), lectura de
 * filas y qué le falta al perfil. Las combinaciones contradictorias se deciden
 * en `combinaciones.ts`. Sin React ni Supabase.
 */
import { esDiaValido } from './periodos';
import {
  CONDICIONES_IVA,
  MOTIVOS_CAMBIO_PERIODICIDAD,
  REGIMENES_RENTA,
  desdeRegimenCombinado,
  type CondicionIva,
  type MotivoCambioPeriodicidad,
  type RegimenRenta,
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

export interface VigenciaPerfil {
  id: string;
  vigenteDesde: string;
  vigenteHasta: string | null;
  /** Régimen del impuesto sobre la renta; null = sin definir (revisar perfil). */
  regimenRenta: RegimenRenta | null;
  /** Condición frente al IVA, independiente de la renta; null = sin definir. */
  condicionIva: CondicionIva | null;
  granContribuyente: boolean | null;
  autorretenedor: boolean | null;
  agenteRetencionIva: boolean | null;
  /** Agente de retención en la fuente a título de renta (formulario 350). */
  agenteRetencion: boolean;
  responsableInc: boolean;
  periodicidadIva: PeriodicidadIva;
  /** Códigos del documento electrónico (lo que lee la representación gráfica, H2). */
  responsabilidades: string[];
  /** Códigos de la casilla 53 del RUT (opcional). */
  responsabilidadesRut: string[];
  motivoCambioPeriodicidad: MotivoCambioPeriodicidad | null;
  advertenciasAceptadas: string[];
  /** Vigencia migrada del campo combinado viejo o con datos sin definir: alguien debe confirmarla. */
  requiereRevision: boolean;
  /** El campo combinado viejo tal como estaba al migrar (solo trazabilidad). */
  regimenOrigen: string | null;
  notas: string | null;
  ica: IcaMunicipio[];
}

export interface DatosEmpresa {
  nit: string | null;
  dv: number | null;
  /** Ficha de la empresa (`organizations.fiscal_responsibilities`): códigos del documento electrónico de hoy. */
  responsabilidadesRut: string[];
}

export interface SolicitudPerfil {
  id: string | null;
  vigenteDesde: string;
  regimenRenta: RegimenRenta | null;
  condicionIva: CondicionIva | null;
  periodicidadIva: PeriodicidadIva;
  granContribuyente: boolean;
  autorretenedor: boolean;
  agenteRetencionIva: boolean;
  agenteRetencion: boolean;
  responsableInc: boolean;
  responsabilidades: string[];
  responsabilidadesRut: string[];
  motivoCambioPeriodicidad: MotivoCambioPeriodicidad | null;
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
    const actividad = typeof f.actividad === 'string' && f.actividad.trim() ? f.actividad.trim().slice(0, 200) : null;
    vistos.add(municipioId);
    ica.push({ municipioId, periodicidad: f.periodicidad, tarifaPorMil, actividad });
  }

  const notas = typeof b.notas === 'string' && b.notas.trim() ? b.notas.trim().slice(0, 1000) : null;
  return {
    ok: true,
    datos: {
      id,
      vigenteDesde,
      regimenRenta: vacio(b.regimenRenta) ? null : (b.regimenRenta as RegimenRenta),
      condicionIva: vacio(b.condicionIva) ? null : (b.condicionIva as CondicionIva),
      periodicidadIva: b.periodicidadIva,
      granContribuyente: b.granContribuyente === true,
      autorretenedor: b.autorretenedor === true,
      agenteRetencionIva: b.agenteRetencionIva === true,
      agenteRetencion: b.agenteRetencion === true,
      responsableInc: b.responsableInc === true,
      responsabilidades,
      responsabilidadesRut,
      motivoCambioPeriodicidad: vacio(b.motivoCambioPeriodicidad) ? null : (b.motivoCambioPeriodicidad as MotivoCambioPeriodicidad),
      advertenciasAceptadas,
      notas,
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
    p_regimen_renta: d.regimenRenta,
    p_condicion_iva: d.condicionIva,
    p_periodicidad_iva: d.periodicidadIva,
    p_gran_contribuyente: d.granContribuyente,
    p_autorretenedor: d.autorretenedor,
    p_agente_retencion_iva: d.agenteRetencionIva,
    p_agente_retencion: d.agenteRetencion,
    p_responsable_inc: d.responsableInc,
    p_responsabilidades: d.responsabilidades,
    p_responsabilidades_rut: d.responsabilidadesRut,
    p_motivo_cambio_periodicidad: d.motivoCambioPeriodicidad,
    p_advertencias_aceptadas: [...advertenciasAceptadas],
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
  autorretenedor?: boolean | null;
  agente_retencion_iva?: boolean | null;
  responsabilidades_rut?: string[] | null;
  motivo_cambio_periodicidad?: string | null;
  advertencias_aceptadas?: string[] | null;
  requiere_revision?: boolean | null;
  regimen_origen?: string | null;
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

/** Una fila → los campos separados. Sin las columnas nuevas, la misma regla conservadora de la migración. */
function camposSeparados(p: FilaPerfil): Pick<
  VigenciaPerfil,
  'regimenRenta' | 'condicionIva' | 'granContribuyente' | 'autorretenedor' | 'agenteRetencionIva' | 'requiereRevision' | 'regimenOrigen'
> {
  if (!('regimen_renta' in p)) {
    return { ...desdeRegimenCombinado(p.regimen, p.responsabilidades ?? []), requiereRevision: true, regimenOrigen: p.regimen ?? null };
  }
  const regimenRenta = en(REGIMENES_RENTA, p.regimen_renta) ? p.regimen_renta : null;
  const condicionIva = en(CONDICIONES_IVA, p.condicion_iva) ? p.condicion_iva : null;
  return {
    regimenRenta,
    condicionIva,
    granContribuyente: p.gran_contribuyente ?? null,
    autorretenedor: p.autorretenedor ?? null,
    agenteRetencionIva: p.agente_retencion_iva ?? null,
    requiereRevision: p.requiere_revision === true || regimenRenta === null || condicionIva === null,
    regimenOrigen: p.regimen_origen ?? null,
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
      responsabilidadesRut: p.responsabilidades_rut ?? [],
      motivoCambioPeriodicidad: en(MOTIVOS_CAMBIO_PERIODICIDAD, p.motivo_cambio_periodicidad) ? p.motivo_cambio_periodicidad : null,
      advertenciasAceptadas: p.advertencias_aceptadas ?? [],
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

export type FaltaPerfil = 'perfil' | 'nit' | 'revisar_perfil' | 'periodicidad_iva';

/** Lo que impide derivar las obligaciones con certeza (banda «Faltan datos para los borradores tributarios»). */
export function faltantesPerfil(empresa: DatosEmpresa, vigente: VigenciaPerfil | null): FaltaPerfil[] {
  const faltan: FaltaPerfil[] = [];
  if (!vigente) faltan.push('perfil');
  if (!empresa.nit || !/\d/.test(empresa.nit)) faltan.push('nit');
  if (vigente) {
    if (vigente.requiereRevision) faltan.push('revisar_perfil');
    if (vigente.condicionIva === 'responsable' && vigente.periodicidadIva === 'no_aplica') faltan.push('periodicidad_iva');
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
