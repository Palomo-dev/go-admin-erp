"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { useToast } from "@/components/ui/use-toast";
import { supabase } from "@/lib/supabase/config";
import { Button } from "@/components/ui/button";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { Separator } from "@/components/ui/separator";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { AlertCircle, Loader2, Globe, MapPin, ChevronDown, ExternalLink } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { PaymentMethod, OrganizationPaymentMethod } from "./PaymentMethodsPage";
import AccountMappingForm from "@/components/finanzas/metodos-pago/AccountMappingForm";
import Link from "next/link";

interface PaymentMethodFormProps {
  organizationId: number;
  globalMethods: PaymentMethod[];
  recommendedMethods?: any[];
  countryCode?: string | null;
  selectedMethod: OrganizationPaymentMethod | null;
  onSaveComplete: () => void;
  onCancel: () => void;
}

// Métodos manuales que SÍ se pueden crear directamente
const MANUAL_METHODS = ['cash', 'transfer', 'card'];

// Integraciones de pago disponibles con su provider_id para redirección
const PAYMENT_INTEGRATIONS = [
  { code: 'wompi', name: 'Wompi', providerId: '46c3d81f-c515-49ed-9067-958bcd50e946' },
  { code: 'payu', name: 'PayU', providerId: '1084bdca-1c07-4989-a3d8-8169de72e6c0' },
  { code: 'mercadopago', name: 'Mercado Pago', providerId: 'ef7a28a1-f698-4518-91ed-c15166728bd3' },
  { code: 'stripe', name: 'Stripe', providerId: '7d9abb20-5bbb-410c-b4da-c2231511be34' },
  { code: 'paypal', name: 'PayPal', providerId: '18bee38f-9d27-4360-b2e3-3274bbb0b2d9' },
];

// Esquema de validación
const formSchema = z.object({
  payment_method_code: z.string().min(1, "Debes seleccionar un método de pago"),
  is_active: z.boolean().default(true),
  gateway: z.string().optional(),
  requires_reference: z.boolean().default(false),
  name: z.string().min(3, "El nombre debe tener al menos 3 caracteres").optional(),
  code: z.string().min(2, "El código debe tener al menos 2 caracteres").optional(),
  show_on_website: z.boolean().default(true),
  website_display_order: z.number().default(0),
  website_display_name: z.string().optional(),
  website_description: z.string().optional(),
  website_icon: z.string().optional(),
}).passthrough();

interface FormValues {
  payment_method_code: string;
  is_active: boolean;
  requires_reference: boolean;
  gateway?: string;
  name?: string;
  code?: string;
  show_on_website?: boolean;
  website_display_order?: number;
  website_display_name?: string;
  website_description?: string;
  website_icon?: string;
  [key: string]: any;
}

