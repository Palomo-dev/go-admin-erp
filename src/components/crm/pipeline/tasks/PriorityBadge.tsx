"use client";

import React from "react";
import { Badge } from "@/components/ui/badge";

interface PriorityBadgeProps {
  priority: string;
}

/**
 * Componente de badge de prioridad reutilizable
 * Muestra la prioridad de una tarea con colores apropiados
 */
export default function PriorityBadge({ priority }: PriorityBadgeProps) {
  switch (priority) {
    case 'high':
      return (
        <Badge className="bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-100">
          Alta
        </Badge>
      );
    case 'med':
      return (
        <Badge className="bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-100">
          Media
        </Badge>
      );
    case 'low':
      return (
        <Badge className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-100">
          Baja
        </Badge>
      );
    default:
      return (
        <Badge className="bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-100">
          Sin prioridad
        </Badge>
      );
  }
}
