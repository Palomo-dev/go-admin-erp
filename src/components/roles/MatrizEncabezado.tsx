'use client';

/**
 * MatrizEncabezado (Figma «Roles y permisos — componentes»): Módulo · Ver ·
 * Crear · Editar · Eliminar · Aprobar · Otras acciones · conteo. En móvil
 * (< lg) solo «Módulo»: ModuloMatriz oculta las columnas de acción.
 */
import { useTranslations } from 'next-intl';
import { ACCIONES } from '@/lib/roles/matrizPermisos';
import { cn } from '@/utils/Utils';

/** Rejilla compartida con ModuloMatriz: chevron + casilla + módulo | 6 acciones | conteo. */
export const REJILLA_MATRIZ = 'grid grid-cols-[minmax(0,1fr)_auto] items-center lg:grid-cols-[minmax(0,1fr)_repeat(6,4.25rem)_4.5rem]';

export function MatrizEncabezado({ className }: { className?: string }) {
  const t = useTranslations('roles.matriz');
  return (
    <div aria-hidden="true" className={cn(REJILLA_MATRIZ, 'border-b border-line bg-subtle px-3 py-2 text-xs font-medium text-fg-secondary', className)}>
      <span>{t('modulo')}</span>
      {ACCIONES.map((a) => (
        <span key={a} className="hidden text-center lg:block">
          {t(`acciones.${a}`)}
        </span>
      ))}
      <span aria-hidden="true" />
    </div>
  );
}
