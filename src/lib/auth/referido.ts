/**
 * Código del vendedor que trajo al cliente (`/auth/signup?ref=VEND-001`).
 *
 * Con el registro dividido (acceso v3) la organización se crea DESPUÉS de
 * confirmar el correo, a veces en otra pestaña u otro día. Para cumplir con el
 * contrato de Legal (27-sep-2026): sin consentimiento de marketing, nada persiste
 * más allá de la sesión. El código se guarda en sessionStorage (solo esta sesión)
 * y en user_metadata al crear la cuenta (sobrevive entre dispositivos).
 * Con consentimiento de marketing, puede ir en la cookie goadmin_attr (90 días).
 */
const CLAVE = 'go-referido';
const FORMATO = /^[A-Za-z0-9_-]{2,40}$/;

export function guardarReferido(codigo: string | null | undefined): void {
  if (!codigo || !FORMATO.test(codigo) || typeof sessionStorage === 'undefined') return;
  try {
    sessionStorage.setItem(CLAVE, codigo);
  } catch {
    /* sin almacenamiento: se pierde el referido, no el registro */
  }
}

export function leerReferido(): string | null {
  if (typeof sessionStorage === 'undefined') return null;
  try {
    const v = sessionStorage.getItem(CLAVE);
    if (!v || !FORMATO.test(v)) return null;
    return v;
  } catch {
    return null;
  }
}

export function olvidarReferido(): void {
  try {
    sessionStorage.removeItem(CLAVE);
  } catch {
    /* nada */
  }
}
