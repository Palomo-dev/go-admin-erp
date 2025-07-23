'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase/config';
import { formatCurrency } from '@/utils/Utils';

// Interfaces para los elementos del timeline
interface TimelineItem {
  id: string;
  type: 'sale' | 'reservation' | 'activity';
  date: Date;
  title: string;
  description: string;
  icon: React.ReactNode;
  amount?: number;
  status?: string;
  paymentStatus?: string;
  originalStatus?: string;
  originalPaymentStatus?: string;
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
        
        // 2. Obtener reservas del cliente
        const { data: reservationsData, error: reservationsError } = await supabase
          .from('reservations')
          .select('id, start_date, end_date, status, notes')
          .eq('customer_id', clienteId)
          .eq('organization_id', organizationId);
          
        if (reservationsError) throw reservationsError;
        
        // 3. Obtener actividades relacionadas con el cliente
        const { data: activitiesData, error: activitiesError } = await supabase
          .from('activities')
          .select('id, activity_type, notes, occurred_at, related_type')
          .eq('related_id', clienteId)
          .eq('organization_id', organizationId);
          
        if (activitiesError) throw activitiesError;
        
        // 4. Transformar los datos en items de timeline
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
          
          // Transformar reservas
          ...(reservationsData || []).map(reservation => ({
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
            status: traducirEstadoPago(reservation.status as string)
          })),
          
          // Transformar actividades
          ...(activitiesData || []).map(activity => ({
            id: `activity-${activity.id}`,
            type: 'activity' as const,
            date: new Date(activity.occurred_at),
            title: `Actividad: ${activity.activity_type}`,
            description: activity.notes || 'Sin detalles',
            icon: (
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-12a1 1 0 10-2 0v4a1 1 0 00.293.707l2.828 2.829a1 1 0 101.415-1.415L11 9.586V6z" clipRule="evenodd" />
              </svg>
            )
          }))
        ];
        
        // 5. Ordenar el timeline por fecha, más reciente primero
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
      <div className="w-full py-8">
        <div className="w-full flex justify-center">
          <div className="loading loading-spinner loading-md text-primary"></div>
        </div>
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
                    
                    <p className="text-sm text-gray-600 dark:text-gray-300 mb-1">
                      {item.description}
                    </p>
                    
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
