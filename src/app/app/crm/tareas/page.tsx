import React from 'react';
import GestorTareas from '@/components/crm/tareas/core/GestorTareas';

/**
 * Página principal del Gestor de Tareas para el CRM
 * 
 * Implementa un gestor completo con las siguientes características:
 * - Vista de lista y tablero Kanban para tareas
 * - Soporte para tipos de tareas: llamada, reunión, email, visita
 * - Asignación a usuarios o roles
 * - Relación con clientes u oportunidades
 * - Recordatorios por push y email
 * - Integración con tabla tasks de Supabase
 */
export default function TareasPage() {
  return (
    <div className="container mx-auto py-6">
      <GestorTareas />
    </div>
  );
}
