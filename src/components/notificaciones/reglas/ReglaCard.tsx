'use client';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  ShieldAlert, Edit, Trash2, Play, Power, PowerOff,
  Copy, Clock, Zap, Loader2, History,
} from 'lucide-react';
import { cn } from '@/utils/Utils';
import type { AlertRule } from './types';
import { SEVERITY_OPTIONS, SOURCE_MODULES } from './types';

interface ReglaCardProps {
  rule: AlertRule;
  isAdmin: boolean;
  onEdit: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
  onTest: () => void;
  onToggle: () => void;
  onViewAlerts: () => void;
  isToggling: boolean;
}

const severityColors: Record<string, { bg: string; border: string; icon: string }> = {
  info: {
    bg: 'bg-blue-50 dark:bg-blue-950/30',
    border: 'border-blue-200 dark:border-blue-800',
    icon: 'text-blue-600 dark:text-blue-400',
  },
  warning: {
    bg: 'bg-amber-50 dark:bg-amber-950/30',
    border: 'border-amber-200 dark:border-amber-800',
    icon: 'text-amber-600 dark:text-amber-400',
  },
  critical: {
    bg: 'bg-red-50 dark:bg-red-950/30',
    border: 'border-red-200 dark:border-red-800',
    icon: 'text-red-600 dark:text-red-400',
  },
};

function formatRelativeTime(dateStr: string | null | undefined): string {
  if (!dateStr) return 'Nunca';
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'Hace un momento';
  if (mins < 60) return `Hace ${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `Hace ${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `Hace ${days}d`;
  return new Date(dateStr).toLocaleDateString('es');
}

export function ReglaCard({
  rule, isAdmin, onEdit, onDuplicate, onDelete, onTest, onToggle, onViewAlerts, isToggling,
}: ReglaCardProps) {
  const colors = severityColors[rule.severity] || severityColors.info;
  const sevOption = SEVERITY_OPTIONS.find((s) => s.value === rule.severity);
  const moduleLabel = SOURCE_MODULES.find((m) => m.value === rule.source_module)?.label || rule.source_module;

  return (
    <div className={cn(
      'rounded-xl border-2 p-4 transition-all hover:shadow-md',
      colors.bg, colors.border,
      !rule.active && 'opacity-60',
    )}>
      {/* Header */}
      <div className="flex items-start justify-between gap-2 mb-3">
        <div className="flex items-center gap-2 min-w-0">
          <ShieldAlert className={cn('h-5 w-5 flex-shrink-0', colors.icon)} />
          <h3 className="text-sm font-semibold text-gray-900 dark:text-white truncate">
            {rule.name}
          </h3>
        </div>
        <div className="flex items-center gap-1 flex-shrink-0">
          <Badge className={cn('text-[10px] px-1.5 py-0', sevOption?.color)}>
            {sevOption?.label || rule.severity}
          </Badge>
          <Badge
            variant="outline"
            className={cn(
              'text-[10px] px-1.5 py-0',
              rule.active
                ? 'border-green-300 text-green-700 dark:border-green-700 dark:text-green-300'
                : 'border-gray-300 text-gray-500 dark:border-gray-600 dark:text-gray-400',
            )}
          >
            {rule.active ? 'Activa' : 'Inactiva'}
          </Badge>
        </div>
      </div>

      {/* Info */}
      <div className="space-y-2 mb-3">
        <div className="flex items-center gap-2 text-xs text-gray-600 dark:text-gray-400">
          <span className="font-medium">Módulo:</span>
          <Badge variant="outline" className="text-[10px] px-1.5 py-0">{moduleLabel}</Badge>
        </div>
        <div className="flex items-center gap-1 flex-wrap">
          <span className="text-xs font-medium text-gray-600 dark:text-gray-400">Canales:</span>
          {rule.channels.map((ch) => (
            <Badge key={ch} variant="secondary" className="text-[10px] px-1.5 py-0 bg-gray-100 dark:bg-gray-800">
              {ch}
            </Badge>
          ))}
        </div>
        <div className="text-xs text-gray-500 dark:text-gray-500 font-mono bg-gray-100 dark:bg-gray-800 rounded p-2 line-clamp-2 overflow-hidden">
          {rule.sql_condition}
        </div>
      </div>

      {/* Stats */}
      <div className="flex items-center gap-4 mb-3 text-xs text-gray-500 dark:text-gray-400">
        <div className="flex items-center gap-1">
          <Zap className="h-3 w-3" />
          <span>{rule.fire_count ?? 0} disparos</span>
        </div>
        <div className="flex items-center gap-1">
          <Clock className="h-3 w-3" />
          <span>{formatRelativeTime(rule.last_fired_at)}</span>
        </div>
      </div>

      {/* Actions */}
      {isAdmin && (
        <div className="flex items-center gap-1 pt-2 border-t border-gray-200 dark:border-gray-700">
          <Button variant="ghost" size="sm" onClick={onEdit} className="h-7 px-2 text-xs text-gray-600 dark:text-gray-400 hover:text-blue-600">
            <Edit className="h-3.5 w-3.5 mr-1" />
            Editar
          </Button>
          <Button variant="ghost" size="sm" onClick={onTest} className="h-7 px-2 text-xs text-gray-600 dark:text-gray-400 hover:text-green-600">
            <Play className="h-3.5 w-3.5 mr-1" />
            Probar
          </Button>
          <Button variant="ghost" size="sm" onClick={onViewAlerts} className="h-7 px-2 text-xs text-gray-600 dark:text-gray-400 hover:text-purple-600">
            <History className="h-3.5 w-3.5 mr-1" />
            Historial
          </Button>
          <Button variant="ghost" size="sm" onClick={onDuplicate} className="h-7 px-2 text-xs text-gray-600 dark:text-gray-400 hover:text-amber-600">
            <Copy className="h-3.5 w-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={onToggle}
            disabled={isToggling}
            className={cn('h-7 px-2 text-xs', rule.active ? 'text-amber-600 hover:text-amber-700' : 'text-green-600 hover:text-green-700')}
          >
            {isToggling ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : rule.active ? <PowerOff className="h-3.5 w-3.5" /> : <Power className="h-3.5 w-3.5" />}
          </Button>
          <Button variant="ghost" size="sm" onClick={onDelete} className="h-7 px-2 text-xs text-red-500 hover:text-red-600 ml-auto">
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      )}
    </div>
  );
}
