"use client";

import { useEffect } from 'react';
import { z } from 'zod';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from '@/components/ui/select';
import { GatewayConfigProps } from '../PaymentMethodGatewayConfig';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { InfoCircledIcon } from '@radix-ui/react-icons';

/**
 * Esquema de validación para la configuración de Stripe
 */
const stripeConfigSchema = z.object({
  publishable_key: z.string().min(1, "La clave publicable es requerida"),
  secret_key: z.string().min(1, "La clave secreta es requerida"),
  webhook_secret: z.string().optional(),
  environment: z.enum(["test", "production"]),
  payment_methods_enabled: z.array(z.string()).optional().default([]),
}).passthrough();

// Definir la interfaz en lugar de inferirla para más control
interface StripeConfigFormValues {
  publishable_key: string;
  secret_key: string;
  environment: "test" | "production";
  payment_methods_enabled: string[];
  webhook_secret?: string;
  [key: string]: any;
}

/**
 * Componente para configurar la pasarela de pago Stripe
 * Incluye campos específicos para Stripe y validaciones
 */
export default function StripeGatewayConfig({
  config,
  onConfigChange,
  onValidChange,
}: GatewayConfigProps) {
  const form = useForm<StripeConfigFormValues>({
    resolver: zodResolver(stripeConfigSchema) as any,
    defaultValues: {
      publishable_key: config?.publishable_key || '',
      secret_key: config?.secret_key || '',
      webhook_secret: config?.webhook_secret || '',
      environment: config?.environment || 'test',
      payment_methods_enabled: config?.payment_methods_enabled || []
    } as StripeConfigFormValues,
  });

  // Actualiza el formulario cuando cambian las propiedades
  useEffect(() => {
    if (config) {
      const formValues = {
        publishable_key: config.publishable_key || '',
        secret_key: config.secret_key || '',
        webhook_secret: config.webhook_secret || '',
        environment: (config.environment as "test" | "production") || 'test',
        payment_methods_enabled: Array.isArray(config.payment_methods_enabled) ? 
          config.payment_methods_enabled : []
      } as StripeConfigFormValues;
      
      form.reset(formValues);
    }
  }, [config, form]);

  // Notifica al componente padre cuando cambian los valores del formulario
  const handleFormChange = () => {
    const values = form.getValues();
    onConfigChange(values);
    onValidChange && onValidChange(form.formState.isValid);
  };

  return (
    <div className="space-y-4">
      <h3 className="text-lg font-medium">Configuración de Stripe</h3>
      
      <Alert>
        <InfoCircledIcon className="h-4 w-4" />
        <AlertDescription>
          Para configurar Stripe, necesitas tener una cuenta en <a href="https://stripe.com" target="_blank" rel="noreferrer" className="text-primary underline">stripe.com</a>
        </AlertDescription>
      </Alert>
      
      <Form {...form}>
        <div className="space-y-4">
          <FormField
            control={form.control}
            name="environment"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Entorno</FormLabel>
                <Select 
                  onValueChange={(value) => {
                    field.onChange(value);
                    handleFormChange();
                  }}
                  defaultValue={field.value}
                >
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue placeholder="Seleccione un entorno" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    <SelectItem value="test">Pruebas</SelectItem>
                    <SelectItem value="production">Producción</SelectItem>
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />
          
          <FormField
            control={form.control}
            name="publishable_key"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Clave Publicable</FormLabel>
                <FormControl>
                  <Input
                    placeholder="pk_test_..."
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
                <FormLabel>Clave Secreta</FormLabel>
                <FormControl>
                  <Input
                    type="password"
                    placeholder="sk_test_..."
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
            name="webhook_secret"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Clave de Webhook (opcional)</FormLabel>
                <FormControl>
                  <Input
                    placeholder="whsec_..."
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
