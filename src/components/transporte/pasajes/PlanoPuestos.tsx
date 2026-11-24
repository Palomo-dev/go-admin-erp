'use client';

/**
 * PlanoPuestos (Figma «23 Transporte» › 23, 2896:10785; en uso 2881:5394 y 2882:5820): la
 * cuadrícula del vehículo con Conductor y Puerta arriba, el pasillo donde no hay puestos y cada
 * puesto en su estado (libre, seleccionado, vendido, retenido, bloqueado). Un puesto libre (o
 * retenido por quien vende) se puede tocar; los demás solo se ven. Botones reales con nombre
 * accesible («Puesto 17, libre»).
 */
import { useTranslations } from 'next-intl';
import { cn } from '@/utils/Utils';
import { columnasPlano, vistaPuesto, type PuestoViaje, type VistaPuesto } from '@/lib/transporte/pasajes';

const CLASES: Record<VistaPuesto, string> = {
  libre: 'border-line-strong bg-surface text-fg hover:border-brand hover:bg-brand-tint',
  seleccionado: 'border-brand bg-brand-action text-fg-on-brand',
  vendido: 'border-transparent bg-subtle text-fg-muted',
  retenido: 'border-line-warning bg-warning-subtle text-warning-text',
  bloqueado: 'border-dashed border-line bg-subtle text-fg-muted',
};

interface Props {
  puestos: readonly PuestoViaje[];
  seleccionado: string | null;
  onElegir?: (etiqueta: string) => void;
  /** Lancha o yate: «Timón» en vez de «Conductor». */
  embarcacion?: boolean;
  deshabilitado?: boolean;
  className?: string;
}

export function PlanoPuestos({ puestos, seleccionado, onElegir, embarcacion, deshabilitado, className }: Props) {
  const t = useTranslations('transporte.pasajes.plano');
  const { cols, pasillos } = columnasPlano(puestos);
  const filas = Array.from(new Set(puestos.map((p) => p.fila))).sort((a, b) => a - b);
  const porCelda = new Map(puestos.map((p) => [`${p.fila}:${p.col}`, p]));
  const plantilla = { gridTemplateColumns: `repeat(${Math.max(cols, 1)}, minmax(2.5rem, 2.75rem))` };

  return (
    <div className={cn('flex flex-col items-center gap-3', className)}>
      <div className="rounded-2xl border border-line bg-surface p-4" role="group" aria-label={t('aria')}>
        <div className="mb-3 grid gap-2" style={plantilla}>
          <div className="col-span-2 rounded-md bg-subtle px-2 py-1.5 text-center text-xs text-fg-muted">{embarcacion ? t('timon') : t('conductor')}</div>
          <div style={{ gridColumnStart: Math.max(cols - 1, 3), gridColumnEnd: cols + 1 }} className="rounded-md border border-dashed border-line px-2 py-1.5 text-center text-xs text-fg-muted">
            {t('puerta')}
          </div>
        </div>
        <div className="grid gap-2" style={plantilla}>
          {filas.flatMap((fila) =>
            Array.from({ length: cols }, (_, i) => {
              const col = i + 1;
              const p = porCelda.get(`${fila}:${col}`);
              if (!p) return <div key={`${fila}:${col}`} aria-hidden="true" className={pasillos.includes(col) ? 'w-4' : ''} />;
              const vista = vistaPuesto(p, seleccionado);
              const elegible = !deshabilitado && !!onElegir && (vista === 'libre' || vista === 'seleccionado');
              return (
                <button
                  key={p.etiqueta}
                  type="button"
                  disabled={!elegible}
                  onClick={() => onElegir?.(p.etiqueta)}
                  aria-pressed={vista === 'seleccionado'}
                  aria-label={t('puestoAria', { puesto: p.etiqueta, estado: t(`estados.${vista}`) })}
                  title={p.ventana ? t('ventana') : undefined}
                  className={cn(
                    'flex h-10 items-center justify-center rounded-md border text-sm tabular-nums outline-none transition-colors focus-visible:ring-2 focus-visible:ring-brand disabled:cursor-not-allowed',
                    CLASES[vista],
                  )}
                >
                  {p.etiqueta}
                </button>
              );
            }),
          )}
        </div>
      </div>
      <ul className="flex flex-wrap justify-center gap-x-4 gap-y-1 text-xs text-fg-secondary" aria-label={t('leyenda')}>
        {(['libre', 'seleccionado', 'vendido', 'retenido', 'bloqueado'] as const).map((v) => (
          <li key={v} className="flex items-center gap-1.5">
            <span aria-hidden="true" className={cn('inline-block size-3 rounded-sm border', CLASES[v])} />
            {t(`estados.${v}`)}
          </li>
        ))}
      </ul>
    </div>
  );
}
