'use client';

import React, { useState } from 'react';
import { Clock, CheckCircle, ChefHat, AlertCircle, User, Check, Circle } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { formatCurrency } from '@/utils/Utils';
import type { KitchenTicket, KitchenTicketItem } from '@/lib/services/kitchenService';

interface TicketCardProps {
  ticket: KitchenTicket;
  onStatusChange: (ticketId: number, status: KitchenTicket['status']) => void;
  onItemStatusChange?: (itemId: number, status: KitchenTicketItem['status']) => void;
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

const getItemStatusInfo = (status: string | undefined) => {
  switch (status) {
    case 'pending':
      return { label: 'Pendiente', color: 'text-yellow-600 dark:text-yellow-400', bgColor: 'bg-yellow-50 dark:bg-yellow-900/20' };
    case 'preparing':
      return { label: 'Preparando', color: 'text-orange-600 dark:text-orange-400', bgColor: 'bg-orange-50 dark:bg-orange-900/20' };
    case 'ready':
      return { label: 'Listo', color: 'text-green-600 dark:text-green-400', bgColor: 'bg-green-50 dark:bg-green-900/20' };
    case 'delivered':
      return { label: 'Entregado', color: 'text-gray-600 dark:text-gray-400', bgColor: 'bg-gray-50 dark:bg-gray-900/20' };
    default:
      return { label: 'Pendiente', color: 'text-yellow-600 dark:text-yellow-400', bgColor: 'bg-yellow-50 dark:bg-yellow-900/20' };
  }
};

export function TicketCard({ ticket, onStatusChange, onItemStatusChange }: TicketCardProps) {
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
          const itemStatusInfo = getItemStatusInfo(item.status);
          const isItemReady = item.status === 'ready' || item.status === 'delivered';
          
          const handleItemClick = () => {
            if (!onItemStatusChange) return;
            // Ciclar entre estados: pending -> preparing -> ready
            const nextStatus = item.status === 'pending' ? 'preparing' : 
                              item.status === 'preparing' ? 'ready' : 
                              item.status === 'ready' ? 'pending' : 'pending';
            onItemStatusChange(item.id, nextStatus as KitchenTicketItem['status']);
          };
          
          return (
            <div
              key={item.id}
              className={`flex items-start justify-between p-3 rounded-lg border transition-all ${
                isItemReady 
                  ? 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800' 
                  : 'bg-gray-50 dark:bg-gray-800/50 border-transparent hover:border-blue-300 dark:hover:border-blue-700'
              } ${onItemStatusChange ? 'cursor-pointer' : ''}`}
              onClick={onItemStatusChange ? handleItemClick : undefined}
            >
              <div className="flex items-start gap-3 flex-1">
                {/* Indicador de estado del item */}
                <div className={`mt-1 flex-shrink-0 ${onItemStatusChange ? 'cursor-pointer' : ''}`}>
                  {isItemReady ? (
                    <div className="h-5 w-5 rounded-full bg-green-500 flex items-center justify-center">
                      <Check className="h-3 w-3 text-white" />
                    </div>
                  ) : item.status === 'preparing' ? (
                    <div className="h-5 w-5 rounded-full bg-orange-500 flex items-center justify-center animate-pulse">
                      <ChefHat className="h-3 w-3 text-white" />
                    </div>
                  ) : (
                    <div className="h-5 w-5 rounded-full border-2 border-gray-300 dark:border-gray-600" />
                  )}
                </div>
                
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <span className={`font-semibold ${isItemReady ? 'text-green-700 dark:text-green-400 line-through' : 'text-gray-900 dark:text-gray-100'}`}>
                      {item.sale_items?.quantity}x
                    </span>
                    <span className={isItemReady ? 'text-green-700 dark:text-green-400 line-through' : 'text-gray-900 dark:text-gray-100'}>
                      {product?.name || 'Producto'}
                    </span>
                  </div>
                  
                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge className={`${stationInfo.color} text-xs`}>
                      {stationInfo.label}
                    </Badge>
                    <Badge className={`${itemStatusInfo.bgColor} ${itemStatusInfo.color} text-xs`}>
                      {itemStatusInfo.label}
                    </Badge>
                    {product?.categories?.name && (
                      <span className="text-xs text-gray-500 dark:text-gray-400">
                        {product.categories.name}
                      </span>
                    )}
                  </div>
                  
                  {item.notes && (
                    <p className="mt-2 text-sm text-gray-600 dark:text-gray-400 italic">
                      📝 {typeof item.notes === 'object' ? (item.notes as any)?.extra : item.notes}
                    </p>
                  )}
                </div>
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
