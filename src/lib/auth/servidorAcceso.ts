/**
 * Utilidades de SERVIDOR para las rutas públicas de acceso (acceso v3,
 * docs/design/AUTH-ACCESO-V2.md §12.4): cliente anónimo sin persistencia,
 * correo normalizado, respuesta uniforme y la política de contraseña con la
 * comprobación de filtraciones.
 *
 * No importar desde el navegador.
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import { estaFiltrada, motivoRechazo, type MotivoRechazo } from '@/lib/auth/politicaContrasena';

export const CORREO_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function normalizarCorreoAcceso(valor: unknown): string | null {
  if (typeof valor !== 'string') return null;
  const correo = valor.trim().toLowerCase();
  if (correo.length > 254 || !CORREO_RE.test(correo)) return null;
  return correo;
}

/** Cliente con la clave anónima, sin sesión ni refresco (para Auth desde el servidor). */
export function clienteAnonimoServidor(): SupabaseClient {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
  });
}

/** Respuesta 429 con Retry-After. */
export function demasiadasSolicitudes(resetAt: Date, cuerpo: Record<string, unknown> = {}) {
  const retry = Math.max(1, Math.ceil((resetAt.getTime() - Date.now()) / 1000));
  return NextResponse.json({ ok: false, codigo: 'demasiadas', ...cuerpo }, { status: 429, headers: { 'Retry-After': String(retry) } });
}

/**
 * Política única en el servidor: longitud, distinta del correo y no filtrada.
 * Si Have I Been Pwned no responde, se deja pasar y se registra (no se bloquean
 * altas por la caída de un tercero; la protección de Supabase, cuando el dueño
 * la encienda, es la segunda barrera).
 */
export async function validarContrasenaServidor(
  contrasena: unknown,
  correo: string | null | undefined,
  contexto: string,
  fetchImpl?: typeof fetch,
): Promise<MotivoRechazo | null> {
  const basico = motivoRechazo(contrasena, { correo });
  if (basico) return basico;
  const filtrada = await estaFiltrada(contrasena as string, { fetchImpl });
  if (filtrada === null) console.warn(`[${contexto}] no se pudo comprobar la contraseña contra filtraciones (se deja pasar)`);
  return filtrada ? 'filtrada' : null;
}
