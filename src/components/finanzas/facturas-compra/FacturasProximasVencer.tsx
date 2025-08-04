'use client';

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { 
  AlertTriangle, 
  Clock, 
  CreditCard, 
  Eye,
  TrendingUp
} from 'lucide-react';
import { FacturasCompraService } from './FacturasCompraService';
import { InvoicePurchase } from './types';
import { formatCurrency, formatDate, cn } from '@/utils/Utils';
import { useRouter } from 'next/navigation';

interface FacturasProximasVencerProps {
  diasLimite?: number;
}

export function FacturasProximasVencer({ diasLimite = 15 }: FacturasProximasVencerProps) {
  const router = useRouter();
  const [facturas, setFacturas] = useState<InvoicePurchase[]>([]);
  const [loading, setLoading] = useState(true);
  const [mostrarTodas, setMostrarTodas] = useState(false);

  useEffect(() => {
    cargarFacturasProximasVencer();
  }, [diasLimite]);

  const cargarFacturasProximasVencer = async () => {
    try {
      setLoading(true);
      const data = await FacturasCompraService.obtenerFacturasProximasVencer(diasLimite);
      setFacturas(data);
    } catch (error) {
      console.error('Error cargando facturas próximas a vencer:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleVerFactura = (id: string) => {
    router.push(`/app/finanzas/facturas-compra/${id}`);
  };

  const handleRegistrarPago = (id: string) => {
    // TODO: Implementar modal de registro de pago
    console.log('Registrar pago para factura:', id);
  };

  const calcularDiasVencimiento = (dueDate: string) => {
    const vencimiento = new Date(dueDate);
    const hoy = new Date();
    return Math.ceil((vencimiento.getTime() - hoy.getTime()) / (1000 * 60 * 60 * 24));
  };

  const getTipoVencimiento = (dias: number) => {
    if (dias < 0) return { tipo: 'vencida', color: 'red', icono: AlertTriangle };
    if (dias <= 3) return { tipo: 'critica', color: 'red', icono: AlertTriangle };
    if (dias <= 7) return { tipo: 'proxima', color: 'yellow', icono: Clock };
    return { tipo: 'normal', color: 'blue', icono: TrendingUp };
  };

  const agruparFacturas = () => {
    const vencidas = facturas.filter(f => f.due_date && calcularDiasVencimiento(f.due_date) < 0);
    const criticas = facturas.filter(f => {
      if (!f.due_date) return false;
      const dias = calcularDiasVencimiento(f.due_date);
      return dias >= 0 && dias <= 3;
    });
    const proximas = facturas.filter(f => {
      if (!f.due_date) return false;
      const dias = calcularDiasVencimiento(f.due_date);
      return dias > 3 && dias <= 7;
    });
    const normales = facturas.filter(f => f.due_date && calcularDiasVencimiento(f.due_date) > 7);

    return { vencidas, criticas, proximas, normales };
  };

  const calcularTotales = () => {
    const total = facturas.reduce((sum, f) => sum + f.balance, 0);
    const vencidas = facturas
      .filter(f => f.due_date && calcularDiasVencimiento(f.due_date) < 0)
      .reduce((sum, f) => sum + f.balance, 0);
    
    return { total, vencidas };
  };

  if (loading) {
    return (
      <Card className="dark:bg-gray-800/50 dark:border-gray-700">
        <CardHeader>
          <CardTitle className="text-lg font-semibold dark:text-white flex items-center">
            <Clock className="w-5 h-5 mr-2 text-yellow-500" />
            Facturas Próximas a Vencer
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex justify-center py-8">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
          </div>
        </CardContent>
      </Card>
    );
  }

  const facturasMostrar = mostrarTodas ? facturas : facturas.slice(0, 5);
  const { vencidas, criticas, proximas } = agruparFacturas();
  const { total, vencidas: montoVencidas } = calcularTotales();

  return (
    <Card className="dark:bg-gray-800/50 dark:border-gray-700">
      <CardHeader>
        <div className="flex justify-between items-center">
          <CardTitle className="text-lg font-semibold dark:text-white flex items-center">
            <Clock className="w-5 h-5 mr-2 text-yellow-500" />
            Facturas Próximas a Vencer
            {facturas.length > 0 && (
              <Badge variant="secondary" className="ml-2">
                {facturas.length}
              </Badge>
            )}
          </CardTitle>
          
          {facturas.length > 5 && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setMostrarTodas(!mostrarTodas)}
              className="dark:text-gray-300 dark:hover:bg-gray-700"
            >
              {mostrarTodas ? 'Ver menos' : `Ver todas (${facturas.length})`}
            </Button>
          )}
        </div>

        {/* Resumen de totales */}
        {facturas.length > 0 && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-4">
            <div className="bg-blue-50 dark:bg-blue-900/20 p-3 rounded-lg">
              <div className="text-sm text-blue-600 dark:text-blue-400">Total por pagar</div>
              <div className="text-lg font-semibold text-blue-800 dark:text-blue-300">
                {formatCurrency(total)}
              </div>
            </div>
            
            <div className="bg-red-50 dark:bg-red-900/20 p-3 rounded-lg">
              <div className="text-sm text-red-600 dark:text-red-400">Vencidas</div>
              <div className="text-lg font-semibold text-red-800 dark:text-red-300">
                {formatCurrency(montoVencidas)}
              </div>
              <div className="text-xs text-red-600 dark:text-red-400">
                {vencidas.length} facturas
              </div>
            </div>
            
            <div className="bg-yellow-50 dark:bg-yellow-900/20 p-3 rounded-lg">
              <div className="text-sm text-yellow-600 dark:text-yellow-400">Críticas (≤3 días)</div>
              <div className="text-lg font-semibold text-yellow-800 dark:text-yellow-300">
                {criticas.length}
              </div>
            </div>
            
            <div className="bg-orange-50 dark:bg-orange-900/20 p-3 rounded-lg">
              <div className="text-sm text-orange-600 dark:text-orange-400">Próximas (≤7 días)</div>
              <div className="text-lg font-semibold text-orange-800 dark:text-orange-300">
                {proximas.length}
              </div>
            </div>
          </div>
        )}
      </CardHeader>
      
      <CardContent>
        {facturas.length === 0 ? (
          <div className="text-center py-8 text-gray-500 dark:text-gray-400">
            <TrendingUp className="w-12 h-12 mx-auto mb-3 text-green-500" />
            <p className="text-lg font-medium">¡Excelente!</p>
            <p className="text-sm">No hay facturas próximas a vencer en los próximos {diasLimite} días</p>
          </div>
        ) : (
          <div className="space-y-3">
            {facturasMostrar.map((factura) => {
              const diasVencimiento = factura.due_date ? calcularDiasVencimiento(factura.due_date) : null;
              const { tipo, color, icono: Icono } = diasVencimiento !== null 
                ? getTipoVencimiento(diasVencimiento) 
                : { tipo: 'normal', color: 'gray', icono: Clock };

              return (
                <div
                  key={factura.id}
                  className={cn(
                    "flex items-center justify-between p-4 rounded-lg border transition-colors",
                    color === 'red' ? "bg-red-50 border-red-200 dark:bg-red-900/20 dark:border-red-800" :
                    color === 'yellow' ? "bg-yellow-50 border-yellow-200 dark:bg-yellow-900/20 dark:border-yellow-800" :
                    "bg-blue-50 border-blue-200 dark:bg-blue-900/20 dark:border-blue-800"
                  )}
                >
                  <div className="flex items-center space-x-4">
                    <div className={cn(
                      "w-10 h-10 rounded-full flex items-center justify-center",
                      color === 'red' ? "bg-red-100 dark:bg-red-800/30" :
                      color === 'yellow' ? "bg-yellow-100 dark:bg-yellow-800/30" :
                      "bg-blue-100 dark:bg-blue-800/30"
                    )}>
                      <Icono className={cn(
                        "w-5 h-5",
                        color === 'red' ? "text-red-600 dark:text-red-400" :
                        color === 'yellow' ? "text-yellow-600 dark:text-yellow-400" :
                        "text-blue-600 dark:text-blue-400"
                      )} />
                    </div>
                    
                    <div>
                      <div className="font-medium dark:text-white">
                        {factura.number_ext}
                      </div>
                      <div className="text-sm text-gray-600 dark:text-gray-400">
                        {factura.supplier?.name}
                      </div>
                      <div className="text-xs text-gray-500 dark:text-gray-500">
                        {factura.due_date && (
                          <>
                            Vence: {formatDate(new Date(factura.due_date))}
                            {diasVencimiento !== null && (
                              <span className={cn(
                                "ml-2 font-medium",
                                color === 'red' ? "text-red-600 dark:text-red-400" :
                                color === 'yellow' ? "text-yellow-600 dark:text-yellow-400" :
                                "text-blue-600 dark:text-blue-400"
                              )}>
                                ({diasVencimiento < 0 ? 
                                  `${Math.abs(diasVencimiento)} días vencida` : 
                                  `${diasVencimiento} días`
                                })
                              </span>
                            )}
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                  
                  <div className="flex items-center space-x-4">
                    <div className="text-right">
                      <div className="font-semibold dark:text-white">
                        {formatCurrency(factura.balance, factura.currency)}
                      </div>
                      <div className="text-xs text-gray-500 dark:text-gray-500">
                        de {formatCurrency(factura.total, factura.currency)}
                      </div>
                    </div>
                    
                    <div className="flex space-x-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleVerFactura(factura.id)}
                        className="h-8 w-8 p-0 dark:hover:bg-gray-700"
                      >
                        <Eye className="h-4 w-4" />
                      </Button>
                      
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleRegistrarPago(factura.id)}
                        className="h-8 w-8 p-0 dark:hover:bg-gray-700"
                        title="Registrar Pago"
                      >
                        <CreditCard className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
