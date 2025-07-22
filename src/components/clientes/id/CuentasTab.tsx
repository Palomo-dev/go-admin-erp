'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase/config';
import { formatCurrency } from '@/utils/Utils';

// Interfaces para el componente
interface CuentaPorCobrar {
  id: string;
  sale_id?: number;
  amount: number;
  balance: number;
  due_date: string;
  status: string;
  days_overdue: number;
  created_at: string;
}

interface CuentasTabProps {
  clienteId: string;
  organizationId: number;
}

export default function CuentasTab({ clienteId, organizationId }: CuentasTabProps) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [cuentas, setCuentas] = useState<CuentaPorCobrar[]>([]);
  const [resumen, setResumen] = useState({
    totalDeuda: 0,
    totalVencido: 0,
    totalPendiente: 0
  });

  // Cargar datos de cuentas por cobrar
  useEffect(() => {
    const fetchCuentas = async () => {
      try {
        setLoading(true);
        setError(null);
        
        // La tabla accounts_receivable usa UUID como customer_id, no INTEGER
        // Usamos directamente el clienteId que ya es un UUID
        
        if (clienteId && clienteId.length > 0) {
          try {
            // Consultar cuentas por cobrar usando el UUID del cliente directamente
            console.log('Consultando cuentas para cliente UUID:', clienteId);
            console.log('Consultando accounts_receivable con organizationId:', organizationId);
            
            // Utilizamos la función RPC con SECURITY DEFINER para evitar problemas con RLS
            const { data, error } = await supabase
              .rpc('obtener_cuentas_por_cobrar_cliente', {
                p_customer_id: clienteId,
                p_organization_id: organizationId
              });
            
            if (error) {
              console.log('Error en consulta de cuentas:', error);
              setError('Error al cargar las cuentas por cobrar');
            } else {
              console.log('Datos recibidos de cuentas:', data);
              
              if (data && data.length > 0) {
                // Convertir los datos recibidos al formato que espera el componente
                const cuentasFormateadas = data.map((cuenta: any) => ({
                  ...cuenta,
                  amount: parseFloat(cuenta.amount || '0'),
                  balance: parseFloat(cuenta.balance || '0')
                }));
                
                console.log('Cuentas formateadas:', cuentasFormateadas);
                setCuentas(cuentasFormateadas);
                
                // Calcular resumen de deudas con los datos ya convertidos
                const totalDeuda = cuentasFormateadas.reduce((sum: number, cuenta: any) => 
                  sum + cuenta.amount, 0);
                const totalPendiente = cuentasFormateadas.reduce((sum: number, cuenta: any) => 
                  sum + cuenta.balance, 0);
                const totalVencido = cuentasFormateadas
                  .filter((cuenta: any) => cuenta.days_overdue > 0 && cuenta.status !== 'paid')
                  .reduce((sum: number, cuenta: any) => sum + cuenta.balance, 0);
                
                setResumen({
                  totalDeuda,
                  totalVencido,
                  totalPendiente
                });
                
                // Ya tenemos datos, salimos de la función
                setLoading(false);
                return;
              } else {
                console.log('No se encontraron cuentas por cobrar para el cliente');
              }
            }
          } catch (idErr) {
            console.error('Error al consultar cuentas:', idErr);
          }
        }
        
        // Si llegamos aquí, no hay datos o no pudimos hacer la consulta
        // Mostramos lista vacía
        setCuentas([]);
        setResumen({
          totalDeuda: 0,
          totalVencido: 0,
          totalPendiente: 0
        });
      } catch (err: any) {
        console.error('Error al cargar cuentas por cobrar:', err);
        // No mostramos error, simplemente lista vacía
        setCuentas([]);
        setResumen({
          totalDeuda: 0,
          totalVencido: 0,
          totalPendiente: 0
        });
      } finally {
        setLoading(false);
      }
    };

    fetchCuentas();
  }, [clienteId, organizationId]);
  
  // Función para determinar el color de estado
  const getStatusColor = (status: string, daysOverdue: number) => {
    if (status === 'paid') {
      return 'bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-500';
    }
    
    if (daysOverdue > 30) {
      return 'bg-red-100 text-red-800 dark:bg-red-900/20 dark:text-red-500';
    }
    
    if (daysOverdue > 0) {
      return 'bg-amber-100 text-amber-800 dark:bg-amber-900/20 dark:text-amber-500';
    }
    
    return 'bg-blue-100 text-blue-800 dark:bg-blue-900/20 dark:text-blue-500';
  };
  
  // Función para mostrar texto de estado
  const getStatusText = (status: string, daysOverdue: number) => {
    if (status === 'paid') {
      return 'Pagado';
    }
    
    if (daysOverdue > 30) {
      return `Vencido (${daysOverdue} días)`;
    }
    
    if (daysOverdue > 0) {
      return `Atrasado (${daysOverdue} días)`;
    }
    
    return 'Pendiente';
  };

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

  // Mostrar mensaje si no hay cuentas
  if (cuentas.length === 0) {
    return (
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm p-6 text-center">
        <div className="w-16 h-16 mx-auto bg-blue-100 dark:bg-blue-900/20 rounded-full flex items-center justify-center">
          <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 text-blue-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </div>
        <h3 className="mt-4 text-lg font-medium text-gray-900 dark:text-white">No hay cuentas por cobrar</h3>
        <p className="mt-2 text-gray-500 dark:text-gray-400">
          Este cliente no tiene deudas o pagos pendientes registrados en el sistema.
        </p>
      </div>
    );
  }

  // Mostrar tabla de cuentas
  return (
    <div className="space-y-6">
      {/* Tarjetas de resumen */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white dark:bg-gray-800 p-4 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700">
          <div className="text-sm text-gray-500 dark:text-gray-400">Total Deuda</div>
          <div className="mt-1 text-xl font-semibold text-gray-900 dark:text-white">
            {formatCurrency(resumen.totalDeuda)}
          </div>
        </div>
        
        <div className="bg-white dark:bg-gray-800 p-4 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700">
          <div className="text-sm text-gray-500 dark:text-gray-400">Monto Vencido</div>
          <div className="mt-1 text-xl font-semibold text-red-600 dark:text-red-400">
            {formatCurrency(resumen.totalVencido)}
          </div>
        </div>
        
        <div className="bg-white dark:bg-gray-800 p-4 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700">
          <div className="text-sm text-gray-500 dark:text-gray-400">Pendiente de Pago</div>
          <div className="mt-1 text-xl font-semibold text-blue-600 dark:text-blue-400">
            {formatCurrency(resumen.totalPendiente)}
          </div>
        </div>
      </div>

      {/* Tabla de cuentas por cobrar */}
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="bg-gray-50 dark:bg-gray-700/50">
                <th className="px-6 py-3 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
                  ID Venta
                </th>
                <th className="px-6 py-3 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
                  Monto
                </th>
                <th className="px-6 py-3 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
                  Balance
                </th>
                <th className="px-6 py-3 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
                  Vencimiento
                </th>
                <th className="px-6 py-3 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
                  Estado
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
              {cuentas.map(cuenta => (
                <tr key={cuenta.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/70">
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-white">
                    {cuenta.sale_id || '-'}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-white">
                    {formatCurrency(cuenta.amount)}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-white">
                    {formatCurrency(cuenta.balance)}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-white">
                    {new Date(cuenta.due_date).toLocaleDateString()}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm">
                    <span className={`px-2 py-1 rounded-full text-xs font-medium ${getStatusColor(cuenta.status, cuenta.days_overdue)}`}>
                      {getStatusText(cuenta.status, cuenta.days_overdue)}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
