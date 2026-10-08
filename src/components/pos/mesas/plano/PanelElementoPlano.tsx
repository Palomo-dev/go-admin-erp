'use client';

import { useId } from 'react';
import { useTranslations } from 'next-intl';
import { Copy, Trash2, X } from 'lucide-react';
import { CampoNumero, ChipsOpcion, KbdButton, SegmentedControl } from '@/components/kit';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { cn } from '@/utils/Utils';
import { LADO_MAX, LADO_MIN, ROTACIONES, TIPOS_ELEMENTO, normalizarRotacion, type ElementoEnPlano, type TipoElemento } from './planoMesasLogica';

/**
 * Panel del elemento fijo en el editor del plano (Figma 2261:977952): tipo,
 * etiqueta, tamaño, rotación, zona y «Se ve en el sitio» (show_on_web);
 * Duplicar y Eliminar.
 */
export interface PanelElementoPlanoProps {
  elemento: ElementoEnPlano;
  zonas: readonly string[];
  onCambio: (cambio: Partial<ElementoEnPlano>) => void;
  onDuplicar: () => void;
  onEliminar: () => void;
  onCerrar: () => void;
  className?: string;
}

const SIN_ZONA = '__sin_zona__';

export function PanelElementoPlano({ elemento, zonas, onCambio, onDuplicar, onEliminar, onCerrar, className }: PanelElementoPlanoProps) {
  const t = useTranslations('posMesasPlano.editor.elemento');
  const id = useId();
  const nombreTipo = t(`tipos.${elemento.tipo}`);
  const rotacion = normalizarRotacion(elemento.rotacion);

  return (
    <aside aria-label={t('titulo', { tipo: nombreTipo })} className={cn('flex flex-col gap-4 rounded-xl border border-line bg-surface p-4 shadow-sm', className)}>
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-lg font-semibold text-fg">{elemento.etiqueta.trim() || nombreTipo}</h3>
          <p className="text-[13px] text-fg-secondary">
            {t('subtitulo', { zona: elemento.zona ?? t('sinZona') })} · {elemento.enSitio ? t('seVeEnSitio') : t('soloErp')}
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

      <div className="flex flex-col gap-1.5">
        <span id={`${id}-tipo`} className="text-xs font-semibold uppercase tracking-wide text-fg-secondary">
          {t('tipo')}
        </span>
        <ChipsOpcion<TipoElemento>
          aria-labelledby={`${id}-tipo`}
          valor={elemento.tipo}
          onValorChange={(tipo) => {
            // Si la etiqueta era el nombre del tipo anterior, sigue al tipo nuevo.
            const etiquetaDeTipo = elemento.etiqueta.trim() === nombreTipo;
            onCambio({ tipo, ...(etiquetaDeTipo ? { etiqueta: t(`tipos.${tipo}`) } : {}) });
          }}
          opciones={TIPOS_ELEMENTO.map((v) => ({ valor: v, etiqueta: t(`tipos.${v}`) }))}
        />
      </div>

      <label className="flex flex-col gap-1.5">
        <span className="text-[13px] font-medium text-fg">{t('etiqueta')}</span>
        <input
          type="text"
          value={elemento.etiqueta}
          maxLength={60}
          aria-describedby={`${id}-etiqueta`}
          onChange={(e) => onCambio({ etiqueta: e.target.value })}
          className="h-10 rounded-lg border border-line-strong bg-surface px-3 text-sm text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
        />
        <span id={`${id}-etiqueta`} className="text-xs text-fg-secondary">
          {t('etiquetaAyuda')}
        </span>
      </label>

      <div className="flex flex-col gap-1.5">
        <span className="text-[13px] font-medium text-fg">{t('tamano')}</span>
        <div className="grid grid-cols-2 gap-2">
          <CampoNumero
            aria-label={t('ancho')}
            valor={elemento.ancho}
            onValorChange={(v) => v != null && onCambio({ ancho: v })}
            prefijo={t('anchoCorto')}
            sufijo="px"
            decimales={0}
            minimo={LADO_MIN}
            maximo={LADO_MAX}
            alinear="izquierda"
          />
          <CampoNumero
            aria-label={t('alto')}
            valor={elemento.alto}
            onValorChange={(v) => v != null && onCambio({ alto: v })}
            prefijo={t('altoCorto')}
            sufijo="px"
            decimales={0}
            minimo={LADO_MIN}
            maximo={LADO_MAX}
            alinear="izquierda"
          />
        </div>
        <span className="text-xs text-fg-secondary">{t('tamanoAyuda')}</span>
      </div>

      <div className="flex flex-col gap-1.5">
        <span className="text-[13px] font-medium text-fg">{t('rotacion')}</span>
        <SegmentedControl<string>
          etiqueta={t('rotacion')}
          anchoCompleto
          valor={(ROTACIONES as readonly number[]).includes(rotacion) ? String(rotacion) : ''}
          onValorChange={(v) => onCambio({ rotacion: Number(v) })}
          opciones={ROTACIONES.map((r) => ({ valor: String(r), etiqueta: `${r}°` }))}
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <span id={`${id}-zona`} className="text-[13px] font-medium text-fg">
          {t('zona')}
        </span>
        <Select value={elemento.zona ?? SIN_ZONA} onValueChange={(v) => onCambio({ zona: v === SIN_ZONA ? null : v })}>
          <SelectTrigger aria-labelledby={`${id}-zona`} className="h-10 border-line-strong bg-surface">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={SIN_ZONA}>{t('sinZona')}</SelectItem>
            {zonas.map((z) => (
              <SelectItem key={z} value={z}>
                {z}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <span id={`${id}-sitio`} className="block text-[13px] font-medium text-fg">
            {t('enSitio')}
          </span>
          <span id={`${id}-sitio-ayuda`} className="block text-xs text-fg-secondary">
            {t('enSitioAyuda')}
          </span>
        </div>
        <Switch
          checked={elemento.enSitio}
          onCheckedChange={(enSitio) => onCambio({ enSitio })}
          aria-labelledby={`${id}-sitio`}
          aria-describedby={`${id}-sitio-ayuda`}
        />
      </div>

      <div className="mt-auto flex items-center gap-2 pt-1">
        <KbdButton variante="secundario" tamano="md" icono={Copy} onClick={onDuplicar} className="flex-1">
          {t('duplicar')}
        </KbdButton>
        <KbdButton variante="fantasma" tamano="md" icono={Trash2} onClick={onEliminar} className="flex-1">
          {t('eliminar')}
        </KbdButton>
      </div>
    </aside>
  );
}
