/**
 * Validadores de formato para la identidad web de las sucursales (Fase 6).
 *
 * Compartidos entre el frontend (BranchForm) y el backend (branchService) para
 * defensa en profundidad: el frontend valida en onChange/submit y el service
 * valida de nuevo antes de persistir, de modo que un bypass directo al service
 * (script, otro consumidor) no pueda guardar datos mal formateados que rompan
 * la resolución de URL en goadmin-websites.
 *
 * Las funciones retornan `string` (mensaje de error) si el valor es inválido,
 * o `null` si es válido. Por eso se usa `if (err)` y no `if (!validateX())`.
 */

export const SLUG_REGEX = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
// Corrección QA R2: regex de label DNS (RFC 1035) — 1-63 chars, alfanum y
// guiones, sin guiones al inicio/final. Aplica tanto a subdominio como a
// cada label de un dominio.
const DNS_LABEL_REGEX = /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$/;
export const SUBDOMAIN_REGEX = DNS_LABEL_REGEX;

/**
 * Slugs reservados del router público — no pueden usarse como slug de outlet
 * porque colisionarían con las rutas del sitio web (menu, productos, checkout,
 * etc.). Si se usan, el outlet no sería accesible por path.
 */
export const RESERVED_SLUGS = [
  'home', 'menu', 'productos', 'categorias', 'espacios', 'servicios',
  'ofertas', 'reserva', 'reservas', 'agendar', 'cotizar', 'pedido',
  'ticket', 'tracking', 'viajes', 'pases', 'membresias', 'checkout',
  'carrito', 'mi-cuenta', 'consultar-pedido', 'auth', 'api', 'admin',
  'app', 'www',
];

/**
 * Valida el formato del slug (resolución por path).
 * Retorna `null` si es válido (o vacío, pues es opcional salvo al publicar),
 * o un mensaje de error descriptivo si es inválido.
 */
export function validateSlug(slug: string): string | null {
  if (!slug) return null; // opcional, no obligatorio
  if (slug.length < 2) return 'El slug debe tener al menos 2 caracteres';
  if (slug.length > 60) return 'El slug no puede exceder 60 caracteres';
  if (!SLUG_REGEX.test(slug)) {
    return 'Solo minúsculas, números y guiones (no consecutivos, ni al inicio/final). Sin espacios.';
  }
  if (RESERVED_SLUGS.includes(slug.toLowerCase())) {
    return `El slug '${slug}' está reservado`;
  }
  return null;
}

/**
 * Valida el formato del subdominio (label DNS único, sin puntos).
 * Retorna `null` si es válido (o vacío), o un mensaje de error.
 */
export function validateSubdomain(subdomain: string): string | null {
  if (!subdomain) return null; // opcional, no obligatorio
  if (subdomain.length > 63) return 'El subdominio no puede exceder 63 caracteres';
  if (!SUBDOMAIN_REGEX.test(subdomain)) {
    return 'Solo minúsculas, números y guiones. Debe empezar y terminar con letra o número.';
  }
  return null;
}

/**
 * Valida el formato de un dominio personalizado.
 * `field` se incluye en el mensaje de error para identificar el campo.
 * Retorna `null` si es válido (o vacío), o un mensaje de error.
 */
export function validateDomain(domain: string, field = 'custom_domain'): string | null {
  if (!domain) return null; // opcional, no obligatorio
  const normalized = domain.toLowerCase().trim();
  if (normalized.length > 253) return `${field} no puede exceder 253 caracteres`;
  const labels = normalized.split('.');
  if (labels.length < 2) return `${field} no es un dominio válido`;
  for (const label of labels) {
    if (!DNS_LABEL_REGEX.test(label)) return `${field} no es un dominio válido`;
  }
  // TLD debe ser solo letras y mínimo 2 caracteres (no TLD numérico)
  const tld = labels[labels.length - 1];
  if (!/^[a-z]{2,}$/.test(tld)) return `${field} no es un dominio válido`;
  return null;
}

/**
 * Valida el FORMATO de slug, subdomain y custom_domain en conjunto.
 * A diferencia de `branchService.validateWebIdentity` (que valida unicidad
 * contra la BD), este helper solo verifica que los valores cumplan las regex
 * de formato. Debe llamarse junto con validateWebIdentity para defensa en
 * profundidad.
 *
 * Solo valida los campos que vengan presentes (no vacíos); los ausentes se
 * omiten para no bloquear updates parciales.
 *
 * Retorna un arreglo de mensajes de error (vacío si todo es válido).
 */
export function validateWebIdentityFormat(data: {
  slug?: string | null;
  subdomain?: string | null;
  custom_domain?: string | null;
}): string[] {
  const errors: string[] = [];

  if (data.slug) {
    const err = validateSlug(data.slug);
    if (err) errors.push(`slug: ${err}`);
  }
  if (data.subdomain) {
    const err = validateSubdomain(data.subdomain);
    if (err) errors.push(`subdomain: ${err}`);
  }
  if (data.custom_domain) {
    const err = validateDomain(data.custom_domain, 'custom_domain');
    if (err) errors.push(err); // validateDomain ya incluye el nombre del campo
  }

  return errors;
}
