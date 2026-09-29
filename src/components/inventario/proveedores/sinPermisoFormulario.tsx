'use client';

import { useTranslations } from 'next-intl';
import { EmptyState } from '@/components/kit';
import { RUTA_PROVEEDORES } from './useAccionesProveedor';

/** Formulario de proveedor sin el permiso de catálogo (el servidor rechazaría el guardado). */
export function SinPermisoFormulario() {
  const t = useTranslations('proveedores.formulario.sinPermiso');
  const tc = useTranslations('proveedores.comun');
  return (
    <EmptyState
      variante="forbidden"
      titulo={t('titulo')}
      descripcion={t('descripcion')}
      accion={{ etiqueta: tc('titulo'), href: RUTA_PROVEEDORES }}
    />
  );
}
