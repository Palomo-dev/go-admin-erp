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
        <CardTitle className="text-base flex items-center gap-2">
          <User className="h-4 w-4" />
          Cliente
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        <p className="font-medium">{displayName}</p>
        
        {displayPhone && (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <Phone className="h-4 w-4" />
            <a 
              href={`tel:${displayPhone}`} 
              className={cn(
                "hover:underline",
                "hover:text-primary transition-colors"
              )}
            >
              {displayPhone}
            </a>
          </p>
        )}
        
        {displayEmail && (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <Mail className="h-4 w-4" />
            <a 
              href={`mailto:${displayEmail}`} 
              className={cn(
                "hover:underline truncate max-w-[200px]",
                "hover:text-primary transition-colors"
              )}
            >
              {displayEmail}
            </a>
          </p>
        )}
      </CardContent>
    </Card>
  );
}
