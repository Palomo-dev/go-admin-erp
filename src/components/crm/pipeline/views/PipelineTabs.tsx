"use client";

import React from "react";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";

interface PipelineTabsProps {
  activeTab: string;
  onTabChange: (tab: string) => void;
  onNewOpportunity: () => void;
  onCreatePipeline?: () => void;
}

/**
 * Componente de navegación de pestañas del pipeline
 * Maneja la selección de pestañas y el botón de nueva oportunidad
 */
export default function PipelineTabs({ activeTab, onTabChange, onNewOpportunity, onCreatePipeline }: PipelineTabsProps) {
  const tabs = [
    { id: "kanban", label: "Kanban" },
    { id: "table", label: "Tabla" },
    { id: "forecast", label: "Pronóstico" },
    { id: "clients", label: "Clientes" },
    { id: "automation", label: "Automatización" },
    { id: "pipelines", label: "Pipelines" },
  ];

  return (
    <div className="flex items-center justify-start gap-4 mb-6">
      <div className="flex space-x-1 bg-gray-100 dark:bg-gray-800 p-1 rounded-lg">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => onTabChange(tab.id)}
            className={`px-4 py-2 text-sm font-medium rounded-md transition-colors ${
              activeTab === tab.id
                ? "bg-blue-600 text-white shadow-sm"
                : "text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Botón Nueva Oportunidad - dentro del contenedor de pestañas */}
      {(activeTab === "kanban" || activeTab === "table") && (
        <Button 
          onClick={onNewOpportunity} 
          size="sm"
          className="bg-primary text-primary-foreground shadow hover:bg-primary/90 h-8 rounded-md px-3 text-xs gap-2"
        >
          <Plus className="h-4 w-4" />
          Nueva Oportunidad
        </Button>
      )}

      {/* Botón Crear Pipeline - dentro del contenedor de pestañas */}
      {activeTab === "pipelines" && onCreatePipeline && (
        <Button 
          onClick={onCreatePipeline} 
          size="sm"
          className="bg-primary text-primary-foreground shadow hover:bg-primary/90 h-8 rounded-md px-3 text-xs gap-2"
        >
          <Plus className="h-4 w-4" />
          Crear Pipeline
        </Button>
      )}
    </div>
  );
}
