/**
 * Lógica pura de «Mi perfil» (Figma `03 Navegación y shell` › «Perfil de
 * usuario», 344:9278). Sin React ni Supabase: la prueban
 * `__tests__/perfilLogica.test.ts` y la usan las secciones.
 */

/** Orden de las secciones del frame 344:9281. */
export const SECCIONES_PERFIL = [
  'datos-personales',
  'seguridad',
  'preferencias',
  'sesiones',
  'organizacion-roles',
  'notificaciones',
  'panel-vendedor',
  'eliminar-cuenta',
] as const;
export type SeccionPerfil = (typeof SECCIONES_PERFIL)[number];

/** Clave de la sección activa en la URL (`/app/perfil?seccion=seguridad`). */
export const PARAMETRO_SECCION = 'seccion';

/** Valor de `?seccion=` → sección conocida (con los ids antiguos como alias). */
export function seccionPerfilDe(valor: string | null | undefined): SeccionPerfil {
  if (valor === 'organizacion-default' || valor === 'roles') return 'organizacion-roles';
  return (SECCIONES_PERFIL as readonly string[]).includes(valor ?? '') ? (valor as SeccionPerfil) : 'datos-personales';
}

/**
 * En móvil la lista de secciones es la entrada (348:12239) y una sección se
 * abre solo si la URL la nombra. En escritorio siempre hay una sección abierta.
 */
export function vistaMovil(valor: string | null | undefined): 'lista' | 'seccion' {
  return valor && valor.trim() ? 'seccion' : 'lista';
}

// ── Datos personales ────────────────────────────────────────────────────────

export interface DatosPersonales {
  nombre: string;
  apellidos: string;
  telefono: string;
}

/** Normaliza para guardar: espacios de sobra fuera; vacío → `null` en teléfono. */
export function normalizarDatos(d: DatosPersonales): { first_name: string; last_name: string; phone: string | null } {
  const limpio = (s: string) => s.replace(/\s+/g, ' ').trim();
  const telefono = d.telefono.trim();
  return { first_name: limpio(d.nombre), last_name: limpio(d.apellidos), phone: telefono || null };
}

/** ¿Hay algo que guardar? Compara ya normalizado (un espacio de más no cuenta). */
export function hayCambios(actual: DatosPersonales, original: DatosPersonales): boolean {
  const a = normalizarDatos(actual);
  const b = normalizarDatos(original);
  return a.first_name !== b.first_name || a.last_name !== b.last_name || a.phone !== b.phone;
}

export function nombreCompleto(nombre?: string | null, apellidos?: string | null): string {
  return [nombre, apellidos].map((s) => (s ?? '').trim()).filter(Boolean).join(' ');
}

// ── Correo ──────────────────────────────────────────────────────────────────

const CORREO = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export type ErrorCorreo = 'invalido' | 'igual' | 'no_coinciden';

/**
 * Cambio de correo (diálogo 347:12134): los dos campos y la doble
 * confirmación en un solo paso. `null` = se puede enviar.
 */
export function validarCambioCorreo(nuevo: string, confirmacion: string, actual: string | null | undefined): ErrorCorreo | null {
  const n = nuevo.trim().toLowerCase();
  if (!CORREO.test(n)) return 'invalido';
  if (n === (actual ?? '').trim().toLowerCase()) return 'igual';
  if (n !== confirmacion.trim().toLowerCase()) return 'no_coinciden';
  return null;
}

export type EstadoCorreo = 'confirmado' | 'sin_confirmar' | 'cambio_pendiente';

/**
 * Estado del correo según Auth: `email_confirmed_at` vacío → sin confirmar;
 * `new_email` presente → hay un cambio esperando el enlace.
 */
export function estadoCorreo(usuario: { email_confirmed_at?: string | null; new_email?: string | null } | null | undefined): EstadoCorreo {
  if (!usuario) return 'confirmado';
  if (usuario.new_email) return 'cambio_pendiente';
  if (!usuario.email_confirmed_at) return 'sin_confirmar';
  return 'confirmado';
}

// ── Foto de perfil ──────────────────────────────────────────────────────────

export const FOTO_MAXIMO_BYTES = 2 * 1024 * 1024;
export const FOTO_EXTENSIONES = ['jpg', 'jpeg', 'png', 'webp'] as const;
export const FOTO_ACCEPT = 'image/png,image/jpeg,image/webp';

export type ErrorFoto = 'formato' | 'tamano';

