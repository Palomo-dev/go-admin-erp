/**
 * Código del vendedor que trajo al cliente (`/auth/signup?ref=VEND-001`).
 *
 * Con el registro dividido (acceso v3) la organización se crea DESPUÉS de
 * confirmar el correo, a veces en otra pestaña u otro día: el código se guarda
 * en este navegador hasta 30 días y lo lee el asistente de alta, que lo
 * registra con `fn_registrar_referido_vendedor` (valida el código en el
 * servidor).
 */
const CLAVE = 'go-referido';
const VIGENCIA_MS = 30 * 24 * 60 * 60 * 1000;
const FORMATO = /^[A-Za-z0-9_-]{2,40}$/;

export function guardarReferido(codigo: string | null | undefined, ahora: number = Date.now()): void {
  if (!codigo || !FORMATO.test(codigo) || typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(CLAVE, JSON.stringify({ codigo, hasta: ahora + VIGENCIA_MS }));
  } catch {
    /* sin almacenamiento: se pierde el referido, no el registro */
  }
}

export function leerReferido(ahora: number = Date.now()): string | null {
  if (typeof localStorage === 'undefined') return null;
  try {
    const v = JSON.parse(localStorage.getItem(CLAVE) || 'null') as { codigo?: string; hasta?: number } | null;
    if (!v?.codigo || !v.hasta || v.hasta < ahora || !FORMATO.test(v.codigo)) return null;
    return v.codigo;
  } catch {
    return null;
  }
}

export function olvidarReferido(): void {
  try {
    localStorage.removeItem(CLAVE);
  } catch {
    /* nada */
  }
}
