'use client';

import { useState, useEffect, useCallback } from 'react';
import { useOrganization } from '@/lib/hooks/useOrganization';
import { useToast } from '@/components/ui/use-toast';
import { Settings } from 'lucide-react';
import { PageHeaderSkeleton, CardListSkeleton } from '@/components/common/PageSkeletons';
import parkingConfigService, { type ParkingConfig } from '@/lib/services/parkingConfigService';
import {
  ConfigHeader,
  ScheduleSection,
  TolerancesSection,
  PoliciesSection,
  LostTicketSection,
  MessagesSection,
  AlertsSection,
} from '@/components/parking/configuracion';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

export function ParkingConfigPanel() {
  const { organization, isLoading: orgLoading } = useOrganization();
  const { toast } = useToast();

  const [config, setConfig] = useState<ParkingConfig | null>(null);
  const [originalConfig, setOriginalConfig] = useState<ParkingConfig | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [showResetDialog, setShowResetDialog] = useState(false);

  const loadConfig = useCallback(async () => {
    if (!organization?.id) return;
    setIsLoading(true);
    try {
      const data = await parkingConfigService.getConfig(organization.id);
      setConfig(data);
      setOriginalConfig(JSON.parse(JSON.stringify(data)));
    } catch (error) {
      console.error('Error loading config:', error);
      toast({ title: 'Error', description: 'No se pudo cargar la configuración', variant: 'destructive' });
    } finally {
      setIsLoading(false);
    }
  }, [organization?.id, toast]);

  useEffect(() => {
    if (organization?.id && !orgLoading) loadConfig();
  }, [organization?.id, orgLoading, loadConfig]);

  const hasChanges = config && originalConfig
    ? JSON.stringify(config) !== JSON.stringify(originalConfig)
    : false;

  const handleSave = async () => {
    if (!organization?.id || !config) return;
    setIsSaving(true);
    try {
      await parkingConfigService.saveConfig(organization.id, config);
      setOriginalConfig(JSON.parse(JSON.stringify(config)));
      toast({ title: 'Configuración guardada', description: 'Los cambios se han guardado correctamente' });
    } catch (error) {
      console.error('Error saving config:', error);
      toast({ title: 'Error', description: 'No se pudo guardar la configuración', variant: 'destructive' });
    } finally {
      setIsSaving(false);
    }
  };

  const handleReset = async () => {
    if (!organization?.id) return;
    setIsSaving(true);
    try {
      const defaultConfig = await parkingConfigService.resetToDefaults(organization.id);
      setConfig(defaultConfig);
      setOriginalConfig(JSON.parse(JSON.stringify(defaultConfig)));
      toast({ title: 'Configuración restablecida', description: 'Se han restaurado los valores por defecto' });
    } catch (error) {
      console.error('Error resetting config:', error);
      toast({ title: 'Error', description: 'No se pudo restablecer la configuración', variant: 'destructive' });
    } finally {
      setIsSaving(false);
      setShowResetDialog(false);
    }
  };

  if (orgLoading || isLoading) {
    return (
      <div className="space-y-8">
        <PageHeaderSkeleton />
        <CardListSkeleton cards={4} columns="2" />
      </div>
    );
  }

  if (!config) {
    return (
      <div className="flex flex-col items-center justify-center h-96 text-center">
        <Settings className="h-12 w-12 text-gray-400 mb-4" />
        <p className="text-gray-500">No se pudo cargar la configuración del parqueadero.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <ConfigHeader
        onSave={handleSave}
        onReset={() => setShowResetDialog(true)}
        onRefresh={loadConfig}
        isSaving={isSaving}
        isLoading={isLoading}
        hasChanges={hasChanges}
      />

      {hasChanges && (
        <div className="p-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg">
          <p className="text-sm text-amber-700 dark:text-amber-400">
            Tienes cambios sin guardar. No olvides guardar antes de salir.
          </p>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="space-y-6">
          <ScheduleSection schedule={config.schedule} onChange={(schedule) => setConfig({ ...config, schedule })} />
          <TolerancesSection tolerances={config.tolerances} onChange={(tolerances) => setConfig({ ...config, tolerances })} />
          <PoliciesSection policies={config.policies} onChange={(policies) => setConfig({ ...config, policies })} />
        </div>
        <div className="space-y-6">
          <LostTicketSection lostTicket={config.lost_ticket} onChange={(lost_ticket) => setConfig({ ...config, lost_ticket })} />
          <MessagesSection messages={config.messages} onChange={(messages) => setConfig({ ...config, messages })} />
          <AlertsSection alerts={config.alerts} onChange={(alerts) => setConfig({ ...config, alerts })} />
        </div>
      </div>

      <AlertDialog open={showResetDialog} onOpenChange={setShowResetDialog}>
        <AlertDialogContent className="dark:bg-gray-800 dark:border-gray-700">
          <AlertDialogHeader>
            <AlertDialogTitle className="dark:text-white">¿Restablecer configuración?</AlertDialogTitle>
            <AlertDialogDescription className="dark:text-gray-400">
              Esta acción restaurará todos los valores a la configuración por defecto. Perderás cualquier personalización actual.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="dark:border-gray-600 dark:text-gray-300">Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleReset} className="bg-amber-600 hover:bg-amber-700">Restablecer</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
