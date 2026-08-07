"use client";

import dynamic from "next/dynamic";
import { PageHeaderSkeleton, StatsSkeleton, CardListSkeleton } from "@/components/common/PageSkeletons";

// Importar el componente PipelineView de forma dinámica para evitar problemas de hidratación
const PipelineView = dynamic(
  () => import("@/components/crm/pipeline/PipelineView"),
  { 
    loading: () => (
      <div className="p-4 sm:p-6 lg:p-8 space-y-4 sm:space-y-6 bg-gray-50 dark:bg-gray-900 min-h-screen">
        <PageHeaderSkeleton />
        <StatsSkeleton count={4} />
        <CardListSkeleton cards={3} columns="1" />
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
