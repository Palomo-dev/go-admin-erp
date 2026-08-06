'use client';

import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Plus, Minus, X, Loader2, Sparkles, Link2 } from 'lucide-react';
import spaceServicesService, { OrgServiceView } from '@/lib/services/spaceServicesService';

const iconMap: Record<string, React.ReactNode> = {
  sparkles: <Sparkles className="h-4 w-4" />,
  link: <Link2 className="h-4 w-4" />,
  plus: <Plus className="h-4 w-4" />,
};

interface Extra {
  id: string;
  name: string;
  description?: string;
  price: number;
  quantity: number;
  icon?: string;
  organization_service_id?: string | null;
}

interface StepExtrasProps {
  extras: Extra[];
  onAddExtra: (extra: Omit<Extra, 'quantity'>) => void;
  onRemoveExtra: (id: string) => void;
  onUpdateQuantity: (id: string, quantity: number) => void;
  onNext: () => void;
  onBack: () => void;
  onSkip: () => void;
  organizationId?: number;
}

export function StepExtras({
  extras,
  onAddExtra,
  onRemoveExtra,
  onUpdateQuantity,
  onNext,
  onBack,
  onSkip,
  organizationId,
}: StepExtrasProps) {
  const [availableServices, setAvailableServices] = useState<OrgServiceView[]>([]);
  const [isLoadingServices, setIsLoadingServices] = useState(false);

  const totalExtras = extras.reduce((sum, extra) => sum + extra.price * extra.quantity, 0);

  useEffect(() => {
    if (organizationId) {
      setIsLoadingServices(true);
      spaceServicesService
        .getActiveServicesForExtras(organizationId)
        .then((services) => setAvailableServices(services))
        .catch((err) => console.error('Error cargando servicios:', err))
        .finally(() => setIsLoadingServices(false));
    }
  }, [organizationId]);

  const handleAddService = (svc: OrgServiceView) => {
    onAddExtra({
      id: svc.org_service_id,
      name: svc.name,
      description: svc.linked_product_name ? `Vinculado: ${svc.linked_product_name}` : undefined,
      price: svc.price,
      icon: svc.icon || undefined,
      organization_service_id: svc.org_service_id,
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
                <div className="flex flex-wrap items-center gap-3 flex-1">
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
                  <div className="flex flex-wrap items-center gap-2">
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

      {/* Servicios de la organización */}
      <Card className="p-6">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">
          Servicios Disponibles
        </h3>

        {isLoadingServices ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-5 w-5 animate-spin text-blue-600 dark:text-blue-400" />
            <span className="ml-2 text-sm text-gray-500 dark:text-gray-400">Cargando servicios...</span>
          </div>
        ) : availableServices.length === 0 ? (
          <div className="text-center py-8 text-gray-500 dark:text-gray-400">
            <Sparkles className="h-8 w-8 mx-auto mb-2 opacity-40" />
            <p className="text-sm">No hay servicios activos configurados</p>
            <p className="text-xs mt-1">Configura servicios en PMS &gt; Servicios</p>
          </div>
        ) : (
          <div className="grid sm:grid-cols-2 gap-3">
            {availableServices.map((svc) => {
              const added = isExtraAdded(svc.org_service_id);

              return (
                <Card
                  key={svc.org_service_id}
                  className={`p-4 cursor-pointer transition-all ${
                    added
                      ? 'border-blue-600 bg-blue-50 dark:bg-blue-900/20'
                      : 'hover:border-gray-400 dark:hover:border-gray-500'
                  }`}
                  onClick={() => !added && handleAddService(svc)}
                >
                  <div className="flex flex-wrap items-start gap-3">
                    <div
                      className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                        added
                          ? 'bg-blue-600 text-white'
                          : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300'
                      }`}
                    >
                      <Plus className="h-5 w-5" />
                    </div>
                    <div className="flex-1">
                      <div className="flex items-start justify-between">
                        <div>
                          <h4 className="font-semibold text-gray-900 dark:text-gray-100">
                            {svc.name}
                          </h4>
                          <div className="flex items-center gap-1 mt-1">
                            {svc.linked_product_id && (
                              <Badge variant="outline" className="text-[9px] px-1 py-0 border-purple-300 dark:border-purple-700 text-purple-600 dark:text-purple-400 gap-0.5">
                                <Link2 className="h-2.5 w-2.5" />
                                POS
                              </Badge>
                            )}
                            {svc.is_custom && (
                              <Badge variant="outline" className="text-[9px] px-1 py-0 border-blue-300 dark:border-blue-700 text-blue-600 dark:text-blue-400">
                                personalizado
                              </Badge>
                            )}
                          </div>
                        </div>
                        <span className="font-bold text-blue-600 dark:text-blue-400">
                          {svc.price > 0 ? `$${svc.price.toFixed(2)}` : 'Cortesía'}
                        </span>
                      </div>
                    </div>
                  </div>
                </Card>
              );
            })}
          </div>
        )}
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
