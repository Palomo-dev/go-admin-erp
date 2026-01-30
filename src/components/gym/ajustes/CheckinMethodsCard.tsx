'use client';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { QrCode, Search, Fingerprint, CreditCard, ScanFace } from 'lucide-react';
import { GymSettings } from '@/lib/services/gymSettingsService';

interface CheckinMethodsCardProps {
  settings: GymSettings['checkinMethods'];
  onChange: (key: keyof GymSettings['checkinMethods'], value: boolean) => void;
}

export function CheckinMethodsCard({ settings, onChange }: CheckinMethodsCardProps) {
  const methods = [
    {
      key: 'qrCode' as const,
      label: 'Código QR',
      description: 'Escanear código QR del miembro',
      icon: QrCode,
    },
    {
      key: 'manualSearch' as const,
      label: 'Búsqueda manual',
      description: 'Buscar miembro por nombre o documento',
      icon: Search,
    },
    {
      key: 'fingerprint' as const,
      label: 'Huella digital',
      description: 'Verificación biométrica con huella',
      icon: Fingerprint,
    },
    {
      key: 'cardReader' as const,
      label: 'Lector de tarjetas',
      description: 'Tarjeta RFID o magnética',
      icon: CreditCard,
    },
    {
      key: 'faceRecognition' as const,
      label: 'Reconocimiento facial',
      description: 'Verificación biométrica facial',
      icon: ScanFace,
    },
  ];

  return (
    <Card className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700">
      <CardHeader>
        <div className="flex items-center gap-2">
          <QrCode className="h-5 w-5 text-blue-600" />
          <CardTitle className="text-lg">Métodos de Check-in</CardTitle>
        </div>
        <CardDescription>
          Habilita los métodos de check-in disponibles en tu gimnasio
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {methods.map((method) => {
          const Icon = method.icon;
          return (
            <div key={method.key} className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
                  <Icon className="h-4 w-4 text-blue-600" />
                </div>
                <div className="space-y-0.5">
                  <Label>{method.label}</Label>
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    {method.description}
                  </p>
                </div>
              </div>
              <Switch
                checked={settings[method.key]}
                onCheckedChange={(checked) => onChange(method.key, checked)}
              />
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
