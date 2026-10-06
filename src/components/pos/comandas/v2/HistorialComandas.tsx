'use client';

import * as React from 'react';
import { useTranslations } from 'next-intl';
import { ChefHat, History } from 'lucide-react';
import { EmptyState, PageHeader, Pagination } from '@/components/kit';
import KitchenService, { type KitchenTicket } from '@/lib/services/kitchenService';
import { formatDateTimeInTz } from '@/lib/utils/dateDisplay';
import { useTituloComanda } from './ComandaTarjeta';

/**
 * Historial de comandas (entregadas y canceladas) del enlace «Ver historial de
 * comandas»: el tablero solo muestra las entregadas de los últimos 30 min.
 * Listado paginado con la paginación única del kit.
 */
export function HistorialComandas({
  organizationId,
  branchId,
  timezone,
  onVolver,
  onVer,
}: {
  organizationId: number;
  branchId: number | null;
  timezone: string;
  onVolver: () => void;
  onVer?: (c: KitchenTicket) => void;
}) {
  const t = useTranslations('posComandasV2.historial');
  const titulo = useTituloComanda();
  const [pagina, setPagina] = React.useState(1);
  const [tamano, setTamano] = React.useState(20);
  const [datos, setDatos] = React.useState<{ tickets: KitchenTicket[]; total: number } | null>(null);
  const [error, setError] = React.useState(false);

  const cargar = React.useCallback(() => {
    setError(false);
    setDatos(null);
    KitchenService.getHistorial({ organizationId, branchId, pagina, tamano })
      .then(setDatos)
      .catch(() => setError(true));
  }, [organizationId, branchId, pagina, tamano]);
  React.useEffect(cargar, [cargar]);

  return (
    <div className="flex flex-col gap-4 bg-canvas px-4 pb-6 pt-4 sm:px-6 lg:pt-6">
      <PageHeader
        titulo={t('titulo')}
        subtitulo={t('subtitulo')}
        icono={History}
        variante="form"
        volverA="/app/pos/comandas"
        onVolver={onVolver}
        cargando={!datos && !error}
        migas={[{ etiqueta: 'POS', href: '/app/pos' }, { etiqueta: t('comandas'), href: '/app/pos/comandas' }, { etiqueta: t('titulo') }]}
      />
      {error ? (
        <EmptyState variante="error" titulo={t('error')} onReintentar={cargar} />
      ) : datos && datos.tickets.length === 0 ? (
        <EmptyState icono={ChefHat} titulo={t('vacio')} />
      ) : (
        <div className="overflow-hidden rounded-xl border border-line bg-surface">
          <table className="w-full text-sm">
            <thead className="bg-subtle text-left text-xs font-medium text-fg-secondary">
              <tr>
                <th className="px-4 py-2.5">{t('comanda')}</th>
                <th className="px-4 py-2.5">{t('enviada')}</th>
                <th className="hidden px-4 py-2.5 sm:table-cell">{t('productos')}</th>
                <th className="px-4 py-2.5">{t('estado')}</th>
              </tr>
            </thead>
            <tbody>
              {(datos?.tickets ?? []).map((c) => (
                <tr key={c.id} className="border-t border-line hover:bg-hover">
                  <td className="px-4 py-2.5">
                    <button type="button" onClick={() => onVer?.(c)} className="text-left font-medium text-fg hover:underline">
                      {titulo(c)}
                    </button>
                    <span className="block text-xs text-fg-muted">#{c.id}</span>
                  </td>
                  <td className="px-4 py-2.5 tabular-nums text-fg-secondary">{formatDateTimeInTz(c.created_at, timezone)}</td>
                  <td className="hidden px-4 py-2.5 text-fg-secondary sm:table-cell">
                    {(c.kitchen_ticket_items ?? []).map((i) => `${Number(i.quantity ?? 1)}× ${i.product_name ?? i.sale_items?.products?.name ?? ''}`).join(' · ')}
                  </td>
                  <td className="px-4 py-2.5">
                    <span className={(c.status as string) === 'cancelled' ? 'text-danger-text' : 'text-fg-secondary'}>
                      {(c.status as string) === 'cancelled' ? t('cancelada', { motivo: c.cancellation_reason ?? '' }) : t('entregada')}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="border-t border-line px-4 py-3">
            <Pagination
              pagina={pagina}
              tamano={tamano}
              total={datos?.total ?? 0}
              onPaginaChange={setPagina}
              onTamanoChange={(n) => {
                setTamano(n);
                setPagina(1);
              }}
              sustantivo={{ singular: t('sustantivo'), plural: t('sustantivoPlural') }}
              cargando={!datos}
            />
          </div>
        </div>
      )}
    </div>
  );
}
