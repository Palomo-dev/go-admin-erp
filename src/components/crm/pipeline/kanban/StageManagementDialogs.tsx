"use client";

import React from "react";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2 } from "lucide-react";

interface Stage {
  id: string;
  name: string;
  color?: string;
  description?: string;
  position: number;
  pipeline_id: string;
}

interface StageManagementDialogsProps {
  // Estados de diálogos
  isConfigOpen: boolean;
  isCreateOpen: boolean;
  isDeleteOpen: boolean;
  
  // Estados de carga
  isSaving: boolean;
  isCreating: boolean;
  isDeleting: boolean;
  
  // Datos de configuración de etapa
  configStage: Stage | null;
  stageName: string;
  stageProbability: number | null;
  stageColor: string;
  stageDescription: string;
  
  // Datos de nueva etapa
  newStageName: string;
  newStageProbability: number | null;
  newStageColor: string;
  newStageDescription: string;
  
  // Etapa a eliminar
  stageToDelete: Stage | null;
  
  // Handlers de estado
  setStageName: (name: string) => void;
  setStageProbability: (probability: number | null) => void;
  setStageColor: (color: string) => void;
  setStageDescription: (description: string) => void;
  setNewStageName: (name: string) => void;
  setNewStageProbability: (probability: number | null) => void;
  setNewStageColor: (color: string) => void;
  setNewStageDescription: (description: string) => void;
  
  // Handlers de diálogos
  setIsConfigOpen: (open: boolean) => void;
  setIsCreateOpen: (open: boolean) => void;
  setIsDeleteOpen: (open: boolean) => void;
  
  // Handlers de acciones
  onSaveStage: () => void;
  onSaveNewStage: () => void;
  onConfirmDelete: () => void;
}

export default function StageManagementDialogs({
  // Estados de diálogos
  isConfigOpen,
  isCreateOpen,
  isDeleteOpen,
  
  // Estados de carga
  isSaving,
  isCreating,
  isDeleting,
  
  // Datos de configuración de etapa
  configStage,
  stageName,
  stageProbability,
  stageColor,
  stageDescription,
  
  // Datos de nueva etapa
  newStageName,
  newStageProbability,
  newStageColor,
  newStageDescription,
  
  // Etapa a eliminar
  stageToDelete,
  
  // Handlers de estado
  setStageName,
  setStageProbability,
  setStageColor,
  setStageDescription,
  setNewStageName,
  setNewStageProbability,
  setNewStageColor,
  setNewStageDescription,
  
  // Handlers de diálogos
  setIsConfigOpen,
  setIsCreateOpen,
  setIsDeleteOpen,
  
  // Handlers de acciones
  onSaveStage,
  onSaveNewStage,
  onConfirmDelete,
}: StageManagementDialogsProps) {
  return (
    <>
      {/* Diálogo de configuración de etapa */}
      <Dialog open={isConfigOpen} onOpenChange={setIsConfigOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Configurar etapa</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="stageName" className="text-right">
                Nombre <span className="text-red-500">*</span>
              </Label>
              <Input
                id="stageName"
                value={stageName}
                onChange={(e) => setStageName(e.target.value)}
                className="col-span-3"
                required
              />
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="probability" className="text-right">
                Probabilidad (%) <span className="text-gray-400 text-xs">(Opcional)</span>
              </Label>
              <Input
                id="probability"
                type="number"
                min="0"
                max="100"
                value={stageProbability || ''}
                onChange={(e) => setStageProbability(parseInt(e.target.value) || null)}
                className="col-span-3"
              />
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="color" className="text-right">
                Color <span className="text-gray-400 text-xs">(Opcional)</span>
              </Label>
              <div className="col-span-3 flex items-center gap-2">
                <input
                  type="color"
                  id="color"
                  value={stageColor}
                  onChange={(e) => setStageColor(e.target.value)}
                  className="h-8 w-8 rounded-md cursor-pointer"
                />
                <Input
                  value={stageColor}
                  onChange={(e) => setStageColor(e.target.value)}
                  className="flex-1"
                />
              </div>
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="description" className="text-right">
                Descripción <span className="text-gray-400 text-xs">(Opcional)</span>
              </Label>
              <Input
                id="description"
                value={stageDescription}
                onChange={(e) => setStageDescription(e.target.value)}
                className="col-span-3"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsConfigOpen(false)} disabled={isSaving}>
              Cancelar
            </Button>
            <Button type="submit" onClick={onSaveStage} disabled={isSaving}>
              {isSaving ? (
                <>
                  <span className="mr-2">Guardando</span>
                  <Loader2 className="h-4 w-4 animate-spin" />
                </>
              ) : (
                "Guardar"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      
      {/* Diálogo de creación de nueva etapa */}
      <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Crear nueva etapa</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="newStageName" className="text-right">
                Nombre <span className="text-red-500">*</span>
              </Label>
              <Input
                id="newStageName"
                value={newStageName}
                onChange={(e) => setNewStageName(e.target.value)}
                className="col-span-3"
                required
                placeholder="Nombre de la etapa"
              />
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="newProbability" className="text-right">
                Probabilidad (%) <span className="text-gray-400 text-xs">(Opcional)</span>
              </Label>
              <Input
                id="newProbability"
                type="number"
                min="0"
                max="100"
                value={newStageProbability || ''}
                onChange={(e) => setNewStageProbability(parseInt(e.target.value) || null)}
                className="col-span-3"
                placeholder="0-100"
              />
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="newColor" className="text-right">
                Color <span className="text-gray-400 text-xs">(Opcional)</span>
              </Label>
              <div className="col-span-3 flex items-center gap-2">
                <input
                  type="color"
                  id="newColor"
                  value={newStageColor}
                  onChange={(e) => setNewStageColor(e.target.value)}
                  className="h-8 w-8 rounded-md cursor-pointer"
                />
                <Input
                  value={newStageColor}
                  onChange={(e) => setNewStageColor(e.target.value)}
                  className="flex-1"
                  placeholder="#3b82f6"
                />
              </div>
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="newDescription" className="text-right">
                Descripción <span className="text-gray-400 text-xs">(Opcional)</span>
              </Label>
              <Input
                id="newDescription"
                value={newStageDescription}
                onChange={(e) => setNewStageDescription(e.target.value)}
                className="col-span-3"
                placeholder="Descripción opcional"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsCreateOpen(false)} disabled={isCreating}>
              Cancelar
            </Button>
            <Button type="submit" onClick={onSaveNewStage} disabled={isCreating}>
              {isCreating ? (
                <>
                  <span className="mr-2">Creando</span>
                  <Loader2 className="h-4 w-4 animate-spin" />
                </>
              ) : (
                "Crear etapa"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Diálogo de confirmación de eliminación */}
      <AlertDialog open={isDeleteOpen} onOpenChange={setIsDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Estás seguro?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta acción eliminará permanentemente la etapa "{stageToDelete?.name}".
              {/* Aquí se podría agregar validación de oportunidades asociadas */}
              Esta acción no se puede deshacer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>
              Cancelar
            </AlertDialogCancel>
            <AlertDialogAction 
              onClick={onConfirmDelete}
              disabled={isDeleting}
              className="bg-red-600 hover:bg-red-700 focus:ring-red-600"
            >
              {isDeleting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  Eliminando...
                </>
              ) : (
                "Eliminar etapa"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
