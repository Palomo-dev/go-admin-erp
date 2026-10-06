'use client';

import { useTranslations } from 'next-intl';
import { Check, ChevronDown, ChevronUp, Trash2, X } from 'lucide-react';
import { AvisoTonal, KbdButton } from '@/components/kit';
import { cn } from '@/utils/Utils';
import { COLORES_ZONA, type ZonaEnPlano } from './planoMesasLogica';

/**
 * Panel de la zona en el editor del plano (Figma 870:580140): nombre, color
 * (6 tonos del manual), orden de la pestaña y eliminar (solo vacía: antes hay
 * que mover sus mesas a otra zona).
 */
export interface PanelZonaPlanoProps {
  zona: ZonaEnPlano;
  posicion: number;
  total: number;
  mesas: number;
  onCambio: (cambio: Partial<Pick<ZonaEnPlano, 'nombre' | 'color'>>) => void;
  onMover: (delta: -1 | 1) => void;
  onEliminar: () => void;
  onCerrar: () => void;
  className?: string;
}

export function PanelZonaPlano({ zona, posicion, total, mesas, onCambio, onMover, onEliminar, onCerrar, className }: PanelZonaPlanoProps) {
  const t = useTranslations('posMesasPlano.editor.zona');
  const botonOrden =
    'flex size-9 items-center justify-center rounded-lg border border-line-strong bg-surface text-fg hover:bg-hover disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand';

  return (
    <aside aria-label={t('titulo', { zona: zona.nombre })} className={cn('flex flex-col gap-4 rounded-xl border border-line bg-surface p-4 shadow-lg', className)}>
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-lg font-semibold text-fg">{t('titulo', { zona: zona.nombre })}</h3>
          <p className="text-[13px] text-fg-secondary">{t('mesas', { n: mesas })}</p>
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
          value={zona.nombre}
          maxLength={40}
          onChange={(e) => onCambio({ nombre: e.target.value })}
          className="h-10 rounded-lg border border-line-strong bg-surface px-3 text-sm text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
        />
      </label>

      <div className="flex flex-col gap-1.5">
        <span className="text-[13px] font-medium text-fg">{t('color')}</span>
        <div role="radiogroup" aria-label={t('color')} className="flex flex-wrap gap-2">
          {COLORES_ZONA.map((c, i) => {
            const activo = zona.color.toLowerCase() === c.toLowerCase();
            return (
              <button
                key={c}
                type="button"
                role="radio"
                aria-checked={activo}
                aria-label={t('tono', { n: i + 1 })}
                onClick={() => onCambio({ color: c })}
                className={cn(
                  'flex size-7 items-center justify-center rounded-full ring-offset-2 ring-offset-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand',
                  activo && 'ring-2 ring-fg',
                )}
                style={{ backgroundColor: c }}
              >
                {activo && <Check aria-hidden="true" className="size-4 text-white" strokeWidth={2} />}
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <span className="text-[13px] font-medium text-fg">{t('orden')}</span>
        <div className="flex items-center gap-2">
          <span className="flex-1 text-sm text-fg">{t('pestana', { n: posicion + 1, total })}</span>
          <button type="button" aria-label={t('subir')} disabled={posicion === 0} onClick={() => onMover(-1)} className={botonOrden}>
            <ChevronUp aria-hidden="true" className="size-4" strokeWidth={1.5} />
          </button>
          <button type="button" aria-label={t('bajar')} disabled={posicion >= total - 1} onClick={() => onMover(1)} className={botonOrden}>
            <ChevronDown aria-hidden="true" className="size-4" strokeWidth={1.5} />
          </button>
        </div>
      </div>

      {mesas > 0 && <AvisoTonal tono="advertencia" titulo={t('avisoEliminar', { n: mesas })} compacto />}

      <KbdButton variante="fantasma" tamano="md" icono={Trash2} onClick={onEliminar} disabled={mesas > 0} className="self-start">
        {t('eliminar')}
      </KbdButton>
    </aside>
  );
}
