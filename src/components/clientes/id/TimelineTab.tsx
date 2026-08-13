'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase/config';
import { formatCurrency } from '@/utils/Utils';
import { CardListSkeleton } from '@/components/common/PageSkeletons';
import { HtmlContentRenderer } from '@/components/shared/HtmlContentRenderer';
import { ShoppingBag } from 'lucide-react';

// Interfaces para los elementos del timeline
interface TimelineItem {
  id: string;
  type: 'sale' | 'reservation' | 'activity' | 'web_order';
  date: Date;
  title: string;
  description: string;
  icon: React.ReactNode;
  amount?: number;
  status?: string;
  paymentStatus?: string;
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

// Función para formatear fechas
const formatDate = (date: Date): string => {
  return new Intl.DateTimeFormat('es-ES', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  }).format(date);
};

// Función para traducir estados de web orders
const traducirEstadoWebOrder = (estado: string | undefined): string => {
  if (!estado) return 'N/A';
  const traducciones: Record<string, string> = {
    'pending': 'Pendiente',
    'confirmed': 'Confirmado',
    'preparing': 'Preparando',
    'ready': 'Listo',
    'delivering': 'En entrega',
    'delivered': 'Entregado',
    'cancelled': 'Cancelado',
    'paid': 'Pagado',
    'completed': 'Completado',
  };
  return traducciones[estado.toLowerCase()] || estado;
};

// Función para traducir estados de pago
const traducirEstadoPago = (estado: string | undefined): string => {
  if (!estado) return 'N/A';
  
  const traducciones: Record<string, string> = {
    'paid': 'Pagado',
    'partial': 'Parcial',
    'pending': 'Pendiente',
    'refunded': 'Reembolsado',
    'complete': 'Completado',
    'scheduled': 'Programado',
    'cancelled': 'Cancelado'
  };

  return traducciones[estado.toLowerCase()] || estado;
};

