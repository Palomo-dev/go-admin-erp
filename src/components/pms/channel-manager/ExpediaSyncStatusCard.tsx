'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  RefreshCw,
  CheckCircle2,
  XCircle,
  Clock,
  Zap,
  ArrowDownToLine,
  ArrowUpFromLine,
  Loader2,
  ChevronDown,
  ChevronUp,
  BedDouble,
  Building2,
} from 'lucide-react';

interface SyncLog {
  id: string;
  syncType: string;
  direction: string;
  status: string;
  itemsProcessed: number;
  errorMessage?: string;
  createdAt: string;
}

interface SyncStatus {
  lastSync?: {
    type: string;
    status: string;
    createdAt: string;
    itemsProcessed: number;
  };
  totalSyncs24h: number;
  errors24h: number;
}

interface RoomType {
  roomTypeId: string;
  roomTypeName: string;
  maxOccupancy: number;
  ratePlans: Array<{
    ratePlanId: string;
    ratePlanName: string;
    distributionModel: string;
    isActive: boolean;
    pricingModel: string;
  }>;
}

interface ExpediaSyncStatusCardProps {
  connectionId: string;
  propertyId: string;
  connectionName: string;
}

const SYNC_TYPE_LABELS: Record<string, string> = {
  reservation_pull: 'Poll Reservas',
  availability_push: 'Push Disponibilidad',
  rate_push: 'Push Tarifas',
  product_sync: 'Sync Producto',
  connection_check: 'Health Check',
};

function formatRelativeTime(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);

  if (diffMins < 1) return 'Ahora';
  if (diffMins < 60) return `Hace ${diffMins}m`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `Hace ${diffHours}h`;
  const diffDays = Math.floor(diffHours / 24);
  return `Hace ${diffDays}d`;
}

function StatusIcon({ status }: { status: string }) {
  switch (status) {
    case 'success':
      return <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />;
    case 'error':
      return <XCircle className="h-3.5 w-3.5 text-red-500" />;
    case 'partial':
      return <Clock className="h-3.5 w-3.5 text-yellow-500" />;
    default:
      return <Clock className="h-3.5 w-3.5 text-gray-400" />;
  }
}

function DirectionIcon({ direction }: { direction: string }) {
  return direction === 'inbound'
    ? <ArrowDownToLine className="h-3.5 w-3.5 text-blue-500" />
    : <ArrowUpFromLine className="h-3.5 w-3.5 text-purple-500" />;
}

