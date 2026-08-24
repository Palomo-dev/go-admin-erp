'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { toast } from 'sonner';
import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import {
  AlertTriangle,
  Copy,
  DollarSign,
  Clock,
  Shield,
  RefreshCw,
  CheckCircle,
  ArrowLeft,
} from 'lucide-react';
import { formatCurrency } from '@/utils/Utils';

// Tipos espejo del servicio (para uso en cliente)
interface DuplicateAlert {
  id: string;
  transactionIds: number[];
  amount: number;
  date: string;
  description: string;
  count: number;
  severity: 'high' | 'medium';
}

interface AnomalyAlert {
  id: string;
  type: 'unusual_amount' | 'unusual_time' | 'fragmentation' | 'weekend_high_amount';
  severity: 'high' | 'medium' | 'low';
  transactionId?: number;
  amount?: number;
  date?: string;
  description: string;
  expectedValue?: number;
  actualValue?: number;
}

interface BalanceDiscrepancy {
  id: string;
  bankAccountId: number;
  bankAccountName: string;
  localBalance: number;
  calculatedBalance: number;
  realBalance: number | null;
  difference: number;
  severity: 'high' | 'medium';
}

interface AnomalySummary {
  duplicates: DuplicateAlert[];
  unusualAmounts: AnomalyAlert[];
  suspiciousPatterns: AnomalyAlert[];
  balanceDiscrepancies: BalanceDiscrepancy[];
  totalAlerts: number;
  highSeverity: number;
}

interface AnomalyPanelProps {
  organizationId: number;
}

// Configuracion de colores por severidad
const severityConfig: Record<
  'high' | 'medium' | 'low',
  { badge: string; label: string; border: string }
> = {
  high: {
    badge: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
    label: 'Alta',
    border: 'border-red-500',
  },
  medium: {
    badge: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400',
    label: 'Media',
    border: 'border-yellow-500',
  },
  low: {
    badge: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400',
    label: 'Baja',
    border: 'border-gray-400',
  },
};

// Etiquetas legibles para tipos de anomalia
const anomalyTypeLabels: Record<AnomalyAlert['type'], string> = {
  unusual_amount: 'Monto inusual',
  unusual_time: 'Horario inusual',
  fragmentation: 'Fragmentacion',
  weekend_high_amount: 'Monto alto en fin de semana',
};

// Componente badge de severidad
function SeverityBadge({ severity }: { severity: 'high' | 'medium' | 'low' }) {
  const config = severityConfig[severity];
  return <Badge className={config.badge}>{config.label}</Badge>;
}

