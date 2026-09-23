'use client';

import type { ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import { Info, Plus, Wallet } from 'lucide-react';
import { EmptyState } from '@/components/kit';
import { CashSummaryCard } from '../CashSummaryCard';
import { MovimientosList } from '../MovimientosList';
import { ReportGenerator } from '../ReportGenerator';
import type { CashSession } from '../types';

export interface MiCajaTabProps {
  sesion: CashSession | null;
  modo: 'branch' | 'user';
  refreshTrigger: number;
  /** Lo decide `puedeCerrarCaja` con el permiso del servidor. */
  puedeCerrar: boolean;
  onAbrirCaja: () => void;
  pestanas: ReactNode;
}

/**
 * «Mi caja»: el resumen, el reporte imprimible y los movimientos de TU caja
 * (modo por cajero) o de la caja de la sucursal (modo por sucursal), igual
 * que antes del rediseño. Abrir, registrar movimiento y cerrar están en la
 * cabecera de la pantalla.
 */
export function MiCajaTab({ sesion, modo, refreshTrigger, puedeCerrar, onAbrirCaja, pestanas }: MiCajaTabProps) {
  const t = useTranslations('cajas.listado.miCaja');
  return (
    <div className="flex flex-col gap-4">
      <div className="flex lg:justify-end">{pestanas}</div>

      {!sesion ? (
        <div className="rounded-xl border border-line bg-surface">
          <EmptyState
            icono={Wallet}
            titulo={modo === 'user' ? t('vacioTituloUsuario') : t('vacioTituloSucursal')}
            descripcion={t('vacioDescripcion')}
            accion={{ etiqueta: t('abrirCaja'), icono: Plus, onClick: onAbrirCaja }}
          />
        </div>
      ) : (
        <>
          {sesion.status === 'open' && !puedeCerrar && (
            <div role="note" className="flex items-start gap-2 rounded-lg border border-line bg-subtle px-3 py-2 text-sm text-fg-secondary">
              <Info aria-hidden="true" className="mt-0.5 size-4 shrink-0" strokeWidth={1.5} />
              <span>
                {sesion.opened_by_name ? t('soloCierraNombre', { nombre: sesion.opened_by_name }) : t('soloCierraCajero')}
              </span>
            </div>
          )}
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            <div className="space-y-4 lg:col-span-2">
              <CashSummaryCard session={sesion} refreshTrigger={refreshTrigger} />
              <ReportGenerator sessionId={sesion.id} disabled={false} />
            </div>
            <div className="lg:col-span-1">
              <MovimientosList sessionId={sesion.id} refreshTrigger={refreshTrigger} />
            </div>
          </div>
        </>
      )}
    </div>
  );
}
