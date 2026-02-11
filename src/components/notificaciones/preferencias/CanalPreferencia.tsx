'use client';

import { useState } from 'react';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Bell, Mail, Smartphone, BellRing, MessageSquare, Webhook,
  VolumeX, Volume2, Clock, ChevronDown, ChevronUp, Loader2,
} from 'lucide-react';
import { cn } from '@/utils/Utils';
import type { UserNotificationPreference, PreferenceUpdate } from './types';
import { CHANNEL_META, NOTIFICATION_TYPES } from './types';

interface CanalPreferenciaProps {
  preference: UserNotificationPreference;
  onUpdate: (channel: string, updates: PreferenceUpdate) => Promise<boolean>;
}

const channelIcons: Record<string, typeof Bell> = {
  app: Bell,
  email: Mail,
  sms: Smartphone,
  push: BellRing,
  whatsapp: MessageSquare,
  webhook: Webhook,
};

const channelColors: Record<string, { bg: string; icon: string; border: string }> = {
  app: { bg: 'bg-blue-50 dark:bg-blue-950/30', icon: 'text-blue-600 dark:text-blue-400', border: 'border-blue-200 dark:border-blue-800' },
  email: { bg: 'bg-purple-50 dark:bg-purple-950/30', icon: 'text-purple-600 dark:text-purple-400', border: 'border-purple-200 dark:border-purple-800' },
  sms: { bg: 'bg-green-50 dark:bg-green-950/30', icon: 'text-green-600 dark:text-green-400', border: 'border-green-200 dark:border-green-800' },
  push: { bg: 'bg-orange-50 dark:bg-orange-950/30', icon: 'text-orange-600 dark:text-orange-400', border: 'border-orange-200 dark:border-orange-800' },
  whatsapp: { bg: 'bg-emerald-50 dark:bg-emerald-950/30', icon: 'text-emerald-600 dark:text-emerald-400', border: 'border-emerald-200 dark:border-emerald-800' },
  webhook: { bg: 'bg-gray-50 dark:bg-gray-950/30', icon: 'text-gray-600 dark:text-gray-400', border: 'border-gray-300 dark:border-gray-700' },
};

export function CanalPreferencia({ preference, onUpdate }: CanalPreferenciaProps) {
  const [expanded, setExpanded] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const meta = CHANNEL_META[preference.channel] || { label: preference.channel, description: '', icon: 'bell' };
  const Icon = channelIcons[preference.channel] || Bell;
  const colors = channelColors[preference.channel] || channelColors.app;

  const handleMuteToggle = async (mute: boolean) => {
    setIsSaving(true);
    await onUpdate(preference.channel, { mute });
    setIsSaving(false);
  };

  const handleTypeToggle = async (type: string) => {
    const current = preference.allowed_types || [];
    const updated = current.includes(type)
      ? current.filter((t) => t !== type)
      : [...current, type];
    setIsSaving(true);
    await onUpdate(preference.channel, { allowed_types: updated });
    setIsSaving(false);
  };

  const handleDndChange = async (field: 'dnd_start' | 'dnd_end', value: string) => {
    setIsSaving(true);
    await onUpdate(preference.channel, { [field]: value || null });
    setIsSaving(false);
  };

  const handleClearDnd = async () => {
    setIsSaving(true);
    await onUpdate(preference.channel, { dnd_start: null, dnd_end: null });
    setIsSaving(false);
  };

  const hasDnd = preference.dnd_start && preference.dnd_end;
  const typesCount = preference.allowed_types?.length || 0;

  return (
    <div className={cn(
      'rounded-xl border-2 transition-all',
      colors.bg, colors.border,
      preference.mute && 'opacity-60',
    )}>
      {/* Header */}
      <div className="p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className={cn('p-2 rounded-lg', colors.bg)}>
              <Icon className={cn('h-5 w-5', colors.icon)} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <p className="text-sm font-semibold text-gray-900 dark:text-white">{meta.label}</p>
                {preference.mute && (
                  <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-red-300 text-red-600 dark:border-red-700 dark:text-red-400">
                    <VolumeX className="h-3 w-3 mr-0.5" /> Mute
                  </Badge>
                )}
                {hasDnd && (
                  <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-amber-300 text-amber-600 dark:border-amber-700 dark:text-amber-400">
                    <Clock className="h-3 w-3 mr-0.5" /> DND
                  </Badge>
                )}
                {typesCount > 0 && (
                  <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-blue-300 text-blue-600 dark:border-blue-700 dark:text-blue-400">
                    {typesCount} tipos
                  </Badge>
                )}
              </div>
              <p className="text-xs text-gray-500 dark:text-gray-400">{meta.description}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {isSaving && <Loader2 className="h-3.5 w-3.5 animate-spin text-blue-500" />}
            <Switch
              checked={!preference.mute}
              onCheckedChange={(v) => handleMuteToggle(!v)}
            />
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setExpanded(!expanded)}
              className="h-7 w-7 p-0 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
            >
              {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            </Button>
          </div>
        </div>
      </div>

      {/* Expanded content */}
      {expanded && (
        <div className="px-4 pb-4 space-y-4 border-t border-gray-200 dark:border-gray-700 pt-3">
          {/* DND */}
          <div>
            <p className="text-xs font-medium text-gray-700 dark:text-gray-300 mb-2 flex items-center gap-1.5">
              <Clock className="h-3.5 w-3.5" />
              Horario No Molestar
            </p>
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-1.5">
                <label className="text-[10px] text-gray-500 dark:text-gray-400">Desde</label>
                <input
                  type="time"
                  value={preference.dnd_start || ''}
                  onChange={(e) => handleDndChange('dnd_start', e.target.value)}
                  className="rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-2 py-1 text-xs text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:outline-none"
                />
              </div>
              <span className="text-xs text-gray-400">—</span>
              <div className="flex items-center gap-1.5">
                <label className="text-[10px] text-gray-500 dark:text-gray-400">Hasta</label>
                <input
                  type="time"
                  value={preference.dnd_end || ''}
                  onChange={(e) => handleDndChange('dnd_end', e.target.value)}
                  className="rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-2 py-1 text-xs text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:outline-none"
                />
              </div>
              {hasDnd && (
                <Button variant="ghost" size="sm" onClick={handleClearDnd} className="h-6 px-2 text-[10px] text-red-500 hover:text-red-600">
                  Limpiar
                </Button>
              )}
            </div>
            <p className="text-[10px] text-gray-400 dark:text-gray-500 mt-1">
              No recibirás notificaciones de este canal durante ese horario.
            </p>
          </div>

          {/* Tipos permitidos */}
          <div>
            <p className="text-xs font-medium text-gray-700 dark:text-gray-300 mb-2">
              Tipos de notificación permitidos
            </p>
            <p className="text-[10px] text-gray-400 dark:text-gray-500 mb-2">
              Si no seleccionas ninguno, recibirás todos los tipos. Si seleccionas algunos, solo recibirás esos.
            </p>
            <div className="flex flex-wrap gap-1.5">
              {NOTIFICATION_TYPES.map((nt) => {
                const isSelected = preference.allowed_types?.includes(nt.value);
                return (
                  <button
                    key={nt.value}
                    onClick={() => handleTypeToggle(nt.value)}
                    className={cn(
                      'px-2.5 py-1 rounded-lg text-[11px] font-medium border transition-all',
                      isSelected
                        ? 'bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 border-blue-300 dark:border-blue-700'
                        : 'bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400 border-transparent hover:border-gray-300 dark:hover:border-gray-600',
                    )}
                  >
                    {nt.label}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
