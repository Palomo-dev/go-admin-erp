'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { toast } from 'sonner';
import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Skeleton } from '@/components/ui/skeleton';
import { Progress } from '@/components/ui/progress';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Wallet,
  TrendingUp,
  TrendingDown,
  AlertTriangle,
  Building2,
  RefreshCw,
  ArrowRightLeft,
  ArrowLeft,
} from 'lucide-react';
import { formatCurrency } from '@/utils/Utils';
import { getOrganizationId } from '@/lib/hooks/useOrganization';

// Tipos espejo del servicio (para uso en cliente)
interface AccountPosition {
  bankAccountId: number;
  bankName: string;
  accountName: string;
  accountNumber: string;
  currency: string;
  localBalance: number;
  realBalance: number | null;
  difference: number | null;
  isLinked: boolean;
  lastUpdated: string | null;
}

interface ConsolidatedPosition {
  totalByCurrency: Record<string, number>;
  accounts: AccountPosition[];
  lastUpdated: string;
}

interface ProjectionEntry {
  date: string;
  inflow: number;
  outflow: number;
  netFlow: number;
  projectedBalance: number;
  description: string;
}

interface CashFlowProjection {
  entries: ProjectionEntry[];
  totalInflow: number;
  totalOutflow: number;
  netFlow: number;
}

interface TreasuryAlert {
  id: string;
  type:
    | 'negative_balance'
    | 'overdue_payable'
    | 'upcoming_payable'
    | 'concentration_risk'
    | 'balance_discrepancy';
  severity: 'high' | 'medium' | 'low';
  message: string;
  amount?: number;
  accountId?: number;
  supplierId?: number;
}

interface PaymentConcentration {
  supplierId: number;
  supplierName: string;
  totalAmount: number;
  paymentCount: number;
  averageAmount: number;
  percentage: number;
}

// Mapa de colores por severidad de alerta
const severityConfig: Record<
  TreasuryAlert['severity'],
  { color: string; label: string; border: string }
> = {
  high: {
    color: 'text-red-700 dark:text-red-400',
    label: 'Alta',
    border: 'border-red-500',
  },
  medium: {
    color: 'text-orange-700 dark:text-orange-400',
    label: 'Media',
    border: 'border-orange-500',
  },
  low: {
    color: 'text-yellow-700 dark:text-yellow-400',
    label: 'Baja',
    border: 'border-yellow-500',
  },
};

// Etiquetas legibles para tipos de alerta
const alertTypeLabels: Record<TreasuryAlert['type'], string> = {
  negative_balance: 'Saldo negativo',
  overdue_payable: 'CxP vencida',
  upcoming_payable: 'CxP por vencer',
  concentration_risk: 'Riesgo de concentracion',
  balance_discrepancy: 'Discrepancia de saldo',
};

