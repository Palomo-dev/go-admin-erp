'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { 
  Calendar,
  Download,
  RefreshCw,
  BarChart3,
  TrendingUp,
  FileText,
  Wallet,
  Building2,
  Users,
  Truck
} from 'lucide-react';
import { format, subMonths, startOfMonth, endOfMonth } from 'date-fns';
import { es } from 'date-fns/locale';
import { useToast } from '@/components/ui/use-toast';
import { cn } from '@/utils/Utils';
import { getOrganizationId } from '@/lib/hooks/useOrganization';

import {
  KPICards,
  VentasComprasChart,
  AgingChart,
  FlujoProyectadoChart,
  AlertasCard,
  TopClientesProveedores,
  finanzasDashboardService,
  type KPIData,
  type TopClienteProveedor,
  type VentasComprasData,
  type AgingData,
  type FlujoProyectado,
  type Alerta,
  type DashboardFilters
} from '@/components/finanzas/dashboard';

type RangoFecha = '1m' | '3m' | '6m' | '12m' | 'custom';

const rangoOpciones = [
  { value: '1m', label: '1 Mes' },
  { value: '3m', label: '3 Meses' },
  { value: '6m', label: '6 Meses' },
  { value: '12m', label: '12 Meses' },
];

function calcularFechas(rango: RangoFecha): { inicio: string; fin: string } {
  const hoy = new Date();
  const fin = format(hoy, 'yyyy-MM-dd');
  
  let inicio: Date;
  switch (rango) {
    case '1m':
      inicio = subMonths(hoy, 1);
      break;
    case '3m':
      inicio = subMonths(hoy, 3);
      break;
    case '6m':
      inicio = subMonths(hoy, 6);
      break;
    case '12m':
      inicio = subMonths(hoy, 12);
      break;
    default:
      inicio = subMonths(hoy, 1);
  }
  
  return {
    inicio: format(startOfMonth(inicio), 'yyyy-MM-dd'),
    fin
  };
}

