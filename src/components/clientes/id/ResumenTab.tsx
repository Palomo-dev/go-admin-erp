'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase/config';
import { formatCurrency } from '@/utils/Utils';

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
    totalTickets: 0,
    montoTotalGastado: 0,
    ultimaCompra: null as Date | null,
    ultimaEstadia: null as Date | null
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

        // 3. Calcular estadísticas
        const totalCompras = salesData?.length || 0;
        const totalEstadias = reservationsData?.length || 0;
        const montoTotalGastado = salesData?.reduce((sum, sale) => sum + (parseFloat(sale.total) || 0), 0) || 0;
        
        const ultimaCompra = salesData && salesData.length > 0 ? new Date(salesData[0].sale_date) : null;
        const ultimaEstadia = reservationsData && reservationsData.length > 0 ? new Date(reservationsData[0].start_date) : null;

        // 4. Actualizar el estado
        setStats({
          totalCompras,
          totalEstadias,
          totalTickets: 0, // No hay tabla de tickets aún
          montoTotalGastado,
          ultimaCompra,
          ultimaEstadia
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

  // Preparar tarjetas de estadísticas
  const estadisticas: EstadisticaCard[] = [
    {
      title: 'Total Compras',
      value: stats.totalCompras,
      icon: (
        <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z" />
        </svg>
      ),
      description: stats.ultimaCompra ? `Última: ${stats.ultimaCompra.toLocaleDateString()}` : 'Sin compras'
    },
    {
      title: 'Total Estadías',
      value: stats.totalEstadias,
      icon: (
        <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
        </svg>
      ),
      description: stats.ultimaEstadia ? `Última: ${stats.ultimaEstadia.toLocaleDateString()}` : 'Sin estadías'
    },
    {
      title: 'Gasto Total',
      value: formatCurrency(stats.montoTotalGastado),
      icon: (
        <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      ),
      description: 'Valor total de transacciones'
    }
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
      {/* Sección de KPIs */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {estadisticas.map((stat, index) => (
          <div 
            key={`stat-${index}`} 
            className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700"
          >
            <div className="flex justify-between">
              <div className="text-gray-500 dark:text-gray-400">
                {stat.title}
              </div>
              <div className="p-2 bg-primary/10 rounded-full text-primary">
                {stat.icon}
              </div>
            </div>
            <div className="mt-4">
              <div className="text-2xl font-bold text-gray-900 dark:text-white">
                {stat.value}
              </div>
              <div className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                {stat.description}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Sección de gráfico o información adicional */}
      <div className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700">
        <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-4">
          Historial de Actividad
        </h3>
        {/* Aquí podría ir un gráfico o tabla adicional */}
        <div className="text-gray-500 dark:text-gray-400">
          Se mostrará un gráfico de actividad del cliente cuando haya suficientes datos disponibles.
        </div>
      </div>
    </div>
  );
}
