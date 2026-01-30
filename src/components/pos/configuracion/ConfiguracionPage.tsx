'use client';

import React, { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/components/ui/use-toast';
import {
  Settings,
  CreditCard,
  FileText,
  Percent,
  Hash,
  RefreshCw,
  ArrowLeft,
  ChevronRight,
  Loader2,
  DollarSign,
  Receipt,
  Calculator,
} from 'lucide-react';
import { formatCurrency, formatPercent } from '@/utils/Utils';
import { 
  ConfiguracionService, 
  OrganizationPaymentMethod, 
  OrganizationTax, 
  ServiceCharge,
  ConfigStats 
} from './configuracionService';

export function ConfiguracionPage() {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Datos
  const [stats, setStats] = useState<ConfigStats | null>(null);
  const [paymentMethods, setPaymentMethods] = useState<OrganizationPaymentMethod[]>([]);
  const [taxes, setTaxes] = useState<OrganizationTax[]>([]);
  const [serviceCharges, setServiceCharges] = useState<ServiceCharge[]>([]);

  const loadData = useCallback(async (showRefresh = false) => {
    if (showRefresh) {
      setIsRefreshing(true);
    } else {
      setLoading(true);
    }

    try {
      const [statsData, paymentsData, taxesData, chargesData] = await Promise.all([
        ConfiguracionService.getConfigStats(),
        ConfiguracionService.getPaymentMethods(),
        ConfiguracionService.getTaxes(),
        ConfiguracionService.getServiceCharges(),
      ]);

      setStats(statsData);
      setPaymentMethods(paymentsData);
      setTaxes(taxesData);
      setServiceCharges(chargesData);
    } catch (error) {
      console.error('Error cargando configuración:', error);
      toast({
        title: 'Error',
        description: 'No se pudo cargar la configuración',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
      setIsRefreshing(false);
    }
  }, [toast]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleTogglePaymentMethod = async (id: number, currentState: boolean) => {
    try {
      await ConfiguracionService.togglePaymentMethod(id, !currentState);
      toast({ title: 'Actualizado', description: 'Método de pago actualizado' });
      loadData(true);
    } catch (error) {
      toast({
        title: 'Error',
        description: 'No se pudo actualizar el método de pago',
        variant: 'destructive',
      });
    }
  };

  const handleToggleServiceCharge = async (id: number, currentState: boolean) => {
    try {
      await ConfiguracionService.toggleServiceCharge(id, !currentState);
      toast({ title: 'Actualizado', description: 'Cargo de servicio actualizado' });
      loadData(true);
    } catch (error) {
      toast({
        title: 'Error',
        description: 'No se pudo actualizar el cargo de servicio',
        variant: 'destructive',
      });
    }
  };

  const getPaymentMethodName = (code: string): string => {
    const names: Record<string, string> = {
      cash: 'Efectivo',
      card: 'Tarjeta',
      credit_card: 'Tarjeta Crédito',
      debit_card: 'Tarjeta Débito',
      transfer: 'Transferencia',
      nequi: 'Nequi',
      daviplata: 'Daviplata',
      pse: 'PSE',
      credit: 'Crédito',
    };
    return names[code] || code;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Link href="/app/pos">
            <Button variant="ghost" size="icon">
              <ArrowLeft className="h-5 w-5" />
            </Button>
          </Link>
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-3">
              <div className="p-2 bg-blue-100 dark:bg-blue-900/30 rounded-xl">
                <Settings className="h-6 w-6 text-blue-600" />
              </div>
              Configuración POS
            </h1>
            <p className="text-gray-500 dark:text-gray-400">
              POS / Configuración
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" onClick={() => loadData(true)} disabled={isRefreshing}>
            <RefreshCw className={`h-4 w-4 ${isRefreshing ? 'animate-spin' : ''}`} />
          </Button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
          <CardContent className="pt-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-blue-100 dark:bg-blue-900/30 rounded-lg">
                <CreditCard className="h-5 w-5 text-blue-600" />
              </div>
              <div>
                <p className="text-2xl font-bold text-gray-900 dark:text-white">{stats?.paymentMethods || 0}</p>
                <p className="text-sm text-gray-500 dark:text-gray-400">Métodos de Pago</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
          <CardContent className="pt-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-green-100 dark:bg-green-900/30 rounded-lg">
                <Percent className="h-5 w-5 text-green-600" />
              </div>
              <div>
                <p className="text-2xl font-bold text-gray-900 dark:text-white">{stats?.taxes || 0}</p>
                <p className="text-sm text-gray-500 dark:text-gray-400">Impuestos</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
          <CardContent className="pt-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-purple-100 dark:bg-purple-900/30 rounded-lg">
                <DollarSign className="h-5 w-5 text-purple-600" />
              </div>
              <div>
                <p className="text-2xl font-bold text-gray-900 dark:text-white">{stats?.serviceCharges || 0}</p>
                <p className="text-sm text-gray-500 dark:text-gray-400">Cargos Servicio</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
          <CardContent className="pt-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-orange-100 dark:bg-orange-900/30 rounded-lg">
                <Receipt className="h-5 w-5 text-orange-600" />
              </div>
              <div>
                <p className="text-2xl font-bold text-gray-900 dark:text-white">{stats?.invoiceSequences || 0}</p>
                <p className="text-sm text-gray-500 dark:text-gray-400">Sec. Facturación</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
          <CardContent className="pt-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-cyan-100 dark:bg-cyan-900/30 rounded-lg">
                <Hash className="h-5 w-5 text-cyan-600" />
              </div>
              <div>
                <p className="text-2xl font-bold text-gray-900 dark:text-white">{stats?.saleSequences || 0}</p>
                <p className="text-sm text-gray-500 dark:text-gray-400">Sec. Ventas</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Enlaces Rápidos */}
      <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
        <CardHeader>
          <CardTitle className="text-lg font-semibold text-gray-900 dark:text-white">
            Configuración Avanzada
          </CardTitle>
          <CardDescription className="text-gray-500 dark:text-gray-400">
            Accede a configuraciones específicas del sistema
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <Link href="/app/pos/configuracion/consecutivos-ventas">
              <div className="p-4 border border-gray-200 dark:border-gray-700 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors cursor-pointer group">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-blue-100 dark:bg-blue-900/30 rounded-lg">
                      <Hash className="h-5 w-5 text-blue-600" />
                    </div>
                    <div>
                      <p className="font-medium text-gray-900 dark:text-white">Consecutivos de Ventas</p>
                      <p className="text-sm text-gray-500 dark:text-gray-400">Prefijos, padding, reset</p>
                    </div>
                  </div>
                  <ChevronRight className="h-5 w-5 text-gray-400 group-hover:text-blue-600 transition-colors" />
                </div>
              </div>
            </Link>

            <Link href="/app/pos/propinas">
              <div className="p-4 border border-gray-200 dark:border-gray-700 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors cursor-pointer group">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-green-100 dark:bg-green-900/30 rounded-lg">
                      <DollarSign className="h-5 w-5 text-green-600" />
                    </div>
                    <div>
                      <p className="font-medium text-gray-900 dark:text-white">Propinas</p>
                      <p className="text-sm text-gray-500 dark:text-gray-400">Configurar propinas</p>
                    </div>
                  </div>
                  <ChevronRight className="h-5 w-5 text-gray-400 group-hover:text-green-600 transition-colors" />
                </div>
              </div>
            </Link>

            <Link href="/app/pos/cargos-servicio">
              <div className="p-4 border border-gray-200 dark:border-gray-700 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors cursor-pointer group">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-purple-100 dark:bg-purple-900/30 rounded-lg">
                      <Calculator className="h-5 w-5 text-purple-600" />
                    </div>
                    <div>
                      <p className="font-medium text-gray-900 dark:text-white">Cargos de Servicio</p>
                      <p className="text-sm text-gray-500 dark:text-gray-400">Configurar cargos</p>
                    </div>
                  </div>
                  <ChevronRight className="h-5 w-5 text-gray-400 group-hover:text-purple-600 transition-colors" />
                </div>
              </div>
            </Link>
          </div>
        </CardContent>
      </Card>

      {/* Métodos de Pago */}
      <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
        <CardHeader>
          <CardTitle className="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2">
            <CreditCard className="h-5 w-5 text-blue-600" />
            Métodos de Pago
          </CardTitle>
          <CardDescription className="text-gray-500 dark:text-gray-400">
            Métodos de pago habilitados para la organización
          </CardDescription>
        </CardHeader>
        <CardContent>
          {paymentMethods.length === 0 ? (
            <p className="text-gray-500 dark:text-gray-400 text-center py-4">
              No hay métodos de pago configurados
            </p>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {paymentMethods.map((pm) => (
                <div 
                  key={pm.id} 
                  className="flex items-center justify-between p-4 border border-gray-200 dark:border-gray-700 rounded-lg"
                >
                  <div>
                    <p className="font-medium text-gray-900 dark:text-white">
                      {getPaymentMethodName(pm.payment_method_code)}
                    </p>
                    <p className="text-sm text-gray-500 dark:text-gray-400">
                      {pm.payment_methods?.requires_reference ? 'Requiere referencia' : 'Sin referencia'}
                    </p>
                  </div>
                  <Switch
                    checked={pm.is_active}
                    onCheckedChange={() => handleTogglePaymentMethod(pm.id, pm.is_active)}
                  />
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Impuestos */}
      <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
        <CardHeader>
          <CardTitle className="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2">
            <Percent className="h-5 w-5 text-green-600" />
            Impuestos
          </CardTitle>
          <CardDescription className="text-gray-500 dark:text-gray-400">
            Impuestos configurados para la organización
          </CardDescription>
        </CardHeader>
        <CardContent>
          {taxes.length === 0 ? (
            <p className="text-gray-500 dark:text-gray-400 text-center py-4">
              No hay impuestos configurados
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200 dark:border-gray-700">
                    <th className="text-left py-2 px-3 text-gray-600 dark:text-gray-400">Nombre</th>
                    <th className="text-right py-2 px-3 text-gray-600 dark:text-gray-400">Tasa</th>
                    <th className="text-left py-2 px-3 text-gray-600 dark:text-gray-400">Descripción</th>
                    <th className="text-center py-2 px-3 text-gray-600 dark:text-gray-400">Por Defecto</th>
                    <th className="text-center py-2 px-3 text-gray-600 dark:text-gray-400">Estado</th>
                  </tr>
                </thead>
                <tbody>
                  {taxes.map((tax) => (
                    <tr key={tax.id} className="border-b border-gray-100 dark:border-gray-800">
                      <td className="py-2 px-3 text-gray-900 dark:text-white font-medium">{tax.name}</td>
                      <td className="py-2 px-3 text-right text-gray-900 dark:text-white">
                        {formatPercent(Number(tax.rate))}
                      </td>
                      <td className="py-2 px-3 text-gray-600 dark:text-gray-400">
                        {tax.description || '-'}
                      </td>
                      <td className="py-2 px-3 text-center">
                        {tax.is_default && (
                          <Badge className="bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400">
                            Defecto
                          </Badge>
                        )}
                      </td>
                      <td className="py-2 px-3 text-center">
                        <Badge className={tax.is_active 
                          ? 'bg-green-100 text-green-600 dark:bg-green-900/30 dark:text-green-400'
                          : 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400'
                        }>
                          {tax.is_active ? 'Activo' : 'Inactivo'}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Cargos de Servicio */}
      <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
        <CardHeader>
          <CardTitle className="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2">
            <DollarSign className="h-5 w-5 text-purple-600" />
            Cargos de Servicio
          </CardTitle>
          <CardDescription className="text-gray-500 dark:text-gray-400">
            Cargos adicionales aplicados a las ventas
          </CardDescription>
        </CardHeader>
        <CardContent>
          {serviceCharges.length === 0 ? (
            <p className="text-gray-500 dark:text-gray-400 text-center py-4">
              No hay cargos de servicio configurados
            </p>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {serviceCharges.map((charge) => (
                <div 
                  key={charge.id} 
                  className="flex items-center justify-between p-4 border border-gray-200 dark:border-gray-700 rounded-lg"
                >
                  <div>
                    <p className="font-medium text-gray-900 dark:text-white">{charge.name}</p>
                    <p className="text-sm text-gray-500 dark:text-gray-400">
                      {charge.charge_type === 'percentage' 
                        ? formatPercent(Number(charge.charge_value))
                        : formatCurrency(Number(charge.charge_value))
                      }
                      {charge.is_optional && ' • Opcional'}
                      {charge.is_taxable && ' • Gravable'}
                    </p>
                  </div>
                  <Switch
                    checked={charge.is_active}
                    onCheckedChange={() => handleToggleServiceCharge(charge.id, charge.is_active)}
                  />
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
