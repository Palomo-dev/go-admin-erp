'use client';

/**
 * FilaPermiso (Figma «Roles y permisos — componentes»): casilla, nombre legible,
 * código (se oculta en móvil), etiqueta «Sensible · dinero/eliminar/acceso»,
 * «Ya lo da el rol» (editor de cargo) y el cambio sin guardar («+ Añadido» /
 * «− Quitado»).
 */
import { useId } from 'react';
import { useTranslations } from 'next-intl';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import type { PermisoCatalogo } from '@/lib/roles/matrizPermisos';
import { cn } from '@/utils/Utils';

export interface FilaPermisoProps {
  permiso: PermisoCatalogo;
  marcado: boolean;
  onAlternar?: () => void;
  /** Lo concede ya el rol (editor de cargo): marcada, atenuada y sin poder tocarla. */
  yaLoDaElRol?: boolean;
  delta?: 'anadido' | 'quitado' | null;
  deshabilitado?: boolean;
  mostrarCodigo?: boolean;
  className?: string;
}

export function FilaPermiso({ permiso, marcado, onAlternar, yaLoDaElRol, delta, deshabilitado, mostrarCodigo = true, className }: FilaPermisoProps) {
  const t = useTranslations('roles');
  const id = useId();
  const bloqueado = Boolean(yaLoDaElRol);
  return (
    <div
      className={cn('flex min-h-11 items-center gap-3 px-3 py-2 sm:min-h-9', className)}
      data-permiso={permiso.codigo}
      data-delta={delta ?? undefined}
    >
      <Checkbox
        id={id}
        checked={marcado || bloqueado}
        disabled={deshabilitado || bloqueado || !onAlternar}
        onCheckedChange={() => onAlternar?.()}
        className={cn('size-[18px] shrink-0 rounded border-line-strong', bloqueado && 'opacity-50')}
      />
      <label htmlFor={id} className="flex min-w-0 flex-1 flex-wrap items-center gap-x-2 gap-y-1 text-sm text-fg">
        <span className="min-w-0">{permiso.nombre}</span>
        {mostrarCodigo && <code className="hidden font-mono text-xs text-fg-muted sm:inline">{permiso.codigo}</code>}
        {permiso.sensible && (
          <Badge tono="advertencia" apariencia="suave" tamano="sm">
            <span className="sm:hidden">{permiso.sensible === 'dinero' ? t('sensibilidad.dineroCorto') : t('sensibilidad.corto')}</span>
            <span className="hidden sm:inline">{t(`sensibilidad.${permiso.sensible}`)}</span>
          </Badge>
        )}
        {bloqueado && (
          <Badge tono="neutro" apariencia="suave" tamano="sm">
            {t('matriz.yaLoDaElRol')}
          </Badge>
        )}
      </label>
      {delta && (
        <Badge tono={delta === 'anadido' ? 'exito' : 'peligro'} apariencia="contorno" tamano="sm" className="shrink-0">
          {delta === 'anadido' ? t('matriz.anadido') : t('matriz.quitado')}
        </Badge>
      )}
    </div>
  );
}
