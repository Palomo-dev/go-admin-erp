"use client";

import dynamic from "next/dynamic";
import LoadingSpinner from "@/components/ui/loading-spinner";

// Importar el componente PipelineView de forma dinámica para evitar problemas de hidratación
const PipelineView = dynamic(
  () => import("@/components/crm/pipeline/PipelineView"),
  { 
    loading: () => (
      <div className="flex flex-col justify-center items-center h-screen bg-gray-50 dark:bg-gray-900 gap-3">
        <LoadingSpinner size="lg" />
        <span className="text-sm sm:text-base text-gray-600 dark:text-gray-400">Cargando pipeline...</span>
      </div>
    ),
    ssr: false
  }
);

/**
 * Página principal del Pipeline CRM
 * Implementa un sistema de vista kanban para gestionar oportunidades de ventas
 */
export default function PipelinePage() {
  return <PipelineView />;
}
