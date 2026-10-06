/**
 * Autenticación en dos pasos de «Mi perfil › Seguridad» (Figma 347:12179 y
 * 347:12238) con el MFA TOTP de Supabase Auth, desde el cliente del navegador
 * (`@/lib/supabase/config`). Aquí no se guarda ningún secreto: Auth genera la
 * clave, la guarda y verifica los códigos.
 *
 * Flujo de alta: `iniciarAlta` (enroll → QR y clave) → la persona escribe el
 * código → `confirmarAlta` (challenge + verify). Si cancela a mitad,
 * `descartarAlta` borra el factor sin verificar para no dejar basura.
 *
 * Baja: Auth solo deja quitar un factor verificado con una sesión aal2, así
 * que `desactivar` primero verifica un código (sube la sesión a aal2) y luego
 * hace `unenroll`.
 *
 * Códigos de respaldo: NO. El esquema `auth` tiene `mfa_recovery_codes`, pero
 * `@supabase/auth-js` 2.69 no expone ninguna API para generarlos ni usarlos;
 * inventarlos en una tabla propia sería una segunda implementación de Auth.
 *
 * El cliente se pasa como parámetro para poder probarlo sin red.
 */

/** Lo mínimo de `supabase.auth.mfa` que se usa (lo cumple el cliente real). */
export interface ClienteMfa {
  listFactors(): Promise<{ data: { totp: FactorTotp[] } | null; error: unknown }>;
  enroll(params: { factorType: 'totp'; friendlyName?: string; issuer?: string }): Promise<{
    data: { id: string; totp: { qr_code: string; secret: string; uri: string } } | null;
    error: unknown;
  }>;
  challenge(params: { factorId: string }): Promise<{ data: { id: string } | null; error: unknown }>;
  verify(params: { factorId: string; challengeId: string; code: string }): Promise<{ data: unknown; error: unknown }>;
  unenroll(params: { factorId: string }): Promise<{ data: unknown; error: unknown }>;
}

export interface FactorTotp {
  id: string;
  status: 'verified' | 'unverified' | string;
  friendly_name?: string | null;
  created_at?: string;
}

export interface AltaTotp {
  factorId: string;
  /** Imagen del QR lista para `<img src>` (SVG en data URI). */
  qr: string;
  /** Clave para teclear a mano si no se puede escanear. */
  secreto: string;
}

export type ErrorDosPasos = 'codigo' | 'red' | 'sesion';

export class FalloDosPasos extends Error {
  constructor(public codigo: ErrorDosPasos, mensaje?: string) {
    super(mensaje ?? codigo);
    this.name = 'FalloDosPasos';
  }
}

/** Auth devuelve el QR como SVG suelto o ya como data URI, según la versión. */
export function qrComoDataUri(qr: string): string {
  return qr.startsWith('data:') ? qr : `data:image/svg+xml;utf-8,${encodeURIComponent(qr)}`;
}

/** Un error de Auth por código equivocado o vencido, frente a uno de red/servidor. */
function esErrorDeCodigo(error: unknown): boolean {
  const e = error as { code?: string; status?: number; message?: string } | null;
  if (!e) return false;
  if (e.code === 'mfa_verification_failed' || e.code === 'mfa_challenge_expired') return true;
  return e.status === 422 || e.status === 400 || /invalid|expired|código|code/i.test(e.message ?? '');
}

export async function factoresTotp(cliente: ClienteMfa): Promise<FactorTotp[]> {
  const { data, error } = await cliente.listFactors();
  if (error) throw new FalloDosPasos('red');
  return data?.totp ?? [];
}

export function factoresVerificados(factores: readonly FactorTotp[]): FactorTotp[] {
  return factores.filter((f) => f.status === 'verified');
}

/**
 * Empieza el alta. Antes borra altas a medias de intentos anteriores: Auth
 * rechaza un segundo factor con el mismo nombre y no sirven para nada.
 */
export async function iniciarAlta(cliente: ClienteMfa, nombre = 'GO Admin'): Promise<AltaTotp> {
  const previos = await factoresTotp(cliente);
  for (const f of previos.filter((x) => x.status !== 'verified')) {
    await cliente.unenroll({ factorId: f.id });
  }
  const { data, error } = await cliente.enroll({ factorType: 'totp', friendlyName: `${nombre} ${Date.now().toString(36)}`, issuer: 'GO Admin' });
  if (error || !data) throw new FalloDosPasos('red');
  return { factorId: data.id, qr: qrComoDataUri(data.totp.qr_code), secreto: data.totp.secret };
}

/** challenge + verify con el código de la app. */
async function verificarCodigo(cliente: ClienteMfa, factorId: string, codigo: string): Promise<void> {
  const reto = await cliente.challenge({ factorId });
  if (reto.error || !reto.data) throw new FalloDosPasos('red');
  const { error } = await cliente.verify({ factorId, challengeId: reto.data.id, code: codigo.trim() });
  if (error) throw new FalloDosPasos(esErrorDeCodigo(error) ? 'codigo' : 'red');
}

export async function confirmarAlta(cliente: ClienteMfa, factorId: string, codigo: string): Promise<void> {
  await verificarCodigo(cliente, factorId, codigo);
}

/** Cancelar el alta: el factor sin verificar no debe quedarse. Nunca lanza. */
export async function descartarAlta(cliente: ClienteMfa, factorId: string): Promise<void> {
  try {
    await cliente.unenroll({ factorId });
  } catch {
    // Si falla, `iniciarAlta` lo limpia en el siguiente intento.
  }
}

/** Desactivar: verifica un código (sesión aal2) y quita el factor. */
export async function desactivar(cliente: ClienteMfa, factorId: string, codigo: string): Promise<void> {
  await verificarCodigo(cliente, factorId, codigo);
  const { error } = await cliente.unenroll({ factorId });
  if (error) throw new FalloDosPasos('red');
}
