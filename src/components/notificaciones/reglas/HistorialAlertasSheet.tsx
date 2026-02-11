'use client';

import { useState, useEffect } from 'react';
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription,
} from '@/components/ui/sheet';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Loader2, AlertTriangle, Info, AlertCircle, ExternalLink, Clock } from 'lucide-react';
import { cn } from '@/utils/Utils';
import Link from 'next/link';
import type { AlertRule, RuleAlert } from './types';
import { ReglasService } from './ReglasService';

interface HistorialAlertasSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  rule: AlertRule | null;
  organizationId: number | undefined;
}

const severityIcon: Record<string, typeof Info> = {
  info: Info,
  warning: AlertTriangle,
  critical: AlertCircle,
};

const severityBadge: Record<string, string> = {
  info: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300',
  warning: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',
  critical: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300',
};

const statusBadge: Record<string, string> = {
  pending: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-300',
  delivered: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300',
  read: 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300',
  resolved: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400',
  ignored: 'bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-500',
};

function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleDateString('es', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export function HistorialAlertasSheet({
  open, onOpenChange, rule, organizationId,
}: HistorialAlertasSheetProps) {
  const [alerts, setAlerts] = useState<RuleAlert[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (open && rule && organizationId) {
      setIsLoading(true);
      ReglasService.getRuleAlerts(organizationId, rule.id, 30)
        .then(setAlerts)
        .finally(() => setIsLoading(false));
    } else {
      setAlerts([]);
    }
  }, [open, rule, organizationId]);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-md bg-white dark:bg-gray-900 overflow-y-auto">
        <SheetHeader className="pb-4 border-b border-gray-200 dark:border-gray-800">
          <SheetTitle className="text-gray-900 dark:text-white">
            Historial de Alertas
          </SheetTitle>
          <SheetDescription>
            {rule ? (
              <>Alertas generadas por <strong className="text-gray-700 dark:text-gray-300">{rule.name}</strong></>
            ) : 'Selecciona una regla'}
          </SheetDescription>
        </SheetHeader>

        <div className="mt-4 space-y-3">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-blue-500" />
            </div>
          ) : alerts.length === 0 ? (
            <div className="text-center py-12 text-gray-400 dark:text-gray-500">
              <Clock className="h-8 w-8 mx-auto mb-2" />
              <p className="text-sm">No se han generado alertas para esta regla</p>
            </div>
          ) : (
            <>
              <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">
                {alerts.length} alertas encontradas
              </p>
              {alerts.map((alert) => {
                const Icon = severityIcon[alert.severity] || Info;
                return (
                  <div
                    key={alert.id}
                    className="p-3 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50"
                  >
                    <div className="flex items-start gap-2">
                      <Icon className={cn('h-4 w-4 mt-0.5 flex-shrink-0',
                        alert.severity === 'critical' ? 'text-red-500' :
                        alert.severity === 'warning' ? 'text-amber-500' : 'text-blue-500'
                      )} />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-900 dark:text-white truncate">
                          {alert.title}
                        </p>
                        <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 line-clamp-2">
                          {alert.message}
                        </p>
                        <div className="flex items-center gap-2 mt-2">
                          <Badge className={cn('text-[10px] px-1.5 py-0', severityBadge[alert.severity])}>
                            {alert.severity}
                          </Badge>
                          <Badge className={cn('text-[10px] px-1.5 py-0', statusBadge[alert.status])}>
                            {alert.status}
                          </Badge>
                          <span className="text-[10px] text-gray-400">{formatDate(alert.created_at)}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}

              <Link href="/app/notificaciones/alertas" className="block mt-4">
                <Button variant="outline" size="sm" className="w-full border-gray-300 dark:border-gray-700">
                  <ExternalLink className="h-3.5 w-3.5 mr-2" />
                  Ver todas las alertas
                </Button>
              </Link>
            </>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
