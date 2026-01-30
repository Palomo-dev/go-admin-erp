'use client';

import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { CreditCard, AlertTriangle, User, Calendar, ExternalLink } from 'lucide-react';
import { cn } from '@/utils/Utils';
import Link from 'next/link';

interface ExpiringPass {
  id: string;
  vehicle_plate: string;
  customer_name: string;
  plan_name: string;
  end_date: string;
  days_remaining: number;
}

interface ExpiringPassesListProps {
  passes: ExpiringPass[];
  expiringIn7Days: number;
  expiringIn15Days: number;
  expiringIn30Days: number;
}

export function ExpiringPassesList({
  passes,
  expiringIn7Days,
  expiringIn15Days,
  expiringIn30Days,
}: ExpiringPassesListProps) {
  const getUrgencyBadge = (days: number) => {
    if (days <= 7) {
      return (
        <Badge variant="destructive" className="flex items-center gap-1">
          <AlertTriangle className="h-3 w-3" />
          {days} días
        </Badge>
      );
    }
    if (days <= 15) {
      return (
        <Badge className="bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200">
          {days} días
        </Badge>
      );
    }
    return (
      <Badge variant="secondary">
        {days} días
      </Badge>
    );
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('es-CO', {
      day: '2-digit',
      month: 'short',
    });
  };

  return (
    <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg font-semibold text-gray-900 dark:text-gray-100 flex items-center gap-2">
            <CreditCard className="h-5 w-5 text-purple-600" />
            Abonados por Vencer
          </CardTitle>
        </div>
      </CardHeader>
      <CardContent>
        {/* Resumen de vencimientos */}
        <div className="grid grid-cols-3 gap-2 mb-4">
          <div className={cn(
            'text-center p-2 rounded-lg border',
            expiringIn7Days > 0
              ? 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800'
              : 'bg-gray-50 dark:bg-gray-700/50 border-gray-200 dark:border-gray-600'
          )}>
            <p className={cn(
              'text-xl font-bold',
              expiringIn7Days > 0 ? 'text-red-600 dark:text-red-400' : 'text-gray-500'
            )}>
              {expiringIn7Days}
            </p>
            <p className="text-xs text-gray-500 dark:text-gray-400">7 días</p>
          </div>
          <div className={cn(
            'text-center p-2 rounded-lg border',
            expiringIn15Days > 0
              ? 'bg-yellow-50 dark:bg-yellow-900/20 border-yellow-200 dark:border-yellow-800'
              : 'bg-gray-50 dark:bg-gray-700/50 border-gray-200 dark:border-gray-600'
          )}>
            <p className={cn(
              'text-xl font-bold',
              expiringIn15Days > 0 ? 'text-yellow-600 dark:text-yellow-400' : 'text-gray-500'
            )}>
              {expiringIn15Days}
            </p>
            <p className="text-xs text-gray-500 dark:text-gray-400">15 días</p>
          </div>
          <div className="text-center p-2 rounded-lg bg-gray-50 dark:bg-gray-700/50 border border-gray-200 dark:border-gray-600">
            <p className="text-xl font-bold text-gray-600 dark:text-gray-400">
              {expiringIn30Days}
            </p>
            <p className="text-xs text-gray-500 dark:text-gray-400">30 días</p>
          </div>
        </div>

        {/* Lista de pases */}
        {passes.length === 0 ? (
          <div className="text-center py-6 text-gray-500 dark:text-gray-400">
            <CreditCard className="h-10 w-10 mx-auto mb-2 opacity-30" />
            <p className="text-sm">Sin vencimientos próximos</p>
          </div>
        ) : (
          <div className="space-y-2 max-h-[300px] overflow-y-auto">
            {passes.slice(0, 10).map((pass) => (
              <div
                key={pass.id}
                className={cn(
                  'flex items-center justify-between p-3 rounded-lg border',
                  pass.days_remaining <= 7
                    ? 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800'
                    : pass.days_remaining <= 15
                    ? 'bg-yellow-50 dark:bg-yellow-900/20 border-yellow-200 dark:border-yellow-800'
                    : 'bg-gray-50 dark:bg-gray-700/50 border-gray-200 dark:border-gray-600'
                )}
              >
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-gray-900 dark:text-gray-100 truncate">
                    {pass.vehicle_plate}
                  </p>
                  <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
                    <User className="h-3 w-3" />
                    <span className="truncate">{pass.customer_name}</span>
                  </div>
                  <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
                    <Calendar className="h-3 w-3" />
                    <span>{pass.plan_name} • Vence {formatDate(pass.end_date)}</span>
                  </div>
                </div>

                <div className="ml-2">
                  {getUrgencyBadge(pass.days_remaining)}
                </div>
              </div>
            ))}
          </div>
        )}

        {passes.length > 0 && (
          <div className="mt-4 pt-3 border-t border-gray-200 dark:border-gray-700">
            <Link href="/app/pms/parking/abonados">
              <Button variant="outline" size="sm" className="w-full">
                Ver todos los abonados
                <ExternalLink className="h-4 w-4 ml-2" />
              </Button>
            </Link>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
