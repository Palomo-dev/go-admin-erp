/**
 * Lógica pura de la fusión de clientes (Figma CRM 1436:19, 1436:843123 y 1438:1553).
 * Sin React. La fusión la hace el servidor en una transacción.
 */
import {
  CAMPOS_FUSION,
  GRUPOS_COMPARACION,
  type CampoFusion,
  type ClienteDuplicado,
  type GrupoComparacion,
  type GrupoDuplicados,
  type IdGrupoComparacion,
} from '@/lib/services/crm/customerMergeLogica';

const vacio = (v: unknown) => v === null || v === undefined || String(v).trim() === '';

/** Campos en los que los dos registros dicen algo distinto (y al menos uno dice algo). */
export function camposDistintos(a: ClienteDuplicado, b: ClienteDuplicado): CampoFusion[] {
  return CAMPOS_FUSION.filter((c) => !(vacio(a[c]) && vacio(b[c])) && String(a[c] ?? '').trim() !== String(b[c] ?? '').trim());
}

/** Por defecto gana el principal; si el principal no tiene el dato, el secundario. */
export function eleccionesIniciales(principal: ClienteDuplicado, secundario: ClienteDuplicado): Partial<Record<CampoFusion, string>> {
  return Object.fromEntries(camposDistintos(principal, secundario).map((c) => [c, vacio(principal[c]) ? secundario.id : principal.id]));
}

/** Solo viajan los campos que se toman del secundario (elegir el principal no cambia nada). */
export function choicesParaApi(elecciones: Partial<Record<CampoFusion, string>>, secundarioId: string): Partial<Record<CampoFusion, string>> {
  return Object.fromEntries(Object.entries(elecciones).filter(([, id]) => id === secundarioId)) as Partial<Record<CampoFusion, string>>;
}

/** Principal sugerido: más oportunidades, luego más conversaciones, luego el más antiguo. */
export function principalSugerido(clientes: readonly ClienteDuplicado[]): ClienteDuplicado | null {
  return (
    [...clientes].sort(
      (a, b) => b.opportunities_count - a.opportunities_count || b.conversations_count - a.conversations_count || a.created_at.localeCompare(b.created_at),
    )[0] ?? null
  );
}

export function nombreCliente(c: Pick<ClienteDuplicado, 'full_name' | 'company_name' | 'trade_name'>): string | null {
  return [c.full_name, c.company_name ?? c.trade_name].map((v) => v?.trim()).filter(Boolean)[0] ?? null;
}

/** Códigos de error de las RPC de fusión que la pantalla sabe explicar. */
const CONOCIDOS = new Set([
  'factura_emitida', 'registro_cambio', 'sucursal_sin_acceso', 'cliente_no_encontrado', 'seleccion_invalida',
  'fusion_no_reversible', 'fusion_pendiente', 'solo_administrador', 'fusion_no_encontrada', 'CRM_FORBIDDEN', 'sin_permiso',
]);

export function claveErrorFusion(codigo: string | null | undefined): string {
  if (!codigo) return 'generico';
  if (codigo === 'CRM_FORBIDDEN') return 'sin_permiso';
  return CONOCIDOS.has(codigo) ? codigo : 'generico';
}

/** «compras@x.co» / «+57 …» / «900…»: el valor compartido que agrupó a los clientes. */
export function tipoIdentidad(t: string): 'phone' | 'email' | 'document' | 'otro' {
  return t === 'phone' || t === 'email' || t === 'document' ? t : 'otro';
}

// ---------------------------------------------------------------------------
// Comparar y fusionar (Figma 1436:843123): una elección por fila.
// ---------------------------------------------------------------------------

export type Lado = 'principal' | 'secundario';
type ConCampos = Pick<ClienteDuplicado, CampoFusion>;

/** Texto de la fila: «Laura Gómez», «Cra. 52 #45-10, Medellín». El documento muestra solo el número. */
export function valorGrupo(c: ConCampos, g: GrupoComparacion): string {
  const campos = g.id === 'documento' ? (['identification_number'] as const) : g.campos;
  return campos
    .map((k) => String(c[k] ?? '').trim())
    .filter(Boolean)
    .join(g.separador);
}

/** Igual si todos sus campos coinciden (sin distinguir espacios de los extremos ni mayúsculas en el correo). */
export function grupoIgual(a: ConCampos, b: ConCampos, g: GrupoComparacion): boolean {
  return g.campos.every((k) => {
    const x = String(a[k] ?? '').trim();
    const y = String(b[k] ?? '').trim();
    return k === 'email' ? x.toLowerCase() === y.toLowerCase() : x === y;
  });
}

/** Filas visibles: las fijas del diseño y las opcionales solo si alguno tiene el dato. */
export function gruposVisibles(a: ConCampos, b: ConCampos): GrupoComparacion[] {
  return GRUPOS_COMPARACION.filter((g) => !('opcional' in g && g.opcional) || valorGrupo(a, g) !== '' || valorGrupo(b, g) !== '');
}

