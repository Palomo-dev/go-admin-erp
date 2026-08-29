"use client";

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { OpportunityForm } from "@/components/crm/oportunidades/OpportunityForm";

interface CreateOpportunityDialogProps {
  isOpen: boolean;
  onClose: () => void;
  pipelineId?: string;
  stageId?: string;
  customerId?: string;
  onSuccess?: () => void;
}

export default function CreateOpportunityDialog({
  isOpen,
  onClose,
  pipelineId,
  stageId,
  customerId,
  onSuccess,
}: CreateOpportunityDialogProps) {
  const [formKey, setFormKey] = useState(0);

  const handleSuccess = () => {
    if (onSuccess) {
      onSuccess();
    }
    onClose();
    setFormKey((prev) => prev + 1);
  };

  const handleCancel = () => {
    onClose();
    setFormKey((prev) => prev + 1);
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-6xl w-[96vw] h-[92vh] max-h-[92vh] overflow-y-auto bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-700 p-0">
        <DialogHeader className="sr-only">
          <DialogTitle>Nueva Oportunidad</DialogTitle>
          <DialogDescription>
            Crear una nueva oportunidad con productos, espacios y conceptos personalizados
          </DialogDescription>
        </DialogHeader>
        <div className="p-5 h-full">
        <OpportunityForm
          key={formKey}
          initialPipelineId={pipelineId}
          initialStageId={stageId}
          initialCustomerId={customerId}
          onSuccess={handleSuccess}
          onCancel={handleCancel}
          hideHeader
        />
        </div>
      </DialogContent>
    </Dialog>
  );
}
