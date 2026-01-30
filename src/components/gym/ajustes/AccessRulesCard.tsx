'use client';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Input } from '@/components/ui/input';
import { Shield } from 'lucide-react';
import { GymSettings } from '@/lib/services/gymSettingsService';

interface AccessRulesCardProps {
  settings: GymSettings['accessRules'];
  onChange: (key: keyof GymSettings['accessRules'], value: boolean | number) => void;
}

export function AccessRulesCard({ settings, onChange }: AccessRulesCardProps) {
  return (
    <Card className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700">
      <CardHeader>
        <div className="flex items-center gap-2">
          <Shield className="h-5 w-5 text-blue-600" />
          <CardTitle className="text-lg">Reglas de Acceso</CardTitle>
        </div>
        <CardDescription>
          Configura las políticas de acceso al gimnasio
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="space-y-0.5">
            <Label>Requerir membresía activa</Label>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Solo permite check-in a miembros con membresía vigente
            </p>
          </div>
          <Switch
            checked={settings.requireActiveMembreship}
            onCheckedChange={(checked) => onChange('requireActiveMembreship', checked)}
          />
        </div>

        <div className="flex items-center justify-between">
          <div className="space-y-0.5">
            <Label>Permitir acceso de invitados</Label>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Permite registro de invitados sin membresía
            </p>
          </div>
          <Switch
            checked={settings.allowGuestAccess}
            onCheckedChange={(checked) => onChange('allowGuestAccess', checked)}
          />
        </div>

        <div className="flex items-center justify-between">
          <div className="space-y-0.5">
            <Label>Bloquear miembros expirados</Label>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Impide el acceso a miembros con membresía vencida
            </p>
          </div>
          <Switch
            checked={settings.blockExpiredMembers}
            onCheckedChange={(checked) => onChange('blockExpiredMembers', checked)}
          />
        </div>

        <div className="flex items-center justify-between">
          <div className="space-y-0.5">
            <Label>Permitir múltiples check-ins por día</Label>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Permite que un miembro haga check-in más de una vez al día
            </p>
          </div>
          <Switch
            checked={settings.allowMultipleCheckinsPerDay}
            onCheckedChange={(checked) => onChange('allowMultipleCheckinsPerDay', checked)}
          />
        </div>

        <div className="flex items-center justify-between">
          <div className="space-y-0.5">
            <Label>Verificación con foto</Label>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Requiere verificar la foto del miembro en el check-in
            </p>
          </div>
          <Switch
            checked={settings.requirePhotoVerification}
            onCheckedChange={(checked) => onChange('requirePhotoVerification', checked)}
          />
        </div>

        <div className="flex items-center justify-between">
          <div className="space-y-0.5">
            <Label>Máximo check-ins diarios</Label>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Límite de check-ins por miembro al día
            </p>
          </div>
          <Input
            type="number"
            min={1}
            max={10}
            value={settings.maxDailyCheckins}
            onChange={(e) => onChange('maxDailyCheckins', parseInt(e.target.value) || 1)}
            className="w-20"
          />
        </div>
      </CardContent>
    </Card>
  );
}
