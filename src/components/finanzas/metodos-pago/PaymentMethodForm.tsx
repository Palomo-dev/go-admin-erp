<<<<<<< C:/Users/USUARIO/CascadeProjects/go-admin-erp/src/components/finanzas/metodos-pago/PaymentMethodForm.tsx
"use client";

import { useState, useEffect } from "react";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Checkbox } from "@/components/ui/checkbox";
import { Separator } from "@/components/ui/separator";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AlertCircle, Loader2, Globe, MapPin } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { PaymentMethod, OrganizationPaymentMethod } from "./PaymentMethodsPage";
import PaymentMethodGatewayConfig from "@/components/finanzas/metodos-pago/PaymentMethodGatewayConfig";
import AccountMappingForm from "@/components/finanzas/metodos-pago/AccountMappingForm";

interface PaymentMethodFormProps {
  organizationId: number;
  globalMethods: PaymentMethod[];
  recommendedMethods?: any[]; // Agregar métodos recomendados
  countryCode?: string | null;
  selectedMethod: OrganizationPaymentMethod | null;
  onSaveComplete: () => void;
  onCancel: () => void;
}

const gatewayOptions = [
  { label: "Ninguno", value: "none" },
  { label: "Stripe", value: "stripe" },
  { label: "PayU", value: "payu" },
  { label: "Mercado Pago", value: "mercadopago" }
];

// Esquema de validación para el formulario
const formSchema = z.object({
  payment_method_code: z.string().min(1, "Debes seleccionar un método de pago"),
  is_active: z.boolean().default(true),
  gateway: z.string().optional(),
  requires_reference: z.boolean().default(false),
  name: z.string().min(3, "El nombre debe tener al menos 3 caracteres").optional(),
  code: z.string().min(2, "El código debe tener al menos 2 caracteres").optional(),
  // Campos de Website
  show_on_website: z.boolean().default(true),
  website_display_order: z.number().default(0),
  website_display_name: z.string().optional(),
  website_description: z.string().optional(),
  website_icon: z.string().optional(),
}).passthrough(); // Permitir propiedades adicionales

// Definir el tipo FormValues para el formulario
interface FormValues {
  payment_method_code: string;
  is_active: boolean;
  requires_reference: boolean;
  gateway?: string;
  name?: string;
  code?: string;
  // Campos de Website
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
  const [isSaving, setIsSaving] = useState(false);
  const [isNewMethod, setIsNewMethod] = useState(false);
  const [activeTab, setActiveTab] = useState("general");
  const [gatewayConfig, setGatewayConfig] = useState<Record<string, any>>({});
  const [accountMapping, setAccountMapping] = useState<Record<string, string>>({});
  
