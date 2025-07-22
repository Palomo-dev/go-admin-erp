"use client";

import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase/config";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { useToast } from "@/components/ui/use-toast";
import { Toaster } from "@/components/ui/toaster";

interface Customer {
  id: string;
  full_name: string;
}

interface Stage {
  id: string;
  name: string;
  position: number;
}

interface NewOpportunityFormProps {
  onSuccess: () => void;
  onCancel: () => void;
  pipelineId?: string;
  organizationId?: number;
}

// Definir el esquema para el formulario de oportunidad
const opportunitySchema = z.object({
  name: z.string().min(3, {
    message: "El nombre debe tener al menos 3 caracteres.",
  }),
  amount: z.coerce.number().min(0, {
    message: "El monto no puede ser negativo.",
  }),
  currency: z.string().default("USD"),
  stage_id: z.string({
    required_error: "Por favor selecciona una etapa.",
  }),
  customer_id: z.string({
    required_error: "Por favor selecciona un cliente.",
  }),
  expected_close_date: z.string().optional(),
});

// Tipo derivado del esquema para usar en el formulario
type FormValues = z.infer<typeof opportunitySchema>;

export function NewOpportunityForm({
  onSuccess,
  onCancel,
  pipelineId,
  organizationId: propOrgId,
}: NewOpportunityFormProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [stages, setStages] = useState<Stage[]>([]);
  const { toast } = useToast();

  // Obtener el ID de la organización desde props o localStorage
  const getOrganizationId = () => {
    if (propOrgId) return propOrgId;
    
    if (typeof window !== "undefined") {
      const orgId = localStorage.getItem("currentOrganizationId");
      if (orgId) return Number(orgId);
      
      const orgData = localStorage.getItem("organizacionActiva");
      if (orgData) {
        try {
          const parsed = JSON.parse(orgData);
          return parsed?.id || null;
        } catch (err) {
          console.error("Error al parsear datos de organización", err);
        }
      }
    }
    return null;
  };

  // Inicializar el formulario con react-hook-form
  const form = useForm({
    resolver: zodResolver(opportunitySchema),
    defaultValues: {
      name: "",
      amount: 0,
      currency: "USD",
      stage_id: "",
      customer_id: "",
      expected_close_date: new Date().toISOString().split('T')[0]
    },
  });

  // Cargar datos de clientes y etapas al iniciar
  useEffect(() => {
    const fetchData = async () => {
      setIsLoading(true);
      const organizationId = getOrganizationId();
      
      if (!organizationId) {
        toast({
          variant: "destructive",
          title: "Error",
          description: "No se encontró información de la organización"
        });
        setIsLoading(false);
        return;
      }

      try {
        // Cargar clientes
        const { data: customersData, error: customersError } = await supabase
          .from("customers")
          .select("id, full_name")
          .eq("organization_id", organizationId);
        
        if (customersError) {
          console.error("Error al cargar clientes:", customersError);
          toast({
            variant: "destructive",
            title: "Error",
            description: "Error al cargar los clientes"
          });
        } else {
          setCustomers(customersData || []);
        }

        // Cargar etapas según el pipeline proporcionado o el predeterminado
        let pipelineQuery;
        if (pipelineId) {
          pipelineQuery = supabase
            .from("stages")
            .select("id, name, position")
            .eq("pipeline_id", pipelineId)
            .order("position");
        } else {
          // Si no hay pipelineId, buscar el pipeline predeterminado primero
          const { data: defaultPipeline } = await supabase
            .from("pipelines")
            .select("id")
            .eq("organization_id", organizationId)
            .eq("is_default", true)
            .single();
          
          if (defaultPipeline) {
            pipelineQuery = supabase
              .from("stages")
              .select("id, name, position")
              .eq("pipeline_id", defaultPipeline.id)
              .order("position");
          } else {
            toast({
              variant: "destructive",
              title: "Error",
              description: "No se encontró un pipeline predeterminado"
            });
            setIsLoading(false);
            return;
          }
        }
        
        const { data: stagesData, error: stagesError } = await pipelineQuery;
        
        if (stagesError) {
          console.error("Error al cargar etapas:", stagesError);
          toast({
            variant: "destructive",
            title: "Error",
            description: "Error al cargar las etapas"
          });
        } else if (stagesData && stagesData.length > 0) {
          setStages(stagesData);
          // Establecer la primera etapa como predeterminada
          form.setValue("stage_id", stagesData[0].id);
        }
      } catch (err) {
        console.error("Error al cargar datos:", err);
        toast({
          variant: "destructive",
          title: "Error",
          description: "Error al cargar los datos necesarios"
        });
      } finally {
        setIsLoading(false);
      }
    };

    fetchData();
  }, [pipelineId, form, toast]);

  // Manejar el envío del formulario
  const onSubmit = async (values: FormValues) => {
    setIsLoading(true);
    const organizationId = getOrganizationId();
    
    if (!organizationId) {
      toast({
        variant: "destructive",
        title: "Error",
        description: "No se encontró información de la organización"
      });
      setIsLoading(false);
      return;
    }
    
    if (!pipelineId) {
      toast({
        variant: "destructive",
        title: "Error",
        description: "No se encontró el ID del pipeline"
      });
      setIsLoading(false);
      return;
    }

    try {
      // Crear la nueva oportunidad
      const { data, error } = await supabase
        .from("opportunities")
        .insert({
          name: values.name,
          amount: values.amount,
          currency: values.currency,
          stage_id: values.stage_id,
          customer_id: values.customer_id,
          organization_id: organizationId,
          pipeline_id: pipelineId,
          expected_close_date: values.expected_close_date,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          status: "active" // La tabla acepta 'active' según los logs anteriores
        })
        .select()
        .single();

      if (error) {
        console.error("Error al crear oportunidad:", error);
        toast({
          variant: "destructive",
          title: "Error",
          description: `Error al crear la oportunidad: ${error.message}`
        });
      } else {
        toast({
          title: "Éxito",
          description: "Oportunidad creada correctamente"
        });
        onSuccess();
      }
    } catch (err) {
      console.error("Error inesperado:", err);
      toast({
        variant: "destructive",
        title: "Error",
        description: "Error inesperado al crear la oportunidad"
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <>
      <div className="max-w-md mx-auto">
        {isLoading && (
          <div className="flex justify-center my-4">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
          </div>
        )}
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Nombre de la oportunidad</FormLabel>
                  <FormControl>
                    <Input
                      disabled={isLoading}
                      placeholder="Ej. Proyecto de implementación"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="amount"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Monto estimado</FormLabel>
                  <FormControl>
                    <Input
                      type="number"
                      disabled={isLoading}
                      placeholder="0.00"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            
            <FormField
              control={form.control}
              name="expected_close_date"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Fecha estimada de cierre</FormLabel>
                  <FormControl>
                    <Input
                      type="date"
                      disabled={isLoading}
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="customer_id"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Cliente</FormLabel>
                  <Select
                    disabled={isLoading || customers.length === 0}
                    onValueChange={field.onChange}
                    defaultValue={field.value}
                  >
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Seleccionar cliente" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {customers.map((customer) => (
                        <SelectItem key={customer.id} value={customer.id}>
                          {customer.full_name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="stage_id"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Etapa</FormLabel>
                  <Select
                    disabled={isLoading || stages.length === 0}
                    onValueChange={field.onChange}
                    defaultValue={field.value}
                  >
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Seleccionar etapa" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {stages.map((stage) => (
                        <SelectItem key={stage.id} value={stage.id}>
                          {stage.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="flex justify-end space-x-2 pt-4">
              <Button
                type="button"
                variant="outline"
                onClick={onCancel}
                disabled={isLoading}
                className="border-gray-300 hover:bg-gray-100 dark:border-gray-600 dark:hover:bg-gray-800"
              >
                Cancelar
              </Button>
              <Button 
                type="submit" 
                disabled={isLoading}
                className="bg-blue-600 hover:bg-blue-700 text-white dark:bg-blue-700 dark:hover:bg-blue-800"
              >
                {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Crear Oportunidad
              </Button>
            </div>
          </form>
        </Form>
      </div>
      <Toaster />
    </>
  );
}
