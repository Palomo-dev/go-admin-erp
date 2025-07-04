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
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';

interface Currency {
  id: string;
  code: string;
  name: string;
  symbol: string;
}

interface OrganizationPreferences {
  organization_id: number;
  settings: {
    default_currency_code?: string;
    auto_sync_exchange_rates?: boolean;
  };
  created_at?: string;
  updated_at?: string;
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
  const { toast } = useToast();

  // Formulario con React Hook Form y zod
  const form = useForm({
    resolver: zodResolver(preferencesSchema) as any,
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
  }, [organizationId]);

  // Cargar monedas disponibles
  async function loadCurrencies() {
    try {
      setLoading(true);

      // Obtener monedas de la organización
      const { data, error } = await supabase
        .from('currencies')
        .select('id, code, name, symbol')
        .eq('organization_id', organizationId)
        .order('code');

      if (error) throw error;
      setCurrencies(data || []);
    } catch (err: any) {
      console.error('Error al cargar monedas:', err);
      toast({
        title: 'Error',
        description: 'No se pudieron cargar las monedas: ' + err.message,
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

      // Obtener preferencias de la organización
      const { data, error } = await supabase
        .from('organization_preferences')
        .select('organization_id, settings')
        .eq('organization_id', organizationId)
        .single();

      if (error) {
        // Si no hay preferencias, simplemente no cargamos nada en el formulario
        if (error.code === 'PGRST116') {
          console.log('No hay preferencias guardadas para esta organización');
          return;
        }
        throw error;
      }

      // Cargar datos en el formulario
      if (data && data.settings) {
        form.reset({
          default_currency_code: data.settings.default_currency_code || '',
          auto_sync_exchange_rates: data.settings.auto_sync_exchange_rates !== false, // por defecto true si es null
        });
      }
    } catch (err: any) {
      console.error('Error al cargar preferencias:', err);
      toast({
        title: 'Error',
        description: 'No se pudieron cargar las preferencias: ' + err.message,
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  }

  // Guardar preferencias
  async function onSubmit(values: PreferencesFormValues) {
    try {
      setSaving(true);

      // Verificar si ya existen preferencias para la organización
      const { data: existingPrefs, error: checkError } = await supabase
        .from('organization_preferences')
        .select('organization_id, settings')
        .eq('organization_id', organizationId)
        .maybeSingle();

      if (checkError) throw checkError;

      let result;
      
      // Preparar los valores como objeto JSONB
      const settingsData = {
        default_currency_code: values.default_currency_code,
        auto_sync_exchange_rates: values.auto_sync_exchange_rates
      };
      
      if (existingPrefs) {
        // Actualizar preferencias existentes
        result = await supabase
          .from('organization_preferences')
          .update({
            settings: settingsData,
            updated_at: new Date().toISOString()
          })
          .eq('organization_id', organizationId);
      } else {
        // Crear nuevas preferencias
        result = await supabase
          .from('organization_preferences')
          .insert({
            organization_id: organizationId,
            settings: settingsData,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          });
      }

      if (result.error) throw result.error;

      toast({
        title: 'Preferencias guardadas',
        description: 'Las preferencias de moneda han sido actualizadas correctamente.',
        variant: 'default',
      });
    } catch (err: any) {
      console.error('Error al guardar preferencias:', err);
      toast({
        title: 'Error',
        description: 'No se pudieron guardar las preferencias: ' + err.message,
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      <Card className="p-6 dark:bg-gray-800 dark:border-gray-700">
        <h2 className="text-lg font-medium mb-4 dark:text-gray-300">Preferencias de Moneda</h2>

        <Alert className="mb-6 bg-blue-50 border-blue-200 dark:bg-blue-900/20 dark:border-blue-800">
          <AlertDescription className="text-blue-800 dark:text-blue-300">
            Las preferencias de moneda afectan a toda la organización. La moneda predeterminada se usará como respaldo cuando no se especifique una moneda base.
          </AlertDescription>
        </Alert>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit as any)} className="space-y-6">
            <FormField
              control={form.control as any}
              name="default_currency_code"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="dark:text-gray-300">Moneda Predeterminada</FormLabel>
                  <Select
                    onValueChange={field.onChange}
                    value={field.value}
                    disabled={loading}
                  >
                    <FormControl>
                      <SelectTrigger className="dark:bg-gray-800 dark:border-gray-700 dark:text-gray-200">
                        <SelectValue placeholder="Seleccione moneda predeterminada" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent className="dark:bg-gray-800">
                      {currencies.length === 0 ? (
                        <SelectItem value="no_currency" disabled className="dark:text-gray-400">
                          No hay monedas disponibles
                        </SelectItem>
                      ) : (
                        currencies.map((currency) => (
                          <SelectItem 
                            key={currency.id} 
                            value={currency.code}
                            className="dark:text-gray-200 dark:focus:bg-gray-700"
                          >
                            {currency.code} - {currency.name} ({currency.symbol})
                          </SelectItem>
                        ))
                      )}
                    </SelectContent>
                  </Select>
                  <FormDescription className="dark:text-gray-400">
                    Esta moneda se utilizará como respaldo cuando no exista una moneda base.
                  </FormDescription>
                  <FormMessage className="dark:text-red-400" />
                </FormItem>
              )}
            />

            <FormField
              control={form.control as any}
              name="auto_sync_exchange_rates"
              render={({ field }) => (
                <FormItem className="flex flex-row items-center justify-between rounded-lg border p-3 shadow-sm dark:border-gray-700">
                  <div className="space-y-0.5">
                    <FormLabel className="dark:text-gray-300">
                      Sincronización Automática de Tasas
                    </FormLabel>
                    <FormDescription className="dark:text-gray-400">
                      Actualizar tasas de cambio automáticamente cada día usando OpenExchangeRates.
                    </FormDescription>
                  </div>
                  <FormControl>
                    <Switch
                      checked={field.value}
                      onCheckedChange={field.onChange}
                      disabled={loading}
                    />
                  </FormControl>
                </FormItem>
              )}
            />

            <Button 
              type="submit" 
              className="bg-blue-600 hover:bg-blue-700 text-white dark:bg-blue-700 dark:hover:bg-blue-800"
              disabled={saving || loading}
            >
              {saving ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Guardando...
                </>
              ) : (
                <>
                  <Save className="mr-2 h-4 w-4" />
                  Guardar Preferencias
                </>
              )}
            </Button>
          </form>
        </Form>
      </Card>
    </div>
  );
}
