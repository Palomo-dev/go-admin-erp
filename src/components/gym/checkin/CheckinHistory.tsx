'use client';

import React from 'react';
import { CheckCircle2, XCircle, Clock } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/utils/Utils';
import { MemberCheckin } from '@/lib/services/gymService';

interface CheckinHistoryProps {
  checkins: MemberCheckin[];
  isLoading?: boolean;
}

export function CheckinHistory({ checkins, isLoading }: CheckinHistoryProps) {
  if (isLoading) {
    return (
      <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
          Check-ins de Hoy
        </h3>
        <div className="space-y-3">
          {[1, 2, 3].map(i => (
            <div key={i} className="animate-pulse flex items-center gap-4 p-3 rounded-lg bg-gray-50 dark:bg-gray-900">
              <div className="w-10 h-10 bg-gray-200 dark:bg-gray-700 rounded-full" />
              <div className="flex-1 space-y-2">
                <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-1/3" />
                <div className="h-3 bg-gray-200 dark:bg-gray-700 rounded w-1/4" />
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
          Check-ins de Hoy
        </h3>
        <Badge variant="secondary" className="bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400">
          {checkins.length} registros
        </Badge>
      </div>

      {checkins.length === 0 ? (
        <div className="text-center py-8">
          <Clock className="h-12 w-12 text-gray-400 mx-auto mb-3" />
          <p className="text-gray-500 dark:text-gray-400">
            No hay check-ins registrados hoy
          </p>
        </div>
      ) : (
        <div className="space-y-2 max-h-[400px] overflow-y-auto">
          {checkins.map((checkin) => {
            const isDenied = !!checkin.denied_reason;
            const time = new Date(checkin.checkin_at).toLocaleTimeString('es-CO', {
              hour: '2-digit',
              minute: '2-digit'
            });

            return (
              <div
                key={checkin.id}
                className={cn(
                  "flex items-center gap-4 p-3 rounded-lg transition-colors",
                  isDenied 
                    ? "bg-red-50 dark:bg-red-900/10 border border-red-200 dark:border-red-800"
                    : "bg-gray-50 dark:bg-gray-900 border border-gray-100 dark:border-gray-700"
                )}
              >
                <div className={cn(
                  "p-2 rounded-full",
                  isDenied 
                    ? "bg-red-100 dark:bg-red-900/30" 
                    : "bg-green-100 dark:bg-green-900/30"
                )}>
                  {isDenied ? (
                    <XCircle className="h-5 w-5 text-red-600 dark:text-red-400" />
                  ) : (
                    <CheckCircle2 className="h-5 w-5 text-green-600 dark:text-green-400" />
                  )}
                </div>

                <div className="flex-1 min-w-0">
                  <p className="font-medium text-gray-900 dark:text-white truncate">
                    {checkin.customers?.first_name} {checkin.customers?.last_name}
                  </p>
                  {isDenied && (
                    <p className="text-sm text-red-600 dark:text-red-400 truncate">
                      {checkin.denied_reason}
                    </p>
                  )}
                </div>

                <div className="text-right">
                  <p className="text-sm font-medium text-gray-900 dark:text-white">
                    {time}
                  </p>
                  <p className="text-xs text-gray-500 dark:text-gray-400 capitalize">
                    {checkin.method || 'manual'}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default CheckinHistory;
