'use client';

import React from 'react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Edit, Trash2, Calendar, DollarSign } from 'lucide-react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import type { Rate } from '@/lib/services/ratesService';

interface RatesListProps {
  rates: Rate[];
  onEdit: (rate: Rate) => void;
  onDelete: (rateId: string) => void;
  onToggleActive: (rateId: string) => void;
}

export function RatesList({ rates, onEdit, onDelete, onToggleActive }: RatesListProps) {
  if (rates.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <DollarSign className="h-16 w-16 text-gray-400 dark:text-gray-600 mb-4" />
        <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-2">
          No hay tarifas configuradas
        </h3>
        <p className="text-gray-600 dark:text-gray-400 max-w-sm">
          Crea tu primera tarifa para comenzar a gestionar precios.
        </p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {rates.map((rate) => (
        <Card 
          key={rate.id} 
          className={`p-5 hover:shadow-md transition-shadow duration-200 ${
            !rate.is_active ? 'opacity-60 bg-gray-50 dark:bg-gray-900' : ''
          }`}
        >
          <div className="flex items-start justify-between mb-4">
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-1">
                <h3 className="font-semibold text-gray-900 dark:text-gray-100">
                  {rate.space_types?.name || 'Tipo de espacio'}
                </h3>
                <Badge 
                  className={rate.is_active 
                    ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400' 
                    : 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400'
                  }
                >
                  {rate.is_active ? 'Activa' : 'Inactiva'}
                </Badge>
              </div>
              <div className="flex items-center gap-2 mt-1">
                {rate.restrictions?.plan && (
                  <Badge className="bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400">
                    {rate.restrictions.plan}
                  </Badge>
                )}
                {rate.priority > 0 && (
                  <Badge className={`${
                    rate.priority >= 4 ? 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400' :
                    rate.priority >= 3 ? 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400' :
                    rate.priority >= 2 ? 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400' :
                    'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400'
                  }`}>
                    {rate.priority === 5 ? 'Máxima' : 
                     rate.priority === 4 ? 'Muy Alta' : 
                     rate.priority === 3 ? 'Alta' : 
                     rate.priority === 2 ? 'Media' : 'Baja'}
                  </Badge>
                )}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Switch
                checked={rate.is_active}
                onCheckedChange={() => onToggleActive(rate.id)}
                className="data-[state=checked]:bg-green-600"
              />
              <Button
                variant="ghost"
                size="icon"
                onClick={() => onEdit(rate)}
                className="h-8 w-8"
              >
                <Edit className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => onDelete(rate.id)}
                className="h-8 w-8 text-red-600 hover:text-red-700"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          </div>

          <div className="space-y-3">
            <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
              <Calendar className="h-4 w-4" />
              <span>
                {format(new Date(rate.date_from), 'dd MMM', { locale: es })} -{' '}
                {format(new Date(rate.date_to), 'dd MMM yyyy', { locale: es })}
              </span>
            </div>

            <div className="flex items-center justify-between pt-3 border-t border-gray-200 dark:border-gray-700">
              <span className="text-sm font-medium text-gray-600 dark:text-gray-400">
                Precio:
              </span>
              <span className={`text-2xl font-bold ${
                rate.is_active 
                  ? 'text-blue-600 dark:text-blue-400' 
                  : 'text-gray-400 dark:text-gray-500'
              }`}>
                ${rate.price.toLocaleString()}
              </span>
            </div>

            {rate.restrictions?.min_nights && (
              <div className="text-xs text-gray-500 dark:text-gray-400">
                Mín. {rate.restrictions.min_nights} noches
              </div>
            )}
          </div>
        </Card>
      ))}
    </div>
  );
}