  // Configuración del formulario con React Hook Form y Zod
  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema) as any,
    defaultValues: {
      payment_method_code: selectedMethod?.payment_method_code || "",
      is_active: selectedMethod?.is_active ?? true,
      gateway: selectedMethod?.settings?.gateway || "",
      requires_reference: selectedMethod?.payment_method?.requires_reference ?? false,
      name: "",
      code: "",
      // Campos de Website
      show_on_website: selectedMethod?.show_on_website ?? true,
      website_display_order: selectedMethod?.website_display_order ?? 0,
      website_display_name: selectedMethod?.website_display_name || "",
      website_description: selectedMethod?.website_description || "",
      website_icon: selectedMethod?.website_icon || "",
    } as FormValues,
  });

  // Estado para verificar si hay un método seleccionado (para habilitar tabs)
  const currentMethodCode = form.watch("payment_method_code");
  const hasMethodSelected = !!currentMethodCode || isNewMethod || selectedMethod !== null;
  
  // Obtener el método seleccionado actual para mostrar sus países
  const currentMethod = globalMethods.find(m => m.code === currentMethodCode);

  // Cargar datos del método seleccionado
  useEffect(() => {
    if (selectedMethod) {
      form.reset({
        payment_method_code: selectedMethod.payment_method_code,
        is_active: selectedMethod.is_active,
        gateway: selectedMethod.settings?.gateway || "",
        requires_reference: selectedMethod.payment_method?.requires_reference || false,
        // Campos de Website
        show_on_website: selectedMethod.show_on_website ?? true,
        website_display_order: selectedMethod.website_display_order ?? 0,
        website_display_name: selectedMethod.website_display_name || "",
        website_description: selectedMethod.website_description || "",
        website_icon: selectedMethod.website_icon || "",
      });

      // Cargar configuración de gateway y mapeo de cuentas
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
    console.log("Método de pago seleccionado:", code);
    const isNew = code === "new";
    setIsNewMethod(isNew);
    
    if (!isNew) {
      // Buscar el método global por código
      const method = globalMethods.find(m => m.code === code);
      console.log("Método encontrado:", method);
      
      if (method) {
        // Buscar si es un método recomendado para aplicar configuración especial
        const recommendedMethod = recommendedMethods.find(rec => rec.code === code);
        
        // Configurar gateway por defecto
        let defaultGateway = "none";
        let recommendedConfig = {};
        
        if (recommendedMethod && recommendedMethod.settings) {
          // Si es recomendado y tiene configuración, aplicarla
          if (recommendedMethod.settings.gateway && typeof recommendedMethod.settings.gateway === 'string') {
            defaultGateway = recommendedMethod.settings.gateway;
          }
          recommendedConfig = recommendedMethod.settings.gateway_config || {};
        }
        
        // Reiniciar el formulario con valores predeterminados
        form.reset({
          payment_method_code: method.code,
          name: method.name,
          code: method.code,
          requires_reference: method.requires_reference,
          is_active: true,
          gateway: defaultGateway,
        });
        
        // Configurar los estados iniciales para settings
        setGatewayConfig(recommendedConfig);
        setAccountMapping({});
        
        console.log("Formulario configurado para:", method.name, recommendedMethod ? "(Método recomendado)" : "(Método estándar)");
      }
    }
  };

  // Guardar configuración de gateway
  const handleSaveGatewayConfig = async (gateway: string, config: Record<string, any>) => {
    setGatewayConfig(config);
    toast({
      title: "Configuración guardada",
      description: "La configuración del gateway ha sido guardada temporalmente. Recuerda guardar el método de pago para confirmar los cambios.",
    });
  };

  // Guardar mapeo de cuentas
  const handleSaveAccountMapping = (mapping: Record<string, string>) => {
    setAccountMapping(mapping);
    toast({
      title: "Mapeo guardado",
      description: "El mapeo de cuentas ha sido guardado temporalmente. Recuerda guardar el método de pago para confirmar los cambios.",
    });
  };

  // Envío del formulario
  const onSubmit = async (values: FormValues) => {
    try {
      setIsSaving(true);
      console.log("Guardando método de pago con valores:", values);
      console.log("ID de organización:", organizationId);
      console.log("Es método seleccionado:", selectedMethod !== null);
      console.log("Es método nuevo:", isNewMethod);
      
      // Validar que tenemos un ID de organización
      if (!organizationId) {
        throw new Error("No se pudo determinar el ID de la organización");
      }
      
      // Si es un nuevo método personalizado
      if (isNewMethod && values.name && values.code) {
        // Verificar si ya existe un código similar
        const { data: existingMethod, error: checkError } = await supabase
          .from("payment_methods")
          .select("code")
          .eq("code", values.code)
          .single();
          
        if (checkError && checkError.code !== "PGRST116") { // No es error "no encontrado"
          throw checkError;
        }
        
        if (existingMethod) {
          toast({
            title: "Error",
            description: "Ya existe un método de pago con este código",
            variant: "destructive",
          });
          return;
        }
        
        // Insertar nuevo método de pago global
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
        
        // Actualizar el código de método para la siguiente operación
        values.payment_method_code = values.code;
      }
      
      // Validar que tenemos un código de método de pago
      if (!values.payment_method_code) {
        throw new Error("No se ha seleccionado un método de pago válido");
      }
      
      // Construir objeto de configuración
      const settings = {
        gateway: values.gateway === "none" ? "" : values.gateway, // Convertir "none" a cadena vacía
        gateway_config: Object.keys(gatewayConfig).length > 0 ? gatewayConfig : undefined,
        account_mapping: Object.keys(accountMapping).length > 0 ? accountMapping : undefined,
      };
      
      // Comprobar si ya existe este método para la organización
      if (!selectedMethod?.id) {
        const { data: existingOrgMethod, error: checkOrgError } = await supabase
          .from("organization_payment_methods")
          .select("id")
          .eq("organization_id", organizationId)
          .eq("payment_method_code", values.payment_method_code)
          .maybeSingle();
          
        console.log("Verificando si ya existe:", { existingOrgMethod, checkOrgError });
        
        if (checkOrgError) {
          console.error("Error al verificar método existente:", checkOrgError);
        }
        
        // Si ya existe, actualizar en lugar de insertar
        if (existingOrgMethod?.id) {
          console.log("El método ya existe para esta organización. Actualizando ID:", existingOrgMethod.id);
          
          const { data: updateData, error } = await supabase
            .from("organization_payment_methods")
            .update({
              is_active: values.is_active,
              settings,
              // Campos de Website
              show_on_website: values.show_on_website ?? true,
              website_display_order: values.website_display_order ?? 0,
              website_display_name: values.website_display_name || null,
              website_description: values.website_description || null,
              website_icon: values.website_icon || null,
              updated_at: new Date().toISOString(),
            })
            .eq("id", existingOrgMethod.id)
            .select();
            
          console.log("Resultado de actualización:", { data: updateData, error });
          if (error) throw error;
        } else {
          // Insertar nuevo método para la organización
          console.log("Insertando nuevo método de pago para la organización");
          console.log("Datos de inserción:", {
            organization_id: organizationId,
            payment_method_code: values.payment_method_code,
            is_active: values.is_active,
            settings,
          });

          const { data: insertData, error } = await supabase
            .from("organization_payment_methods")
            .insert({
              organization_id: organizationId,
              payment_method_code: values.payment_method_code,
              is_active: values.is_active,
              settings,
              // Campos de Website
              show_on_website: values.show_on_website ?? true,
              website_display_order: values.website_display_order ?? 0,
              website_display_name: values.website_display_name || null,
              website_description: values.website_description || null,
              website_icon: values.website_icon || null,
            })
            .select();
            
          console.log("Resultado de inserción:", { data: insertData, error });
          if (error) throw error;
        }
      } else {
        // Actualizar método existente
        console.log("Actualizando método existente con ID:", selectedMethod.id);
        console.log("Datos de actualización:", {
          is_active: values.is_active,
          settings,
          updated_at: new Date().toISOString(),
        });

        const { data: updateData, error } = await supabase
          .from("organization_payment_methods")
          .update({
            is_active: values.is_active,
            settings,
            // Campos de Website
            show_on_website: values.show_on_website ?? true,
            website_display_order: values.website_display_order ?? 0,
            website_display_name: values.website_display_name || null,
            website_description: values.website_description || null,
            website_icon: values.website_icon || null,
            updated_at: new Date().toISOString(),
          })
          .eq("id", selectedMethod.id)
          .select();
          
        console.log("Resultado de actualización:", { data: updateData, error });
        if (error) throw error;
      }
      
      toast({
        title: "Método de pago guardado",
        description: "El método de pago ha sido configurado exitosamente",
      });
      
      onSaveComplete();
    } catch (error: any) {
      console.error("Error al guardar método de pago:", error);
      toast({
        title: "Error",
        description: "No se pudo guardar el método de pago: " + error.message,
        variant: "destructive",
      });
    } finally {
      setIsSaving(false);
    }
  };

  // Función wrapper para el submit del formulario
  const handleFormSubmit = (e: React.FormEvent) => {
    e.preventDefault(); // Prevenir comportamiento por defecto
    console.log("Formulario enviado manualmente");
    form.handleSubmit(onSubmit)(e); // Llamar a la función de envío de react-hook-form
  };

  return (
    <Form {...form}>
      <form onSubmit={handleFormSubmit} className="space-y-4 sm:space-y-6">
        {isNewMethod ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-sm dark:text-gray-200">Nombre del método</FormLabel>
                  <FormControl>
                    <Input 
                      placeholder="Ej. Transferencia Banco XYZ" 
                      {...field} 
                      className="dark:bg-gray-900 dark:border-gray-600 dark:text-gray-100 text-sm"
                    />
                  </FormControl>
                  <FormDescription className="text-xs dark:text-gray-400">
                    Nombre descriptivo para el método de pago
                  </FormDescription>
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
                    <Input 
                      placeholder="Ej. TRANSFER_XYZ" 
                      {...field} 
                      className="dark:bg-gray-900 dark:border-gray-600 dark:text-gray-100 text-sm"
                    />
                  </FormControl>
                  <FormDescription className="text-xs dark:text-gray-400">
                    Código único para el método de pago (sin espacios)
                  </FormDescription>
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
                  onValueChange={(value) => {
                    field.onChange(value);
                    handlePaymentMethodChange(value);
                  }}
                  value={field.value}
                  disabled={selectedMethod !== null}
                >
                  <FormControl>
                    <SelectTrigger className="dark:bg-gray-900 dark:border-gray-600 dark:text-gray-100 text-sm">
                      <SelectValue placeholder="Selecciona un método de pago" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent className="dark:bg-gray-900 dark:border-gray-700">
                    {/* Métodos Recomendados */}
                    {recommendedMethods.length > 0 && (
                      <>
                        <div className="px-2 py-1.5 text-xs font-semibold text-blue-600 bg-blue-50 dark:bg-blue-900/30 dark:text-blue-300 border-b dark:border-gray-700">
                          ★ Recomendados {countryCode && `para ${countryCode}`}
                        </div>
                        {recommendedMethods.map((method) => {
                          const globalMethod = globalMethods.find(gm => gm.code === method.code);
                          return globalMethod ? (
                            <SelectItem 
                              key={method.code} 
                              value={method.code}
                              className="bg-blue-50/50 dark:bg-blue-900/20 border-l-2 border-l-blue-400 dark:border-l-blue-600 dark:text-gray-200 dark:focus:bg-gray-800"
                            >
                              ★ {method.name}
                              {method.settings && Object.keys(method.settings).length > 0 && (
                                <span className="ml-2 text-xs text-blue-600">(Pre-configurado)</span>
                              )}
                            </SelectItem>
                          ) : null;
                        })}
                        <div className="px-2 py-1.5 text-xs font-semibold text-gray-600 dark:text-gray-300 bg-gray-50 dark:bg-gray-800 border-b dark:border-gray-700">
                          Otros métodos disponibles
                        </div>
                      </>
                    )}
                    {/* Métodos restantes (no recomendados) */}
                    {globalMethods
                      .filter(method => !recommendedMethods.some(rec => rec.code === method.code))
                      .map((method) => (
                        <SelectItem key={method.code} value={method.code} className="dark:text-gray-200 dark:focus:bg-gray-800">
                          {method.name} {method.is_system && "(Sistema)"}
                        </SelectItem>
                      ))
                    }
                    <SelectItem value="new" className="dark:text-gray-200 dark:focus:bg-gray-800">+ Crear nuevo método</SelectItem>
                  </SelectContent>
                </Select>
                <FormDescription className="text-xs dark:text-gray-400">
                  Selecciona el método de pago que deseas configurar
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />
        )}
        
        {/* Mostrar países del método de pago seleccionado */}
        {currentMethod && currentMethod.countries && currentMethod.countries.length > 0 && (
          <div className="flex items-center gap-2 p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800">
            <MapPin className="h-4 w-4 text-blue-600 dark:text-blue-400 flex-shrink-0" />
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm text-blue-700 dark:text-blue-300">Disponible en:</span>
              {currentMethod.countries.map((c: any) => (
                <Badge 
                  key={c.country_code}
                  variant="outline"
                  className={`text-xs ${
                    c.is_recommended 
                      ? 'bg-green-50 text-green-700 border-green-300 dark:bg-green-900/30 dark:text-green-400 dark:border-green-700' 
                      : 'bg-white dark:bg-gray-800 dark:text-gray-300 dark:border-gray-600'
                  }`}
                >
                  {c.country?.name || c.country_code}
                  {c.is_recommended && ' ★'}
                </Badge>
              ))}
            </div>
          </div>
        )}
        
        {/* Mensaje si no hay método seleccionado */}
        {!hasMethodSelected && !isNewMethod && (
          <Alert className="bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800">
            <AlertCircle className="h-4 w-4 text-amber-600" />
            <AlertDescription className="text-amber-700 dark:text-amber-300">
              Selecciona un método de pago para configurar las opciones adicionales.
            </AlertDescription>
          </Alert>
        )}
        
        <Tabs value={activeTab} onValueChange={setActiveTab} className="mt-4 sm:mt-6">
          <TabsList className="grid grid-cols-4 gap-2 p-2 mb-4 sm:mb-6 bg-gray-100 dark:bg-gray-800/80 rounded-lg h-auto">
            <TabsTrigger 
              value="general"
              disabled={!hasMethodSelected}
              className="text-xs sm:text-sm px-2 py-2.5 sm:px-4 sm:py-2 font-medium text-gray-700 dark:text-gray-300 data-[state=active]:bg-white dark:data-[state=active]:bg-gray-700 data-[state=active]:text-blue-600 dark:data-[state=active]:text-blue-400 data-[state=active]:shadow-sm transition-all rounded-md disabled:opacity-50 disabled:cursor-not-allowed"
            >
              General
            </TabsTrigger>
            <TabsTrigger 
              value="gateway"
              disabled={!hasMethodSelected}
              className="text-xs sm:text-sm px-2 py-2.5 sm:px-4 sm:py-2 font-medium text-gray-700 dark:text-gray-300 data-[state=active]:bg-white dark:data-[state=active]:bg-gray-700 data-[state=active]:text-blue-600 dark:data-[state=active]:text-blue-400 data-[state=active]:shadow-sm transition-all rounded-md disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <span className="hidden sm:inline">Integración de Pago</span>
              <span className="sm:hidden">Gateway</span>
            </TabsTrigger>
            <TabsTrigger 
              value="accounting"
              disabled={!hasMethodSelected}
              className="text-xs sm:text-sm px-2 py-2.5 sm:px-4 sm:py-2 font-medium text-gray-700 dark:text-gray-300 data-[state=active]:bg-white dark:data-[state=active]:bg-gray-700 data-[state=active]:text-blue-600 dark:data-[state=active]:text-blue-400 data-[state=active]:shadow-sm transition-all rounded-md disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Contabilidad
            </TabsTrigger>
            <TabsTrigger 
              value="website"
              disabled={!hasMethodSelected}
              className="text-xs sm:text-sm px-2 py-2.5 sm:px-4 sm:py-2 font-medium text-gray-700 dark:text-gray-300 data-[state=active]:bg-white dark:data-[state=active]:bg-gray-700 data-[state=active]:text-blue-600 dark:data-[state=active]:text-blue-400 data-[state=active]:shadow-sm transition-all rounded-md disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Globe className="h-3 w-3 sm:h-4 sm:w-4 mr-1" />
              <span className="hidden sm:inline">Website</span>
            </TabsTrigger>
          </TabsList>
          
          <TabsContent value="general">
            <div className="space-y-3 sm:space-y-4">
              <FormField
                control={form.control}
                name="is_active"
                render={({ field }) => (
                  <FormItem className="flex flex-col sm:flex-row sm:items-center sm:justify-between rounded-lg border dark:border-gray-700 p-3 sm:p-4 space-y-2 sm:space-y-0">
                    <div className="space-y-0.5 flex-1">
                      <FormLabel className="text-sm sm:text-base dark:text-gray-200">Habilitar método</FormLabel>
                      <FormDescription className="text-xs dark:text-gray-400">
                        Habilitar este método de pago para su uso en la organización
                      </FormDescription>
                    </div>
                    <FormControl>
                      <Switch
                        checked={field.value}
                        onCheckedChange={field.onChange}
                        className="data-[state=checked]:bg-blue-600"
                      />
                    </FormControl>
                  </FormItem>
                )}
              />
              
              <FormField
                control={form.control}
                name="requires_reference"
                render={({ field }) => (
                  <FormItem className="flex flex-col sm:flex-row sm:items-center sm:justify-between rounded-lg border dark:border-gray-700 p-3 sm:p-4 space-y-2 sm:space-y-0">
                    <div className="space-y-0.5 flex-1">
                      <FormLabel className="text-sm sm:text-base dark:text-gray-200">Requiere referencia</FormLabel>
                      <FormDescription className="text-xs dark:text-gray-400">
                        Solicitar número de referencia o transacción al procesar pagos
                      </FormDescription>
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
          </TabsContent>
          
          <TabsContent value="gateway">
            <div className="space-y-3 sm:space-y-4">
              <FormField
                control={form.control}
                name="gateway"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-sm dark:text-gray-200">Integración de pago</FormLabel>
                    <Select
                      onValueChange={field.onChange}
                      value={field.value}
                    >
                      <FormControl>
                        <SelectTrigger className="dark:bg-gray-900 dark:border-gray-600 dark:text-gray-100 text-sm">
                          <SelectValue placeholder="Selecciona un gateway" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent className="dark:bg-gray-900 dark:border-gray-700">
                        {gatewayOptions.map((option) => (
                          <SelectItem key={option.value} value={option.value} className="dark:text-gray-200 dark:focus:bg-gray-800">
                            {option.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormDescription className="text-xs dark:text-gray-400">
                      Selecciona el pasarelas de pagos en línea (si aplica)
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {form.watch("gateway") && (
                <>
                  <Separator className="my-4 sm:my-6 dark:bg-gray-700" />
                  <PaymentMethodGatewayConfig
                    organizationId={organizationId}
                    paymentMethodCode={selectedMethod?.payment_method_code || form.watch("payment_method_code") || ""}
                    gateway={form.watch("gateway") || ""}
                    config={gatewayConfig}
                    onConfigChange={(config) => handleSaveGatewayConfig(form.watch("gateway") || "", config)}
                  />
                </>
              )}
            </div>
          </TabsContent>
          
          <TabsContent value="accounting">
            <AccountMappingForm
              initialMapping={accountMapping}
              onSave={handleSaveAccountMapping}
            />
          </TabsContent>
          
          <TabsContent value="website">
            <div className="space-y-4">
              <Alert className="bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800">
                <Globe className="h-4 w-4 text-blue-600" />
                <AlertDescription className="text-sm text-blue-800 dark:text-blue-200">
                  Configura cómo se mostrará este método de pago en tu sitio web público.
                </AlertDescription>
              </Alert>
              
              <FormField
                control={form.control}
                name="show_on_website"
                render={({ field }) => (
                  <FormItem className="flex flex-col sm:flex-row sm:items-center sm:justify-between rounded-lg border dark:border-gray-700 p-3 sm:p-4 space-y-2 sm:space-y-0">
                    <div className="space-y-0.5 flex-1">
                      <FormLabel className="text-sm sm:text-base dark:text-gray-200">Mostrar en Website</FormLabel>
                      <FormDescription className="text-xs dark:text-gray-400">
                        Habilitar este método de pago para clientes en el sitio web
                      </FormDescription>
                    </div>
                    <FormControl>
                      <Switch
                        checked={field.value}
                        onCheckedChange={field.onChange}
                        className="data-[state=checked]:bg-blue-600"
                      />
                    </FormControl>
                  </FormItem>
                )}
              />
              
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="website_display_name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-sm dark:text-gray-200">Nombre para mostrar</FormLabel>
                      <FormControl>
                        <Input 
                          placeholder="Ej: Pago con Tarjeta" 
                          {...field}
                          value={field.value || ''}
                          className="dark:bg-gray-900 dark:border-gray-600 dark:text-gray-100 text-sm"
                        />
                      </FormControl>
                      <FormDescription className="text-xs dark:text-gray-400">
                        Nombre personalizado que verán los clientes
                      </FormDescription>
                    </FormItem>
                  )}
                />
                
                <FormField
                  control={form.control}
                  name="website_display_order"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-sm dark:text-gray-200">Orden de visualización</FormLabel>
                      <FormControl>
                        <Input 
                          type="number"
                          min="0"
                          placeholder="0" 
                          {...field}
                          value={field.value || 0}
                          onChange={(e) => field.onChange(parseInt(e.target.value) || 0)}
                          className="dark:bg-gray-900 dark:border-gray-600 dark:text-gray-100 text-sm"
                        />
                      </FormControl>
                      <FormDescription className="text-xs dark:text-gray-400">
                        Menor número = mayor prioridad
                      </FormDescription>
                    </FormItem>
                  )}
                />
              </div>
              
              <FormField
                control={form.control}
                name="website_icon"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-sm dark:text-gray-200">Icono (opcional)</FormLabel>
                    <FormControl>
                      <Input 
                        placeholder="Ej: credit-card, banknote, wallet" 
                        {...field}
                        value={field.value || ''}
                        className="dark:bg-gray-900 dark:border-gray-600 dark:text-gray-100 text-sm"
                      />
                    </FormControl>
                    <FormDescription className="text-xs dark:text-gray-400">
                      Nombre del icono de Lucide o URL de imagen
                    </FormDescription>
                  </FormItem>
                )}
              />
              
              <FormField
                control={form.control}
                name="website_description"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-sm dark:text-gray-200">Instrucciones para el cliente</FormLabel>
                    <FormControl>
                      <Textarea 
                        placeholder="Ej: Realiza tu pago de forma segura con tarjeta de crédito o débito..." 
                        {...field}
                        value={field.value || ''}
                        rows={3}
                        className="dark:bg-gray-900 dark:border-gray-600 dark:text-gray-100 text-sm resize-none"
                      />
                    </FormControl>
                    <FormDescription className="text-xs dark:text-gray-400">
                      Descripción o instrucciones que verá el cliente al seleccionar este método
                    </FormDescription>
                  </FormItem>
                )}
              />
            </div>
          </TabsContent>
        </Tabs>
        
        <div className="flex flex-col sm:flex-row justify-end gap-2 sm:space-x-2 pt-4 sm:pt-6">
          <Button 
            type="button" 
            variant="outline" 
            onClick={onCancel} 
            disabled={isSaving}
            className="w-full sm:w-auto dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700 text-sm"
          >
            Cancelar
          </Button>
          <Button 
            type="button" 
            onClick={(e) => {
              console.log("Botón Guardar clickeado");
              handleFormSubmit(e as any);
            }} 
            disabled={isSaving}
            className="w-full sm:w-auto dark:bg-blue-600 dark:hover:bg-blue-700 text-sm"
          >
            {isSaving && <Loader2 className="mr-2 h-3 w-3 sm:h-4 sm:w-4 animate-spin" />}
            Guardar
          </Button>
        </div>
      </form>
    </Form>
  );
}
=======
"use client";

