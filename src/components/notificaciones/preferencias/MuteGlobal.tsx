'use client';

import { Switch } from '@/components/ui/switch';
import { VolumeX, Volume2 } from 'lucide-react';
import { cn } from '@/utils/Utils';

interface MuteGlobalProps {
  isMutedAll: boolean;
  onToggle: (mute: boolean) => void;
  disabled: boolean;
}

export function MuteGlobal({ isMutedAll, onToggle, disabled }: MuteGlobalProps) {
  return (
    <div className={cn(
      'rounded-xl border-2 p-4 transition-all',
      isMutedAll
        ? 'border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-950/20'
        : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900',
    )}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          {isMutedAll ? (
            <div className="p-2 rounded-lg bg-red-100 dark:bg-red-900/40">
              <VolumeX className="h-5 w-5 text-red-600 dark:text-red-400" />
            </div>
          ) : (
            <div className="p-2 rounded-lg bg-green-100 dark:bg-green-900/40">
              <Volume2 className="h-5 w-5 text-green-600 dark:text-green-400" />
            </div>
          )}
          <div>
            <p className="text-sm font-semibold text-gray-900 dark:text-white">
              {isMutedAll ? 'Todas las notificaciones silenciadas' : 'Notificaciones activas'}
            </p>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              {isMutedAll
                ? 'No recibirás ninguna notificación en ningún canal'
                : 'Recibes notificaciones según la configuración de cada canal'}
            </p>
          </div>
        </div>
        <Switch
          checked={!isMutedAll}
          onCheckedChange={(v) => onToggle(!v)}
          disabled={disabled}
        />
      </div>
    </div>
  );
}
