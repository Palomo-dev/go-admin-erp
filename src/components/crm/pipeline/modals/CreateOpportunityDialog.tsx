"use client";

import { useState } from "react";
import { createPortal } from "react-dom";
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

  if (!isOpen || typeof document === 'undefined') return null;
  return createPortal(
    <div className="fixed inset-0 bg-black bg-opacity-50 z-50 overflow-y-auto">
      <div className="min-h-screen px-1 sm:px-4 py-2 sm:py-8 flex items-center justify-center">
        <div className="bg-white rounded-xl shadow-2xl w-full max-w-6xl max-h-[97vh] sm:max-h-[90vh] overflow-hidden relative animate-in fade-in-0 zoom-in-95 duration-300 dark:bg-gray-800">
          <div className="sticky top-0 z-10 bg-white border-b border-gray-200 px-4 sm:px-6 py-4 flex items-center justify-between dark:bg-gray-800 dark:border-gray-700">
            <div>
              <h2 className="text-lg sm:text-xl font-semibold text-gray-900 dark:text-gray-50">Nueva Oportunidad</h2>
              <p className="text-sm text-gray-500 mt-1 dark:text-gray-400">Crear una nueva oportunidad con productos, espacios y conceptos personalizados</p>
            </div>
            <button className="p-2 hover:bg-gray-100 rounded-lg transition-colors dark:hover:bg-gray-700" onClick={handleCancel}>
              <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-gray-400 dark:text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
          <div className="overflow-y-auto max-h-[calc(90vh-80px)] bg-gray-50 dark:bg-gray-900">
            <div className="p-4 sm:p-6">
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
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}
