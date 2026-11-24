'use client';

/** Barra «$ 42,0 M de $ 40,0 M · 105 %» del componente Progress de Figma (7:91). */
import { BarraProgreso } from '@/components/kit/BarraProgreso';
import { cn } from '@/utils/Utils';
import { tonoBarraCuota } from '@/lib/services/crm/equipoComercialModel';

export function ProgresoCuota({ etiqueta, pct, aria, className }: { etiqueta: string; pct: number | null; aria: string; className?: string }) {
  return (
    <div className={cn('flex min-w-0 flex-col gap-2', className)}>
      <div className="flex items-center justify-between gap-2 whitespace-nowrap">
        <span className="truncate text-[13px] leading-[18px] text-fg-secondary">{etiqueta}</span>
        <span className="text-xs font-medium leading-4 text-fg tabular-nums">{pct === null ? '—' : `${pct} %`}</span>
      </div>
      <BarraProgreso valor={Math.min(pct ?? 0, 100)} etiqueta={aria} textoValor={pct === null ? undefined : `${pct} %`} tono={tonoBarraCuota(pct)} />
    </div>
  );
}
