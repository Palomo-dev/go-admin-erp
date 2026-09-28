'use client';

import { useState, useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { supabase } from '@/lib/supabase/config';
import { formatCurrency } from '@/utils/Utils';
import { CardListSkeleton } from '@/components/common/PageSkeletons';
import { HtmlContentRenderer } from '@/components/shared/HtmlContentRenderer';
import { ShoppingBag } from 'lucide-react';
import { mensajeError, useFechasFicha } from './useFechasFicha';

// Interfaces para los elementos del timeline
// Los textos (título, descripción, estados) se arman al pintar, en el idioma activo.
interface TimelineItem {
  id: string;
  type: 'sale' | 'reservation' | 'activity' | 'web_order';
  date: Date;
  icon: React.ReactNode;
  amount?: number;
  /** Número de venta o de pedido web. */
  referencia?: string;
  /** Notas de la reserva o de la actividad (pueden traer HTML). */
  notas?: string | null;
  /** Fin de la reserva (timestamptz). */
  fin?: string;
  tipoActividad?: string;
  oportunidad?: string;
  tipoEntrega?: string | null;
  originalStatus?: string;
  originalPaymentStatus?: string;
  // Campos para reservas enriquecidas
  checkin?: string;
  checkout?: string;
  spaces?: string[];
  spaceTypes?: string[];
  folioBalance?: number;
  folioItemsCount?: number;
  folioPendingItems?: number;
  folioPendingAmount?: number;
  reservationId?: string;
}

interface TimelineTabProps {
  clienteId: string;
  organizationId: number;
}

interface FolioLinea {
  id: string;
  reservation_id: string;
  balance: number | string | null;
  status: string;
}

interface ItemFolioLinea {
  id: string;
  folio_id: string;
  amount: number | string | null;
  payment_status: string;
}

interface ReservaLinea {
  id: string;
  start_date: string;
  end_date: string;
  checkin?: string;
  checkout?: string;
  status: string;
  notes?: string | null;
  reservation_spaces?: { spaces?: { label?: string; space_types?: { name?: string } | null } | null }[] | null;
}

interface ActividadLinea {
  id: string;
  activity_type: string;
  notes?: string | null;
  occurred_at: string;
  related_type: string;
  related_id: string;
}

// Formato de fecha y hora de la línea de tiempo (instantes: zona de la organización)
const FECHA_HORA: Intl.DateTimeFormatOptions = {
  year: 'numeric',
  month: 'long',
  day: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
};

const DIA_MES_ANIO: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short', year: 'numeric' };

export default function TimelineTab({ clienteId, organizationId }: TimelineTabProps) {
  const t = useTranslations('clientes.ficha');
  const { instante, plana } = useFechasFicha();
  const formatDate = (date: Date | string) => instante(date, FECHA_HORA);

  // Estados de pedidos web y de pagos; lo desconocido se muestra tal cual.
  const traducirEstadoWebOrder = (estado: string | null | undefined): string => {
    if (!estado) return t('actividad.noAplica');
    const clave = estado.toLowerCase();
    return t.has(`actividad.estadosPedido.${clave}`) ? t(`actividad.estadosPedido.${clave}`) : estado;
  };
  const traducirEstadoPago = (estado: string | null | undefined): string => {
    if (!estado) return t('actividad.noAplica');
    const clave = estado.toLowerCase();
    return t.has(`actividad.estadosPago.${clave}`) ? t(`actividad.estadosPago.${clave}`) : estado;
  };

  const tituloDe = (item: TimelineItem): string => {
    switch (item.type) {
      case 'sale':
        return t('actividad.titulos.venta', { numero: item.referencia ?? '' });
      case 'reservation':
        return t('actividad.titulos.reserva', { fecha: formatDate(item.date) });
      case 'activity':
        return item.oportunidad
          ? t('actividad.titulos.actividadOportunidad', { tipo: item.tipoActividad ?? '', oportunidad: item.oportunidad })
          : t('actividad.titulos.actividad', { tipo: item.tipoActividad ?? '' });
      case 'web_order':
        return t('actividad.titulos.pedidoWeb', { numero: item.referencia ?? '' });
    }
  };

  const descripcionDe = (item: TimelineItem): string => {
    switch (item.type) {
      case 'sale':
        return t('actividad.descripcionVenta', {
          estado: traducirEstadoPago(item.originalStatus),
          pago: traducirEstadoPago(item.originalPaymentStatus),
        });
      case 'reservation':
        return item.notas || `${formatDate(item.date)} - ${formatDate(item.fin ?? '')}`;
      case 'activity':
        return item.notas || t('actividad.sinDetalles');
      case 'web_order':
        return `${traducirEstadoWebOrder(item.tipoEntrega)} | ${traducirEstadoWebOrder(item.originalStatus)}`;
    }
  };

  // Chip de estado: ventas y reservas con los estados de pago, pedidos web con los suyos.
  const estadoDe = (item: TimelineItem): string | null => {
    if (item.type === 'activity') return null;
    return item.type === 'web_order' ? traducirEstadoWebOrder(item.originalStatus) : traducirEstadoPago(item.originalStatus);
  };

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<{ mensaje: string | null } | null>(null);
  const [timelineItems, setTimelineItems] = useState<TimelineItem[]>([]);

  useEffect(() => {
    const fetchTimelineData = async () => {
      try {
        setLoading(true);
        setError(null);

        // 1. Obtener ventas del cliente
        const { data: salesData, error: salesError } = await supabase
          .from('sales')
          .select('id, total, sale_date, status, payment_status')
          .eq('customer_id', clienteId)
          .eq('organization_id', organizationId);

        if (salesError) throw salesError;

        // 2. Obtener reservas del cliente con espacios
        const { data: reservationsData, error: reservationsError } = await supabase
          .from('reservations')
          .select(`
            id, start_date, end_date, checkin, checkout, status, notes, total_estimated,
            reservation_spaces (
              space_id,
              spaces (
                label,
                space_types ( name )
              )
            )
          `)
          .eq('customer_id', clienteId)
          .eq('organization_id', organizationId);

        if (reservationsError) throw reservationsError;

        // 2b. Obtener folios de las reservas
        // PostgREST devuelve `spaces` como objeto (relación a uno); el tipo inferido lo pinta como arreglo.
        const reservas = (reservationsData ?? []) as unknown as ReservaLinea[];
        const reservationIds = reservas.map((r) => r.id);
        const foliosMap: Record<string, FolioLinea> = {};
        const folioItemsMap: Record<string, ItemFolioLinea[]> = {};

        if (reservationIds.length > 0) {
          const { data: foliosData } = await supabase
            .from('folios')
            .select('id, reservation_id, balance, status')
            .in('reservation_id', reservationIds);

          if (foliosData) {
            (foliosData as FolioLinea[]).forEach((f) => {
              foliosMap[f.reservation_id] = f;
            });

            const folioIds = (foliosData as FolioLinea[]).map((f) => f.id);
            if (folioIds.length > 0) {
              const { data: folioItemsData } = await supabase
                .from('folio_items')
                .select('id, folio_id, description, amount, payment_status, source')
                .in('folio_id', folioIds)
                .order('created_at', { ascending: false });

              if (folioItemsData) {
                (folioItemsData as ItemFolioLinea[]).forEach((item) => {
                  if (!folioItemsMap[item.folio_id]) {
                    folioItemsMap[item.folio_id] = [];
                  }
                  folioItemsMap[item.folio_id].push(item);
                });
              }
            }
          }
        }

        // 3. Obtener actividades relacionadas con el cliente
        const { data: activitiesData, error: activitiesError } = await supabase
          .from('activities')
          .select('id, activity_type, notes, occurred_at, related_type, related_id')
          .eq('related_id', clienteId)
          .eq('organization_id', organizationId);

        if (activitiesError) throw activitiesError;

        // 3b. Obtener IDs de oportunidades del cliente y sus actividades
        const { data: oppsData } = await supabase
          .from('opportunities')
          .select('id, name')
          .eq('customer_id', clienteId)
          .eq('organization_id', organizationId);

        const oppIds = (oppsData || []).map(o => o.id);
        const oppNameMap: Record<string, string> = {};
        (oppsData || []).forEach(o => { oppNameMap[o.id] = o.name; });

        let oppActivities: ActividadLinea[] = [];
        if (oppIds.length > 0) {
          const { data: oppActsData, error: oppActsError } = await supabase
            .from('activities')
            .select('id, activity_type, notes, occurred_at, related_type, related_id')
            .eq('related_type', 'opportunity')
            .in('related_id', oppIds)
            .eq('organization_id', organizationId);

          if (oppActsError) throw oppActsError;
          oppActivities = oppActsData || [];
        }

        // Combinar actividades del cliente y de oportunidades
        const allActivities: ActividadLinea[] = [...(activitiesData || []), ...oppActivities];

        // 4. Obtener pedidos web del cliente
        const { data: webOrdersData, error: webOrdersError } = await supabase
          .from('web_orders')
          .select('id, order_number, status, total, created_at, payment_status, delivery_type')
          .eq('customer_id', clienteId)
          .eq('organization_id', organizationId)
          .order('created_at', { ascending: false });

        if (webOrdersError) throw webOrdersError;

        // 5. Transformar los datos en items de timeline
        const timeline: TimelineItem[] = [
          // Transformar ventas
          ...(salesData || []).map(sale => ({
            id: `sale-${sale.id}`,
            type: 'sale' as const,
            date: new Date(sale.sale_date),
            referencia: String(sale.id),
            // Original values for coloring
            originalStatus: sale.status,
            originalPaymentStatus: sale.payment_status,
            amount: parseFloat(sale.total) || 0,
            icon: (
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M10 2a4 4 0 00-4 4v1H5a1 1 0 00-.994.89l-1 9A1 1 0 004 18h12a1 1 0 00.994-1.11l-1-9A1 1 0 0015 7h-1V6a4 4 0 00-4-4zm2 5V6a2 2 0 10-4 0v1h4zm-6 3a1 1 0 112 0 1 1 0 01-2 0zm7-1a1 1 0 100 2 1 1 0 000-2z" clipRule="evenodd" />
              </svg>
            ),
          })),

          // Transformar reservas con info de folio y espacios
          ...reservas.map((reservation) => {
            const spaces = (reservation.reservation_spaces || []).map((rs) => rs.spaces?.label).filter(Boolean) as string[];
            const spaceTypes = Array.from(new Set((reservation.reservation_spaces || []).map((rs) => rs.spaces?.space_types?.name).filter(Boolean))) as string[];
            const folio = foliosMap[reservation.id];
            const folioItems = folio ? (folioItemsMap[folio.id] || []) : [];
            const pendingItems = folioItems.filter((i) => i.payment_status === 'pending');
            const pendingAmount = pendingItems.reduce((sum, i) => sum + Number(i.amount), 0);

            return {
              id: `reservation-${reservation.id}`,
              type: 'reservation' as const,
              date: new Date(reservation.start_date),
              fin: reservation.end_date,
              notas: reservation.notes,
              icon: (
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M6 2a1 1 0 00-1 1v1H4a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V6a2 2 0 00-2-2h-1V3a1 1 0 10-2 0v1H7V3a1 1 0 00-1-1zm0 5a1 1 0 000 2h8a1 1 0 100-2H6z" clipRule="evenodd" />
                </svg>
              ),
              originalStatus: reservation.status,
              checkin: reservation.checkin,
              checkout: reservation.checkout,
              spaces,
              spaceTypes,
              folioBalance: folio ? Number(folio.balance) : undefined,
              folioItemsCount: folioItems.length,
              folioPendingItems: pendingItems.length,
              folioPendingAmount: pendingAmount,
              reservationId: reservation.id,
            } as TimelineItem;
          }),

          // Transformar actividades
          ...(allActivities).map(activity => ({
            id: `activity-${activity.id}`,
            type: 'activity' as const,
            date: new Date(activity.occurred_at),
            tipoActividad: activity.activity_type,
            oportunidad: activity.related_type === 'opportunity' ? oppNameMap[activity.related_id] || undefined : undefined,
            notas: activity.notes,
            icon: (
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-12a1 1 0 10-2 0v4a1 1 0 00.293.707l2.828 2.829a1 1 0 101.415-1.415L11 9.586V6z" clipRule="evenodd" />
              </svg>
            )
          })),
          // Transformar pedidos web
          ...(webOrdersData || []).map(order => ({
            id: `web_order-${order.id}`,
            type: 'web_order' as const,
            date: new Date(order.created_at),
            referencia: String(order.order_number),
            tipoEntrega: order.delivery_type,
            originalStatus: order.status,
            originalPaymentStatus: order.payment_status,
            amount: parseFloat(order.total) || 0,
            icon: <ShoppingBag className="h-5 w-5" />,
          })),
        ];

        // 6. Ordenar el timeline por fecha, más reciente primero
        timeline.sort((a, b) => b.date.getTime() - a.date.getTime());

        setTimelineItems(timeline);
      } catch (err) {
        console.error('Error al cargar el timeline:', err);
        setError({ mensaje: mensajeError(err) });
      } finally {
        setLoading(false);
      }
    };

    fetchTimelineData();
  }, [clienteId, organizationId]);

  // Renderizar estado de carga
  if (loading) {
    return (
      <div className="py-4">
        <CardListSkeleton cards={3} columns="1" />
      </div>
    );
  }

  // Renderizar error si existe
  if (error) {
    return (
      <div className="w-full py-8">
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4">
          <p className="text-red-700 dark:text-red-400">{error.mensaje || t('actividad.errorCarga')}</p>
        </div>
      </div>
    );
  }

  // Renderizar timeline vacío
  if (timelineItems.length === 0) {
    return (
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm p-6 text-center">
        <div className="w-16 h-16 mx-auto bg-blue-100 dark:bg-blue-900/20 rounded-full flex items-center justify-center">
          <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 text-blue-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </div>
        <h3 className="mt-4 text-lg font-medium text-gray-900 dark:text-white">{t('actividad.vacioTitulo')}</h3>
        <p className="mt-2 text-gray-500 dark:text-gray-400">
          {t('actividad.vacioDescripcion')}
        </p>
      </div>
    );
  }

  // Renderizar timeline con datos
  return (
    <div className="space-y-4">
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm p-6">
        <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-6">{t('actividad.titulo')}</h3>

        <div className="relative">
          {/* Línea vertical del timeline */}
          <div className="absolute top-0 left-5 bottom-0 w-0.5 bg-gray-200 dark:bg-gray-700"></div>

          {/* Items del timeline */}
          <div className="space-y-8">
            {timelineItems.map((item) => {
              const estado = estadoDe(item);
              // Definir color según el tipo
              let iconBg = '';
              let iconColor = '';

              switch(item.type) {
                case 'sale':
                  iconBg = 'bg-green-100 dark:bg-green-900/20';
                  iconColor = 'text-green-500';
                  break;
                case 'reservation':
                  iconBg = 'bg-blue-100 dark:bg-blue-900/20';
                  iconColor = 'text-blue-500';
                  break;
                case 'activity':
                  iconBg = 'bg-amber-100 dark:bg-amber-900/20';
                  iconColor = 'text-amber-500';
                  break;
                case 'web_order':
                  iconBg = 'bg-purple-100 dark:bg-purple-900/20';
                  iconColor = 'text-purple-500';
                  break;
              }

              return (
                <div key={item.id} className="relative pl-10">
                  {/* Icono del evento */}
                  <div className={`absolute left-0 p-2 rounded-full ${iconBg} ${iconColor}`}>
                    {item.icon}
                  </div>

                  {/* Contenido del evento */}
                  <div className="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-4">
                    <div className="flex flex-wrap justify-between items-start gap-2 mb-2">
                      <h4 className="text-sm font-medium text-gray-900 dark:text-white">
                        {tituloDe(item)}
                      </h4>
                      <span className="text-xs text-gray-500 dark:text-gray-400">
                        {formatDate(item.date)}
                      </span>
                    </div>

                    <HtmlContentRenderer html={descripcionDe(item)}  className="text-sm text-gray-600 dark:text-gray-300 mb-1" />

                    {item.amount !== undefined && (
                      <div className="mt-2">
                        <span className="text-sm font-medium text-gray-900 dark:text-white">
                          {t('actividad.monto', { monto: formatCurrency(item.amount) })}
                        </span>
                      </div>
                    )}

                    {estado && (
                      <div className="mt-2">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium
                          ${(item.originalStatus || '').toLowerCase().includes('complete') ? 'bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-500' :
                            (item.originalStatus || '').toLowerCase().includes('pending') ? 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/20 dark:text-yellow-500' :
                              'bg-blue-100 text-blue-800 dark:bg-blue-900/20 dark:text-blue-500'}`}
                        >
                          {t('actividad.estado', { estado })}
                        </span>
                      </div>
                    )}

                    {item.type === 'sale' && (
                      <div className="mt-2">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium
                          ${(item.originalPaymentStatus || '').toLowerCase() === 'paid' ? 'bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-500' :
                            (item.originalPaymentStatus || '').toLowerCase() === 'partial' ? 'bg-blue-100 text-blue-800 dark:bg-blue-900/20 dark:text-blue-500' :
                            (item.originalPaymentStatus || '').toLowerCase() === 'refunded' ? 'bg-purple-100 text-purple-800 dark:bg-purple-900/20 dark:text-purple-500' :
                            'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/20 dark:text-yellow-500'}`}
                        >
                          {t('actividad.pago', { pago: traducirEstadoPago(item.originalPaymentStatus) })}
                        </span>
                      </div>
                    )}

                    {/* Info enriquecida para reservas: espacios, folio, consumos */}
                    {item.type === 'reservation' && item.reservationId && (
                      <div className="mt-3 space-y-2 border-t border-gray-200 dark:border-gray-600 pt-2">
                        {/* Espacios ocupados */}
                        {item.spaces && item.spaces.length > 0 && (
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span className="text-xs text-gray-500 dark:text-gray-400">{t('actividad.espacios')}</span>
                            {item.spaces.map((space, i) => (
                              <span key={i} className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium bg-gray-200 dark:bg-gray-600 text-gray-700 dark:text-gray-300">
                                {space}
                                {item.spaceTypes?.[i] && <span className="ml-1 text-gray-400">· {item.spaceTypes[i]}</span>}
                              </span>
                            ))}
                          </div>
                        )}

                        {/* Fechas checkin / checkout */}
                        {item.checkin && item.checkout && (
                          <div className="flex flex-wrap items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
                            <span>
                              {t.rich('actividad.checkin', {
                                fecha: plana(item.checkin, DIA_MES_ANIO),
                                b: (fragmento) => <strong className="text-gray-700 dark:text-gray-300">{fragmento}</strong>,
                              })}
                            </span>
                            <span>→</span>
                            <span>
                              {t.rich('actividad.checkout', {
                                fecha: plana(item.checkout, DIA_MES_ANIO),
                                b: (fragmento) => <strong className="text-gray-700 dark:text-gray-300">{fragmento}</strong>,
                              })}
                            </span>
                          </div>
                        )}

                        {/* Folio info */}
                        {item.folioItemsCount !== undefined && item.folioItemsCount > 0 && (
                          <div className="flex flex-wrap items-center gap-2 text-xs">
                            <span className="inline-flex items-center px-1.5 py-0.5 rounded bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-400 font-medium">
                              {t('actividad.folioItems', { count: item.folioItemsCount })}
                            </span>
                            {(item.folioPendingItems ?? 0) > 0 ? (
                              <span className="inline-flex items-center px-1.5 py-0.5 rounded bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 font-medium">
                                {t('actividad.folioPendientes', {
                                  count: item.folioPendingItems ?? 0,
                                  monto: formatCurrency(item.folioPendingAmount || 0),
                                })}
                              </span>
                            ) : (
                              <span className="inline-flex items-center px-1.5 py-0.5 rounded bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 font-medium">
                                {t('actividad.todoPagado')}
                              </span>
                            )}
                            {item.folioBalance !== undefined && item.folioBalance > 0 && (
                              <span className="inline-flex items-center px-1.5 py-0.5 rounded bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 font-medium">
                                {t('actividad.saldo', { monto: formatCurrency(item.folioBalance) })}
                              </span>
                            )}
                            <a
                              href={`/app/pms/folios?reservation=${item.reservationId}`}
                              className="ml-auto text-blue-600 dark:text-blue-400 hover:underline"
                            >
                              {t('actividad.verFolio')}
                            </a>
                          </div>
                        )}

                        {/* Reserva sin folio */}
                        {item.folioItemsCount === 0 && (
                          <div className="text-xs text-gray-400 dark:text-gray-500">
                            {t('actividad.sinConsumos')}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