/** Por defecto se queda el principal; si el principal no tiene el dato y el secundario sí, el secundario. */
export function eleccionesGrupoIniciales(p: ConCampos, s: ConCampos): Partial<Record<IdGrupoComparacion, Lado>> {
  const r: Partial<Record<IdGrupoComparacion, Lado>> = {};
  for (const g of GRUPOS_COMPARACION) {
    if (grupoIgual(p, s, g)) continue;
    r[g.id] = valorGrupo(p, g) === '' && valorGrupo(s, g) !== '' ? 'secundario' : 'principal';
  }
  return r;
}

/** Lo que viaja a la RPC: solo los campos de las filas que se toman del secundario. */
export function choicesDesdeGrupos(elecciones: Partial<Record<IdGrupoComparacion, Lado>>, secundarioId: string): Partial<Record<CampoFusion, string>> {
  const r: Partial<Record<CampoFusion, string>> = {};
  for (const g of GRUPOS_COMPARACION) {
    if (elecciones[g.id] !== 'secundario') continue;
    for (const k of g.campos) r[k] = secundarioId;
  }
  return r;
}

// ---------------------------------------------------------------------------
// Lista de duplicados (Figma 1436:19)
// ---------------------------------------------------------------------------

/** Confianza del grupo: el documento coincide exacto (alta); teléfono y correo, media. */
export function confianzaGrupo(g: Pick<GrupoDuplicados, 'identity_type'>): 'alta' | 'media' {
  return g.identity_type === 'document' ? 'alta' : 'media';
}

/** Grupos por tipo para las tarjetas de arriba. */
export function conteoPorTipo(grupos: readonly Pick<GrupoDuplicados, 'identity_type'>[]): { phone: number; email: number; document: number } {
  const r = { phone: 0, email: 0, document: 0 };
  for (const g of grupos) if (g.identity_type in r) r[g.identity_type] += 1;
  return r;
}

/** «Mismo NIT …» si alguno de los registros es NIT; si no, «Mismo documento …». */
export function claveMismo(g: GrupoDuplicados): 'phone' | 'email' | 'nit' | 'document' | 'otro' {
  const t = tipoIdentidad(g.identity_type);
  if (t !== 'document') return t;
  return g.customers.some((c) => (c.identification_type ?? '').trim().toUpperCase() === 'NIT') ? 'nit' : 'document';
}

/** Segundo nombre de la tarjeta: el contacto si el principal es la empresa (o al revés). */
export function nombreSecundarioCliente(c: Pick<ClienteDuplicado, 'full_name' | 'company_name' | 'trade_name'>): string | null {
  const principal = nombreCliente(c);
  const otros = [c.company_name ?? c.trade_name, c.full_name].map((v) => v?.trim()).filter((v): v is string => !!v && v !== principal);
  return otros[0] ?? null;
}

/**
 * URL de la comparación de un grupo: el principal sugerido va primero. Solo
 * viajan ids (nunca el teléfono, el correo ni el documento en la URL).
 */
export function urlComparar(g: GrupoDuplicados): string {
  const p = principalSugerido(g.customers);
  const ids = [p?.id, ...g.customers.map((c) => c.id).filter((id) => id !== p?.id)].filter((v): v is string => !!v);
  return `/app/crm/identidades/comparar?ids=${ids.join(',')}`;
}

/** Lee `?ids=` de la comparación (repetidos y vacíos fuera). */
export function leerIdsComparar(ids: string | null): string[] {
  return [...new Set((ids ?? '').split(',').map((s) => s.trim()).filter(Boolean))];
}

const digitos = (v: string | null | undefined) => (v ?? '').replace(/[^0-9]/g, '');

/**
 * Por qué se parecen dos registros, en el mismo orden que la detección
 * (`crm_find_duplicates`): documento exacto, correo sin mayúsculas, teléfono
 * por sus 8 últimos dígitos. `null` si no comparten nada.
 */
export function motivoComparacion(a: ConCampos, b: ConCampos): { clave: 'nit' | 'document' | 'email' | 'phone'; valor: string } | null {
  const docA = (a.identification_number ?? '').trim();
  if (docA && docA === (b.identification_number ?? '').trim()) {
    const nit = [a, b].some((c) => (c.identification_type ?? '').trim().toUpperCase() === 'NIT');
    return { clave: nit ? 'nit' : 'document', valor: docA };
  }
  const correoA = (a.email ?? '').trim().toLowerCase();
  if (correoA && correoA === (b.email ?? '').trim().toLowerCase()) return { clave: 'email', valor: (a.email ?? '').trim() };
  const telA = digitos(a.phone);
  if (telA.length >= 8 && telA.slice(-8) === digitos(b.phone).slice(-8)) return { clave: 'phone', valor: (a.phone ?? '').trim() };
  return null;
}
