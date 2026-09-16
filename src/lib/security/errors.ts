/**
 * Error común de la capa `src/lib/security/`: lo lanzan las verificaciones de
 * firma, de cron y de secretos, y `webhookErrorResponse` lo convierte en una
 * respuesta JSON con su `statusCode` (401/403).
 *
 * Vive en su propio módulo (y no en `webhookSignatures.ts`) para que
 * `secrets.ts` y `wsSessionToken.ts` puedan lanzarlo sin arrastrar twilio,
 * svix ni Supabase: el ws-server (Node puro) importa `wsSessionToken.ts`.
 * `webhookSignatures.ts` lo reexporta, así que los importadores existentes no
 * cambian.
 */
export class WebhookError extends Error {
  statusCode: number;
  code: string;
  constructor(statusCode: number, code: string, message?: string) {
    super(message ?? code);
    this.name = 'WebhookError';
    this.statusCode = statusCode;
    this.code = code;
  }
}
