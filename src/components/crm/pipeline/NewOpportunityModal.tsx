"use client";

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { NewOpportunityForm } from "./NewOpportunityForm";
import { useTheme } from "next-themes";
import { Toaster } from "@/components/ui/toaster";

interface NewOpportunityModalProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  pipelineId?: string;
  onSuccess?: () => void;
}

export function NewOpportunityModal({
  isOpen,
  onOpenChange,
  pipelineId,
  onSuccess,
}: NewOpportunityModalProps) {
  const { theme } = useTheme();

  const handleSuccess = () => {
    // Cerrar el modal después de crear exitosamente
    onOpenChange(false);
    
    // Llamar a la función de éxito si se proporciona
    if (onSuccess) {
      onSuccess();
    }
  };

  const handleCancel = () => {
    onOpenChange(false);
  };

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className={theme === 'dark' ? 'dark' : ''}>
        <DialogHeader>
          <DialogTitle>Nueva Oportunidad</DialogTitle>
          <DialogDescription>
            Crea una nueva oportunidad de negocio. Completa todos los campos requeridos.
          </DialogDescription>
        </DialogHeader>
        <NewOpportunityForm
          onSuccess={handleSuccess}
          onCancel={handleCancel}
          pipelineId={pipelineId}
        />
      </DialogContent>
      <Toaster />
    </Dialog>
  );
}
