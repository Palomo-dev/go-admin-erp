'use client';

/**
 * Columna izquierda del editor (Figma A/05a, figma-estilo/02 y 10, D/05-22): «Secciones de
 * Inicio» · «Arrastra para cambiar el orden», la fila fija «Encabezado» (Global), una
 * `SortableRow` por sección (icono, ojo, «⋯», chip «Oculta en celular»), la fila fija «Pie de
 * página», «+ Añadir sección» y, al pie, «Estilo del sitio» e «Historial de versiones».
 *
 * En una sede: solo las secciones distintas en esa sede llevan la etiqueta neutra «Solo en esta
 * sede»; las que comparte con el sitio principal no llevan etiqueta ni candado (el primer cambio
 * pregunta si va solo a la sede o a todas). El candado queda solo en el encabezado y el pie
 * globales. Arrastrar usa `useArrastreArbol` del kit y, con teclado, Alt + ↑/↓.
 */
import { ArrowDown, ArrowUp, Copy, History, Layers, Plus, Trash2, Wand2 } from 'lucide-react';
import { cn } from '@/utils/Utils';
import { clasesBoton, useArrastreArbol, type AccionFila } from '@/components/kit';
import type { WebsitePageSection } from '@/lib/services/websitePageBuilderService';
import { SortableRow } from '@/components/sitio-web/ui/SortableRow';
import { DeviceVisibilityChip } from '@/components/sitio-web/ui/DeviceVisibilityChip';
import { visibilidadDeSeccion } from '@/lib/website/v2/estiloSeccion';
import { iconoDeSeccion, nombreEnLista } from './iconosSeccion';
import type { AmbitoSede, ZonaGlobal } from './useEditorSitio';
import { useTextosEditor } from './textos';

export interface ListaSeccionesProps {
  tituloPagina: string;
  secciones: readonly WebsitePageSection[];
  seleccionada: string | null;
  zona: ZonaGlobal | null;
  onSeleccionar: (id: string) => void;
  onSeleccionarZona: (zona: ZonaGlobal) => void;
  onAlternarVisible: (id: string, visible: boolean) => void;
  onDuplicar: (id: string) => void;
  onEliminar: (id: string) => void;
  onMover: (desde: number, hasta: number) => void;
  onAnadir: () => void;
  onEstiloSitio: () => void;
  onHistorial?: () => void;
  estiloActivo?: boolean;
  historialActivo?: boolean;
  /** Edición de una sede V2: ámbito de cada sección. */
  ambito?: (id: string) => AmbitoSede | undefined;
  /** Página sin secciones con plantilla por defecto (detalle de producto…). */
  onPorDefecto?: () => void;
  soloLectura?: boolean;
  className?: string;
}