export function TesoreriaPage() {
  const [position, setPosition] = useState<ConsolidatedPosition | null>(null);
  const [projection, setProjection] = useState<CashFlowProjection | null>(null);
  const [alerts, setAlerts] = useState<TreasuryAlert[]>([]);
  const [concentration, setConcentration] = useState<PaymentConcentration[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Carga todos los datos de tesoreria en paralelo
  const loadData = useCallback(async () => {
    const organizationId = getOrganizationId();
    if (!organizationId) {
      toast.error('Organizacion no disponible');
      setIsLoading(false);
      return;
    }

    try {
      // Rango de fechas para concentracion: anio actual hasta hoy
      const today = new Date();
      const yearStart = new Date(today.getFullYear(), 0, 1);
      const dateFrom = yearStart.toISOString().split('T')[0];
      const dateTo = today.toISOString().split('T')[0];

      const [posRes, projRes, alertsRes, concRes] = await Promise.all([
        fetch(
          `/api/integrations/open-finance/treasury?organizationId=${organizationId}`,
        ),
        fetch(
          `/api/integrations/open-finance/treasury/projection?organizationId=${organizationId}&days=90`,
        ),
        fetch(
          `/api/integrations/open-finance/treasury/alerts?organizationId=${organizationId}`,
        ),
        fetch(
          `/api/integrations/open-finance/treasury/concentration?organizationId=${organizationId}&dateFrom=${dateFrom}&dateTo=${dateTo}`,
        ),
      ]);

      const [posData, projData, alertsData, concData] = await Promise.all([
        posRes.json(),
        projRes.json(),
        alertsRes.json(),
        concRes.json(),
      ]);

      if (posData.success) setPosition(posData.data);
      if (projData.success) setProjection(projData.data);
      if (alertsData.success) setAlerts(alertsData.data || []);
      if (concData.success) setConcentration(concData.data || []);
    } catch (error) {
      console.error('Error cargando datos de tesoreria:', error);
      toast.error('Error al cargar los datos de tesoreria');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Refresca todos los datos
  const handleRefresh = async () => {
    setIsRefreshing(true);
    await loadData();
    setIsRefreshing(false);
    toast.success('Datos de tesoreria actualizados');
  };

  // Calcula el flujo neto de 90 dias
  const netFlow90 = projection?.netFlow ?? 0;

  // Entradas de proyeccion con movimientos (para grafico)
  const projectionWithMovement = projection
    ? projection.entries.filter((e) => e.inflow > 0 || e.outflow > 0).slice(0, 30)
    : [];

  // Valor maximo absoluto para escalar barras del grafico
  const maxBarValue = projectionWithMovement.reduce((max, e) => {
    const val = Math.max(e.inflow, e.outflow);
    return val > max ? val : max;
  }, 0);

  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-4 sm:space-y-6 bg-gray-50 dark:bg-gray-900 min-h-screen">
      {/* Encabezado */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Link href="/app/finanzas/bancos">
            <Button
              variant="ghost"
              size="icon"
              className="hover:bg-gray-100 dark:hover:bg-gray-800"
            >
              <ArrowLeft className="h-5 w-5" />
            </Button>
          </Link>
          <div className="p-2 bg-blue-100 dark:bg-blue-900/30 rounded-xl">
            <Wallet className="h-6 w-6 text-blue-600" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
              Tesoreria Consolidada
            </h1>
            <p className="text-gray-500 dark:text-gray-400">
              Finanzas / Bancos / Tesoreria
            </p>
          </div>
        </div>

        <Button
          variant="outline"
          onClick={handleRefresh}
          disabled={isRefreshing}
          className="dark:border-gray-600 dark:hover:bg-gray-800"
        >
          <RefreshCw
            className={`h-4 w-4 mr-2 ${isRefreshing ? 'animate-spin' : ''}`}
          />
          Actualizar
        </Button>
      </div>

      {/* Tarjetas de resumen */}
      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-28 w-full" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Total COP */}
          <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-gray-600 dark:text-gray-300">
                Total COP
              </CardTitle>
              <Wallet className="h-4 w-4 text-blue-600 dark:text-blue-400" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-gray-900 dark:text-white">
                {formatCurrency(position?.totalByCurrency.COP ?? 0, 'COP')}
              </div>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Saldo consolidado en pesos
              </p>
            </CardContent>
          </Card>

          {/* Total USD */}
          <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-gray-600 dark:text-gray-300">
                Total USD
              </CardTitle>
              <Wallet className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-gray-900 dark:text-white">
                {formatCurrency(position?.totalByCurrency.USD ?? 0, 'USD')}
              </div>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Saldo consolidado en dolares
              </p>
            </CardContent>
          </Card>

          {/* Flujo neto 90 dias */}
          <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-gray-600 dark:text-gray-300">
                Flujo Neto 90 dias
              </CardTitle>
              {netFlow90 >= 0 ? (
                <TrendingUp className="h-4 w-4 text-green-600 dark:text-green-400" />
              ) : (
                <TrendingDown className="h-4 w-4 text-red-600 dark:text-red-400" />
              )}
            </CardHeader>
            <CardContent>
              <div
                className={`text-2xl font-bold ${
                  netFlow90 >= 0
                    ? 'text-green-600 dark:text-green-400'
                    : 'text-red-600 dark:text-red-400'
                }`}
              >
                {formatCurrency(netFlow90, 'COP')}
              </div>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Entradas: {formatCurrency(projection?.totalInflow ?? 0, 'COP')} |
                Salidas: {formatCurrency(projection?.totalOutflow ?? 0, 'COP')}
              </p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Posicion consolidada por cuenta */}
      <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
        <CardHeader>
          <CardTitle className="text-gray-900 dark:text-white flex items-center gap-2">
            <Building2 className="h-5 w-5 text-blue-600" />
            Posicion Consolidada por Cuenta
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-2">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : position && position.accounts.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Banco</TableHead>
                  <TableHead>Cuenta</TableHead>
                  <TableHead>Moneda</TableHead>
                  <TableHead className="text-right">Saldo Local</TableHead>
                  <TableHead className="text-right">Saldo Real</TableHead>
                  <TableHead className="text-right">Diferencia</TableHead>
                  <TableHead className="text-center">Vinculada</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {position.accounts.map((account) => (
                  <TableRow key={account.bankAccountId}>
                    <TableCell className="font-medium text-gray-900 dark:text-white">
                      {account.bankName}
                    </TableCell>
                    <TableCell className="text-gray-600 dark:text-gray-300">
                      {account.accountName}
                      <div className="text-xs text-gray-400">
                        {account.accountNumber}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">{account.currency}</Badge>
                    </TableCell>
                    <TableCell className="text-right font-medium">
                      {formatCurrency(account.localBalance, account.currency)}
                    </TableCell>
                    <TableCell className="text-right font-medium">
                      {account.realBalance !== null
                        ? formatCurrency(account.realBalance, account.currency)
                        : '-'}
                    </TableCell>
                    <TableCell
                      className={`text-right font-medium ${
                        account.difference === null
                          ? 'text-gray-400'
                          : Math.abs(account.difference) > 1
                            ? 'text-orange-600 dark:text-orange-400'
                            : 'text-green-600 dark:text-green-400'
                      }`}
                    >
                      {account.difference !== null
                        ? formatCurrency(account.difference, account.currency)
                        : '-'}
                    </TableCell>
                    <TableCell className="text-center">
                      {account.isLinked ? (
                        <Badge className="bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400">
                          SI
                        </Badge>
                      ) : (
                        <Badge variant="secondary">NO</Badge>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <div className="text-center py-8 text-gray-500 dark:text-gray-400">
              No hay cuentas bancarias activas para consolidar
            </div>
          )}
        </CardContent>
      </Card>

      {/* Proyeccion de flujo de caja */}
      <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
        <CardHeader>
          <CardTitle className="text-gray-900 dark:text-white flex items-center gap-2">
            <TrendingUp className="h-5 w-5 text-blue-600" />
            Proyeccion de Flujo de Caja (90 dias)
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <Skeleton className="h-64 w-full" />
          ) : projectionWithMovement.length > 0 ? (
            <div className="space-y-3">
              {/* Grafico de barras simple */}
              <div className="flex items-end gap-1 h-48 border-b border-gray-200 dark:border-gray-700 pb-2">
                {projectionWithMovement.map((entry) => {
                  const inflowHeight =
                    maxBarValue > 0 ? (entry.inflow / maxBarValue) * 100 : 0;
                  const outflowHeight =
                    maxBarValue > 0 ? (entry.outflow / maxBarValue) * 100 : 0;
                  return (
                    <div
                      key={entry.date}
                      className="flex-1 flex flex-col items-center gap-1 group relative"
                      title={`${entry.date}\nEntradas: ${formatCurrency(entry.inflow, 'COP')}\nSalidas: ${formatCurrency(entry.outflow, 'COP')}\nSaldo: ${formatCurrency(entry.projectedBalance, 'COP')}`}
                    >
                      <div className="flex items-end gap-0.5 h-full">
                        {/* Barra de entradas (verde) */}
                        <div
                          className="w-2 bg-green-500 dark:bg-green-600 rounded-t"
                          style={{ height: `${inflowHeight}%` }}
                        />
                        {/* Barra de salidas (rojo) */}
                        <div
                          className="w-2 bg-red-500 dark:bg-red-600 rounded-t"
                          style={{ height: `${outflowHeight}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Leyenda */}
              <div className="flex items-center gap-4 text-xs text-gray-500 dark:text-gray-400">
                <div className="flex items-center gap-1">
                  <div className="w-3 h-3 bg-green-500 dark:bg-green-600 rounded" />
                  Entradas
                </div>
                <div className="flex items-center gap-1">
                  <div className="w-3 h-3 bg-red-500 dark:bg-red-600 rounded" />
                  Salidas
                </div>
              </div>

              {/* Resumen de proyeccion */}
              <div className="grid grid-cols-3 gap-4 pt-2 border-t border-gray-200 dark:border-gray-700">
                <div>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    Total Entradas
                  </p>
                  <p className="text-lg font-bold text-green-600 dark:text-green-400">
                    {formatCurrency(projection?.totalInflow ?? 0, 'COP')}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    Total Salidas
                  </p>
                  <p className="text-lg font-bold text-red-600 dark:text-red-400">
                    {formatCurrency(projection?.totalOutflow ?? 0, 'COP')}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    Flujo Neto
                  </p>
                  <p
                    className={`text-lg font-bold ${
                      (projection?.netFlow ?? 0) >= 0
                        ? 'text-green-600 dark:text-green-400'
                        : 'text-red-600 dark:text-red-400'
                    }`}
                  >
                    {formatCurrency(projection?.netFlow ?? 0, 'COP')}
                  </p>
                </div>
              </div>
            </div>
          ) : (
            <div className="text-center py-8 text-gray-500 dark:text-gray-400">
              No hay movimientos proyectados en los proximos 90 dias
            </div>
          )}
        </CardContent>
      </Card>

      {/* Alertas de tesoreria */}
      <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
        <CardHeader>
          <CardTitle className="text-gray-900 dark:text-white flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-orange-600" />
            Alertas de Tesoreria
            {alerts.length > 0 && (
              <Badge className="bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400">
                {alerts.length}
              </Badge>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-2">
              {[1, 2].map((i) => (
                <Skeleton key={i} className="h-16 w-full" />
              ))}
            </div>
          ) : alerts.length > 0 ? (
            <div className="space-y-3">
              {alerts.map((alert) => {
                const config = severityConfig[alert.severity];
                return (
                  <Alert
                    key={alert.id}
                    className={`${config.border} bg-white dark:bg-gray-800`}
                  >
                    <AlertTriangle className={`h-4 w-4 ${config.color}`} />
                    <AlertTitle className={config.color}>
                      {alertTypeLabels[alert.type]} - {config.label}
                    </AlertTitle>
                    <AlertDescription className="text-gray-600 dark:text-gray-300">
                      {alert.message}
                    </AlertDescription>
                  </Alert>
                );
              })}
            </div>
          ) : (
            <div className="text-center py-8 text-gray-500 dark:text-gray-400">
              No hay alertas de tesoreria activas
            </div>
          )}
        </CardContent>
      </Card>

      {/* Concentracion de pagos por proveedor */}
      <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
        <CardHeader>
          <CardTitle className="text-gray-900 dark:text-white flex items-center gap-2">
            <ArrowRightLeft className="h-5 w-5 text-blue-600" />
            Concentracion de Pagos por Proveedor (Top 10)
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-2">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : concentration.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Proveedor</TableHead>
                  <TableHead className="text-right">Total Pagos</TableHead>
                  <TableHead className="text-center">N. Pagos</TableHead>
                  <TableHead className="text-right">Promedio</TableHead>
                  <TableHead className="text-center">% Concentracion</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {concentration.map((conc) => (
                  <TableRow key={conc.supplierId}>
                    <TableCell className="font-medium text-gray-900 dark:text-white">
                      {conc.supplierName}
                    </TableCell>
                    <TableCell className="text-right font-medium">
                      {formatCurrency(conc.totalAmount, 'COP')}
                    </TableCell>
                    <TableCell className="text-center">
                      {conc.paymentCount}
                    </TableCell>
                    <TableCell className="text-right">
                      {formatCurrency(conc.averageAmount, 'COP')}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Progress
                          value={conc.percentage}
                          className="w-24 h-2"
                        />
                        <span
                          className={`text-xs font-medium ${
                            conc.percentage > 30
                              ? 'text-orange-600 dark:text-orange-400'
                              : 'text-gray-600 dark:text-gray-300'
                          }`}
                        >
                          {conc.percentage.toFixed(1)}%
                        </span>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <div className="text-center py-8 text-gray-500 dark:text-gray-400">
              No hay datos de concentracion de pagos en el periodo
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
