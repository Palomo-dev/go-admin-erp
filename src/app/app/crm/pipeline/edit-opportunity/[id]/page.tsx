"use client";

import React, { useState, useEffect, useCallback } from "react";
import { useRouter, useParams } from "next/navigation";
import { supabase } from "@/lib/supabase/config";
import { formatCurrency } from "@/utils/Utils";
import { getOrganizationId } from "@/components/crm/pipeline/utils/pipelineUtils";

// Importaciones de UI
import LoadingSpinner from "@/components/ui/loading-spinner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { 
  Card, 
  CardContent, 
  CardDescription, 
  CardHeader, 
  CardTitle 
} from "@/components/ui/card";
import { toast } from "sonner";
import { ChevronLeft, Save, User, Building2, DollarSign } from "lucide-react";

interface OpportunityData {
  id: string;
  name: string;
  amount: number;
  currency: string;
  expected_close_date: string | null;
  customer_id: string;
  stage_id: string;
  pipeline_id: string;
  organization_id: number;
  status: string;
  pipeline?: {
    id: string;
    name: string;
  };
  stage?: {
    id: string;
    name: string;
    probability: number;
  };
  customer?: {
    id: string;
    first_name: string;
    last_name: string;
    email: string;
  };
}

interface Customer {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
}

interface Stage {
  id: string;
  name: string;
  probability: number;
}

interface Currency {
  code: string;
  name: string;
  symbol: string;
}

/**
 * Página de edición de oportunidad
 * Permite editar los detalles de una oportunidad existente
 */