export function AnomalyPanel({ organizationId }: AnomalyPanelProps) {
  const [summary, setSummary] = useState<AnomalySummary | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Estado del dialog de resolucion
  const [resolveDialogOpen, setResolveDialogOpen] = useState(false);
  const [resolvingAnomalyId, setResolvingAnomalyId] = useState<string | null>(null);
  const [resolutionText, setResolutionText] = useState('');
  const [isResolving, setIsResolving] = useState(false);

  // Carga todas las anomalias
  const loadAnomalies = useCallback(async () => {
    if (!organizationId || organizationId === 0) {
      toast.error('Organizacion no disponible');
      setIsLoading(false);
      return;
    }

    try {
      setError(null);
      const res = await fetch(
        `/api/integrations/open-finance/anomalies?organizationId=${organizationId}`,
      );
      const data = await res.json();

      if (data.success) {
        setSummary(data.data);
      } else {
        setError(data.error || 'Error al cargar anomalias');
      }
    } catch (err) {
      console.error('Error cargando anomalias:', err);
      setError('Error de conexion al cargar anomalias');
    } finally {
      setIsLoading(false);
    }
  }, [organizationId]);

  useEffect(() => {
    loadAnomalies();
  }, [loadAnomalies]);

  // Refresca los datos
  const handleRefresh = async () => {
    setIsRefreshing(true);
    await loadAnomalies();
    setIsRefreshing(false);
    toast.success('Anomalias actualizadas');
  };

  // Abre el dialog de resolucion
  const openResolveDialog = (anomalyId: string) => {
    setResolvingAnomalyId(anomalyId);
    setResolutionText('');
    setResolveDialogOpen(true);
  };

  // Confirma la resolucion de una anomalia
  const handleResolve = async () => {
    if (!resolvingAnomalyId || !resolutionText.trim()) {
      toast.error('Ingrese una resolucion');
      return;
    }

    setIsResolving(true);
    try {
      const res = await fetch(
        '/api/integrations/open-finance/anomalies/resolve',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            anomalyId: resolvingAnomalyId,
            resolution: resolutionText.trim(),
          }),
        },
      );
      const data = await res.json();

      if (data.success) {
        toast.success('Anomalia marcada como resuelta');
        setResolveDialogOpen(false);
        setResolvingAnomalyId(null);
        setResolutionText('');
      } else {
        toast.error(data.error || 'Error al resolver anomalia');
      }
    } catch (err) {
      console.error('Error al resolver anomalia:', err);
      toast.error('Error de conexion al resolver');
    } finally {
      setIsResolving(false);
    }
  };

  // Render de tarjeta de resumen
  const renderSummaryCard = (
    title: string,
    value: number,
    icon: React.ReactNode,
    color: string,
  ) => (
    <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium text-gray-600 dark:text-gray-300">
          {title}
        </CardTitle>
        <div className={`p-1.5 rounded-lg ${color}`}>{icon}</div>
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold text-gray-900 dark:text-white">
          {value}
        </div>
      </CardContent>
    </Card>
  );

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
          <div className="p-2 bg-orange-100 dark:bg-orange-900/30 rounded-xl">
            <Shield className="h-6 w-6 text-orange-600" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
              Deteccion de Anomalias
            </h1>
            <p className="text-gray-500 dark:text-gray-400">
              Finanzas / Bancos / Anomalias
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
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-28 w-full" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {renderSummaryCard(
            'Total Alertas',
            summary?.totalAlerts ?? 0,
            <AlertTriangle className="h-4 w-4 text-orange-600" />,
            'bg-orange-100 dark:bg-orange-900/30',
          )}
          {renderSummaryCard(
            'Alta Severidad',
            summary?.highSeverity ?? 0,
            <AlertTriangle className="h-4 w-4 text-red-600" />,
            'bg-red-100 dark:bg-red-900/30',
          )}
          {renderSummaryCard(
            'Duplicados',
            summary?.duplicates.length ?? 0,
            <Copy className="h-4 w-4 text-blue-600" />,
            'bg-blue-100 dark:bg-blue-900/30',
          )}
          {renderSummaryCard(
            'Discrepancias',
            summary?.balanceDiscrepancies.length ?? 0,
            <DollarSign className="h-4 w-4 text-purple-600" />,
            'bg-purple-100 dark:bg-purple-900/30',
          )}
        </div>
      )}

      {/* Error general */}
      {error && !isLoading && (
        <Alert className="border-red-500 bg-red-50 dark:bg-red-900/20">
          <AlertTriangle className="h-4 w-4 text-red-600" />
          <AlertTitle>Error</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {/* Contenido principal */}
      {isLoading ? (
        <div className="space-y-2">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-32 w-full" />
          ))}
        </div>
      ) : (
        <Tabs defaultValue="duplicates" className="w-full">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="duplicates" className="text-xs sm:text-sm">
              <Copy className="h-4 w-4 mr-1 sm:mr-2" />
              Duplicados
              {summary && summary.duplicates.length > 0 && (
                <Badge className="ml-1 sm:ml-2 bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400">
                  {summary.duplicates.length}
                </Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="unusual" className="text-xs sm:text-sm">
              <DollarSign className="h-4 w-4 mr-1 sm:mr-2" />
              Montos
              {summary && summary.unusualAmounts.length > 0 && (
                <Badge className="ml-1 sm:ml-2 bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400">
                  {summary.unusualAmounts.length}
                </Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="suspicious" className="text-xs sm:text-sm">
              <Clock className="h-4 w-4 mr-1 sm:mr-2" />
              Patrones
              {summary && summary.suspiciousPatterns.length > 0 && (
                <Badge className="ml-1 sm:ml-2 bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400">
                  {summary.suspiciousPatterns.length}
                </Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="discrepancies" className="text-xs sm:text-sm">
              <Shield className="h-4 w-4 mr-1 sm:mr-2" />
              Saldos
              {summary && summary.balanceDiscrepancies.length > 0 && (
                <Badge className="ml-1 sm:ml-2 bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400">
                  {summary.balanceDiscrepancies.length}
                </Badge>
              )}
            </TabsTrigger>
          </TabsList>

          {/* Tab: Duplicados */}
          <TabsContent value="duplicates" className="space-y-3 mt-4">
            {summary && summary.duplicates.length > 0 ? (
              summary.duplicates.map((dup) => (
                <Alert
                  key={dup.id}
                  className={severityConfig[dup.severity].border}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 space-y-1">
                      <div className="flex items-center gap-2">
                        <Copy className="h-4 w-4 text-blue-600" />
                        <AlertTitle className="text-base">
                          {dup.count} transacciones duplicadas
                        </AlertTitle>
                        <SeverityBadge severity={dup.severity} />
                      </div>
                      <AlertDescription>
                        <div className="text-sm text-gray-600 dark:text-gray-300">
                          <span className="font-medium">Monto:</span>{' '}
                          {formatCurrency(dup.amount, 'COP')}
                        </div>
                        <div className="text-sm text-gray-600 dark:text-gray-300">
                          <span className="font-medium">Fecha:</span> {dup.date}
                        </div>
                        <div className="text-sm text-gray-600 dark:text-gray-300">
                          <span className="font-medium">Descripcion:</span>{' '}
                          {dup.description}
                        </div>
                        <div className="text-sm text-gray-600 dark:text-gray-300">
                          <span className="font-medium">IDs:</span>{' '}
                          {dup.transactionIds.join(', ')}
                        </div>
                      </AlertDescription>
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => openResolveDialog(dup.id)}
                      className="dark:border-gray-600"
                    >
                      <CheckCircle className="h-4 w-4 mr-1" />
                      Resolver
                    </Button>
                  </div>
                </Alert>
              ))
            ) : (
              <div className="text-center py-12 text-gray-500 dark:text-gray-400">
                <Copy className="h-12 w-12 mx-auto mb-3 opacity-40" />
                No se detectaron transacciones duplicadas
              </div>
            )}
          </TabsContent>

          {/* Tab: Montos inusuales */}
          <TabsContent value="unusual" className="space-y-3 mt-4">
            {summary && summary.unusualAmounts.length > 0 ? (
              summary.unusualAmounts.map((alert) => (
                <Alert
                  key={alert.id}
                  className={severityConfig[alert.severity].border}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 space-y-1">
                      <div className="flex items-center gap-2">
                        <DollarSign className="h-4 w-4 text-orange-600" />
                        <AlertTitle className="text-base">
                          {anomalyTypeLabels[alert.type]}
                        </AlertTitle>
                        <SeverityBadge severity={alert.severity} />
                      </div>
                      <AlertDescription>
                        <div className="text-sm text-gray-600 dark:text-gray-300">
                          {alert.description}
                        </div>
                        {alert.expectedValue !== undefined &&
                          alert.actualValue !== undefined && (
                            <div className="flex gap-4 mt-1 text-sm">
                              <span className="text-gray-500 dark:text-gray-400">
                                Esperado: {formatCurrency(alert.expectedValue, 'COP')}
                              </span>
                              <span className="text-gray-900 dark:text-white font-medium">
                                Actual: {formatCurrency(alert.actualValue, 'COP')}
                              </span>
                            </div>
                          )}
                        {alert.transactionId && (
                          <div className="text-xs text-gray-400 mt-1">
                            Tx ID: {alert.transactionId}
                          </div>
                        )}
                      </AlertDescription>
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => openResolveDialog(alert.id)}
                      className="dark:border-gray-600"
                    >
                      <CheckCircle className="h-4 w-4 mr-1" />
                      Resolver
                    </Button>
                  </div>
                </Alert>
              ))
            ) : (
              <div className="text-center py-12 text-gray-500 dark:text-gray-400">
                <DollarSign className="h-12 w-12 mx-auto mb-3 opacity-40" />
                No se detectaron montos inusuales
              </div>
            )}
          </TabsContent>

          {/* Tab: Patrones sospechosos */}
          <TabsContent value="suspicious" className="space-y-3 mt-4">
            {summary && summary.suspiciousPatterns.length > 0 ? (
              summary.suspiciousPatterns.map((alert) => (
                <Alert
                  key={alert.id}
                  className={severityConfig[alert.severity].border}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 space-y-1">
                      <div className="flex items-center gap-2">
                        <Clock className="h-4 w-4 text-yellow-600" />
                        <AlertTitle className="text-base">
                          {anomalyTypeLabels[alert.type]}
                        </AlertTitle>
                        <SeverityBadge severity={alert.severity} />
                      </div>
                      <AlertDescription>
                        <div className="text-sm text-gray-600 dark:text-gray-300">
                          {alert.description}
                        </div>
                        {alert.date && (
                          <div className="text-xs text-gray-400 mt-1">
                            Fecha: {new Date(alert.date).toLocaleString('es-CO')}
                          </div>
                        )}
                        {alert.transactionId && (
                          <div className="text-xs text-gray-400">
                            Tx ID: {alert.transactionId}
                          </div>
                        )}
                      </AlertDescription>
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => openResolveDialog(alert.id)}
                      className="dark:border-gray-600"
                    >
                      <CheckCircle className="h-4 w-4 mr-1" />
                      Resolver
                    </Button>
                  </div>
                </Alert>
              ))
            ) : (
              <div className="text-center py-12 text-gray-500 dark:text-gray-400">
                <Clock className="h-12 w-12 mx-auto mb-3 opacity-40" />
                No se detectaron patrones sospechosos
              </div>
            )}
          </TabsContent>

          {/* Tab: Discrepancias de saldo */}
          <TabsContent value="discrepancies" className="space-y-3 mt-4">
            {summary && summary.balanceDiscrepancies.length > 0 ? (
              <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
                <CardContent className="p-0">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Cuenta</TableHead>
                        <TableHead className="text-right">Saldo Local</TableHead>
                        <TableHead className="text-right">Saldo Calculado</TableHead>
                        <TableHead className="text-right">Saldo Real</TableHead>
                        <TableHead className="text-right">Diferencia</TableHead>
                        <TableHead className="text-center">Severidad</TableHead>
                        <TableHead className="text-center">Accion</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {summary.balanceDiscrepancies.map((disc) => (
                        <TableRow key={disc.id}>
                          <TableCell className="font-medium text-gray-900 dark:text-white">
                            {disc.bankAccountName}
                          </TableCell>
                          <TableCell className="text-right">
                            {formatCurrency(disc.localBalance, 'COP')}
                          </TableCell>
                          <TableCell className="text-right">
                            {formatCurrency(disc.calculatedBalance, 'COP')}
                          </TableCell>
                          <TableCell className="text-right">
                            {disc.realBalance !== null
                              ? formatCurrency(disc.realBalance, 'COP')
                              : '-'}
                          </TableCell>
                          <TableCell
                            className={`text-right font-medium ${
                              Math.abs(disc.difference) > 1
                                ? 'text-red-600 dark:text-red-400'
                                : 'text-green-600 dark:text-green-400'
                            }`}
                          >
                            {formatCurrency(disc.difference, 'COP')}
                          </TableCell>
                          <TableCell className="text-center">
                            <SeverityBadge severity={disc.severity} />
                          </TableCell>
                          <TableCell className="text-center">
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => openResolveDialog(disc.id)}
                              className="dark:border-gray-600"
                            >
                              <CheckCircle className="h-4 w-4 mr-1" />
                              Resolver
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            ) : (
              <div className="text-center py-12 text-gray-500 dark:text-gray-400">
                <Shield className="h-12 w-12 mx-auto mb-3 opacity-40" />
                No se detectaron discrepancias de saldo
              </div>
            )}
          </TabsContent>
        </Tabs>
      )}

      {/* Dialog de resolucion */}
      <Dialog open={resolveDialogOpen} onOpenChange={setResolveDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Resolver Anomalia</DialogTitle>
            <DialogDescription>
              Ingrese una descripcion de como se resolvio la anomalia. Esta
              accion quedara registrada en el log del sistema.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <Textarea
              placeholder="Ej: Falso positivo, las transacciones corresponden a pagos diferentes..."
              value={resolutionText}
              onChange={(e) => setResolutionText(e.target.value)}
              rows={4}
              className="dark:border-gray-600 dark:bg-gray-800"
            />
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setResolveDialogOpen(false)}
              className="dark:border-gray-600"
            >
              Cancelar
            </Button>
            <Button
              onClick={handleResolve}
              disabled={isResolving || !resolutionText.trim()}
            >
              {isResolving ? (
                <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <CheckCircle className="h-4 w-4 mr-2" />
              )}
              Confirmar Resolucion
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
