/**
 * Terminales del POS (cajas físicas): `public.pos_terminals`, PLAN
 * pos-doble-pantalla §3.3, §6.2, §7 y §12 Fase 2.
 *
 * Solo IDENTIDAD: id, organización, sucursal, nombre, código corto y estado.
 * Los ajustes de presentación de la pantalla del cliente son de la
 * organización (`organization_settings` / `pos_customer_display`,
 * settings.ts) y los secretos de emparejamiento (Fase 3) viven en
 * `pos_terminal_secrets`, sin permisos para `authenticated`: este módulo no
 * los toca y nunca debe hacerlo desde el navegador.
 *
 * - Solo navegador: listar y crear van con el cliente de
 *   `@/lib/supabase/config` (sesión del usuario, RLS por pertenencia; PLAN §7:
 *   «cajero con sesión»). Renombrar, cambiar el código y activar/desactivar
 *   exigen rol admin o manager, y ese rol se resuelve EN EL SERVIDOR (regla
 *   dura 6): van por `PATCH /api/pos/terminals/[id]`, nunca directo a la
 *   tabla. Desde la ronda 3 de F2-A la base lo exige TAMBIÉN: la política
 *   `pos_terminals_update` (migración 20260921150000, PLAN §6.5) solo deja
 *   pasar membresías con `role_id in (1, 2, 5)` / super admin o con el
 *   permiso `admin.full_access` (`check_user_permission`), así que un cajero
 *   que salte la ruta con PostgREST obtiene 0 filas actualizadas. La ruta
 *   sigue siendo el único camino soportado: es quien responde 403
 *   `ADMIN_REQUIRED` con un mensaje claro en vez de un «no encontrada».
 * - La organización sale de la sesión (`getOrganizationId`), nunca de un
 *   parámetro, y se comprueba ANTES de consultar (sin sesión = 0 → se lanza
 *   «organización inválida», mismo criterio que settings.ts; antes viajaba
 *   `organization_id: 0` y la lista vacía se pintaba como «sin terminales»).
 *   La sucursal, del contexto de sucursal (`getCurrentBranchId`), con la
 *   opción de pasarla explícita desde un componente que ya la tiene
 *   (`useBranch().selectedBranchId`).
 * - Vincular ESTA caja: el `id` de la fila elegida se escribe en la misma
 *   clave de localStorage que ya usa la Fase 0 (`pos_terminal_id`,
 *   terminal.ts). Si la organización aún no creó terminales, la caja sigue
 *   funcionando con su UUID local sin vincular (PLAN §3.3): la pantalla no
 *   depende de la tabla.
 * - El código se normaliza a MAYÚSCULAS (`normalizeTerminalCode`) antes de
 *   viajar; desde la ronda 3 la base también lo garantiza (índice único sobre
 *   `upper(code)` y CHECK `code = upper(code)`; ver terminalIdentity.ts).
 * - No se borra nada: «desactivar» es `is_active = false` (y la BD ya no
 *   tiene política DELETE).
 */

import { supabase } from '@/lib/supabase/config';
import { getCurrentBranchId, getOrganizationId } from '@/lib/hooks/useOrganization';
import { isTerminalId, readLocalTerminalId, setLocalTerminalId } from '@/lib/pos/display/terminal';
import {
  TERMINAL_CODE_PATTERN,
  TERMINAL_COLUMNS,
  TERMINAL_NAME_MAX,
  normalizeTerminalCode,
  validateTerminalInput,
  type PosTerminal,
  type PosTerminalInput,
} from '@/lib/pos/display/terminalIdentity';

export {
  TERMINAL_CODE_PATTERN,
  TERMINAL_NAME_MAX,
  normalizeTerminalCode,
  suggestTerminalCode,
  validateTerminalInput,
  type PosTerminal,
  type PosTerminalInput,
  type TerminalInputError,
} from '@/lib/pos/display/terminalIdentity';

/**
 * Código de error de Postgres para violación de UNIQUE: lo devuelven tanto
 * `pos_terminals_code_unico` (organization_id, branch_id, code) como el
 * índice insensible a mayúsculas `pos_terminals_code_unico_ci`
 * (organization_id, branch_id, upper(code)) de la migración 20260921150100.
 * Ambos son «ese código ya existe en la sucursal»; no hace falta distinguirlos.
 */
const UNIQUE_VIOLATION = '23505';
/** Código que devuelve la ruta PATCH para el mismo caso. */
const DUPLICATE_CODE = 'DUPLICATE_CODE';

/**
 * Error de la ruta `PATCH /api/pos/terminals/[id]` con el estado HTTP y el
 * `code` que devolvió (`ADMIN_REQUIRED`, `FOREIGN_ORGANIZATION`,
 * `DUPLICATE_CODE`, `NOT_FOUND`…), para que la tarjeta distinga «sin
 * permiso» de «código repetido» de «se cayó».
 */
export class PosTerminalsApiError extends Error {
  status: number;
  code: string;
  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = 'PosTerminalsApiError';
    this.status = status;
    this.code = code;
  }
}

