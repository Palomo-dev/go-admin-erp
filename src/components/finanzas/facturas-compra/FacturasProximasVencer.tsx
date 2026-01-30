'use client';

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { 
  DollarSign, 
  AlertTriangle, 
  Clock, 
  FileText,
  Eye,
  CreditCard,
  TrendingUp
} from 'lucide-react';
import { FacturasCompraService } from './FacturasCompraService';
import { InvoicePurchase } from './types';
import { formatCurrency, formatDate } from '@/utils/Utils';
import { useRouter, usePathname } from 'next/navigation';

interface FacturasProximasVencerProps {
  diasLimite?: number;
}

export function FacturasProximasVencer({ diasLimite = 15 }: FacturasProximasVencerProps) {
  const router = useRouter();
  const pathname = usePathname();
  const [facturas, setFacturas] = useState<InvoicePurchase[]>([]);
  const [loading, setLoading] = useState(true);
  const [mostrarTodas, setMostrarTodas] = useState(false);

  const basePath = pathname.includes('/inventario/') 
    ? '/app/inventario/facturas-compra' 
    : '/app/finanzas/facturas-compra';

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
    router.push(`${basePath}/${id}`);
  };

  const calcularDiasVencimiento = (dueDate: string) => {
    const vencimiento = new Date(dueDate);
    const hoy = new Date();
    return Math.ceil((vencimiento.getTime() - hoy.getTime()) / (1000 * 60 * 60 * 24));
  };

  const getTipoVencimiento = (dias: number) => {
    if (dias < 0) return { color: 'red', label: 'vencida' };
    if (dias <= 3) return { color: 'red', label: 'crítica' };
    if (dias <= 7) return { color: 'amber', label: 'próxima' };
    return { color: 'blue', label: 'normal' };
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

    return { vencidas, criticas, proximas };
  };

  const calcularTotales = () => {
    const total = facturas.reduce((sum, f) => sum + f.balance, 0);
    const vencidas = facturas
      .filter(f => f.due_date && calcularDiasVencimiento(f.due_date) < 0)
      .reduce((sum, f) => sum + f.balance, 0);
    
    return { total, vencidas };
  };

  const { vencidas, criticas, proximas } = agruparFacturas();
  const { total, vencidas: montoVencidas } = calcularTotales();
  const facturasMostrar = mostrarTodas ? facturas : facturas.slice(0, 5);

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <Card key={i} className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
              <CardContent className="pt-4">
                <div className="animate-pulse">
                  <div className="h-3 w-20 bg-gray-200 dark:bg-gray-700 rounded mb-2"></div>
                  <div className="h-6 w-24 bg-gray-200 dark:bg-gray-700 rounded"></div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
          <CardContent className="pt-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-blue-100 dark:bg-blue-900/30 rounded-lg">
                <DollarSign className="h-5 w-5 text-blue-600 dark:text-blue-400" />
              </div>
              <div>
                <p className="text-xs text-gray-500 dark:text-gray-400">Total por Pagar</p>
                <p className="text-lg font-bold text-gray-900 dark:text-white">
                  {formatCurrency(total)}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
          <CardContent className="pt-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-red-100 dark:bg-red-900/30 rounded-lg">
                <AlertTriangle className="h-5 w-5 text-red-600 dark:text-red-400" />
              </div>
              <div>
                <p className="text-xs text-gray-500 dark:text-gray-400">Vencidas</p>
                <p className="text-lg font-bold text-gray-900 dark:text-white">
                  {formatCurrency(montoVencidas)}
                </p>
                <p className="text-xs text-red-500">{vencidas.length} facturas</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
          <CardContent className="pt-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-amber-100 dark:bg-amber-900/30 rounded-lg">
                <Clock className="h-5 w-5 text-amber-600 dark:text-amber-400" />
              </div>
              <div>
                <p className="text-xs text-gray-500 dark:text-gray-400">Críticas ≤3d</p>
                <p className="text-lg font-bold text-gray-900 dark:text-white">
                  {criticas.length}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
          <CardContent className="pt-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-orange-100 dark:bg-orange-900/30 rounded-lg">
                <FileText className="h-5 w-5 text-orange-600 dark:text-orange-400" />
              </div>
              <div>
                <p className="text-xs text-gray-500 dark:text-gray-400">Próximas ≤7d</p>
                <p className="text-lg font-bold text-gray-900 dark:text-white">
                  {proximas.length}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Lista de Facturas */}
      <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-gray-900 dark:text-white flex items-center gap-2">
              <Clock className="h-5 w-5 text-amber-600" />
              Facturas Próximas a Vencer
              {facturas.length > 0 && (
                <span className="text-sm font-normal text-gray-500">({facturas.length})</span>
              )}
            </CardTitle>
            {facturas.length > 5 && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setMostrarTodas(!mostrarTodas)}
                className="text-blue-600 dark:text-blue-400"
              >
                {mostrarTodas ? 'Ver menos' : `Ver todas`}
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {facturas.length === 0 ? (
            <div className="text-center py-8 text-gray-500 dark:text-gray-400">
              <TrendingUp className="w-12 h-12 mx-auto mb-3 text-green-500" />
              <p className="text-lg font-medium text-gray-900 dark:text-white">¡Excelente!</p>
              <p className="text-sm">No hay facturas próximas a vencer en los próximos {diasLimite} días</p>
            </div>
          ) : (
            <div className="space-y-2">
              {facturasMostrar.map((factura) => {
                const diasVencimiento = factura.due_date ? calcularDiasVencimiento(factura.due_date) : null;
                const { color } = diasVencimiento !== null ? getTipoVencimiento(diasVencimiento) : { color: 'gray' };

                return (
                  <div
                    key={factura.id}
                    className="flex items-center justify-between p-3 rounded-lg border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors"
                  >
                    <div className="flex items-center gap-3 flex-1 min-w-0">
                      <div className={`p-2 rounded-full ${
                        color === 'red' ? 'bg-red-100 dark:bg-red-900/30' :
                        color === 'amber' ? 'bg-amber-100 dark:bg-amber-900/30' :
                        'bg-blue-100 dark:bg-blue-900/30'
                      }`}>
                        <AlertTriangle className={`h-4 w-4 ${
                          color === 'red' ? 'text-red-600 dark:text-red-400' :
                          color === 'amber' ? 'text-amber-600 dark:text-amber-400' :
                          'text-blue-600 dark:text-blue-400'
                        }`} />
                      </div>
                      
                      <div className="min-w-0 flex-1">
                        <p className="font-medium text-gray-900 dark:text-white truncate">
                          {factura.number_ext}
                        </p>
                        <p className="text-sm text-gray-500 dark:text-gray-400 truncate">
                          {factura.supplier?.name}
                        </p>
                        <p className="text-xs text-gray-400 dark:text-gray-500">
                          Vence: {factura.due_date && formatDate(new Date(factura.due_date))}
                          {diasVencimiento !== null && (
                            <span className={`ml-2 font-medium ${
                              color === 'red' ? 'text-red-600' :
                              color === 'amber' ? 'text-amber-600' :
                              'text-blue-600'
                            }`}>
                              ({diasVencimiento < 0 ? `${Math.abs(diasVencimiento)}d vencida` : `${diasVencimiento}d`})
                            </span>
                          )}
                        </p>
                      </div>
                    </div>
                    
                    <div className="flex items-center gap-3">
                      <div className="text-right">
                        <p className="font-semibold text-gray-900 dark:text-white">
                          {formatCurrency(factura.balance, factura.currency)}
                        </p>
                        <p className="text-xs text-gray-500">
                          de {formatCurrency(factura.total, factura.currency)}
                        </p>
                      </div>
                      
                      <div className="flex gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleVerFactura(factura.id)}
                          className="h-8 w-8 p-0"
                          title="Ver factura"
                        >
                          <Eye className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-8 w-8 p-0"
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
    </div>
  );
}
