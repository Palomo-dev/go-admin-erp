'use client';

import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Truck, Package, AlertTriangle, Clock, ExternalLink, Loader2 } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { es } from 'date-fns/locale';
import Link from 'next/link';

interface StoppedItem {
  type: 'trip' | 'shipment';
  id: string;
  code: string;
  status: string;
  stoppedSince?: string;
  reason?: string;
}

interface StoppedItemsPanelProps {
  items: StoppedItem[];
  isLoading: boolean;
  onRefresh: () => void;
}

const STATUS_REASONS: Record<string, string> = {
  delayed: 'Retraso reportado',
  incident: 'Incidente activo',
  scheduled: 'Esperando hora de salida',
  pending: 'Pendiente de procesamiento',
  received: 'En bodega, sin despachar',
};

export function StoppedItemsPanel({ items, isLoading, onRefresh }: StoppedItemsPanelProps) {
  if (isLoading) {
    return (
      <Card className="p-4">
        <div className="flex items-center justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin text-blue-600" />
        </div>
      </Card>
    );
  }

  return (
    <Card className="p-4">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-semibold text-gray-900 dark:text-white flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 text-orange-500" />
          Diagnóstico: Items Detenidos ({items.length})
        </h3>
        <Button variant="ghost" size="sm" onClick={onRefresh}>
          Actualizar
        </Button>
      </div>

      {items.length === 0 ? (
        <div className="text-center py-6">
          <Clock className="h-10 w-10 mx-auto text-green-500 mb-2" />
          <p className="text-gray-600 dark:text-gray-400">
            No hay viajes ni envíos detenidos
          </p>
          <p className="text-sm text-gray-500">Todo está en movimiento</p>
        </div>
      ) : (
        <div className="space-y-3 max-h-[400px] overflow-y-auto">
          {items.map((item) => (
            <div
              key={`${item.type}-${item.id}`}
              className="p-3 border rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800"
            >
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-2">
                  {item.type === 'trip' ? (
                    <Truck className="h-4 w-4 text-purple-600" />
                  ) : (
                    <Package className="h-4 w-4 text-green-600" />
                  )}
                  <span className="font-mono font-medium">{item.code}</span>
                  <Badge variant="outline" className="text-xs">
                    {item.type === 'trip' ? 'Viaje' : 'Envío'}
                  </Badge>
                </div>
                <Link
                  href={item.type === 'trip' ? `/app/transporte/viajes/${item.id}` : `/app/transporte/envios/${item.id}`}
                >
                  <Button variant="ghost" size="sm">
                    <ExternalLink className="h-4 w-4" />
                  </Button>
                </Link>
              </div>

              <div className="mt-2 space-y-1">
                <div className="flex items-center gap-2">
                  <Badge
                    className={
                      item.status === 'incident' || item.status === 'delayed'
                        ? 'bg-red-100 text-red-800'
                        : 'bg-yellow-100 text-yellow-800'
                    }
                  >
                    {item.status}
                  </Badge>
                </div>

                <p className="text-sm text-gray-600 dark:text-gray-400">
                  <strong>Razón probable:</strong> {STATUS_REASONS[item.status] || 'Estado no activo'}
                </p>

                {item.stoppedSince && (
                  <p className="text-xs text-gray-500 flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    Detenido hace {formatDistanceToNow(new Date(item.stoppedSince), { locale: es })}
                  </p>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="mt-4 pt-4 border-t">
        <p className="text-xs text-gray-500">
          <strong>Tip:</strong> Los items aparecen aquí si tienen estados que indican inactividad
          (delayed, incident, pending, received, scheduled).
        </p>
      </div>
    </Card>
  );
}
