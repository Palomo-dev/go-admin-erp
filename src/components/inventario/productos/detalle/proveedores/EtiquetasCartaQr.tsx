'use client';

import { Check, Plus } from 'lucide-react';
import { cn } from '@/utils/Utils';
import { useTextosCartaQr } from '@/components/pos/mesas/solicitudes/textosCartaQr';
import { KINDS_CARTA, chipsDeKind, type ChipKind, type EtiquetaConKind, type KindCarta } from './etiquetasDieta';

/**
 * «Dieta y alérgenos» del producto (Carta QR): un grupo de chips por kind —
 * Dieta, Alérgenos, Picante— con las etiquetas de la organización y las
 * sugerencias. Marcar asigna (y crea o marca el kind si hace falta); desmarcar
 * quita la etiqueta del producto. La escritura la hace la pantalla.
 */
export function EtiquetasCartaQr({
  etiquetas,
  asignadas,
  deshabilitado,
  onAlternar,
}: {
  etiquetas: readonly EtiquetaConKind[];
  asignadas: readonly number[];
  deshabilitado?: boolean;
  onAlternar: (kind: KindCarta, chip: ChipKind) => void;
}) {
  const t = useTextosCartaQr();
  return (
    <section aria-labelledby="etiquetas-carta-qr" className="flex flex-col gap-3 rounded-lg border border-line p-4">
      <div>
        <h3 id="etiquetas-carta-qr" className="text-sm font-semibold text-fg">
          {t('etiquetas.titulo')}
        </h3>
        <p className="text-[13px] text-fg-secondary">{t('etiquetas.descripcion')}</p>
      </div>
      {KINDS_CARTA.map((kind) => {
        const chips = chipsDeKind(kind, etiquetas, asignadas);
        return (
          <div key={kind} className="flex flex-col gap-1.5">
            <h4 id={`kind-${kind}`} className="text-xs font-medium text-fg-secondary">
              {t(`etiquetas.kind.${kind}`)}
            </h4>
            <div role="group" aria-labelledby={`kind-${kind}`} className="flex flex-wrap gap-2">
              {chips.map((c) => (
                <button
                  key={`${c.id ?? 'nueva'}-${c.nombre}`}
                  type="button"
                  aria-pressed={c.marcada}
                  disabled={deshabilitado}
                  onClick={() => onAlternar(kind, c)}
                  className={cn(
                    'inline-flex h-8 items-center gap-1 rounded-full border px-3 text-[13px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand disabled:opacity-50',
                    c.marcada ? 'border-line-brand bg-brand-tint font-medium text-brand' : 'border-line-strong bg-surface text-fg hover:bg-hover',
                    !c.id && !c.marcada && 'border-dashed',
                  )}
                >
                  {c.marcada ? (
                    <Check aria-hidden="true" className="size-3.5" strokeWidth={2} />
                  ) : (
                    !c.id && <Plus aria-hidden="true" className="size-3.5" strokeWidth={1.75} />
                  )}
                  {c.nombre}
                </button>
              ))}
            </div>
          </div>
        );
      })}
    </section>
  );
}
