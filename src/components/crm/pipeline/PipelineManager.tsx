"use client";

import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/lib/supabase/config";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { toast } from "@/components/ui/use-toast";
import { Loader2, Settings, Edit, Trash2, Target, Calendar } from "lucide-react";
import { formatCurrency } from "@/utils/Utils";

interface Pipeline {
  id: string;
  name: string;
  is_default: boolean;
  goal_amount: number;
  goal_period: string;
  goal_currency: string;
  created_at: string;
  updated_at: string;
}

interface PipelineManagerProps {
  organizationId: number;
  currentPipelineId: string;
  onPipelineChange: (pipelineId: string) => void;
}

export default function PipelineManager({ 
  organizationId, 
  currentPipelineId, 
  onPipelineChange 
}: PipelineManagerProps) {
  const [pipelines, setPipelines] = useState<Pipeline[]>([]);
  const [loading, setLoading] = useState(true);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);
  const [editingPipeline, setEditingPipeline] = useState<Pipeline | null>(null);

  // Estados del formulario
  const [name, setName] = useState("");
  const [isDefault, setIsDefault] = useState(false);
  const [goalAmount, setGoalAmount] = useState("");
  const [goalPeriod, setGoalPeriod] = useState("monthly");
  const [goalCurrency, setGoalCurrency] = useState("USD");

  // Cargar pipelines
  const loadPipelines = useCallback(async () => {
    if (!organizationId) return;

    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("pipelines")
        .select("*")
        .eq("organization_id", organizationId)
        .order("created_at", { ascending: true });

      if (error) {
        console.error("Error al cargar pipelines:", error);
        toast({
          title: "Error",
          description: "No se pudieron cargar los pipelines",
          variant: "destructive",
        });
        return;
      }

      setPipelines(data || []);
    } catch (error) {
      console.error("Error inesperado:", error);
      toast({
        title: "Error",
        description: "Error inesperado al cargar pipelines",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }, [organizationId]);

  useEffect(() => {
    loadPipelines();
  }, [organizationId, loadPipelines]);

  // Limpiar formulario
  const clearForm = () => {
    setName("");
    setIsDefault(false);
    setGoalAmount("");
    setGoalPeriod("monthly");
    setGoalCurrency("USD");
  };

  // Abrir diálogo de edición
  const handleEdit = (pipeline: Pipeline) => {
    setEditingPipeline(pipeline);
    setName(pipeline.name);
    setIsDefault(pipeline.is_default);
    setGoalAmount(pipeline.goal_amount?.toString() || "");
    setGoalPeriod(pipeline.goal_period || "monthly");
    setGoalCurrency(pipeline.goal_currency || "USD");
    setIsEditOpen(true);
  };

  // Crear nuevo pipeline
  const handleSaveNew = async () => {
    if (!name.trim()) {
      toast({
        title: "Error",
        description: "El nombre del pipeline es requerido",
        variant: "destructive",
      });
      return;
    }

    setIsCreating(true);
    try {
      const { data, error } = await supabase
        .from("pipelines")
        .insert({
          name: name.trim(),
          organization_id: organizationId,
          is_default: isDefault,
          goal_amount: goalAmount ? parseFloat(goalAmount) : 0,
          goal_period: goalPeriod,
          goal_currency: goalCurrency,
        })
        .select()
        .single();

      if (error) {
        console.error("Error al crear pipeline:", error);
        toast({
          title: "Error",
          description: "No se pudo crear el pipeline",
          variant: "destructive",
        });
        return;
      }

      toast({
        title: "Éxito",
        description: "Pipeline creado exitosamente",
      });

      // Recargar pipelines
      await loadPipelines();
      
      // Si es el primer pipeline o se marcó como predeterminado, seleccionarlo
      if (pipelines.length === 0 || isDefault) {
        onPipelineChange(data.id);
      }

      setIsCreateOpen(false);
      clearForm();
    } catch (error) {
      console.error("Error inesperado:", error);
      toast({
        title: "Error",
        description: "Error inesperado al crear pipeline",
        variant: "destructive",
      });
    } finally {
      setIsCreating(false);
    }
  };

  // Actualizar pipeline existente
  const handleSaveEdit = async () => {
    if (!editingPipeline || !name.trim()) {
      toast({
        title: "Error",
        description: "El nombre del pipeline es requerido",
        variant: "destructive",
      });
      return;
    }

    setIsUpdating(true);
    try {
      const { error } = await supabase
        .from("pipelines")
        .update({
          name: name.trim(),
          is_default: isDefault,
          goal_amount: goalAmount ? parseFloat(goalAmount) : 0,
          goal_period: goalPeriod,
          goal_currency: goalCurrency,
          updated_at: new Date().toISOString(),
        })
        .eq("id", editingPipeline.id);

      if (error) {
        console.error("Error al actualizar pipeline:", error);
        toast({
          title: "Error",
          description: "No se pudo actualizar el pipeline",
          variant: "destructive",
        });
        return;
      }

      toast({
        title: "Éxito",
        description: "Pipeline actualizado exitosamente",
      });

      // Recargar pipelines
      await loadPipelines();
      
      setIsEditOpen(false);
      setEditingPipeline(null);
      clearForm();
    } catch (error) {
      console.error("Error inesperado:", error);
      toast({
        title: "Error",
        description: "Error inesperado al actualizar pipeline",
        variant: "destructive",
      });
    } finally {
      setIsUpdating(false);
    }
  };

  // Eliminar pipeline
  const handleDelete = async (pipeline: Pipeline) => {
    if (pipelines.length <= 1) {
      toast({
        title: "Error",
        description: "No se puede eliminar el último pipeline",
        variant: "destructive",
      });
      return;
    }

    if (!confirm(`¿Estás seguro de que quieres eliminar el pipeline "${pipeline.name}"?`)) {
      return;
    }

    try {
      const { error } = await supabase
        .from("pipelines")
        .delete()
        .eq("id", pipeline.id);

      if (error) {
        console.error("Error al eliminar pipeline:", error);
        toast({
          title: "Error",
          description: "No se pudo eliminar el pipeline",
          variant: "destructive",
        });
        return;
      }

      toast({
        title: "Éxito",
        description: "Pipeline eliminado exitosamente",
      });

      // Si se eliminó el pipeline actual, seleccionar otro
      if (currentPipelineId === pipeline.id) {
        const remainingPipelines = pipelines.filter(p => p.id !== pipeline.id);
        if (remainingPipelines.length > 0) {
          onPipelineChange(remainingPipelines[0].id);
        }
      }

      // Recargar pipelines
      await loadPipelines();
    } catch (error) {
      console.error("Error inesperado:", error);
      toast({
        title: "Error",
        description: "Error inesperado al eliminar pipeline",
        variant: "destructive",
      });
    }
  };

  if (loading) {
    return (
      <div className="flex items-center gap-2">
        <Loader2 className="h-4 w-4 animate-spin" />
        <span className="text-sm text-gray-600 dark:text-gray-400">Cargando pipelines...</span>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
          Gestión de Pipelines
        </h3>
      </div>

      {/* Lista de pipelines */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {pipelines.map((pipeline) => (
          <Card 
            key={pipeline.id} 
            className={`transition-all duration-200 ${
              currentPipelineId === pipeline.id 
                ? 'ring-2 ring-blue-500 dark:ring-blue-400 bg-blue-50/50 dark:bg-blue-950/50' 
                : 'hover:shadow-md'
            }`}
          >
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base flex items-center gap-2">
                  {pipeline.name}
                  {pipeline.is_default && (
                    <Badge variant="secondary" className="text-xs">
                      Predeterminado
                    </Badge>
                  )}
                </CardTitle>
                <div className="flex items-center gap-1">
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => onPipelineChange(pipeline.id)}
                          className="h-8 w-8 p-0"
                        >
                          <Settings className="h-4 w-4" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p>Seleccionar pipeline</p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                  
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleEdit(pipeline)}
                          className="h-8 w-8 p-0"
                        >
                          <Edit className="h-4 w-4" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p>Editar pipeline</p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>

                  {pipelines.length > 1 && (
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleDelete(pipeline)}
                            className="h-8 w-8 p-0 text-red-600 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>
                          <p>Eliminar pipeline</p>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  )}
                </div>
              </div>
            </CardHeader>
            <CardContent className="pt-0">
              {pipeline.goal_amount > 0 && (
                <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
                  <Target className="h-4 w-4" />
                  <span>Meta: {formatCurrency(pipeline.goal_amount)} {pipeline.goal_currency}</span>
                </div>
              )}
              <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400 mt-1">
                <Calendar className="h-4 w-4" />
                <span>Período: {pipeline.goal_period === 'monthly' ? 'Mensual' : 'Anual'}</span>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Diálogo de creación */}
      <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Crear Nuevo Pipeline</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="name">
                Nombre <span className="text-red-500">*</span>
              </Label>
              <Input
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Nombre del pipeline"
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="isDefault" className="text-sm font-medium">
                Predeterminado
              </Label>
              <div className="flex justify-start">
                <Switch
                  id="isDefault"
                  checked={isDefault}
                  onCheckedChange={setIsDefault}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="goalAmount">
                Meta de ventas
              </Label>
              <Input
                id="goalAmount"
                type="number"
                value={goalAmount}
                onChange={(e) => setGoalAmount(e.target.value)}
                placeholder="0"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="goalPeriod">
                  Período
                </Label>
                <Select value={goalPeriod} onValueChange={setGoalPeriod}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="monthly">Mensual</SelectItem>
                    <SelectItem value="annual">Anual</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="goalCurrency">
                  Moneda
                </Label>
                <Select value={goalCurrency} onValueChange={setGoalCurrency}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="USD">USD - Dólar</SelectItem>
                    <SelectItem value="COP">COP - Peso Colombiano</SelectItem>
                    <SelectItem value="EUR">EUR - Euro</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsCreateOpen(false)} disabled={isCreating}>
              Cancelar
            </Button>
            <Button onClick={handleSaveNew} disabled={isCreating}>
              {isCreating ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  Creando...
                </>
              ) : (
                "Crear Pipeline"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Diálogo de edición */}
      <Dialog open={isEditOpen} onOpenChange={setIsEditOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Editar Pipeline</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="editName">
                Nombre <span className="text-red-500">*</span>
              </Label>
              <Input
                id="editName"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Nombre del pipeline"
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="editIsDefault" className="text-sm font-medium">
                Predeterminado
              </Label>
              <div className="flex justify-start">
                <Switch
                  id="editIsDefault"
                  checked={isDefault}
                  onCheckedChange={setIsDefault}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="editGoalAmount">
                Meta de ventas
              </Label>
              <Input
                id="editGoalAmount"
                type="number"
                value={goalAmount}
                onChange={(e) => setGoalAmount(e.target.value)}
                placeholder="0"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="editGoalPeriod">
                  Período
                </Label>
                <Select value={goalPeriod} onValueChange={setGoalPeriod}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="monthly">Mensual</SelectItem>
                    <SelectItem value="annual">Anual</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="editGoalCurrency">
                  Moneda
                </Label>
                <Select value={goalCurrency} onValueChange={setGoalCurrency}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="USD">USD - Dólar</SelectItem>
                    <SelectItem value="COP">COP - Peso Colombiano</SelectItem>
                    <SelectItem value="EUR">EUR - Euro</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsEditOpen(false)} disabled={isUpdating}>
              Cancelar
            </Button>
            <Button onClick={handleSaveEdit} disabled={isUpdating}>
              {isUpdating ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  Guardando...
                </>
              ) : (
                "Guardar Cambios"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
