'use client';

import React from 'react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Wrench, AlertTriangle, Clock, CheckCircle, Play, Pause, XCircle } from 'lucide-react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';

interface MaintenanceOrder {
  id: string;
  description: string;
  status: string;
  priority?: string;
  created_at: string;
  resolved_at?: string;
  cost_estimate?: number;
}

interface SpaceMaintenanceProps {
  orders: MaintenanceOrder[];
  onUpdateStatus?: (orderId: string, status: string) => Promise<void>;
}

const getStatusInfo = (status: string) => {
  switch (status) {
    case 'reported':
      return {
        label: 'Reportado',
        color: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400',
        icon: AlertTriangle,
      };
    case 'assigned':
      return {
        label: 'Asignado',
        color: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400',
        icon: Clock,
      };
    case 'in_progress':
      return {
        label: 'En Proceso',
        color: 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400',
        icon: Wrench,
      };
    case 'on_hold':
      return {
        label: 'En Espera',
        color: 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400',
        icon: Clock,
      };
    case 'completed':
      return {
        label: 'Completado',
        color: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
        icon: CheckCircle,
      };
    case 'cancelled':
      return {
        label: 'Cancelado',
        color: 'bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-400',
        icon: AlertTriangle,
      };
    default:
      return {
        label: status,
        color: 'bg-gray-100 text-gray-800',
        icon: Wrench,
      };
  }
};

const getPriorityInfo = (priority?: string) => {
  switch (priority) {
    case 'high':
      return { label: 'Alta', color: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400' };
    case 'med':
      return { label: 'Media', color: 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400' };
    case 'low':
      return { label: 'Baja', color: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400' };
    default:
      return { label: 'Normal', color: 'bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-400' };
  }
};

export function SpaceMaintenance({ orders, onUpdateStatus }: SpaceMaintenanceProps) {
  const activeOrders = orders.filter(o => 
    o.status === 'reported' || 
    o.status === 'assigned' || 
    o.status === 'in_progress' || 
    o.status === 'on_hold'
  );
  const completedOrders = orders.filter(o => o.status === 'completed' || o.status === 'cancelled');

  return (
    <Card className="p-6">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100">
          Mantenimiento
        </h2>
        <Wrench className="h-5 w-5 text-orange-600 dark:text-orange-400" />
      </div>

      {/* Órdenes Activas */}
      {activeOrders.length > 0 && (
        <div className="mb-6">
          <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">
            Órdenes Activas ({activeOrders.length})
          </h3>
          <div className="space-y-3">
            {activeOrders.map((order) => {
              const statusInfo = getStatusInfo(order.status);
              const priorityInfo = getPriorityInfo(order.priority);
              const StatusIcon = statusInfo.icon;
              
              return (
                <div
                  key={order.id}
                  className="p-4 bg-orange-50 dark:bg-orange-900/20 rounded-lg border border-orange-200 dark:border-orange-800"
                >
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex items-start gap-2">
                      <StatusIcon className="h-5 w-5 text-orange-600 dark:text-orange-400 mt-0.5" />
                      <div>
                        <p className="font-medium text-gray-900 dark:text-gray-100">
                          {order.description}
                        </p>
                        <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
                          Creada el {format(new Date(order.created_at), 'dd MMM yyyy', { locale: es })}
                        </p>
                        {order.cost_estimate && (
                          <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                            Costo estimado: ${order.cost_estimate.toLocaleString()}
                          </p>
                        )}
                      </div>
                    </div>
                    <div className="flex flex-col gap-2">
                      <Badge className={statusInfo.color}>
                        {statusInfo.label}
                      </Badge>
                      {order.priority && (
                        <Badge className={priorityInfo.color} variant="outline">
                          {priorityInfo.label}
                        </Badge>
                      )}
                    </div>
                  </div>

                  {/* Botones de acción */}
                  {onUpdateStatus && (
                    <div className="flex gap-2 mt-3 pt-3 border-t border-orange-200 dark:border-orange-800">
                      {order.status === 'reported' && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => onUpdateStatus(order.id, 'assigned')}
                          className="flex-1"
                        >
                          <Play className="h-3 w-3 mr-1" />
                          Asignar
                        </Button>
                      )}
                      {(order.status === 'reported' || order.status === 'assigned') && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => onUpdateStatus(order.id, 'in_progress')}
                          className="flex-1"
                        >
                          <Wrench className="h-3 w-3 mr-1" />
                          Iniciar
                        </Button>
                      )}
                      {order.status === 'in_progress' && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => onUpdateStatus(order.id, 'on_hold')}
                          className="flex-1"
                        >
                          <Pause className="h-3 w-3 mr-1" />
                          Pausar
                        </Button>
                      )}
                      {(order.status === 'in_progress' || order.status === 'on_hold') && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => onUpdateStatus(order.id, 'completed')}
                          className="flex-1 text-green-600 dark:text-green-400"
                        >
                          <CheckCircle className="h-3 w-3 mr-1" />
                          Completar
                        </Button>
                      )}
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => onUpdateStatus(order.id, 'cancelled')}
                        className="text-red-600 dark:text-red-400"
                      >
                        <XCircle className="h-3 w-3" />
                      </Button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Historial */}
      {completedOrders.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">
            Historial ({completedOrders.length})
          </h3>
          <div className="space-y-2">
            {completedOrders.slice(0, 5).map((order) => {
              const statusInfo = getStatusInfo(order.status);
              
              return (
                <div
                  key={order.id}
                  className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-700/30 rounded-lg"
                >
                  <div>
                    <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
                      {order.description}
                    </p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      {format(new Date(order.created_at), 'dd MMM yyyy', { locale: es })}
                      {order.resolved_at && (
                        <> → {format(new Date(order.resolved_at), 'dd MMM yyyy', { locale: es })}</>
                      )}
                    </p>
                  </div>
                  <Badge className={statusInfo.color} variant="outline">
                    {statusInfo.label}
                  </Badge>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {orders.length === 0 && (
        <div className="text-center py-8">
          <Wrench className="h-12 w-12 text-gray-400 mx-auto mb-3" />
          <p className="text-gray-500 dark:text-gray-400">
            No hay órdenes de mantenimiento
          </p>
        </div>
      )}
    </Card>
  );
}
