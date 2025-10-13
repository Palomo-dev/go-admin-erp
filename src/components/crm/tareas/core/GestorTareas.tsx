'use client';

import React, { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase/config';
import { Task, TaskFilter } from '@/types/task';
import TareasContent from './TareasContent';
import FormularioTarea from '../forms/FormularioTarea';
import FiltrosTareas from '../ui/FiltrosTareas';

import { Button } from '@/components/ui/button';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { PlusCircle } from 'lucide-react';

/**
 * Componente principal que gestiona la funcionalidad de tareas
 * Incluye recordatorios, lista de tareas y tablero kanban
 */
const GestorTareas: React.FC = () => {
  // Estados para manejar la tarea seleccionada, modal y filtros
  const [tareaSeleccionada, setTareaSeleccionada] = useState<Task | undefined>(undefined);
  const [modalAbierto, setModalAbierto] = useState(false);
  const [filtrosActivos, setFiltrosActivos] = useState<TaskFilter>({});
  const [mostrarFiltros, setMostrarFiltros] = useState(false);
  
  // Función para abrir el formulario de nueva tarea
  const abrirNuevaTarea = () => {
    setTareaSeleccionada(undefined);
    setModalAbierto(true);
  };
  
  // Función para abrir el formulario de edición de tarea
  const editarTarea = (tarea: Task) => {
    setTareaSeleccionada(tarea);
    setModalAbierto(true);
  };
  
  // Función para manejar el guardado de tarea
  const handleGuardarTarea = (tarea?: Task) => {
    // Esta función se llama después de guardar una tarea
    // No necesitamos hacer nada especial aquí, ya que los componentes 
    // se actualizarán automáticamente al volver a cargar las tareas
    setModalAbierto(false);
    setTareaSeleccionada(undefined);
  };

  // Función para manejar cambios en los filtros desde FiltrosTareas
  const handleFiltrosChange = (filtros: TaskFilter) => {
    console.log('Filtro actualizado desde FiltrosTareas:', filtros);
    setFiltrosActivos(filtros);
  };
  
  // Función para manejar cambios en los filtros desde TareasContent
  const handleTareasContentFiltroChange = (filtros: TaskFilter) => {
    console.log('Filtro actualizado desde TareasContent:', filtros);
    setFiltrosActivos(prevFiltros => ({
      ...prevFiltros,
      ...filtros
    }));
  };

  return (
    <div className="space-y-4 sm:space-y-6 p-3 sm:p-4 md:p-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 sm:gap-4">
        <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-gray-900 dark:text-gray-100">Gestor de Tareas</h2>
        <div className="flex space-x-2 w-full sm:w-auto">
          <Button onClick={abrirNuevaTarea} className="flex-1 sm:flex-none min-h-[44px] bg-blue-600 hover:bg-blue-700 text-white">
            <PlusCircle className="h-4 w-4 mr-2" />
            <span className="hidden sm:inline">Nueva Tarea</span>
            <span className="sm:hidden">Nueva</span>
          </Button>
        </div>
      </div>
      
      {/* Componente de filtros */}
      <FiltrosTareas 
        onFiltrosChange={handleFiltrosChange} 
        mostrarFiltros={mostrarFiltros}
        filtroTextoExterno={filtrosActivos.texto}
        filtrosIniciales={filtrosActivos}
      />
      
      <div className="w-full">
        {/* Sección principal con las tareas - ahora a pantalla completa */}
        <TareasContent 
          onEditTask={editarTarea}
          filtros={filtrosActivos}
          mostrarFiltros={mostrarFiltros}
          onToggleFiltros={() => setMostrarFiltros(!mostrarFiltros)}
          onFiltroChange={handleTareasContentFiltroChange}
        />
      </div>
      
      {/* Formulario para crear o editar tareas */}
      <FormularioTarea
        tarea={tareaSeleccionada}
        onSave={handleGuardarTarea}
        open={modalAbierto}
        onOpenChange={setModalAbierto}
      />
    </div>
  );
};

export default GestorTareas;
