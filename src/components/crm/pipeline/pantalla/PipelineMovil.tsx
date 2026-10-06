'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Check } from 'lucide-react';
import { cn } from '@/utils/Utils';
import { Badge } from '@/components/ui/badge';
import type { OpcionUsuario } from '@/components/crm/kit/camposCrm';
import { useMonedaOrganizacion } from '@/lib/hooks/useOrgCurrency';
import { formatMoneda } from '@/lib/utils/moneda';
import { ListaMovilOportunidades } from '@/components/crm/oportunidad/ListaMovilOportunidades';
import { totalDeEtapa, type EtapaApi, type PermisosPantalla, type ResumenApi, type Tablero } from '@/components/crm/oportunidad/oportunidadLogica';
import type { useAccionesOportunidad } from '@/components/crm/oportunidad/useAccionesOportunidad';

/**
 * Pipeline móvil (Figma 771:37311, 812:54748): una columna a la vez con
 * selector de etapa en chips, total de la columna en moneda base (aviso
 * «incl. USD») y las tarjetas con acciones; mover de etapa por el menú «⋯»
 * (hoja) → `MoveStageDialog`. Mismos datos paginados que el kanban.
 */
export interface PipelineMovilProps {
  etapas: readonly EtapaApi[];
  tablero: Tablero;
  resumen: ResumenApi | null;
  hoy: string;
  usuarios: readonly OpcionUsuario[];
  usuarioId: string | null;
  permisos: PermisosPantalla;
  acciones: ReturnType<typeof useAccionesOportunidad>;
  onAbrir: (id: string) => void;
  onCargarMas: (etapaId: string) => void;
}

export function PipelineMovil(p: PipelineMovilProps) {
  const t = useTranslations('crm.oportunidad.tablero');
  const tc = useTranslations('crm.kit.columna');
  const moneda = useMonedaOrganizacion();
  const [elegida, setElegida] = useState<string | null>(null);
  const etapa = p.etapas.find((e) => e.id === elegida) ?? p.etapas[0];
  if (!etapa) return <div className="h-40 animate-pulse rounded-xl bg-subtle" aria-busy="true" />;
  const col = p.tablero[etapa.id];
  const total = totalDeEtapa(p.resumen, etapa.id, p.hoy);
  return (
    <div className="flex flex-col gap-3">
      {/* Chips de etapa: eligen qué columna se ve (un FILTRO de la misma vista), no son pestañas → radiogroup. */}
      <div role="radiogroup" aria-label={t('etapasAria')} className="-mx-4 flex gap-2 overflow-x-auto px-4">
        {p.etapas.map((e) => {
          const activa = e.id === etapa.id;
          return (
            <button key={e.id} type="button" role="radio" aria-checked={activa} onClick={() => setElegida(e.id)} className={cn('inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full border px-3 text-[13px]', activa ? 'border-brand bg-brand-tint font-medium text-brand-deep' : 'border-line-strong text-fg')}>
              {activa && <Check aria-hidden="true" className="size-3.5" />}
              {t('chipEtapa', { etapa: e.name, n: p.tablero[e.id]?.total ?? totalDeEtapa(p.resumen, e.id, p.hoy).cantidad })}
            </button>
          );
        })}
      </div>
      <div className="flex items-center justify-between gap-2 rounded-xl border border-line bg-surface p-3">
        <div className="flex flex-col">
          <span className="text-lg font-semibold text-fg">{formatMoneda(total.resumen.total, moneda)}</span>
          <span className="text-xs text-fg-secondary">{t('resumenColumna', { moneda: moneda.code, n: col?.total ?? total.cantidad, prob: etapa.probability ?? 0 })}</span>
        </div>
        {total.incluye && <Badge tono="informacion" tamano="sm">{tc('incluye', { cantidad: total.incluye.cantidad, moneda: total.incluye.moneda })}</Badge>}
      </div>
      {!col || (col.cargando && col.pagina === 0) ? (
        <div className="flex flex-col gap-2" aria-busy="true">{[0, 1].map((i) => <div key={i} className="h-40 animate-pulse rounded-xl bg-subtle" />)}</div>
      ) : col.filas.length === 0 ? (
        <p className="rounded-xl border border-dashed border-line-strong px-3 py-6 text-center text-[13px] text-fg-secondary">{tc('vacia')}</p>
      ) : (
        <ListaMovilOportunidades densidad="kanban" filas={col.filas} total={col.total} cargando={col.cargando} error={col.error ? t('errorColumna') : null} usuarios={p.usuarios} usuarioId={p.usuarioId} permisos={p.permisos} acciones={p.acciones} seleccion={new Set()} onSeleccion={() => undefined} onAbrir={p.onAbrir} onCargarMas={() => p.onCargarMas(etapa.id)} />
      )}
    </div>
  );
}
