'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase/config';
import { formatCurrency } from '@/utils/Utils';
import { ShoppingBag, Calendar, DollarSign, Home } from 'lucide-react';

interface HistorialItem {
  id: string;
  tipo: 'venta' | 'reserva' | 'web_order';
  titulo: string;
  fecha: string;
  monto: number;
  status: string;
}

// Interfaces para estadísticas del cliente
interface EstadisticaCard {
  title: string;
  value: string | number;
  icon: React.ReactNode;
  description?: string;
  change?: number;
}

interface ResumenTabProps {
  clienteId: string;
  organizationId: number;
}

export default function ResumenTab({ clienteId, organizationId }: ResumenTabProps) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [stats, setStats] = useState({
    totalCompras: 0,
    totalEstadias: 0,
    montoTotalGastado: 0,
    ultimaCompra: null as Date | null,
    ultimaEstadia: null as Date | null,
    totalWebOrders: 0,
    webOrdersPendientes: 0,
    webOrdersPagadas: 0,
    webOrdersCanceladas: 0,
    ultimaWebOrder: null as Date | null,
    historial: [] as HistorialItem[],
  });

  // Cargar datos para el resumen del cliente
  useEffect(() => {
    const fetchResumenData = async () => {
      try {
        setLoading(true);
        setError(null);
        
        // 1. Obtener total de ventas del cliente
        const { data: salesData, error: salesError } = await supabase
          .from('sales')
          .select('id, total, sale_date')
          .eq('customer_id', clienteId)
          .eq('organization_id', organizationId)
          .order('sale_date', { ascending: false });
        
        if (salesError) throw salesError;
        
        // 2. Obtener total de reservas del cliente
        const { data: reservationsData, error: reservationsError } = await supabase
          .from('reservations')
          .select('id, start_date, end_date')
          .eq('customer_id', clienteId)
          .eq('organization_id', organizationId)
          .order('start_date', { ascending: false });
          
        if (reservationsError) throw reservationsError;

        // 3. Obtener pedidos web del cliente
        const { data: webOrdersData, error: webOrdersError } = await supabase
          .from('web_orders')
          .select('id, order_number, status, total, created_at')
          .eq('customer_id', clienteId)
          .eq('organization_id', organizationId)
          .order('created_at', { ascending: false });
        
        if (webOrdersError) throw webOrdersError;

        // 4. Calcular estadísticas — web orders pagadas cuentan como compras
        const paidWebOrders = (webOrdersData || []).filter(o => o.status === 'paid' || o.status === 'delivered');
        const totalCompras = (salesData?.length || 0) + paidWebOrders.length;
        const totalEstadias = reservationsData?.length || 0;
        const montoVentas = salesData?.reduce((sum, sale) => sum + (parseFloat(sale.total) || 0), 0) || 0;
        const montoWebPaid = paidWebOrders.reduce((sum, o) => sum + (parseFloat(o.total) || 0), 0);
        const montoTotalGastado = montoVentas + montoWebPaid;
        
        const ultimaCompraRaw = [
          ...(salesData || []).map(s => new Date(s.sale_date)),
          ...paidWebOrders.map(o => new Date(o.created_at)),
        ].sort((a, b) => b.getTime() - a.getTime());
        const ultimaCompra = ultimaCompraRaw.length > 0 ? ultimaCompraRaw[0] : null;
        const ultimaEstadia = reservationsData && reservationsData.length > 0 ? new Date(reservationsData[0].start_date) : null;

        const totalWebOrders = webOrdersData?.length || 0;
        const webOrdersPendientes = webOrdersData?.filter(o => ['pending', 'confirmed'].includes(o.status))?.length || 0;
        const webOrdersPagadas = paidWebOrders.length;
        const webOrdersCanceladas = webOrdersData?.filter(o => o.status === 'cancelled')?.length || 0;
        const ultimaWebOrder = webOrdersData && webOrdersData.length > 0 ? new Date(webOrdersData[0].created_at) : null;

        // 5. Construir historial unificado (ventas + reservas + web orders)
        const historial: HistorialItem[] = [
          ...(salesData || []).slice(0, 10).map(s => ({
            id: `sale-${s.id}`, tipo: 'venta' as const,
            titulo: `Venta #${s.id.slice(0, 8)}`,
            fecha: s.sale_date, monto: parseFloat(s.total) || 0,
            status: s.status || 'N/A',
          })),
          ...(reservationsData || []).slice(0, 10).map(r => ({
            id: `res-${r.id}`, tipo: 'reserva' as const,
            titulo: `Reserva ${new Date(r.start_date).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })}`,
            fecha: r.start_date, monto: 0,
            status: 'reserva',
          })),
          ...(webOrdersData || []).slice(0, 10).map(o => ({
            id: `web-${o.id}`, tipo: 'web_order' as const,
            titulo: `Pedido #${o.order_number}`,
            fecha: o.created_at, monto: parseFloat(o.total) || 0,
            status: o.status || 'N/A',
          })),
        ].sort((a, b) => new Date(b.fecha).getTime() - new Date(a.fecha).getTime()).slice(0, 8);

        // 6. Actualizar el estado
        setStats({
          totalCompras,
          totalEstadias,
          montoTotalGastado,
          ultimaCompra,
          ultimaEstadia,
          totalWebOrders,
          webOrdersPendientes,
          webOrdersPagadas,
          webOrdersCanceladas,
          ultimaWebOrder,
          historial,
        });

      } catch (err: any) {
        console.error('Error al cargar el resumen:', err);
        setError(err.message || 'Error al cargar datos del resumen');
      } finally {
        setLoading(false);
      }
    };

    fetchResumenData();
  }, [clienteId, organizationId]);

  // Preparar tarjetas de estadísticas — 4 KPIs compactos
  const estadisticas: EstadisticaCard[] = [
    {
      title: 'Compras',
      value: stats.totalCompras,
      icon: <ShoppingBag className="h-5 w-5" />,
      description: stats.ultimaCompra ? `Última: ${stats.ultimaCompra.toLocaleDateString()}` : 'Sin compras'
    },
    {
      title: 'Estadías',
      value: stats.totalEstadias,
      icon: <Home className="h-5 w-5" />,
      description: stats.ultimaEstadia ? `Última: ${stats.ultimaEstadia.toLocaleDateString()}` : 'Sin estadías'
    },
    {
      title: 'Gasto Total',
      value: formatCurrency(stats.montoTotalGastado),
      icon: <DollarSign className="h-5 w-5" />,
      description: 'Incluye pedidos web pagados'
    },
    {
      title: 'Pedidos Web',
      value: stats.totalWebOrders,
      icon: <ShoppingBag className="h-5 w-5" />,
      description: stats.ultimaWebOrder
        ? `Último: ${stats.ultimaWebOrder.toLocaleDateString()}`
        : 'Sin pedidos web'
    },
  ];

  // Mostrar estado de carga
  if (loading) {
    return (
      <div className="w-full py-8">
        <div className="w-full flex justify-center">
          <div className="loading loading-spinner loading-md text-primary"></div>
        </div>
      </div>
    );
  }

  // Mostrar error si existe
  if (error) {
    return (
      <div className="w-full py-8">
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4">
          <p className="text-red-700 dark:text-red-400">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Sección de KPIs — 2x2 en móvil, 4 en línea en desktop con mejor proporción */}
      <div className="grid grid-cols-2 md:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-5">
        {estadisticas.map((stat, index) => (
          <div 
            key={`stat-${index}`} 
            className="bg-white dark:bg-gray-800 p-4 sm:p-6 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700"
          >
            <div className="flex items-center justify-between mb-3">
              <div className="text-xs sm:text-sm text-gray-500 dark:text-gray-400 font-medium">
                {stat.title}
              </div>
              <div className="p-1.5 sm:p-2 bg-primary/10 rounded-full text-primary">
                {stat.icon}
              </div>
            </div>
            <div className="text-lg sm:text-2xl font-bold text-gray-900 dark:text-white truncate">
              {stat.value}
            </div>
            <div className="text-xs text-gray-500 dark:text-gray-400 mt-1 truncate">
              {stat.description}
            </div>
          </div>
        ))}
      </div>

      {/* Sección de historial reciente — ventas, reservas y pedidos web unificados */}
      <div className="bg-white dark:bg-gray-800 p-4 sm:p-6 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700">
        <h3 className="text-base sm:text-lg font-medium text-gray-900 dark:text-white mb-4">
          Historial Reciente
        </h3>
        {stats.historial.length > 0 ? (
          <div className="space-y-2">
            {stats.historial.map((item) => {
              const iconMap = {
                venta: <DollarSign className="h-4 w-4 text-green-500" />,
                reserva: <Calendar className="h-4 w-4 text-blue-500" />,
                web_order: <ShoppingBag className="h-4 w-4 text-purple-500" />,
              };
              const statusColor = (s: string) => {
                const sl = s.toLowerCase();
                if (['cancelled', 'cancelled', 'cancelado'].some(x => sl.includes(x)))
                  return 'bg-red-100 text-red-800 dark:bg-red-900/20 dark:text-red-400';
                if (['paid', 'delivered', 'complete', 'checked_in', 'checked_out'].some(x => sl.includes(x)))
                  return 'bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-400';
                return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/20 dark:text-yellow-400';
              };
              return (
                <div key={item.id} className="flex items-center justify-between bg-gray-50 dark:bg-gray-700/50 rounded-lg px-3 sm:px-4 py-2">
                  <div className="flex items-center gap-2 sm:gap-3 min-w-0">
                    {iconMap[item.tipo]}
                    <div className="min-w-0">
                      <span className="text-sm font-medium text-gray-900 dark:text-white truncate block">{item.titulo}</span>
                      <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium ${statusColor(item.status)}`}>{item.status}</span>
                    </div>
                  </div>
                  <div className="flex flex-col items-end flex-shrink-0">
                    {item.monto > 0 && <span className="text-sm font-medium text-gray-900 dark:text-white">{formatCurrency(item.monto)}</span>}
                    <span className="text-xs text-gray-400 dark:text-gray-500">{new Date(item.fecha).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })}</span>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="text-gray-500 dark:text-gray-400 text-sm text-center py-4">
            No hay actividad reciente para este cliente.
          </div>
        )}
      </div>
    </div>
  );
}
