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
 * Esquema de validación para la configuración de Mercado Pago
 */
const mercadoPagoConfigSchema = z.object({
  public_key: z.string().min(1, "La clave pública es requerida"),
  access_token: z.string().min(1, "El token de acceso es requerido"),
  webhook_url: z.string().url().optional().or(z.string().length(0)),
  environment: z.enum(["test", "production"]),
  client_id: z.string().optional(),
  client_secret: z.string().optional(),
  integrator_id: z.string().optional(),
});

type MercadoPagoConfigFormValues = z.infer<typeof mercadoPagoConfigSchema>;

/**
 * Componente para configurar la pasarela de pago Mercado Pago
 * Incluye campos específicos para Mercado Pago y validaciones
 */
export default function MercadoPagoGatewayConfig({
  config,
  onConfigChange,
  onValidChange,
}: GatewayConfigProps) {
  const form = useForm<MercadoPagoConfigFormValues>({
    resolver: zodResolver(mercadoPagoConfigSchema),
    defaultValues: {
      public_key: config?.public_key || '',
      access_token: config?.access_token || '',
      webhook_url: config?.webhook_url || '',
      environment: config?.environment || 'test',
      client_id: config?.client_id || '',
      client_secret: config?.client_secret || '',
      integrator_id: config?.integrator_id || '',
    },
  });

  // Actualiza el formulario cuando cambian las propiedades
  useEffect(() => {
    if (config) {
      form.reset({
        public_key: config.public_key || '',
        access_token: config.access_token || '',
        webhook_url: config.webhook_url || '',
        environment: config.environment || 'test',
        client_id: config.client_id || '',
        client_secret: config.client_secret || '',
        integrator_id: config.integrator_id || '',
      });
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
      <h3 className="text-lg font-medium">Configuración de Mercado Pago</h3>
      
      <Alert>
        <InfoCircledIcon className="h-4 w-4" />
        <AlertDescription>
          Para configurar Mercado Pago, necesitas crear una aplicación en <a href="https://developers.mercadopago.com" target="_blank" rel="noreferrer" className="text-primary underline">developers.mercadopago.com</a>
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
            name="public_key"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Clave Pública</FormLabel>
                <FormControl>
                  <Input
                    placeholder="APP_USR-..."
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
            name="access_token"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Token de Acceso</FormLabel>
                <FormControl>
                  <Input
                    type="password"
                    placeholder="APP_USR-..."
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
            name="client_id"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Client ID (opcional)</FormLabel>
                <FormControl>
                  <Input
                    placeholder="Client ID para OAuth"
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
            name="client_secret"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Client Secret (opcional)</FormLabel>
                <FormControl>
                  <Input
                    type="password"
                    placeholder="Client Secret para OAuth"
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
                <FormLabel>URL para Webhooks (opcional)</FormLabel>
                <FormControl>
                  <Input
                    placeholder="https://ejemplo.com/webhooks/mercadopago"
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
            name="integrator_id"
            render={({ field }) => (
              <FormItem>
                <FormLabel>ID de Integrador (opcional)</FormLabel>
                <FormControl>
                  <Input
                    placeholder="ID de integrador"
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
