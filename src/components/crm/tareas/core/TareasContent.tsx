'use client';

import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useHasMounted } from '@/lib/hooks/useHasMounted';
import { Task, TaskFilter, TaskStatusUI, TaskStatus, NewTask, TaskViewMode } from '@/types/task';
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Loader2 } from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';

// Componentes refactorizados
import TareaCard from '../ui/TareaCard';
import TableroKanban from '../ui/TableroKanban';
import DialogoCancelacionTarea from '../forms/DialogoCancelacionTarea';
import DetallesTareaModal from '../forms/DetallesTareaModal';
import TareasHeader from '../ui/TareasHeader';
import TareasTable from '../ui/TareasTable';
import TareasPagination from '../ui/TareasPagination';

// Componentes de subtareas
import TaskHierarchyList from '../ui/TaskHierarchyList';
import SubtaskForm from '../forms/SubtaskForm';
import { useSubtasks } from '@/lib/hooks/useSubtasks';

// Utilidades y hooks refactorizados
import { getColorByPrioridad, getColorByTipoTarea, traducirTipoTarea, organizarTareasPorEstado, mapStatusToUIValue, mapStatusToDbValue } from './TareasUtils';
import { useTareasDataLoader } from './TareasDataLoader';
import { useTareasTablero } from './TareasTableroManager';
import { updateTask } from '@/lib/services/taskService';
import { getAssignableUsers } from '@/lib/services/userService';

// Tipos
import { TipoVista } from './types';

interface TareasContentProps {
  onEditTask?: (tarea: Task) => void;
  filtros?: TaskFilter;
  onToggleFiltros?: () => void;
  mostrarFiltros?: boolean;
  filtrosExternos?: TaskFilter;
  onFiltroChange?: (filtro: TaskFilter) => void;
}

/**
 * Componente principal para mostrar el contenido de tareas CRM
 * Utiliza hooks personalizados para gestionar la carga de datos y la interacción con el tablero
 */
