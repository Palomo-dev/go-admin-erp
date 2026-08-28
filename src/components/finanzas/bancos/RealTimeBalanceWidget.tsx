'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Building2,
  Database,
  RefreshCw,
  AlertCircle,
  CheckCircle,
} from 'lucide-react';
import { toast } from 'sonner';
import { formatCurrency } from '@/utils/Utils';

/** Respuesta del endpoint de saldo en tiempo real */
interface RealTimeBalanceData {
  bankAccountId: number;
  bankAccountName: string;
  realBalance: number;
  localBalance: number;
  difference: number;
  lastUpdated: string;
  currency: string;
  isLinked: boolean;
}

interface RealTimeBalanceWidgetProps {
  bankAccountId: number;
  accountName: string;
  localBalance: number;
}

/**
 * Calcula el tiempo transcurrido legible desde una fecha ISO.
 * @param isoDate Fecha en formato ISO
 * @returns Texto legible (ej. "hace 5 minutos")
 */
function timeAgo(isoDate: string): string {
  const date = new Date(isoDate);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMin = Math.floor(diffMs / 60000);

  if (diffMin < 1) return 'hace menos de 1 minuto';
  if (diffMin < 60) return `hace ${diffMin} minuto${diffMin !== 1 ? 's' : ''}`;

  const diffHours = Math.floor(diffMin / 60);
  if (diffHours < 24) return `hace ${diffHours} hora${diffHours !== 1 ? 's' : ''}`;

  const diffDays = Math.floor(diffHours / 24);
  return `hace ${diffDays} dia${diffDays !== 1 ? 's' : ''}`;
}

export function RealTimeBalanceWidget({
  bankAccountId,
  accountName,
  localBalance,
}: RealTimeBalanceWidgetProps) {
  const [data, setData] = useState<RealTimeBalanceData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /** Consulta el saldo en tiempo real desde la API */
  const fetchBalance = useCallback(async () => {
    try {
      setError(null);
      const response = await fetch(
        `/api/integrations/open-finance/real-balance?bankAccountId=${bankAccountId}`,
      );
      if (!response.ok) {
        const body = await response.json() as { error?: string };
        throw new Error(body.error || 'Error al consultar saldo');
      }
      const body = await response.json() as { data: RealTimeBalanceData | null };
      setData(body.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error desconocido');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [bankAccountId]);

  useEffect(() => {
    fetchBalance();
  }, [fetchBalance]);

  /** Maneja el refresco manual del saldo */
  const handleRefresh = () => {
    setRefreshing(true);
    toast.promise(fetchBalance(), {
      loading: 'Consultando saldo real...',
      success: 'Saldo actualizado',
      error: 'Error al actualizar saldo',
    });
  };

  // Estado de carga inicial: skeleton
  if (loading) {
    return (
      <Card className="bg-gray-50 dark:bg-gray-900/50 border-gray-200 dark:border-gray-700">
        <CardContent className="p-4 space-y-3">
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-6 w-40" />
          <Skeleton className="h-4 w-28" />
          <Skeleton className="h-6 w-40" />
          <Skeleton className="h-8 w-full" />
        </CardContent>
      </Card>
    );
  }

  // Estado de error: mostrar con boton de retry
  if (error) {
    return (
      <Card className="bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800">
        <CardContent className="p-4 space-y-3">
          <div className="flex items-center gap-2 text-red-600 dark:text-red-400">
            <AlertCircle className="h-4 w-4" />
            <span className="text-sm font-medium">Error al consultar saldo real</span>
          </div>
          <p className="text-xs text-red-500 dark:text-red-400">{error}</p>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setLoading(true);
              fetchBalance();
            }}
            className="w-full dark:border-gray-600"
          >
            <RefreshCw className="h-4 w-4 mr-1" />
            Reintentar
          </Button>
        </CardContent>
      </Card>
    );
  }

  // Sin vinculacion Open Finance
  if (data && !data.isLinked) {
    return (
      <Card className="bg-gray-50 dark:bg-gray-900/50 border-gray-200 dark:border-gray-700">
        <CardContent className="p-4">
          <div className="flex items-center gap-2 text-gray-500 dark:text-gray-400">
            <AlertCircle className="h-4 w-4" />
            <span className="text-sm">Sin vinculacion Open Finance</span>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!data) return null;

  const hasDifference = Math.abs(data.difference) >= 1;

  return (
    <Card className="bg-gray-50 dark:bg-gray-900/50 border-gray-200 dark:border-gray-700">
      <CardContent className="p-4 space-y-3">
        {/* Titulo del widget */}
        <p className="text-xs font-medium text-gray-500 dark:text-gray-400 truncate">
          {accountName}
        </p>

        {/* Saldo local (ERP) */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Database className="h-4 w-4 text-gray-500 dark:text-gray-400" />
            <span className="text-sm text-gray-600 dark:text-gray-400">Saldo ERP</span>
          </div>
          <span className="text-sm font-semibold text-gray-700 dark:text-gray-300">
            {formatCurrency(localBalance, data.currency)}
          </span>
        </div>

        {/* Saldo real (banco) */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Building2 className="h-4 w-4 text-blue-600 dark:text-blue-400" />
            <span className="text-sm text-gray-600 dark:text-gray-400">Saldo Banco</span>
          </div>
          <span className="text-sm font-semibold text-blue-700 dark:text-blue-400">
            {formatCurrency(data.realBalance, data.currency)}
          </span>
        </div>

        {/* Diferencia */}
        <div className="flex items-center justify-between pt-2 border-t border-gray-200 dark:border-gray-700">
          <span className="text-xs text-gray-500 dark:text-gray-400">Diferencia</span>
          <Badge
            variant={hasDifference ? 'destructive' : 'default'}
            className={
              hasDifference
                ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
                : 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
            }
          >
            {hasDifference ? (
              <AlertCircle className="h-3 w-3 mr-1" />
            ) : (
              <CheckCircle className="h-3 w-3 mr-1" />
            )}
            {formatCurrency(data.difference, data.currency)}
          </Badge>
        </div>

        {/* Ultima actualizacion y boton refrescar */}
        <div className="flex items-center justify-between pt-1">
          <span className="text-xs text-gray-400 dark:text-gray-500">
            Actualizado {timeAgo(data.lastUpdated)}
          </span>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleRefresh}
            disabled={refreshing}
            className="h-7 px-2 text-xs"
          >
            <RefreshCw className={`h-3 w-3 mr-1 ${refreshing ? 'animate-spin' : ''}`} />
            Actualizar
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