/** ¿El error es «ese código ya existe en esta sucursal»? (23505 directo de Supabase o `DUPLICATE_CODE` de la ruta). */
export function isDuplicateCodeError(err: unknown): boolean {
  if (typeof err !== 'object' || err === null) return false;
  const code = (err as { code?: unknown }).code;
  return code === UNIQUE_VIOLATION || code === DUPLICATE_CODE;
}

/** `code` de la ruta cuando el rol no alcanza (PLAN §7: admin/manager). */
const ADMIN_REQUIRED = 'ADMIN_REQUIRED';
/**
 * `code`s de la ruta cuando la organización de la petición no es coherente:
 * cookie `goadmin_org_id` y cabecera `X-Organization-Id` con organizaciones
 * distintas (dos pestañas con organizaciones distintas) o una organización
 * ajena en la petición. No son «sin permiso»: un administrador legítimo los
 * recibe igual, y el remedio es recargar la página.
 */
const ORG_MISMATCH_CODES: ReadonlySet<string> = new Set(['ORG_AMBIGUOUS', 'FOREIGN_ORGANIZATION']);

/**
 * ¿El error es «sin permiso» (403 `ADMIN_REQUIRED` de la ruta: el rol no
 * alcanza)? Ronda 3 de F2-A: SOLO ese código; antes cualquier 403 contaba y
 * un `ORG_AMBIGUOUS` se pintaba como «solo un administrador…», mensaje falso
 * para un administrador legítimo. Ver `isOrgMismatchError`.
 */
export function isForbiddenError(err: unknown): boolean {
  return err instanceof PosTerminalsApiError && err.status === 403 && err.code === ADMIN_REQUIRED;
}

/** ¿El error es «la organización activa cambió» (403 `ORG_AMBIGUOUS` / `FOREIGN_ORGANIZATION` de la ruta)? La tarjeta pide recargar. */
export function isOrgMismatchError(err: unknown): boolean {
  return err instanceof PosTerminalsApiError && err.status === 403 && ORG_MISMATCH_CODES.has(err.code);
}

/** Mismo criterio que settings.ts: entero positivo. 0 = sin sesión / sin organización activa. */
function isValidOrgId(orgId: unknown): orgId is number {
  return typeof orgId === 'number' && Number.isInteger(orgId) && orgId > 0;
}

/** Organización de la sesión, validada. Lanza antes de cualquier consulta si no hay una. */
function resolveOrgId(): number {
  const orgId = getOrganizationId();
  if (!isValidOrgId(orgId)) throw new Error('organización inválida');
  return orgId;
}

function resolveBranchId(branchId?: number | null): number {
  const id = branchId ?? getCurrentBranchId();
  if (typeof id !== 'number' || !Number.isInteger(id) || id <= 0) {
    throw new Error('Seleccione una sucursal antes de administrar las terminales');
  }
  return id;
}

/** Cuerpo del PATCH de la ruta (§7): nombre, código y/o activo. */
interface TerminalPatch {
  name?: string;
  code?: string;
  is_active?: boolean;
}

/**
 * Llama a `PATCH /api/pos/terminals/[id]`. La sesión viaja en las cookies y
 * la organización se manda además como cabecera (la ruta la valida contra
 * la membresía; nunca va en el body). Cualquier respuesta no 2xx se convierte
 * en `PosTerminalsApiError` con el `code` de la ruta.
 */