import { useState, useEffect } from "react";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Checkbox } from "@/components/ui/checkbox";
import { Separator } from "@/components/ui/separator";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AlertCircle, Loader2, Globe, MapPin } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { PaymentMethod, OrganizationPaymentMethod } from "./PaymentMethodsPage";
import PaymentMethodGatewayConfig from "@/components/finanzas/metodos-pago/PaymentMethodGatewayConfig";
import AccountMappingForm from "@/components/finanzas/metodos-pago/AccountMappingForm";

interface PaymentMethodFormProps {
  organizationId: number;
  globalMethods: PaymentMethod[];
  recommendedMethods?: any[]; // Agregar métodos recomendados
  countryCode?: string | null;
  selectedMethod: OrganizationPaymentMethod | null;
  onSaveComplete: () => void;
  onCancel: () => void;
}

const gatewayOptions = [
  { label: "Ninguno", value: "none" },
  { label: "Stripe", value: "stripe" },
  { label: "PayU", value: "payu" },
  { label: "Mercado Pago", value: "mercadopago" },
  { label: "Wompi", value: "wompi" },
  { label: "Conekta", value: "conekta" },
  { label: "PayPal", value: "paypal" }
];

// Mapeo de métodos de pago a su pasarela correspondiente
// Si el método de pago tiene una pasarela implícita, se usa automáticamente
const METHOD_TO_GATEWAY: Record<string, string> = {
  'payu': 'payu',
  'stripe': 'stripe',
  'mp': 'mercadopago',
  'mercadopago': 'mercadopago',
  'wompi': 'wompi',
  'conekta': 'conekta',
  'paypal': 'paypal',
};

