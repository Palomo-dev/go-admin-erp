/**
 * HTML de la página pública de baja `/u/[token]` (FASE-07 C17) — ronda 2.
 *
 * Vive aquí (y no dentro del route handler) para poder probarlo con jest sin
 * arrastrar `next/server`, y para que el escapado sea una función explícita y
 * única: **todo** valor dinámico que entra en la página (nombre de la
 * organización, correo, dominio, mensajes) pasa por `escapeHtmlText`.
 *
 * Contexto del fallo corregido (tester r1 #1, CRÍTICO): `organizations.name` es
 * texto libre que edita cualquier admin de una org y se interpolaba sin escapar
 * en una página **pública, sin sesión**, enlazada desde el `List-Unsubscribe`
 * de todos los correos de marketing → XSS almacenada en el origen de la app.
 *
 * Defensa en profundidad:
 *  1. escapado explícito de title/body/button (aquí, sin excepciones),
 *  2. CSP restrictiva `default-src 'none'` con el `<style>` autorizado por su
 *     hash sha256 (ni un solo `unsafe-inline`, ni scripts de ningún origen),
 *  3. `X-Content-Type-Options: nosniff` + `X-Frame-Options: DENY` +
 *     `Referrer-Policy: no-referrer` (el token de baja no debe filtrarse).
 */

import { createHash } from 'crypto';

/** Escape HTML explícito para contexto de texto y de atributo entrecomillado. */
export function escapeHtmlText(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** CSS de la página. Constante: su hash va en la CSP. */
export const PUBLIC_PAGE_STYLE =
  'body{margin:0;background:#f4f5f7;font-family:Inter,Arial,sans-serif;color:#1f2937}' +
  'main{max-width:480px;margin:10vh auto;background:#fff;border-radius:12px;padding:32px;box-shadow:0 1px 3px rgba(0,0,0,.08)}' +
  'h1{font-size:20px;margin:0 0 12px}p{line-height:1.5;color:#4b5563}' +
  'button{background:#2563eb;color:#fff;border:0;border-radius:8px;padding:12px 20px;font-size:15px;font-weight:600;cursor:pointer}' +
  'button:focus{outline:3px solid #93c5fd}';

/** `'sha256-…'` del bloque <style> para autorizarlo en la CSP sin unsafe-inline. */
export function styleHash(): string {
  return `'sha256-${createHash('sha256').update(PUBLIC_PAGE_STYLE, 'utf8').digest('base64')}'`;
}

export function contentSecurityPolicy(): string {
  return [
    "default-src 'none'",
    `style-src ${styleHash()}`,
    "form-action 'self'",
    "base-uri 'none'",
    "frame-ancestors 'none'",
    "img-src 'none'",
    "script-src 'none'",
    "connect-src 'none'",
  ].join('; ');
}

export function publicPageHeaders(): Record<string, string> {
  return {
    'Content-Type': 'text/html; charset=utf-8',
    'Cache-Control': 'no-store',
    'Content-Security-Policy': contentSecurityPolicy(),
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Referrer-Policy': 'no-referrer',
  };
}

export interface PublicPageInput {
  title: string;
  body: string;
  /** Etiqueta del botón de un formulario POST a la misma URL. */
  button?: string;
}

/**
 * Devuelve el HTML completo. `title`, `body` y `button` se escapan SIEMPRE:
 * son textos, nunca HTML, así que no hay ningún camino por el que un valor de
 * la base de datos llegue al navegador como marcado.
 */
export function publicPageHtml({ title, body, button }: PublicPageInput): string {
  const t = escapeHtmlText(title);
  const b = escapeHtmlText(body);
  const form = button ? `<form method="post"><button type="submit">${escapeHtmlText(button)}</button></form>` : '';
  return (
    '<!DOCTYPE html><html lang="es"><head><meta charset="utf-8"/>' +
    '<meta name="viewport" content="width=device-width, initial-scale=1"/>' +
    '<meta name="robots" content="noindex"/>' +
    `<title>${t}</title>\n<style>${PUBLIC_PAGE_STYLE}</style></head>\n` +
    `<body><main role="main"><h1>${t}</h1><p>${b}</p>${form}</main></body></html>`
  );
}
