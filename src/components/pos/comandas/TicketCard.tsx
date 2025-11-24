'use client';

import React from 'react';
import { Clock, CheckCircle, ChefHat, AlertCircle, User } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { formatCurrency } from '@/utils/Utils';
import type { KitchenTicket } from '@/lib/services/kitchenService';

interface TicketCardProps {
  ticket: KitchenTicket;
  onStatusChange: (ticketId: number, status: KitchenTicket['status']) => void;
}

const getStatusInfo = (status: KitchenTicket['status']) => {
  switch (status) {
    case 'new':
      return {
        label: 'Nuevo',
        color: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400',
        icon: AlertCircle,
      };
    case 'preparing':
      return {
        label: 'En Preparación',
        color: 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400',
        icon: ChefHat,
      };
    case 'ready':
      return {
        label: 'Listo',
        color: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
        icon: CheckCircle,
      };
    case 'delivered':
      return {
        label: 'Entregado',
        color: 'bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-400',
        icon: CheckCircle,
      };
    default:
      return {
        label: 'Desconocido',
        color: 'bg-gray-100 text-gray-800',
        icon: AlertCircle,
      };
  }
};

const getStationInfo = (station: string | null) => {
  switch (station) {
    case 'hot_kitchen':
      return { label: 'Cocina Caliente', color: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400' };
    case 'cold_kitchen':
      return { label: 'Cocina Fría', color: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400' };
    case 'bar':
      return { label: 'Bar', color: 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400' };
    default:
      return { label: 'General', color: 'bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-400' };
  }
};

export function TicketCard({ ticket, onStatusChange }: TicketCardProps) {
  const statusInfo = getStatusInfo(ticket.status);
  const StatusIcon = statusInfo.icon;
  
  const tableName = ticket.table_sessions?.restaurant_tables?.name || 'Mesa';
  const zoneName = ticket.table_sessions?.restaurant_tables?.zone || '';

  const timeElapsed = React.useMemo(() => {
    const created = new Date(ticket.created_at);
    const now = new Date();
    const diff = Math.floor((now.getTime() - created.getTime()) / 60000);
    return diff;
  }, [ticket.created_at]);

  const getNextStatus = (): KitchenTicket['status'] | null => {
    switch (ticket.status) {
      case 'new':
        return 'preparing';
      case 'preparing':
        return 'ready';
      case 'ready':
        return 'delivered';
      default:
        return null;
    }
  };

  const nextStatus = getNextStatus();

  return (
    <Card className="overflow-hidden hover:shadow-lg transition-shadow">
      {/* Header */}
      <div className="bg-gradient-to-r from-blue-50 to-blue-100 dark:from-blue-900/20 dark:to-blue-800/20 p-4 border-b border-blue-200 dark:border-blue-800">
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-2">
              <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100">
                {tableName}
              </h3>
              {zoneName && (
                <Badge variant="outline" className="text-xs">
                  {zoneName}
                </Badge>
              )}
            </div>
            <div className="flex items-center gap-3 text-sm text-gray-600 dark:text-gray-400">
              <div className="flex items-center gap-1">
                <Clock className="h-4 w-4" />
                <span>{timeElapsed} min</span>
              </div>
              <div className="flex items-center gap-1">
                <User className="h-4 w-4" />
                <span>Ticket #{ticket.id}</span>
              </div>
            </div>
          </div>
          
          <Badge className={`${statusInfo.color} flex items-center gap-1`}>
            <StatusIcon className="h-3 w-3" />
            {statusInfo.label}
          </Badge>
        </div>
      </div>

      {/* Items */}
      <div className="p-4 space-y-3">
        {ticket.kitchen_ticket_items?.map((item) => {
          const product = item.sale_items?.products;
          const stationInfo = getStationInfo(item.station);
          
          return (
            <div
              key={item.id}
              className="flex items-start justify-between p-3 bg-gray-50 dark:bg-gray-800/50 rounded-lg"
            >
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <span className="font-semibold text-gray-900 dark:text-gray-100">
                    {item.sale_items?.quantity}x
                  </span>
                  <span className="text-gray-900 dark:text-gray-100">
                    {product?.name || 'Producto'}
                  </span>
                </div>
                
                <div className="flex items-center gap-2">
                  <Badge className={`${stationInfo.color} text-xs`}>
                    {stationInfo.label}
                  </Badge>
                  {product?.categories?.name && (
                    <span className="text-xs text-gray-500 dark:text-gray-400">
                      {product.categories.name}
                    </span>
                  )}
                </div>
                
                {item.notes && (
                  <p className="mt-2 text-sm text-gray-600 dark:text-gray-400 italic">
                    📝 {item.notes}
                  </p>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Footer */}
      {nextStatus && (
        <div className="p-4 bg-gray-50 dark:bg-gray-800/30 border-t border-gray-200 dark:border-gray-700">
          <Button
            onClick={() => onStatusChange(ticket.id, nextStatus)}
            className="w-full bg-blue-600 hover:bg-blue-700 text-white"
          >
            {nextStatus === 'preparing' && '🔥 Comenzar Preparación'}
            {nextStatus === 'ready' && '✅ Marcar como Listo'}
            {nextStatus === 'delivered' && '📤 Marcar como Entregado'}
          </Button>
        </div>
      )}
    </Card>
  );
}