// Métodos que tienen pasarela implícita (no mostrar selector)
const IMPLICIT_GATEWAY_METHODS = Object.keys(METHOD_TO_GATEWAY);

// Esquema de validación para el formulario
const formSchema = z.object({
  payment_method_code: z.string().min(1, "Debes seleccionar un método de pago"),
  is_active: z.boolean().default(true),
  gateway: z.string().optional(),
  requires_reference: z.boolean().default(false),
  name: z.string().min(3, "El nombre debe tener al menos 3 caracteres").optional(),
  code: z.string().min(2, "El código debe tener al menos 2 caracteres").optional(),
  // Campos de Website
  show_on_website: z.boolean().default(true),
  website_display_order: z.number().default(0),
  website_display_name: z.string().optional(),
  website_description: z.string().optional(),
  website_icon: z.string().optional(),
}).passthrough(); // Permitir propiedades adicionales

// Definir el tipo FormValues para el formulario
interface FormValues {
  payment_method_code: string;
  is_active: boolean;
  requires_reference: boolean;
  gateway?: string;
  name?: string;
  code?: string;
  // Campos de Website
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
  const [isSaving, setIsSaving] = useState(false);
  const [isNewMethod, setIsNewMethod] = useState(false);
  const [activeTab, setActiveTab] = useState("general");
  const [gatewayConfig, setGatewayConfig] = useState<Record<string, any>>({});
  const [accountMapping, setAccountMapping] = useState<Record<string, string>>({});
  
