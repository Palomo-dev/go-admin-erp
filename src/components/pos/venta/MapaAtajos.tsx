'use client';

import { Keyboard } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Kbd, PanelAdaptable, etiquetaAtajo, useNombresTecla } from '@/components/kit';
import { atajosPorGrupo } from '@/lib/pos/venta/atajos';

/**
 * Mapa de atajos (F1; Figma `250:81064` escritorio y `250:83167` hoja móvil):
 * se dibuja desde el mapa canónico `ATAJOS_POS`, así que nunca se desfasa de
 * lo que la pantalla registra.
 */
export interface MapaAtajosProps {
  abierto: boolean;
  onAbiertoChange: (abierto: boolean) => void;
}

export function MapaAtajos({ abierto, onAbiertoChange }: MapaAtajosProps) {
  const t = useTranslations('posVenta.atajos');
  const nombres = useNombresTecla();
  return (
    <PanelAdaptable
      abierto={abierto}
      onAbiertoChange={onAbiertoChange}
      titulo={t('titulo')}
      descripcion={t('descripcion')}
      icono={Keyboard}
      ancho={800}
    >
      <div className="grid gap-x-8 gap-y-5 md:grid-cols-2">
        {atajosPorGrupo().map(({ grupo, atajos }) => (
          <section key={grupo} aria-labelledby={`mapa-atajos-${grupo}`} className="flex flex-col gap-1">
            <h3 id={`mapa-atajos-${grupo}`} className="text-xs font-semibold uppercase tracking-wide text-fg-muted">
              {t(`grupos.${grupo}`)}
            </h3>
            <dl className="flex flex-col">
              {atajos.map((a) => (
                <div key={a.id} className="flex min-h-8 items-center justify-between gap-3 border-b border-line py-1 last:border-b-0">
                  <dt className="text-sm text-fg">{t(a.id)}</dt>
                  <dd className="m-0 flex shrink-0 items-center">
                    <span className="sr-only">{etiquetaAtajo(a.tecla, nombres)}</span>
                    <Kbd tecla={a.tecla} tamano="md" />
                  </dd>
                </div>
              ))}
            </dl>
          </section>
        ))}
      </div>
    </PanelAdaptable>
  );
}
