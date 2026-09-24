'use client';

/**
 * «Mi caja» (paso 12 de docs/implementacion/CAJAS-VENTAS-PLAN.md): las cifras,
 * el desglose, los pagos por método y los movimientos de TU caja (modo por
 * cajero) o de la caja de la sucursal (modo por sucursal), con las mismas
 * piezas del detalle y los datos del servidor (`useResumenCaja`, con la
 * máscara del cierre ciego). Sin red (Desktop) usa el cálculo local.
 *
 * Abrir, registrar movimiento y cerrar están en la cabecera de la pantalla;
 * el reporte, en «⋯». Si la caja la abrió otra persona («CL-Otro») se dice
 * quién puede cerrarla y se ofrece el detalle.
 */
import type { ReactNode } from 'react';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { ArrowLeftRight, Eye, Info, Plus, Wallet } from 'lucide-react';
import { EmptyState, Tarjeta } from '@/components/kit';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useMonedaCaja } from '../comunesCaja';
import { useResumenCaja } from '../useResumenCaja';
import { useBlindCloseMode } from '../useBlindCloseMode';
import { KpisCaja, TablaMovimientos, TarjetaDesglose, TarjetaPagosPorMetodo } from '../detalle/seccionesCaja';
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

export function MiCajaTab({ sesion, modo, refreshTrigger, puedeCerrar, onAbrirCaja, pestanas }: MiCajaTabProps) {
  const t = useTranslations('cajas.listado.miCaja');
  const router = useRouter();
  const { formatear } = useMonedaCaja();
  const { showExpected } = useBlindCloseMode();
  const { resumen, cargando, error, recargar } = useResumenCaja(sesion ? (sesion.id > 0 ? sesion.uuid : sesion.id) : null, {
    sesionLocal: sesion,
    ventas: true,
    activo: !!sesion,
  });

  // Tras un movimiento, un cierre o un cambio en tiempo real, se vuelve a leer.
  useEffect(() => {
    if (refreshTrigger > 0 && sesion) void recargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshTrigger]);

  // Sin red el resumen es local: la visibilidad la decide el cierre ciego de la pantalla.
  const vista = resumen && resumen.sinRed ? { ...resumen, verImportes: showExpected } : resumen;

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
      ) : cargando && !vista ? (
        <div className="flex flex-col gap-4" aria-busy="true">
          <Skeleton className="h-28 w-full rounded-xl" />
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            <Skeleton className="h-64 rounded-xl" />
            <Skeleton className="h-64 rounded-xl" />
            <Skeleton className="h-64 rounded-xl" />
          </div>
        </div>
      ) : error || !vista ? (
        <div className="rounded-xl border border-line bg-surface">
          <EmptyState variante="error" titulo={t('errorTitulo')} onReintentar={() => void recargar()} />
        </div>
      ) : (
        <>
          {sesion.status === 'open' && !puedeCerrar && (
            <div role="note" className="flex flex-wrap items-center gap-2 rounded-lg border border-line bg-subtle px-3 py-2 text-sm text-fg-secondary">
              <Info aria-hidden="true" className="size-4 shrink-0" strokeWidth={1.5} />
              <span className="min-w-0 flex-1">
                {sesion.opened_by_name ? t('soloCierraNombre', { nombre: sesion.opened_by_name }) : t('soloCierraCajero')}
              </span>
              {sesion.id > 0 && (
                <Button variant="outline" size="sm" className="gap-1.5" onClick={() => router.push(`/app/pos/cajas/${sesion.uuid}`)}>
                  <Eye aria-hidden="true" className="size-4" strokeWidth={1.5} />
                  {t('verDetalle')}
                </Button>
              )}
            </div>
          )}
          <KpisCaja resumen={vista} formatear={formatear} cargando={cargando} />
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            <TarjetaDesglose resumen={vista} formatear={formatear} />
            <TarjetaPagosPorMetodo resumen={vista} formatear={formatear} />
            <Tarjeta
              titulo={t('movimientos')}
              icono={ArrowLeftRight}
              sinRelleno
              accion={
                sesion.id > 0 ? (
                  <Button variant="ghost" size="sm" onClick={() => router.push(`/app/pos/cajas/${sesion.uuid}`)}>
                    {t('verTodo')}
                  </Button>
                ) : undefined
              }
            >
              <TablaMovimientos movimientos={vista.movimientos} formatear={formatear} compacta />
            </Tarjeta>
          </div>
        </>
      )}
    </div>
  );
}
