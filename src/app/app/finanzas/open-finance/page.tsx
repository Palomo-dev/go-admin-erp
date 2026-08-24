'use client';

/**
 * Dashboard principal de Open Finance (Fase 9).
 * Muestra estado de salud, resumen de links/cuentas/transacciones,
 * acciones rapidas, navegacion a sub-paginas y estado de configuracion.
 */

import React, { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import {
  Activity,
  Link as LinkIcon,
  Building2,
  Shield,
  RefreshCw,
  AlertTriangle,
  ArrowRight,
  CheckCircle,
  XCircle,
  Wallet,
  Database,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Skeleton } from '@/components/ui/skeleton';
import { supabase } from '@/lib/supabase/config';
import { getOrganizationId } from '@/lib/hooks/useOrganization';

// ============================================================
// Tipos
// ============================================================

/** Estado de salud retornado por el endpoint /health */
interface HealthStatus {
  provider: string;
  isConfigured: boolean;
  activeLinks: number;
  lastSync: string | null;
  pendingTransactions: number;
  errors: string[];
}

/** Estado de una variable de entorno (sin valor) */
interface EnvVarStatus {
  name: string;
  isSet: boolean;
}

/** Estadisticas de consentimientos */
interface ConsentStats {
  total: number;
  active: number;
  revoked: number;
  expired: number;
  byType: {
    data_access: number;
    payment_initiation: number;
    account_validation: number;
  };
}

/** Tarjetas de resumen del dashboard */
interface SummaryCards {
  activeLinks: number;
  linkedAccounts: number;
  syncedTransactions: number;
  activeConsents: number;
}

// ============================================================
// Utilidades
// ============================================================

/** Formatea una fecha ISO a formato legible en espanol */
function formatDate(iso: string | null): string {
  if (!iso) return 'Nunca';
  try {
    return new Date(iso).toLocaleString('es-CO', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

/** Etiqueta legible para el proveedor configurado */
function providerLabel(provider: string): string {
  if (provider === 'prometeo') return 'Prometeo';
  if (provider === 'belvo') return 'Belvo';
  return provider.charAt(0).toUpperCase() + provider.slice(1);
}

// ============================================================
// Componente principal
// ============================================================

export default function OpenFinanceDashboardPage() {
  const [organizationId, setOrganizationId] = useState<number>(0);
  const [health, setHealth] = useState<HealthStatus | null>(null);
  const [envVars, setEnvVars] = useState<EnvVarStatus[]>([]);
  const [summary, setSummary] = useState<SummaryCards>({
    activeLinks: 0,
    linkedAccounts: 0,
    syncedTransactions: 0,
    activeConsents: 0,
  });
  const [isLoading, setIsLoading] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);

  /** Carga el estado de salud desde el endpoint /health */
  const loadHealth = useCallback(async () => {
    try {
      const res = await fetch('/api/integrations/open-finance/health');
      if (!res.ok) throw new Error('Error al obtener estado de salud');
      const json = await res.json() as {
        data: HealthStatus;
        envVars?: EnvVarStatus[];
      };
      setHealth(json.data);
      setEnvVars(json.envVars ?? []);
    } catch (error) {
      console.error('Error cargando health:', error);
      toast.error('Error al cargar el estado de Open Finance');
    }
  }, []);

  /** Carga los conteos de links, cuentas y transacciones desde Supabase */
  const loadSummary = useCallback(async (orgId: number) => {
    if (!orgId) return;
    try {
      // Fecha de hace 30 dias para filtrar transacciones recientes
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      const dateFrom = thirtyDaysAgo.toISOString().split('T')[0];

      // Consultar conteos en paralelo (head: true para no traer filas)
      const [
        linksRes,
        accountsRes,
        txRes,
        consentsRes,
      ] = await Promise.all([
        supabase
          .from('open_finance_links')
          .select('id', { count: 'exact', head: true })
          .eq('organization_id', orgId)
          .eq('status', 'active'),
        supabase
          .from('open_finance_accounts')
          .select('id', { count: 'exact', head: true })
          .eq('organization_id', orgId)
          .eq('is_active', true),
        supabase
          .from('open_finance_transactions')
          .select('id', { count: 'exact', head: true })
          .eq('organization_id', orgId)
          .gte('transaction_date', dateFrom),
        fetch(
          `/api/integrations/open-finance/consents/stats?organizationId=${orgId}`,
        ),
      ]);

      // Parsear estadisticas de consentimientos
      let activeConsents = 0;
      if (consentsRes.ok) {
        const consentJson = await consentsRes.json() as { data: ConsentStats };
        activeConsents = consentJson.data?.active ?? 0;
      }

      setSummary({
        activeLinks: linksRes.count ?? 0,
        linkedAccounts: accountsRes.count ?? 0,
        syncedTransactions: txRes.count ?? 0,
        activeConsents,
      });
    } catch (error) {
      console.error('Error cargando resumen:', error);
      toast.error('Error al cargar el resumen de Open Finance');
    }
  }, []);

  /** Carga inicial de todos los datos */
  useEffect(() => {
    const orgId = getOrganizationId();
    setOrganizationId(orgId);
    if (!orgId) {
      toast.error('Organizacion no disponible');
      setIsLoading(false);
      return;
    }
    Promise.all([loadHealth(), loadSummary(orgId)]).finally(() => {
      setIsLoading(false);
    });
  }, [loadHealth, loadSummary]);

  /** Dispara la sincronizacion de todos los links activos */
  const handleSync = async () => {
    if (!organizationId) {
      toast.error('Organizacion no disponible');
      return;
    }
    setIsSyncing(true);
    try {
      const res = await fetch('/api/integrations/open-finance/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ organizationId }),
      });
      if (!res.ok) {
        const err = await res.json() as { error?: string };
        throw new Error(err.error || 'Error al sincronizar');
      }
      toast.success('Sincronizacion iniciada correctamente');
      // Recargar datos tras sincronizar
      await Promise.all([loadHealth(), loadSummary(organizationId)]);
    } catch (error) {
      console.error('Error sincronizando:', error);
      toast.error(error instanceof Error ? error.message : 'Error al sincronizar');
    } finally {
      setIsSyncing(false);
    }
  };

  /** Refresca los saldos de todas las cuentas vinculadas */
  const handleRefreshBalances = async () => {
    if (!organizationId) {
      toast.error('Organizacion no disponible');
      return;
    }
    setIsRefreshing(true);
    try {
      const res = await fetch('/api/integrations/open-finance/refresh-balances', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ organizationId }),
      });
      if (!res.ok) {
        const err = await res.json() as { error?: string };
        throw new Error(err.error || 'Error al refrescar saldos');
      }
      toast.success('Saldos refrescados correctamente');
      await loadHealth();
    } catch (error) {
      console.error('Error refrescando saldos:', error);
      toast.error(error instanceof Error ? error.message : 'Error al refrescar saldos');
    } finally {
      setIsRefreshing(false);
    }
  };

  // ============================================================
  // Render
  // ============================================================

  /** Determina si el sistema esta operativo */
  const isOperational = health?.isConfigured ?? false;

  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-6 bg-gray-50 dark:bg-gray-900 min-h-screen">
      {/* Encabezado */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-blue-100 dark:bg-blue-900/30 rounded-xl">
            <Activity className="h-6 w-6 text-blue-600 dark:text-blue-400" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
              Open Finance
            </h1>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Finanzas / Open Finance / Dashboard
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {isLoading ? (
            <Skeleton className="h-8 w-32" />
          ) : (
            <Badge variant={isOperational ? 'success' : 'destructive'}>
              {isOperational ? 'Operativo' : 'No configurado'}
            </Badge>
          )}
        </div>
      </div>

      {/* Health check status */}
      <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
        <CardHeader>
          <CardTitle className="text-gray-900 dark:text-white flex items-center gap-2">
            <Activity className="h-5 w-5 text-blue-600 dark:text-blue-400" />
            Estado del servicio
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-3">
              <Skeleton className="h-6 w-full" />
              <Skeleton className="h-6 w-3/4" />
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {/* Proveedor configurado */}
              <div className="flex items-center gap-3">
                {isOperational ? (
                  <CheckCircle className="h-5 w-5 text-green-600 dark:text-green-400" />
                ) : (
                  <XCircle className="h-5 w-5 text-red-600 dark:text-red-400" />
                )}
                <div>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    Proveedor
                  </p>
                  <p className="text-sm font-medium text-gray-900 dark:text-white">
                    {health ? providerLabel(health.provider) : '-'}
                  </p>
                </div>
              </div>

              {/* Variables de entorno */}
              <div className="flex items-center gap-3">
                {isOperational ? (
                  <CheckCircle className="h-5 w-5 text-green-600 dark:text-green-400" />
                ) : (
                  <XCircle className="h-5 w-5 text-red-600 dark:text-red-400" />
                )}
                <div>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    Variables de entorno
                  </p>
                  <p className="text-sm font-medium text-gray-900 dark:text-white">
                    {areAllEnvVarsSet(envVars) ? 'Configuradas' : 'Faltan variables'}
                  </p>
                </div>
              </div>

              {/* Links activos */}
              <div className="flex items-center gap-3">
                <LinkIcon className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                <div>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    Links activos
                  </p>
                  <p className="text-sm font-medium text-gray-900 dark:text-white">
                    {health?.activeLinks ?? 0}
                  </p>
                </div>
              </div>

              {/* Ultima sincronizacion */}
              <div className="flex items-center gap-3">
                <RefreshCw className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                <div>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    Ultima sincronizacion
                  </p>
                  <p className="text-sm font-medium text-gray-900 dark:text-white">
                    {formatDate(health?.lastSync ?? null)}
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Errores de health */}
          {health && health.errors.length > 0 && (
            <Alert variant="destructive" className="mt-4">
              <AlertTriangle className="h-5 w-5" />
              <AlertTitle>Problemas detectados</AlertTitle>
              <AlertDescription className="text-sm">
                <ul className="list-disc list-inside space-y-1">
                  {health.errors.map((err) => (
                    <li key={err}>{err}</li>
                  ))}
                </ul>
              </AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>

      {/* Tarjetas de resumen */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Links activos */}
        <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="p-2 bg-blue-100 dark:bg-blue-900/30 rounded-lg">
              <LinkIcon className="h-6 w-6 text-blue-600 dark:text-blue-400" />
            </div>
            <div>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Links activos
              </p>
              {isLoading ? (
                <Skeleton className="h-7 w-12" />
              ) : (
                <p className="text-2xl font-bold text-gray-900 dark:text-white">
                  {summary.activeLinks}
                </p>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Cuentas vinculadas */}
        <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="p-2 bg-emerald-100 dark:bg-emerald-900/30 rounded-lg">
              <Building2 className="h-6 w-6 text-emerald-600 dark:text-emerald-400" />
            </div>
            <div>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Cuentas vinculadas
              </p>
              {isLoading ? (
                <Skeleton className="h-7 w-12" />
              ) : (
                <p className="text-2xl font-bold text-gray-900 dark:text-white">
                  {summary.linkedAccounts}
                </p>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Transacciones sincronizadas (ultimos 30 dias) */}
        <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="p-2 bg-purple-100 dark:bg-purple-900/30 rounded-lg">
              <Database className="h-6 w-6 text-purple-600 dark:text-purple-400" />
            </div>
            <div>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Transacciones (30 dias)
              </p>
              {isLoading ? (
                <Skeleton className="h-7 w-12" />
              ) : (
                <p className="text-2xl font-bold text-gray-900 dark:text-white">
                  {summary.syncedTransactions}
                </p>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Consentimientos activos */}
        <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="p-2 bg-amber-100 dark:bg-amber-900/30 rounded-lg">
              <Shield className="h-6 w-6 text-amber-600 dark:text-amber-400" />
            </div>
            <div>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Consentimientos activos
              </p>
              {isLoading ? (
                <Skeleton className="h-7 w-12" />
              ) : (
                <p className="text-2xl font-bold text-gray-900 dark:text-white">
                  {summary.activeConsents}
                </p>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Botones de accion rapida */}
      <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
        <CardHeader>
          <CardTitle className="text-gray-900 dark:text-white">
            Acciones rapidas
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-3">
            <Button
              onClick={handleSync}
              disabled={isSyncing || !organizationId}
            >
              <RefreshCw
                className={`h-4 w-4 mr-2 ${isSyncing ? 'animate-spin' : ''}`}
              />
              {isSyncing ? 'Sincronizando...' : 'Sincronizar ahora'}
            </Button>
            <Button
              variant="outline"
              onClick={handleRefreshBalances}
              disabled={isRefreshing || !organizationId}
            >
              <RefreshCw
                className={`h-4 w-4 mr-2 ${isRefreshing ? 'animate-spin' : ''}`}
              />
              {isRefreshing ? 'Refrescando...' : 'Refrescar saldos'}
            </Button>
            <Link href="/app/finanzas/bancos/anomalias">
              <Button variant="outline">
                <AlertTriangle className="h-4 w-4 mr-2" />
                Detectar anomalias
              </Button>
            </Link>
          </div>
        </CardContent>
      </Card>

      {/* Navegacion a sub-paginas */}
      <div>
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-3">
          Modulos
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Consentimientos */}
          <Link href="/app/finanzas/open-finance/consents">
            <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 hover:border-blue-400 dark:hover:border-blue-500 transition-colors cursor-pointer h-full">
              <CardContent className="p-5 flex items-start justify-between h-full">
                <div className="flex items-start gap-3">
                  <div className="p-2 bg-blue-100 dark:bg-blue-900/30 rounded-lg">
                    <Shield className="h-6 w-6 text-blue-600 dark:text-blue-400" />
                  </div>
                  <div>
                    <p className="font-medium text-gray-900 dark:text-white">
                      Gestion de consentimientos
                    </p>
                    <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                      Autorizaciones de acceso a datos financieros
                    </p>
                  </div>
                </div>
                <ArrowRight className="h-5 w-5 text-gray-400 mt-1" />
              </CardContent>
            </Card>
          </Link>

          {/* Tesoreria consolidada */}
          <Link href="/app/finanzas/bancos/tesoreria">
            <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 hover:border-blue-400 dark:hover:border-blue-500 transition-colors cursor-pointer h-full">
              <CardContent className="p-5 flex items-start justify-between h-full">
                <div className="flex items-start gap-3">
                  <div className="p-2 bg-emerald-100 dark:bg-emerald-900/30 rounded-lg">
                    <Wallet className="h-6 w-6 text-emerald-600 dark:text-emerald-400" />
                  </div>
                  <div>
                    <p className="font-medium text-gray-900 dark:text-white">
                      Tesoreria consolidada
                    </p>
                    <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                      Saldos y proyeccion de flujo de caja
                    </p>
                  </div>
                </div>
                <ArrowRight className="h-5 w-5 text-gray-400 mt-1" />
              </CardContent>
            </Card>
          </Link>

          {/* Deteccion de anomalias */}
          <Link href="/app/finanzas/bancos/anomalias">
            <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 hover:border-blue-400 dark:hover:border-blue-500 transition-colors cursor-pointer h-full">
              <CardContent className="p-5 flex items-start justify-between h-full">
                <div className="flex items-start gap-3">
                  <div className="p-2 bg-orange-100 dark:bg-orange-900/30 rounded-lg">
                    <AlertTriangle className="h-6 w-6 text-orange-600 dark:text-orange-400" />
                  </div>
                  <div>
                    <p className="font-medium text-gray-900 dark:text-white">
                      Deteccion de anomalias
                    </p>
                    <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                      Identificacion de movimientos inusuales
                    </p>
                  </div>
                </div>
                <ArrowRight className="h-5 w-5 text-gray-400 mt-1" />
              </CardContent>
            </Card>
          </Link>
        </div>
      </div>

      {/* Estado de configuracion y ultima sincronizacion */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Variables de entorno */}
        <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
          <CardHeader>
            <CardTitle className="text-gray-900 dark:text-white flex items-center gap-2">
              <Database className="h-5 w-5 text-blue-600 dark:text-blue-400" />
              Estado de configuracion
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="space-y-2">
                {[1, 2, 3, 4].map((i) => (
                  <Skeleton key={i} className="h-8 w-full" />
                ))}
              </div>
            ) : envVars.length > 0 ? (
              <div className="space-y-2">
                {envVars.map((envVar) => (
                  <div
                    key={envVar.name}
                    className="flex items-center justify-between py-2 border-b border-gray-100 dark:border-gray-700 last:border-0"
                  >
                    <code className="text-sm font-mono text-gray-700 dark:text-gray-300">
                      {envVar.name}
                    </code>
                    <Badge variant={envVar.isSet ? 'success' : 'warning'}>
                      {envVar.isSet ? 'Configurado' : 'Falta configurar'}
                    </Badge>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-gray-500 dark:text-gray-400">
                No se pudo verificar la configuracion
              </p>
            )}
          </CardContent>
        </Card>

        {/* Ultima sincronizacion */}
        <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
          <CardHeader>
            <CardTitle className="text-gray-900 dark:text-white flex items-center gap-2">
              <RefreshCw className="h-5 w-5 text-blue-600 dark:text-blue-400" />
              Ultima sincronizacion
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-20 w-full" />
            ) : (
              <div className="space-y-4">
                <div>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    Fecha de ultima sincronizacion global
                  </p>
                  <p className="text-lg font-medium text-gray-900 dark:text-white mt-1">
                    {formatDate(health?.lastSync ?? null)}
                  </p>
                </div>
                {health && health.pendingTransactions > 0 && (
                  <Alert variant="warning">
                    <AlertTriangle className="h-5 w-5" />
                    <AlertDescription className="text-sm">
                      Hay {health.pendingTransactions} transacciones
                      pendientes de importar al ERP.
                    </AlertDescription>
                  </Alert>
                )}
                <Button
                  onClick={handleSync}
                  disabled={isSyncing || !organizationId}
                  className="w-full"
                >
                  <RefreshCw
                    className={`h-4 w-4 mr-2 ${isSyncing ? 'animate-spin' : ''}`}
                  />
                  {isSyncing ? 'Sincronizando...' : 'Sincronizar ahora'}
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

// ============================================================
// Helpers de render
// ============================================================

/** Determina si todas las variables de entorno estan configuradas */
function areAllEnvVarsSet(envVars: EnvVarStatus[]): boolean {
  if (envVars.length === 0) return false;
  return envVars.every((v) => v.isSet);
}
