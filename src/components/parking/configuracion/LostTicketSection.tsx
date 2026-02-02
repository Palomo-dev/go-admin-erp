'use client';

import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Ticket } from 'lucide-react';
import type { ParkingConfig } from '@/lib/services/parkingConfigService';

interface LostTicketSectionProps {
  lostTicket: ParkingConfig['lost_ticket'];
  onChange: (lostTicket: ParkingConfig['lost_ticket']) => void;
}

export function LostTicketSection({ lostTicket, onChange }: LostTicketSectionProps) {
  const handleChange = (field: keyof ParkingConfig['lost_ticket'], value: number | boolean) => {
    onChange({
      ...lostTicket,
      [field]: value,
    });
  };

  return (
    <Card className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-lg text-gray-900 dark:text-white">
          <Ticket className="h-5 w-5 text-blue-600 dark:text-blue-400" />
          Ticket Perdido
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center justify-between p-3 bg-amber-50 dark:bg-amber-900/20 rounded-lg border border-amber-200 dark:border-amber-800">
          <div>
            <Label className="text-amber-800 dark:text-amber-300">
              Habilitar política de ticket perdido
            </Label>
            <p className="text-xs text-amber-600 dark:text-amber-400">
              Permite cobrar tarifa especial cuando no se presenta ticket
            </p>
          </div>
          <Switch
            checked={lostTicket.enabled}
            onCheckedChange={(checked) => handleChange('enabled', checked)}
          />
        </div>

        {lostTicket.enabled && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
            <div className="space-y-2">
              <Label className="text-gray-700 dark:text-gray-300">Tarifa fija ($)</Label>
              <Input
                type="number"
                min={0}
                value={lostTicket.fixed_fee}
                onChange={(e) => handleChange('fixed_fee', parseInt(e.target.value) || 0)}
                className="dark:bg-gray-700 dark:border-gray-600"
              />
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Monto fijo a cobrar por ticket perdido
              </p>
            </div>

            <div className="space-y-2">
              <Label className="text-gray-700 dark:text-gray-300">
                Máximo horas a cobrar
              </Label>
              <Input
                type="number"
                min={1}
                max={48}
                value={lostTicket.max_hours_fee}
                onChange={(e) => handleChange('max_hours_fee', parseInt(e.target.value) || 12)}
                className="dark:bg-gray-700 dark:border-gray-600"
              />
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Alternativa: cobrar tarifa normal por este máximo de horas
              </p>
            </div>

            <div className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
              <div>
                <Label className="text-gray-700 dark:text-gray-300">
                  Requerir identificación
                </Label>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  Solicitar documento de identidad
                </p>
              </div>
              <Switch
                checked={lostTicket.require_id}
                onCheckedChange={(checked) => handleChange('require_id', checked)}
              />
            </div>

            <div className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
              <div>
                <Label className="text-gray-700 dark:text-gray-300">
                  Requerir prueba del vehículo
                </Label>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  Solicitar documentos del vehículo
                </p>
              </div>
              <Switch
                checked={lostTicket.require_vehicle_proof}
                onCheckedChange={(checked) => handleChange('require_vehicle_proof', checked)}
              />
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default LostTicketSection;
