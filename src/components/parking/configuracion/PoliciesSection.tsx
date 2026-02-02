'use client';

import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Shield } from 'lucide-react';
import type { ParkingConfig } from '@/lib/services/parkingConfigService';

interface PoliciesSectionProps {
  policies: ParkingConfig['policies'];
  onChange: (policies: ParkingConfig['policies']) => void;
}

export function PoliciesSection({ policies, onChange }: PoliciesSectionProps) {
  const handleChange = (field: keyof ParkingConfig['policies'], value: boolean) => {
    onChange({
      ...policies,
      [field]: value,
    });
  };

  const policyItems = [
    {
      key: 'charge_on_entry' as const,
      label: 'Cobrar al entrar (prepago)',
      description: 'El cliente paga al momento de ingresar',
    },
    {
      key: 'charge_on_exit' as const,
      label: 'Cobrar al salir',
      description: 'El cliente paga al momento de retirarse',
    },
    {
      key: 'allow_partial_payment' as const,
      label: 'Permitir pago parcial',
      description: 'Acepta pagos parciales y registra saldo pendiente',
    },
    {
      key: 'require_plate_photo' as const,
      label: 'Requerir foto de placa',
      description: 'Captura imagen de la placa al ingresar',
    },
    {
      key: 'auto_calculate_rate' as const,
      label: 'Calcular tarifa automáticamente',
      description: 'El sistema calcula el monto según el tiempo',
    },
  ];

  return (
    <Card className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-lg text-gray-900 dark:text-white">
          <Shield className="h-5 w-5 text-blue-600 dark:text-blue-400" />
          Políticas de Cobro
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {policyItems.map((item) => (
          <div
            key={item.key}
            className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg"
          >
            <div>
              <Label className="text-gray-700 dark:text-gray-300">{item.label}</Label>
              <p className="text-xs text-gray-500 dark:text-gray-400">{item.description}</p>
            </div>
            <Switch
              checked={policies[item.key]}
              onCheckedChange={(checked) => handleChange(item.key, checked)}
            />
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

export default PoliciesSection;
