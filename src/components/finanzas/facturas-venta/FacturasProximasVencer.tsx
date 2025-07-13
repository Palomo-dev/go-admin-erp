'use client';

import React, { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase/config';
import { getOrganizationId } from '@/lib/hooks/useOrganization';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { format, differenceInDays } from 'date-fns';
import { es } from 'date-fns/locale';
import { Loader2, AlertTriangle, CheckCircle, Clock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import Link from 'next/link';

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
  const [facturas, setFacturas] = useState<FacturaVencimiento[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const obtenerFacturasProximasVencer = async () => {
      setIsLoading(true);
      setError(null);
      
      try {
        const organizationId = getOrganizationId();
        const hoy = new Date().toISOString().split('T')[0];
        const limiteFuturo = new Date();
        limiteFuturo.setDate(limiteFuturo.getDate() + diasLimite);
        const fechaLimite = limiteFuturo.toISOString().split('T')[0];
        
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
          .gte('due_date', hoy) // No vencidas aún
          .lte('due_date', fechaLimite) // Dentro del límite de días
          .order('due_date', { ascending: true });
          
        if (error) {
          throw new Error(`Error al consultar facturas: ${error.message}`);
        }
        
        if (data) {
          // Procesar los datos para incluir días restantes
          const facturasConDiasRestantes = data.map((factura: any) => {
            const dueDate = new Date(factura.due_date);
            const today = new Date();
            today.setHours(0, 0, 0, 0); // Normalizar la hora actual
            
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
              dias_restantes: differenceInDays(dueDate, today)
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
    
    obtenerFacturasProximasVencer();
  }, [diasLimite]);
  
  // Función para obtener color según días restantes
  const obtenerColorPorDias = (dias: number): string => {
    if (dias <= 3) return 'bg-red-100 text-red-800 border-red-300';
    if (dias <= 7) return 'bg-amber-100 text-amber-800 border-amber-300';
    return 'bg-blue-100 text-blue-800 border-blue-300';
  };
  
  // Función para obtener ícono según días restantes
  const obtenerIconoPorDias = (dias: number) => {
    if (dias <= 3) return <AlertTriangle className="h-4 w-4 mr-1" />;
    if (dias <= 7) return <Clock className="h-4 w-4 mr-1" />;
    return <CheckCircle className="h-4 w-4 mr-1" />;
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-xl">Facturas Próximas a Vencer</CardTitle>
        <CardDescription>
          Facturas que vencerán en los próximos {diasLimite} días
        </CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex justify-center py-4">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : error ? (
          <div className="bg-red-50 p-4 rounded-md text-red-800 text-sm">
            {error}
          </div>
        ) : facturas.length === 0 ? (
          <div className="text-center py-6 text-muted-foreground">
            No hay facturas próximas a vencer en los siguientes {diasLimite} días.
          </div>
        ) : (
          <div className="space-y-3">
            {facturas.map((factura) => (
              <div 
                key={factura.id} 
                className="p-3 border rounded-md flex justify-between items-center hover:bg-muted/30 transition-colors"
              >
                <div>
                  <div className="font-medium">{factura.number}</div>
                  <div className="text-sm text-muted-foreground">{factura.customer_name}</div>
                  <div className="text-sm mt-1">
                    Vence: {format(new Date(factura.due_date), "d 'de' MMMM, yyyy", { locale: es })}
                  </div>
                </div>
                <div className="flex flex-col items-end space-y-2">
                  <div className="text-right font-medium">
                    {new Intl.NumberFormat('es-CO', { 
                      style: 'currency', 
                      currency: 'COP',
                      minimumFractionDigits: 0,
                      maximumFractionDigits: 0
                    }).format(factura.balance)}
                  </div>
                  <Badge 
                    variant="outline" 
                    className={`flex items-center ${obtenerColorPorDias(factura.dias_restantes)}`}
                  >
                    {obtenerIconoPorDias(factura.dias_restantes)}
                    {factura.dias_restantes === 0 
                      ? 'Vence hoy' 
                      : `${factura.dias_restantes} día${factura.dias_restantes !== 1 ? 's' : ''}`}
                  </Badge>
                  <Link 
                    href={`/org/finanzas/facturas-venta/${factura.id}`} 
                    passHref
                  >
                    <Button variant="ghost" size="sm" className="text-xs">
                      Ver factura
                    </Button>
                  </Link>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
