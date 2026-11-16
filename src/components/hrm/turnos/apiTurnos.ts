'use client';

/**
 * Lectura y escritura de Turnos por las rutas del servidor (`/api/hrm/turnos/**`):
 * la organización y el actor salen de la sesión y los permisos los decide la
 * base. Reutiliza `pedir` y `useCarga` de Estructura (403 = sin permiso).
 */
import { useCallback } from 'react';
import { useTranslations } from 'next-intl';
import { ErrorEstructura, pedir } from '@/components/hrm/estructura/comun';

export { pedir, useCarga, ErrorEstructura, type Carga } from '@/components/hrm/estructura/comun';

export const RUTA_TURNOS = '/app/hrm/turnos';

/** Texto de un error de las rutas de turnos, marcación o equipo, con respaldo genérico. */
export function useMensajeErrorTurnos(): (e: unknown) => string {
  const t = useTranslations('hrmTurnos.errores');
  return useCallback(
    (e: unknown) => {
      const codigo = e instanceof ErrorEstructura ? e.codigo : 'error_hrm';
      return t.has(codigo) ? t(codigo) : t('error_hrm');
    },
    [t]
  );
}

export async function enviar<T>(url: string, metodo: 'POST' | 'PUT' | 'DELETE', cuerpo?: unknown): Promise<T> {
  return pedir<T>(url, { metodo, cuerpo });
}