const TareasContent = React.memo(({ 
  onEditTask, 
  filtros, 
  onToggleFiltros,
  mostrarFiltros = false,
  onFiltroChange
}: TareasContentProps) => {
  const hasMounted = useHasMounted();
  const { toast } = useToast();
  
  // Estados para vista y filtros
  const [vista, setVista] = useState<TipoVista>('lista');
  const [filtroTemporalActivo, setFiltroTemporalActivo] = useState<'todos' | 'hoy' | 'semana' | 'mes' | null>('todos');
  const [busquedaLocal, setBusquedaLocal] = useState('');
  const [timeoutBusqueda, setTimeoutBusqueda] = useState<NodeJS.Timeout | null>(null);
  
  // Estados para paginación
  const [paginaActual, setPaginaActual] = useState(1);
  const [elementosPorPagina, setElementosPorPagina] = useState(10);
  const [ordenarPor, setOrdenarPor] = useState<{campo: keyof Task, direccion: 'asc' | 'desc'}>({
    campo: 'created_at',
    direccion: 'desc'
  });
  
  // Estados para modales
  const [mostrarModalDetalles, setMostrarModalDetalles] = useState(false);
  const [mostrarDialogoCancelacion, setMostrarDialogoCancelacion] = useState(false);
  const [tareaSeleccionada, setTareaSeleccionada] = useState<Task | null>(null);
  
  // Estados para subtareas
  const [modoVista, setModoVista] = useState<TaskViewMode>('list');
  const [mostrarFormularioSubtarea, setMostrarFormularioSubtarea] = useState(false);
  const [tareaPadreSeleccionada, setTareaPadreSeleccionada] = useState<Task | null>(null);
  const [usuarios, setUsuarios] = useState<Array<{ id: string; first_name: string; last_name: string; }>>([]);
  
  // Función para cambiar vista
  const cambiarVista = useCallback((nuevaVista: TipoVista) => {
    setVista(nuevaVista);
  }, []);
  
  // Función para cambiar ordenamiento
  const cambiarOrdenamiento = useCallback((campo: keyof Task) => {
    setOrdenarPor(prev => {
      const nuevaDireccion = prev.campo === campo && prev.direccion === 'asc' ? 'desc' : 'asc';
      console.log('🔄 Cambiando ordenamiento:', { campo, direccion: nuevaDireccion });
      
      return {
        campo,
        direccion: nuevaDireccion
      };
    });
  }, []);
  
  // Función para aplicar ordenamiento a las tareas
  const aplicarOrdenamiento = useCallback((tareas: Task[]): Task[] => {
    if (!tareas.length) return tareas;
    
    return [...tareas].sort((a, b) => {
      const valorA = a[ordenarPor.campo];
      const valorB = b[ordenarPor.campo];
      
      // Manejar valores nulos o undefined
      if (valorA == null && valorB == null) return 0;
      if (valorA == null) return ordenarPor.direccion === 'asc' ? 1 : -1;
      if (valorB == null) return ordenarPor.direccion === 'asc' ? -1 : 1;
      
      // Comparación para fechas
      if (ordenarPor.campo === 'due_date' || ordenarPor.campo === 'created_at') {
        const fechaA = new Date(valorA as string).getTime();
        const fechaB = new Date(valorB as string).getTime();
        return ordenarPor.direccion === 'asc' ? fechaA - fechaB : fechaB - fechaA;
      }
      
      // Comparación para strings
      if (typeof valorA === 'string' && typeof valorB === 'string') {
        const comparacion = valorA.localeCompare(valorB, 'es', { sensitivity: 'base' });
        return ordenarPor.direccion === 'asc' ? comparacion : -comparacion;
      }
      
      // Comparación para números y otros tipos
      if (valorA < valorB) return ordenarPor.direccion === 'asc' ? -1 : 1;
      if (valorA > valorB) return ordenarPor.direccion === 'asc' ? 1 : -1;
      return 0;
    });
  }, [ordenarPor]);
  
  // Función para obtener filtros combinados
  const obtenerFiltrosCombinados = useCallback(() => {
    const filtrosLimpios = filtros || {};
    const filtrosCombinados: TaskFilter = { ...filtrosLimpios };
    
    // Aplicar filtros locales
    if (busquedaLocal) {
      filtrosCombinados.texto = busquedaLocal;
    }
    
    // Aplicar filtro temporal si está activo
    if (filtroTemporalActivo && filtroTemporalActivo !== 'todos') {
      filtrosCombinados.timeframe = filtroTemporalActivo;
    }
    
    return filtrosCombinados;
  }, [filtros, busquedaLocal, filtroTemporalActivo]);
  
  // Hook para cargar datos
  const {
    cargarTareasFiltradas,
    cargarTodasLasTareas,
    cargando,
    tareasProcesadas
  } = useTareasDataLoader();
  
  // Hook para subtareas
  const {
    createNewSubtask,
    loadTasksWithSubtasks,
    updateSubtaskStatus,
    validateDeletion,
    checkParentAutoCompletion,
    getStats,
    loading: subtasksLoading,
    creating: creatingSubtask
  } = useSubtasks();
  
  // Mapa vacío para compatibilidad (se puede implementar más tarde)
  const mapaClientesOportunidades = useMemo(() => new Map(), []);
  
  // Hook para el tablero
  const {
    tareasTablero,
    actualizarTablero,
    manejarCambioEstado
  } = useTareasTablero();
  
  // Ref para evitar bucle infinito con tareasProcesadas
  const tareasProcesadasRef = useRef<Task[]>([]);
  const actualizandoTableroRef = useRef<boolean>(false);

  // Efecto para actualizar el tablero cuando cambien las tareas procesadas
  useEffect(() => {
    console.log('🔄 useEffect tablero - tareasProcesadas.length:', tareasProcesadas?.length || 0);
    
    if (!actualizandoTableroRef.current && 
        tareasProcesadas && 
        JSON.stringify(tareasProcesadas) !== JSON.stringify(tareasProcesadasRef.current)) {
      
      console.log('✅ ACTUALIZANDO TABLERO con', tareasProcesadas.length, 'tareas');
      actualizandoTableroRef.current = true;
      tareasProcesadasRef.current = tareasProcesadas;
      
      console.log('📋 Actualizando tablero con tareas procesadas:', tareasProcesadas.length);
      actualizarTablero(tareasProcesadas);
      
      // Resetear flag después de un breve delay
      setTimeout(() => {
        actualizandoTableroRef.current = false;
      }, 100);
    }
  }, [tareasProcesadas, actualizarTablero]);
  
  // Función para actualizar una tarea
  const actualizarTarea = useCallback(async (id: string, cambios: Partial<Task>) => {
    try {
      const tareaActualizada = await updateTask(id, cambios);
      // Recargar tareas después de actualizar
      await cargarTodasLasTareas();
      return tareaActualizada;
    } catch (error) {
      console.error('Error al actualizar tarea:', error);
      throw error;
    }
  }, [cargarTodasLasTareas]);
  
  // Obtener tareas paginadas y ordenadas
  const obtenerTareasPaginadas = useCallback(() => {
    const todasLasTareas = Object.values(tareasTablero).flat();
    
    // Aplicar ordenamiento
    const tareasOrdenadas = aplicarOrdenamiento(todasLasTareas);
    
    // Aplicar paginación
    const inicio = (paginaActual - 1) * elementosPorPagina;
    const fin = inicio + elementosPorPagina;
    
    return tareasOrdenadas.slice(inicio, fin);
  }, [tareasTablero, paginaActual, elementosPorPagina, aplicarOrdenamiento]);
  
  // Funciones para modales
  const abrirModalDetalles = useCallback((tarea: Task) => {
    setTareaSeleccionada(tarea);
    setMostrarModalDetalles(true);
  }, []);
  
  const cerrarModalDetalles = useCallback(() => {
    setMostrarModalDetalles(false);
    setTareaSeleccionada(null);
  }, []);
  
  const abrirDialogoCancelacion = useCallback((tarea: Task) => {
    setTareaSeleccionada(tarea);
    setMostrarDialogoCancelacion(true);
  }, []);
  
  const cerrarDialogoCancelacion = useCallback(() => {
    setMostrarDialogoCancelacion(false);
    setTareaSeleccionada(null);
  }, []);
  
  // Funciones para subtareas
  const abrirFormularioSubtarea = useCallback((tareaPadre: Task) => {
    setTareaPadreSeleccionada(tareaPadre);
    setMostrarFormularioSubtarea(true);
  }, []);
  
  const cerrarFormularioSubtarea = useCallback(() => {
    setMostrarFormularioSubtarea(false);
    setTareaPadreSeleccionada(null);
  }, []);
  
  const manejarCreacionSubtarea = useCallback(async (subtaskData: Omit<NewTask, 'parent_task_id'>) => {
    if (!tareaPadreSeleccionada) return;
    
    try {
      await createNewSubtask(tareaPadreSeleccionada.id, subtaskData);
      toast({
        title: "Subtarea creada",
        description: "La subtarea ha sido creada exitosamente",
      });
      cerrarFormularioSubtarea();
      // Recargar datos para mostrar la nueva subtarea
      cargarTodasLasTareas();
    } catch (error) {
      toast({
        title: "Error",
        description: "No se pudo crear la subtarea",
        variant: "destructive"
      });
    }
  }, [tareaPadreSeleccionada, createNewSubtask, toast, cerrarFormularioSubtarea, cargarTodasLasTareas]);
  
  const cambiarModoVista = useCallback((nuevoModo: TaskViewMode) => {
    setModoVista(nuevoModo);
    try {
      localStorage.setItem('modoVistaTareas', nuevoModo);
    } catch (error) {
      // Ignorar errores de localStorage
    }
  }, []);
  
  // Función para cargar usuarios
  const cargarUsuarios = useCallback(async () => {
    try {
      const usuariosData = await getAssignableUsers();
      // Transformar los datos al formato esperado por SubtaskForm
      const usuariosTransformados = (usuariosData || []).map(usuario => ({
        id: usuario.id,
        first_name: usuario.full_name?.split(' ')[0] || usuario.nombre || 'Usuario',
        last_name: usuario.full_name?.split(' ').slice(1).join(' ') || ''
      }));
      setUsuarios(usuariosTransformados);
    } catch (error) {
      console.error('Error al cargar usuarios:', error);
      setUsuarios([]);
    }
  }, []);
  
  // Función para organizar tareas en estructura jerárquica
  const organizarTareasJerarquicamente = useCallback((tareas: Task[]): Task[] => {
    // Crear un mapa de tareas por ID para acceso rápido
    const tareasMap = new Map<string, Task>();
    const tareasConSubtareas = tareas.map(tarea => ({ ...tarea, subtasks: [] }));
    
    // Llenar el mapa
    tareasConSubtareas.forEach(tarea => {
      tareasMap.set(tarea.id, tarea);
    });
    
    // Organizar subtareas bajo sus padres
    const tareasRaiz: Task[] = [];
    
    tareasConSubtareas.forEach(tarea => {
      if (tarea.parent_task_id) {
        // Es una subtarea, agregarla a su padre
        const padre = tareasMap.get(tarea.parent_task_id);
        if (padre) {
          if (!padre.subtasks) padre.subtasks = [];
          padre.subtasks.push(tarea);
          
          // Calcular estadísticas del padre
          const subtareas = padre.subtasks;
          const completadas = subtareas.filter(st => st.status === 'done').length;
          padre.subtask_count = subtareas.length;
          padre.completed_subtasks = completadas;
          padre.progress = subtareas.length > 0 ? (completadas / subtareas.length) * 100 : 0;
        }
      } else {
        // Es una tarea raíz
        tareasRaiz.push(tarea);
      }
    });
    
    return tareasRaiz;
  }, []);
  
  // Función para manejar la creación de subtareas
  const handleSubtaskSave = useCallback(async (subtaskData: Omit<NewTask, 'parent_task_id'>) => {
    if (!tareaPadreSeleccionada) return;
    
    try {
      // Crear la subtarea usando el hook useSubtasks
      await createNewSubtask(tareaPadreSeleccionada.id, subtaskData);
      
      // Cerrar el formulario
      setMostrarFormularioSubtarea(false);
      setTareaPadreSeleccionada(null);
      
      toast({
        title: "Subtarea creada",
        description: "La subtarea se ha creado exitosamente."
      });
      
      // Recargar los datos para mostrar la nueva subtarea
      await cargarTareasFiltradas(obtenerFiltrosCombinados());
    } catch (error) {
      console.error('Error al crear subtarea:', error);
      toast({
        title: "Error",
        description: "No se pudo crear la subtarea. Inténtalo de nuevo.",
        variant: "destructive"
      });
    }
  }, [tareaPadreSeleccionada, createNewSubtask, toast, cargarTareasFiltradas, obtenerFiltrosCombinados]);
  
  const confirmarCancelacion = useCallback(async () => {
    if (!tareaSeleccionada) return;
    
    try {
      await actualizarTarea(tareaSeleccionada.id, { status: 'canceled' });
      toast({
        title: "Tarea cancelada",
        description: "La tarea ha sido cancelada exitosamente",
      });
      cerrarDialogoCancelacion();
    } catch (error) {
      toast({
        title: "Error",
        description: "No se pudo cancelar la tarea",
        variant: "destructive",
      });
    }
  }, [tareaSeleccionada, actualizarTarea, toast, cerrarDialogoCancelacion]);
  

  

  

  
  // Efecto para cargar datos iniciales
  useEffect(() => {
    const cargarDatos = async () => {
      try {
        await cargarTodasLasTareas();
      } catch (error) {
        console.error('Error al cargar tareas:', error);
      }
    };
    
    cargarDatos();
  }, [cargarTodasLasTareas]);
  
  // Ref para evitar bucles infinitos con filtros externos
  const filtrosExternosRef = useRef<TaskFilter>({});
  const aplicandoFiltrosRef = useRef<boolean>(false);

  // Efecto para aplicar filtros externos sin bucles infinitos
  useEffect(() => {
    console.log('🔵 === DIAGNÓSTICO useEffect FILTROS EXTERNOS ===');
    console.log('- filtros:', filtros);
    console.log('- aplicandoFiltrosRef.current:', aplicandoFiltrosRef.current);
    console.log('- filtrosExternosRef.current:', filtrosExternosRef.current);
    console.log('- JSON comparison:', JSON.stringify(filtros) !== JSON.stringify(filtrosExternosRef.current));
    
    if (!aplicandoFiltrosRef.current && 
        filtros && 
        JSON.stringify(filtros) !== JSON.stringify(filtrosExternosRef.current)) {
      
      console.log('✅ CONDICIONES CUMPLIDAS - Aplicando filtros externos');
      aplicandoFiltrosRef.current = true;
      filtrosExternosRef.current = filtros;
      
      console.log('🔍 Aplicando filtros externos:', filtros);
      
      // Si hay filtros, aplicarlos
      if (Object.keys(filtros).length > 0) {
        console.log('🟢 LLAMANDO cargarTareasFiltradas con:', filtros);
        cargarTareasFiltradas(filtros);
      } else {
        console.log('🟡 LLAMANDO cargarTodasLasTareas (sin filtros)');
        // Si no hay filtros, cargar todas las tareas
        cargarTodasLasTareas();
      }
      
      // Resetear flag después de un breve delay
      setTimeout(() => {
        console.log('🔄 Reseteando flag aplicandoFiltrosRef');
        aplicandoFiltrosRef.current = false;
      }, 200);
    } else {
      console.log('❌ CONDICIONES NO CUMPLIDAS - No se aplicarán filtros');
    }
  }, [filtros, cargarTareasFiltradas, cargarTodasLasTareas]);
  
  // Efecto para limpiar timeout
  useEffect(() => {
    return () => {
      if (timeoutBusqueda) {
        clearTimeout(timeoutBusqueda);
      }
    };
  }, [timeoutBusqueda]);
  
  // Efecto para inicializar vista desde localStorage
  useEffect(() => {
    try {
      const vistaGuardada = localStorage.getItem('vistaTareas') as TipoVista;
      if (vistaGuardada && (vistaGuardada === 'lista' || vistaGuardada === 'tablero')) {
        setVista(vistaGuardada);
      }
      
      // Inicializar modo de vista jerárquica
      const modoVistaGuardado = localStorage.getItem('modoVistaTareas') as TaskViewMode;
      if (modoVistaGuardado && (modoVistaGuardado === 'list' || modoVistaGuardado === 'hierarchy' || modoVistaGuardado === 'kanban')) {
        setModoVista(modoVistaGuardado);
      }
    } catch (error) {
      // Ignorar errores de localStorage
    }
  }, []);
  
  // Efecto para cargar usuarios
  useEffect(() => {
    cargarUsuarios();
  }, [cargarUsuarios]);
  
  if (!hasMounted) {
    return null;
  }
  
  return (
    <div className="space-y-4">
      {cargando ? (
        <div className="flex justify-center items-center p-8">
          <Loader2 className="animate-spin h-8 w-8" />
        </div>
      ) : (
        <Tabs 
          value={vista} 
          onValueChange={(v) => {
            cambiarVista(v as TipoVista);
            try {
              localStorage.setItem('vistaTareas', v);
            } catch (error) {
              // Ignorar errores de localStorage
            }
          }}
          className="w-full"
        >
          <TareasHeader 
            vista={vista}
            modoVista={modoVista}
            filtroTemporalActivo={filtroTemporalActivo}
            busquedaLocal={busquedaLocal}
            timeoutBusqueda={timeoutBusqueda}
            onCambiarVista={cambiarVista}
            onCambiarModoVista={cambiarModoVista}
            onFiltroTiempo={(filtro) => {
              console.log('🕐 Filtro temporal recibido en TareasContent:', filtro);
              const nuevoFiltroActivo = filtro.timeframe || 'todos';
              setFiltroTemporalActivo(nuevoFiltroActivo as 'todos' | 'hoy' | 'semana' | 'mes' | null);
              
              // Forzar recarga de datos con el nuevo filtro
              const filtrosCombinados = {
                ...filtros,
                ...filtro
              };
              
              console.log('🔄 Aplicando filtros combinados:', filtrosCombinados);
              cargarTareasFiltradas(filtrosCombinados);
              
              // También notificar al componente padre si tiene callback
              if (onFiltroChange) {
                onFiltroChange(filtro);
              }
            }}
            onToggleFiltros={onToggleFiltros || (() => {})}
            onBusquedaChange={setBusquedaLocal}
            setTimeoutBusqueda={setTimeoutBusqueda}
            onFiltroChange={onFiltroChange}
          />
          
          {/* Vista de Lista */}
          <TabsContent value="lista" className="mt-0">
            {modoVista === 'hierarchy' ? (
              /* Vista Jerárquica */
              <TaskHierarchyList
                tasks={organizarTareasJerarquicamente(Object.values(tareasTablero).flat())}
                onCreateSubtask={(parentId: string) => {
                  // Encontrar la tarea padre por ID
                  const tareaPadre = Object.values(tareasTablero).flat().find(t => t.id === parentId);
                  if (tareaPadre) {
                    abrirFormularioSubtarea(tareaPadre);
                  }
                }}
                onTaskUpdate={(task) => {
                  // Manejar actualización de tarea
                  if (onEditTask) {
                    onEditTask(task);
                  }
                }}
                onTaskClick={abrirModalDetalles}
                onEditTask={onEditTask}
                onCompleteTask={(task) => {
                  // Completar tarea
                  manejarCambioEstado(task.id, 'done', task.status as TaskStatusUI);
                }}
                onCancelTask={(task) => {
                  // Abrir diálogo de cancelación
                  setTareaSeleccionada(task);
                  setMostrarDialogoCancelacion(true);
                }}
                expandByDefault={false}
              />
            ) : (
              /* Vista Plana (Lista tradicional) */
              <>
                <TareasTable
                  tareas={obtenerTareasPaginadas()}
                  onEditTask={onEditTask}
                  onViewDetails={abrirModalDetalles}
                  onCancelTask={abrirDialogoCancelacion}
                  onSort={cambiarOrdenamiento}
                  ordenarPor={ordenarPor}
                />
                
                {/* Paginación */}
                <TareasPagination
                  totalTareas={Object.values(tareasTablero).flat().length}
                  paginaActual={paginaActual}
                  elementosPorPagina={elementosPorPagina}
                  onPaginaChange={setPaginaActual}
                  onElementosPorPaginaChange={setElementosPorPagina}
                />
              </>
            )}
          </TabsContent>

          {/* Vista de Tablero Kanban */}
          <TabsContent value="tablero" className="mt-0">
            <div className="w-full overflow-auto">
              <TableroKanban
                tareas={tareasTablero}
                onStatusChange={(tareaId: string, nuevoEstado: TaskStatusUI, estadoAnterior: TaskStatusUI) => {
                  // Ahora recibimos directamente el estado anterior desde TableroKanban
                  console.log('TareasContent - onStatusChange:', { tareaId, nuevoEstado, estadoAnterior });
                  manejarCambioEstado(tareaId, nuevoEstado, estadoAnterior);
                }}
                onTaskEdit={onEditTask}
                onViewDetails={abrirModalDetalles}
              />
            </div>
          </TabsContent>
        </Tabs>
      )}
      
      {/* Modal de detalles */}
      <DetallesTareaModal
        tarea={mostrarModalDetalles ? tareaSeleccionada : null}
        abierto={mostrarModalDetalles}
        onClose={cerrarModalDetalles}
      />
      
      {/* Diálogo de cancelación */}
      <DialogoCancelacionTarea
        abierto={mostrarDialogoCancelacion}
        onConfirmar={confirmarCancelacion}
        onClose={cerrarDialogoCancelacion}
      />
      
      {/* Formulario de subtareas */}
      {mostrarFormularioSubtarea && tareaPadreSeleccionada && (
        <SubtaskForm
          open={mostrarFormularioSubtarea}
          onClose={() => setMostrarFormularioSubtarea(false)}
          parentTask={tareaPadreSeleccionada}
          onSave={handleSubtaskSave}
          usuarios={usuarios}
        />
      )}
    </div>
  );
});

export default TareasContent;
