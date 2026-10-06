'use client';

/**
 * SelectorAlcanceSucursal (Figma «Roles y permisos — componentes»): «Todas las
 * sucursales» (sin asignaciones: también las que se creen después y los
 * consolidados) o «Solo algunas» con una casilla por sucursal activa.
 */
import { useId } from 'react';
import { useTranslations } from 'next-intl';
import { Info, MapPin } from 'lucide-react';
import { Checkbox } from '@/components/ui/checkbox';
import { SegmentedControl } from '@/components/kit/SegmentedControl';
import type { SucursalAlcance } from '@/lib/roles/tipos';
import { cn } from '@/utils/Utils';

export type ModoAlcance = 'todas' | 'algunas';

export interface SelectorAlcanceSucursalProps {
  sucursales: readonly SucursalAlcance[];
  modo: ModoAlcance;
  seleccion: readonly number[];
  onCambio: (modo: ModoAlcance, seleccion: number[]) => void;
  deshabilitado?: boolean;
  className?: string;
}

export function SelectorAlcanceSucursal({ sucursales, modo, seleccion, onCambio, deshabilitado, className }: SelectorAlcanceSucursalProps) {
  const t = useTranslations('roles.alcance');
  const idEtiqueta = useId();
  const elegidas = new Set(seleccion);
  const alternar = (id: number) => {
    const s = new Set(elegidas);
    if (s.has(id)) s.delete(id);
    else s.add(id);
    onCambio('algunas', sucursales.map((x) => x.id).filter((x) => s.has(x)));
  };

  return (
    <div className={cn('flex flex-col gap-3', className)}>
      <span id={idEtiqueta} className="sr-only">
        {t('etiqueta')}
      </span>
      <SegmentedControl
        aria-labelledby={idEtiqueta}
        valor={modo}
        deshabilitado={deshabilitado}
        onValorChange={(v) => onCambio(v, v === 'todas' ? [] : seleccion.length ? [...seleccion] : sucursales.map((s) => s.id))}
        opciones={[
          { valor: 'todas', etiqueta: t('todas') },
          { valor: 'algunas', etiqueta: t('algunas') },
        ]}
      />
      {modo === 'todas' ? (
        <p className="flex items-start gap-2 rounded-lg border border-line-info bg-info-subtle p-3 text-sm text-info-text">
          <Info aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
          {t('todasDesc', { n: sucursales.length })}
        </p>
      ) : (
        <ul className="divide-y divide-line overflow-hidden rounded-lg border border-line" aria-labelledby={idEtiqueta}>
          {sucursales.map((s) => {
            const id = `${idEtiqueta}-${s.id}`;
            return (
              <li key={s.id} className="flex min-h-12 items-center gap-3 px-3 py-2">
                <Checkbox
                  id={id}
                  checked={elegidas.has(s.id)}
                  disabled={deshabilitado}
                  onCheckedChange={() => alternar(s.id)}
                  className="size-[18px] rounded border-line-strong"
                />
                <MapPin aria-hidden="true" className="size-4 shrink-0 text-fg-muted" />
                <label htmlFor={id} className="flex min-w-0 flex-col">
                  <span className="truncate text-sm text-fg">{s.nombre}</span>
                  {s.detalle && <span className="truncate text-xs text-fg-muted">{s.detalle}</span>}
                </label>
              </li>
            );
          })}
        </ul>
      )}
      <p className={cn('text-xs', modo === 'algunas' && seleccion.length === 0 ? 'text-danger-text' : 'text-fg-muted')} role={modo === 'algunas' && seleccion.length === 0 ? 'alert' : undefined}>
        {modo === 'algunas' && seleccion.length === 0
          ? t('eligeUna')
          : t('conteo', { n: modo === 'todas' ? sucursales.length : seleccion.length, total: sucursales.length })}
      </p>
    </div>
  );
}