export default function FinanzasPage() {
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(true);
  const [rangoSeleccionado, setRangoSeleccionado] = useState<RangoFecha>('3m');
  
  // Estados de datos
  const [kpis, setKpis] = useState<KPIData>({
    ingresos: 0,
    egresos: 0,
    utilidadBruta: 0,
    carteraVencida: 0,
    caja: 0,
    bancos: 0,
    cuentasPorCobrar: 0,
    cuentasPorPagar: 0
  });
  const [topClientes, setTopClientes] = useState<TopClienteProveedor[]>([]);
  const [topProveedores, setTopProveedores] = useState<TopClienteProveedor[]>([]);
  const [ventasCompras, setVentasCompras] = useState<VentasComprasData[]>([]);
  const [aging, setAging] = useState<AgingData[]>([]);
  const [flujoProyectado, setFlujoProyectado] = useState<FlujoProyectado[]>([]);
  const [alertas, setAlertas] = useState<Alerta[]>([]);
  
  const cargarDatos = useCallback(async () => {
    setIsLoading(true);
    try {
      const organizationId = getOrganizationId();
      const { inicio, fin } = calcularFechas(rangoSeleccionado);
      
      const filters: DashboardFilters = {
        fechaInicio: inicio,
        fechaFin: fin
      };
      
      const resultado = await finanzasDashboardService.getResumenGeneral(organizationId, filters);
      
      setKpis(resultado.kpis);
      setTopClientes(resultado.topClientes);
      setTopProveedores(resultado.topProveedores);
      setVentasCompras(resultado.ventasCompras);
      setAging(resultado.aging);
      setFlujoProyectado(resultado.flujo);
      setAlertas(resultado.alertas);
      
    } catch (error) {
      console.error('Error cargando dashboard:', error);
      toast({
        title: 'Error',
        description: 'No se pudo cargar el dashboard financiero',
        variant: 'destructive'
      });
    } finally {
      setIsLoading(false);
    }
  }, [rangoSeleccionado, toast]);
  
  useEffect(() => {
    cargarDatos();
  }, [cargarDatos]);
  
  const exportarReporte = () => {
    const { inicio, fin } = calcularFechas(rangoSeleccionado);
    
    const contenido = `
REPORTE FINANCIERO EJECUTIVO
============================
Período: ${format(new Date(inicio), 'dd/MM/yyyy', { locale: es })} - ${format(new Date(fin), 'dd/MM/yyyy', { locale: es })}
Generado: ${format(new Date(), 'dd/MM/yyyy HH:mm', { locale: es })}

INDICADORES CLAVE (KPIs)
------------------------
Ingresos:           $${kpis.ingresos.toLocaleString('es-CO')}
Egresos:            $${kpis.egresos.toLocaleString('es-CO')}
Utilidad Bruta:     $${kpis.utilidadBruta.toLocaleString('es-CO')}
Cartera Vencida:    $${kpis.carteraVencida.toLocaleString('es-CO')}
Caja:               $${kpis.caja.toLocaleString('es-CO')}
Bancos:             $${kpis.bancos.toLocaleString('es-CO')}
Cuentas por Cobrar: $${kpis.cuentasPorCobrar.toLocaleString('es-CO')}
Cuentas por Pagar:  $${kpis.cuentasPorPagar.toLocaleString('es-CO')}

TOP 5 CLIENTES
--------------
${topClientes.map((c, i) => `${i + 1}. ${c.nombre}: $${c.monto.toLocaleString('es-CO')}`).join('\n')}

TOP 5 PROVEEDORES
-----------------
${topProveedores.map((p, i) => `${i + 1}. ${p.nombre}: $${p.monto.toLocaleString('es-CO')}`).join('\n')}

ALERTAS ACTIVAS (${alertas.length})
-----------------------------------
${alertas.map(a => `[${a.prioridad.toUpperCase()}] ${a.titulo}: ${a.descripcion}`).join('\n')}
    `.trim();
    
    const blob = new Blob([contenido], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `reporte-financiero-${format(new Date(), 'yyyy-MM-dd')}.txt`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    
    toast({
      title: 'Reporte exportado',
      description: 'El reporte se ha descargado correctamente'
    });
  };

  return (
    <div className="p-6 space-y-6 bg-gray-50 dark:bg-gray-900 min-h-screen">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
            <BarChart3 className="h-7 w-7 text-blue-600 dark:text-blue-400" />
            Panel Financiero
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            Resumen ejecutivo de la situación financiera
          </p>
        </div>
        
        <div className="flex items-center gap-2 flex-wrap">
          {/* Selector de rango de fechas */}
          <div className="flex items-center gap-1 bg-white dark:bg-gray-800 rounded-lg p-1 border border-gray-200 dark:border-gray-700">
            {rangoOpciones.map((opcion) => (
              <Button
                key={opcion.value}
                variant={rangoSeleccionado === opcion.value ? 'default' : 'ghost'}
                size="sm"
                onClick={() => setRangoSeleccionado(opcion.value as RangoFecha)}
                className={cn(
                  'h-8',
                  rangoSeleccionado === opcion.value 
                    ? 'bg-blue-600 hover:bg-blue-700 text-white' 
                    : 'text-gray-600 dark:text-gray-400'
                )}
              >
                {opcion.label}
              </Button>
            ))}
          </div>
          
          {/* Botones de acción */}
          <Button
            variant="outline"
            size="sm"
            onClick={cargarDatos}
            disabled={isLoading}
            className="h-8"
          >
            <RefreshCw className={cn('h-4 w-4 mr-1', isLoading && 'animate-spin')} />
            Actualizar
          </Button>
          
          <Button
            variant="outline"
            size="sm"
            onClick={exportarReporte}
            disabled={isLoading}
            className="h-8"
          >
            <Download className="h-4 w-4 mr-1" />
            Exportar
          </Button>
        </div>
      </div>

      {/* KPIs */}
      <KPICards data={kpis} isLoading={isLoading} currencyCode="COP" />

      {/* Gráficas principales */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <VentasComprasChart 
          data={ventasCompras} 
          isLoading={isLoading} 
          currencyCode="COP" 
        />
        <AgingChart 
          data={aging} 
          isLoading={isLoading} 
          currencyCode="COP" 
        />
      </div>

      {/* Flujo proyectado y Alertas */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <FlujoProyectadoChart 
            data={flujoProyectado} 
            isLoading={isLoading} 
            currencyCode="COP" 
          />
        </div>
        <div>
          <AlertasCard 
            alertas={alertas} 
            isLoading={isLoading} 
            maxItems={5} 
          />
        </div>
      </div>

      {/* Top Clientes y Proveedores */}
      <TopClientesProveedores
        clientes={topClientes}
        proveedores={topProveedores}
        isLoading={isLoading}
        currencyCode="COP"
      />

      {/* Enlaces rápidos */}
      <Card className="dark:bg-gray-800/50">
        <CardHeader className="pb-2">
          <CardTitle className="text-lg font-semibold text-gray-900 dark:text-white">
            Accesos Rápidos
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-3">
            {[
              { icon: FileText, label: 'Facturas Venta', href: '/app/finanzas/facturas-venta', color: 'blue' },
              { icon: FileText, label: 'Facturas Compra', href: '/app/finanzas/facturas-compra', color: 'orange' },
              { icon: Users, label: 'Cuentas x Cobrar', href: '/app/finanzas/cuentas-por-cobrar', color: 'green' },
              { icon: Truck, label: 'Cuentas x Pagar', href: '/app/finanzas/cuentas-por-pagar', color: 'red' },
              { icon: Wallet, label: 'Caja', href: '/app/finanzas/caja', color: 'purple' },
              { icon: Building2, label: 'Bancos', href: '/app/finanzas/bancos', color: 'cyan' },
              { icon: FileText, label: 'Facturación Electrónica', href: '/app/finanzas/facturacion-electronica', color: 'blue' },
            ].map((item, index) => (
              <a
                key={index}
                href={item.href}
                className={cn(
                  'flex flex-col items-center gap-2 p-4 rounded-lg border transition-all',
                  'hover:shadow-md hover:scale-105',
                  'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700'
                )}
              >
                <item.icon className={cn(
                  'h-6 w-6',
                  item.color === 'blue' && 'text-blue-600 dark:text-blue-400',
                  item.color === 'orange' && 'text-orange-600 dark:text-orange-400',
                  item.color === 'green' && 'text-green-600 dark:text-green-400',
                  item.color === 'red' && 'text-red-600 dark:text-red-400',
                  item.color === 'purple' && 'text-purple-600 dark:text-purple-400',
                  item.color === 'cyan' && 'text-cyan-600 dark:text-cyan-400'
                )} />
                <span className="text-xs font-medium text-gray-700 dark:text-gray-300 text-center">
                  {item.label}
                </span>
              </a>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
