'use client';

/**
 * Tarjeta «Ícono» de un botón (Figma «16 Sitio web» 2853:71499, propuesta 8): el ícono actual con
 * «Cambiar», los sugeridos de la acción, «Igual que todos» o «Propio» (peso propio del botón),
 * «Ver los 1.512 íconos» y «Subir mío · Fase 2». Reemplaza la rejilla fija del menú inferior; los
 * dibujos de siempre siguen en el selector («De siempre»), así nada de lo de hoy se pierde.
 */
import { useState } from 'react';
import { useLocale } from 'next-intl';
import { ChevronRight, type LucideIcon } from 'lucide-react';
import { cn } from '@/utils/Utils';
import { SegmentedControl } from '@/components/kit';
import { estiloDePeso, type PesoGlifo } from '@/lib/website/v2/glifosTienda';
import { EtiquetaGrupo } from '../PartesZonaGlobal';
import { FilaSegmento } from '../PildoraYBoton';
import { GlifoPhosphor } from './GlifoEditor';
import { SelectorIconos, SubirMiIcono, useTSelector, type IconoClasico } from './SelectorIconos';
import { PESOS_PROPIOS, claveEleccion, etiquetaIcono, refConPeso, sugeridosRef, type EleccionIcono } from './selectorIconosLogica';

/** Total del catálogo (para «Ver los 1.512 íconos»). */
export const TOTAL_PHOSPHOR = 1512;

export function CampoIcono({
  nombreAccion,
  accion,
  clasicos,
  actual,
  pesoGeneral,
  onElegir,
  pesoPropio,
}: {
  nombreAccion: string;
  accion: string;
  clasicos: readonly IconoClasico[];
  actual: EleccionIcono;
  /** Peso del estilo general (para «Duotono · como todos»). */
  pesoGeneral?: PesoGlifo;
  onElegir: (e: EleccionIcono) => void;
  /** Peso propio del botón (solo con un ícono del catálogo nuevo). */
  pesoPropio?: { valor: PesoGlifo | null; onCambiar: (p: PesoGlifo | null) => void } | null;
}) {
  const t = useTSelector();
  const locale = useLocale();
  const [abierto, setAbierto] = useState(false);
  const clasico = actual.tipo === 'clasico' ? clasicos.find((c) => c.nombre === actual.nombre) ?? null : null;
  const nombre = actual.tipo === 'phosphor' ? etiquetaIcono(actual.ref.name) : clasico?.etiqueta ?? actual.nombre;
  const pesoVisto: PesoGlifo = pesoPropio?.valor ?? pesoGeneral ?? 'regular';
  const resumen = pesoPropio?.valor
    ? t('propioResumen', { estilo: t(`estiloCard.${estiloDePeso(pesoPropio.valor)}`) })
    : actual.tipo === 'clasico'
      ? t('deSiempreResumen')
      : t('comoTodos', { estilo: t(`estiloCard.${estiloDePeso(pesoGeneral)}`) });
  const marcado = claveEleccion(actual);
  const sugeridos = sugeridosRef(accion);
  const IconoClasico: LucideIcon | null = clasico?.Icono ?? null;

  return (
    <div className="flex flex-col gap-2" data-campo-icono={accion}>
      <EtiquetaGrupo>{t('icono')}</EtiquetaGrupo>
      <div className="flex items-center gap-3 rounded-lg border border-line bg-surface p-2.5">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-brand-tint text-brand-deep">
          {actual.tipo === 'phosphor' ? (
            <GlifoPhosphor nombre={actual.ref.name} peso={pesoVisto} className="size-5" />
          ) : IconoClasico ? (
            <IconoClasico aria-hidden="true" className="size-5" />
          ) : null}
        </span>
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="truncate text-[13px] font-semibold leading-[18px] text-fg">{nombre}</span>
          <span className="truncate text-[11px] leading-[14px] text-fg-muted">{resumen}</span>
        </span>
        <button type="button" onClick={() => setAbierto(true)} className="inline-flex shrink-0 items-center gap-0.5 rounded-lg border border-line px-2.5 py-1.5 text-xs font-medium text-fg hover:bg-hover">
          {t('cambiar')}
          <ChevronRight aria-hidden="true" className="size-3.5" strokeWidth={1.5} />
        </button>
      </div>

      {sugeridos.length > 0 && (
        <div className="flex flex-col gap-1.5">
          <span className="text-[11px] leading-[14px] text-fg-muted">{t('sugeridosPara', { accion: nombreAccion })}</span>
          <div className="grid grid-cols-6 gap-1" role="radiogroup" aria-label={t('sugeridosPara', { accion: nombreAccion })}>
            {sugeridos.map((r) => {
              const ref = r.weight ? r : refConPeso(r.name, 'regular');
              const sel = marcado === claveEleccion({ tipo: 'phosphor', ref });
              const etiqueta = r.weight ? t(`peso.${r.weight}`) : etiquetaIcono(r.name);
              return (
                <button
                  key={`${r.name}:${r.weight ?? ''}`}
                  type="button"
                  role="radio"
                  aria-checked={sel}
                  title={etiqueta}
                  onClick={() => onElegir({ tipo: 'phosphor', ref })}
                  className={cn(
                    'flex h-12 flex-col items-center justify-center gap-0.5 rounded-lg border text-fg',
                    sel ? 'border-2 border-brand-action bg-brand-tint text-brand-deep' : 'border-transparent bg-subtle hover:bg-hover',
                  )}
                >
                  <GlifoPhosphor nombre={r.name} peso={r.weight ?? pesoGeneral ?? 'regular'} className="size-[18px]" />
                  <span className="w-full truncate px-0.5 text-center text-[9px] leading-[11px]">{etiqueta}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {pesoPropio && actual.tipo === 'phosphor' && (
        <div className="flex flex-col gap-1.5">
          <FilaSegmento<'todos' | 'propio'>
            etiqueta={t('estilo')}
            opciones={[
              { valor: 'todos', etiqueta: t('igualTodos') },
              { valor: 'propio', etiqueta: t('propio') },
            ]}
            valor={pesoPropio.valor ? 'propio' : 'todos'}
            onCambiar={(v) => pesoPropio.onCambiar(v === 'propio' ? (pesoGeneral && pesoGeneral !== 'regular' ? pesoGeneral : 'fill') : null)}
          />
          {pesoPropio.valor && (
            <SegmentedControl
              etiqueta={t('estilo')}
              tamano="sm"
              anchoCompleto
              opciones={PESOS_PROPIOS.map((p) => ({ valor: p, etiqueta: t(`peso.${p}`) }))}
              valor={PESOS_PROPIOS.includes(pesoPropio.valor) ? pesoPropio.valor : 'regular'}
              onValorChange={(p) => pesoPropio.onCambiar(p)}
            />
          )}
        </div>
      )}

      <div className="flex items-center justify-between gap-2">
        <button type="button" onClick={() => setAbierto(true)} className="inline-flex items-center gap-0.5 text-[12px] font-medium text-brand-deep hover:underline">
          {t('verTodos', { n: TOTAL_PHOSPHOR.toLocaleString(locale) })}
          <ChevronRight aria-hidden="true" className="size-3.5" strokeWidth={1.5} />
        </button>
        <SubirMiIcono compacto />
      </div>

      {abierto && (
        <SelectorIconos abierto={abierto} onAbiertoChange={setAbierto} nombreAccion={nombreAccion} accion={accion} clasicos={clasicos} actual={actual} onElegir={onElegir} />
      )}
    </div>
  );
}
