"use client";

import React from "react";
import SegmentBuilder from "@/components/crm/segments/SegmentBuilder";

/**
 * Página principal del builder de segmentos CRM
 * Ruta: /app/crm/segmentos
 */
export default function SegmentosPage() {
  return (
    <div className="container mx-auto p-6">
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100">
              Builder de Segmentos
            </h1>
            <p className="text-gray-600 dark:text-gray-400 mt-2">
              Crea y gestiona segmentos de clientes utilizando filtros avanzados y eventos comportamentales
            </p>
          </div>
        </div>
        
        <SegmentBuilder />
      </div>
    </div>
  );
}
