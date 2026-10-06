'use client';

/**
 * RolFila (Figma «Roles y permisos — componentes», Layout escritorio / móvil):
 * candado (sistema) o escudo (propio), nombre y descripción, tipo, «17 de 149»
 * con barra y sensibles, personas con avatares, última modificación y «⋯».
 */
import { useTranslations } from 'next-intl';
import { Lock, ShieldCheck } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { AvatarIniciales } from '@/components/kit/AvatarIniciales';
import { RowActionsMenu } from '@/components/kit/RowActionsMenu';
import type { AccionFila } from '@/components/kit/acciones';
import { useFormatDate } from '@/lib/context/OrganizationTimezoneContext';
import type { RolResumen } from '@/lib/roles/tipos';
import { cn } from '@/utils/Utils';

export interface RolFilaProps {
  rol: RolResumen;
  totalPermisos: number;
  sensibles: number;
  acciones: readonly AccionFila[];
  onAbrir: () => void;
  layout?: 'escritorio' | 'movil';
  className?: string;
}

/** Rejilla de la tabla de roles (cabecera en ListaRoles). */
export const REJILLA_ROLES = 'grid grid-cols-[minmax(0,2.2fr)_6rem_minmax(0,1.4fr)_minmax(0,1.4fr)_minmax(0,1fr)_2.5rem] items-center gap-4';

function IconoRol({ sistema }: { sistema: boolean }) {
  const Icono = sistema ? Lock : ShieldCheck;
  return (
    <span className={cn('inline-flex size-8 shrink-0 items-center justify-center rounded-lg', sistema ? 'bg-subtle text-fg-secondary' : 'bg-brand-tint text-brand')}>
      <Icono aria-hidden="true" className="size-4" strokeWidth={1.75} />
    </span>
  );
}

function BarraPermisos({ n, total }: { n: number; total: number }) {
  const pct = total > 0 ? Math.round((n / total) * 100) : 0;
  return (
    <span aria-hidden="true" className="block h-1 w-full max-w-[12rem] overflow-hidden rounded-full bg-subtle">
      <span className="block h-full rounded-full bg-brand" style={{ width: `${pct}%` }} />
    </span>
  );
}

function Personas({ rol }: { rol: RolResumen }) {
  const t = useTranslations('roles');
  return (
    <span className="flex min-w-0 items-center gap-2">
      {rol.muestraPersonas.length > 0 && (
        <span className="flex -space-x-2">
          {rol.muestraPersonas.map((p) => (
            <AvatarIniciales key={p.id} nombre={p.nombre} tamano="sm" className="ring-2 ring-surface" />
          ))}
        </span>
      )}
      <span className="truncate text-sm text-fg-secondary">{t('personas', { n: rol.personas })}</span>
    </span>
  );
}

export function RolFila({ rol, totalPermisos, sensibles, acciones, onAbrir, layout = 'escritorio', className }: RolFilaProps) {
  const t = useTranslations('roles');
  const { formatDate } = useFormatDate();
  const tipo = (
    <Badge tono={rol.sistema ? 'neutro' : 'marca'} apariencia={rol.sistema ? 'suave' : 'contorno'} tamano="sm">
      {rol.sistema ? t('tipo.sistema') : t('tipo.propio')}
    </Badge>
  );
  const permisos = (
    <span className="flex min-w-0 flex-col gap-1">
      <span className="flex flex-wrap items-center gap-2 text-sm tabular-nums text-fg">
        {t('conteoPermisos', { n: rol.permisoIds.length, total: totalPermisos })}
        {sensibles > 0 && !rol.sistema && (
          <Badge tono="advertencia" apariencia="contorno" tamano="sm">
            {t('sensibles', { n: sensibles })}
          </Badge>
        )}
      </span>
      <BarraPermisos n={rol.permisoIds.length} total={totalPermisos} />
    </span>
  );
  const nombre = (
    <button type="button" onClick={onAbrir} className="flex min-w-0 items-start gap-3 text-left">
      <IconoRol sistema={rol.sistema} />
      <span className="flex min-w-0 flex-col">
        <span className="truncate text-sm font-medium text-fg">{rol.nombre}</span>
        {rol.descripcion && <span className="line-clamp-2 text-xs text-fg-muted">{rol.descripcion}</span>}
        {rol.sistema && <span className="sr-only">{t('rolBloqueado')}</span>}
      </span>
    </button>
  );
  const menu = <RowActionsMenu acciones={acciones} titulo={rol.nombre} orientacion="horizontal" tamano="sm" />;

  if (layout === 'movil') {
    return (
      <article className={cn('flex flex-col gap-3 rounded-xl border border-line bg-surface p-4', className)} data-rol={rol.id}>
        <div className="flex items-start justify-between gap-2">
          {nombre}
          {menu}
        </div>
        <div className="flex items-center gap-3 pl-11">
          {tipo}
          <span className="min-w-0 flex-1">{permisos}</span>
        </div>
        <div className="pl-11">
          <Personas rol={rol} />
        </div>
      </article>
    );
  }

  return (
    <div className={cn(REJILLA_ROLES, 'border-b border-line px-4 py-3 last:border-b-0 hover:bg-hover', className)} data-rol={rol.id}>
      {nombre}
      <span>{tipo}</span>
      {permisos}
      <Personas rol={rol} />
      <span className="truncate text-sm text-fg-secondary">{rol.sistema || !rol.actualizado ? t('sinFecha') : formatDate(rol.actualizado)}</span>
      <span className="flex justify-end">{menu}</span>
    </div>
  );
}
