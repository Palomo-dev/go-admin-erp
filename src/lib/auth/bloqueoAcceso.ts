/**
 * Bloqueo por intentos fallidos de inicio de sesión (acceso v3, fase 5;
 * docs/design/AUTH-ACCESO-V2.md §12.4). SOLO servidor.
 *
 * Dos claves por intento, ambas SHA-256 (nunca el correo ni la IP en claro):
 *  - cuenta + IP: 5 fallos en 15 min bloquean 15 min;
 *  - solo IP:     20 fallos en 15 min bloquean 15 min (muchas cuentas desde un sitio).
 * Contador persistente en `auth_intentos_acceso` por las RPC `fn_acceso_*`
 * (solo service_role, migración 20260929210000).
 */
import { createHash } from 'crypto';

export const LIMITE_FALLOS_CUENTA_IP = 5;
export const LIMITE_FALLOS_IP = 20;

export interface ClavesAcceso {
  cuentaIp: string;
  ip: string;
}

const sha256 = (v: string) => createHash('sha256').update(v).digest('hex');

/** Claves del contador. `correo` ya normalizado (minúsculas, sin espacios). */
export function clavesDeAcceso(correo: string, ip: string): ClavesAcceso {
  return {
    cuentaIp: `c:${sha256(`${correo}|${ip}`)}`,
    ip: `i:${sha256(ip)}`,
  };
}

interface RpcClient {
  rpc(fn: string, args: Record<string, unknown>): PromiseLike<{ data: unknown; error: { message: string } | null }>;
}

function fecha(valor: unknown): Date | null {
  if (!valor) return null;
  const d = new Date(String(valor));
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Bloqueo vigente (el que más dura) o null. Si la RPC falla, LANZA: la ruta falla cerrado. */
export async function bloqueoVigente(cliente: RpcClient, claves: ClavesAcceso): Promise<Date | null> {
  const { data, error } = await cliente.rpc('fn_acceso_bloqueo_vigente', { p_claves: [claves.cuentaIp, claves.ip] });
  if (error) throw new Error(`fn_acceso_bloqueo_vigente: ${error.message}`);
  return fecha(data);
}

/** Registra un fallo en las dos claves. Devuelve el bloqueo que haya quedado vigente, o null. */
export async function registrarFallo(cliente: RpcClient, claves: ClavesAcceso): Promise<Date | null> {
  const { data, error } = await cliente.rpc('fn_acceso_registrar_fallo', {
    p_entradas: [
      { clave: claves.cuentaIp, limite: LIMITE_FALLOS_CUENTA_IP },
      { clave: claves.ip, limite: LIMITE_FALLOS_IP },
    ],
  });
  if (error) throw new Error(`fn_acceso_registrar_fallo: ${error.message}`);
  return fecha(data);
}

/** Acceso correcto: borra el contador de cuenta + IP (el de la IP sigue contando). */
export async function limpiarFallos(cliente: RpcClient, claves: ClavesAcceso): Promise<void> {
  const { error } = await cliente.rpc('fn_acceso_limpiar', { p_clave: claves.cuentaIp });
  if (error) console.warn('[acceso] no se pudo limpiar el contador de fallos:', error.message);
}
