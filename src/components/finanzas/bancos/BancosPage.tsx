'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { toast } from 'sonner';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { BancosPageHeader } from './BancosPageHeader';
import { BankAccountsGrid } from './BankAccountsGrid';
import { BankStatsCards } from './BankStatsCards';
import { BancosService, BankAccount, BankAccountStats } from './BancosService';
import { ArrowRightLeft, Landmark } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';

export function BancosPage() {
  const router = useRouter();
  const [accounts, setAccounts] = useState<BankAccount[]>([]);
  const [stats, setStats] = useState<BankAccountStats | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [activeTab, setActiveTab] = useState('cuentas');

  const loadData = useCallback(async () => {
    try {
      const [accountsData, statsData] = await Promise.all([
        BancosService.obtenerCuentasBancarias(),
        BancosService.obtenerEstadisticas()
      ]);
      setAccounts(accountsData);
      setStats(statsData);
    } catch (error) {
      console.error('Error cargando datos bancarios:', error);
      toast.error('Error al cargar los datos bancarios');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await loadData();
    setIsRefreshing(false);
    toast.success('Datos actualizados');
  };

  const handleToggleActive = async (accountId: number, isActive: boolean) => {
    try {
      await BancosService.toggleActivoCuenta(accountId, isActive);
      toast.success(isActive ? 'Cuenta activada' : 'Cuenta desactivada');
      await loadData();
    } catch (error) {
      console.error('Error cambiando estado:', error);
      toast.error('Error al cambiar el estado de la cuenta');
    }
  };

  return (
    <div className="p-6 space-y-6 bg-gray-50 dark:bg-gray-900 min-h-screen">
      <BancosPageHeader onRefresh={handleRefresh} isRefreshing={isRefreshing} />

      {/* Estadísticas */}
      <BankStatsCards stats={stats} isLoading={isLoading} />

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700">
          <TabsTrigger 
            value="cuentas"
            className="data-[state=active]:bg-blue-100 data-[state=active]:text-blue-700 dark:data-[state=active]:bg-blue-900/30 dark:data-[state=active]:text-blue-400"
          >
            <Landmark className="h-4 w-4 mr-2" />
            Cuentas Bancarias
          </TabsTrigger>
          <TabsTrigger 
            value="conciliacion"
            className="data-[state=active]:bg-blue-100 data-[state=active]:text-blue-700 dark:data-[state=active]:bg-blue-900/30 dark:data-[state=active]:text-blue-400"
          >
            <ArrowRightLeft className="h-4 w-4 mr-2" />
            Conciliación Bancaria
          </TabsTrigger>
        </TabsList>

        <TabsContent value="cuentas">
          <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
            <CardHeader>
              <CardTitle className="text-gray-900 dark:text-white">
                Cuentas Bancarias
              </CardTitle>
            </CardHeader>
            <CardContent>
              <BankAccountsGrid 
                accounts={accounts} 
                isLoading={isLoading}
                onToggleActive={handleToggleActive}
              />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="conciliacion">
          <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-gray-900 dark:text-white">
                Conciliación Bancaria
              </CardTitle>
              <Button 
                onClick={() => router.push('/app/finanzas/conciliacion-bancaria')}
                className="bg-blue-600 hover:bg-blue-700 text-white"
              >
                Ver Conciliaciones
              </Button>
            </CardHeader>
            <CardContent>
              <div className="text-center py-8">
                <ArrowRightLeft className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">
                  Gestión de Conciliaciones
                </h3>
                <p className="text-gray-500 dark:text-gray-400 mb-4">
                  Accede al módulo completo de conciliación bancaria para gestionar tus extractos y conciliar movimientos.
                </p>
                <Button 
                  variant="outline"
                  onClick={() => router.push('/app/finanzas/conciliacion-bancaria')}
                  className="dark:border-gray-600"
                >
                  Ir a Conciliación Bancaria
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
