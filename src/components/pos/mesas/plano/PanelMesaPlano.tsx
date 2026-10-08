'use client';

import { useId } from 'react';
import { useTranslations } from 'next-intl';
import { Circle, Copy, Minus, Plus, RectangleHorizontal, Square, Trash2, X, type LucideIcon } from 'lucide-react';
import { AvisoTonal, CampoNumero, KbdButton, SegmentedControl } from '@/components/kit';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { cn } from '@/utils/Utils';
import type { FormaMesa } from './estadoMesaPlano';
import { ROTACIONES, errorRangoWeb, type MesaEnPlano } from './planoMesasLogica';

/**
 * Panel de la mesa en el editor del plano (Figma 870:104583): nombre, zona,
 * forma, capacidad, tamaño, rotación y posición; Duplicar y Eliminar. Con la
 * cuenta abierta se puede mover, pero no eliminar ni bajar la capacidad por
 * debajo de sus comensales. Debajo, la reserva en la web (2261:977952): «Se
 * puede reservar en la web» y el rango de personas (vacío = de 1 a la
 * capacidad).
 */
export interface PanelMesaPlanoProps {
  mesa: MesaEnPlano;
  zonas: readonly string[];
  /** Comensales de la cuenta abierta (0 si está libre). */
  comensales: number;
  cuentaAbierta: boolean;
  onCambio: (cambio: Partial<MesaEnPlano>) => void;
  onDuplicar: () => void;
  onEliminar: () => void;
  onCerrar: () => void;
  className?: string;
}

const FORMAS: Array<{ valor: FormaMesa; icono: LucideIcon }> = [
  { valor: 'cuadrada', icono: Square },
  { valor: 'redonda', icono: Circle },
  { valor: 'larga', icono: RectangleHorizontal },
  { valor: 'barra', icono: Minus },
];

