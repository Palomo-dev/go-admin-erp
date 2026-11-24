'use client';

/**
 * Panel desplegado de «Ventas» en «Módulos» del inicio (Figma `03` › Inicio,
 * 2916:44653; sin datos 2922:48296, al día 2922:48492; móvil 2921:47131).
 * Aprobado por el dueño el 2026-11-23.
 *
 * Cuatro cifras (hoy, periodo, ticket, por atender), «Últimas ventas · todos
 * los canales» (FilaVentaReciente + InsigniaCanal), «Abrir POS» y «Nuevo pedido
 * manual» (el mismo diálogo de Todas las ventas), ventas por canal y por sede.
 * Todo llega armado del servidor (`ventasWidgetInicio.ts`).
 */
import { useState } from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { StatusBadge } from '@/components/kit/StatusBadge';
import { InsigniaCanal } from '@/components/pos/ventas/InsigniaCanal';
import { DialogoPedidoManual } from '@/components/pos/pedidos-online/manual/DialogoPedidoManual';
import { useEtiquetaMetodoPago } from '@/components/pos/cajas/paymentMethodLabels';
import { useFormatDate } from '@/lib/context/OrganizationTimezoneContext';
import { BADGE_ESTADO_VENTA } from '@/lib/pos/ventas/estadoVenta';
import type { FilaVentaReciente, VentasInicio } from '@/lib/dashboard/ventasWidgetInicio';
import { AccionesWidget, BarraDesglose, KpisWidget, SinDatosWidget, useCifraWidget } from './PiezasWidget';

export interface PanelVentasInicioProps {
  datos: VentasInicio;
  organizationId: number;
  /** Tras crear un pedido manual, se relee el inicio. */
  onCambio: () => void;
}

function FilaReciente({ fila }: { fila: FilaVentaReciente }) {
  const t = useTranslations('inicioWidgets');
  const tEstados = useTranslations('posVentas.estados');
  const { formatTime } = useFormatDate();
  const cifra = useCifraWidget();
  const metodo = useEtiquetaMetodoPago();
  const quien = fila.cliente ?? (fila.mesa ? t('ventas.ultimas.mesa', { mesa: fila.mesa }) : t('ventas.ultimas.clienteGenerico'));
  const donde = [fila.sucursal, fila.metodos.map(metodo).join(' + ') || null].filter(Boolean).join(' · ');
  const contenido = (
    <>
      <span className="w-12 shrink-0 text-sm text-fg-secondary tabular-nums">{formatTime(fila.fecha)}</span>
      <span className="w-28 shrink-0 truncate text-sm font-medium text-fg max-sm:hidden">{fila.numero ?? '—'}</span>
      <span className="w-32 shrink-0 max-md:hidden">
        <InsigniaCanal canal={fila.canal} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm text-fg">{quien}</span>
        <span className="block truncate text-xs text-fg-secondary">{donde}</span>
      </span>
      <span className="shrink-0 text-sm font-semibold text-fg tabular-nums">{cifra(fila.total)}</span>
      <span className="w-28 shrink-0 text-right max-sm:hidden">
        <StatusBadge estado={BADGE_ESTADO_VENTA[fila.estado]} etiqueta={tEstados(fila.estado)} />
      </span>
    </>
  );
  const clases = 'flex items-center gap-3 border-t border-line px-3 py-2.5 first:border-t-0';
  return (
    <li data-venta={fila.id}>
      {fila.href ? (
        <Link href={fila.href} className={`${clases} outline-none hover:bg-hover focus-visible:ring-2 focus-visible:ring-brand`}>
          {contenido}
        </Link>
      ) : (
        <div className={clases}>{contenido}</div>
      )}
    </li>
  );
}

export function PanelVentasInicio({ datos, organizationId, onCambio }: PanelVentasInicioProps) {
  const t = useTranslations('inicioWidgets');
  const [manual, setManual] = useState(false);
  const abrirDialogo = () => setManual(true);
  const dialogo = manual ? (
    <DialogoPedidoManual organizationId={organizationId} abierto={manual} onAbiertoChange={setManual} onCreado={onCambio} />
  ) : null;

  if (datos.estado === 'sinDatos') {
    return (
      <>
        <SinDatosWidget titulo={t('ventas.vacio.titulo')} descripcion={t('ventas.vacio.descripcion')} acciones={datos.acciones} onDialogo={abrirDialogo} />
        {dialogo}
      </>
    );
  }

  return (
    <div className="flex flex-col gap-4" data-widget-inicio="ventas">
      <KpisWidget kpis={datos.kpis} />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
        <section aria-labelledby="inicio-ventas-ultimas" className="flex min-w-0 flex-col gap-2">
          <div className="flex items-center gap-2">
            <h3 id="inicio-ventas-ultimas" className="text-sm font-semibold leading-5 text-fg">
              {t('ventas.ultimas.titulo')}
            </h3>
            <StatusBadge estado="ventasHoy" etiqueta={t('ventas.ultimas.hoy', { n: datos.ventasHoy })} tono="neutro" apariencia="suave" />
          </div>
          {datos.ultimas.length === 0 ? (
            <p className="rounded-lg border border-line bg-surface px-4 py-3 text-sm leading-5 text-fg-secondary">{t('ventas.ultimas.vacio')}</p>
          ) : (
            <ul className="overflow-hidden rounded-lg border border-line bg-surface">
              {datos.ultimas.map((f) => (
                <FilaReciente key={f.id} fila={f} />
              ))}
            </ul>
          )}
        </section>
        <div className="flex min-w-0 flex-col gap-3">
          <AccionesWidget acciones={datos.acciones} onDialogo={abrirDialogo} className="lg:justify-end" />
          {datos.porCanal && <BarraDesglose desglose={datos.porCanal} />}
          {datos.porSede && <BarraDesglose desglose={datos.porSede} />}
          {datos.cajas && (
            <p className="flex flex-wrap items-center gap-x-2 text-xs leading-5 text-fg-secondary" data-cajas>
              <span>
                {datos.cajas.anteriores > 0
                  ? t('ventas.cajas.conAnteriores', { n: datos.cajas.abiertas, anteriores: datos.cajas.anteriores })
                  : t('ventas.cajas.abiertas', { n: datos.cajas.abiertas })}
              </span>
              {datos.cajas.href && (
                <Link href={datos.cajas.href} className="rounded-md font-medium text-link outline-none hover:underline focus-visible:ring-2 focus-visible:ring-brand">
                  {t('ventas.cajas.ver')}
                </Link>
              )}
            </p>
          )}
        </div>
      </div>
      <p className="text-xs leading-4 text-fg-secondary">{t('ventas.notaReportes')}</p>
      {dialogo}
    </div>
  );
}
