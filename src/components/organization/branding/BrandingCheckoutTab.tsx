'use client';

import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Loader2, Save, ShoppingCart, Store, Bike, Truck } from 'lucide-react';
import { supabase } from '@/lib/supabase/config';
import { useOrganization } from '@/lib/hooks/useOrganization';
import { useToast } from '@/components/ui/use-toast';

interface CheckoutConfig {
  enable_shipping: boolean;
  available_delivery_types: string[];
  shipping_flat_rate: number;
  shipping_flat_rate_title: string;
  shipping_flat_rate_description: string;
  free_shipping_threshold: number;
}

const DEFAULT_CONFIG: CheckoutConfig = {
  enable_shipping: true,
  available_delivery_types: ['pickup', 'delivery_own', 'delivery_third_party'],
  shipping_flat_rate: 10000,
  shipping_flat_rate_title: 'Envío estándar',
  shipping_flat_rate_description: 'Entrega en 3-5 días hábiles',
  free_shipping_threshold: 100000,
};

export default function BrandingCheckoutTab() {
  const { organization } = useOrganization();
  const organizationId = organization?.id;
  const { toast } = useToast();

  const [config, setConfig] = useState<CheckoutConfig>(DEFAULT_CONFIG);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  const loadConfig = useCallback(async () => {
    if (!organizationId) return;
    setIsLoading(true);
    try {
      const { data } = await supabase
        .from('website_settings')
        .select('enable_shipping, shipping_flat_rate, shipping_flat_rate_title, shipping_flat_rate_description, free_shipping_threshold, available_delivery_types')
        .eq('organization_id', organizationId)
        .single();

      if (data) {
        setConfig({
          enable_shipping: (data as any).enable_shipping !== false,
          available_delivery_types: (data as any).available_delivery_types || DEFAULT_CONFIG.available_delivery_types,
          shipping_flat_rate: Number((data as any).shipping_flat_rate ?? DEFAULT_CONFIG.shipping_flat_rate),
          shipping_flat_rate_title: (data as any).shipping_flat_rate_title || DEFAULT_CONFIG.shipping_flat_rate_title,
          shipping_flat_rate_description: (data as any).shipping_flat_rate_description || DEFAULT_CONFIG.shipping_flat_rate_description,
          free_shipping_threshold: Number((data as any).free_shipping_threshold ?? DEFAULT_CONFIG.free_shipping_threshold),
        });
      }
    } catch (error) {
      console.error('Error loading checkout config:', error);
    } finally {
      setIsLoading(false);
    }
  }, [organizationId]);

  useEffect(() => {
    loadConfig();
  }, [loadConfig]);

  const saveConfig = async (newConfig: CheckoutConfig) => {
    if (!organizationId) return;
    setIsSaving(true);
    try {
      const { error } = await supabase
        .from('website_settings')
        .update({
          enable_shipping: newConfig.enable_shipping,
          available_delivery_types: newConfig.available_delivery_types,
          shipping_flat_rate: newConfig.shipping_flat_rate,
          shipping_flat_rate_title: newConfig.shipping_flat_rate_title,
          shipping_flat_rate_description: newConfig.shipping_flat_rate_description,
          free_shipping_threshold: newConfig.free_shipping_threshold,
        } as any)
        .eq('organization_id', organizationId);

      if (error) throw error;

      setConfig(newConfig);
      toast({ title: 'Configuración guardada', description: 'La configuración de checkout se actualizó correctamente.' });
    } catch (error) {
      console.error('Error saving checkout config:', error);
      toast({ title: 'Error', description: 'No se pudo guardar la configuración.', variant: 'destructive' });
    } finally {
      setIsSaving(false);
    }
  };

  const toggleDeliveryType = (type: string) => {
    const current = config.available_delivery_types;
    const updated = current.includes(type)
      ? current.filter(t => t !== type)
      : [...current, type];
    if (updated.length === 0) return;
    const newConfig = { ...config, available_delivery_types: updated };
    setConfig(newConfig);
    saveConfig(newConfig);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Tipos de entrega */}
      <Card className="dark:bg-gray-800 dark:border-gray-700">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 dark:text-white">
            <ShoppingCart className="h-5 w-5" />
            Tipos de entrega disponibles
          </CardTitle>
          <CardDescription className="dark:text-gray-400">
            Selecciona qué opciones de entrega verán tus clientes en el checkout de la página web.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="flex items-center justify-between p-4 border rounded-lg dark:border-gray-600">
              <div className="flex items-center gap-3">
                <Store className="h-5 w-5 text-green-600" />
                <div>
                  <Label className="cursor-pointer font-medium">Retiro en tienda</Label>
                  <p className="text-xs text-muted-foreground">El cliente recoge en el local</p>
                </div>
              </div>
              <Switch
                checked={config.available_delivery_types.includes('pickup')}
                onCheckedChange={() => toggleDeliveryType('pickup')}
              />
            </div>

            <div className="flex items-center justify-between p-4 border rounded-lg dark:border-gray-600">
              <div className="flex items-center gap-3">
                <Bike className="h-5 w-5 text-blue-600" />
                <div>
                  <Label className="cursor-pointer font-medium">Delivery propio</Label>
                  <p className="text-xs text-muted-foreground">Entrega con tu equipo</p>
                </div>
              </div>
              <Switch
                checked={config.available_delivery_types.includes('delivery_own')}
                onCheckedChange={() => toggleDeliveryType('delivery_own')}
              />
            </div>

            <div className="flex items-center justify-between p-4 border rounded-lg dark:border-gray-600">
              <div className="flex items-center gap-3">
                <Truck className="h-5 w-5 text-purple-600" />
                <div>
                  <Label className="cursor-pointer font-medium">Delivery tercero</Label>
                  <p className="text-xs text-muted-foreground">Transportador externo</p>
                </div>
              </div>
              <Switch
                checked={config.available_delivery_types.includes('delivery_third_party')}
                onCheckedChange={() => toggleDeliveryType('delivery_third_party')}
              />
            </div>
          </div>
          {isSaving && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-3 w-3 animate-spin" />
              Guardando...
            </div>
          )}
        </CardContent>
      </Card>

      {/* Configuración de envío por defecto */}
      <Card className="dark:bg-gray-800 dark:border-gray-700">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 dark:text-white">
            <Truck className="h-5 w-5" />
            Envío por defecto (tarifa plana)
          </CardTitle>
          <CardDescription className="dark:text-gray-400">
            Configuración de fallback cuando no hay tarifas dinámicas configuradas. Las tarifas individuales
            con &quot;Visible en web&quot; tienen prioridad sobre estos valores.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <Label>Habilitar envío</Label>
              <p className="text-xs text-muted-foreground">Activar cálculo de costo de envío en el checkout</p>
            </div>
            <Switch
              checked={config.enable_shipping}
              onCheckedChange={(checked) => {
                const newConfig = { ...config, enable_shipping: checked };
                setConfig(newConfig);
                saveConfig(newConfig);
              }}
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Título visible en checkout</Label>
              <Input
                value={config.shipping_flat_rate_title}
                onChange={(e) => setConfig({ ...config, shipping_flat_rate_title: e.target.value })}
                placeholder="Ej: Envío estándar"
                className="dark:bg-gray-700 dark:border-gray-600 dark:text-white"
              />
            </div>
            <div className="space-y-2">
              <Label>Descripción visible en checkout</Label>
              <Input
                value={config.shipping_flat_rate_description}
                onChange={(e) => setConfig({ ...config, shipping_flat_rate_description: e.target.value })}
                placeholder="Ej: Entrega en 3-5 días hábiles"
                className="dark:bg-gray-700 dark:border-gray-600 dark:text-white"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Tarifa plana de envío ($)</Label>
              <Input
                type="number"
                value={config.shipping_flat_rate}
                onChange={(e) => setConfig({ ...config, shipping_flat_rate: Number(e.target.value) })}
                className="dark:bg-gray-700 dark:border-gray-600 dark:text-white"
              />
              <p className="text-xs text-muted-foreground">Se usa cuando no hay tarifas dinámicas</p>
            </div>
            <div className="space-y-2">
              <Label>Envío gratis desde ($)</Label>
              <Input
                type="number"
                value={config.free_shipping_threshold}
                onChange={(e) => setConfig({ ...config, free_shipping_threshold: Number(e.target.value) })}
                className="dark:bg-gray-700 dark:border-gray-600 dark:text-white"
              />
              <p className="text-xs text-muted-foreground">0 = sin envío gratis automático</p>
            </div>
          </div>

          <div className="flex justify-end">
            <Button
              onClick={() => saveConfig(config)}
              disabled={isSaving}
              className="bg-blue-600 hover:bg-blue-700"
            >
              {isSaving ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Guardando...
                </>
              ) : (
                <>
                  <Save className="h-4 w-4 mr-2" />
                  Guardar cambios
                </>
              )}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