export function PanelMesaPlano({ mesa, zonas, comensales, cuentaAbierta, onCambio, onDuplicar, onEliminar, onCerrar, className }: PanelMesaPlanoProps) {
  const t = useTranslations('posMesasPlano.editor.mesa');
  const tw = useTranslations('posMesasPlano.editor.mesa.web');
  const id = useId();
  const minimo = Math.max(1, cuentaAbierta ? comensales : 1);
  const errorWeb = mesa.reservableWeb ? errorRangoWeb(mesa) : null;

  return (
    <aside aria-label={mesa.nombre} className={cn('flex flex-col gap-4 rounded-xl border border-line bg-surface p-4 shadow-sm', className)}>
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-lg font-semibold text-fg">{mesa.nombre}</h3>
          <p className="truncate text-[13px] text-fg-secondary">
            {[mesa.zona ?? t('sinZona'), cuentaAbierta ? t('conCuenta') : mesa.nueva ? t('nueva') : null].filter(Boolean).join(' · ')}
          </p>
        </div>
        <button
          type="button"
          onClick={onCerrar}
          aria-label={t('cerrar')}
          className="flex size-8 items-center justify-center rounded-md text-fg-secondary hover:bg-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
        >
          <X aria-hidden="true" className="size-4" strokeWidth={1.5} />
        </button>
      </div>

      <label className="flex flex-col gap-1.5">
        <span className="text-[13px] font-medium text-fg">{t('nombre')}</span>
        <input
          type="text"
          value={mesa.nombre}
          maxLength={40}
          onChange={(e) => onCambio({ nombre: e.target.value })}
          className="h-10 rounded-lg border border-line-strong bg-surface px-3 text-sm text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
        />
      </label>

      <div className="flex flex-col gap-1.5">
        <span id={`zona-${mesa.id}`} className="text-[13px] font-medium text-fg">
          {t('zona')}
        </span>
        <Select value={mesa.zona ?? ''} onValueChange={(v) => onCambio({ zona: v || null })}>
          <SelectTrigger aria-labelledby={`zona-${mesa.id}`} className="h-10 border-line-strong bg-surface">
            <SelectValue placeholder={t('sinZona')} />
          </SelectTrigger>
          <SelectContent>
            {zonas.map((z) => (
              <SelectItem key={z} value={z}>
                {z}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="flex flex-col gap-1.5">
        <span className="text-[13px] font-medium text-fg">{t('forma')}</span>
        <div role="radiogroup" aria-label={t('forma')} className="grid grid-cols-4 gap-1 rounded-lg bg-subtle p-1">
          {FORMAS.map(({ valor, icono: Icono }) => {
            const activa = mesa.forma === valor;
            return (
              <button
                key={valor}
                type="button"
                role="radio"
                aria-checked={activa}
                onClick={() => onCambio({ forma: valor })}
                className={cn(
                  'flex flex-col items-center gap-1 rounded-md px-1 py-1.5 text-[13px] text-fg-secondary transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand',
                  activa ? 'bg-surface font-medium text-fg shadow-sm' : 'hover:text-fg',
                )}
              >
                <Icono aria-hidden="true" className={cn('size-4', activa && 'text-brand')} strokeWidth={1.5} />
                {t(`formas.${valor}`)}
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <span className="text-[13px] font-medium text-fg">{t('capacidad')}</span>
        <div className="flex items-center gap-2">
          <button
            type="button"
            aria-label={t('menos')}
            disabled={mesa.capacidad <= minimo}
            onClick={() => onCambio({ capacidad: Math.max(minimo, mesa.capacidad - 1) })}
            className="flex size-10 items-center justify-center rounded-lg border border-line-strong bg-surface text-fg hover:bg-hover disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
          >
            <Minus aria-hidden="true" className="size-4" strokeWidth={1.5} />
          </button>
          <div className="w-[72px]">
            <CampoNumero
              valor={mesa.capacidad}
              onValorChange={(v) => v != null && onCambio({ capacidad: Math.max(minimo, Math.min(50, v)) })}
              minimo={minimo}
              maximo={50}
              decimales={0}
            />
          </div>
          <button
            type="button"
            aria-label={t('mas')}
            onClick={() => onCambio({ capacidad: Math.min(50, mesa.capacidad + 1) })}
            className="flex size-10 items-center justify-center rounded-lg border border-line-strong bg-surface text-fg hover:bg-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
          >
            <Plus aria-hidden="true" className="size-4" strokeWidth={1.5} />
          </button>
          <span className="text-[13px] text-fg-secondary">{t('personas', { n: mesa.capacidad })}</span>
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <span className="text-[13px] font-medium text-fg">{t('tamano')}</span>
        <SegmentedControl<'s' | 'm' | 'l'>
          etiqueta={t('tamano')}
          anchoCompleto
          valor={mesa.tamano}
          onValorChange={(tamano) => onCambio({ tamano })}
          opciones={[
            { valor: 's', etiqueta: 'S' },
            { valor: 'm', etiqueta: 'M' },
            { valor: 'l', etiqueta: 'L' },
          ]}
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <span className="text-[13px] font-medium text-fg">{t('rotacion')}</span>
        <SegmentedControl<string>
          etiqueta={t('rotacion')}
          anchoCompleto
          valor={String(((mesa.rotacion % 360) + 360) % 360)}
          onValorChange={(v) => onCambio({ rotacion: Number(v) })}
          opciones={ROTACIONES.map((r) => ({ valor: String(r), etiqueta: `${r}°` }))}
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <span className="text-[13px] font-medium text-fg">{t('posicion')}</span>
        <div className="grid grid-cols-2 gap-2">
          <CampoNumero valor={mesa.x} onValorChange={(v) => v != null && onCambio({ x: Math.max(0, v) })} prefijo="X" decimales={0} minimo={0} alinear="izquierda" />
          <CampoNumero valor={mesa.y} onValorChange={(v) => v != null && onCambio({ y: Math.max(0, v) })} prefijo="Y" decimales={0} minimo={0} alinear="izquierda" />
        </div>
      </div>

      <section aria-labelledby={`${id}-web`} className="flex flex-col gap-3 border-t border-line pt-4">
        <h4 id={`${id}-web`} className="text-xs font-semibold uppercase tracking-wide text-fg-secondary">
          {tw('titulo')}
        </h4>
        <div className="flex items-start gap-3">
          <div className="min-w-0 flex-1">
            <span id={`${id}-reservable`} className="block text-[13px] font-medium text-fg">
              {tw('reservable')}
            </span>
            <span id={`${id}-reservable-ayuda`} className="block text-xs text-fg-secondary">
              {tw('reservableAyuda')}
            </span>
          </div>
          <Switch
            checked={mesa.reservableWeb}
            onCheckedChange={(reservableWeb) => onCambio({ reservableWeb })}
            aria-labelledby={`${id}-reservable`}
            aria-describedby={`${id}-reservable-ayuda`}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <span id={`${id}-personas`} className="text-[13px] font-medium text-fg">
            {tw('personas')}
          </span>
          <div role="group" aria-labelledby={`${id}-personas`} className="grid grid-cols-2 gap-2">
            <CampoNumero
              aria-label={tw('desde')}
              aria-invalid={errorWeb ? true : undefined}
              aria-describedby={`${id}-personas-ayuda`}
              disabled={!mesa.reservableWeb}
              valor={mesa.webMin}
              onValorChange={(v) => onCambio({ webMin: v })}
              prefijo={tw('desde')}
              placeholder="1"
              decimales={0}
              minimo={1}
              alinear="izquierda"
            />
            <CampoNumero
              aria-label={tw('hasta')}
              aria-invalid={errorWeb ? true : undefined}
              aria-describedby={`${id}-personas-ayuda`}
              disabled={!mesa.reservableWeb}
              valor={mesa.webMax}
              onValorChange={(v) => onCambio({ webMax: v })}
              prefijo={tw('hasta')}
              placeholder={String(mesa.capacidad)}
              decimales={0}
              minimo={1}
              alinear="izquierda"
            />
          </div>
          <span id={`${id}-personas-ayuda`} role={errorWeb ? 'alert' : undefined} className={cn('text-xs', errorWeb ? 'text-danger-text' : 'text-fg-secondary')}>
            {errorWeb ? tw(`errores.${errorWeb}`, { n: mesa.capacidad }) : tw('ayuda', { n: mesa.capacidad })}
          </span>
        </div>
      </section>

      {cuentaAbierta && <AvisoTonal tono="informacion" titulo={t('avisoCuenta', { n: comensales })} compacto />}

      <div className="mt-auto flex items-center gap-2 pt-1">
        <KbdButton variante="secundario" tamano="md" icono={Copy} onClick={onDuplicar} className="flex-1">
          {t('duplicar')}
        </KbdButton>
        <KbdButton variante="fantasma" tamano="md" icono={Trash2} onClick={onEliminar} disabled={cuentaAbierta} className="flex-1">
          {t('eliminar')}
        </KbdButton>
      </div>
    </aside>
  );
}
