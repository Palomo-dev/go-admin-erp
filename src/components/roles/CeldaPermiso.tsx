'use client';

/**
 * CeldaPermiso (Figma «Roles y permisos — componentes», fila de casillas):
 * marcada · parcial (guion) · vacía · bloqueada (lo da el rol: marcada,
 * atenuada y con candado) · «—» cuando la columna no tiene permisos en ese
 * módulo. El punto naranja marca que el grupo incluye algo sensible.
 */
import { useTranslations } from 'next-intl';
import { Lock } from 'lucide-react';
import { Checkbox } from '@/components/ui/checkbox';
import type { EstadoCasilla } from '@/lib/roles/matrizPermisos';
import { cn } from '@/utils/Utils';

export interface CeldaPermisoProps {
  estado: EstadoCasilla | 'bloqueado';
  /** Nombre accesible: «Ver en Punto de venta». */
  etiqueta: string;
  onAlternar?: () => void;
  sensible?: boolean;
  deshabilitado?: boolean;
  className?: string;
}

export function CeldaPermiso({ estado, etiqueta, onAlternar, sensible, deshabilitado, className }: CeldaPermisoProps) {
  const t = useTranslations('roles.matriz');
  if (estado === 'vacio') {
    return (
      <span className={cn('inline-flex size-6 items-center justify-center text-fg-muted', className)}>
        <span aria-hidden="true">—</span>
        <span className="sr-only">{`${etiqueta}: ${t('noAplica')}`}</span>
      </span>
    );
  }
  const bloqueado = estado === 'bloqueado';
  const checked = estado === 'todo' || bloqueado ? true : estado === 'parcial' ? 'indeterminate' : false;
  return (
    <span className={cn('relative inline-flex size-6 items-center justify-center', className)}>
      <Checkbox
        checked={checked}
        disabled={deshabilitado || bloqueado || !onAlternar}
        onCheckedChange={() => onAlternar?.()}
        aria-label={bloqueado ? `${etiqueta} · ${t('yaLoDaElRol')}` : etiqueta}
        className={cn('size-[18px] rounded border-line-strong', bloqueado && 'opacity-50')}
      />
      {bloqueado && <Lock aria-hidden="true" className="absolute -bottom-1 -right-1.5 size-3 text-fg-muted" strokeWidth={2} />}
      {sensible && !bloqueado && (
        <span aria-hidden="true" data-sensible className="absolute -right-0.5 -top-0.5 size-1.5 rounded-full bg-warning" />
      )}
    </span>
  );
}
