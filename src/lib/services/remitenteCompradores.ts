/**
 * Remitente de los correos a COMPRADORES (clientes de las organizaciones) — el único lugar donde
 * se decide cuando la organización no tiene dominio propio verificado.
 *
 * Regla del dueño (2026-11-24): un comprador NUNCA recibe un correo con la marca de GO Admin ni
 * desde una dirección de GO Admin. El nombre visible es siempre el del negocio; la dirección es la
 * del dominio verificado de la organización (`resolveSender`, modo `org`) y, si no tiene, la de
 * respaldo que devuelve `correoRespaldoTiendas()`.
 *
 * - `CORREO_RESPALDO_TIENDAS` (Vercel, proyecto del ERP): dirección de un dominio neutro, sin
 *   marca, verificado en Resend con la key maestra (p. ej. `pedidos@<dominio-neutro>`). Admite
 *   `Nombre <correo>`: el nombre se descarta.
 * - Mientras no exista: la dirección de siempre (la que pasa quien llama, o `EMAIL_FROM_ADDRESS`,
 *   o `notificaciones@…` de la plataforma) para no dejar de avisar a nadie, con un `console.warn`
 *   una vez por arranque.
 *
 * Los correos a usuarios del ERP (avisos internos, acceso, reportes, dominios) no pasan por aquí.
 * La tienda web (goadmin-websites) tiene su gemela en `lib/email/remitenteRespaldo.ts`.
 */

const RESPALDO_LEGADO = 'notificaciones@goadmin.io';

let avisado = false;

/** `correo@x.co` o `Nombre <correo@x.co>` → `correo@x.co` en minúsculas; cualquier otra cosa, null. */
export function direccionDe(valor: unknown): string | null {
  if (typeof valor !== 'string') return null;
  const m = /<([^<>]+)>\s*$/.exec(valor.trim());
  const c = (m ? m[1] : valor).trim().toLowerCase();
  if (c.length > 254 || !/^[^\s@<>"]+@[^\s@<>"]+\.[^\s@<>"]+$/.test(c)) return null;
  return c;
}

/**
 * Dirección de respaldo para correos a compradores. `legado` = la que usaba quien llama antes de
 * esta regla (se conserva mientras no exista la variable).
 */
export function correoRespaldoTiendas(legado?: string | null): string {
  const propia = direccionDe(process.env.CORREO_RESPALDO_TIENDAS);
  if (propia) return propia;
  if (!avisado) {
    avisado = true;
    console.warn(
      '[correo] Falta CORREO_RESPALDO_TIENDAS: los correos a compradores de organizaciones sin dominio verificado salen desde la dirección de respaldo de la plataforma (con el nombre del negocio). Configúrala en Vercel con una dirección de un dominio neutro verificado en Resend.',
    );
  }
  return direccionDe(legado) ?? direccionDe(process.env.EMAIL_FROM_ADDRESS) ?? RESPALDO_LEGADO;
}

/** Nombre visible: el del negocio, sin caracteres que rompan la cabecera. */
export function nombreVisibleNegocio(nombre: string | null | undefined): string {
  return String(nombre ?? '').replace(/[\r\n<>"]/g, ' ').replace(/\s+/g, ' ').trim();
}

/**
 * From de un correo a un comprador cuando la organización no tiene dominio propio:
 * `Negocio <respaldo>`. Sin nombre, solo la dirección: nunca «GO Admin».
 */
export function remitenteComprador(nombreNegocio: string | null | undefined, legado?: string | null): string {
  const nombre = nombreVisibleNegocio(nombreNegocio);
  const correo = correoRespaldoTiendas(legado);
  return nombre ? `${nombre} <${correo}>` : correo;
}
