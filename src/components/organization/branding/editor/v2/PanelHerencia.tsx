'use client';

import { Button } from '@/components/ui/button';
import { HojaDetalle } from '@/components/kit/HojaDetalle';
import type { OrigenCampo } from '@/lib/website/contrato/documentoSitio';
import { CAMPOS_HEREDABLES } from '@/lib/website/v2/mapeoAjustes';
import type { EstadoSeccion } from '@/lib/website/v2/vistaEditor';
import { ChipHerencia, type TipoChipHerencia } from './ChipHerencia';

export function chipDeOrigen(origen: OrigenCampo | undefined): TipoChipHerencia {
  if (origen === 'propio') return 'personalizado';
  if (origen === 'vacio') return 'vacio';
  return 'heredado';
}

export function chipDeSeccion(estado: EstadoSeccion | undefined): TipoChipHerencia {
  if (estado === 'propia') return 'personalizado';
  if (estado === 'nueva') return 'nuevo';
  return 'heredado';
}

function describir(valor: unknown): string {
  if (valor === null || valor === undefined || valor === '') return '—';
  if (typeof valor === 'string') return valor.length > 48 ? `${valor.slice(0, 48)}…` : valor;
  if (typeof valor === 'number' || typeof valor === 'boolean') return String(valor);
  if (Array.isArray(valor)) return `${valor.length} elemento(s)`;
  return `${Object.keys(valor as Record<string, unknown>).length} dato(s)`;
}

interface PanelHerenciaProps {
  abierto: boolean;
  onAbiertoChange: (abierto: boolean) => void;
  nombreSede: string;
  origenes: Record<string, OrigenCampo>;
  valores: Record<string, unknown>;
  onHeredar: (columna: string) => void;
  onVaciar: (columna: string) => void;
}

/**
 * Herencia por campo de una sede (D6, Figma 05-26): cada ajuste dice si se hereda del principal,
 * es propio o está vacío a propósito. «Restablecer» vuelve a heredar; el valor propio se edita en
 * el inspector de siempre (encabezado, pie, estilo del sitio, SEO).
 */
export function PanelHerencia({ abierto, onAbiertoChange, nombreSede, origenes, valores, onHeredar, onVaciar }: PanelHerenciaProps) {
  const grupos = Array.from(new Set(CAMPOS_HEREDABLES.map((c) => c.grupo)));
  return (
    <HojaDetalle
      abierto={abierto}
      onAbiertoChange={onAbiertoChange}
      titulo={`Herencia · ${nombreSede}`}
      subtitulo="Lo que no personalices se hereda del sitio principal."
      ancho={560}
    >
      <div className="space-y-5">
        {grupos.map((grupo) => (
          <section key={grupo} aria-label={grupo} className="space-y-2">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">{grupo}</h3>
            <ul className="divide-y divide-gray-100 rounded-lg border border-gray-200 dark:divide-gray-800 dark:border-gray-700">
              {CAMPOS_HEREDABLES.filter((c) => c.grupo === grupo).map((c) => {
                const origen = origenes[c.columna];
                return (
                  <li key={c.columna} className="flex flex-wrap items-center gap-2 px-3 py-2">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm">{c.etiqueta}</p>
                      <p className="text-xs text-gray-500 dark:text-gray-400 truncate">{describir(valores[c.columna])}</p>
                    </div>
                    <ChipHerencia tipo={chipDeOrigen(origen)} />
                    {origen !== 'principal' ? (
                      <Button type="button" size="sm" variant="ghost" className="h-7 text-xs" onClick={() => onHeredar(c.columna)}>
                        Restablecer
                      </Button>
                    ) : (
                      <Button type="button" size="sm" variant="ghost" className="h-7 text-xs" onClick={() => onVaciar(c.columna)}>
                        Vaciar en esta sede
                      </Button>
                    )}
                  </li>
                );
              })}
            </ul>
          </section>
        ))}
      </div>
    </HojaDetalle>
  );
}

interface AvisoSeccionSedeProps {
  estado: EstadoSeccion | undefined;
  activa: boolean;
  onRestablecer: () => void;
}

/** Fila bajo cada sección de una sede: chip y, en la activa, explicación y «Restablecer» (Figma 05-23). */
export function AvisoSeccionSede({ estado, activa, onRestablecer }: AvisoSeccionSedeProps) {
  return (
    <div className="px-3 pb-2 -mt-1 space-y-1.5">
      <ChipHerencia tipo={chipDeSeccion(estado)} compacto />
      {activa && estado === 'hereda' ? (
        <p className="text-[11px] text-gray-600 dark:text-gray-400">
          Esta sección es igual a la del sitio principal. Si la editas aquí pasa a ser propia de esta sede; el principal no cambia.
        </p>
      ) : null}
      {activa && estado === 'propia' ? (
        <div className="flex items-center gap-2">
          <p className="text-[11px] text-gray-600 dark:text-gray-400 flex-1">Personalizada en esta sede.</p>
          <Button type="button" size="sm" variant="outline" className="h-6 text-[11px]" onClick={onRestablecer}>
            Restablecer
          </Button>
        </div>
      ) : null}
    </div>
  );
}
