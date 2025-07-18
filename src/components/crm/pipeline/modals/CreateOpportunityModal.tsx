"use client";

import { Customer, FormMessage, OpportunityFormData, PipelineStage } from "../types";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Briefcase } from "lucide-react";

interface CreateOpportunityModalProps {
  isOpen: boolean;
  onClose: () => void;
  customer: Customer | null;
  formData: OpportunityFormData;
  onFormChange: (field: string, value: string | number) => void;
  onCreate: () => void;
  isSaving: boolean;
  formMessage: FormMessage;
  pipelineStages: PipelineStage[];
}

export default function CreateOpportunityModal({
  isOpen,
  onClose,
  customer,
  formData,
  onFormChange,
  onCreate,
  isSaving,
  formMessage,
  pipelineStages,
}: CreateOpportunityModalProps) {
  if (!customer) return null;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Briefcase className="h-5 w-5 text-blue-500" />
            Nueva Oportunidad
          </DialogTitle>
          <DialogDescription>
            Crear una nueva oportunidad para {customer.full_name}
          </DialogDescription>
        </DialogHeader>

        <form
          className="space-y-4 py-2"
          onSubmit={(e) => {
            e.preventDefault();
            onCreate();
          }}
        >
          <div className="grid grid-cols-1 gap-4">
            <div className="space-y-2">
              <Label htmlFor="name">Nombre de la oportunidad</Label>
              <Input
                id="name"
                placeholder="Ej: Proyecto nuevo"
                value={formData.name}
                onChange={(e) =>
                  onFormChange("name", e.target.value)
                }
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="amount">Valor</Label>
              <Input
                id="amount"
                type="number"
                placeholder="0.00"
                value={formData.amount}
                onChange={(e) =>
                  onFormChange(
                    "amount",
                    parseFloat(e.target.value) || 0
                  )
                }
                required
                min="0"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="stage">Etapa</Label>
              <Select
                value={formData.stage}
                onValueChange={(value) =>
                  onFormChange("stage", value)
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Seleccionar etapa" />
                </SelectTrigger>
                <SelectContent>
                  {pipelineStages.length > 0 ? (
                    pipelineStages.map((stage) => (
                      <SelectItem key={stage.id} value={stage.id}>
                        <div className="flex items-center gap-3">
                          <div
                            className="w-2 h-2 rounded-full"
                            style={{
                              backgroundColor: stage.color || "#888",
                            }}
                          />
                          {stage.name}
                        </div>
                      </SelectItem>
                    ))
                  ) : (
                    <SelectItem value="contacto">
                      Contacto inicial
                    </SelectItem>
                  )}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="expected_close_date">
                Fecha estimada de cierre
              </Label>
              <Input
                id="expected_close_date"
                type="date"
                value={formData.expected_close_date}
                onChange={(e) =>
                  onFormChange(
                    "expected_close_date",
                    e.target.value
                  )
                }
                required
              />
            </div>

            {formMessage.text && (
              <div
                className={`mt-2 p-2 text-sm rounded-md ${
                  formMessage.type === "success"
                    ? "bg-green-50 text-green-700 dark:bg-green-900/30 dark:text-green-400"
                    : "bg-red-50 text-red-700 dark:bg-red-900/30 dark:text-red-400"
                }`}
              >
                {formMessage.text}
              </div>
            )}
          </div>
        </form>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={onClose}
            disabled={isSaving}
          >
            Cancelar
          </Button>
          <Button
            type="submit"
            onClick={onCreate}
            disabled={isSaving}
          >
            {isSaving ? "Creando..." : "Crear oportunidad"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
