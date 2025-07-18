import { useEffect } from 'react';
import { z } from 'zod';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Button } from '@/components/ui/button';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { GatewayConfigProps } from '../PaymentMethodGatewayConfig';

/**
 * Esquema de validación para configuraciones de pasarelas genéricas
 * Incluye campos comunes que pueden utilizarse en la mayoría de las pasarelas
 */
const genericGatewaySchema = z.object({
  api_key: z.string().optional(),
  secret_key: z.string().optional(),
  webhook_url: z.string().url().optional().or(z.string().length(0)),
  environment: z.string().optional(),
  additional_json: z.string().optional()
});

type GenericGatewayFormValues = z.infer<typeof genericGatewaySchema>;

/**
 * Componente para configurar pasarelas de pago genéricas o personalizadas
 * Permite configurar campos básicos comunes entre la mayoría de pasarelas
 */
export default function GenericGatewayConfig({
  gateway,
  config,
  onConfigChange,
  onValidChange
}: GatewayConfigProps) {
  const form = useForm<GenericGatewayFormValues>({
    resolver: zodResolver(genericGatewaySchema),
    defaultValues: {
      api_key: config?.api_key || '',
      secret_key: config?.secret_key || '',
      webhook_url: config?.webhook_url || '',
      environment: config?.environment || 'production',
      additional_json: config?.additional_json ? JSON.stringify(config.additional_json, null, 2) : ''
    },
  });

  // Actualiza el formulario cuando cambian las propiedades
  useEffect(() => {
    if (config) {
      form.reset({
        api_key: config.api_key || '',
        secret_key: config.secret_key || '',
        webhook_url: config.webhook_url || '',
        environment: config.environment || 'production',
        additional_json: config.additional_json ? JSON.stringify(config.additional_json, null, 2) : ''
      });
    }
  }, [config, form]);

  // Notifica al componente padre cuando cambian los valores del formulario
  const handleFormChange = () => {
    const values = form.getValues();
    let additionalJson = {};
    
    try {
      if (values.additional_json) {
        additionalJson = JSON.parse(values.additional_json);
      }
    } catch (e) {
      console.error('Error al parsear JSON adicional:', e);
    }

    onConfigChange({
      ...values,
      additional_json: additionalJson
    });
    
    // Actualiza el estado de validación
    onValidChange && onValidChange(form.formState.isValid);
  };

  return (
    <div className="space-y-4">
      <h3 className="text-lg font-medium">Configuración para pasarela: {gateway || 'Genérica'}</h3>
      
      <Form {...form}>
        <div className="space-y-4">
          <FormField
            control={form.control}
            name="api_key"
            render={({ field }) => (
              <FormItem>
                <FormLabel>API Key</FormLabel>
                <FormControl>
                  <Input
                    placeholder="Ingrese su API Key"
                    {...field}
                    onChange={(e) => {
                      field.onChange(e);
                      handleFormChange();
                    }}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          
          <FormField
            control={form.control}
            name="secret_key"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Secret Key</FormLabel>
                <FormControl>
                  <Input
                    type="password"
                    placeholder="Ingrese su Secret Key"
                    {...field}
                    onChange={(e) => {
                      field.onChange(e);
                      handleFormChange();
                    }}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          
          <FormField
            control={form.control}
            name="webhook_url"
            render={({ field }) => (
              <FormItem>
                <FormLabel>URL de Webhook</FormLabel>
                <FormControl>
                  <Input
                    placeholder="https://ejemplo.com/webhook"
                    {...field}
                    onChange={(e) => {
                      field.onChange(e);
                      handleFormChange();
                    }}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          
          <FormField
            control={form.control}
            name="environment"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Entorno</FormLabel>
                <FormControl>
                  <Input
                    placeholder="production o sandbox"
                    {...field}
                    onChange={(e) => {
                      field.onChange(e);
                      handleFormChange();
                    }}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          
          <FormField
            control={form.control}
            name="additional_json"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Configuración adicional (JSON)</FormLabel>
                <FormControl>
                  <textarea
                    className="min-h-32 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                    placeholder='{ "campo": "valor" }'
                    {...field}
                    onChange={(e) => {
                      field.onChange(e);
                      handleFormChange();
                    }}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>
      </Form>
    </div>
  );
}