export function ExpediaSyncStatusCard({
  connectionId,
  propertyId,
  connectionName,
}: ExpediaSyncStatusCardProps) {
  const [syncStatus, setSyncStatus] = useState<SyncStatus | null>(null);
  const [logs, setLogs] = useState<SyncLog[]>([]);
  const [roomTypes, setRoomTypes] = useState<RoomType[]>([]);
  const [showLogs, setShowLogs] = useState(false);
  const [showRoomTypes, setShowRoomTypes] = useState(false);
  const [isPolling, setIsPolling] = useState(false);
  const [isPushing, setIsPushing] = useState(false);
  const [isLoadingRooms, setIsLoadingRooms] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  const loadStatus = useCallback(async () => {
    try {
      const res = await fetch(`/api/integrations/expedia/sync-status?connectionId=${connectionId}`);
      if (res.ok) {
        const data = await res.json();
        setSyncStatus(data.status || null);
        setLogs(data.logs || []);
      }
    } catch {
      // Silently fail
    } finally {
      setIsLoading(false);
    }
  }, [connectionId]);

  useEffect(() => {
    loadStatus();
  }, [loadStatus]);

  const handlePollReservations = async () => {
    setIsPolling(true);
    try {
      await fetch('/api/integrations/expedia/poll-reservations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ connectionId }),
      });
      await loadStatus();
    } finally {
      setIsPolling(false);
    }
  };

  const handlePushAvailability = async () => {
    setIsPushing(true);
    try {
      await fetch('/api/integrations/expedia/push-availability', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ connectionId, fullSync: false }),
      });
      await loadStatus();
    } finally {
      setIsPushing(false);
    }
  };

  const handleLoadRoomTypes = async () => {
    if (roomTypes.length > 0) {
      setShowRoomTypes(!showRoomTypes);
      return;
    }
    setIsLoadingRooms(true);
    setShowRoomTypes(true);
    try {
      const res = await fetch(`/api/integrations/expedia/room-types?connectionId=${connectionId}&withRatePlans=true`);
      if (res.ok) {
        const data = await res.json();
        setRoomTypes(data.roomTypes || []);
      }
    } catch {
      // Silently fail
    } finally {
      setIsLoadingRooms(false);
    }
  };

  if (isLoading) {
    return (
      <Card className="p-4">
        <div className="animate-pulse flex items-center gap-3">
          <div className="h-8 w-8 bg-gray-200 dark:bg-gray-700 rounded" />
          <div className="flex-1 space-y-2">
            <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-1/3" />
            <div className="h-3 bg-gray-200 dark:bg-gray-700 rounded w-1/2" />
          </div>
        </div>
      </Card>
    );
  }

  return (
    <Card className="p-4 border-l-4 border-l-[#00355F]">
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Badge className="bg-[#00355F] text-white text-xs">
            <Zap className="h-3 w-3 mr-1" />
            API
          </Badge>
          <span className="font-medium text-sm text-gray-900 dark:text-gray-100">
            {connectionName}
          </span>
          <span className="text-xs text-gray-500 dark:text-gray-400 font-mono">
            #{propertyId}
          </span>
        </div>

        {/* Quick stats */}
        <div className="flex items-center gap-3 text-xs">
          <span className="text-gray-500 dark:text-gray-400">
            24h: {syncStatus?.totalSyncs24h || 0} syncs
          </span>
          {(syncStatus?.errors24h || 0) > 0 && (
            <Badge variant="destructive" className="text-xs">
              {syncStatus?.errors24h} errores
            </Badge>
          )}
        </div>
      </div>

      {/* Last sync info */}
      {syncStatus?.lastSync && (
        <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400 mb-3">
          <StatusIcon status={syncStatus.lastSync.status} />
          <span>
            Último: {SYNC_TYPE_LABELS[syncStatus.lastSync.type] || syncStatus.lastSync.type}
          </span>
          <span>·</span>
          <span>{syncStatus.lastSync.itemsProcessed} items</span>
          <span>·</span>
          <span>{formatRelativeTime(syncStatus.lastSync.createdAt)}</span>
        </div>
      )}

      {/* Action buttons */}
      <div className="flex flex-wrap gap-2 mb-2">
        <Button
          variant="outline"
          size="sm"
          onClick={handlePollReservations}
          disabled={isPolling}
          className="text-xs"
        >
          {isPolling ? (
            <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
          ) : (
            <ArrowDownToLine className="h-3.5 w-3.5 mr-1" />
          )}
          Poll Reservas
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={handlePushAvailability}
          disabled={isPushing}
          className="text-xs"
        >
          {isPushing ? (
            <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
          ) : (
            <ArrowUpFromLine className="h-3.5 w-3.5 mr-1" />
          )}
          Push Disponibilidad
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={handleLoadRoomTypes}
          disabled={isLoadingRooms}
          className="text-xs"
        >
          {isLoadingRooms ? (
            <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
          ) : (
            <BedDouble className="h-3.5 w-3.5 mr-1" />
          )}
          Room Types
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={loadStatus}
          className="text-xs ml-auto"
        >
          <RefreshCw className="h-3.5 w-3.5" />
        </Button>
      </div>

      {/* Room Types section */}
      {showRoomTypes && (
        <div className="mt-3 mb-2 space-y-2">
          <div className="flex items-center gap-2 text-xs font-medium text-gray-700 dark:text-gray-300">
            <Building2 className="h-3.5 w-3.5" />
            <span>Room Types ({roomTypes.length})</span>
          </div>
          {isLoadingRooms ? (
            <div className="flex items-center gap-2 text-xs text-gray-500 py-2">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Consultando Expedia Product API...
            </div>
          ) : roomTypes.length === 0 ? (
            <p className="text-xs text-gray-400 py-2">No se encontraron room types</p>
          ) : (
            <div className="space-y-2 max-h-60 overflow-y-auto">
              {roomTypes.map(rt => (
                <div
                  key={rt.roomTypeId}
                  className="p-2 rounded bg-gray-50 dark:bg-gray-900/50 border border-gray-100 dark:border-gray-800"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium text-gray-900 dark:text-gray-100">
                      {rt.roomTypeName}
                    </span>
                    <span className="text-xs text-gray-500 dark:text-gray-400 font-mono">
                      ID: {rt.roomTypeId}
                    </span>
                  </div>
                  <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                    Ocupación máx: {rt.maxOccupancy} · {rt.ratePlans.length} rate plan(s)
                  </div>
                  {rt.ratePlans.length > 0 && (
                    <div className="mt-1.5 space-y-1">
                      {rt.ratePlans.map(rp => (
                        <div
                          key={rp.ratePlanId}
                          className="flex items-center gap-2 text-xs pl-3 border-l-2 border-gray-200 dark:border-gray-700"
                        >
                          <Badge
                            variant={rp.isActive ? 'default' : 'secondary'}
                            className="text-[10px] px-1.5 py-0"
                          >
                            {rp.isActive ? 'Activo' : 'Inactivo'}
                          </Badge>
                          <span className="text-gray-700 dark:text-gray-300 truncate flex-1">
                            {rp.ratePlanName}
                          </span>
                          <span className="text-gray-400 text-[10px] font-mono shrink-0">
                            {rp.distributionModel}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Logs toggle */}
      <Button
        variant="ghost"
        size="sm"
        onClick={() => setShowLogs(!showLogs)}
        className="text-xs w-full justify-between text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100"
      >
        <span>Historial de sincronización ({logs.length})</span>
        {showLogs ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
      </Button>

      {/* Logs list */}
      {showLogs && logs.length > 0 && (
        <div className="mt-2 space-y-1 max-h-48 overflow-y-auto">
          {logs.map(log => (
            <div
              key={log.id}
              className="flex items-center gap-2 text-xs py-1.5 px-2 rounded bg-gray-50 dark:bg-gray-900/50"
            >
              <DirectionIcon direction={log.direction} />
              <StatusIcon status={log.status} />
              <span className="text-gray-700 dark:text-gray-300 flex-1 truncate">
                {SYNC_TYPE_LABELS[log.syncType] || log.syncType}
                {log.itemsProcessed > 0 && ` (${log.itemsProcessed})`}
              </span>
              {log.errorMessage && (
                <span className="text-red-500 truncate max-w-[150px]" title={log.errorMessage}>
                  {log.errorMessage}
                </span>
              )}
              <span className="text-gray-400 flex-shrink-0">
                {formatRelativeTime(log.createdAt)}
              </span>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}
