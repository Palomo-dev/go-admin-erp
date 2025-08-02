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
    <div className="space-y-6 p-6 ml-4">
      <div className="flex justify-between items-center">
        <h2 className="text-3xl font-bold tracking-tight">Gestor de Tareas</h2>
        <div className="flex space-x-2">
          <Button onClick={abrirNuevaTarea}>
            <PlusCircle className="h-4 w-4 mr-2" />
            Nueva Tarea
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
