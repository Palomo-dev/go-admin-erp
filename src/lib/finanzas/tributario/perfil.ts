/**
 * Perfil tributario de la empresa por vigencia (Finanzas R4-A, Figma 2335:136222).
 * Tablas `organization_tax_profiles` y `organization_tax_profile_ica`
 * (migración propuesta 20261108100000); escritura solo por
 * `fn_perfil_tributario_guardar`. Aquí: tipos, validación de la solicitud
 * (lista blanca), lectura de filas y qué le falta al perfil. Sin React ni Supabase.
 */
import { esDiaValido } from './periodos';

export const REGIMENES = ['ordinario', 'simple', 'no_responsable_iva', 'especial'] as const;
export type Regimen = (typeof REGIMENES)[number];

export const PERIODICIDADES_IVA = ['bimestral', 'cuatrimestral', 'anual', 'no_aplica'] as const;
export type PeriodicidadIva = (typeof PERIODICIDADES_IVA)[number];

export const PERIODICIDADES_ICA = ['mensual', 'bimestral', 'cuatrimestral', 'semestral', 'anual'] as const;
export type PeriodicidadIca = (typeof PERIODICIDADES_ICA)[number];

/** Códigos del RUT (`dian_fiscal_responsibilities`) que la pantalla muestra como casillas con nombre propio. */
export const RESPONSABILIDAD = {
  granContribuyente: 'O-13',
  autorretenedor: 'O-15',
  agenteRetencionIva: 'O-23',
  simple: 'O-47',
  responsableIva: 'O-48',
  noResponsableIva: 'O-49',
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
  regimen: Regimen;
  responsabilidades: string[];
  agenteRetencion: boolean;
  responsableInc: boolean;
  periodicidadIva: PeriodicidadIva;
  notas: string | null;
  ica: IcaMunicipio[];
}

export interface DatosEmpresa {
  nit: string | null;
  dv: number | null;
  /** Lo que hoy lee la facturación electrónica (`organizations.fiscal_responsibilities`). */
  responsabilidadesRut: string[];
}

export interface SolicitudPerfil {
  id: string | null;
  vigenteDesde: string;
  regimen: Regimen;
  responsabilidades: string[];
  agenteRetencion: boolean;
  responsableInc: boolean;
  periodicidadIva: PeriodicidadIva;
  notas: string | null;
  ica: { municipioId: string; periodicidad: PeriodicidadIca; tarifaPorMil: number | null; actividad: string | null }[];
}

export type ErrorPerfil =
  | 'datos_invalidos'
  | 'vigencia_invalida'
  | 'regimen_invalido'
  | 'periodicidad_invalida'
  | 'responsabilidad_invalida'
  | 'responsabilidades_incompatibles'
  | 'periodicidad_incoherente'
  | 'falta_periodicidad'
  | 'ica_invalido';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const CODIGO_RE = /^[A-Z]-\d{2}(-[A-Z]{2})?$/;

const en = <T extends string>(lista: readonly T[], v: unknown): v is T => typeof v === 'string' && (lista as readonly string[]).includes(v);

/** Lista blanca del cuerpo de `POST /api/finanzas/tributario/perfil`. */
export function validarSolicitudPerfil(cuerpo: unknown): { ok: true; datos: SolicitudPerfil } | { ok: false; error: ErrorPerfil } {
  if (!cuerpo || typeof cuerpo !== 'object' || Array.isArray(cuerpo)) return { ok: false, error: 'datos_invalidos' };
  const b = cuerpo as Record<string, unknown>;
  const id = b.id === null || b.id === undefined || b.id === '' ? null : String(b.id);
  if (id !== null && !UUID_RE.test(id)) return { ok: false, error: 'datos_invalidos' };
  const vigenteDesde = typeof b.vigenteDesde === 'string' ? b.vigenteDesde : '';
  if (!esDiaValido(vigenteDesde)) return { ok: false, error: 'vigencia_invalida' };
  if (!en(REGIMENES, b.regimen)) return { ok: false, error: 'regimen_invalido' };
  if (!en(PERIODICIDADES_IVA, b.periodicidadIva)) return { ok: false, error: 'periodicidad_invalida' };
  if (!Array.isArray(b.responsabilidades) || b.responsabilidades.length > 20) return { ok: false, error: 'responsabilidad_invalida' };
  const responsabilidades = Array.from(new Set(b.responsabilidades.map((r) => String(r).trim().toUpperCase())));
  if (responsabilidades.some((r) => !CODIGO_RE.test(r))) return { ok: false, error: 'responsabilidad_invalida' };
  if (responsabilidades.includes(RESPONSABILIDAD.responsableIva) && responsabilidades.includes(RESPONSABILIDAD.noResponsableIva)) {
    return { ok: false, error: 'responsabilidades_incompatibles' };
  }
  const regimen = b.regimen;
  const periodicidadIva = b.periodicidadIva;
  if (regimen === 'no_responsable_iva' && periodicidadIva !== 'no_aplica') return { ok: false, error: 'periodicidad_incoherente' };
  if (responsabilidades.includes(RESPONSABILIDAD.responsableIva) && periodicidadIva === 'no_aplica') return { ok: false, error: 'falta_periodicidad' };

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
    if (f.tarifaPorMil !== null && f.tarifaPorMil !== undefined && f.tarifaPorMil !== '') {
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
      regimen,
      responsabilidades,
      agenteRetencion: b.agenteRetencion === true,
      responsableInc: b.responsableInc === true,
      periodicidadIva,
      notas,
      ica,
    },
  };
}