export default function TimelineTab({ clienteId, organizationId }: TimelineTabProps) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
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
        const reservationIds = (reservationsData || []).map((r: any) => r.id);
        let foliosMap: Record<string, any> = {};
        let folioItemsMap: Record<string, any[]> = {};

        if (reservationIds.length > 0) {
          const { data: foliosData } = await supabase
            .from('folios')
            .select('id, reservation_id, balance, status')
            .in('reservation_id', reservationIds);

          if (foliosData) {
            foliosData.forEach((f: any) => {
              foliosMap[f.reservation_id] = f;
            });

            const folioIds = foliosData.map((f: any) => f.id);
            if (folioIds.length > 0) {
              const { data: folioItemsData } = await supabase
                .from('folio_items')
                .select('id, folio_id, description, amount, payment_status, source')
                .in('folio_id', folioIds)
                .order('created_at', { ascending: false });

              if (folioItemsData) {
                folioItemsData.forEach((item: any) => {
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
        
        let oppActivities: any[] = [];
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
        const allActivities = [...(activitiesData || []), ...oppActivities];
        
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
            title: `Venta #${sale.id}`,
            description: `Estado: ${traducirEstadoPago(sale.status)} | Pago: ${traducirEstadoPago(sale.payment_status)}`,
            // Original values for coloring
            originalStatus: sale.status,
            originalPaymentStatus: sale.payment_status,
            amount: parseFloat(sale.total) || 0,
            icon: (
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M10 2a4 4 0 00-4 4v1H5a1 1 0 00-.994.89l-1 9A1 1 0 004 18h12a1 1 0 00.994-1.11l-1-9A1 1 0 0015 7h-1V6a4 4 0 00-4-4zm2 5V6a2 2 0 10-4 0v1h4zm-6 3a1 1 0 112 0 1 1 0 01-2 0zm7-1a1 1 0 100 2 1 1 0 000-2z" clipRule="evenodd" />
              </svg>
            ),
            status: traducirEstadoPago(sale.status),
            paymentStatus: traducirEstadoPago(sale.payment_status)
          })),
          
          // Transformar reservas con info de folio y espacios
          ...(reservationsData || []).map((reservation: any) => {
            const spaces = (reservation.reservation_spaces || []).map((rs: any) => rs.spaces?.label).filter(Boolean) as string[];
            const spaceTypes = Array.from(new Set((reservation.reservation_spaces || []).map((rs: any) => rs.spaces?.space_types?.name).filter(Boolean))) as string[];
            const folio = foliosMap[reservation.id];
            const folioItems = folio ? (folioItemsMap[folio.id] || []) : [];
            const pendingItems = folioItems.filter((i: any) => i.payment_status === 'pending');
            const pendingAmount = pendingItems.reduce((sum: number, i: any) => sum + Number(i.amount), 0);

            return {
              id: `reservation-${reservation.id}`,
              type: 'reservation' as const,
              date: new Date(reservation.start_date),
              title: `Reservación: ${formatDate(new Date(reservation.start_date))}`,
              description: reservation.notes || `${formatDate(new Date(reservation.start_date))} - ${formatDate(new Date(reservation.end_date))}`,
              icon: (
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M6 2a1 1 0 00-1 1v1H4a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V6a2 2 0 00-2-2h-1V3a1 1 0 10-2 0v1H7V3a1 1 0 00-1-1zm0 5a1 1 0 000 2h8a1 1 0 100-2H6z" clipRule="evenodd" />
                </svg>
              ),
              status: traducirEstadoPago(reservation.status as string),
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
            title: `Actividad: ${activity.activity_type}${activity.related_type === 'opportunity' && oppNameMap[activity.related_id] ? ` — ${oppNameMap[activity.related_id]}` : ''}`,
            description: activity.notes || 'Sin detalles',
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
            title: `Pedido Web #${order.order_number}`,
            description: `${traducirEstadoWebOrder(order.delivery_type)} | ${traducirEstadoWebOrder(order.status)}`,
            originalStatus: order.status,
            originalPaymentStatus: order.payment_status,
            amount: parseFloat(order.total) || 0,
            icon: <ShoppingBag className="h-5 w-5" />,
            status: traducirEstadoWebOrder(order.status),
            paymentStatus: traducirEstadoWebOrder(order.payment_status),
          })),
        ];
        
        // 6. Ordenar el timeline por fecha, más reciente primero
        timeline.sort((a, b) => b.date.getTime() - a.date.getTime());
        
        setTimelineItems(timeline);
      } catch (err: any) {
        console.error('Error al cargar el timeline:', err);
        setError(err.message || 'Error al cargar datos del timeline');
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
          <p className="text-red-700 dark:text-red-400">{error}</p>
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
        <h3 className="mt-4 text-lg font-medium text-gray-900 dark:text-white">No hay actividad reciente</h3>
        <p className="mt-2 text-gray-500 dark:text-gray-400">
          Este cliente no tiene actividades, ventas o reservaciones registradas en el sistema.
        </p>
      </div>
    );
  }

  // Renderizar timeline con datos
  return (
    <div className="space-y-4">
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm p-6">
        <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-6">Historial de Actividad</h3>
        
        <div className="relative">
          {/* Línea vertical del timeline */}
          <div className="absolute top-0 left-5 bottom-0 w-0.5 bg-gray-200 dark:bg-gray-700"></div>
          
          {/* Items del timeline */}
          <div className="space-y-8">
            {timelineItems.map((item) => {
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
                        {item.title}
                      </h4>
                      <span className="text-xs text-gray-500 dark:text-gray-400">
                        {formatDate(item.date)}
                      </span>
                    </div>
                    
                    <HtmlContentRenderer html={item.description} className="text-sm text-gray-600 dark:text-gray-300 mb-1" />
                    
                    {item.amount !== undefined && (
                      <div className="mt-2">
                        <span className="text-sm font-medium text-gray-900 dark:text-white">
                          Monto: {formatCurrency(item.amount)}
                        </span>
                      </div>
                    )}
                    
                    {item.status && (
                      <div className="mt-2">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium 
                          ${(item.originalStatus || '').toLowerCase().includes('complete') ? 'bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-500' : 
                            (item.originalStatus || '').toLowerCase().includes('pending') ? 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/20 dark:text-yellow-500' : 
                              'bg-blue-100 text-blue-800 dark:bg-blue-900/20 dark:text-blue-500'}`}
                        >
                          Estado: {item.status}
                        </span>
                      </div>
                    )}
                    
                    {item.paymentStatus && item.type === 'sale' && (
                      <div className="mt-2">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium 
                          ${(item.originalPaymentStatus || '').toLowerCase() === 'paid' ? 'bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-500' : 
                            (item.originalPaymentStatus || '').toLowerCase() === 'partial' ? 'bg-blue-100 text-blue-800 dark:bg-blue-900/20 dark:text-blue-500' :
                            (item.originalPaymentStatus || '').toLowerCase() === 'refunded' ? 'bg-purple-100 text-purple-800 dark:bg-purple-900/20 dark:text-purple-500' :
                            'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/20 dark:text-yellow-500'}`}
                        >
                          Pago: {item.paymentStatus}
                        </span>
                      </div>
                    )}

                    {/* Info enriquecida para reservas: espacios, folio, consumos */}
                    {item.type === 'reservation' && item.reservationId && (
                      <div className="mt-3 space-y-2 border-t border-gray-200 dark:border-gray-600 pt-2">
                        {/* Espacios ocupados */}
                        {item.spaces && item.spaces.length > 0 && (
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span className="text-xs text-gray-500 dark:text-gray-400">Espacio(s):</span>
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
                            <span>Check-in: <strong className="text-gray-700 dark:text-gray-300">{new Date(item.checkin).toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' })}</strong></span>
                            <span>→</span>
                            <span>Check-out: <strong className="text-gray-700 dark:text-gray-300">{new Date(item.checkout).toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' })}</strong></span>
                          </div>
                        )}

                        {/* Folio info */}
                        {item.folioItemsCount !== undefined && item.folioItemsCount > 0 && (
                          <div className="flex flex-wrap items-center gap-2 text-xs">
                            <span className="inline-flex items-center px-1.5 py-0.5 rounded bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-400 font-medium">
                              Folio: {item.folioItemsCount} item(s)
                            </span>
                            {item.folioPendingItems! > 0 ? (
                              <span className="inline-flex items-center px-1.5 py-0.5 rounded bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 font-medium">
                                {item.folioPendingItems} pendiente(s) · {formatCurrency(item.folioPendingAmount || 0)}
                              </span>
                            ) : (
                              <span className="inline-flex items-center px-1.5 py-0.5 rounded bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 font-medium">
                                Todo pagado
                              </span>
                            )}
                            {item.folioBalance !== undefined && item.folioBalance > 0 && (
                              <span className="inline-flex items-center px-1.5 py-0.5 rounded bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 font-medium">
                                Saldo: {formatCurrency(item.folioBalance)}
                              </span>
                            )}
                            <a
                              href={`/app/pms/folios?reservation=${item.reservationId}`}
                              className="ml-auto text-blue-600 dark:text-blue-400 hover:underline"
                            >
                              Ver folio →
                            </a>
                          </div>
                        )}

                        {/* Reserva sin folio */}
                        {item.folioItemsCount === 0 && (
                          <div className="text-xs text-gray-400 dark:text-gray-500">
                            Sin consumos registrados en folio
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
