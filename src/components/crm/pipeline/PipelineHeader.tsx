"use client";

import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase/config";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { toast } from "@/components/ui/use-toast";
import { Loader2, Plus, Edit, SlidersHorizontal } from "lucide-react";
import { 
  DropdownMenu, 
  DropdownMenuContent, 
  DropdownMenuItem, 
  DropdownMenuTrigger,
  DropdownMenuLabel,
  DropdownMenuSeparator
} from "@/components/ui/dropdown-menu";

interface Pipeline {
  id: string;
  name: string;
  is_default: boolean;
  goal_amount?: number;
  goal_period?: string;
  goal_currency?: string;
}

interface PipelineHeaderProps {
  currentPipelineId: string;
  onPipelineChange: (pipelineId: string) => void;
}

export default function PipelineHeader({ 
  currentPipelineId, 
  onPipelineChange
}: PipelineHeaderProps) {
  const [pipelines, setPipelines] = useState<Pipeline[]>([]);
  const [currentPipeline, setCurrentPipeline] = useState<Pipeline | null>(null);
  const [organizationId, setOrganizationId] = useState<number | null>(null);
  
  // Estados para gestión de pipelines
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
  
  // Obtener el ID de la organización del localStorage con múltiples opciones de clave
  useEffect(() => {
    // Lista de posibles claves donde podría estar almacenado el ID de la organización
    const possibleKeys = [
      "currentOrganizationId",
      "organizationId", 
      "selectedOrganizationId",
      "orgId",
      "organization_id"
    ];
    
    // Buscar en localStorage
    for (const key of possibleKeys) {
      const orgId = localStorage.getItem(key);
      if (orgId) {
        // Organización encontrada en localStorage
        setOrganizationId(Number(orgId));
        return;
      }
    }
    
    // Si no está en localStorage, buscar en sessionStorage
    for (const key of possibleKeys) {
      const orgId = sessionStorage.getItem(key);
      if (orgId) {
        // Organización encontrada en sessionStorage
        setOrganizationId(Number(orgId));
        return;
      }
    }
    
    // Si no se encuentra, usar un valor predeterminado para desarrollo
    if (process.env.NODE_ENV !== 'production') {
      // Usando ID de organización predeterminado para desarrollo
      setOrganizationId(2); // Valor predeterminado para desarrollo
    } else {
      // No se pudo encontrar el ID de organización en el almacenamiento local
    }
  }, []);
  
  // Cargar los pipelines de la organización cuando tengamos el ID
  useEffect(() => {
    const loadPipelines = async () => {
      if (!organizationId) return;
      
      const { data, error } = await supabase
        .from("pipelines")
        .select("id, name, is_default")
        .eq("organization_id", organizationId)
        .order("is_default", { ascending: false });
        
      if (error) {
        console.error("Error al cargar pipelines:", error);
        return;
      }
      
      if (data && data.length > 0) {
        setPipelines(data);
        
        // Establecer el pipeline actual
        if (currentPipelineId) {
          const selected = data.find(p => p.id === currentPipelineId);
          if (selected) {
            setCurrentPipeline(selected);
          } else {
            // Si no encontramos el pipeline seleccionado, usar el primero
            setCurrentPipeline(data[0]);
            onPipelineChange(data[0].id);
          }
        } else {
          // Si no hay pipeline seleccionado, usar el predeterminado o el primero
          const defaultPipeline = data.find(p => p.is_default) || data[0];
          setCurrentPipeline(defaultPipeline);
          onPipelineChange(defaultPipeline.id);
        }
      }
    };
    
    loadPipelines();
  }, [organizationId, currentPipelineId, onPipelineChange]);
  
  const handlePipelineChange = (pipeline: Pipeline) => {
    setCurrentPipeline(pipeline);
    onPipelineChange(pipeline.id);
  };
  
  // Limpiar formulario
  const clearForm = () => {
    setName("");
    setIsDefault(false);
    setGoalAmount("");
    setGoalPeriod("monthly");
    setGoalCurrency("USD");
  };
  
  // Recargar pipelines
  const reloadPipelines = async () => {
    if (!organizationId) return;
    
    try {
      const { data, error } = await supabase
        .from("pipelines")
        .select("*")
        .eq("organization_id", organizationId)
        .order("created_at", { ascending: true });

      if (error) {
        console.error("Error al cargar pipelines:", error);
        return;
      }

      setPipelines(data || []);
    } catch (error) {
      console.error("Error inesperado:", error);
    }
  };
  
  // Abrir diálogo de creación
  const handleCreate = () => {
    clearForm();
    setIsCreateOpen(true);
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
      await reloadPipelines();
      
      // Si es el primer pipeline o se marcó como predeterminado, seleccionarlo
      if (pipelines.length === 0 || isDefault) {
        handlePipelineChange(data);
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

  const handleSaveEdit = async () => {
    if (!name.trim()) {
      toast({
        title: "Error",
        description: "El nombre del pipeline es requerido",
        variant: "destructive",
      });
      return;
    }

    if (!editingPipeline) return;

    setIsUpdating(true);
    try {
      const { data, error } = await supabase
        .from("pipelines")
        .update({
          name: name.trim(),
          is_default: isDefault,
          goal_amount: goalAmount ? parseFloat(goalAmount) : 0,
          goal_period: goalPeriod,
          goal_currency: goalCurrency,
        })
        .eq("id", editingPipeline.id)
        .eq("organization_id", organizationId)
        .select()
        .single();

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
      await reloadPipelines();
      
      // Si se marcó como predeterminado, seleccionarlo
      if (isDefault) {
        handlePipelineChange(data);
      }

      setIsEditOpen(false);
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
  
  return (
    <header className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 p-4 border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 transition-colors duration-200">
      <div className="flex flex-col">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
          Pipeline CRM
        </h1>
        <div className="flex items-center mt-1">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" className="text-blue-600 dark:text-blue-400 bg-transparent font-medium">
                {currentPipeline?.name || "Seleccionar Pipeline"}
                <SlidersHorizontal className="ml-2 h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent className="w-64">
              <DropdownMenuLabel>Pipelines</DropdownMenuLabel>
              <DropdownMenuSeparator />
              {pipelines.map((pipeline) => (
                <DropdownMenuItem 
                  key={pipeline.id} 
                  onClick={() => handlePipelineChange(pipeline)}
                  className={`flex items-center justify-between ${pipeline.id === currentPipeline?.id ? "bg-blue-50 dark:bg-gray-700" : ""}`}
                >
                  <div className="flex items-center flex-1">
                    <span>{pipeline.name}</span>
                    {pipeline.is_default && (
                      <span className="ml-2 text-xs bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200 px-1.5 py-0.5 rounded-full">
                        Por defecto
                      </span>
                    )}
                  </div>
                  <div className="flex items-center space-x-1 ml-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 w-6 p-0 hover:bg-gray-200 dark:hover:bg-gray-600"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleEdit(pipeline);
                      }}
                    >
                      <Edit className="h-3 w-3" />
                    </Button>
                  </div>
                </DropdownMenuItem>
              ))}
              <DropdownMenuSeparator />
              <DropdownMenuItem 
                onClick={handleCreate}
                className="text-blue-600 dark:text-blue-400 font-medium"
              >
                <Plus className="h-4 w-4 mr-2" />
                Crear Nuevo Pipeline
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      
      {/* Diálogo de creación de pipeline */}
      <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Crear Nuevo Pipeline</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="name" className="text-right">
                Nombre <span className="text-red-500">*</span>
              </Label>
              <Input
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="col-span-3"
                placeholder="Nombre del pipeline"
              />
            </div>
            
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="isDefault" className="text-right">
                Predeterminado
              </Label>
              <div className="col-span-3">
                <Switch
                  id="isDefault"
                  checked={isDefault}
                  onCheckedChange={setIsDefault}
                />
              </div>
            </div>

            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="goalAmount" className="text-right">
                Meta de ventas
              </Label>
              <Input
                id="goalAmount"
                type="number"
                value={goalAmount}
                onChange={(e) => setGoalAmount(e.target.value)}
                className="col-span-3"
                placeholder="0"
              />
            </div>

            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="goalPeriod" className="text-right">
                Período
              </Label>
              <Select value={goalPeriod} onValueChange={setGoalPeriod}>
                <SelectTrigger className="col-span-3">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="monthly">Mensual</SelectItem>
                  <SelectItem value="annual">Anual</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="goalCurrency" className="text-right">
                Moneda
              </Label>
              <Select value={goalCurrency} onValueChange={setGoalCurrency}>
                <SelectTrigger className="col-span-3">
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
      
      {/* Diálogo de edición de pipeline */}
      <Dialog open={isEditOpen} onOpenChange={setIsEditOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Editar Pipeline</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="editName" className="text-right">
                Nombre <span className="text-red-500">*</span>
              </Label>
              <Input
                id="editName"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="col-span-3"
                placeholder="Nombre del pipeline"
              />
            </div>
            
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="editIsDefault" className="text-right">
                Predeterminado
              </Label>
              <div className="col-span-3">
                <Switch
                  id="editIsDefault"
                  checked={isDefault}
                  onCheckedChange={setIsDefault}
                />
              </div>
            </div>

            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="editGoalAmount" className="text-right">
                Meta de ventas
              </Label>
              <Input
                id="editGoalAmount"
                type="number"
                value={goalAmount}
                onChange={(e) => setGoalAmount(e.target.value)}
                className="col-span-3"
                placeholder="0"
              />
            </div>

            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="editGoalPeriod" className="text-right">
                Período
              </Label>
              <Select value={goalPeriod} onValueChange={setGoalPeriod}>
                <SelectTrigger className="col-span-3">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="monthly">Mensual</SelectItem>
                  <SelectItem value="annual">Anual</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="editGoalCurrency" className="text-right">
                Moneda
              </Label>
              <Select value={goalCurrency} onValueChange={setGoalCurrency}>
                <SelectTrigger className="col-span-3">
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
    </header>
  );
}
