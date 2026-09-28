/**
 * Verificación del `verify_token` de los webhooks de Prometeo (módulo hoja:
 * solo `crypto` y `secrets`, para que el servicio y la ruta lo usen sin
 * arrastrar el contexto de organización).
 *
 * Fail-closed: sin `PROMETEO_WEBHOOK_VERIFY_TOKEN` real (ausente, de relleno o
 * más corto que el mínimo de `secrets.ts`) o sin token en la petición →
 * `false`. Comparación en tiempo constante.
 *
 * Es SÍNCRONA a propósito: la versión anterior era `async` y la ruta la llamaba
 * sin `await`, así que la promesa (siempre «verdadera») dejaba pasar cualquier
 * petición (auditoría de integraciones 2026-09-23, §1.4).
 */

import crypto from 'crypto';
import { readRealSecret } from '@/lib/security/secrets';

export function verificarTokenWebhookPrometeo(recibido: string | null | undefined): boolean {
  const esperado = readRealSecret('PROMETEO_WEBHOOK_VERIFY_TOKEN');
  if (!esperado || typeof recibido !== 'string' || recibido === '') return false;
  const a = Buffer.from(recibido, 'utf8');
  const b = Buffer.from(esperado, 'utf8');
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}
