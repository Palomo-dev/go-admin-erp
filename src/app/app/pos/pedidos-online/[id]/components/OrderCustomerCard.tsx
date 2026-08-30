'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { User, Phone, Mail, MapPin } from 'lucide-react';
import { cn } from '@/utils/Utils';
import type { WebOrder } from '@/lib/services/webOrdersService';

interface OrderCustomerCardProps {
  order: WebOrder;
}

export function OrderCustomerCard({ order }: OrderCustomerCardProps) {
  const displayName = order.customer_name || order.customer?.full_name || 'Cliente anónimo';
  const displayPhone = order.customer_phone || order.customer?.phone;
  const displayEmail = order.customer_email || order.customer?.email;

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2 dark:text-gray-100">
          <User className="h-4 w-4 dark:text-gray-300" />
          Cliente
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        <p className="font-medium dark:text-gray-100">{displayName}</p>
        
        {displayPhone && (
          <p className="flex items-center gap-2 text-sm text-muted-foreground dark:text-gray-400">
            <Phone className="h-4 w-4 dark:text-gray-400" />
            <a 
              href={`tel:${displayPhone}`} 
              className={cn(
                "hover:underline",
                "hover:text-primary transition-colors dark:text-gray-300 dark:hover:text-blue-400"
              )}
            >
              {displayPhone}
            </a>
          </p>
        )}
        
        {displayEmail && (
          <p className="flex items-center gap-2 text-sm text-muted-foreground dark:text-gray-400">
            <Mail className="h-4 w-4 dark:text-gray-400" />
            <a
              href={`mailto:${displayEmail}`}
              className={cn(
                "hover:underline break-words whitespace-normal",
                "hover:text-primary transition-colors dark:text-gray-300 dark:hover:text-blue-400"
              )}
            >
              {displayEmail}
            </a>
          </p>
        )}

        {/* Dirección completa del cliente (desde delivery_address) */}
        {order.delivery_type !== 'pickup' && order.delivery_address && (() => {
          const addr = order.delivery_address;
          const parts: string[] = [];
          if (addr.address) parts.push(addr.address);
          if (addr.neighborhood) parts.push(addr.neighborhood);
          if (addr.city) parts.push(addr.city);
          const stateName = addr.state || addr.department;
          if (stateName) parts.push(stateName);
          if (addr.country) parts.push(addr.country);
          if (parts.length === 0) return null;
          return (
            <div className="space-y-1 pt-1 border-t dark:border-gray-700">
              <p className="flex items-start gap-2 text-sm text-muted-foreground dark:text-gray-400">
                <MapPin className="h-4 w-4 mt-0.5 flex-shrink-0 dark:text-gray-400" />
                <span className="dark:text-gray-200 break-words whitespace-normal">{parts.join(', ')}</span>
              </p>
              {addr.instructions && (
                <p className="text-xs text-yellow-600 dark:text-yellow-400 ml-6">
                  📝 {addr.instructions}
                </p>
              )}
            </div>
          );
        })()}
      </CardContent>
    </Card>
  );
}
