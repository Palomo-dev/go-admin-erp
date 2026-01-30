'use client';

import { useState, useEffect, useCallback } from 'react';
import { toast } from 'sonner';
import { Loader2 } from 'lucide-react';
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
import {
  SettingsHeader,
  AccessRulesCard,
  ToleranceCard,
  CheckinMethodsCard,
  MessagesCard,
  ClassRulesCard,
  NotificationsCard,
} from '@/components/gym/ajustes';
import { useOrganization } from '@/lib/hooks/useOrganization';
import {
  GymSettings,
  getGymSettings,
  saveGymSettings,
  defaultGymSettings,
} from '@/lib/services/gymSettingsService';

export default function AjustesPage() {
  const { organization } = useOrganization();
  const [settings, setSettings] = useState<GymSettings>(defaultGymSettings);
  const [originalSettings, setOriginalSettings] = useState<GymSettings>(defaultGymSettings);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [showResetDialog, setShowResetDialog] = useState(false);

  const loadSettings = useCallback(async () => {
    if (!organization?.id) return;
    setIsLoading(true);
    try {
      const data = await getGymSettings(organization.id);
      setSettings(data);
      setOriginalSettings(data);
    } catch (error) {
      console.error('Error cargando configuración:', error);
      toast.error('Error al cargar la configuración');
    } finally {
      setIsLoading(false);
    }
  }, [organization?.id]);

  useEffect(() => {
    loadSettings();
  }, [loadSettings]);

  const hasChanges = JSON.stringify(settings) !== JSON.stringify(originalSettings);

  const handleSave = async () => {
    if (!organization?.id) return;
    setIsSaving(true);
    try {
      await saveGymSettings(organization.id, settings);
      setOriginalSettings(settings);
      toast.success('Configuración guardada correctamente');
    } catch (error) {
      console.error('Error guardando configuración:', error);
      toast.error('Error al guardar la configuración');
    } finally {
      setIsSaving(false);
    }
  };

  const handleReset = () => {
    setShowResetDialog(true);
  };

  const confirmReset = async () => {
    if (!organization?.id) return;
    setIsSaving(true);
    try {
      await saveGymSettings(organization.id, defaultGymSettings);
      setSettings(defaultGymSettings);
      setOriginalSettings(defaultGymSettings);
      toast.success('Configuración restablecida a valores por defecto');
    } catch (error) {
      console.error('Error restableciendo configuración:', error);
      toast.error('Error al restablecer la configuración');
    } finally {
      setIsSaving(false);
      setShowResetDialog(false);
    }
  };

  const updateAccessRules = (key: keyof GymSettings['accessRules'], value: boolean | number) => {
    setSettings((prev) => ({
      ...prev,
      accessRules: { ...prev.accessRules, [key]: value },
    }));
  };

  const updateTolerance = (key: keyof GymSettings['tolerance'], value: number) => {
    setSettings((prev) => ({
      ...prev,
      tolerance: { ...prev.tolerance, [key]: value },
    }));
  };

  const updateCheckinMethods = (key: keyof GymSettings['checkinMethods'], value: boolean) => {
    setSettings((prev) => ({
      ...prev,
      checkinMethods: { ...prev.checkinMethods, [key]: value },
    }));
  };

  const updateMessages = (key: keyof GymSettings['messages'], value: string) => {
    setSettings((prev) => ({
      ...prev,
      messages: { ...prev.messages, [key]: value },
    }));
  };

  const updateClassRules = (key: keyof GymSettings['classRules'], value: boolean | number) => {
    setSettings((prev) => ({
      ...prev,
      classRules: { ...prev.classRules, [key]: value },
    }));
  };

  const updateNotifications = (key: keyof GymSettings['notifications'], value: boolean | number) => {
    setSettings((prev) => ({
      ...prev,
      notifications: { ...prev.notifications, [key]: value },
    }));
  };

  if (isLoading) {
    return (
      <div className="p-6 flex justify-center items-center min-h-[400px] bg-gray-50 dark:bg-gray-900">
        <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6 bg-gray-50 dark:bg-gray-900 min-h-screen">
      <SettingsHeader
        onSave={handleSave}
        onReset={handleReset}
        onRefresh={loadSettings}
        isLoading={isLoading}
        isSaving={isSaving}
        hasChanges={hasChanges}
      />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <AccessRulesCard settings={settings.accessRules} onChange={updateAccessRules} />
        <ToleranceCard settings={settings.tolerance} onChange={updateTolerance} />
        <CheckinMethodsCard settings={settings.checkinMethods} onChange={updateCheckinMethods} />
        <ClassRulesCard settings={settings.classRules} onChange={updateClassRules} />
        <MessagesCard settings={settings.messages} onChange={updateMessages} />
        <NotificationsCard settings={settings.notifications} onChange={updateNotifications} />
      </div>

      <AlertDialog open={showResetDialog} onOpenChange={setShowResetDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Restablecer Configuración</AlertDialogTitle>
            <AlertDialogDescription>
              ¿Estás seguro de que deseas restablecer toda la configuración a los valores por defecto?
              Esta acción no se puede deshacer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmReset}
              className="bg-red-600 hover:bg-red-700"
            >
              Restablecer
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