export function extensionDe(nombreArchivo: string): string {
  const partes = nombreArchivo.split('.');
  return partes.length > 1 ? (partes.pop() ?? '').toLowerCase() : '';
}

export function validarFoto(archivo: { name: string; size: number }): ErrorFoto | null {
  if (!(FOTO_EXTENSIONES as readonly string[]).includes(extensionDe(archivo.name))) return 'formato';
  if (archivo.size > FOTO_MAXIMO_BYTES) return 'tamano';
  return null;
}

/**
 * Ruta en el bucket `profiles` de una foto ya subida (`…/avatars/<archivo>`),
 * para borrarla al quitarla. Solo las de la propia persona (`<userId>-…`):
 * nunca se borra un archivo ajeno por una URL manipulada.
 */
export function rutaFotoPropia(url: string | null | undefined, userId: string): string | null {
  if (!url || !userId) return null;
  const m = url.match(/avatars\/([^?#/]+)/);
  if (!m) return null;
  return m[1].startsWith(`${userId}-`) ? `avatars/${m[1]}` : null;
}

// ── Sesiones y dispositivos ─────────────────────────────────────────────────

/**
 * `user_devices.location` guarda frases o coordenadas («Coordenadas GPS: 4.6,
 * -74.0», «Usuario denegó el acceso a la ubicación»). Según la propuesta de
 * ubicación (Figma 638:385779) eso deja de mostrarse: solo una ciudad o lugar
 * legible. Sin dato útil → `null` (no se inventa).
 */
export function ubicacionLegible(ubicacion: string | null | undefined): string | null {
  const v = (ubicacion ?? '').trim();
  if (!v) return null;
  if (/coordenadas|gps|denegó|denego|no disponible|desconocid|error|permiso|timeout|tiempo/i.test(v)) return null;
  if (/^-?\d+(\.\d+)?\s*,\s*-?\d+(\.\d+)?$/.test(v)) return null;
  return v;
}

/** «Windows 11 · Chrome 128 · Bogotá», solo con lo que haya. */
export function detalleDispositivo(d: {
  os?: string | null;
  os_version?: string | null;
  browser?: string | null;
  browser_version?: string | null;
  location?: string | null;
}): string[] {
  const conVersion = (a?: string | null, v?: string | null) => {
    const base = (a ?? '').trim();
    if (!base) return '';
    const mayor = (v ?? '').trim().split('.')[0];
    return mayor && mayor !== '0' ? `${base} ${mayor}` : base;
  };
  return [conVersion(d.os, d.os_version), conVersion(d.browser, d.browser_version), ubicacionLegible(d.location) ?? ''].filter(Boolean);
}

/** El dispositivo actual primero; los demás, del más reciente al más antiguo. */
export function ordenarDispositivos<T extends { actual: boolean; ultimaActividad: string | null }>(lista: readonly T[]): T[] {
  const tiempo = (s: string | null) => (s ? new Date(s).getTime() || 0 : 0);
  return [...lista].sort((a, b) => {
    if (a.actual !== b.actual) return a.actual ? -1 : 1;
    return tiempo(b.ultimaActividad) - tiempo(a.ultimaActividad);
  });
}

// ── Autenticación en dos pasos (TOTP de Supabase Auth) ──────────────────────

/** Código de la app de autenticación: exactamente 6 dígitos. */
export function codigoTotpValido(codigo: string): boolean {
  return /^\d{6}$/.test(codigo.trim());
}

/** Solo dígitos, como mucho 6 (pegar «123 456» funciona). */
export function limpiarCodigoTotp(entrada: string): string {
  return entrada.replace(/\D/g, '').slice(0, 6);
}

/** «JBSWY3DPEHPK3PXP» → «JBSW Y3DP EHPK 3PXP» (se copia sin espacios). */
export function agruparClave(secreto: string): string {
  return (secreto.replace(/\s+/g, '').match(/.{1,4}/g) ?? []).join(' ');
}

/**
 * ¿Se ofrece la autenticación en dos pasos? Decisión v2-12
 * (docs/design/AUTH-ACCESO-V2.md): el inicio de sesión todavía no pide el
 * segundo código, así que ofrecer activarla prometería una protección que no
 * existe. Se enciende con `NEXT_PUBLIC_PERFIL_MFA=1` cuando el acceso la exija.
 * Quien ya tenga un factor verificado ve siempre la fila, para poder quitarlo.
 */
export function mostrarDosPasos(bandera: string | undefined, factoresVerificados: number): boolean {
  return bandera === '1' || bandera === 'true' || factoresVerificados > 0;
}
