'use client';

/**
 * Componente sin UI que captura la atribución de marketing al cargar la página
 * (tarea 02 atribución utm-ref; contrato del 27-sep-2026).
 *
 * Lee los parámetros de la URL (utm_*, gclid, fbclid, ref) y los guarda según
 * el consentimiento:
 * - Con consentimiento de marketing: cookie goadmin_attr con todo.
 * - Sin consentimiento: sessionStorage con solo UTM básicos.
 *
 * Modelo first-touch: no sobrescribe si ya existe, salvo que llegue un ref nuevo.
 */

import { useEffect } from 'react';
import { captureAttribution } from '@/lib/attribution/cookie';

export function AttributionCapture() {
  useEffect(() => {
    // Capturar atribución solo una vez al montar
    captureAttribution();
  }, []);

  // Sin renderizado (componente invisible)
  return null;
}
