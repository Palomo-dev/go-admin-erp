/**
 * Invitaciones a una organización — lógica de SERVIDOR (service role).
 *
 * `invitations.code` es un secreto al portador: quien lo tiene puede crear la
 * cuenta del invitado (si aún no existe) y entrar a la organización con el rol
 * de la invitación. Por eso (GO-sec, auditoría de acceso 2026-09-28,
 * docs/design/AUTH-ACCESO-V2.md §4.1):
 *
 *  - el código se genera en el servidor con `crypto.randomBytes` (antes
 *    `Math.random()` en el navegador, 8 caracteres);
 *  - solo viaja hacia un navegador dentro del enlace del correo que recibe el
 *    invitado, o tras un `verifyOtp` correcto (el token del correo prueba que
 *    quien abre el enlace controla el buzón);
 *  - nunca se busca una invitación por correo para ENTREGAR su código a quien
 *    solo conoce el correo: por correo solo se REENVÍA el enlace a ese buzón;
 *  - la comparación final del código es en tiempo constante.
 *
 * Este módulo importa `crypto` de Node: no se puede importar desde el cliente.
 */
import { createHash, randomBytes, timingSafeEqual } from 'crypto';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { esFormatoCodigoValido } from './formatoCodigoInvitacion';

/** Vigencia de una invitación nueva o reenviada. */
export const DIAS_VIGENCIA_INVITACION = 30;

/** 32 bytes aleatorios en hexadecimal (64 caracteres, 256 bits). */
export function generarCodigoInvitacion(): string {
  return randomBytes(32).toString('hex');
}

// Formato del código: compartido con el navegador (sin dependencias de Node).
export { esFormatoCodigoValido };

/** Igualdad en tiempo constante (se comparan los SHA-256, de igual longitud). */
export function codigosIguales(a: string, b: string): boolean {
  const ha = createHash('sha256').update(a, 'utf8').digest();
  const hb = createHash('sha256').update(b, 'utf8').digest();
  return timingSafeEqual(ha, hb);
}

/** Referencia para logs: nunca el código completo. */
export function referenciaCodigo(codigo: string | null | undefined): string {
  if (!codigo) return '(sin código)';
  return `${codigo.slice(0, 4)}…(${codigo.length})`;
}

/** `persona@ejemplo.com` → `pe•••@ejemplo.com`. */
export function enmascararCorreo(email: string): string {
  const [usuario, dominio] = String(email).split('@');
  if (!dominio) return '•••';
  const visible = usuario.slice(0, Math.min(2, Math.max(1, usuario.length - 1)));
  return `${visible}•••@${dominio}`;
}

export function normalizarCorreo(email: string): string {
  return String(email).toLowerCase().trim();
}

/** Fila que devuelve `validate_invitation_by_code` (solo vigentes). */
export interface InvitacionVigente {
  id: number;
  email: string;
  code: string;
  status: string;
  role_id: number | null;
  organization_id: number;
  expires_at: string | null;
  organization_name: string | null;
  role_name: string | null;
}

/**
 * Invitación VIGENTE (pending y sin vencer) cuyo código es exactamente el
 * recibido. `null` para cualquier otro caso —formato inválido, inexistente,
 * usada, revocada, vencida— para que las rutas respondan igual en todos.
 */
export async function buscarInvitacionVigentePorCodigo(
  admin: SupabaseClient,
  codigo: unknown,
): Promise<InvitacionVigente | null> {
  if (!esFormatoCodigoValido(codigo)) return null;
  const { data, error } = await admin.rpc('validate_invitation_by_code', { invitation_code: codigo });
  if (error) throw error;
  const fila = (Array.isArray(data) ? data[0] : null) as InvitacionVigente | null;
  if (!fila || typeof fila.code !== 'string') return null;
  if (!codigosIguales(fila.code, codigo)) return null;
  if (fila.status !== 'pending') return null;
  if (fila.expires_at && new Date(fila.expires_at).getTime() <= Date.now()) return null;
  return fila;
}

export interface InvitacionPendientePorCorreo {
  id: number;
  code: string;
  organization_id: number;
  role_id: number | null;
  organizationName: string;
}

/**
 * Invitación vigente más reciente para un correo. SOLO para usos de servidor
 * en los que el buzón ya está probado (tras `verifyOtp`) o para reenviar el
 * enlace a ese mismo buzón: el código que devuelve no se entrega a quien solo
 * aportó el correo.
 *
 * `status = 'pending'` no implica vigente: una invitación caducada conserva
 * ese estado, así que se filtra también por `expires_at`.
 */
export async function buscarInvitacionVigentePorCorreo(
  admin: SupabaseClient,
  email: string,
): Promise<InvitacionPendientePorCorreo | null> {
  const correo = normalizarCorreo(email);
  if (!correo) return null;
  const { data, error } = await admin
    .from('invitations')
    .select('id, code, organization_id, role_id, organizations!inner(name)')
    .eq('email', correo)
    .eq('status', 'pending')
    .or(`expires_at.is.null,expires_at.gt.${new Date().toISOString()}`)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  // PostgREST devuelve el embed to-one como objeto; se contempla el array por
  // si el join pasara a to-many.
  const orgRel = (data as { organizations?: { name?: string } | { name?: string }[] | null }).organizations;
  const organizationName =
    (Array.isArray(orgRel) ? orgRel[0]?.name : orgRel?.name) || 'la organización';
  return {
    id: data.id as number,
    code: data.code as string,
    organization_id: data.organization_id as number,
    role_id: (data.role_id as number | null) ?? null,
    organizationName,
  };
}

/**
 * Reenvía al BUZÓN invitado un enlace mágico que termina en el asistente de
 * la invitación. No devuelve el código ni distingue hacia fuera si había
 * invitación: `enviado` es solo para los logs del llamante.
 */
export async function reenviarEnlaceInvitacion(
  admin: SupabaseClient,
  email: string,
  origin: string,
): Promise<{ enviado: boolean }> {
  const correo = normalizarCorreo(email);
  const invitacion = await buscarInvitacionVigentePorCorreo(admin, correo);
  if (!invitacion) return { enviado: false };

  const anon = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
  const { error } = await anon.auth.signInWithOtp({
    email: correo,
    options: {
      emailRedirectTo: `${origin}/auth/invite?invite_code=${encodeURIComponent(invitacion.code)}`,
      data: {
        organization_id: invitacion.organization_id,
        organization_name: invitacion.organizationName,
      },
    },
  });
  if (error) {
    console.error('[invitaciones] Error reenviando el enlace:', error.message);
    return { enviado: false };
  }
  return { enviado: true };
}
