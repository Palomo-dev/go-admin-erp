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
import { AlertCircle, Loader2 } from "lucide-react";
import { PaymentMethod, OrganizationPaymentMethod } from "./PaymentMethodsPage";
import PaymentMethodGatewayConfig from "@/components/finanzas/metodos-pago/PaymentMethodGatewayConfig";
import AccountMappingForm from "@/components/finanzas/metodos-pago/AccountMappingForm";

interface PaymentMethodFormProps {
  organizationId: number;
  globalMethods: PaymentMethod[];
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
}).passthrough(); // Permitir propiedades adicionales

// Definir el tipo FormValues para el formulario
interface FormValues {
  payment_method_code: string;
  is_active: boolean;
  requires_reference: boolean;
  gateway?: string;
  name?: string;
  code?: string;
  [key: string]: any;
}

export default function PaymentMethodForm({
  organizationId,
  globalMethods,
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
    } as FormValues,
  });

  // Cargar datos del método seleccionado
  useEffect(() => {
    if (selectedMethod) {
      form.reset({
        payment_method_code: selectedMethod.payment_method_code,
        is_active: selectedMethod.is_active,
        gateway: selectedMethod.settings?.gateway || "",
        requires_reference: selectedMethod.payment_method?.requires_reference || false,
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
        // Reiniciar el formulario con todos los valores predeterminados
        form.reset({
          payment_method_code: method.code,
          name: method.name,
          code: method.code,
          requires_reference: method.requires_reference,
          is_active: true, // Por defecto activado
          gateway: "none", // Usamos "none" en lugar de cadena vacía para evitar errores con SelectItem
        });
        
        // Configurar los estados iniciales para settings
        setGatewayConfig({});
        setAccountMapping({});
        
        console.log("Formulario reiniciado con valores predeterminados para:", method.name);
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
      <form onSubmit={handleFormSubmit} className="space-y-6">
        {isNewMethod ? (
          <div className="grid grid-cols-2 gap-4">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Nombre del método</FormLabel>
                  <FormControl>
                    <Input placeholder="Ej. Transferencia Banco XYZ" {...field} />
                  </FormControl>
                  <FormDescription>
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
                  <FormLabel>Código interno</FormLabel>
                  <FormControl>
                    <Input placeholder="Ej. TRANSFER_XYZ" {...field} />
                  </FormControl>
                  <FormDescription>
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
                <FormLabel>Método de pago</FormLabel>
                <Select 
                  onValueChange={(value) => {
                    field.onChange(value);
                    handlePaymentMethodChange(value);
                  }}
                  value={field.value}
                  disabled={selectedMethod !== null}
                >
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue placeholder="Selecciona un método de pago" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {globalMethods.map((method) => (
                      <SelectItem key={method.code} value={method.code}>
                        {method.name} {method.is_system && "(Sistema)"}
                      </SelectItem>
                    ))}
                    <SelectItem value="new">+ Crear nuevo método</SelectItem>
                  </SelectContent>
                </Select>
                <FormDescription>
                  Selecciona el método de pago que deseas configurar
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />
        )}
        
        <Tabs value={activeTab} onValueChange={setActiveTab} className="mt-6">
          <TabsList className="grid grid-cols-3 mb-4">
            <TabsTrigger value="general">General</TabsTrigger>
            <TabsTrigger value="gateway">Integración de Pago</TabsTrigger>
            <TabsTrigger value="accounting">Contabilidad</TabsTrigger>
          </TabsList>
          
          <TabsContent value="general">
            <div className="space-y-4">
              <FormField
                control={form.control}
                name="is_active"
                render={({ field }) => (
                  <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
                    <div className="space-y-0.5">
                      <FormLabel className="text-base">Activado</FormLabel>
                      <FormDescription>
                        Habilitar este método de pago para su uso en la organización
                      </FormDescription>
                    </div>
                    <FormControl>
                      <Switch
                        checked={field.value}
                        onCheckedChange={field.onChange}
                      />
                    </FormControl>
                  </FormItem>
                )}
              />
              
              <FormField
                control={form.control}
                name="requires_reference"
                render={({ field }) => (
                  <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
                    <div className="space-y-0.5">
                      <FormLabel className="text-base">Requiere referencia</FormLabel>
                      <FormDescription>
                        Solicitar número de referencia o transacción al procesar pagos
                      </FormDescription>
                    </div>
                    <FormControl>
                      <Checkbox
                        checked={field.value}
                        onCheckedChange={field.onChange}
                        disabled={!isNewMethod && selectedMethod !== null}
                      />
                    </FormControl>
                  </FormItem>
                )}
              />
            </div>
          </TabsContent>
          
          <TabsContent value="gateway">
            <div className="space-y-4">
              <FormField
                control={form.control}
                name="gateway"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Integración de pago</FormLabel>
                    <Select
                      onValueChange={field.onChange}
                      value={field.value}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Selecciona un gateway" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {gatewayOptions.map((option) => (
                          <SelectItem key={option.value} value={option.value}>
                            {option.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormDescription>
                      Selecciona el pasarelas de pagos en línea (si aplica)
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {form.watch("gateway") && (
                <>
                  <Separator className="my-6" />
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
        </Tabs>
        
        <div className="flex justify-end space-x-2 pt-4">
          <Button type="button" variant="outline" onClick={onCancel} disabled={isSaving}>
            Cancelar
          </Button>
          <Button 
            type="button" 
            onClick={(e) => {
              console.log("Botón Guardar clickeado");
              handleFormSubmit(e as any);
            }} 
            disabled={isSaving}
          >
            {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Guardar
          </Button>
        </div>
      </form>
    </Form>
  );
}
