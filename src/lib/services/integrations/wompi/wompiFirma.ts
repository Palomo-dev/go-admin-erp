/**
 * Checksum de los eventos de Wompi: módulo hoja (solo `crypto`) para que el
 * webhook lo use sin arrastrar el cliente de navegador que importa
 * `wompiService`. `wompiService.verifyWebhookEvent` delega aquí: una sola
 * implementación (GO-sec, 2026-09-24).
 *
 * Contrato de Wompi: SHA-256 de la concatenación de los valores de
 * `signature.properties` (rutas dentro de `data`), `timestamp` y el secreto de
 * eventos de la cuenta (`events_secret` de la conexión), en hexadecimal; se
 * compara con `signature.checksum` en tiempo constante. Sin secreto → falso.
 */

import crypto from 'crypto';
import type { WompiWebhookEvent } from './wompiTypes';

export function verificarChecksumWompi(event: WompiWebhookEvent, eventsSecret: string): boolean {
  if (!eventsSecret) return false;
  try {
    const propiedades = event?.signature?.properties;
    if (!Array.isArray(propiedades) || propiedades.length === 0) return false;
    const values = propiedades.map((prop) => {
      let value: unknown = event.data;
      for (const key of String(prop).split('.')) {
        value = value && typeof value === 'object' ? (value as Record<string, unknown>)[key] : undefined;
      }
      return value;
    });

    const calculado = crypto
      .createHash('sha256')
      .update(values.join('') + event.timestamp + eventsSecret)
      .digest('hex')
      .toUpperCase();

    const a = Buffer.from(calculado, 'utf8');
    const b = Buffer.from(String(event.signature.checksum ?? '').toUpperCase(), 'utf8');
    return a.length === b.length && crypto.timingSafeEqual(a, b);
  } catch {
    return false;
  }
}