async function patchTerminal(id: string, orgId: number, patch: TerminalPatch): Promise<PosTerminal> {
  const res = await fetch(`/api/pos/terminals/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', 'X-Organization-Id': String(orgId) },
    body: JSON.stringify(patch),
    cache: 'no-store',
  });
  let payload: { data?: PosTerminal; error?: string; code?: string } = {};
  try {
    payload = (await res.json()) as typeof payload;
  } catch {
    // Sin JSON (proxy, 502): se conserva solo el estado.
  }
  if (!res.ok) {
    throw new PosTerminalsApiError(res.status, payload.code ?? `HTTP_${res.status}`, payload.error ?? `PATCH terminal falló (${res.status})`);
  }
  if (!payload.data) throw new PosTerminalsApiError(res.status, 'EMPTY_RESPONSE', 'La ruta no devolvió la terminal');
  return payload.data;
}

/**
 * Lo que la tarjeta pinta bajo «Esta caja»: el id local (siempre hay uno si
 * se abrió el POS en este equipo), la fila vinculada si el id corresponde a
 * una terminal de la lista, y si el vínculo apunta a una terminal que ya no
 * está (otra sucursal, desactivada, borrada por otro cliente).
 */
export interface LinkedTerminalView {
  localTerminalId: string | null;
  terminal: PosTerminal | null;
  /** true si hay id local pero no aparece entre las terminales dadas. */
  unlinked: boolean;
}

export class PosTerminalsService {
  /** Terminales de la sucursal (activas e inactivas), por nombre. Lanza sin organización o sin sucursal, antes de consultar. */
  static async listTerminals(branchId?: number | null): Promise<PosTerminal[]> {
    const orgId = resolveOrgId();
    const branch = resolveBranchId(branchId);
    const { data, error } = await supabase
      .from('pos_terminals')
      .select(TERMINAL_COLUMNS)
      .eq('organization_id', orgId)
      .eq('branch_id', branch)
      .order('is_active', { ascending: false })
      .order('name', { ascending: true });
    if (error) throw error;
    return (data ?? []) as PosTerminal[];
  }

  /** Crea una terminal en la sucursal (código en mayúsculas). Lanza con `code` 23505 si el código ya existe ahí (isDuplicateCodeError). */
  static async createTerminal(input: PosTerminalInput, branchId?: number | null): Promise<PosTerminal> {
    const invalid = validateTerminalInput(input);
    if (invalid) throw new Error(`terminal inválida: ${invalid}`);
    const orgId = resolveOrgId();
    const branch = resolveBranchId(branchId);
    const { data, error } = await supabase
      .from('pos_terminals')
      .insert({
        organization_id: orgId,
        branch_id: branch,
        name: input.name.trim(),
        code: normalizeTerminalCode(input.code),
        is_active: true,
      })
      .select(TERMINAL_COLUMNS)
      .single();
    if (error) throw error;
    return data as PosTerminal;
  }

  /**
   * Cambia nombre y/o código (en mayúsculas). Por la ruta de §7: exige rol
   * admin/manager resuelto en el servidor. `isForbiddenError` / `isDuplicateCodeError`
   * distinguen los fallos esperables.
   */
  static async updateTerminal(id: string, input: Partial<PosTerminalInput>): Promise<PosTerminal> {
    if (!isTerminalId(id)) throw new Error('id de terminal inválido');
    const patch: TerminalPatch = {};
    if (input.name !== undefined) {
      patch.name = input.name.trim();
      if (patch.name.length === 0) throw new Error('terminal inválida: name_required');
      if (patch.name.length > TERMINAL_NAME_MAX) throw new Error('terminal inválida: name_too_long');
    }
    if (input.code !== undefined) {
      patch.code = normalizeTerminalCode(input.code);
      if (!TERMINAL_CODE_PATTERN.test(patch.code)) throw new Error('terminal inválida: code_invalid');
    }
    if (Object.keys(patch).length === 0) throw new Error('nada que actualizar');
    const orgId = resolveOrgId();
    return patchTerminal(id, orgId, patch);
  }

  /** Activa o desactiva por la ruta de §7 (rol admin/manager en servidor). Nunca borra: el id puede estar en el localStorage de una caja. */
  static async setTerminalActive(id: string, isActive: boolean): Promise<PosTerminal> {
    if (!isTerminalId(id)) throw new Error('id de terminal inválido');
    const orgId = resolveOrgId();
    return patchTerminal(id, orgId, { is_active: isActive });
  }

  /**
   * Vincula ESTA caja (este navegador / esta máquina) a la terminal dada:
   * escribe su `id` en `pos_terminal_id`. Devuelve false si no se pudo
   * escribir (storage bloqueado) o el id no es un UUID.
   */
  static linkThisTerminal(terminal: Pick<PosTerminal, 'id'>): boolean {
    return setLocalTerminalId(terminal.id);
  }

  /** Id de terminal que esta caja tiene en localStorage (vinculado o UUID local de la Fase 0); null sin storage. */
  static getLocalTerminalId(): string | null {
    return readLocalTerminalId();
  }

  /**
   * Terminal vinculada a esta caja según la lista dada (evita una consulta
   * más: la tarjeta ya listó la sucursal). Si el id local no está en la
   * lista, `unlinked: true` y `terminal: null`. Una terminal vinculada pero
   * inactiva se devuelve igual (`terminal.is_active === false`): la tarjeta
   * lo distingue.
   */
  static resolveLinkedTerminal(terminals: ReadonlyArray<PosTerminal>, localTerminalId: string | null = readLocalTerminalId()): LinkedTerminalView {
    if (!localTerminalId) return { localTerminalId: null, terminal: null, unlinked: false };
    const terminal = terminals.find((t) => t.id === localTerminalId) ?? null;
    return { localTerminalId, terminal, unlinked: terminal === null };
  }

  /**
   * Terminal vinculada a esta caja, consultando la BD por su id (cualquier
   * sucursal de la organización: la caja pudo vincularse en otra). null si
   * no hay id local, no es una fila de esta organización o la consulta falla
   * (se avisa por consola; la caja sigue con su id local). Sin organización
   * válida lanza, como el resto del servicio.
   */
  static async getLinkedTerminal(): Promise<PosTerminal | null> {
    const localId = readLocalTerminalId();
    if (!localId) return null;
    const orgId = resolveOrgId();
    try {
      const { data, error } = await supabase
        .from('pos_terminals')
        .select(TERMINAL_COLUMNS)
        .eq('id', localId)
        .eq('organization_id', orgId)
        .maybeSingle();
      if (error) throw error;
      return (data as PosTerminal | null) ?? null;
    } catch (err) {
      console.warn('[pos-terminals] no se pudo leer la terminal vinculada:', err);
      return null;
    }
  }
}

export default PosTerminalsService;
