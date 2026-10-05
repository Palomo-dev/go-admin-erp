'use client';

import { useState, type ReactNode } from 'react';
import { Globe, X } from 'lucide-react';
import { TabBar, idPanel, idPestana } from '@/components/kit/TabBar';
import {
  PESTANAS_INSPECTOR,
  TITULO_ZONA,
  type PestanaInspector,
  type ZonaGlobal,
} from './zonaGlobal';

/**
 * Inspector derecho del encabezado o el pie (Figma 1787:899260, 1788:27378):
 * cabecera «Global · aparece en todas las páginas», pestañas Diseño /
 * Contenido / Estilo / Celular y la banda «Cambia en todas las páginas». El
 * contenido de cada pestaña lo pone quien lo usa (los paneles de siempre).
 *
 * La pestaña inicial se fija al montar: el editor lo monta con `key={zona}`,
 * así que cada selección vuelve a empezar por `pestanaInicial`.
 */
export interface InspectorZonaGlobalProps {
  zona: ZonaGlobal;
  pestanaInicial: PestanaInspector;
  paneles: Record<PestanaInspector, ReactNode>;
  onCerrar: () => void;
}

export function InspectorZonaGlobal({ zona, pestanaInicial, paneles, onCerrar }: InspectorZonaGlobalProps) {
  const [pestana, setPestana] = useState<PestanaInspector>(pestanaInicial);
  const id = `inspector-${zona}`;
  const titulo = TITULO_ZONA[zona];

  return (
    <aside
      aria-label={`Inspector: ${titulo}`}
      className="flex h-full min-h-0 w-full flex-col border-t border-line bg-surface text-fg md:w-[360px] md:min-w-[360px] md:border-l md:border-t-0"
    >
      <div className="flex items-start gap-2 px-4 pt-4">
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <h2 className="text-base font-semibold leading-[22px] text-fg">{titulo}</h2>
          <p className="text-xs font-medium text-fg-secondary">Global · aparece en todas las páginas</p>
        </div>
        <button
          type="button"
          onClick={onCerrar}
          aria-label={`Cerrar ${titulo.toLowerCase()}`}
          className="flex size-8 shrink-0 items-center justify-center rounded-lg text-fg-secondary hover:bg-hover hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
        >
          <X aria-hidden="true" className="size-4" strokeWidth={1.5} />
        </button>
      </div>

      <TabBar
        id={id}
        etiqueta={`Ajustes de ${titulo.toLowerCase()}`}
        pestanas={PESTANAS_INSPECTOR}
        valor={pestana}
        onValorChange={setPestana}
        className="mt-2 px-2"
      />

      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
        <div className="mb-3 flex items-center gap-2 rounded-lg border border-line-info bg-info-subtle px-3 py-2">
          <Globe aria-hidden="true" className="size-4 shrink-0 text-info-text" strokeWidth={1.5} />
          <p className="text-sm font-medium text-info-text">Cambia en todas las páginas</p>
        </div>
        <div role="tabpanel" id={idPanel(id, pestana)} aria-labelledby={idPestana(id, pestana)} className="space-y-4">
          {paneles[pestana]}
        </div>
      </div>
    </aside>
  );
}
