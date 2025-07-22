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
 * Esquema de validación para la configuración de PayU
 */
const payUConfigSchema = z.object({
  merchant_id: z.string().min(1, "El ID de comercio es requerido"),
  api_key: z.string().min(1, "La API Key es requerida"),
  api_login: z.string().min(1, "El API Login es requerido"),
  account_id: z.string().min(1, "El ID de cuenta es requerido"),
  webhook_url: z.string().url().optional().or(z.string().length(0)),
  environment: z.enum(["sandbox", "production"]),
});

type PayUConfigFormValues = z.infer<typeof payUConfigSchema>;

/**
 * Componente para configurar la pasarela de pago PayU
 * Incluye campos específicos para PayU Latam y validaciones
 */
export default function PayUGatewayConfig({
  config,
  onConfigChange,
  onValidChange,
}: GatewayConfigProps) {
  const form = useForm<PayUConfigFormValues>({
    resolver: zodResolver(payUConfigSchema),
    defaultValues: {
      merchant_id: config?.merchant_id || '',
      api_key: config?.api_key || '',
      api_login: config?.api_login || '',
      account_id: config?.account_id || '',
      webhook_url: config?.webhook_url || '',
      environment: config?.environment || 'sandbox',
    },
  });

  // Actualiza el formulario cuando cambian las propiedades
  useEffect(() => {
    if (config) {
      form.reset({
        merchant_id: config.merchant_id || '',
        api_key: config.api_key || '',
        api_login: config.api_login || '',
        account_id: config.account_id || '',
        webhook_url: config.webhook_url || '',
        environment: config.environment || 'sandbox',
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
      <h3 className="text-lg font-medium">Configuración de PayU Latam</h3>
      
      <Alert>
        <InfoCircledIcon className="h-4 w-4" />
        <AlertDescription>
          Para configurar PayU, necesitas obtener tus credenciales en <a href="https://www.payu.com" target="_blank" rel="noreferrer" className="text-primary underline">payu.com</a>
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
                    <SelectItem value="sandbox">Sandbox (Pruebas)</SelectItem>
                    <SelectItem value="production">Producción</SelectItem>
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />
          
          <FormField
            control={form.control}
            name="merchant_id"
            render={({ field }) => (
              <FormItem>
                <FormLabel>ID de Comercio</FormLabel>
                <FormControl>
                  <Input
                    placeholder="Ej: 508029"
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
            name="api_key"
            render={({ field }) => (
              <FormItem>
                <FormLabel>API Key</FormLabel>
                <FormControl>
                  <Input
                    type="password"
                    placeholder="Ej: 4Vj8eK4rloUd272L48hsrarnUA"
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
            name="api_login"
            render={({ field }) => (
              <FormItem>
                <FormLabel>API Login</FormLabel>
                <FormControl>
                  <Input
                    placeholder="Ej: pRRXKOl8ikMmt9u"
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
            name="account_id"
            render={({ field }) => (
              <FormItem>
                <FormLabel>ID de Cuenta</FormLabel>
                <FormControl>
                  <Input
                    placeholder="Ej: 512321"
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
                    placeholder="https://ejemplo.com/webhooks/payu"
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
