"use client";

import React, { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase/config";
import { DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import ProductSelector from "../ProductSelector";
import { formatCurrency } from "@/utils/Utils";

// Interfaces para los tipos de datos
interface Customer {
  id: string;
  full_name: string;
}

interface Stage {
  id: string;
  name: string;
  position: number;
}

interface Currency {
  code: string;
  name: string;
  symbol: string;
}

interface Product {
  id: number;
  name: string;
  sku: string;
}

interface SelectedProduct {
  product: Product;
  quantity: number;
  unit_price: number;
}

interface NewOpportunityFormProps {
  onClose: () => void;
  pipelineId: string;
  organizationId: number;
  onSuccess?: () => void;
}

/**
 * Formulario para crear una nueva oportunidad
 * Maneja la carga de datos y la creación de oportunidades con productos
 */
export default function NewOpportunityForm({ 
  onClose, 
  pipelineId, 
  organizationId, 
  onSuccess 
}: NewOpportunityFormProps) {
  const [title, setTitle] = useState("");
  const [value, setValue] = useState("");
  const [customerId, setCustomerId] = useState("");
  const [stageId, setStageId] = useState("");
  const [expectedCloseDate, setExpectedCloseDate] = useState("");
  const [currency, setCurrency] = useState("USD");
  const [selectedProducts, setSelectedProducts] = useState<SelectedProduct[]>([]);
  
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [stages, setStages] = useState<Stage[]>([]);
  const [currencies, setCurrencies] = useState<Currency[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isLoadingData, setIsLoadingData] = useState(true);
  const [error, setError] = useState("");

  // Cargar clientes, etapas, monedas y productos al iniciar
  useEffect(() => {
    const loadData = async () => {
      try {
        // Validar que tenemos los parámetros necesarios
        if (!pipelineId || !organizationId) {
          console.log("Esperando pipelineId y organizationId...", { pipelineId, organizationId });
          setIsLoadingData(false);
          return;
        }
        
        setIsLoadingData(true);
        console.log("Cargando datos con:", { pipelineId, organizationId });
        
        // Cargar clientes
        console.log("Cargando clientes...");
        const { data: customersData, error: customersError } = await supabase
          .from("customers")
          .select("id, first_name, last_name")
          .eq("organization_id", organizationId)
          .order("first_name");
          
        if (customersError) {
          console.error("Error al cargar clientes:", customersError);
          throw customersError;
        }
        
        console.log("Clientes cargados:", customersData);
        
        // Formatear nombres completos de clientes
        const formattedCustomers = (customersData || []).map(customer => ({
          id: customer.id,
          full_name: `${customer.first_name || ''} ${customer.last_name || ''}`.trim() || 'Sin nombre'
        }));
        console.log("Clientes formateados:", formattedCustomers);
        setCustomers(formattedCustomers);
        
        // Cargar etapas del pipeline
        console.log("Cargando etapas para pipeline:", pipelineId);
        const { data: stagesData, error: stagesError } = await supabase
          .from("stages")
          .select("id, name, position")
          .eq("pipeline_id", pipelineId)
          .order("position");
          
        if (stagesError) {
          console.error("Error al cargar etapas:", stagesError);
          throw stagesError;
        }
        
        console.log("Etapas cargadas:", stagesData);
        setStages(stagesData || []);
        
        // Establecer la primera etapa como predeterminada
        if (stagesData && stagesData.length > 0) {
          setStageId(stagesData[0].id);
        }
        
        // Cargar monedas disponibles
        console.log("Cargando monedas...");
        const { data: currenciesData, error: currenciesError } = await supabase
          .from("currencies")
          .select("code, name, symbol")
          .eq("is_active", true)
          .order("code");
          
        if (currenciesError) {
          console.warn("Error al cargar monedas:", currenciesError);
          // Usar monedas por defecto si no se pueden cargar
          setCurrencies([
            { code: "USD", name: "Dólar estadounidense", symbol: "$" },
            { code: "EUR", name: "Euro", symbol: "€" },
            { code: "COP", name: "Peso colombiano", symbol: "$" }
          ]);
        } else {
          console.log("Monedas cargadas:", currenciesData);
          setCurrencies(currenciesData || []);
        }
        
        // Cargar productos disponibles
        console.log("Cargando productos...");
        const { data: productsData, error: productsError } = await supabase
          .from("products")
          .select("id, name, sku")
          .eq("organization_id", organizationId)
          .eq("is_active", true)
          .order("name");
          
        if (productsError) {
          console.warn("Error al cargar productos:", productsError);
          setProducts([]);
        } else {
          console.log("Productos cargados:", productsData);
          setProducts(productsData || []);
        }
        
      } catch (error) {
        console.error("Error cargando datos:", error);
        setError("Error al cargar los datos necesarios");
      } finally {
        setIsLoadingData(false);
      }
    };

    loadData();
  }, [pipelineId, organizationId]);

  // Calcular el valor total basado en los productos seleccionados
  const calculateTotalValue = () => {
    return selectedProducts.reduce((total, item) => {
      return total + (item.quantity * item.unit_price);
    }, 0);
  };

  // Actualizar el valor cuando cambien los productos
  useEffect(() => {
    const totalValue = calculateTotalValue();
    setValue(totalValue.toString());
  }, [selectedProducts]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!title.trim()) {
      setError("El título es obligatorio");
      return;
    }
    
    if (!customerId) {
      setError("Debe seleccionar un cliente");
      return;
    }
    
    if (!stageId) {
      setError("Debe seleccionar una etapa");
      return;
    }

    setIsSubmitting(true);
    setError("");

    try {
      console.log("Creando oportunidad con datos:", {
        title: title.trim(),
        value: parseFloat(value) || 0,
        customer_id: customerId,
        stage_id: stageId,
        pipeline_id: pipelineId,
        organization_id: organizationId,
        expected_close_date: expectedCloseDate || null,
        currency,
        selectedProducts
      });

      // Crear la oportunidad
      const { data: opportunityData, error: opportunityError } = await supabase
        .from("opportunities")
        .insert({
          name: title.trim(),
          value: parseFloat(value) || 0,
          customer_id: customerId,
          stage_id: stageId,
          pipeline_id: pipelineId,
          organization_id: organizationId,
          expected_close_date: expectedCloseDate || null,
          currency: currency,
          status: 'open'
        })
        .select()
        .single();

      if (opportunityError) {
        console.error("Error al crear oportunidad:", opportunityError);
        throw opportunityError;
      }

      console.log("Oportunidad creada:", opportunityData);

      // Si hay productos seleccionados, crear las relaciones
      if (selectedProducts.length > 0 && opportunityData) {
        console.log("Creando relaciones de productos...");
        
        const productRelations = selectedProducts.map(item => ({
          opportunity_id: opportunityData.id,
          product_id: item.product.id,
          quantity: item.quantity,
          unit_price: item.unit_price,
          total_price: item.quantity * item.unit_price,
          organization_id: organizationId
        }));

        const { error: productsError } = await supabase
          .from("opportunity_products")
          .insert(productRelations);

        if (productsError) {
          console.error("Error al asociar productos:", productsError);
          // No lanzamos error aquí porque la oportunidad ya se creó
          console.warn("La oportunidad se creó pero hubo problemas al asociar los productos");
        } else {
          console.log("Productos asociados correctamente");
        }
      }

      console.log("✅ Oportunidad creada exitosamente");
      
      // Llamar callback de éxito si existe
      if (onSuccess) {
        onSuccess();
      }
      
      // Cerrar el formulario
      onClose();

    } catch (error: any) {
      console.error("Error:", error);
      setError(error.message || "Error al crear la oportunidad");
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isLoadingData) {
    return (
      <div className="p-6">
        <DialogHeader>
          <DialogTitle>Nueva Oportunidad</DialogTitle>
          <DialogDescription>
            Cargando datos necesarios...
          </DialogDescription>
        </DialogHeader>
        <div className="flex justify-center py-8">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
        </div>
      </div>
    );
  }

  return (
    <div>
      <DialogHeader>
        <DialogTitle>Nueva Oportunidad</DialogTitle>
        <DialogDescription>
          Complete la información para crear una nueva oportunidad de venta
        </DialogDescription>
      </DialogHeader>

      <form onSubmit={handleSubmit} className="space-y-4 py-4">
        {error && (
          <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-400 px-4 py-3 rounded">
            {error}
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <Label htmlFor="title">Título *</Label>
            <Input
              id="title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Ej: Venta de software CRM"
              required
            />
          </div>

          <div>
            <Label htmlFor="customer">Cliente *</Label>
            <Select value={customerId} onValueChange={setCustomerId} required>
              <SelectTrigger>
                <SelectValue placeholder="Seleccionar cliente" />
              </SelectTrigger>
              <SelectContent>
                {customers.map((customer) => (
                  <SelectItem key={customer.id} value={customer.id}>
                    {customer.full_name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label htmlFor="stage">Etapa *</Label>
            <Select value={stageId} onValueChange={setStageId} required>
              <SelectTrigger>
                <SelectValue placeholder="Seleccionar etapa" />
              </SelectTrigger>
              <SelectContent>
                {stages.map((stage) => (
                  <SelectItem key={stage.id} value={stage.id}>
                    {stage.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label htmlFor="expectedCloseDate">Fecha esperada de cierre</Label>
            <Input
              id="expectedCloseDate"
              type="date"
              value={expectedCloseDate}
              onChange={(e) => setExpectedCloseDate(e.target.value)}
            />
          </div>

          <div>
            <Label htmlFor="currency">Moneda</Label>
            <Select value={currency} onValueChange={setCurrency}>
              <SelectTrigger>
                <SelectValue placeholder="Seleccionar moneda" />
              </SelectTrigger>
              <SelectContent>
                {currencies.map((curr) => (
                  <SelectItem key={curr.code} value={curr.code}>
                    {curr.code} - {curr.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label htmlFor="value">Valor Total</Label>
            <Input
              id="value"
              type="number"
              step="0.01"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder="0.00"
            />
            {selectedProducts.length > 0 && (
              <p className="text-sm text-gray-500 mt-1">
                Calculado automáticamente: {formatCurrency(calculateTotalValue(), currency)}
              </p>
            )}
          </div>
        </div>

        {/* Selector de productos */}
        <div>
          <Label>Productos (Opcional)</Label>
          <ProductSelector
            products={products}
            selectedProducts={selectedProducts}
            onProductsChange={setSelectedProducts}
            currency={currency}
          />
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting ? "Creando..." : "Crear Oportunidad"}
          </Button>
        </DialogFooter>
      </form>
    </div>
  );
}
