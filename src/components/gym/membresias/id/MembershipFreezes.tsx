'use client';

import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { 
  Snowflake, 
  Calendar, 
  Clock,
  Play,
  CheckCircle2,
  XCircle,
  Pause,
  User
} from 'lucide-react';
import { cn, formatDate } from '@/utils/Utils';
import { MembershipFreeze } from '@/lib/services/gymService';

interface MembershipFreezesProps {
  freezes: MembershipFreeze[];
  isLoading?: boolean;
}

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: React.ComponentType<{ className?: string }> }> = {
  active: { 
    label: 'Activo', 
    color: 'bg-cyan-100 text-cyan-700 dark:bg-cyan-900/30 dark:text-cyan-400', 
    icon: Snowflake 
  },
  ended: { 
    label: 'Finalizado', 
    color: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400', 
    icon: CheckCircle2 
  },
  cancelled: { 
    label: 'Cancelado', 
    color: 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-400', 
    icon: XCircle 
  },
};

export function MembershipFreezes({ freezes, isLoading }: MembershipFreezesProps) {
  const totalDaysFrozen = freezes.reduce((sum, f) => sum + (f.days_frozen || 0), 0);
  const activeFreeze = freezes.find(f => f.status === 'active');

  if (isLoading) {
    return (
      <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
        <CardHeader>
          <div className="animate-pulse h-6 bg-gray-200 dark:bg-gray-700 rounded w-48" />
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {[1, 2].map(i => (
              <div key={i} className="animate-pulse flex gap-4">
                <div className="w-10 h-10 bg-gray-200 dark:bg-gray-700 rounded-full" />
                <div className="flex-1 space-y-2">
                  <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-1/3" />
                  <div className="h-3 bg-gray-200 dark:bg-gray-700 rounded w-1/2" />
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2">
            <Snowflake className="h-5 w-5 text-cyan-600" />
            Historial de Congelamientos
          </CardTitle>
          {freezes.length > 0 && (
            <Badge variant="outline" className="text-xs">
              {totalDaysFrozen} días en total
            </Badge>
          )}
        </div>
        
        {activeFreeze && (
          <div className="mt-2 p-3 rounded-lg bg-cyan-50 dark:bg-cyan-900/20 border border-cyan-200 dark:border-cyan-800">
            <div className="flex items-center gap-2">
              <Snowflake className="h-4 w-4 text-cyan-600 dark:text-cyan-400 animate-pulse" />
              <span className="text-sm font-medium text-cyan-700 dark:text-cyan-300">
                Membresía actualmente congelada
              </span>
            </div>
            <p className="text-xs text-cyan-600 dark:text-cyan-400 mt-1">
              Desde {formatDate(activeFreeze.start_date)}
              {activeFreeze.reason && ` • ${activeFreeze.reason}`}
            </p>
          </div>
        )}
      </CardHeader>
      <CardContent>
        {freezes.length === 0 ? (
          <div className="text-center py-6">
            <Snowflake className="h-10 w-10 mx-auto text-gray-300 dark:text-gray-600 mb-2" />
            <p className="text-gray-500 dark:text-gray-400 text-sm">
              No hay congelamientos registrados
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {freezes.map((freeze) => {
              const statusConfig = STATUS_CONFIG[freeze.status] || STATUS_CONFIG.completed;
              const StatusIcon = statusConfig.icon;
              const startDate = new Date(freeze.start_date);
              const endDate = freeze.end_date ? new Date(freeze.end_date) : null;

              return (
                <div 
                  key={freeze.id}
                  className={cn(
                    "p-3 rounded-lg border transition-colors",
                    freeze.status === 'active' 
                      ? "bg-cyan-50 dark:bg-cyan-900/20 border-cyan-200 dark:border-cyan-800"
                      : "bg-gray-50 dark:bg-gray-900/50 border-gray-200 dark:border-gray-700"
                  )}
                >
                  <div className="flex items-start gap-3">
                    <div className={cn(
                      "p-2 rounded-full",
                      freeze.status === 'active' 
                        ? "bg-cyan-100 dark:bg-cyan-900/30"
                        : "bg-gray-100 dark:bg-gray-800"
                    )}>
                      <StatusIcon className={cn(
                        "h-4 w-4",
                        freeze.status === 'active' 
                          ? "text-cyan-600 dark:text-cyan-400"
                          : "text-gray-600 dark:text-gray-400"
                      )} />
                    </div>
                    
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <Badge className={cn("text-xs", statusConfig.color)}>
                          {statusConfig.label}
                        </Badge>
                        {freeze.days_frozen && freeze.days_frozen > 0 && (
                          <span className="text-xs text-gray-500 dark:text-gray-400">
                            {freeze.days_frozen} días
                          </span>
                        )}
                      </div>
                      
                      <div className="mt-1 flex items-center gap-2 text-xs text-gray-600 dark:text-gray-400">
                        <Calendar className="h-3 w-3" />
                        <span>
                          {startDate.toLocaleDateString('es-CO')}
                          {endDate && ` → ${endDate.toLocaleDateString('es-CO')}`}
                        </span>
                      </div>

                      {freeze.reason && (
                        <p className="mt-1 text-sm text-gray-700 dark:text-gray-300">
                          {freeze.reason}
                        </p>
                      )}

                      {freeze.notes && (
                        <p className="mt-1 text-xs text-gray-500 dark:text-gray-400 italic">
                          {freeze.notes}
                        </p>
                      )}
                    </div>

                    <div className="text-right text-xs text-gray-500 dark:text-gray-400">
                      <p>{new Date(freeze.created_at).toLocaleDateString('es-CO')}</p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default MembershipFreezes;