export default function PaymentMethodForm({
  organizationId,
  globalMethods,
  recommendedMethods = [],
  countryCode,
  selectedMethod,
  onSaveComplete,
  onCancel
}: PaymentMethodFormProps) {
  const { toast } = useToast();
  const router = useRouter();
  const [isSaving, setIsSaving] = useState(false);
  const [isNewMethod, setIsNewMethod] = useState(false);
  const [gatewayConfig, setGatewayConfig] = useState<Record<string, any>>({});
  const [accountMapping, setAccountMapping] = useState<Record<string, string>>({});
  const [showAdvancedAccounting, setShowAdvancedAccounting] = useState(false);
  
  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema) as any,
    defaultValues: {
      payment_method_code: selectedMethod?.payment_method_code || "",
      is_active: selectedMethod?.is_active ?? true,
      gateway: selectedMethod?.settings?.gateway || "",
      requires_reference: selectedMethod?.payment_method?.requires_reference ?? false,
      name: "",
      code: "",
      show_on_website: selectedMethod?.show_on_website ?? true,
      website_display_order: selectedMethod?.website_display_order ?? 0,
      website_display_name: selectedMethod?.website_display_name || "",
      website_description: selectedMethod?.website_description || "",
      website_icon: selectedMethod?.website_icon || "",
    } as FormValues,
  });

  const currentMethodCode = form.watch("payment_method_code");
  const hasMethodSelected = !!currentMethodCode || isNewMethod || selectedMethod !== null;
  const currentMethod = globalMethods.find(m => m.code === currentMethodCode);

  // Cargar datos del método seleccionado
  useEffect(() => {
    if (selectedMethod) {
      form.reset({
        payment_method_code: selectedMethod.payment_method_code,
        is_active: selectedMethod.is_active,
        gateway: selectedMethod.settings?.gateway || "",
        requires_reference: selectedMethod?.payment_method?.requires_reference || false,
        show_on_website: selectedMethod.show_on_website ?? true,
        website_display_order: selectedMethod.website_display_order ?? 0,
        website_display_name: selectedMethod.website_display_name || "",
        website_description: selectedMethod.website_description || "",
        website_icon: selectedMethod.website_icon || "",
      });

      if (selectedMethod.settings?.gateway_config) {
        setGatewayConfig(selectedMethod.settings.gateway_config);
      }
      if (selectedMethod.settings?.account_mapping) {
        setAccountMapping(selectedMethod.settings.account_mapping);
      }
    }
  }, [selectedMethod, form]);

  // Manejar cambio en la selección de método de pago
  const handlePaymentMethodChange = (code: string) => {
    // Si seleccionó una integración → redirigir a la página de conexión
    if (code.startsWith('integration_')) {
      const integrationCode = code.replace('integration_', '');
      const integration = PAYMENT_INTEGRATIONS.find(i => i.code === integrationCode);
      if (integration) {
        router.push(`/app/integraciones/conexiones/nueva?provider=${integration.providerId}`);
      }
      return;
    }

    const isNew = code === "new";
    setIsNewMethod(isNew);
    
    if (!isNew) {
      const method = globalMethods.find(m => m.code === code);
      if (method) {
        form.reset({
          payment_method_code: method.code,
          name: method.name,
          code: method.code,
          requires_reference: method.requires_reference,
          is_active: true,
          gateway: "",
          show_on_website: true,
          website_display_name: "",
          website_description: "",
          website_icon: "",
          website_display_order: 0,
        });
        
        setGatewayConfig({});
        setAccountMapping({});
      }
    }
  };

  // Guardar mapeo de cuentas
  const handleSaveAccountMapping = (mapping: Record<string, string>) => {
    setAccountMapping(mapping);
    toast({
      title: "Mapeo guardado",
      description: "Recuerda guardar el método de pago para confirmar los cambios.",
    });
  };

  // Envío del formulario
  const onSubmit = async (values: FormValues) => {
    try {
      setIsSaving(true);
      
      if (!organizationId) {
        throw new Error("No se pudo determinar el ID de la organización");
      }
      
      // Si es un nuevo método personalizado
      if (isNewMethod && values.name && values.code) {
        const { data: existingMethod, error: checkError } = await supabase
          .from("payment_methods")
          .select("code")
          .eq("code", values.code)
          .single();
          
        if (checkError && checkError.code !== "PGRST116") throw checkError;
        
        if (existingMethod) {
          toast({ title: "Error", description: "Ya existe un método con este código", variant: "destructive" });
          return;
        }
        
        const { error: insertError } = await supabase
          .from("payment_methods")
          .insert({
            code: values.code,
            name: values.name,
            requires_reference: values.requires_reference,
            is_active: true,
            is_system: false,
          });
        if (insertError) throw insertError;
        values.payment_method_code = values.code;
      }
      
      if (!values.payment_method_code) {
        throw new Error("No se ha seleccionado un método de pago válido");
      }
      
      const settings = {
        gateway: values.gateway === "none" ? "" : values.gateway,
        gateway_config: Object.keys(gatewayConfig).length > 0 ? gatewayConfig : undefined,
        account_mapping: Object.keys(accountMapping).length > 0 ? accountMapping : undefined,
      };
      
      const payloadWebsite = {
        show_on_website: values.show_on_website ?? true,
        website_display_order: values.website_display_order ?? 0,
        website_display_name: values.website_display_name || null,
        website_description: values.website_description || null,
        website_icon: values.website_icon || null,
      };
      
      if (!selectedMethod?.id) {
        const { data: existingOrgMethod, error: checkOrgError } = await supabase
          .from("organization_payment_methods")
          .select("id")
          .eq("organization_id", organizationId)
          .eq("payment_method_code", values.payment_method_code)
          .maybeSingle();
          
        if (checkOrgError) console.error("Error al verificar método existente:", checkOrgError);
        
        if (existingOrgMethod?.id) {
          const { error } = await supabase
            .from("organization_payment_methods")
            .update({ is_active: values.is_active, settings, ...payloadWebsite, updated_at: new Date().toISOString() })
            .eq("id", existingOrgMethod.id);
          if (error) throw error;
        } else {
          const { error } = await supabase
            .from("organization_payment_methods")
            .insert({ organization_id: organizationId, payment_method_code: values.payment_method_code, is_active: values.is_active, settings, ...payloadWebsite });
          if (error) throw error;
        }
      } else {
        const { error } = await supabase
          .from("organization_payment_methods")
          .update({ is_active: values.is_active, settings, ...payloadWebsite, updated_at: new Date().toISOString() })
          .eq("id", selectedMethod.id);
        if (error) throw error;
      }
      
      toast({ title: "Método de pago guardado", description: "Configurado exitosamente" });
      onSaveComplete();
    } catch (error: any) {
      console.error("Error al guardar método de pago:", error);
      toast({ title: "Error", description: "No se pudo guardar: " + error.message, variant: "destructive" });
    } finally {
      setIsSaving(false);
    }
  };

  const handleFormSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    form.handleSubmit(onSubmit)(e);
  };

  return (
    <Form {...form}>
      <form onSubmit={handleFormSubmit} className="space-y-6">
        {/* ═══════════════ SECCIÓN 1: SELECCIÓN DEL MÉTODO ═══════════════ */}
        {isNewMethod ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-sm dark:text-gray-200">Nombre del método</FormLabel>
                  <FormControl>
                    <Input placeholder="Ej. Pago Contraentrega" {...field} className="dark:bg-gray-900 dark:border-gray-600 dark:text-gray-100 text-sm" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="code"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-sm dark:text-gray-200">Código interno</FormLabel>
                  <FormControl>
                    <Input placeholder="Ej. pago_contraentrega" {...field} className="dark:bg-gray-900 dark:border-gray-600 dark:text-gray-100 text-sm" />
                  </FormControl>
                  <FormDescription className="text-xs dark:text-gray-400">Sin espacios, único</FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>
        ) : (
          <FormField
            control={form.control}
            name="payment_method_code"
            render={({ field }) => (
              <FormItem>
                <FormLabel className="text-sm dark:text-gray-200">Método de pago</FormLabel>
                <Select 
                  onValueChange={(value) => { field.onChange(value); handlePaymentMethodChange(value); }}
                  value={field.value}
                  disabled={selectedMethod !== null}
                >
                  <FormControl>
                    <SelectTrigger className="dark:bg-gray-900 dark:border-gray-600 dark:text-gray-100 text-sm">
                      <SelectValue placeholder="Selecciona un método de pago" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent className="dark:bg-gray-900 dark:border-gray-700">
                    {/* Métodos manuales */}
                    <div className="px-2 py-1.5 text-xs font-semibold text-gray-500 dark:text-gray-400 border-b dark:border-gray-700">
                      Métodos de pago
                    </div>
                    {globalMethods
                      .filter(method => MANUAL_METHODS.includes(method.code))
                      .map((method) => (
                        <SelectItem key={method.code} value={method.code} className="dark:text-gray-200 dark:focus:bg-gray-800">
                          {method.name}
                        </SelectItem>
                      ))
                    }
                    {/* Integraciones de pago → redirigen */}
                    <div className="px-2 py-1.5 text-xs font-semibold text-blue-600 dark:text-blue-400 border-b border-t dark:border-gray-700 bg-blue-50/50 dark:bg-blue-900/20 mt-1">
                      Integraciones (requieren conexión)
                    </div>
                    {PAYMENT_INTEGRATIONS.map((integration) => (
                      <SelectItem key={integration.code} value={`integration_${integration.code}`} className="dark:text-gray-200 dark:focus:bg-gray-800">
                        ⚡ {integration.name}
                      </SelectItem>
                    ))}
                    <SelectItem value="new" className="dark:text-gray-200 dark:focus:bg-gray-800 border-t dark:border-gray-700 mt-1">+ Crear método personalizado</SelectItem>
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />
        )}
        
        {/* Países disponibles */}
        {currentMethod && currentMethod.countries && currentMethod.countries.length > 0 && (
          <div className="flex items-center gap-2 p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800">
            <MapPin className="h-4 w-4 text-blue-600 dark:text-blue-400 flex-shrink-0" />
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-xs text-blue-700 dark:text-blue-300">Disponible en:</span>
              {currentMethod.countries.map((c: any) => (
                <Badge key={c.country_code} variant="outline" className="text-[10px] px-1.5 py-0 dark:bg-gray-800 dark:text-gray-300">
                  {c.country?.name || c.country_code}
                </Badge>
              ))}
            </div>
          </div>
        )}
        
        {!hasMethodSelected && !isNewMethod && (
          <Alert className="bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800">
            <AlertCircle className="h-4 w-4 text-amber-600" />
            <AlertDescription className="text-amber-700 dark:text-amber-300 text-sm">
              Selecciona un método de pago para configurar sus opciones.
            </AlertDescription>
          </Alert>
        )}

        {/* ═══════════════ SECCIÓN 2: CONFIGURACIÓN GENERAL + NOMBRES ═══════════════ */}
        {hasMethodSelected && (
          <>
            <Separator className="dark:bg-gray-700" />
            
            {/* Estado activo y requiere referencia */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="is_active"
                render={({ field }) => (
                  <FormItem className="flex items-center justify-between rounded-lg border dark:border-gray-700 p-3">
                    <div>
                      <FormLabel className="text-sm dark:text-gray-200">Activo</FormLabel>
                      <FormDescription className="text-xs dark:text-gray-400">Disponible en el sistema</FormDescription>
                    </div>
                    <FormControl>
                      <Switch checked={field.value} onCheckedChange={field.onChange} className="data-[state=checked]:bg-blue-600" />
                    </FormControl>
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="requires_reference"
                render={({ field }) => (
                  <FormItem className="flex items-center justify-between rounded-lg border dark:border-gray-700 p-3">
                    <div>
                      <FormLabel className="text-sm dark:text-gray-200">Requiere referencia</FormLabel>
                      <FormDescription className="text-xs dark:text-gray-400">Pedir # transacción</FormDescription>
                    </div>
                    <FormControl>
                      <Checkbox
                        checked={field.value}
                        onCheckedChange={field.onChange}
                        disabled={!isNewMethod && selectedMethod !== null}
                        className="dark:border-gray-600 data-[state=checked]:bg-blue-600 data-[state=checked]:border-blue-600"
                      />
                    </FormControl>
                  </FormItem>
                )}
              />
            </div>

            {/* ═══════════════ SECCIÓN 3: PERSONALIZACIÓN PARA WEB ═══════════════ */}
            <div className="rounded-lg border dark:border-gray-700 overflow-hidden">
              <div className="bg-gray-50 dark:bg-gray-800/60 px-4 py-3 border-b dark:border-gray-700">
                <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-200 flex items-center gap-2">
                  <Globe className="h-4 w-4 text-blue-500" />
                  Personalización para la Web
                </h3>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                  Nombre y descripción que verán los clientes en tu página web
                </p>
              </div>
              <div className="p-4 space-y-4">
                {/* Campo: Nombre para web */}
                <FormField
                  control={form.control}
                  name="website_display_name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-sm dark:text-gray-200">Nombre para la Web</FormLabel>
                      <FormControl>
                        <Input 
                          placeholder={`Ej: Pago Contraentrega, Pago en tienda, Tarjeta online...`}
                          {...field}
                          value={field.value || ''}
                          className="dark:bg-gray-900 dark:border-gray-600 dark:text-gray-100 text-sm"
                        />
                      </FormControl>
                      <FormDescription className="text-xs dark:text-gray-400">
                        Si lo dejas vacío, se usará el nombre del catálogo: &ldquo;{currentMethod?.name || selectedMethod?.payment_method?.name || "—"}&rdquo;
                      </FormDescription>
                    </FormItem>
                  )}
                />

                {/* Campo: Descripción/instrucciones para web */}
                <FormField
                  control={form.control}
                  name="website_description"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-sm dark:text-gray-200">Instrucciones para el cliente</FormLabel>
                      <FormControl>
                        <Textarea 
                          placeholder="Ej: Paga al recibir tu pedido en efectivo o con tarjeta al repartidor..." 
                          {...field}
                          value={field.value || ''}
                          rows={2}
                          className="dark:bg-gray-900 dark:border-gray-600 dark:text-gray-100 text-sm resize-none"
                        />
                      </FormControl>
                    </FormItem>
                  )}
                />

                {/* Mostrar en web + Orden + Icono */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <FormField
                    control={form.control}
                    name="show_on_website"
                    render={({ field }) => (
                      <FormItem className="flex items-center justify-between rounded-lg border dark:border-gray-700 p-3">
                        <FormLabel className="text-xs dark:text-gray-200">Visible en Web</FormLabel>
                        <FormControl>
                          <Switch checked={field.value} onCheckedChange={field.onChange} className="data-[state=checked]:bg-blue-600" />
                        </FormControl>
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="website_display_order"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-xs dark:text-gray-200">Orden</FormLabel>
                        <FormControl>
                          <Input 
                            type="number" min="0" placeholder="0"
                            {...field}
                            value={field.value || 0}
                            onChange={(e) => field.onChange(parseInt(e.target.value) || 0)}
                            className="dark:bg-gray-900 dark:border-gray-600 dark:text-gray-100 text-sm"
                          />
                        </FormControl>
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="website_icon"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-xs dark:text-gray-200">Icono</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value || ''}>
                          <FormControl>
                            <SelectTrigger className="dark:bg-gray-900 dark:border-gray-600 dark:text-gray-100 text-sm">
                              <SelectValue placeholder="Seleccionar icono" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="banknotes">💵 Billetes</SelectItem>
                            <SelectItem value="coins">🪙 Monedas</SelectItem>
                            <SelectItem value="credit-card">💳 Tarjeta</SelectItem>
                            <SelectItem value="building-bank">🏦 Banco</SelectItem>
                            <SelectItem value="arrow-left-right">🔄 Transferencia</SelectItem>
                            <SelectItem value="wallet">👛 Billetera</SelectItem>
                            <SelectItem value="smartphone">📱 Móvil</SelectItem>
                            <SelectItem value="qr-code">📲 QR</SelectItem>
                            <SelectItem value="globe">🌐 Online</SelectItem>
                            <SelectItem value="zap">⚡ Pago rápido</SelectItem>
                            <SelectItem value="truck">🚚 Contraentrega</SelectItem>
                            <SelectItem value="store">🏪 En tienda</SelectItem>
                          </SelectContent>
                        </Select>
                      </FormItem>
                    )}
                  />
                </div>
              </div>
            </div>

            {/* ═══════════════ NOTA: Métodos de integración ═══════════════ */}
            <div className="flex items-center gap-3 p-3 rounded-lg border border-dashed dark:border-gray-600 bg-gray-50/50 dark:bg-gray-800/30">
              <ExternalLink className="h-4 w-4 text-gray-400 flex-shrink-0" />
              <p className="text-xs text-gray-500 dark:text-gray-400">
                ¿Necesitas métodos como Wompi, Nequi o PayU? Conéctalos desde{" "}
                <Link href="/app/integraciones/conexiones" className="text-blue-600 dark:text-blue-400 hover:underline font-medium">
                  Integraciones → Conexiones
                </Link>
                {" "}y se agregarán automáticamente.
              </p>
            </div>

            {/* ═══════════════ SECCIÓN 4: AVANZADO - CONTABILIDAD ═══════════════ */}
            <Collapsible open={showAdvancedAccounting} onOpenChange={setShowAdvancedAccounting}>
              <CollapsibleTrigger asChild>
                <button type="button" className="w-full flex items-center justify-between p-3 rounded-lg border dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors">
                  <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Contabilidad (Mapeo de cuentas)</span>
                  <ChevronDown className={`h-4 w-4 text-gray-500 transition-transform ${showAdvancedAccounting ? 'rotate-180' : ''}`} />
                </button>
              </CollapsibleTrigger>
              <CollapsibleContent className="mt-3">
                <AccountMappingForm
                  initialMapping={accountMapping}
                  onSave={handleSaveAccountMapping}
                />
              </CollapsibleContent>
            </Collapsible>
          </>
        )}
        
        {/* ═══════════════ BOTONES ═══════════════ */}
        <div className="flex flex-col sm:flex-row justify-end gap-2 pt-4">
          <Button type="button" variant="outline" onClick={onCancel} disabled={isSaving} className="w-full sm:w-auto dark:border-gray-600 dark:text-gray-300 text-sm">
            Cancelar
          </Button>
          <Button 
            type="button" 
            onClick={(e) => handleFormSubmit(e as any)} 
            disabled={isSaving || !hasMethodSelected}
            className="w-full sm:w-auto bg-blue-600 hover:bg-blue-700 text-white text-sm"
          >
            {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Guardar
          </Button>
        </div>
      </form>
    </Form>
  );
}
