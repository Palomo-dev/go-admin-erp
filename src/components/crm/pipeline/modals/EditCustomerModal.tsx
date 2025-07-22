"use client";

import { Customer, EditFormData, FormMessage } from "../types";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FileText } from "lucide-react";

interface EditCustomerModalProps {
  isOpen: boolean;
  onClose: () => void;
  customer: Customer | null;
  formData: EditFormData;
  onFormChange: (field: string, value: string) => void;
  onSave: () => void;
  isSaving: boolean;
  formMessage: FormMessage;
}

export default function EditCustomerModal({
  isOpen,
  onClose,
  customer,
  formData,
  onFormChange,
  onSave,
  isSaving,
  formMessage,
}: EditCustomerModalProps) {
  if (!customer) return null;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5 text-blue-500" />
            Editar Cliente
          </DialogTitle>
        </DialogHeader>

        <form
          className="space-y-4 py-2"
          onSubmit={(e) => {
            e.preventDefault();
            onSave();
          }}
        >
          <div className="grid grid-cols-1 gap-4">
            <div className="space-y-2">
              <Label htmlFor="full_name">Nombre completo</Label>
              <Input
                id="full_name"
                value={formData.full_name}
                onChange={(e) =>
                  onFormChange("full_name", e.target.value)
                }
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="email">Correo electrónico</Label>
              <Input
                id="email"
                type="email"
                value={formData.email}
                onChange={(e) =>
                  onFormChange("email", e.target.value)
                }
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="phone">Teléfono</Label>
              <Input
                id="phone"
                value={formData.phone}
                onChange={(e) =>
                  onFormChange("phone", e.target.value)
                }
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="address">Dirección</Label>
              <Input
                id="address"
                value={formData.address}
                onChange={(e) =>
                  onFormChange("address", e.target.value)
                }
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="notes">Notas</Label>
              <Input
                id="notes"
                value={formData.notes}
                onChange={(e) =>
                  onFormChange("notes", e.target.value)
                }
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
            onClick={onSave}
            disabled={isSaving}
          >
            {isSaving ? "Guardando..." : "Guardar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
