'use client';

/**
 * Etiquetas legibles de Roles y permisos en el idioma activo: nombre de cada
 * módulo del catálogo (`roles.modulos.<codigo>`, con el código como respaldo
 * si llega uno nuevo) y de cada sensibilidad. Una sola definición para la
 * matriz, «Comparar» y «¿Qué puede hacer?».
 *
 * Permisos con texto traducido (`roles.permisosCatalogo.<codigo con _>`: nombre y
 * descripción); los demás conservan el nombre legible que sale de la base.
 */
import { useCallback } from 'react';
import { useTranslations } from 'next-intl';
import type { Sensibilidad } from '@/lib/roles/matrizPermisos';

export function useEtiquetasRoles() {
  const t = useTranslations('roles');
  const etiquetaModulo = useCallback((modulo: string) => (t.has(`modulos.${modulo}`) ? t(`modulos.${modulo}`) : modulo), [t]);
  const etiquetaSensible = useCallback((s: Sensibilidad) => t(`sensibilidad.${s}`), [t]);
  const etiquetaPermiso = useCallback(
    (p: { codigo: string; nombre: string }): { nombre: string; descripcion: string | null } => {
      const clave = `permisosCatalogo.${p.codigo.replace(/\./g, '_')}`;
      if (!t.has(`${clave}.nombre`)) return { nombre: p.nombre, descripcion: null };
      return { nombre: t(`${clave}.nombre`), descripcion: t.has(`${clave}.descripcion`) ? t(`${clave}.descripcion`) : null };
    },
    [t],
  );
  const mensajeError = useCallback(
    (codigo: string) => (t.has(`errores.${codigo}`) ? t(`errores.${codigo}`) : t('errores.error_interno')),
    [t],
  );
  return { etiquetaModulo, etiquetaSensible, etiquetaPermiso, mensajeError };
}
