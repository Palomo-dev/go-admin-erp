'use client';

import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card } from '@/components/ui/card';
import { Calendar, Users, Bed, Home, Mountain, Tent, Building } from 'lucide-react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

interface StepDatesProps {
  checkin: string;
  checkout: string;
  occupantCount: number;
  selectedCategory: string | null;
  categories: any[];
  onCheckinChange: (date: string) => void;
  onCheckoutChange: (date: string) => void;
  onOccupantCountChange: (count: number) => void;
  onCategorySelect: (categoryCode: string) => void;
  onNext: () => void;
  onBack: () => void;
}

const categoryIcons: Record<string, React.ReactNode> = {
  room: <Bed className="h-6 w-6" />,
  suite: <Home className="h-6 w-6" />,
  cabin: <Mountain className="h-6 w-6" />,
  glamping: <Tent className="h-6 w-6" />,
  default: <Building className="h-6 w-6" />,
};

export function StepDates({
  checkin,
  checkout,
  occupantCount,
  selectedCategory,
  categories,
  onCheckinChange,
  onCheckoutChange,
  onOccupantCountChange,
  onCategorySelect,
  onNext,
  onBack,
}: StepDatesProps) {
  const [nights, setNights] = useState(0);

  useEffect(() => {
    if (checkin && checkout) {
      const checkinDate = new Date(checkin);
      const checkoutDate = new Date(checkout);
      const diffTime = checkoutDate.getTime() - checkinDate.getTime();
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
      setNights(diffDays > 0 ? diffDays : 0);
    }
  }, [checkin, checkout]);

  const isValid = checkin && checkout && selectedCategory && nights > 0;

  // Obtener fecha mínima (hoy)
  const today = new Date().toISOString().split('T')[0];
  
  // Obtener fecha mínima de checkout (1 día después del checkin)
  const minCheckout = checkin
    ? new Date(new Date(checkin).getTime() + 24 * 60 * 60 * 1000)
        .toISOString()
        .split('T')[0]
    : today;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-2">
          Fechas y Tipo de Espacio
        </h2>
        <p className="text-gray-500 dark:text-gray-400">
          Selecciona las fechas de estadía y el tipo de alojamiento
        </p>
      </div>

      {/* Fechas */}
      <Card className="p-6">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4 flex items-center gap-2">
          <Calendar className="h-5 w-5 text-blue-600" />
          Fechas de Estadía
        </h3>
        
        <div className="grid md:grid-cols-3 gap-4">
          <div>
            <Label htmlFor="checkin">Check-in *</Label>
            <Input
              id="checkin"
              type="date"
              value={checkin}
              min={today}
              onChange={(e) => onCheckinChange(e.target.value)}
              required
            />
          </div>

          <div>
            <Label htmlFor="checkout">Check-out *</Label>
            <Input
              id="checkout"
              type="date"
              value={checkout}
              min={minCheckout}
              onChange={(e) => onCheckoutChange(e.target.value)}
              required
            />
          </div>

          <div>
            <Label htmlFor="occupants">Ocupantes</Label>
            <div className="flex items-center gap-2">
              <Users className="h-5 w-5 text-gray-400" />
              <Input
                id="occupants"
                type="number"
                min="1"
                value={occupantCount}
                onChange={(e) => onOccupantCountChange(parseInt(e.target.value) || 1)}
              />
            </div>
          </div>
        </div>

        {nights > 0 && (
          <div className="mt-4 p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
            <p className="text-sm text-blue-900 dark:text-blue-100 font-medium">
              {nights} noche{nights !== 1 ? 's' : ''} de estadía
            </p>
          </div>
        )}
      </Card>

      {/* Categoría de espacio */}
      <Card className="p-6">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">
          Tipo de Alojamiento
        </h3>
        
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {categories.map((category) => {
            const isSelected = selectedCategory === category.code;
            const icon = categoryIcons[category.code] || categoryIcons.default;

            return (
              <Card
                key={category.code}
                className={`p-4 cursor-pointer transition-all ${
                  isSelected
                    ? 'border-blue-600 bg-blue-50 dark:bg-blue-900/20 dark:border-blue-400'
                    : 'hover:border-gray-400 dark:hover:border-gray-500'
                }`}
                onClick={() => onCategorySelect(category.code)}
              >
                <div className="flex items-start gap-3">
                  <div
                    className={`w-12 h-12 rounded-lg flex items-center justify-center ${
                      isSelected
                        ? 'bg-blue-600 text-white'
                        : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300'
                    }`}
                  >
                    {icon}
                  </div>
                  <div className="flex-1">
                    <h4 className="font-semibold text-gray-900 dark:text-gray-100">
                      {category.display_name}
                    </h4>
                    {category.settings?.max_nights && (
                      <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                        Máx: {category.settings.max_nights} noches
                      </p>
                    )}
                  </div>
                  {isSelected && (
                    <div className="w-6 h-6 rounded-full bg-blue-600 flex items-center justify-center">
                      <svg
                        className="w-4 h-4 text-white"
                        fill="none"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth="2"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                      >
                        <path d="M5 13l4 4L19 7" />
                      </svg>
                    </div>
                  )}
                </div>
              </Card>
            );
          })}
        </div>

        {categories.length === 0 && (
          <p className="text-center text-gray-500 dark:text-gray-400 py-8">
            No hay categorías de espacios disponibles
          </p>
        )}
      </Card>

      {/* Botones de navegación */}
      <div className="flex justify-between pt-4">
        <Button variant="outline" onClick={onBack}>
          Atrás
        </Button>
        <Button onClick={onNext} disabled={!isValid} size="lg">
          Continuar
        </Button>
      </div>
    </div>
  );
}
