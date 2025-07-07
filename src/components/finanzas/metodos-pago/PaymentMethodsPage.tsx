"use client";

import { useState, useEffect } from "react";
import { useToast } from "@/components/ui/use-toast";
import { useOrganization } from "@/lib/hooks/useOrganization";
import { supabase } from "@/lib/supabase/config";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Plus } from "lucide-react";
import PaymentMethodsList from "./PaymentMethodsList";
import PaymentMethodForm from "./PaymentMethodForm";

export interface PaymentMethod {
  code: string;
  name: string;
  requires_reference: boolean;
  is_active: boolean;
  is_system: boolean;
}

export interface OrganizationPaymentMethod {
  id: number;
  organization_id: number;
  payment_method_code: string;
  is_active: boolean;
  settings: {
    gateway?: string;
    gateway_config?: Record<string, any>;
    account_mapping?: Record<string, string>;
  };
  payment_method?: PaymentMethod;
}

export default function PaymentMethodsPage() {
  const { toast } = useToast();
  const { organization } = useOrganization();
  const organizationId = organization?.id;
  const [activeTab, setActiveTab] = useState<string>("lista");
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethod[]>([]);
  const [orgPaymentMethods, setOrgPaymentMethods] = useState<OrganizationPaymentMethod[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedMethod, setSelectedMethod] = useState<OrganizationPaymentMethod | null>(null);

  // Cargar los métodos de pago al iniciar
  useEffect(() => {
    if (organizationId) {
      loadPaymentMethods();
    }
  }, [organizationId]);

  // Función para cargar los métodos de pago
  const loadPaymentMethods = async () => {
    try {
      setIsLoading(true);
      
      // Obtener métodos de pago globales
      const { data: methodsData, error: methodsError } = await supabase
        .from("payment_methods")
        .select("*")
        .order("name");

      if (methodsError) throw methodsError;
      
      // Obtener configuración de métodos de pago para la organización actual
      const { data: orgMethodsData, error: orgMethodsError } = await supabase
        .from("organization_payment_methods")
        .select(`
          id,
          organization_id,
          payment_method_code,
          is_active,
          settings,
          payment_method:payment_method_code(*)
        `)
        .eq("organization_id", organizationId);

      if (orgMethodsError) throw orgMethodsError;
      
      setPaymentMethods(methodsData || []);
      setOrgPaymentMethods(orgMethodsData?.map(item => ({
        ...item,
        payment_method: item.payment_method as unknown as PaymentMethod
      })) || []);
    } catch (error: any) {
      console.error("Error al cargar métodos de pago:", error.message);
      toast({
        title: "Error",
        description: "No se pudieron cargar los métodos de pago",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  // Función para editar un método de pago
  const handleEditMethod = (method: OrganizationPaymentMethod) => {
    setSelectedMethod(method);
    setActiveTab("editar");
  };

  // Función para añadir un nuevo método de pago
  const handleAddMethod = () => {
    setSelectedMethod(null);
    setActiveTab("editar");
  };

  // Función para volver a la lista después de guardar
  const handleSaveComplete = () => {
    loadPaymentMethods();
    setActiveTab("lista");
  };

  return (
    <div className="container mx-auto py-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-bold">Métodos de Pago</h1>
          <p className="text-muted-foreground mt-1">
            Administra los métodos de pago aceptados por tu organización
          </p>
        </div>
        <Button onClick={handleAddMethod}>
          <Plus className="mr-2 h-4 w-4" />
          Nuevo Método
        </Button>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="mb-4">
          <TabsTrigger value="lista">Lista de Métodos</TabsTrigger>
          <TabsTrigger value="editar">
            {selectedMethod ? "Editar Método" : "Nuevo Método"}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="lista">
          <Card>
            <CardHeader>
              <CardTitle>Métodos de Pago Disponibles</CardTitle>
              <CardDescription>
                Gestiona los métodos de pago que tu organización acepta y configura sus opciones
              </CardDescription>
            </CardHeader>
            <CardContent>
              <PaymentMethodsList
                paymentMethods={paymentMethods}
                orgPaymentMethods={orgPaymentMethods}
                onEdit={handleEditMethod}
                isLoading={isLoading}
                onRefresh={loadPaymentMethods}
              />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="editar">
          <Card>
            <CardHeader>
              <CardTitle>
                {selectedMethod ? "Editar Método de Pago" : "Nuevo Método de Pago"}
              </CardTitle>
              <CardDescription>
                {selectedMethod
                  ? "Modifica la configuración del método de pago seleccionado"
                  : "Configura un nuevo método de pago para tu organización"}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {organizationId ? (
                <PaymentMethodForm
                  organizationId={organizationId}
                  globalMethods={paymentMethods}
                  selectedMethod={selectedMethod}
                  onSaveComplete={handleSaveComplete}
                  onCancel={() => setActiveTab("lista")}
                />
              ) : (
                <div className="py-4 text-center text-muted-foreground">
                  No se pudo determinar la organización actual. Por favor, actualice la página.
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
