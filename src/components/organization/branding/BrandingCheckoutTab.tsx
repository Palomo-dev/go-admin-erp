'use client';

import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Loader2, Save, ShoppingCart, Store, Bike, Truck, ShieldCheck, Trash2, Plus } from 'lucide-react';
import { supabase } from '@/lib/supabase/config';
import { useOrganization } from '@/lib/hooks/useOrganization';
import { useToast } from '@/components/ui/use-toast';

interface TrustBadge {
  icon: string;
  text: string;
}

interface CheckoutConfig {
  checkout_mode: 'steps' | 'one_page';
  enable_shipping: boolean;
  available_delivery_types: string[];
  shipping_flat_rate: number;
  shipping_flat_rate_title: string;
  shipping_flat_rate_description: string;
  free_shipping_threshold: number;
  checkout_show_trust_badges: boolean;
  checkout_trust_badges: TrustBadge[];
  checkout_show_payment_logos: boolean;
}

const DEFAULT_TRUST_BADGES: TrustBadge[] = [
  { icon: '🔒', text: 'Compra segura' },
  { icon: '✅', text: 'Devolución garantizada' },
  { icon: '🚚', text: 'Envío rastreado' },
];

const DEFAULT_CONFIG: CheckoutConfig = {
  checkout_mode: 'steps',
  enable_shipping: true,
  available_delivery_types: ['pickup', 'delivery_own', 'delivery_third_party'],
  shipping_flat_rate: 10000,
  shipping_flat_rate_title: 'Envío estándar',
  shipping_flat_rate_description: 'Entrega en 3-5 días hábiles',
  free_shipping_threshold: 100000,
  checkout_show_trust_badges: true,
  checkout_trust_badges: DEFAULT_TRUST_BADGES,
  checkout_show_payment_logos: true,
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
        .select('checkout_mode, enable_shipping, shipping_flat_rate, shipping_flat_rate_title, shipping_flat_rate_description, free_shipping_threshold, available_delivery_types, checkout_show_trust_badges, checkout_trust_badges, checkout_show_payment_logos')
        .eq('organization_id', organizationId)
        .single();

      if (data) {
        const d = data as any;
        setConfig({
          checkout_mode: d.checkout_mode || DEFAULT_CONFIG.checkout_mode,
          enable_shipping: d.enable_shipping !== false,
          available_delivery_types: d.available_delivery_types || DEFAULT_CONFIG.available_delivery_types,
          shipping_flat_rate: Number(d.shipping_flat_rate ?? DEFAULT_CONFIG.shipping_flat_rate),
          shipping_flat_rate_title: d.shipping_flat_rate_title || DEFAULT_CONFIG.shipping_flat_rate_title,
          shipping_flat_rate_description: d.shipping_flat_rate_description || DEFAULT_CONFIG.shipping_flat_rate_description,
          free_shipping_threshold: Number(d.free_shipping_threshold ?? DEFAULT_CONFIG.free_shipping_threshold),
          checkout_show_trust_badges: d.checkout_show_trust_badges ?? DEFAULT_CONFIG.checkout_show_trust_badges,
          checkout_trust_badges: d.checkout_trust_badges || DEFAULT_CONFIG.checkout_trust_badges,
          checkout_show_payment_logos: d.checkout_show_payment_logos ?? DEFAULT_CONFIG.checkout_show_payment_logos,
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
          checkout_mode: newConfig.checkout_mode,
          enable_shipping: newConfig.enable_shipping,
          available_delivery_types: newConfig.available_delivery_types,
          shipping_flat_rate: newConfig.shipping_flat_rate,
          shipping_flat_rate_title: newConfig.shipping_flat_rate_title,
          shipping_flat_rate_description: newConfig.shipping_flat_rate_description,
          free_shipping_threshold: newConfig.free_shipping_threshold,
          checkout_show_trust_badges: newConfig.checkout_show_trust_badges,
          checkout_trust_badges: newConfig.checkout_trust_badges,
          checkout_show_payment_logos: newConfig.checkout_show_payment_logos,
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
      {/* Modo de checkout */}
      <Card className="dark:bg-gray-800 dark:border-gray-700">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 dark:text-white">
            <ShoppingCart className="h-5 w-5" />
            Modo de checkout
          </CardTitle>
          <CardDescription className="dark:text-gray-400">
            Elige cómo se muestra el proceso de pago a tus clientes.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <button
              type="button"
              onClick={() => {
                const newConfig = { ...config, checkout_mode: 'steps' as const };
                setConfig(newConfig);
                saveConfig(newConfig);
              }}
              className={`p-4 rounded-lg border-2 text-left transition-colors ${
                config.checkout_mode === 'steps'
                  ? 'border-blue-500 bg-blue-50 dark:bg-blue-950/20 dark:border-blue-400'
                  : 'border-gray-200 dark:border-gray-600 hover:border-gray-300'
              }`}
            >
              <div className="flex items-center gap-3 mb-2">
                <div className="flex items-center gap-1">
                  <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${config.checkout_mode === 'steps' ? 'bg-blue-500 text-white' : 'bg-gray-200 text-gray-500'}`}>1</div>
                  <div className={`w-4 h-0.5 ${config.checkout_mode === 'steps' ? 'bg-blue-500' : 'bg-gray-200'}`} />
                  <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${config.checkout_mode === 'steps' ? 'bg-blue-500 text-white' : 'bg-gray-200 text-gray-500'}`}>2</div>
                  <div className={`w-4 h-0.5 ${config.checkout_mode === 'steps' ? 'bg-blue-500' : 'bg-gray-200'}`} />
                  <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${config.checkout_mode === 'steps' ? 'bg-blue-500 text-white' : 'bg-gray-200 text-gray-500'}`}>3</div>
                </div>
              </div>
              <p className="font-medium dark:text-white">3 pasos</p>
              <p className="text-xs text-muted-foreground mt-1">Carrito → Datos → Pago. Guía paso a paso tradicional.</p>
            </button>

            <button
              type="button"
              onClick={() => {
                const newConfig = { ...config, checkout_mode: 'one_page' as const };
                setConfig(newConfig);
                saveConfig(newConfig);
              }}
              className={`p-4 rounded-lg border-2 text-left transition-colors ${
                config.checkout_mode === 'one_page'
                  ? 'border-blue-500 bg-blue-50 dark:bg-blue-950/20 dark:border-blue-400'
                  : 'border-gray-200 dark:border-gray-600 hover:border-gray-300'
              }`}
            >
              <div className="flex items-center gap-3 mb-2">
                <div className={`w-full h-6 rounded flex items-center justify-center text-xs font-bold ${config.checkout_mode === 'one_page' ? 'bg-blue-500 text-white' : 'bg-gray-200 text-gray-500'}`}>
                  Todo en 1
                </div>
              </div>
              <p className="font-medium dark:text-white">1 página</p>
              <p className="text-xs text-muted-foreground mt-1">Todo visible en una sola vista. Menos fricción, más conversiones.</p>
            </button>
          </div>
        </CardContent>
      </Card>

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

      {/* Indicadores de confianza */}
      <Card className="dark:bg-gray-800 dark:border-gray-700">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 dark:text-white">
            <ShieldCheck className="h-5 w-5" />
            Indicadores de confianza
          </CardTitle>
          <CardDescription className="dark:text-gray-400">
            Badges de seguridad y confianza visibles en el checkout.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <Label>Mostrar badges de confianza</Label>
              <p className="text-xs text-muted-foreground">Ej: &quot;🔒 Compra segura&quot;, &quot;✅ Devolución garantizada&quot;</p>
            </div>
            <Switch
              checked={config.checkout_show_trust_badges}
              onCheckedChange={(checked) => {
                const newConfig = { ...config, checkout_show_trust_badges: checked };
                setConfig(newConfig);
                saveConfig(newConfig);
              }}
            />
          </div>

          {config.checkout_show_trust_badges && (
            <div className="space-y-3 pt-2 border-t dark:border-gray-700">
              {config.checkout_trust_badges.map((badge, idx) => (
                <div key={idx} className="flex items-center gap-2">
                  <Input
                    value={badge.icon}
                    onChange={(e) => {
                      const badges = [...config.checkout_trust_badges];
                      badges[idx] = { ...badges[idx], icon: e.target.value };
                      setConfig({ ...config, checkout_trust_badges: badges });
                    }}
                    className="w-16 text-center dark:bg-gray-700 dark:border-gray-600"
                    placeholder="🔒"
                  />
                  <Input
                    value={badge.text}
                    onChange={(e) => {
                      const badges = [...config.checkout_trust_badges];
                      badges[idx] = { ...badges[idx], text: e.target.value };
                      setConfig({ ...config, checkout_trust_badges: badges });
                    }}
                    className="flex-1 dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                    placeholder="Texto del badge"
                  />
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      const badges = config.checkout_trust_badges.filter((_, i) => i !== idx);
                      if (badges.length === 0) return;
                      const newConfig = { ...config, checkout_trust_badges: badges };
                      setConfig(newConfig);
                      saveConfig(newConfig);
                    }}
                    className="text-red-500 hover:text-red-700"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    const badges = [...config.checkout_trust_badges, { icon: '⭐', text: 'Nuevo badge' }];
                    setConfig({ ...config, checkout_trust_badges: badges });
                  }}
                >
                  <Plus className="h-4 w-4 mr-1" />
                  Agregar badge
                </Button>
                <Button
                  size="sm"
                  onClick={() => saveConfig(config)}
                  disabled={isSaving}
                  className="bg-blue-600 hover:bg-blue-700"
                >
                  <Save className="h-4 w-4 mr-1" />
                  Guardar badges
                </Button>
              </div>
            </div>
          )}

          <div className="flex items-center justify-between pt-2 border-t dark:border-gray-700">
            <div>
              <Label>Mostrar logos de medios de pago</Label>
              <p className="text-xs text-muted-foreground">Logos de Visa, Mastercard, etc. en el checkout</p>
            </div>
            <Switch
              checked={config.checkout_show_payment_logos}
              onCheckedChange={(checked) => {
                const newConfig = { ...config, checkout_show_payment_logos: checked };
                setConfig(newConfig);
                saveConfig(newConfig);
              }}
            />
          </div>
        </CardContent>
      </Card>

    </div>
  );
}