/** Parámetros de `fn_perfil_tributario_guardar`: la organización es SIEMPRE la de la sesión. */
export function parametrosGuardarPerfil(organizationId: number, d: SolicitudPerfil) {
  return {
    p_organization_id: organizationId,
    p_id: d.id,
    p_vigente_desde: d.vigenteDesde,
    p_regimen: d.regimen,
    p_responsabilidades: d.responsabilidades,
    p_agente_retencion: d.agenteRetencion,
    p_responsable_inc: d.responsableInc,
    p_periodicidad_iva: d.periodicidadIva,
    p_ica: d.ica.map((i) => ({ municipality_id: i.municipioId, periodicidad: i.periodicidad, tarifa_por_mil: i.tarifaPorMil, actividad: i.actividad })),
    p_notas: d.notas,
  };
}

export type CodigoErrorGuardarPerfil = 'sin_permiso' | 'no_encontrado' | 'vigencia_duplicada' | 'pendiente_activar' | 'datos_invalidos' | 'desconocido';

/** Error de la RPC → código estable para la pantalla. */
export function codigoErrorGuardarPerfil(error: { code?: string; message?: string } | null | undefined): CodigoErrorGuardarPerfil {
  if (!error) return 'desconocido';
  if (esObjetoInexistente(error)) return 'pendiente_activar';
  if (error.code === '42501') return 'sin_permiso';
  if (error.code === 'P0002') return 'no_encontrado';
  if (error.code === '23505') return 'vigencia_duplicada';
  if (error.code === '22023' || error.code === '23514') return 'datos_invalidos';
  return 'desconocido';
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

interface FilaPerfil {
  id: string;
  vigente_desde: string;
  vigente_hasta: string | null;
  regimen: string;
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

/** Filas de la base → vigencias (la más nueva primero) con su ICA y el nombre del municipio. */
export function leerVigencias(
  perfiles: readonly FilaPerfil[],
  ica: readonly FilaIca[],
  municipios: ReadonlyMap<string, { nombre: string; departamento: string | null }>,
): VigenciaPerfil[] {
  return perfiles
    .filter((p) => en(REGIMENES, p.regimen) && en(PERIODICIDADES_IVA, p.periodicidad_iva))
    .map((p) => ({
      id: p.id,
      vigenteDesde: p.vigente_desde,
      vigenteHasta: p.vigente_hasta,
      regimen: p.regimen as Regimen,
      responsabilidades: p.responsabilidades ?? [],
      agenteRetencion: p.agente_retencion === true,
      responsableInc: p.responsable_inc === true,
      periodicidadIva: p.periodicidad_iva as PeriodicidadIva,
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

export type FaltaPerfil = 'perfil' | 'nit' | 'periodicidad_iva' | 'regimen_simple_sin_o47';

/** Lo que impide derivar las obligaciones (banda «Faltan datos para los borradores tributarios»). */
export function faltantesPerfil(empresa: DatosEmpresa, vigente: VigenciaPerfil | null): FaltaPerfil[] {
  const faltan: FaltaPerfil[] = [];
  if (!vigente) faltan.push('perfil');
  if (!empresa.nit || !/\d/.test(empresa.nit)) faltan.push('nit');
  if (vigente) {
    if (vigente.responsabilidades.includes(RESPONSABILIDAD.responsableIva) && vigente.periodicidadIva === 'no_aplica') faltan.push('periodicidad_iva');
    if (vigente.regimen === 'simple' && !vigente.responsabilidades.includes(RESPONSABILIDAD.simple)) faltan.push('regimen_simple_sin_o47');
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
