'use client';

import React, { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase/config';
import { getOrganizationId } from '@/lib/hooks/useOrganization';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useFormatDate, useOrgTimezone } from '@/lib/context/OrganizationTimezoneContext';
import { getDateRange, todayInTz, toPlainDate } from '@/lib/utils/timezone';
import { formatDateInTz } from '@/lib/utils/dateDisplay';
import { diasEntreDias, sumarDiasAlDia } from '@/lib/services/fiscalCalendar';
import {AlertTriangle, CheckCircle, Clock} from 'lucide-react';
import { Button } from '@/components/ui/button';
import Link from 'next/link';
import { CardListSkeleton } from '@/components/common/PageSkeletons';

// Tipo para los datos que vienen de Supabase
interface FacturaData {
  id: string;
  number: string;
  issue_date: string;
  due_date: string;
  total: number;
  balance: number;
  payment_terms: number;
  customers: {
    full_name: string;
  } | null;
}

// Tipo para facturas próximas a vencer
interface FacturaVencimiento {
  id: string;
  number: string;
  customer_name: string;
  issue_date: string;
  due_date: string;
  total: number;
  balance: number;
  payment_terms: number;
  dias_restantes: number;
}

export function FacturasProximasVencer({ diasLimite = 15 }) {
  // `invoice_sales.due_date` es **timestamptz**. Comparar la columna contra un
  // `'YYYY-MM-DD'` la lee como medianoche UTC: en Bogota, las 19:00 del dia
  // anterior, y la lista se come las facturas que vencen hoy por la mañana.
  const { timezone } = useFormatDate();
  const { isLoading: tzLoading } = useOrgTimezone();
  const [facturas, setFacturas] = useState<FacturaVencimiento[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const obtenerFacturasProximasVencer = async () => {
      setIsLoading(true);
      setError(null);
      
      try {
        const organizationId = getOrganizationId();
        const hoy = todayInTz(timezone);
        const fechaLimite = sumarDiasAlDia(hoy, diasLimite);
        const { start, end } = getDateRange(hoy, fechaLimite, timezone);
        
        // Consulta a Supabase para facturas próximas a vencer
        // Especificamos explícitamente el tipo de consulta
        const { data, error } = await supabase
          .from('invoice_sales')
          .select(`
            id,
            number,
            issue_date,
            due_date,
            total,
            balance,
            payment_terms,
            customers:customer_id (full_name)
          `)
          .eq('organization_id', organizationId)
          .eq('status', 'issued') // Solo facturas emitidas, no pagadas o en borrador
          .gt('balance', 0) // Con saldo pendiente
          .gte('due_date', start) // No vencidas aún
          .lte('due_date', end) // Dentro del límite de días
          .order('due_date', { ascending: true });
          
        if (error) {
          throw new Error(`Error al consultar facturas: ${error.message}`);
        }
        
        if (data) {
          // Procesar los datos para incluir días restantes
          const facturasConDiasRestantes = data.map((factura: any) => {
            // Dias restantes contados en DIAS CALENDARIO de la organizacion:
            // `due_date` es un instante y «hoy» es el dia de alli.
            const diaVencimiento = toPlainDate(new Date(factura.due_date), timezone);
            
            // TypeScript no maneja bien la estructura anidada de Supabase
            // así que usamos una verificación segura
            let customerName = 'Cliente sin nombre';
            if (factura.customers && typeof factura.customers === 'object') {
              customerName = factura.customers.full_name || 'Cliente sin nombre';
            }
            
            return {
              id: factura.id,
              number: factura.number,
              issue_date: factura.issue_date,
              due_date: factura.due_date,
              total: factura.total,
              balance: factura.balance,
              payment_terms: factura.payment_terms,
              customer_name: customerName,
              dias_restantes: diasEntreDias(hoy, diaVencimiento)
            };
          });
          
          // Asegurar que el tipo es correcto
          setFacturas(facturasConDiasRestantes as FacturaVencimiento[]);
          // Ya asignamos las facturas arriba
        }
      } catch (err) {
        console.error('Error al cargar facturas próximas a vencer:', err);
        setError(err instanceof Error ? err.message : 'Error desconocido');
      } finally {
        setIsLoading(false);
      }
    };
    
    // Espera a que se conozca la zona: con el fallback se consultaria el rango
    // de Bogota para todas las organizaciones.
    if (!tzLoading) obtenerFacturasProximasVencer();
  }, [diasLimite, timezone, tzLoading]);
  
  // Función para obtener color según días restantes (dark mode compatible)
  const obtenerColorPorDias = (dias: number): string => {
    if (dias <= 3) return 'bg-red-100 text-red-800 border-red-300 dark:bg-red-900/20 dark:text-red-400 dark:border-red-800';
    if (dias <= 7) return 'bg-amber-100 text-amber-800 border-amber-300 dark:bg-amber-900/20 dark:text-amber-400 dark:border-amber-800';
    return 'bg-blue-100 text-blue-800 border-blue-300 dark:bg-blue-900/20 dark:text-blue-400 dark:border-blue-800';
  };
  
  // Función para obtener ícono según días restantes
  const obtenerIconoPorDias = (dias: number) => {
    if (dias <= 3) return <AlertTriangle className="h-3 w-3 sm:h-4 sm:w-4 mr-1 flex-shrink-0" />;
    if (dias <= 7) return <Clock className="h-3 w-3 sm:h-4 sm:w-4 mr-1 flex-shrink-0" />;
    return <CheckCircle className="h-3 w-3 sm:h-4 sm:w-4 mr-1 flex-shrink-0" />;
  };

  return (
    <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 shadow-sm">
      <CardHeader className="pb-3 px-4 sm:px-6">
        <div className="flex flex-col sm:flex-row sm:justify-between sm:items-start gap-2">
          <div className="flex-1">
            <CardTitle className="text-lg sm:text-xl text-gray-900 dark:text-gray-100">
              Facturas Próximas a Vencer
            </CardTitle>
            <CardDescription className="text-sm text-gray-600 dark:text-gray-400 mt-1">
              Facturas que vencerán en los próximos {diasLimite} días
            </CardDescription>
          </div>
          {facturas.length > 0 && (
            <Badge variant="secondary" className="bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-gray-100 self-start sm:self-auto">
              {facturas.length} factura{facturas.length !== 1 ? 's' : ''}
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent className="px-4 sm:px-6">
        {isLoading ? (
          <CardListSkeleton cards={3} columns="1" />
        ) : error ? (
          <div className="bg-red-50 dark:bg-red-900/20 p-4 rounded-lg text-red-800 dark:text-red-400 text-sm border border-red-200 dark:border-red-800">
            {error}
          </div>
        ) : facturas.length === 0 ? (
          <div className="text-center py-8 text-gray-500 dark:text-gray-400">
            <Clock className="h-12 w-12 mx-auto mb-3 opacity-50" />
            <p className="text-sm">No hay facturas próximas a vencer en los siguientes {diasLimite} días.</p>
          </div>
        ) : (
          <div className="max-h-[500px] overflow-y-auto pr-1">
            <div className="space-y-3">
              {facturas.map((factura) => (
                <div 
                  key={factura.id} 
                  className="
                    p-3 sm:p-4 
                    border border-gray-200 dark:border-gray-700
                    rounded-lg 
                    flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3
                    hover:bg-gray-50 dark:hover:bg-gray-700/50
                    transition-colors
                    bg-white dark:bg-gray-800/50
                  "
                >
                  {/* Información de la factura */}
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold text-sm sm:text-base text-gray-900 dark:text-gray-100 break-words whitespace-normal min-w-0">
                      {factura.number}
                    </div>
                    <div className="text-xs sm:text-sm text-gray-600 dark:text-gray-400 break-words whitespace-normal min-w-0 mt-0.5">
                      {factura.customer_name}
                    </div>
                    <div className="text-xs sm:text-sm text-gray-500 dark:text-gray-500 mt-1">
                      Vence: {formatDateInTz(factura.due_date, timezone, { day: 'numeric', month: 'short', year: 'numeric' })}
                    </div>
                  </div>
                  
                  {/* Monto y acciones */}
                  <div className="flex flex-row sm:flex-col items-center sm:items-end justify-between sm:justify-start gap-2 sm:space-y-2">
                    <div className="text-sm sm:text-base font-semibold text-gray-900 dark:text-gray-100">
                      {new Intl.NumberFormat('es-CO', { 
                        style: 'currency', 
                        currency: 'COP',
                        minimumFractionDigits: 0,
                        maximumFractionDigits: 0
                      }).format(factura.balance)}
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge 
                        variant="outline" 
                        className={`flex items-center text-xs whitespace-nowrap ${obtenerColorPorDias(factura.dias_restantes)}`}
                      >
                        {obtenerIconoPorDias(factura.dias_restantes)}
                        {factura.dias_restantes === 0 
                          ? 'Vence hoy' 
                          : `${factura.dias_restantes} día${factura.dias_restantes !== 1 ? 's' : ''}`}
                      </Badge>
                      <Link 
                        href={`/app/finanzas/facturas-venta/${factura.id}`} 
                        passHref
                      >
                        <Button 
                          variant="ghost" 
                          size="sm" 
                          className="text-xs h-7 px-2 hover:bg-blue-50 dark:hover:bg-blue-900/20 text-blue-600 dark:text-blue-400"
                        >
                          Ver
                        </Button>
                      </Link>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
