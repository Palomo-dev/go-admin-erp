"use client";

import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Loader2, Plus, Save, Trophy, XCircle } from "lucide-react";

export interface StageDialogValues {
  name: string;
  probability: number | null;
  color: string;
  description: string;
  is_won: boolean;
  is_lost: boolean;
}

interface StageDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: "create" | "edit";
  initialValues?: Partial<StageDialogValues>;
  onSubmit: (values: StageDialogValues) => Promise<void>;
}

export function StageDialog({
  open,
  onOpenChange,
  mode,
  initialValues,
  onSubmit,
}: StageDialogProps) {
  const [name, setName] = useState("");
  const [probability, setProbability] = useState<number | null>(null);
  const [color, setColor] = useState("#3b82f6");
  const [description, setDescription] = useState("");
  const [isWon, setIsWon] = useState(false);
  const [isLost, setIsLost] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setName(initialValues?.name ?? "");
      setProbability(initialValues?.probability ?? null);
      setColor(initialValues?.color ?? "#3b82f6");
      setDescription(initialValues?.description ?? "");
      setIsWon(initialValues?.is_won ?? false);
      setIsLost(initialValues?.is_lost ?? false);
    }
  }, [open, initialValues]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    setIsSaving(true);
    try {
      await onSubmit({
        name: name.trim(),
        probability,
        color,
        description: description.trim(),
        is_won: isWon,
        is_lost: isLost,
      });
      onOpenChange(false);
    } catch (error) {
      console.error("Error en StageDialog:", error);
    } finally {
      setIsSaving(false);
    }
  };

  const isEdit = mode === "edit";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md mx-4 max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-lg sm:text-xl text-gray-900 dark:text-gray-100">
            {isEdit ? "Configurar etapa" : "Nueva Etapa"}
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit}>
          <div className="grid gap-4 py-4">
            <div className="flex flex-col sm:grid sm:grid-cols-4 gap-2 sm:gap-4">
              <Label htmlFor="stageName" className="text-left sm:text-right text-gray-900 dark:text-gray-100 font-medium">
                Nombre <span className="text-red-600 dark:text-red-400">*</span>
              </Label>
              <Input
                id="stageName"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Ej: Propuesta Enviada"
                className="col-span-3 min-h-[44px] bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-600 text-gray-900 dark:text-gray-100"
                required
                autoFocus
              />
            </div>

            <div className="flex flex-col sm:grid sm:grid-cols-4 gap-2 sm:gap-4">
              <Label htmlFor="probability" className="text-left sm:text-right text-gray-900 dark:text-gray-100 font-medium">
                Probabilidad (%) <span className="text-gray-500 dark:text-gray-400 text-xs">(Opcional)</span>
              </Label>
              <Input
                id="probability"
                type="number"
                min="0"
                max="100"
                value={probability ?? ""}
                onChange={(e) => setProbability(e.target.value ? parseInt(e.target.value) : null)}
                className="col-span-3 min-h-[44px] bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-600 text-gray-900 dark:text-gray-100"
              />
            </div>

            <div className="flex flex-col sm:grid sm:grid-cols-4 gap-2 sm:gap-4">
              <Label htmlFor="color" className="text-left sm:text-right text-gray-900 dark:text-gray-100 font-medium">
                Color <span className="text-gray-500 dark:text-gray-400 text-xs">(Opcional)</span>
              </Label>
              <div className="col-span-3 flex items-center gap-2">
                <input
                  type="color"
                  id="color"
                  value={color}
                  onChange={(e) => setColor(e.target.value)}
                  className="h-10 w-10 rounded-md cursor-pointer border-2 border-gray-300 dark:border-gray-600"
                />
                <Input
                  value={color}
                  onChange={(e) => setColor(e.target.value)}
                  className="flex-1 min-h-[44px] bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-600 text-gray-900 dark:text-gray-100"
                />
              </div>
            </div>

            <div className="flex flex-col sm:grid sm:grid-cols-4 gap-2 sm:gap-4">
              <Label htmlFor="description" className="text-left sm:text-right text-gray-900 dark:text-gray-100 font-medium">
                Descripción <span className="text-gray-500 dark:text-gray-400 text-xs">(Opcional)</span>
              </Label>
              <Input
                id="description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Descripción opcional de la etapa"
                className="col-span-3 min-h-[44px] bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-600 text-gray-900 dark:text-gray-100"
              />
            </div>

            {/* Switches de cierre ganado / perdido */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-3 border-t border-gray-200 dark:border-gray-700">
              <div className="flex items-center justify-between rounded-lg border border-green-200 dark:border-green-800 bg-green-50 dark:bg-green-900/20 p-3">
                <div className="flex items-center gap-2">
                  <Trophy className="h-4 w-4 text-green-600 dark:text-green-400" />
                  <div>
                    <Label className="text-sm font-medium text-green-700 dark:text-green-400">
                      Cierre ganado
                    </Label>
                    <p className="text-xs text-green-600 dark:text-green-500">
                      Mover aquí = ganada
                    </p>
                  </div>
                </div>
                <Switch
                  checked={isWon}
                  onCheckedChange={(checked) => {
                    setIsWon(checked);
                    if (checked) setIsLost(false);
                  }}
                />
              </div>

              <div className="flex items-center justify-between rounded-lg border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20 p-3">
                <div className="flex items-center gap-2">
                  <XCircle className="h-4 w-4 text-red-600 dark:text-red-400" />
                  <div>
                    <Label className="text-sm font-medium text-red-700 dark:text-red-400">
                      Cierre perdido
                    </Label>
                    <p className="text-xs text-red-600 dark:text-red-500">
                      Mover aquí = perdida
                    </p>
                  </div>
                </div>
                <Switch
                  checked={isLost}
                  onCheckedChange={(checked) => {
                    setIsLost(checked);
                    if (checked) setIsWon(false);
                  }}
                />
              </div>
            </div>
          </div>

          <DialogFooter className="flex-col sm:flex-row gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isSaving}
              className="w-full sm:w-auto min-h-[44px] border-gray-300 dark:border-gray-600 text-gray-900 dark:text-gray-100 hover:bg-gray-50 dark:hover:bg-gray-700"
            >
              Cancelar
            </Button>
            <Button
              type="submit"
              disabled={isSaving || !name.trim()}
              className="w-full sm:w-auto min-h-[44px] bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white"
            >
              {isSaving ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  {isEdit ? "Guardando..." : "Creando..."}
                </>
              ) : isEdit ? (
                <>
                  <Save className="h-4 w-4 mr-2" />
                  Guardar
                </>
              ) : (
                <>
                  <Plus className="h-4 w-4 mr-2" />
                  Crear Etapa
                </>
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
