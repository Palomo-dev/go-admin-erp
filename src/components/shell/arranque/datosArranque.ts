/**
 * Qué se sabe de la persona y su organización ANTES de montar la app, para el
 * estado «Entrando a tu organización» de la pantalla de arranque.
 *
 * Solo lee lo que ya está en el navegador: arrancar no puede esperar a la base
 * de datos. Si algo falta, la pantalla lo omite (nunca inventa un nombre).
 *
 * - Organización: `organizacionActiva`, que escribe `guardarOrganizacionActiva`
 *   (useOrganization.ts) con id, nombre y logo.
 * - Nombre: la caché del perfil del AppLayout (`appLayout_userData_cache`), solo
 *   si es de la MISMA cuenta (mismo correo que la sesión: en un equipo
 *   compartido la caché puede ser de otra persona); si no, los metadatos de
 *   Supabase Auth.
 * - Sucursal: hoy el navegador guarda solo su id, no su nombre; queda `null`
 *   hasta que haya una fuente local.
 */

export interface OrganizacionArranque {
  id: number;
  nombre: string;
  logoUrl: string | null;
}

export interface DatosArranque {
  organizacion: OrganizacionArranque | null;
  /** Primer nombre de la persona, para «Hola, <nombre>». */
  usuario: string | null;
  sucursal: string | null;
}

/** Lo mínimo de una sesión de Supabase que se necesita aquí. */
export interface SesionArranque {
  user: {
    email?: string | null;
    user_metadata?: Record<string, unknown> | null;
  };
}

/** Lo mínimo de `localStorage`; en pruebas se pasa un objeto. */
export interface AlmacenArranque {
  getItem(clave: string): string | null;
}

export const CLAVE_ORGANIZACION = 'organizacionActiva';
export const CLAVE_CACHE_PERFIL = 'appLayout_userData_cache';

function leerJson(almacen: AlmacenArranque, clave: string): unknown {
  try {
    const crudo = almacen.getItem(clave);
    return crudo ? JSON.parse(crudo) : null;
  } catch {
    return null;
  }
}

function texto(valor: unknown): string | null {
  return typeof valor === 'string' && valor.trim() !== '' ? valor.trim() : null;
}

/** «Ana María Pérez» → «Ana»; nada útil → null. */
export function primerNombre(nombre: unknown): string | null {
  const limpio = texto(nombre);
  if (!limpio || limpio.includes('@')) return null;
  return limpio.split(/\s+/)[0] ?? null;
}

function leerOrganizacion(almacen: AlmacenArranque): OrganizacionArranque | null {
  const org = leerJson(almacen, CLAVE_ORGANIZACION) as { id?: unknown; name?: unknown; logo_url?: unknown } | null;
  if (!org || typeof org !== 'object') return null;
  const id = typeof org.id === 'number' ? org.id : Number(org.id);
  const nombre = texto(org.name);
  if (!Number.isInteger(id) || id <= 0 || !nombre) return null;
  return { id, nombre, logoUrl: texto(org.logo_url) };
}

function leerUsuario(sesion: SesionArranque, almacen: AlmacenArranque | null): string | null {
  const correo = texto(sesion.user.email)?.toLowerCase() ?? null;
  if (almacen && correo) {
    const cache = leerJson(almacen, CLAVE_CACHE_PERFIL) as { data?: { name?: unknown; email?: unknown } } | null;
    const correoCache = texto(cache?.data?.email)?.toLowerCase() ?? null;
    if (correoCache === correo) {
      const nombre = primerNombre(cache?.data?.name);
      if (nombre) return nombre;
    }
  }
  const meta = sesion.user.user_metadata ?? {};
  return primerNombre(meta.first_name) ?? primerNombre(meta.full_name) ?? primerNombre(meta.name);
}

export function leerDatosArranque(sesion: SesionArranque | null, almacen: AlmacenArranque | null): DatosArranque {
  if (!sesion) return { organizacion: null, usuario: null, sucursal: null };
  return {
    organizacion: almacen ? leerOrganizacion(almacen) : null,
    usuario: leerUsuario(sesion, almacen),
    sucursal: null,
  };
}

/** `localStorage` si se puede leer (modo privado, iframes y SSR pueden negarlo). */
export function almacenDelNavegador(): AlmacenArranque | null {
  try {
    return typeof window !== 'undefined' ? window.localStorage : null;
  } catch {
    return null;
  }
}
