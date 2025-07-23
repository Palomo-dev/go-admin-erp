"use client";

import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase/config";
import { Button } from "@/components/ui/button";
import { 
  Card, 
  CardContent, 
  CardDescription, 
  CardFooter, 
  CardHeader, 
  CardTitle 
} from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, Mail, Check, Plus, Trash } from "lucide-react";
import { useTheme } from "next-themes";

interface AutomationSettingsProps {
  pipelineId: string;
}

interface StageAutomation {
  id?: string;
  pipeline_id: string;
  from_stage_id: string;
  to_stage_id: string;
  organization_id: number;
  send_email: boolean;
  create_task: boolean;
  task_title: string;
  task_description: string;
  task_days_due: number;
  task_priority: string;
  is_active: boolean;
}

export function AutomationSettings({ pipelineId }: AutomationSettingsProps) {
  const [stages, setStages] = useState<any[]>([]);
  const [automations, setAutomations] = useState<StageAutomation[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [saving, setSaving] = useState<boolean>(false);
  const [organizationId, setOrganizationId] = useState<number | null>(null);
  const { theme } = useTheme();

  // Obtener el ID de la organización activa del almacenamiento local
  const getOrganizationId = () => {
    if (typeof window !== "undefined") {
      const orgData = localStorage.getItem("organizacionActiva");
      if (orgData) {
        try {
          const parsed = JSON.parse(orgData);
          return parsed?.id || null;
        } catch (err) {
          console.error("Error al analizar los datos de la organización", err);
          return null;
        }
      }
    }
    return null;
  };

  // Cargar etapas y automatizaciones existentes
  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      const orgId = getOrganizationId();
      setOrganizationId(orgId);

      if (!orgId || !pipelineId) {
        setLoading(false);
        return;
      }

      try {
        // Obtener etapas del pipeline
        const { data: stagesData, error: stagesError } = await supabase
          .from("stages")
          .select("id, name, position, probability, color")
          .eq("pipeline_id", pipelineId)
          .order("position");

        if (stagesError) throw stagesError;
        
        // Obtener automatizaciones configuradas
        const { data: automationsData, error: automationsError } = await supabase
          .from("stage_automations")
          .select("*")
          .eq("pipeline_id", pipelineId)
          .eq("organization_id", orgId);

        if (automationsError) throw automationsError;

        setStages(stagesData || []);
        setAutomations(automationsData || []);
        
        // Si no hay automatizaciones, crear una por defecto
        if (!automationsData || automationsData.length === 0) {
          setAutomations([createDefaultAutomation(pipelineId, orgId)]);
        }
      } catch (error) {
        console.error("Error al cargar datos:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [pipelineId]);

  // Crear una automatización por defecto
  const createDefaultAutomation = (pipelineId: string, orgId: number): StageAutomation => {
    return {
      pipeline_id: pipelineId,
      from_stage_id: "",
      to_stage_id: "",
      organization_id: orgId,
      send_email: true,
      create_task: true,
      task_title: "Seguimiento de oportunidad",
      task_description: "Realizar seguimiento de la oportunidad que cambió de etapa",
      task_days_due: 2,
      task_priority: "medium",
      is_active: true
    };
  };

  // Añadir nueva automatización
  const handleAddAutomation = () => {
    if (!organizationId) return;
    setAutomations([...automations, createDefaultAutomation(pipelineId, organizationId)]);
  };

  // Eliminar automatización
  const handleDeleteAutomation = (index: number) => {
    const newAutomations = [...automations];
    newAutomations.splice(index, 1);
    setAutomations(newAutomations);
  };

  // Actualizar campo de automatización
  const handleAutomationChange = (index: number, field: keyof StageAutomation, value: any) => {
    const newAutomations = [...automations];
    newAutomations[index] = { ...newAutomations[index], [field]: value };
    setAutomations(newAutomations);
  };

  // Guardar automatizaciones
  const handleSaveAutomations = async () => {
    if (!organizationId) return;
    setSaving(true);

    try {
      // Eliminar automatizaciones existentes para evitar duplicados
      await supabase
        .from("stage_automations")
        .delete()
        .eq("pipeline_id", pipelineId)
        .eq("organization_id", organizationId);

      // Insertar nuevas automatizaciones
      for (const automation of automations) {
        // Solo guardar si se han seleccionado ambas etapas
        if (automation.from_stage_id && automation.to_stage_id) {
          const { error } = await supabase
            .from("stage_automations")
            .insert({
              ...automation,
              created_at: new Date().toISOString()
            });

          if (error) throw error;
        }
      }

      alert("Automatizaciones guardadas correctamente");
    } catch (error) {
      console.error("Error al guardar automatizaciones:", error);
      alert("Error al guardar las automatizaciones");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-24">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
        <span className="ml-2">Cargando configuraciones...</span>
      </div>
    );
  }

  return (
    <Card className={`w-full border ${theme === 'dark' ? 'bg-background/40' : 'bg-background'}`}>
      <CardHeader>
        <CardTitle>Configuración de Automatizaciones</CardTitle>
        <CardDescription>
          Define qué acciones se ejecutan cuando una oportunidad cambia de etapa
        </CardDescription>
      </CardHeader>
      <CardContent>
        {automations.map((automation, index) => (
          <div key={index} className={`mb-6 p-4 rounded-md ${theme === 'dark' ? 'bg-secondary/20' : 'bg-secondary/10'}`}>
            <div className="flex flex-col md:flex-row justify-between mb-4">
              <div className="flex-1 mb-2 md:mb-0 md:mr-2">
                <Label htmlFor={`from-stage-${index}`} className="mb-2 block">
                  Etapa de Origen
                </Label>
                <Select
                  value={automation.from_stage_id}
                  onValueChange={(value) => handleAutomationChange(index, 'from_stage_id', value)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Seleccionar etapa de origen" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      <SelectItem value="">Cualquier etapa</SelectItem>
                      {stages.map((stage) => (
                        <SelectItem key={stage.id} value={stage.id}>
                          {stage.name}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex-1 mb-2 md:mb-0 md:mr-2">
                <Label htmlFor={`to-stage-${index}`} className="mb-2 block">
                  Etapa de Destino
                </Label>
                <Select
                  value={automation.to_stage_id}
                  onValueChange={(value) => handleAutomationChange(index, 'to_stage_id', value)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Seleccionar etapa de destino" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      {stages.map((stage) => (
                        <SelectItem key={stage.id} value={stage.id}>
                          {stage.name}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex-none mt-2 md:mt-6">
                <Button 
                  variant="destructive" 
                  size="icon" 
                  onClick={() => handleDeleteAutomation(index)}
                  disabled={automations.length <= 1}
                >
                  <Trash className="h-4 w-4" />
                </Button>
              </div>
            </div>

            <div className="space-y-4 mt-4">
              <div className="flex items-center space-x-2">
                <Checkbox 
                  id={`send-email-${index}`} 
                  checked={automation.send_email}
                  onCheckedChange={(checked) => 
                    handleAutomationChange(index, 'send_email', Boolean(checked))
                  }
                />
                <Label htmlFor={`send-email-${index}`} className="flex items-center">
                  <Mail className="h-4 w-4 mr-1" />
                  Enviar notificación por correo
                </Label>
              </div>
              
              <div className="space-y-2">
                <div className="flex items-center space-x-2">
                  <Checkbox 
                    id={`create-task-${index}`} 
                    checked={automation.create_task}
                    onCheckedChange={(checked) => 
                      handleAutomationChange(index, 'create_task', Boolean(checked))
                    }
                  />
                  <Label htmlFor={`create-task-${index}`}>Crear tarea automáticamente</Label>
                </div>
                
                {automation.create_task && (
                  <div className="ml-6 space-y-3 mt-3">
                    <div>
                      <Label htmlFor={`task-title-${index}`} className="mb-1 block">
                        Título de la tarea
                      </Label>
                      <Input
                        id={`task-title-${index}`}
                        value={automation.task_title}
                        onChange={(e) => handleAutomationChange(index, 'task_title', e.target.value)}
                        placeholder="Título de la tarea"
                      />
                    </div>
                    
                    <div>
                      <Label htmlFor={`task-description-${index}`} className="mb-1 block">
                        Descripción de la tarea
                      </Label>
                      <Textarea
                        id={`task-description-${index}`}
                        value={automation.task_description}
                        onChange={(e) => handleAutomationChange(index, 'task_description', e.target.value)}
                        placeholder="Descripción detallada de la tarea"
                        rows={2}
                      />
                    </div>
                    
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <Label htmlFor={`task-days-${index}`} className="mb-1 block">
                          Días para vencimiento
                        </Label>
                        <Input
                          id={`task-days-${index}`}
                          type="number"
                          min={1}
                          value={automation.task_days_due}
                          onChange={(e) => handleAutomationChange(index, 'task_days_due', parseInt(e.target.value) || 1)}
                        />
                      </div>
                      <div>
                        <Label htmlFor={`task-priority-${index}`} className="mb-1 block">
                          Prioridad
                        </Label>
                        <Select
                          value={automation.task_priority}
                          onValueChange={(value) => handleAutomationChange(index, 'task_priority', value)}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Seleccionar prioridad" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="low">Baja</SelectItem>
                            <SelectItem value="medium">Media</SelectItem>
                            <SelectItem value="high">Alta</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              <div className="flex items-center space-x-2 mt-2">
                <Switch 
                  id={`is-active-${index}`}
                  checked={automation.is_active}
                  onCheckedChange={(checked) => 
                    handleAutomationChange(index, 'is_active', checked)
                  }
                />
                <Label htmlFor={`is-active-${index}`}>Automatización activa</Label>
              </div>
            </div>
          </div>
        ))}
        
        <Button variant="outline" className="mt-2 w-full" onClick={handleAddAutomation}>
          <Plus className="h-4 w-4 mr-1" />
          Añadir nueva automatización
        </Button>
      </CardContent>
      <CardFooter>
        <Button 
          className="w-full" 
          onClick={handleSaveAutomations} 
          disabled={saving}
        >
          {saving ? (
            <>
              <Loader2 className="h-4 w-4 mr-1 animate-spin" />
              Guardando...
            </>
          ) : (
            <>
              <Check className="h-4 w-4 mr-1" />
              Guardar automatizaciones
            </>
          )}
        </Button>
      </CardFooter>
    </Card>
  );
}
