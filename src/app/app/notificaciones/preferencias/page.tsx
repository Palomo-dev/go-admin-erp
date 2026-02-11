'use client';

import { useState, useEffect, useCallback } from 'react';
import { useOrganization, getCurrentUserId } from '@/lib/hooks/useOrganization';
import { useToast } from '@/components/ui/use-toast';
import { Loader2, Settings2 } from 'lucide-react';
import {
  PreferenciasHeader,
  MuteGlobal,
  CanalPreferencia,
  PreferenciasService,
} from '@/components/notificaciones/preferencias';
import type {
  UserNotificationPreference,
  PreferenceUpdate,
} from '@/components/notificaciones/preferencias';

export default function PreferenciasPage() {
  const { organization } = useOrganization();
  const organizationId = organization?.id;
  const { toast } = useToast();

  const [userId, setUserId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [preferences, setPreferences] = useState<UserNotificationPreference[]>([]);

  useEffect(() => {
    getCurrentUserId().then((id) => setUserId(id));
  }, []);

  const loadData = useCallback(async () => {
    if (!userId) return;

    try {
      const data = await PreferenciasService.ensureAllChannels(userId);
      setPreferences(data);
    } catch (error) {
      console.error('Error cargando preferencias:', error);
      toast({ title: 'Error', description: 'No se pudieron cargar las preferencias.', variant: 'destructive' });
    } finally {
      setIsLoading(false);
    }
  }, [userId, toast]);

  useEffect(() => {
    if (userId) {
      setIsLoading(true);
      loadData();
    }
  }, [userId, loadData]);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await loadData();
    setIsRefreshing(false);
  };

  const handleUpdate = async (channel: string, updates: PreferenceUpdate): Promise<boolean> => {
    if (!userId) return false;

    const ok = await PreferenciasService.updatePreference(userId, channel, updates);
    if (ok) {
      setPreferences((prev) =>
        prev.map((p) =>
          p.channel === channel ? { ...p, ...updates, updated_at: new Date().toISOString() } : p
        )
      );
      return true;
    }
    toast({ title: 'Error', description: 'No se pudo actualizar.', variant: 'destructive' });
    return false;
  };

  const handleMuteAll = async (mute: boolean) => {
    if (!userId) return;

    const ok = await PreferenciasService.muteAll(userId, mute);
    if (ok) {
      setPreferences((prev) => prev.map((p) => ({ ...p, mute })));
      toast({
        title: mute ? 'Silenciado' : 'Activado',
        description: mute ? 'Todas las notificaciones silenciadas.' : 'Notificaciones reactivadas.',
      });
    } else {
      toast({ title: 'Error', description: 'No se pudo cambiar.', variant: 'destructive' });
    }
  };

  const handleReset = async () => {
    if (!userId) return;
    if (!confirm('¿Restablecer todas las preferencias a sus valores por defecto?')) return;

    const ok = await PreferenciasService.resetToDefaults(userId);
    if (ok) {
      toast({ title: 'Restablecido', description: 'Preferencias restablecidas.' });
      loadData();
    } else {
      toast({ title: 'Error', description: 'No se pudo restablecer.', variant: 'destructive' });
    }
  };

  const isMutedAll = preferences.length > 0 && preferences.every((p) => p.mute);

  if (!organizationId || !userId) {
    return (
      <div className="flex items-center justify-center h-[calc(100vh-4rem)]">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin text-blue-600 mx-auto mb-4" />
          <p className="text-gray-600 dark:text-gray-400">Cargando preferencias...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col bg-gray-50 dark:bg-gray-950">
      <PreferenciasHeader
        isLoading={isLoading}
        isRefreshing={isRefreshing}
        isMutedAll={isMutedAll}
        onRefresh={handleRefresh}
        onReset={handleReset}
      />

      <div className="flex-1 overflow-y-auto p-4 sm:p-6">
        {isLoading ? (
          <div className="space-y-4 max-w-2xl mx-auto">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="h-20 bg-gray-100 dark:bg-gray-800 rounded-xl animate-pulse" />
            ))}
          </div>
        ) : preferences.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-gray-400 dark:text-gray-500">
            <Settings2 className="h-12 w-12 mb-3" />
            <p className="text-base font-medium">No hay preferencias configuradas</p>
          </div>
        ) : (
          <div className="max-w-2xl mx-auto space-y-4">
            <MuteGlobal
              isMutedAll={isMutedAll}
              onToggle={handleMuteAll}
              disabled={isLoading}
            />

            <div className="pt-2">
              <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">
                Configuración por canal
              </h2>
              <div className="space-y-3">
                {preferences.map((pref) => (
                  <CanalPreferencia
                    key={pref.channel}
                    preference={pref}
                    onUpdate={handleUpdate}
                  />
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
