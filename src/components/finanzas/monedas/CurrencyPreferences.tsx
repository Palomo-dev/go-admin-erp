'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase/config';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Loader2, Save } from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useForm, type Resolver } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { useTranslations } from 'next-intl';
import { mensajeErrorMoneda } from './erroresMonedas';

interface Currency {
  code: string;
  name: string;
  symbol: string;
  decimals: number;
  auto_update: boolean;
  is_base: boolean;
  org_auto_update: boolean;
}

interface CurrencyPreferencesProps {
  organizationId: number;
}

// Esquema de validación con zod
const preferencesSchema = z.object({
  default_currency_code: z.string({
    required_error: 'Por favor seleccione una moneda predeterminada',
  }),
  auto_sync_exchange_rates: z.boolean().default(true),
});

// Definir el tipo para los valores del formulario exactamente igual que el esquema
type PreferencesFormValues = z.infer<typeof preferencesSchema>;


export default function CurrencyPreferences({ organizationId }: CurrencyPreferencesProps) {
  const [currencies, setCurrencies] = useState<Currency[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  // Valor de «sincronización automática» tal como se cargó: solo se escribe si cambia.
  const [autoSyncCargado, setAutoSyncCargado] = useState(true);
  const { toast } = useToast();
  const tErr = useTranslations('monedasSeguridad');

  // Formulario con React Hook Form y zod
  const form = useForm<PreferencesFormValues>({
    resolver: zodResolver(preferencesSchema) as unknown as Resolver<PreferencesFormValues>,
    defaultValues: {
      default_currency_code: '',
      auto_sync_exchange_rates: true,
    },
  });

  // Cargar monedas y preferencias al iniciar
  useEffect(() => {
    if (organizationId) {
      loadCurrencies();
      loadPreferences();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [organizationId]);

  // Cargar monedas disponibles
  async function loadCurrencies() {
    try {
      setLoading(true);

      // Obtener monedas de la organización usando la función RPC
      const { data, error } = await supabase
        .rpc('get_organization_currencies', { p_organization_id: organizationId });

      if (error) throw error;
      setCurrencies(data || []);
    } catch (err: unknown) {
      console.error('Error al cargar monedas:', err);
      toast({
        title: 'Error',
        description: 'No se pudieron cargar las monedas: ' + mensajeErrorMoneda(err, tErr),
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  }

  // Cargar preferencias actuales
  async function loadPreferences() {
    try {
      setLoading(true);

      // 1. Obtener moneda base de organization_currencies (prioridad principal)
      const { data: baseCurrencyData, error: baseCurrencyError } = await supabase
        .from('organization_currencies')
        .select('currency_code')
        .eq('organization_id', organizationId)
        .eq('is_base', true)
        .maybeSingle();

      if (baseCurrencyError && baseCurrencyError.code !== 'PGRST116') {
        throw baseCurrencyError;
      }

      // 2. Obtener preferencias de la organización como respaldo
      const { data: prefData, error: prefError } = await supabase
        .from('organization_preferences')
        .select('organization_id, settings')
        .eq('organization_id', organizationId)
        .maybeSingle();

      if (prefError && prefError.code !== 'PGRST116') {
        throw prefError;
      }

      // 3. Determinar qué moneda predeterminada usar (con prioridad)
      let defaultCurrencyCode = '';
      let autoSyncRates = true;
      
      // Prioridad 1: Moneda base de organization_currencies
      if (baseCurrencyData?.currency_code) {
        defaultCurrencyCode = baseCurrencyData.currency_code;
        console.log('Moneda base encontrada en organization_currencies:', defaultCurrencyCode);
      } 
      // Prioridad 2: Moneda predeterminada en default_currency_code
      else if (prefData?.settings?.default_currency_code) {
        defaultCurrencyCode = prefData.settings.default_currency_code;
        console.log('Moneda predeterminada encontrada en default_currency_code:', defaultCurrencyCode);
      } 
      // Prioridad 3: Moneda en finance.default_currency
      else if (prefData?.settings?.finance?.default_currency) {
        defaultCurrencyCode = prefData.settings.finance.default_currency;
        console.log('Moneda predeterminada encontrada en finance.default_currency:', defaultCurrencyCode);
      }
      
      // Configuración de sincronización automática
      if (prefData?.settings?.auto_sync_exchange_rates !== undefined) {
        autoSyncRates = prefData.settings.auto_sync_exchange_rates;
      }

      // 4. Cargar datos en el formulario
      setAutoSyncCargado(autoSyncRates);
      form.reset({
        default_currency_code: defaultCurrencyCode,
        auto_sync_exchange_rates: autoSyncRates
      });
      
      console.log('Cargadas preferencias:', { defaultCurrencyCode, autoSyncRates });
    } catch (err: unknown) {
      console.error('Error al cargar preferencias:', err);
      toast({
        title: 'Error',
        description: 'No se pudieron cargar las preferencias: ' + mensajeErrorMoneda(err, tErr),
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  }

  // Guardar preferencias
  //
  // GO-sec (2026-09-28): la moneda base y la preferencia que lee
  // resolveOrgCurrency (`settings.finance.default_currency`) se escriben en UNA
  // transacción con la RPC `set_organization_base_currency`, que además exige
  // el permiso en la base. Antes esta pantalla actualizaba
  // `organization_currencies` directamente: la tabla no tiene política UPDATE,
  // así que afectaba 0 filas sin error y la moneda base nunca cambiaba.
  async function onSubmit(values: PreferencesFormValues) {
    try {
      setSaving(true);

      const { error: baseError } = await supabase.rpc('set_organization_base_currency', {
        p_organization_id: organizationId,
        p_currency_code: values.default_currency_code,
      });
      if (baseError) throw baseError;

      // La sincronización automática es una preferencia de la pantalla: solo se
      // escribe si cambió, y se exige que la fila se haya actualizado de verdad
      // (un UPDATE que RLS bloquea no da error, solo afecta 0 filas).
      if (values.auto_sync_exchange_rates !== autoSyncCargado) {
        const { data: prefs, error: prefsError } = await supabase
          .from('organization_preferences')
          .select('settings')
          .eq('organization_id', organizationId)
          .maybeSingle();
        if (prefsError) throw prefsError;
        const { data: filas, error: updError } = await supabase
          .from('organization_preferences')
          .update({
            settings: { ...(prefs?.settings ?? {}), auto_sync_exchange_rates: values.auto_sync_exchange_rates },
            updated_at: new Date().toISOString(),
          })
          .eq('organization_id', organizationId)
          .select('organization_id');
        if (updError) throw updError;
        if (!filas || filas.length === 0) throw { message: 'sin_permiso' };
        setAutoSyncCargado(values.auto_sync_exchange_rates);
      }

      // Mostrar mensaje de éxito
      toast({
        title: 'Preferencias guardadas',
        description: 'La moneda base ha sido actualizada correctamente en todas las configuraciones.',
        variant: 'default',
      });

      // Recargar las monedas para reflejar los cambios
      await loadCurrencies();
    } catch (err: unknown) {
      console.error('Error al guardar preferencias:', err);
      toast({
        title: 'Error',
        description: 'No se pudieron guardar las preferencias: ' + mensajeErrorMoneda(err, tErr),
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4 sm:space-y-6">
      <Card className="p-4 sm:p-6 dark:bg-gray-800/50 dark:border-gray-700 bg-white border-gray-200">
        <h2 className="text-base sm:text-lg font-medium mb-4 dark:text-gray-300">Preferencias de Moneda</h2>

        <Alert className="mb-4 sm:mb-6 bg-blue-50 border-blue-200 dark:bg-blue-900/20 dark:border-blue-800">
          <AlertDescription className="text-xs sm:text-sm text-blue-800 dark:text-blue-300 leading-relaxed">
            Las preferencias de moneda afectan a toda la organización. La moneda predeterminada se usará como respaldo cuando no se especifique una moneda base.
          </AlertDescription>
        </Alert>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            <FormField
              control={form.control}
              name="default_currency_code"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-sm dark:text-gray-300">Moneda Predeterminada</FormLabel>
                  <Select
                    onValueChange={field.onChange}
                    value={field.value}
                    disabled={loading}
                  >
                    <FormControl>
                      <SelectTrigger className="dark:bg-gray-900 dark:border-gray-700 dark:text-gray-200">
                        <SelectValue placeholder="Seleccione moneda predeterminada" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent className="dark:bg-gray-900 dark:border-gray-700">
                      {currencies.length === 0 ? (
                        <SelectItem value="no_currency" disabled className="dark:text-gray-400 text-sm">
                          No hay monedas disponibles
                        </SelectItem>
                      ) : (
                        currencies.map((currency) => (
                          <SelectItem 
                            key={currency.code} 
                            value={currency.code}
                            className="dark:text-gray-200 dark:focus:bg-gray-700 text-sm"
                          >
                            {currency.code} - {currency.name} ({currency.symbol})
                          </SelectItem>
                        ))
                      )}
                    </SelectContent>
                  </Select>
                  <FormDescription className="text-xs sm:text-sm dark:text-gray-400">
                    Esta moneda se utilizará como respaldo cuando no exista una moneda base.
                  </FormDescription>
                  <FormMessage className="text-xs sm:text-sm dark:text-red-400" />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="auto_sync_exchange_rates"
              render={({ field }) => (
                <FormItem className="flex flex-col sm:flex-row sm:items-center sm:justify-between rounded-lg border p-3 sm:p-4 shadow-sm dark:border-gray-700 gap-3 sm:gap-0">
                  <div className="space-y-0.5 flex-1">
                    <FormLabel className="text-sm dark:text-gray-300">
                      Sincronización Automática de Tasas
                    </FormLabel>
                    <FormDescription className="text-xs sm:text-sm dark:text-gray-400">
                      Actualizar tasas de cambio automáticamente cada día usando OpenExchangeRates.
                    </FormDescription>
                  </div>
                  <FormControl>
                    <Switch
                      checked={field.value}
                      onCheckedChange={field.onChange}
                      disabled={loading}
                      className="data-[state=checked]:bg-green-600 dark:data-[state=checked]:bg-green-700"
                    />
                  </FormControl>
                </FormItem>
              )}
            />

            <Button 
              type="submit" 
              className="w-full sm:w-auto bg-blue-600 hover:bg-blue-700 text-white dark:bg-blue-700 dark:hover:bg-blue-800"
              disabled={saving || loading}
            >
              {saving ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  <span className="text-sm sm:text-base">Guardando...</span>
                </>
              ) : (
                <>
                  <Save className="mr-2 h-4 w-4" />
                  <span className="text-sm sm:text-base">Guardar Preferencias</span>
                </>
              )}
            </Button>
          </form>
        </Form>
      </Card>
    </div>
  );
}
