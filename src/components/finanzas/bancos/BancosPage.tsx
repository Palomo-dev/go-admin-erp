'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { toast } from 'sonner';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useTranslations } from 'next-intl';
import { TabBar, idPanel, idPestana, useOpcionUrl } from '@/components/kit';
import { AlertasPanel } from './alertas/AlertasPanel';
import { useAlertasBancarias } from './alertas/useAlertasBancarias';
import { BancosPageHeader } from './BancosPageHeader';
import { BankAccountsGrid } from './BankAccountsGrid';
import { BankStatsCards } from './BankStatsCards';
import { BancosService, BankAccount, BankAccountStats } from './BancosService';
import { ArrowRightLeft, Landmark, ShieldAlert } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { useBranch } from '@/lib/context/BranchContext';
import { BranchBadge } from '@/components/inventario/BranchBadge';

/**
 * Finanzas, ronda 2 (A1, 2026-11-07): pestaña «Alertas» (antes la página
 * suelta /finanzas/bancos/anomalias, sin enlace desde aquí). La pestaña va en
 * la URL (`?tab=alertas`): la ruta vieja redirige a ella.
 */
const ID_PESTANAS = 'bancos-pestanas';
const PESTANAS = ['cuentas', 'conciliacion', 'alertas'] as const;
type Pestana = (typeof PESTANAS)[number];

export function BancosPage() {
  const router = useRouter();
  const t = useTranslations('finanzasBancosR2');
  const alertas = useAlertasBancarias();
  const { branchFilter } = useBranch();
  const [accounts, setAccounts] = useState<BankAccount[]>([]);
  const [stats, setStats] = useState<BankAccountStats | null>(null);
  const [cargandoCuentas, setCargandoCuentas] = useState(true);
  const [cargandoStats, setCargandoStats] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [activeTab, setActiveTab] = useOpcionUrl<Pestana>('tab', PESTANAS, 'cuentas');

  const loadData = useCallback(async () => {
    setCargandoCuentas(true);
    setCargandoStats(true);
    const cuentas = BancosService.obtenerCuentasBancarias(branchFilter)
      .then((accountsData) => setAccounts(accountsData))
      .catch((error) => {
        console.error('Error cargando cuentas bancarias:', error);
        toast.error('Error al cargar las cuentas bancarias');
      })
      .finally(() => setCargandoCuentas(false));
    const estadisticas = BancosService.obtenerEstadisticas(branchFilter)
      .then((statsData) => setStats(statsData))
      .catch((error) => {
        console.error('Error cargando estadísticas bancarias:', error);
      })
      .finally(() => setCargandoStats(false));
    await Promise.all([cuentas, estadisticas]);
  }, [branchFilter]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await Promise.all([loadData(), alertas.recargar()]);
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
    <div className="p-4 sm:p-6 lg:p-8 space-y-4 sm:space-y-6 bg-gray-50 dark:bg-gray-900 min-h-screen">
      <BancosPageHeader onRefresh={handleRefresh} isRefreshing={isRefreshing} />

      <BranchBadge className="mb-3" />

      {/* Estadísticas */}
      <BankStatsCards stats={stats} isLoading={cargandoStats} />

      {/* Pestañas (kit): Cuentas · Conciliación · Alertas */}
      <div className="space-y-4">
        <TabBar
          id={ID_PESTANAS}
          etiqueta={t('bancos.pestanas.etiqueta')}
          valor={activeTab}
          onValorChange={setActiveTab}
          pestanas={[
            { valor: 'cuentas', etiqueta: t('bancos.pestanas.cuentas'), icono: Landmark },
            { valor: 'conciliacion', etiqueta: t('bancos.pestanas.conciliacion'), icono: ArrowRightLeft },
            {
              valor: 'alertas',
              etiqueta: t('bancos.pestanas.alertas'),
              icono: ShieldAlert,
              contador: alertas.estado === 'listo' ? alertas.cifras.abiertas : undefined,
            },
          ]}
        />

        <div role="tabpanel" id={idPanel(ID_PESTANAS, 'cuentas')} aria-labelledby={idPestana(ID_PESTANAS, 'cuentas')} hidden={activeTab !== 'cuentas'}>
          <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
            <CardHeader>
              <CardTitle className="text-gray-900 dark:text-white">
                Cuentas Bancarias
              </CardTitle>
            </CardHeader>
            <CardContent>
              <BankAccountsGrid 
                accounts={accounts} 
                isLoading={cargandoCuentas}
                onToggleActive={handleToggleActive}
              />
            </CardContent>
          </Card>
        </div>

        <div role="tabpanel" id={idPanel(ID_PESTANAS, 'conciliacion')} aria-labelledby={idPestana(ID_PESTANAS, 'conciliacion')} hidden={activeTab !== 'conciliacion'}>
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
        </div>

        <div role="tabpanel" id={idPanel(ID_PESTANAS, 'alertas')} aria-labelledby={idPestana(ID_PESTANAS, 'alertas')} hidden={activeTab !== 'alertas'}>
          <AlertasPanel alertas={alertas} onMovimientoAnulado={() => void loadData()} />
        </div>
      </div>
    </div>
  );
}
