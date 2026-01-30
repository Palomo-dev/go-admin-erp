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
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Plus, ArrowLeft } from "lucide-react";
import Link from "next/link";
import PaymentMethodsList from "./PaymentMethodsList";
import PaymentMethodForm from "./PaymentMethodForm";

export interface PaymentMethodCountry {
  country_code: string;
  is_recommended: boolean;
  country?: {
    code: string;
    name: string;
  };
}

export interface PaymentMethod {
  code: string;
  name: string;
  requires_reference: boolean;
  is_active: boolean;
  is_system: boolean;
  countries?: PaymentMethodCountry[];
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
  // Campos de configuración para Website
  show_on_website?: boolean;
  website_display_order?: number;
  website_display_name?: string;
  website_description?: string;
  website_icon?: string;
}

export default function PaymentMethodsPage() {
  const { toast } = useToast();
  const { organization } = useOrganization();
  const organizationId = organization?.id;
  const countryCode = organization?.country_code;
  const [activeTab, setActiveTab] = useState<string>("lista");
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethod[]>([]);
  const [orgPaymentMethods, setOrgPaymentMethods] = useState<OrganizationPaymentMethod[]>([]);
  const [recommendedMethods, setRecommendedMethods] = useState<any[]>([]);
  const [actualCountryCode, setActualCountryCode] = useState<string | null>(null);
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
    if (!organizationId) return;
    
    try {
      setIsLoading(true);
      
      // Obtener métodos de pago globales con sus países
      const { data: methodsData, error: methodsError } = await supabase
        .from("payment_methods")
        .select(`
          *,
          countries:country_payment_methods(
            country_code,
            is_recommended,
            display_order,
            is_active,
            country:country_code(code, name)
          )
        `)
        .eq("is_active", true)
        .order("name");
        
      if (methodsError) throw methodsError;
      
      // Obtener country_code directamente de la base de datos si no está disponible
      let currentCountryCode = countryCode;
      if (!currentCountryCode) {
        const { data: orgData, error: orgError } = await supabase
          .from("organizations")
          .select("country_code")
          .eq("id", organizationId)
          .single();
          
        if (!orgError && orgData) {
          currentCountryCode = orgData.country_code;
        }
      }
      
      // Filtrar métodos de pago según el país de la organización
      let filteredMethods = methodsData || [];
      if (currentCountryCode) {
        filteredMethods = (methodsData || []).filter(method => {
          // Si no tiene países asignados, es global (disponible para todos)
          if (!method.countries || method.countries.length === 0) {
            return true;
          }
          // Si tiene países asignados, verificar si incluye el país de la organización
          return method.countries.some((c: any) => c.country_code === currentCountryCode);
        });
      }
      
      // Obtener métodos de pago de la organización
      const { data: orgMethodsData, error: orgMethodsError } = await supabase
        .from("organization_payment_methods")
        .select(`
          id,
          organization_id,
          payment_method_code,
          is_active,
          settings,
          show_on_website,
          website_display_order,
          website_display_name,
          website_description,
          website_icon,
          payment_method:payment_method_code(*)
        `)
        .eq("organization_id", organizationId);

      if (orgMethodsError) throw orgMethodsError;
      
      // Obtener métodos recomendados del país si está disponible
      let recommendedData = [];
      if (currentCountryCode) {
        const { data: recMethodsData, error: recMethodsError } = await supabase
          .rpc('get_recommended_payment_methods', { country_code: currentCountryCode });
          
        if (!recMethodsError && recMethodsData) {
          recommendedData = recMethodsData;
        }
      }
      
      setPaymentMethods(filteredMethods);
      setOrgPaymentMethods(orgMethodsData?.map(item => ({
        ...item,
        payment_method: item.payment_method as unknown as PaymentMethod
      })) || []);
      setRecommendedMethods(recommendedData || []);
      setActualCountryCode(currentCountryCode || null);
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
    <div className="p-6 space-y-6 bg-gray-50 dark:bg-gray-900 min-h-screen">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-4">
        <div className="flex items-center gap-3">
          <Link href="/app/finanzas">
            <Button variant="ghost" size="icon">
              <ArrowLeft className="h-5 w-5" />
            </Button>
          </Link>
          <div className="p-2 bg-blue-100 dark:bg-blue-900/30 rounded-xl">
            <svg className="h-6 w-6 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
            </svg>
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Métodos de Pago</h1>
            <p className="text-gray-500 dark:text-gray-400">
              Finanzas / Métodos de Pago
            </p>
          </div>
        </div>
        <Button onClick={handleAddMethod} className="w-full sm:w-auto bg-blue-600 hover:bg-blue-700">
          <Plus className="mr-2 h-4 w-4" />
          Nuevo Método
        </Button>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="mb-4 sm:mb-6 w-full h-auto sm:w-auto grid grid-cols-2 sm:flex gap-2 p-2 bg-gray-100 dark:bg-gray-800/80 rounded-lg">
          <TabsTrigger 
            value="lista"
            className="text-xs sm:text-sm px-3 py-2.5 sm:px-4 sm:py-2 font-medium text-gray-700 dark:text-gray-300 data-[state=active]:bg-white dark:data-[state=active]:bg-gray-700 data-[state=active]:text-blue-600 dark:data-[state=active]:text-blue-400 data-[state=active]:shadow-sm transition-all rounded-md whitespace-nowrap"
          >
            Métodos Activos
          </TabsTrigger>
          <TabsTrigger 
            value="editar"
            className="text-xs sm:text-sm px-3 py-2.5 sm:px-4 sm:py-2 font-medium text-gray-700 dark:text-gray-300 data-[state=active]:bg-white dark:data-[state=active]:bg-gray-700 data-[state=active]:text-blue-600 dark:data-[state=active]:text-blue-400 data-[state=active]:shadow-sm transition-all rounded-md whitespace-nowrap"
          >
            <span className="hidden sm:inline">{selectedMethod ? "Editar Método" : "Nuevo Método"}</span>
            <span className="sm:hidden">{selectedMethod ? "Editar" : "Nuevo"}</span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="lista">
          <Card className="dark:bg-gray-800/50 bg-white border-gray-200 dark:border-gray-700">
            <CardHeader className="px-4 sm:px-6">
              <CardTitle className="text-lg sm:text-xl text-blue-600 dark:text-blue-400">Métodos de Pago Disponibles</CardTitle>
              <CardDescription className="text-sm dark:text-gray-400">
                Gestiona los métodos de pago que tu organización acepta y configura sus opciones
              </CardDescription>
            </CardHeader>
            <CardContent className="px-3 sm:px-6">
              <PaymentMethodsList
                paymentMethods={paymentMethods}
                orgPaymentMethods={orgPaymentMethods}
                recommendedMethods={recommendedMethods}
                countryCode={actualCountryCode}
                onEdit={handleEditMethod}
                isLoading={isLoading}
                onRefresh={loadPaymentMethods}
              />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="editar">
          <Card className="dark:bg-gray-800/50 bg-white border-gray-200 dark:border-gray-700">
            <CardHeader className="px-4 sm:px-6">
              <CardTitle className="text-lg sm:text-xl text-blue-600 dark:text-blue-400">
                {selectedMethod ? "Editar Método de Pago" : "Nuevo Método de Pago"}
              </CardTitle>
              <CardDescription className="text-sm dark:text-gray-400">
                {selectedMethod
                  ? "Modifica la configuración del método de pago seleccionado"
                  : "Configura un nuevo método de pago para tu organización"}
              </CardDescription>
            </CardHeader>
            <CardContent className="px-3 sm:px-6">
              {organizationId ? (
                <PaymentMethodForm
                  organizationId={organizationId}
                  globalMethods={paymentMethods}
                  recommendedMethods={recommendedMethods}
                  countryCode={actualCountryCode}
                  selectedMethod={selectedMethod}
                  onSaveComplete={handleSaveComplete}
                  onCancel={() => setActiveTab("lista")}
                />
              ) : (
                <div className="py-8 text-center text-sm sm:text-base text-gray-600 dark:text-gray-400">
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