  // Configuración del formulario con React Hook Form y Zod
  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema) as any,
    defaultValues: {
      payment_method_code: selectedMethod?.payment_method_code || "",
      is_active: selectedMethod?.is_active ?? true,
      gateway: selectedMethod?.settings?.gateway || "",
      requires_reference: selectedMethod?.payment_method?.requires_reference ?? false,
      name: "",
      code: "",
      // Campos de Website
      show_on_website: selectedMethod?.show_on_website ?? true,
      website_display_order: selectedMethod?.website_display_order ?? 0,
      website_display_name: selectedMethod?.website_display_name || "",
      website_description: selectedMethod?.website_description || "",
      website_icon: selectedMethod?.website_icon || "",
    } as FormValues,
  });

  // Estado para verificar si hay un método seleccionado (para habilitar tabs)
  const currentMethodCode = form.watch("payment_method_code");
  const hasMethodSelected = !!currentMethodCode || isNewMethod || selectedMethod !== null;
  
  // Obtener el método seleccionado actual para mostrar sus países
  const currentMethod = globalMethods.find(m => m.code === currentMethodCode);

  // Cargar datos del método seleccionado
  useEffect(() => {
    if (selectedMethod) {
      form.reset({
        payment_method_code: selectedMethod.payment_method_code,
        is_active: selectedMethod.is_active,
        gateway: selectedMethod.settings?.gateway || "",
        requires_reference: selectedMethod.payment_method?.requires_reference || false,
        // Campos de Website
        show_on_website: selectedMethod.show_on_website ?? true,
        website_display_order: selectedMethod.website_display_order ?? 0,
        website_display_name: selectedMethod.website_display_name || "",
        website_description: selectedMethod.website_description || "",
        website_icon: selectedMethod.website_icon || "",
      });

      // Cargar configuración de gateway y mapeo de cuentas
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
    console.log("Método de pago seleccionado:", code);
    const isNew = code === "new";
    setIsNewMethod(isNew);
    
    if (!isNew) {
      // Buscar el método global por código
      const method = globalMethods.find(m => m.code === code);
      console.log("Método encontrado:", method);
      
      if (method) {
        // Buscar si es un método recomendado para aplicar configuración especial
        const recommendedMethod = recommendedMethods.find(rec => rec.code === code);
        
        // Configurar gateway por defecto basado en el método de pago
        const lowerCode = code.toLowerCase();
        let defaultGateway = METHOD_TO_GATEWAY[lowerCode] || "none";
        let recommendedConfig = {};
        
        if (recommendedMethod && recommendedMethod.settings) {
          // Si es recomendado y tiene configuración, aplicarla
          if (recommendedMethod.settings.gateway && typeof recommendedMethod.settings.gateway === 'string') {
            defaultGateway = recommendedMethod.settings.gateway;
          }
          recommendedConfig = recommendedMethod.settings.gateway_config || {};
        }
        
        // Reiniciar el formulario con valores predeterminados
        form.reset({
          payment_method_code: method.code,
          name: method.name,
          code: method.code,
          requires_reference: method.requires_reference,
          is_active: true,
          gateway: defaultGateway,
        });
        
        // Configurar los estados iniciales para settings
        setGatewayConfig(recommendedConfig);
        setAccountMapping({});
        
        console.log("Formulario configurado para:", method.name, recommendedMethod ? "(Método recomendado)" : "(Método estándar)");
      }
    }
  };

  // Guardar configuración de gateway
  const handleSaveGatewayConfig = async (gateway: string, config: Record<string, any>) => {
    setGatewayConfig(config);
    toast({
      title: "Configuración guardada",
      description: "La configuración del gateway ha sido guardada temporalmente. Recuerda guardar el método de pago para confirmar los cambios.",
    });
  };

  // Guardar mapeo de cuentas
  const handleSaveAccountMapping = (mapping: Record<string, string>) => {
    setAccountMapping(mapping);
    toast({
      title: "Mapeo guardado",
      description: "El mapeo de cuentas ha sido guardado temporalmente. Recuerda guardar el método de pago para confirmar los cambios.",
    });
  };

  // Envío del formulario
  const onSubmit = async (values: FormValues) => {
    try {
      setIsSaving(true);
      console.log("Guardando método de pago con valores:", values);
      console.log("ID de organización:", organizationId);
      console.log("Es método seleccionado:", selectedMethod !== null);
      console.log("Es método nuevo:", isNewMethod);
      
      // Validar que tenemos un ID de organización
      if (!organizationId) {
        throw new Error("No se pudo determinar el ID de la organización");
      }
      
      // Si es un nuevo método personalizado
      if (isNewMethod && values.name && values.code) {
        // Verificar si ya existe un código similar
        const { data: existingMethod, error: checkError } = await supabase
          .from("payment_methods")
          .select("code")
          .eq("code", values.code)
          .single();
          
        if (checkError && checkError.code !== "PGRST116") { // No es error "no encontrado"
          throw checkError;
        }
        
        if (existingMethod) {
          toast({
            title: "Error",
            description: "Ya existe un método de pago con este código",
            variant: "destructive",
          });
          return;
        }
        
        // Insertar nuevo método de pago global
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
        
        // Actualizar el código de método para la siguiente operación
        values.payment_method_code = values.code;
      }
      
      // Validar que tenemos un código de método de pago
      if (!values.payment_method_code) {
        throw new Error("No se ha seleccionado un método de pago válido");
      }
      
      // Construir objeto de configuración
      const settings = {
        gateway: values.gateway === "none" ? "" : values.gateway, // Convertir "none" a cadena vacía
        gateway_config: Object.keys(gatewayConfig).length > 0 ? gatewayConfig : undefined,
        account_mapping: Object.keys(accountMapping).length > 0 ? accountMapping : undefined,
      };
      
      // Comprobar si ya existe este método para la organización
      if (!selectedMethod?.id) {
        const { data: existingOrgMethod, error: checkOrgError } = await supabase
          .from("organization_payment_methods")
          .select("id")
          .eq("organization_id", organizationId)
          .eq("payment_method_code", values.payment_method_code)
          .maybeSingle();
          
        console.log("Verificando si ya existe:", { existingOrgMethod, checkOrgError });
        
        if (checkOrgError) {
          console.error("Error al verificar método existente:", checkOrgError);
        }
        
        // Si ya existe, actualizar en lugar de insertar
        if (existingOrgMethod?.id) {
          console.log("El método ya existe para esta organización. Actualizando ID:", existingOrgMethod.id);
          
          const { data: updateData, error } = await supabase
            .from("organization_payment_methods")
            .update({
              is_active: values.is_active,
              settings,
              // Campos de Website
              show_on_website: values.show_on_website ?? true,
              website_display_order: values.website_display_order ?? 0,
              website_display_name: values.website_display_name || null,
              website_description: values.website_description || null,
              website_icon: values.website_icon || null,
              updated_at: new Date().toISOString(),
            })
            .eq("id", existingOrgMethod.id)
            .select();
            
          console.log("Resultado de actualización:", { data: updateData, error });
          if (error) throw error;
        } else {
          // Insertar nuevo método para la organización
          console.log("Insertando nuevo método de pago para la organización");
          console.log("Datos de inserción:", {
            organization_id: organizationId,
            payment_method_code: values.payment_method_code,
            is_active: values.is_active,
            settings,
          });

          const { data: insertData, error } = await supabase
            .from("organization_payment_methods")
            .insert({
              organization_id: organizationId,
              payment_method_code: values.payment_method_code,
              is_active: values.is_active,
              settings,
              // Campos de Website
              show_on_website: values.show_on_website ?? true,
              website_display_order: values.website_display_order ?? 0,
              website_display_name: values.website_display_name || null,
              website_description: values.website_description || null,
              website_icon: values.website_icon || null,
            })
            .select();
            
          console.log("Resultado de inserción:", { data: insertData, error });
          if (error) throw error;
        }
      } else {
        // Actualizar método existente
        console.log("Actualizando método existente con ID:", selectedMethod.id);
        console.log("Datos de actualización:", {
          is_active: values.is_active,
          settings,
          updated_at: new Date().toISOString(),
        });

        const { data: updateData, error } = await supabase
          .from("organization_payment_methods")
          .update({
            is_active: values.is_active,
            settings,
            // Campos de Website
            show_on_website: values.show_on_website ?? true,
            website_display_order: values.website_display_order ?? 0,
            website_display_name: values.website_display_name || null,
            website_description: values.website_description || null,
            website_icon: values.website_icon || null,
            updated_at: new Date().toISOString(),
          })
          .eq("id", selectedMethod.id)
          .select();
          
        console.log("Resultado de actualización:", { data: updateData, error });
        if (error) throw error;
      }
      
      toast({
        title: "Método de pago guardado",
        description: "El método de pago ha sido configurado exitosamente",
      });
      
      onSaveComplete();
    } catch (error: any) {
      console.error("Error al guardar método de pago:", error);
      toast({
        title: "Error",
        description: "No se pudo guardar el método de pago: " + error.message,
        variant: "destructive",
      });
    } finally {
      setIsSaving(false);
    }
  };

  // Función wrapper para el submit del formulario
  const handleFormSubmit = (e: React.FormEvent) => {
    e.preventDefault(); // Prevenir comportamiento por defecto
    console.log("Formulario enviado manualmente");
    form.handleSubmit(onSubmit)(e); // Llamar a la función de envío de react-hook-form
  };

  return (
    <Form {...form}>
      <form onSubmit={handleFormSubmit} className="space-y-4 sm:space-y-6">
        {isNewMethod ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-sm dark:text-gray-200">Nombre del método</FormLabel>
                  <FormControl>
                    <Input 
                      placeholder="Ej. Transferencia Banco XYZ" 
                      {...field} 
                      className="dark:bg-gray-900 dark:border-gray-600 dark:text-gray-100 text-sm"
                    />
                  </FormControl>
                  <FormDescription className="text-xs dark:text-gray-400">
                    Nombre descriptivo para el método de pago
                  </FormDescription>
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
                    <Input 
                      placeholder="Ej. TRANSFER_XYZ" 
                      {...field} 
                      className="dark:bg-gray-900 dark:border-gray-600 dark:text-gray-100 text-sm"
                    />
                  </FormControl>
                  <FormDescription className="text-xs dark:text-gray-400">
                    Código único para el método de pago (sin espacios)
                  </FormDescription>
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
                  onValueChange={(value) => {
                    field.onChange(value);
                    handlePaymentMethodChange(value);
                  }}
                  value={field.value}
                  disabled={selectedMethod !== null}
                >
                  <FormControl>
                    <SelectTrigger className="dark:bg-gray-900 dark:border-gray-600 dark:text-gray-100 text-sm">
                      <SelectValue placeholder="Selecciona un método de pago" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent className="dark:bg-gray-900 dark:border-gray-700">
                    {/* Métodos Recomendados */}
                    {recommendedMethods.length > 0 && (
                      <>
                        <div className="px-2 py-1.5 text-xs font-semibold text-blue-600 bg-blue-50 dark:bg-blue-900/30 dark:text-blue-300 border-b dark:border-gray-700">
                          ★ Recomendados {countryCode && `para ${countryCode}`}
                        </div>
                        {recommendedMethods.map((method) => {
                          const globalMethod = globalMethods.find(gm => gm.code === method.code);
                          return globalMethod ? (
                            <SelectItem 
                              key={method.code} 
                              value={method.code}
                              className="bg-blue-50/50 dark:bg-blue-900/20 border-l-2 border-l-blue-400 dark:border-l-blue-600 dark:text-gray-200 dark:focus:bg-gray-800"
                            >
                              ★ {method.name}
                              {method.settings && Object.keys(method.settings).length > 0 && (
                                <span className="ml-2 text-xs text-blue-600">(Pre-configurado)</span>
                              )}
                            </SelectItem>
                          ) : null;
                        })}
                        <div className="px-2 py-1.5 text-xs font-semibold text-gray-600 dark:text-gray-300 bg-gray-50 dark:bg-gray-800 border-b dark:border-gray-700">
                          Otros métodos disponibles
                        </div>
                      </>
                    )}
                    {/* Métodos restantes (no recomendados) */}
                    {globalMethods
                      .filter(method => !recommendedMethods.some(rec => rec.code === method.code))
                      .map((method) => (
                        <SelectItem key={method.code} value={method.code} className="dark:text-gray-200 dark:focus:bg-gray-800">
                          {method.name} {method.is_system && "(Sistema)"}
                        </SelectItem>
                      ))
                    }
                    <SelectItem value="new" className="dark:text-gray-200 dark:focus:bg-gray-800">+ Crear nuevo método</SelectItem>
                  </SelectContent>
                </Select>
                <FormDescription className="text-xs dark:text-gray-400">
                  Selecciona el método de pago que deseas configurar
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />
        )}
        
        {/* Mostrar países del método de pago seleccionado */}
        {currentMethod && currentMethod.countries && currentMethod.countries.length > 0 && (
          <div className="flex items-center gap-2 p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800">
            <MapPin className="h-4 w-4 text-blue-600 dark:text-blue-400 flex-shrink-0" />
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm text-blue-700 dark:text-blue-300">Disponible en:</span>
              {currentMethod.countries.map((c: any) => (
                <Badge 
                  key={c.country_code}
                  variant="outline"
                  className={`text-xs ${
                    c.is_recommended 
                      ? 'bg-green-50 text-green-700 border-green-300 dark:bg-green-900/30 dark:text-green-400 dark:border-green-700' 
                      : 'bg-white dark:bg-gray-800 dark:text-gray-300 dark:border-gray-600'
                  }`}
                >
                  {c.country?.name || c.country_code}
                  {c.is_recommended && ' ★'}
                </Badge>
              ))}
            </div>
          </div>
        )}
        
        {/* Mensaje si no hay método seleccionado */}
        {!hasMethodSelected && !isNewMethod && (
          <Alert className="bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800">
            <AlertCircle className="h-4 w-4 text-amber-600" />
            <AlertDescription className="text-amber-700 dark:text-amber-300">
              Selecciona un método de pago para configurar las opciones adicionales.
            </AlertDescription>
          </Alert>
        )}
        
        <Tabs value={activeTab} onValueChange={setActiveTab} className="mt-4 sm:mt-6">
          <TabsList className="grid grid-cols-4 gap-2 p-2 mb-4 sm:mb-6 bg-gray-100 dark:bg-gray-800/80 rounded-lg h-auto">
            <TabsTrigger 
              value="general"
              disabled={!hasMethodSelected}
              className="text-xs sm:text-sm px-2 py-2.5 sm:px-4 sm:py-2 font-medium text-gray-700 dark:text-gray-300 data-[state=active]:bg-white dark:data-[state=active]:bg-gray-700 data-[state=active]:text-blue-600 dark:data-[state=active]:text-blue-400 data-[state=active]:shadow-sm transition-all rounded-md disabled:opacity-50 disabled:cursor-not-allowed"
            >
              General
            </TabsTrigger>
            <TabsTrigger 
              value="gateway"
              disabled={!hasMethodSelected}
              className="text-xs sm:text-sm px-2 py-2.5 sm:px-4 sm:py-2 font-medium text-gray-700 dark:text-gray-300 data-[state=active]:bg-white dark:data-[state=active]:bg-gray-700 data-[state=active]:text-blue-600 dark:data-[state=active]:text-blue-400 data-[state=active]:shadow-sm transition-all rounded-md disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <span className="hidden sm:inline">Integración de Pago</span>
              <span className="sm:hidden">Gateway</span>
            </TabsTrigger>
            <TabsTrigger 
              value="accounting"
              disabled={!hasMethodSelected}
              className="text-xs sm:text-sm px-2 py-2.5 sm:px-4 sm:py-2 font-medium text-gray-700 dark:text-gray-300 data-[state=active]:bg-white dark:data-[state=active]:bg-gray-700 data-[state=active]:text-blue-600 dark:data-[state=active]:text-blue-400 data-[state=active]:shadow-sm transition-all rounded-md disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Contabilidad
            </TabsTrigger>
            <TabsTrigger 
              value="website"
              disabled={!hasMethodSelected}
              className="text-xs sm:text-sm px-2 py-2.5 sm:px-4 sm:py-2 font-medium text-gray-700 dark:text-gray-300 data-[state=active]:bg-white dark:data-[state=active]:bg-gray-700 data-[state=active]:text-blue-600 dark:data-[state=active]:text-blue-400 data-[state=active]:shadow-sm transition-all rounded-md disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Globe className="h-3 w-3 sm:h-4 sm:w-4 mr-1" />
              <span className="hidden sm:inline">Website</span>
            </TabsTrigger>
          </TabsList>
          
          <TabsContent value="general">
            <div className="space-y-3 sm:space-y-4">
              <FormField
                control={form.control}
                name="is_active"
                render={({ field }) => (
                  <FormItem className="flex flex-col sm:flex-row sm:items-center sm:justify-between rounded-lg border dark:border-gray-700 p-3 sm:p-4 space-y-2 sm:space-y-0">
                    <div className="space-y-0.5 flex-1">
                      <FormLabel className="text-sm sm:text-base dark:text-gray-200">Habilitar método</FormLabel>
                      <FormDescription className="text-xs dark:text-gray-400">
                        Habilitar este método de pago para su uso en la organización
                      </FormDescription>
                    </div>
                    <FormControl>
                      <Switch
                        checked={field.value}
                        onCheckedChange={field.onChange}
                        className="data-[state=checked]:bg-blue-600"
                      />
                    </FormControl>
                  </FormItem>
                )}
              />
              
              <FormField
                control={form.control}
                name="requires_reference"
                render={({ field }) => (
                  <FormItem className="flex flex-col sm:flex-row sm:items-center sm:justify-between rounded-lg border dark:border-gray-700 p-3 sm:p-4 space-y-2 sm:space-y-0">
                    <div className="space-y-0.5 flex-1">
                      <FormLabel className="text-sm sm:text-base dark:text-gray-200">Requiere referencia</FormLabel>
                      <FormDescription className="text-xs dark:text-gray-400">
                        Solicitar número de referencia o transacción al procesar pagos
                      </FormDescription>
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
          </TabsContent>
          
          <TabsContent value="gateway">
            <div className="space-y-3 sm:space-y-4">
              {/* Mostrar info cuando el método tiene pasarela implícita */}
              {currentMethodCode && IMPLICIT_GATEWAY_METHODS.includes(currentMethodCode.toLowerCase()) ? (
                <div className="p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800">
                  <div className="flex items-center gap-2 mb-2">
                    <Badge className="bg-blue-100 text-blue-800 dark:bg-blue-900/50 dark:text-blue-300">
                      {gatewayOptions.find(g => g.value === form.watch("gateway"))?.label || form.watch("gateway")}
                    </Badge>
                    <span className="text-sm text-blue-700 dark:text-blue-300">
                      Pasarela detectada automáticamente
                    </span>
                  </div>
                  <p className="text-xs text-blue-600 dark:text-blue-400">
                    Este método de pago usa la pasarela <strong>{gatewayOptions.find(g => g.value === form.watch("gateway"))?.label}</strong>. 
                    Configura las credenciales a continuación.
                  </p>
                </div>
              ) : (
                <FormField
                  control={form.control}
                  name="gateway"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-sm dark:text-gray-200">Integración de pago</FormLabel>
                      <Select
                        onValueChange={field.onChange}
                        value={field.value}
                      >
                        <FormControl>
                          <SelectTrigger className="dark:bg-gray-900 dark:border-gray-600 dark:text-gray-100 text-sm">
                            <SelectValue placeholder="Selecciona un gateway" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent className="dark:bg-gray-900 dark:border-gray-700">
                          {gatewayOptions.map((option) => (
                            <SelectItem key={option.value} value={option.value} className="dark:text-gray-200 dark:focus:bg-gray-800">
                              {option.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormDescription className="text-xs dark:text-gray-400">
                        Selecciona la pasarela de pagos en línea (si aplica)
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}

              {form.watch("gateway") && form.watch("gateway") !== "none" && (
                <>
                  <Separator className="my-4 sm:my-6 dark:bg-gray-700" />
                  <PaymentMethodGatewayConfig
                    organizationId={organizationId}
                    paymentMethodCode={selectedMethod?.payment_method_code || form.watch("payment_method_code") || ""}
                    gateway={form.watch("gateway") || ""}
                    config={gatewayConfig}
                    onConfigChange={(config) => handleSaveGatewayConfig(form.watch("gateway") || "", config)}
                  />
                </>
              )}
            </div>
          </TabsContent>
          
          <TabsContent value="accounting">
            <AccountMappingForm
              initialMapping={accountMapping}
              onSave={handleSaveAccountMapping}
            />
          </TabsContent>
          
          <TabsContent value="website">
            <div className="space-y-4">
              <Alert className="bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800">
                <Globe className="h-4 w-4 text-blue-600" />
                <AlertDescription className="text-sm text-blue-800 dark:text-blue-200">
                  Configura cómo se mostrará este método de pago en tu sitio web público.
                </AlertDescription>
              </Alert>
              
              <FormField
                control={form.control}
                name="show_on_website"
                render={({ field }) => (
                  <FormItem className="flex flex-col sm:flex-row sm:items-center sm:justify-between rounded-lg border dark:border-gray-700 p-3 sm:p-4 space-y-2 sm:space-y-0">
                    <div className="space-y-0.5 flex-1">
                      <FormLabel className="text-sm sm:text-base dark:text-gray-200">Mostrar en Website</FormLabel>
                      <FormDescription className="text-xs dark:text-gray-400">
                        Habilitar este método de pago para clientes en el sitio web
                      </FormDescription>
                    </div>
                    <FormControl>
                      <Switch
                        checked={field.value}
                        onCheckedChange={field.onChange}
                        className="data-[state=checked]:bg-blue-600"
                      />
                    </FormControl>
                  </FormItem>
                )}
              />
              
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="website_display_name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-sm dark:text-gray-200">Nombre para mostrar</FormLabel>
                      <FormControl>
                        <Input 
                          placeholder="Ej: Pago con Tarjeta" 
                          {...field}
                          value={field.value || ''}
                          className="dark:bg-gray-900 dark:border-gray-600 dark:text-gray-100 text-sm"
                        />
                      </FormControl>
                      <FormDescription className="text-xs dark:text-gray-400">
                        Nombre personalizado que verán los clientes
                      </FormDescription>
                    </FormItem>
                  )}
                />
                
                <FormField
                  control={form.control}
                  name="website_display_order"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-sm dark:text-gray-200">Orden de visualización</FormLabel>
                      <FormControl>
                        <Input 
                          type="number"
                          min="0"
                          placeholder="0" 
                          {...field}
                          value={field.value || 0}
                          onChange={(e) => field.onChange(parseInt(e.target.value) || 0)}
                          className="dark:bg-gray-900 dark:border-gray-600 dark:text-gray-100 text-sm"
                        />
                      </FormControl>
                      <FormDescription className="text-xs dark:text-gray-400">
                        Menor número = mayor prioridad
                      </FormDescription>
                    </FormItem>
                  )}
                />
              </div>
              
              <FormField
                control={form.control}
                name="website_icon"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-sm dark:text-gray-200">Icono (opcional)</FormLabel>
                    <FormControl>
                      <Input 
                        placeholder="Ej: credit-card, banknote, wallet" 
                        {...field}
                        value={field.value || ''}
                        className="dark:bg-gray-900 dark:border-gray-600 dark:text-gray-100 text-sm"
                      />
                    </FormControl>
                    <FormDescription className="text-xs dark:text-gray-400">
                      Nombre del icono de Lucide o URL de imagen
                    </FormDescription>
                  </FormItem>
                )}
              />
              
              <FormField
                control={form.control}
                name="website_description"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-sm dark:text-gray-200">Instrucciones para el cliente</FormLabel>
                    <FormControl>
                      <Textarea 
                        placeholder="Ej: Realiza tu pago de forma segura con tarjeta de crédito o débito..." 
                        {...field}
                        value={field.value || ''}
                        rows={3}
                        className="dark:bg-gray-900 dark:border-gray-600 dark:text-gray-100 text-sm resize-none"
                      />
                    </FormControl>
                    <FormDescription className="text-xs dark:text-gray-400">
                      Descripción o instrucciones que verá el cliente al seleccionar este método
                    </FormDescription>
                  </FormItem>
                )}
              />
            </div>
          </TabsContent>
        </Tabs>
        
        <div className="flex flex-col sm:flex-row justify-end gap-2 sm:space-x-2 pt-4 sm:pt-6">
          <Button 
            type="button" 
            variant="outline" 
            onClick={onCancel} 
            disabled={isSaving}
            className="w-full sm:w-auto dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700 text-sm"
          >
            Cancelar
          </Button>
          <Button 
            type="button" 
            onClick={(e) => {
              console.log("Botón Guardar clickeado");
              handleFormSubmit(e as any);
            }} 
            disabled={isSaving}
            className="w-full sm:w-auto dark:bg-blue-600 dark:hover:bg-blue-700 text-sm"
          >
            {isSaving && <Loader2 className="mr-2 h-3 w-3 sm:h-4 sm:w-4 animate-spin" />}
            Guardar
          </Button>
        </div>
      </form>
    </Form>
  );
}
>>>>>>> C:/Users/USUARIO/.windsurf/worktrees/go-admin-erp/go-admin-erp-f372080e/src/components/finanzas/metodos-pago/PaymentMethodForm.tsx