export function ListaSecciones(p: ListaSeccionesProps) {
  const t = useTextosEditor();
  const arrastre = useArrastreArbol({
    puedeSoltar: (o, d) => (d === null ? t('lista.noMover') : true),
    onSoltar: (o, d) => {
      if (d !== null) p.onMover(o, d);
    },
    deshabilitado: p.soloLectura,
    ayuda: t('lista.arrastrar'),
  });

  return (
    <nav aria-label={t('lista.titulo', { pagina: p.tituloPagina })} className={cn('flex min-h-0 flex-col bg-surface', p.className)}>
      <div className="px-4 pb-2 pt-4">
        <h2 className="text-base font-semibold leading-6 text-fg">{t('lista.titulo', { pagina: p.tituloPagina })}</h2>
        <p className="text-[13px] leading-[18px] text-fg-secondary">{t('lista.ayuda')}</p>
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto px-3 pb-3">
        <SortableRow
          etiqueta={t('lista.encabezado')}
          icono={Layers}
          global
          seleccionada={p.zona === 'header'}
          onSeleccionar={() => p.onSeleccionarZona('header')}
        />
        {p.secciones.map((s, i) => {
          const nombre = nombreEnLista(s.section_type, s.section_variant);
          const ambito = p.ambito?.(s.id);
          const soloSede = ambito === 'personalizada' || ambito === 'solo-esta-sede';
          const vis = visibilidadDeSeccion(s);
          const fina = s.is_visible && !(vis.computador && vis.tableta && vis.celular);
          const acciones: AccionFila[] = [
            { id: 'duplicar', etiqueta: t('lista.duplicar'), icono: Copy, onSelect: () => p.onDuplicar(s.id) },
            { id: 'subir', etiqueta: t('lista.subir'), icono: ArrowUp, onSelect: () => p.onMover(i, i - 1), oculta: i === 0 },
            {
              id: 'bajar',
              etiqueta: t('lista.bajar'),
              icono: ArrowDown,
              onSelect: () => p.onMover(i, i + 1),
              oculta: i === p.secciones.length - 1,
            },
            { id: 'eliminar', etiqueta: t('lista.eliminar'), icono: Trash2, onSelect: () => p.onEliminar(s.id), destructiva: true },
          ];
          return (
            <SortableRow
              key={s.id}
              etiqueta={nombre}
              icono={iconoDeSeccion(s.section_type)}
              detalle={
                soloSede || fina ? (
                  <span className="inline-flex min-w-0 items-center gap-2">
                    {soloSede && <span className="truncate text-fg-secondary">{t('lista.soloEstaSede')}</span>}
                    {fina && <DeviceVisibilityChip visibilidad={vis} />}
                  </span>
                ) : undefined
              }
              seleccionada={p.seleccionada === s.id}
              oculta={!s.is_visible}
              onSeleccionar={() => p.onSeleccionar(s.id)}
              onAlternarVisible={p.soloLectura ? undefined : () => p.onAlternarVisible(s.id, !s.is_visible)}
              acciones={p.soloLectura ? undefined : acciones}
              arrastre={arrastre.nodo(i)}
              onMover={p.soloLectura ? undefined : (d) => p.onMover(i, i + d)}
            />
          );
        })}
        {p.secciones.length === 0 && (
          <div className="flex flex-col gap-2 rounded-lg border border-dashed border-line-strong px-3 py-4 text-center">
            <p className="text-[13px] leading-[18px] text-fg-secondary">{t('lista.vacia')}</p>
            {p.onPorDefecto && (
              <button type="button" onClick={p.onPorDefecto} className="self-center text-[13px] font-medium text-link hover:underline">
                {t('lista.porDefecto')}
              </button>
            )}
          </div>
        )}
        <SortableRow
          etiqueta={t('lista.pie')}
          icono={Layers}
          global
          seleccionada={p.zona === 'footer'}
          onSeleccionar={() => p.onSeleccionarZona('footer')}
        />
        {!p.soloLectura && (
          <button type="button" onClick={p.onAnadir} className={cn(clasesBoton({ variante: 'secundario', tamano: 'md', anchoCompleto: true }), 'mt-1')}>
            <Plus aria-hidden="true" className="size-4" strokeWidth={1.5} />
            {t('lista.anadir')}
          </button>
        )}
      </div>

      <div className="flex flex-col gap-1 border-t border-line p-3">
        <button
          type="button"
          onClick={p.onEstiloSitio}
          aria-pressed={p.estiloActivo}
          className={cn(clasesBoton({ variante: p.estiloActivo ? 'tinte' : 'fantasma', tamano: 'md', anchoCompleto: true }))}
        >
          <Wand2 aria-hidden="true" className="size-4" strokeWidth={1.5} />
          {t('lista.estiloSitio')}
        </button>
        {p.onHistorial && (
          <button
            type="button"
            onClick={p.onHistorial}
            aria-pressed={p.historialActivo}
            className={cn(clasesBoton({ variante: p.historialActivo ? 'tinte' : 'fantasma', tamano: 'md', anchoCompleto: true }))}
          >
            <History aria-hidden="true" className="size-4" strokeWidth={1.5} />
            {t('lista.historial')}
          </button>
        )}
      </div>
    </nav>
  );
}
