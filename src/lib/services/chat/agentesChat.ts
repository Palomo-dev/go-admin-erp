/**
 * Agentes del Chat: personas de la organización que pueden atender
 * conversaciones (Figma 91-chat-02, «Asignado a»). Reglas puras, sin
 * Supabase: el servidor (`agentesChat.server.ts`) lee los datos y aquí se
 * decide quién entra en la lista y cómo se muestra.
 *
 * «Puede atender» = puede entrar al módulo Chat con la MISMA regla del
 * middleware y del menú (`cargoPuedeEntrarAModulo`): super admin o sin cargo →
 * sin restricción; cargo sin filas → sin restricción; con filas, hace falta la
 * del módulo `chat` con `can_access`.
 */
import { cargoPuedeEntrarAModulo, type FilaAccesoModulo } from '@/lib/navigation/accesoCargo';

/** Código del módulo en `modules` / `job_position_module_access`. */
export const MODULO_CHAT = 'chat';

/** Persona que puede atender el Chat, tal como la ve la interfaz. */
export interface AgenteChat {
  /** `organization_members.id` (lo que guarda `conversations.assigned_member_id`). */
  memberId: number;
  userId: string;
  nombre: string;
  avatarUrl: string | null;
  /** Nombre del cargo, si tiene. */
  cargo: string | null;
  /** Conversaciones abiertas asignadas hoy a la persona. */
  abiertas: number;
  /** Es quien consulta («(tú)»). */
  esYo: boolean;
}

export interface PerfilAgente {
  first_name?: string | null;
  last_name?: string | null;
  email?: string | null;
}

/** Nombre visible: nombre y apellido; si no hay, el correo; si no, `null`. */
export function nombrePersona(p: PerfilAgente | null | undefined): string | null {
  if (!p) return null;
  const n = [p.first_name, p.last_name].map((s) => (s ?? '').trim()).filter(Boolean).join(' ');
  return n || (p.email ?? '').trim() || null;
}

/** «Laura Restrepo» → «Laura R.» (fila de la lista, Figma 91-chat-01). */
export function nombreCorto(nombre: string): string {
  const partes = nombre.trim().split(/\s+/).filter(Boolean);
  if (partes.length < 2) return partes[0] ?? '';
  return `${partes[0]} ${partes[1].charAt(0).toUpperCase()}.`;
}

/**
 * ¿El cargo deja entrar al Chat? `cargoId` nulo = sin restricción (super
 * admin, sin cargo). Las filas que no se pudieron leer cuentan como «sin
 * restricción» (fail open, igual que el middleware).
 */
export function cargoPuedeUsarChat(cargoId: string | null, filasPorCargo: ReadonlyMap<string, readonly FilaAccesoModulo[]> | null): boolean {
  if (!cargoId || !filasPorCargo) return true;
  return cargoPuedeEntrarAModulo(filasPorCargo.get(cargoId) ?? [], MODULO_CHAT);
}

/** Cuenta conversaciones por `assigned_member_id`. */
export function contarPorAgente(filas: readonly { assigned_member_id: number | string | null }[]): Map<number, number> {
  const cuenta = new Map<number, number>();
  for (const f of filas) {
    if (f.assigned_member_id == null) continue;
    const id = Number(f.assigned_member_id);
    cuenta.set(id, (cuenta.get(id) ?? 0) + 1);
  }
  return cuenta;
}

/** Orden de la lista: por nombre (insensible a tildes y mayúsculas); «tú» al final. */
export function ordenarAgentes(lista: readonly AgenteChat[]): AgenteChat[] {
  return [...lista].sort((a, b) => {
    if (a.esYo !== b.esYo) return a.esYo ? 1 : -1;
    return a.nombre.localeCompare(b.nombre, 'es', { sensitivity: 'base' });
  });
}

function normalizar(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
}

/** Buscador del selector: por nombre o cargo, sin tildes. */
export function filtrarAgentes(lista: readonly AgenteChat[], termino: string): AgenteChat[] {
  const q = normalizar(termino);
  if (!q) return [...lista];
  return lista.filter((a) => normalizar(a.nombre).includes(q) || normalizar(a.cargo ?? '').includes(q));
}

/** Agente asignado a una conversación, o `null` (sin asignar o ya sin acceso). */
export function agenteAsignado(lista: readonly AgenteChat[], memberId: number | string | null | undefined): AgenteChat | null {
  if (memberId == null) return null;
  return lista.find((a) => a.memberId === Number(memberId)) ?? null;
}

/**
 * `memberId` del cuerpo de `PUT …/asignacion`: entero positivo o `null`
 * (quitar asignación). `undefined` = cuerpo inválido.
 */
export function leerMemberId(cuerpo: unknown): number | null | undefined {
  if (!cuerpo || typeof cuerpo !== 'object' || !('memberId' in cuerpo)) return undefined;
  const v = (cuerpo as { memberId: unknown }).memberId;
  if (v === null) return null;
  const n = typeof v === 'string' && v.trim() !== '' ? Number(v) : v;
  return typeof n === 'number' && Number.isInteger(n) && n > 0 ? n : undefined;
}
