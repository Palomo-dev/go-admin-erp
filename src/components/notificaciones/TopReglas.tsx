'use client';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Zap, ToggleLeft, ToggleRight } from 'lucide-react';
import type { AlertRule } from '@/lib/services/notificacionesDashboardService';

interface TopReglasProps {
  rules: AlertRule[];
  isLoading: boolean;
  onToggleRule: (ruleId: string, active: boolean) => void;
}

const severityColors: Record<string, string> = {
  critical: 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300',
  error: 'bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-300',
  warning: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/40 dark:text-yellow-300',
  info: 'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300',
};

export function TopReglas({ rules, isLoading, onToggleRule }: TopReglasProps) {
  if (isLoading) {
    return (
      <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-6">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Top Reglas</h2>
        <div className="space-y-3">
          {[1, 2, 3].map(i => (
            <div key={i} className="h-14 bg-gray-100 dark:bg-gray-800 rounded-lg animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-6">
      <div className="flex items-center gap-2 mb-4">
        <Zap className="h-5 w-5 text-blue-500" />
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Top Reglas</h2>
      </div>

      {rules.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-8 text-gray-400 dark:text-gray-500">
          <Zap className="h-10 w-10 mb-2" />
          <p className="text-sm">No hay reglas configuradas</p>
        </div>
      ) : (
        <div className="space-y-3 max-h-[350px] overflow-y-auto pr-1">
          {rules.map(rule => (
            <div
              key={rule.id}
              className="flex items-center gap-3 p-3 rounded-lg border border-gray-100 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors"
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="text-sm font-medium text-gray-900 dark:text-white truncate">
                    {rule.name}
                  </p>
                  <Badge className={severityColors[rule.severity] || severityColors.info}>
                    {rule.severity}
                  </Badge>
                  {!rule.active && (
                    <Badge variant="outline" className="text-xs text-gray-400">Inactiva</Badge>
                  )}
                </div>
                <div className="flex items-center gap-2 mt-1">
                  <Badge variant="outline" className="text-xs py-0 h-5">{rule.source_module}</Badge>
                  <span className="text-xs text-gray-500 dark:text-gray-400">
                    Canales: {rule.channels.join(', ') || 'ninguno'}
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <div className="text-right">
                  <p className="text-lg font-bold text-blue-600 dark:text-blue-400">
                    {rule.fire_count ?? 0}
                  </p>
                  <p className="text-xs text-gray-400">disparos</p>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => onToggleRule(rule.id, !rule.active)}
                  title={rule.active ? 'Desactivar regla' : 'Activar regla'}
                >
                  {rule.active ? (
                    <ToggleRight className="h-5 w-5 text-green-500" />
                  ) : (
                    <ToggleLeft className="h-5 w-5 text-gray-400" />
                  )}
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
