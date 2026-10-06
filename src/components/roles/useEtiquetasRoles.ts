'use client';

/**
 * Etiquetas legibles de Roles y permisos en el idioma activo: nombre de cada
 * módulo del catálogo (`roles.modulos.<codigo>`, con el código como respaldo
 * si llega uno nuevo) y de cada sensibilidad. Una sola definición para la
 * matriz, «Comparar» y «¿Qué puede hacer?».
 */
import { useCallback } from 'react';
import { useTranslations } from 'next-intl';
import type { Sensibilidad } from '@/lib/roles/matrizPermisos';

export function useEtiquetasRoles() {
  const t = useTranslations('roles');
  const etiquetaModulo = useCallback((modulo: string) => (t.has(`modulos.${modulo}`) ? t(`modulos.${modulo}`) : modulo), [t]);
  const etiquetaSensible = useCallback((s: Sensibilidad) => t(`sensibilidad.${s}`), [t]);
  const mensajeError = useCallback(
    (codigo: string) => (t.has(`errores.${codigo}`) ? t(`errores.${codigo}`) : t('errores.error_interno')),
    [t],
  );
  return { etiquetaModulo, etiquetaSensible, mensajeError };
}
