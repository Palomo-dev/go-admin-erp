'use client';

import React from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Plus, Minus, Coffee, Utensils, Wifi, Car, X } from 'lucide-react';

interface Extra {
  id: string;
  name: string;
  description?: string;
  price: number;
  quantity: number;
  icon?: string;
}

interface StepExtrasProps {
  extras: Extra[];
  onAddExtra: (extra: Omit<Extra, 'quantity'>) => void;
  onRemoveExtra: (id: string) => void;
  onUpdateQuantity: (id: string, quantity: number) => void;
  onNext: () => void;
  onBack: () => void;
  onSkip: () => void;
}

const COMMON_EXTRAS = [
  { id: 'breakfast', name: 'Desayuno', price: 15, icon: 'coffee', description: 'Desayuno continental' },
  { id: 'lunch', name: 'Almuerzo', price: 20, icon: 'utensils', description: 'Almuerzo buffet' },
  { id: 'dinner', name: 'Cena', price: 25, icon: 'utensils', description: 'Cena 3 tiempos' },
  { id: 'wifi', name: 'WiFi Premium', price: 10, icon: 'wifi', description: 'Internet de alta velocidad' },
  { id: 'parking', name: 'Parqueadero', price: 12, icon: 'car', description: 'Por noche' },
];

const iconMap: Record<string, React.ReactNode> = {
  coffee: <Coffee className="h-5 w-5" />,
  utensils: <Utensils className="h-5 w-5" />,
  wifi: <Wifi className="h-5 w-5" />,
  car: <Car className="h-5 w-5" />,
};

export function StepExtras({
  extras,
  onAddExtra,
  onRemoveExtra,
  onUpdateQuantity,
  onNext,
  onBack,
  onSkip,
}: StepExtrasProps) {
  const totalExtras = extras.reduce((sum, extra) => sum + extra.price * extra.quantity, 0);

  const handleAddExtra = (extraData: typeof COMMON_EXTRAS[0]) => {
    onAddExtra({
      id: extraData.id,
      name: extraData.name,
      description: extraData.description,
      price: extraData.price,
      icon: extraData.icon,
    });
  };

  const isExtraAdded = (id: string) => extras.some((e) => e.id === id);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-2">
          Extras y Servicios
        </h2>
        <p className="text-gray-500 dark:text-gray-400">
          Agrega servicios adicionales a la reserva (opcional)
        </p>
      </div>

      {/* Resumen de extras */}
      {extras.length > 0 && (
        <Card className="p-4 bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-gray-900 dark:text-gray-100">
              Servicios Agregados
            </h3>
            <Badge variant="default">
              ${totalExtras.toFixed(2)}
            </Badge>
          </div>

          <div className="space-y-2">
            {extras.map((extra) => (
              <div
                key={extra.id}
                className="flex items-center justify-between p-3 bg-white dark:bg-gray-800 rounded-lg"
              >
                <div className="flex items-center gap-3 flex-1">
                  <div className="w-8 h-8 rounded-lg bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center text-blue-600 dark:text-blue-400">
                    {iconMap[extra.icon || ''] || <Plus className="h-4 w-4" />}
                  </div>
                  <div className="flex-1">
                    <h4 className="font-medium text-gray-900 dark:text-gray-100">
                      {extra.name}
                    </h4>
                    <p className="text-sm text-gray-500 dark:text-gray-400">
                      ${extra.price} × {extra.quantity}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => onUpdateQuantity(extra.id, extra.quantity - 1)}
                      disabled={extra.quantity <= 1}
                    >
                      <Minus className="h-3 w-3" />
                    </Button>
                    <span className="w-8 text-center font-medium text-gray-900 dark:text-gray-100">
                      {extra.quantity}
                    </span>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => onUpdateQuantity(extra.id, extra.quantity + 1)}
                    >
                      <Plus className="h-3 w-3" />
                    </Button>
                  </div>
                  <span className="font-semibold text-gray-900 dark:text-gray-100 w-20 text-right">
                    ${(extra.price * extra.quantity).toFixed(2)}
                  </span>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => onRemoveExtra(extra.id)}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Servicios comunes */}
      <Card className="p-6">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">
          Servicios Disponibles
        </h3>

        <div className="grid sm:grid-cols-2 gap-3">
          {COMMON_EXTRAS.map((extra) => {
            const added = isExtraAdded(extra.id);

            return (
              <Card
                key={extra.id}
                className={`p-4 cursor-pointer transition-all ${
                  added
                    ? 'border-blue-600 bg-blue-50 dark:bg-blue-900/20'
                    : 'hover:border-gray-400 dark:hover:border-gray-500'
                }`}
                onClick={() => !added && handleAddExtra(extra)}
              >
                <div className="flex items-start gap-3">
                  <div
                    className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                      added
                        ? 'bg-blue-600 text-white'
                        : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300'
                    }`}
                  >
                    {iconMap[extra.icon || ''] || <Plus className="h-5 w-5" />}
                  </div>
                  <div className="flex-1">
                    <div className="flex items-start justify-between">
                      <div>
                        <h4 className="font-semibold text-gray-900 dark:text-gray-100">
                          {extra.name}
                        </h4>
                        <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                          {extra.description}
                        </p>
                      </div>
                      <span className="font-bold text-blue-600 dark:text-blue-400">
                        ${extra.price}
                      </span>
                    </div>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      </Card>

      {/* Botones de navegación */}
      <div className="flex justify-between pt-4">
        <Button variant="outline" onClick={onBack}>
          Atrás
        </Button>
        <div className="flex gap-2">
          <Button variant="outline" onClick={onSkip}>
            Omitir
          </Button>
          <Button onClick={onNext} size="lg">
            Continuar
          </Button>
        </div>
      </div>
    </div>
  );
}