export default function EditOpportunityPage() {
  const router = useRouter();
  const params = useParams();
  const opportunityId = params.id as string;
  
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [organizationId, setOrganizationId] = useState<number | null>(null);
  
  // Estados de datos
  const [opportunity, setOpportunity] = useState<OpportunityData | null>(null);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [stages, setStages] = useState<Stage[]>([]);
  const [currencies, setCurrencies] = useState<Currency[]>([]);
  
  // Estados del formulario
  const [formData, setFormData] = useState({
    name: "",
    amount: "",
    currency: "USD",
    expected_close_date: "",
    customer_id: "",
    stage_id: ""
  });

  // Obtener organización al cargar
  useEffect(() => {
    const orgId = getOrganizationId();
    setOrganizationId(parseInt(orgId));
  }, []);

  const loadOpportunityData = useCallback(async () => {
    try {
      setLoading(true);
      
      // Cargar oportunidad con datos relacionados
      const { data: opportunityData, error: opportunityError } = await supabase
        .from("opportunities")
        .select(`
          *,
          customer:customers(id, first_name, last_name, email),
          stage:stages(id, name, probability),
          pipeline:pipelines(id, name)
        `)
        .eq("id", opportunityId)
        .eq("organization_id", organizationId)
        .single();
      
      if (opportunityError) {
        console.error("❌ [EditOpportunity] Error cargando oportunidad:", {
          message: opportunityError.message,
          details: opportunityError.details,
          hint: opportunityError.hint,
          code: opportunityError.code
        });
        toast.error(`Error al cargar la oportunidad: ${opportunityError.message}`);
        router.push("/app/crm/pipeline");
        return;
      }

      if (!opportunityData) {
        toast.error("Oportunidad no encontrada");
        router.push("/app/crm/pipeline");
        return;
      }

      setOpportunity(opportunityData);
      
      // Establecer datos del formulario
      setFormData({
        name: opportunityData.name || "",
        amount: opportunityData.amount?.toString() || "",
        currency: opportunityData.currency || "USD",
        expected_close_date: opportunityData.expected_close_date || "",
        customer_id: opportunityData.customer_id || "",
        stage_id: opportunityData.stage_id || ""
      });

      // Cargar datos relacionados en paralelo
      await Promise.all([
        loadCustomers(),
        loadStages(opportunityData.pipeline_id),
        loadCurrencies()
      ]);

    } catch (error) {
      console.error("Error:", error);
      toast.error("Error al cargar los datos");
    } finally {
      setLoading(false);
    }
  }, [opportunityId, organizationId]);

  // Cargar datos cuando tenemos organización y ID
  useEffect(() => {
    if (opportunityId && organizationId) {
      loadOpportunityData();
    }
  }, [opportunityId, organizationId, loadOpportunityData]);

  const loadCustomers = async () => {
    try {
      const { data, error } = await supabase
        .from("customers")
        .select("id, first_name, last_name, email")
        .eq("organization_id", organizationId)
        .order("first_name");

      if (error) {
        console.error("❌ [EditOpportunity] Error cargando clientes:", {
          message: error.message,
          details: error.details,
          hint: error.hint,
          code: error.code
        });
        return;
      }

      setCustomers(data || []);
    } catch (error) {
      console.error("Error:", error);
    }
  };

  const loadStages = async (pipelineId: string) => {
    try {
      const { data, error } = await supabase
        .from("stages")
        .select("id, name, probability")
        .eq("pipeline_id", pipelineId)
        .order("position");

      if (error) {
        console.error("❌ [EditOpportunity] Error cargando etapas:", {
          message: error.message,
          details: error.details,
          hint: error.hint,
          code: error.code
        });
        return;
      }

      setStages(data || []);
    } catch (error) {
      console.error("Error:", error);
    }
  };

  const loadCurrencies = async () => {
    try {
      console.log("🔄 [EditOpportunity] Cargando monedas...");
      
      const { data, error } = await supabase
        .from("currencies")
        .select("code, name, symbol")
        .eq("is_active", true)
        .order("code");

      if (error) {
        console.error("❌ [EditOpportunity] Error cargando monedas:", {
          message: error.message,
          details: error.details,
          hint: error.hint,
          code: error.code
        });
        // Fallback a monedas por defecto
        setCurrencies([
          { code: "USD", name: "Dólar estadounidense", symbol: "$" },
          { code: "EUR", name: "Euro", symbol: "€" },
          { code: "COP", name: "Peso colombiano", symbol: "$" }
        ]);
        return;
      }

      console.log("✅ [EditOpportunity] Monedas cargadas:", data?.length || 0);
      setCurrencies(data || []);
    } catch (error) {
      console.error("❌ [EditOpportunity] Error inesperado cargando monedas:", error);
      setCurrencies([
        { code: "USD", name: "Dólar estadounidense", symbol: "$" },
        { code: "EUR", name: "Euro", symbol: "€" },
        { code: "COP", name: "Peso colombiano", symbol: "$" }
      ]);
    }
  };

  const handleInputChange = (field: string, value: string) => {
    setFormData(prev => ({
      ...prev,
      [field]: value
    }));
  };

  const handleSave = async () => {
    try {
      setSaving(true);

      // Validaciones
      if (!formData.name.trim()) {
        toast.error("El nombre de la oportunidad es requerido");
        return;
      }

      if (!formData.customer_id) {
        toast.error("Debe seleccionar un cliente");
        return;
      }

      if (!formData.stage_id) {
        toast.error("Debe seleccionar una etapa");
        return;
      }

      const amount = parseFloat(formData.amount);
      if (isNaN(amount) || amount < 0) {
        toast.error("El monto debe ser un número válido");
        return;
      }

      // Preparar datos para actualizar
      const updateData = {
        name: formData.name.trim(),
        amount: amount,
        currency: formData.currency,
        expected_close_date: formData.expected_close_date || null,
        customer_id: formData.customer_id,
        stage_id: formData.stage_id,
        updated_at: new Date().toISOString()
      };

      console.log("🔄 [EditOpportunity] Actualizando oportunidad con datos:", updateData);
      console.log("🔄 [EditOpportunity] ID oportunidad:", opportunityId);
      console.log("🔄 [EditOpportunity] ID organización:", organizationId);

      // Verificar autenticación y permisos
      const { data: { user }, error: authError } = await supabase.auth.getUser();
      console.log("🔄 [EditOpportunity] Usuario autenticado:", user?.id || 'No autenticado');
      
      if (authError || !user) {
        console.error("❌ [EditOpportunity] Error de autenticación:", authError);
        toast.error("Error: Usuario no autenticado");
        return;
      }

      // Verificar membresía en organización
      const { data: membership, error: membershipError } = await supabase
        .from('organization_members')
        .select('user_id, organization_id')
        .eq('user_id', user.id)
        .eq('organization_id', organizationId)
        .single();

      console.log("🔄 [EditOpportunity] Membresía en organización:", membership);
      
      if (membershipError || !membership) {
        console.error("❌ [EditOpportunity] Error de membresía:", membershipError);
        toast.error("Error: No tienes permisos para editar esta oportunidad");
        return;
      }

      // Primero verificar que la oportunidad existe
      const { data: existingOpportunity, error: checkError } = await supabase
        .from("opportunities")
        .select("id, organization_id, name")
        .eq("id", opportunityId)
        .eq("organization_id", organizationId)
        .single();

      if (checkError) {
        console.error("❌ [EditOpportunity] Error verificando oportunidad:", checkError);
        console.error("❌ [EditOpportunity] Error completo:", JSON.stringify(checkError, null, 2));
        toast.error(`Error: No se pudo encontrar la oportunidad`);
        return;
      }

      console.log("✅ [EditOpportunity] Oportunidad encontrada:", existingOpportunity);

      // Actualizar en Supabase
      const { data: updatedData, error } = await supabase
        .from("opportunities")
        .update(updateData)
        .eq("id", opportunityId)
        .eq("organization_id", organizationId)
        .select();

      if (error) {
        console.error("❌ [EditOpportunity] Error actualizando oportunidad:", error);
        console.error("❌ [EditOpportunity] Error completo:", JSON.stringify(error, null, 2));
        console.error("❌ [EditOpportunity] Tipo de error:", typeof error);
        console.error("❌ [EditOpportunity] Propiedades del error:", Object.keys(error));
        
        // Intentar diferentes formas de obtener el mensaje de error
        const errorMessage = error?.message || (error as any)?.error_description || (error as any)?.msg || 'Error desconocido';
        toast.error(`Error al guardar los cambios: ${errorMessage}`);
        return;
      }

      console.log("✅ [EditOpportunity] Oportunidad actualizada exitosamente:", updatedData);

      toast.success("Oportunidad actualizada exitosamente");
      
      // Redirigir al detalle de la oportunidad
      router.push(`/app/crm/oportunidades/${opportunityId}`);

    } catch (error) {
      console.error("Error:", error);
      toast.error("Error al guardar los cambios");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <LoadingSpinner />
      </div>
    );
  }

  if (!opportunity) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <h2 className="text-2xl font-semibold mb-2">Oportunidad no encontrada</h2>
          <p className="text-muted-foreground mb-4">La oportunidad que intentas editar no existe o no tienes permisos para verla.</p>
          <Button onClick={() => router.push('/app/crm/pipeline')}>
            <ChevronLeft className="mr-2 h-4 w-4" />
            Volver al Pipeline
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6 max-w-4xl">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-4">
          <Button
            variant="outline"
            size="sm"
            onClick={() => router.push(`/app/crm/oportunidades/${opportunityId}`)}
          >
            <ChevronLeft className="mr-2 h-4 w-4" />
            Volver al Detalle
          </Button>
          <div>
            <h1 className="text-2xl font-bold">Editar Oportunidad</h1>
            <p className="text-muted-foreground">
              {opportunity.pipeline?.name} • {opportunity.stage?.name}
            </p>
          </div>
        </div>
        <Button onClick={handleSave} disabled={saving}>
          <Save className="mr-2 h-4 w-4" />
          {saving ? "Guardando..." : "Guardar Cambios"}
        </Button>
      </div>

      {/* Formulario */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Información Básica */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Building2 className="h-5 w-5" />
              Información Básica
            </CardTitle>
            <CardDescription>
              Datos principales de la oportunidad
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label htmlFor="name">Nombre de la Oportunidad *</Label>
              <Input
                id="name"
                value={formData.name}
                onChange={(e) => handleInputChange("name", e.target.value)}
                placeholder="Ej: Venta de software CRM"
              />
            </div>

            <div>
              <Label htmlFor="customer">Cliente *</Label>
              <Select
                value={formData.customer_id}
                onValueChange={(value) => handleInputChange("customer_id", value)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Seleccionar cliente" />
                </SelectTrigger>
                <SelectContent>
                  {customers.map((customer) => (
                    <SelectItem key={customer.id} value={customer.id}>
                      <div className="flex items-center gap-2">
                        <User className="h-4 w-4" />
                        {customer.first_name} {customer.last_name}
                        {customer.email && (
                          <span className="text-muted-foreground">({customer.email})</span>
                        )}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label htmlFor="stage">Etapa *</Label>
              <Select
                value={formData.stage_id}
                onValueChange={(value) => handleInputChange("stage_id", value)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Seleccionar etapa" />
                </SelectTrigger>
                <SelectContent>
                  {stages.map((stage) => (
                    <SelectItem key={stage.id} value={stage.id}>
                      {stage.name} ({stage.probability}% prob.)
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        {/* Información Financiera */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <DollarSign className="h-5 w-5" />
              Información Financiera
            </CardTitle>
            <CardDescription>
              Valor y fechas de la oportunidad
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label htmlFor="amount">Monto *</Label>
              <Input
                id="amount"
                type="number"
                step="0.01"
                min="0"
                value={formData.amount}
                onChange={(e) => handleInputChange("amount", e.target.value)}
                placeholder="0.00"
              />
            </div>

            <div>
              <Label htmlFor="currency">Moneda *</Label>
              <Select
                value={formData.currency}
                onValueChange={(value) => handleInputChange("currency", value)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Seleccionar moneda" />
                </SelectTrigger>
                <SelectContent>
                  {currencies.map((currency) => (
                    <SelectItem key={currency.code} value={currency.code}>
                      {currency.symbol}{currency.code} - {currency.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label htmlFor="expected_close_date">Fecha Estimada de Cierre</Label>
              <Input
                id="expected_close_date"
                type="date"
                value={formData.expected_close_date}
                onChange={(e) => handleInputChange("expected_close_date", e.target.value)}
              />
            </div>

            {/* Resumen */}
            <div className="pt-4 border-t">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Valor Total:</span>
                <span className="font-semibold">
                  {formData.amount ? formatCurrency(parseFloat(formData.amount)) : "0.00"} {formData.currency}
                </span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Botones de acción */}
      <div className="flex justify-end gap-4 mt-6">
        <Button
          variant="outline"
          onClick={() => router.push(`/app/crm/oportunidades/${opportunityId}`)}
        >
          Cancelar
        </Button>
        <Button onClick={handleSave} disabled={saving}>
          <Save className="mr-2 h-4 w-4" />
          {saving ? "Guardando..." : "Guardar Cambios"}
        </Button>
      </div>
    </div>
  );
}
