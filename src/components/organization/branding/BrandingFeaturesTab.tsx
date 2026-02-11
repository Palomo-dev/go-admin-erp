'use client';

import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Loader2, Save, Zap, Calendar, ShoppingCart, Clock, CreditCard, Ticket, ParkingCircle, AlertTriangle } from 'lucide-react';
import { WebsiteSettings } from '@/lib/services/websiteSettingsService';

interface BrandingFeaturesTabProps {
  settings: WebsiteSettings;
  onSave: (data: Partial<WebsiteSettings>) => Promise<void>;
  isSaving: boolean;
  activeModules?: string[];
}

const FEATURES = [
  { 
    key: 'enable_reservations', 
    label: 'Reservaciones', 
    description: 'Permite a los clientes hacer reservaciones online', 
    icon: Calendar,
    module: 'pms_hotel',
    color: 'bg-purple-100 text-purple-600 dark:bg-purple-900/30 dark:text-purple-400'
  },
  { 
    key: 'enable_online_ordering', 
    label: 'Pedidos Online', 
    description: 'Sistema de pedidos para delivery o pickup', 
    icon: ShoppingCart,
    module: 'pos',
    color: 'bg-green-100 text-green-600 dark:bg-green-900/30 dark:text-green-400'
  },
  { 
    key: 'enable_appointments', 
    label: 'Citas', 
    description: 'Agenda de citas para servicios', 
    icon: Clock,
    module: 'calendar',
    color: 'bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400'
  },
  { 
    key: 'enable_memberships', 
    label: 'Membresías', 
    description: 'Sistema de membresías y suscripciones', 
    icon: CreditCard,
    module: 'gym',
    color: 'bg-orange-100 text-orange-600 dark:bg-orange-900/30 dark:text-orange-400'
  },
  { 
    key: 'enable_tickets', 
    label: 'Tickets', 
    description: 'Venta de entradas y boletos', 
    icon: Ticket,
    module: 'pos',
    color: 'bg-pink-100 text-pink-600 dark:bg-pink-900/30 dark:text-pink-400'
  },
  { 
    key: 'enable_parking_booking', 
    label: 'Reserva de Parking', 
    description: 'Reservación de espacios de estacionamiento', 
    icon: ParkingCircle,
    module: 'parking',
    color: 'bg-cyan-100 text-cyan-600 dark:bg-cyan-900/30 dark:text-cyan-400'
  },
];

export default function BrandingFeaturesTab({ settings, onSave, isSaving, activeModules = [] }: BrandingFeaturesTabProps) {
  const [formData, setFormData] = useState({
    enable_reservations: settings.enable_reservations ?? false,
    enable_online_ordering: settings.enable_online_ordering ?? false,
    enable_appointments: settings.enable_appointments ?? false,
    enable_memberships: settings.enable_memberships ?? false,
    enable_tickets: settings.enable_tickets ?? false,
    enable_parking_booking: settings.enable_parking_booking ?? false,
  });

  const handleToggle = (key: string, value: boolean) => {
    setFormData({ ...formData, [key]: value });
  };

  const handleSave = async () => {
    await onSave(formData);
  };

  const enabledCount = Object.values(formData).filter(Boolean).length;

  return (
    <div className="space-y-6">
      <Card className="dark:bg-gray-800 dark:border-gray-700">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 dark:text-white">
            <Zap className="h-5 w-5" />
            Funcionalidades del Sitio
          </CardTitle>
          <CardDescription className="dark:text-gray-400">
            Habilita funcionalidades interactivas para tus clientes ({enabledCount} de {FEATURES.length} activas)
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {FEATURES.map((feature) => {
              const Icon = feature.icon;
              const isEnabled = formData[feature.key as keyof typeof formData];
              const hasModule = activeModules.length === 0 || activeModules.includes(feature.module);
              
              return (
                <div
                  key={feature.key}
                  className={`relative flex items-start justify-between p-4 rounded-lg border transition-colors ${
                    isEnabled 
                      ? 'border-blue-200 bg-blue-50 dark:border-blue-800 dark:bg-blue-900/20' 
                      : 'border-gray-200 dark:border-gray-700'
                  } ${!hasModule ? 'opacity-60' : ''}`}
                >
                  <div className="flex items-start gap-3">
                    <div className={`p-2 rounded-lg ${feature.color}`}>
                      <Icon className="h-5 w-5" />
                    </div>
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <Label className="font-medium dark:text-white">{feature.label}</Label>
                        {!hasModule && (
                          <Badge variant="outline" className="text-xs">
                            Módulo requerido
                          </Badge>
                        )}
                      </div>
                      <p className="text-xs text-gray-500 dark:text-gray-400">{feature.description}</p>
                    </div>
                  </div>
                  <Switch
                    checked={isEnabled}
                    onCheckedChange={(checked) => handleToggle(feature.key, checked)}
                    disabled={!hasModule}
                  />
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Advertencia */}
      <Card className="border-yellow-200 bg-yellow-50 dark:border-yellow-800 dark:bg-yellow-900/20">
        <CardContent className="flex items-start gap-3 pt-6">
          <AlertTriangle className="h-5 w-5 text-yellow-600 dark:text-yellow-400 flex-shrink-0 mt-0.5" />
          <div>
            <h4 className="font-medium text-yellow-800 dark:text-yellow-300">Importante</h4>
            <p className="text-sm text-yellow-700 dark:text-yellow-400 mt-1">
              Las funcionalidades habilitadas aparecerán en tu sitio web público solo si tienes los módulos correspondientes activos en tu plan. 
              Asegúrate de configurar correctamente cada funcionalidad desde su módulo respectivo.
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Resumen */}
      <Card className="dark:bg-gray-800 dark:border-gray-700">
        <CardHeader>
          <CardTitle className="dark:text-white">Resumen de Funcionalidades</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2">
            {FEATURES.map((feature) => {
              const isEnabled = formData[feature.key as keyof typeof formData];
              if (!isEnabled) return null;
              
              const Icon = feature.icon;
              return (
                <Badge key={feature.key} variant="secondary" className="flex items-center gap-1 py-1">
                  <Icon className="h-3 w-3" />
                  {feature.label}
                </Badge>
              );
            })}
            {enabledCount === 0 && (
              <p className="text-gray-500 dark:text-gray-400">No hay funcionalidades activas</p>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Botón Guardar */}
      <div className="flex justify-end">
        <Button onClick={handleSave} disabled={isSaving} className="bg-blue-600 hover:bg-blue-700">
          {isSaving ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              Guardando...
            </>
          ) : (
            <>
              <Save className="h-4 w-4 mr-2" />
              Guardar Cambios
            </>
          )}
        </Button>
      </div>
    </div>
  );
}
