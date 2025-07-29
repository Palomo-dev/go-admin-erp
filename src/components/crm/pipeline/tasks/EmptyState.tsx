"use client";

import React from "react";
import { Button } from "@/components/ui/button";
import { CheckSquare, Plus } from "lucide-react";

interface EmptyStateProps {
  onCreateTask: () => void;
}

/**
 * Componente de estado vacío para cuando no hay tareas
 * Muestra mensaje informativo y botón para crear primera tarea
 */
export default function EmptyState({ onCreateTask }: EmptyStateProps) {
  return (
    <div className="text-center py-8">
      <CheckSquare className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
      <h3 className="text-lg font-medium mb-2">No hay tareas registradas</h3>
      <p className="text-muted-foreground mb-4">
        Crea tareas y recordatorios para hacer seguimiento
      </p>
      <Button variant="outline" onClick={onCreateTask}>
        <Plus className="h-4 w-4 mr-2" />
        Crear Primera Tarea
      </Button>
    </div>
  );
}
