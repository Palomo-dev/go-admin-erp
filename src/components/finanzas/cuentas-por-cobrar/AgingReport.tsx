'use client';

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { TrendingDown, Download, RefreshCw, Phone, Mail } from 'lucide-react';
import { AgingBucket } from './types';
import { CuentasPorCobrarService } from './service';
import { formatCurrency } from '@/utils/Utils';
import { toast } from 'sonner';

interface AgingReportProps {
  className?: string;
}

export function AgingReport({ className }: AgingReportProps) {
  const [agingData, setAgingData] = useState<AgingBucket[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    loadAgingData();
  }, []);

  const loadAgingData = async () => {
    setIsLoading(true);
    try {
      const data = await CuentasPorCobrarService.obtenerReporteAging();
      setAgingData(data);
    } catch (error) {
      console.error('Error al cargar reporte de aging:', error);
      toast.error('Error al cargar el reporte de aging');
    } finally {
      setIsLoading(false);
    }
  };

  const exportarAging = async () => {
    try {
      const headers = [
        'Cliente',
        'Email',
        'Teléfono',
        '0-30 días',
        '31-60 días',
        '61-90 días',
        '+90 días',
        'Total'
      ];

      const csvContent = [
        headers.join(','),
        ...agingData.map(bucket => [
          `"${bucket.customer_name}"`,
          bucket.customer_email,
          bucket.customer_phone,
          bucket.current,
          bucket.days_31_60,
          bucket.days_61_90,
          bucket.days_90_plus,
          bucket.total
        ].join(','))
      ].join('\n');

      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const link = document.createElement('a');
      const url = URL.createObjectURL(blob);
      link.setAttribute('href', url);
      link.setAttribute('download', `aging_report_${new Date().toISOString().split('T')[0]}.csv`);
      link.style.visibility = 'hidden';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      toast.success('Reporte de aging exportado exitosamente');
    } catch (error) {
      console.error('Error al exportar aging:', error);
      toast.error('Error al exportar el reporte');
    }
  };

  // Calcular totales
  const totales = agingData.reduce(
    (acc, bucket) => ({
      current: acc.current + bucket.current,
      days_31_60: acc.days_31_60 + bucket.days_31_60,
      days_61_90: acc.days_61_90 + bucket.days_61_90,
      days_90_plus: acc.days_90_plus + bucket.days_90_plus,
      total: acc.total + bucket.total,
    }),
    { current: 0, days_31_60: 0, days_61_90: 0, days_90_plus: 0, total: 0 }
  );

  const getAgingColor = (amount: number, total: number) => {
    if (amount === 0) return 'text-gray-400 dark:text-gray-500';
    const percentage = (amount / total) * 100;
    if (percentage >= 50) return 'text-red-600 dark:text-red-400';
    if (percentage >= 25) return 'text-amber-600 dark:text-amber-400';
    return 'text-green-600 dark:text-green-400';
  };

  const getRiskBadge = (bucket: AgingBucket) => {
    const overdue = bucket.days_31_60 + bucket.days_61_90 + bucket.days_90_plus;
    const percentage = bucket.total > 0 ? (overdue / bucket.total) * 100 : 0;
    
    if (percentage >= 75) {
      return <Badge variant="destructive" className="text-xs">Alto Riesgo</Badge>;
    } else if (percentage >= 50) {
      return <Badge variant="secondary" className="text-xs bg-amber-100 text-amber-800 dark:bg-amber-900/20 dark:text-amber-400">Riesgo Medio</Badge>;
    } else if (percentage >= 25) {
      return <Badge variant="outline" className="text-xs">Riesgo Bajo</Badge>;
    }
    return <Badge variant="default" className="text-xs bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-400">Bajo Riesgo</Badge>;
  };

  if (isLoading) {
    return (
      <Card className={`dark:bg-gray-800/50 dark:border-gray-700 light:bg-white ${className}`}>
        <CardHeader>
          <CardTitle className="text-lg text-gray-900 dark:text-white">
            Cargando reporte de aging...
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="flex items-center space-x-4">
                <div className="h-4 bg-gray-300 dark:bg-gray-600 rounded w-1/5 animate-pulse" />
                <div className="h-4 bg-gray-300 dark:bg-gray-600 rounded w-1/5 animate-pulse" />
                <div className="h-4 bg-gray-300 dark:bg-gray-600 rounded w-1/5 animate-pulse" />
                <div className="h-4 bg-gray-300 dark:bg-gray-600 rounded w-1/5 animate-pulse" />
                <div className="h-4 bg-gray-300 dark:bg-gray-600 rounded w-1/5 animate-pulse" />
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className={`dark:bg-gray-800/50 dark:border-gray-700 light:bg-white ${className}`}>
      <CardHeader>
        <div className="flex justify-between items-center">
          <CardTitle className="text-lg text-gray-900 dark:text-white flex items-center gap-2">
            <TrendingDown className="h-5 w-5 text-blue-600 dark:text-blue-400" />
            Reporte de Aging (Antigüedad de Cartera)
          </CardTitle>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={loadAgingData}
              disabled={isLoading}
              className="dark:border-gray-600 dark:hover:bg-gray-700"
            >
              <RefreshCw className={`h-4 w-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
              Actualizar
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={exportarAging}
              className="dark:border-gray-600 dark:hover:bg-gray-700"
            >
              <Download className="h-4 w-4 mr-2" />
              Exportar
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {agingData.length === 0 ? (
          <div className="text-center py-8 text-gray-500 dark:text-gray-400">
            No hay datos de aging disponibles
          </div>
        ) : (
          <div className="space-y-4">
            {/* Resumen de totales */}
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4 p-4 bg-gray-50 dark:bg-gray-900/50 rounded-lg">
              <div className="text-center">
                <p className="text-sm text-gray-600 dark:text-gray-400">0-30 días</p>
                <p className="text-lg font-bold text-green-600 dark:text-green-400">
                  {formatCurrency(totales.current)}
                </p>
              </div>
              <div className="text-center">
                <p className="text-sm text-gray-600 dark:text-gray-400">31-60 días</p>
                <p className="text-lg font-bold text-amber-600 dark:text-amber-400">
                  {formatCurrency(totales.days_31_60)}
                </p>
              </div>
              <div className="text-center">
                <p className="text-sm text-gray-600 dark:text-gray-400">61-90 días</p>
                <p className="text-lg font-bold text-orange-600 dark:text-orange-400">
                  {formatCurrency(totales.days_61_90)}
                </p>
              </div>
              <div className="text-center">
                <p className="text-sm text-gray-600 dark:text-gray-400">+90 días</p>
                <p className="text-lg font-bold text-red-600 dark:text-red-400">
                  {formatCurrency(totales.days_90_plus)}
                </p>
              </div>
              <div className="text-center">
                <p className="text-sm text-gray-600 dark:text-gray-400">Total</p>
                <p className="text-lg font-bold text-gray-900 dark:text-white">
                  {formatCurrency(totales.total)}
                </p>
              </div>
            </div>

            {/* Tabla detallada */}
            <div className="rounded-md border dark:border-gray-700">
              <Table>
                <TableHeader>
                  <TableRow className="dark:border-gray-700">
                    <TableHead className="dark:text-gray-300">Cliente</TableHead>
                    <TableHead className="dark:text-gray-300">Contacto</TableHead>
                    <TableHead className="dark:text-gray-300 text-right">0-30 días</TableHead>
                    <TableHead className="dark:text-gray-300 text-right">31-60 días</TableHead>
                    <TableHead className="dark:text-gray-300 text-right">61-90 días</TableHead>
                    <TableHead className="dark:text-gray-300 text-right">+90 días</TableHead>
                    <TableHead className="dark:text-gray-300 text-right">Total</TableHead>
                    <TableHead className="dark:text-gray-300">Riesgo</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {agingData.map((bucket) => (
                    <TableRow key={bucket.customer_id} className="dark:border-gray-700">
                      <TableCell className="font-medium dark:text-white">
                        {bucket.customer_name}
                      </TableCell>
                      <TableCell className="dark:text-gray-300">
                        <div className="flex flex-col space-y-1">
                          {bucket.customer_email && (
                            <div className="flex items-center text-sm text-gray-600 dark:text-gray-400">
                              <Mail className="h-3 w-3 mr-1" />
                              {bucket.customer_email}
                            </div>
                          )}
                          {bucket.customer_phone && (
                            <div className="flex items-center text-sm text-gray-600 dark:text-gray-400">
                              <Phone className="h-3 w-3 mr-1" />
                              {bucket.customer_phone}
                            </div>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className={`text-right font-medium ${getAgingColor(bucket.current, bucket.total)}`}>
                        {formatCurrency(bucket.current)}
                      </TableCell>
                      <TableCell className={`text-right font-medium ${getAgingColor(bucket.days_31_60, bucket.total)}`}>
                        {formatCurrency(bucket.days_31_60)}
                      </TableCell>
                      <TableCell className={`text-right font-medium ${getAgingColor(bucket.days_61_90, bucket.total)}`}>
                        {formatCurrency(bucket.days_61_90)}
                      </TableCell>
                      <TableCell className={`text-right font-medium ${getAgingColor(bucket.days_90_plus, bucket.total)}`}>
                        {formatCurrency(bucket.days_90_plus)}
                      </TableCell>
                      <TableCell className="text-right font-bold dark:text-white">
                        {formatCurrency(bucket.total)}
                      </TableCell>
                      <TableCell>
                        {getRiskBadge(bucket)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
