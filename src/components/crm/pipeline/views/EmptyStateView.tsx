"use client";

import React from "react";

interface EmptyStateViewProps {
  message: string;
}

/**
 * Componente de estado vacío reutilizable para las pestañas del pipeline
 * Muestra un mensaje cuando no hay contenido disponible
 */
export default function EmptyStateView({ message }: EmptyStateViewProps) {
  return (
    <div className="p-4 text-center text-gray-500 dark:text-gray-400">
      {message}
    </div>
  );
}
