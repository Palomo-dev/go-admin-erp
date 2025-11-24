'use client';

import React, { useState, useEffect } from 'react';
import { useToast } from '@/components/ui/use-toast';
import {
  HousekeepingHeader,
  HousekeepingStats,
  HousekeepingFilters,
  HousekeepingList,
  HousekeepingKanban,
  TaskDialog,
} from '@/components/pms/housekeeping';
import HousekeepingService, {
  type HousekeepingTask,
  type HousekeepingStats as Stats,
} from '@/lib/services/housekeepingService';
import SpacesService, { type Space } from '@/lib/services/spacesService';
import { useOrganization } from '@/lib/hooks/useOrganization';
import { Loader2 } from 'lucide-react';

export default function HousekeepingPage() {
  const { toast } = useToast();
  const { organization } = useOrganization();

  // Estado de datos
  const [tasks, setTasks] = useState<HousekeepingTask[]>([]);
  const [filteredTasks, setFilteredTasks] = useState<HousekeepingTask[]>([]);
  const [stats, setStats] = useState<Stats>({
    total: 0,
    pending: 0,
    in_progress: 0,
    done: 0,
    cancelled: 0,
  });
  const [spaces, setSpaces] = useState<Space[]>([]);
  const [users, setUsers] = useState<Array<{ id: string; email: string; name: string }>>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Estado de UI
  const [viewMode, setViewMode] = useState<'list' | 'kanban'>('kanban');
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(new Date());
  const [selectedStatus, setSelectedStatus] = useState('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [showTaskDialog, setShowTaskDialog] = useState(false);
  const [editingTask, setEditingTask] = useState<HousekeepingTask | null>(null);

  // Cargar datos iniciales
  useEffect(() => {
    if (organization?.id) {
      loadData();
    }
  }, [organization?.id, selectedDate]);

  const loadData = async () => {
    try {
      setIsLoading(true);

      // Cargar tareas
      const dateFilter = selectedDate
        ? selectedDate.toISOString().split('T')[0]
        : undefined;

      const [tasksData, statsData, spacesData, usersData] = await Promise.all([
        HousekeepingService.getTasks({ date: dateFilter }),
        HousekeepingService.getStats(dateFilter),
        SpacesService.getSpaces({ branchId: organization!.branch_id }),
        HousekeepingService.getAvailableUsers(organization!.id),
      ]);

      setTasks(tasksData);
      setFilteredTasks(tasksData);
      setStats(statsData);
      setSpaces(spacesData);
      setUsers(usersData);
    } catch (error) {
      console.error('Error cargando datos:', error);
      toast({
        title: 'Error',
        description: 'No se pudieron cargar las tareas de limpieza.',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  // Filtrar tareas
  useEffect(() => {
    let filtered = tasks;

    // Filtrar por estado
    if (selectedStatus !== 'all') {
      filtered = filtered.filter((task) => task.status === selectedStatus);
    }

    // Filtrar por búsqueda
    if (searchTerm) {
      filtered = filtered.filter((task) =>
        task.spaces?.label.toLowerCase().includes(searchTerm.toLowerCase())
      );
    }

    setFilteredTasks(filtered);
  }, [tasks, selectedStatus, searchTerm]);

  // Handlers
  const handleNewTask = () => {
    setEditingTask(null);
    setShowTaskDialog(true);
  };

  const handleEditTask = (task: HousekeepingTask) => {
    setEditingTask(task);
    setShowTaskDialog(true);
  };

  const handleSaveTask = async (data: {
    space_id: string;
    task_date: string;
    notes?: string;
    assigned_to?: string;
    status?: 'pending' | 'in_progress' | 'done' | 'cancelled';
  }) => {
    try {
      if (editingTask) {
        // Actualizar tarea existente
        await HousekeepingService.updateTask(editingTask.id, data);
        toast({
          title: 'Tarea actualizada',
          description: 'La tarea se actualizó correctamente.',
        });
      } else {
        // Crear nueva tarea
        await HousekeepingService.createTask(data);
        toast({
          title: 'Tarea creada',
          description: 'La tarea se creó correctamente.',
        });
      }

      await loadData();
    } catch (error) {
      console.error('Error guardando tarea:', error);
      toast({
        title: 'Error',
        description: 'No se pudo guardar la tarea.',
        variant: 'destructive',
      });
      throw error;
    }
  };

  const handleStatusChange = async (taskId: string, status: string) => {
    try {
      await HousekeepingService.updateTaskStatus(
        taskId,
        status as 'pending' | 'in_progress' | 'done' | 'cancelled'
      );

      toast({
        title: 'Estado actualizado',
        description: 'El estado de la tarea se actualizó correctamente.',
      });

      await loadData();
    } catch (error) {
      console.error('Error actualizando estado:', error);
      toast({
        title: 'Error',
        description: 'No se pudo actualizar el estado.',
        variant: 'destructive',
      });
    }
  };

  const handleDeleteTask = async (taskId: string) => {
    if (!confirm('¿Estás seguro de que deseas eliminar esta tarea?')) {
      return;
    }

    try {
      await HousekeepingService.deleteTask(taskId);

      toast({
        title: 'Tarea eliminada',
        description: 'La tarea se eliminó correctamente.',
      });

      await loadData();
    } catch (error) {
      console.error('Error eliminando tarea:', error);
      toast({
        title: 'Error',
        description: 'No se pudo eliminar la tarea.',
        variant: 'destructive',
      });
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-[calc(100vh-4rem)]">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin text-blue-600 mx-auto mb-4" />
          <p className="text-gray-600 dark:text-gray-400">Cargando tareas...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col bg-gray-50 dark:bg-gray-950">
      {/* Header */}
      <HousekeepingHeader
        viewMode={viewMode}
        onViewModeChange={setViewMode}
        onNewTask={handleNewTask}
      />

      {/* Main Content */}
      <div className="flex-1 overflow-y-auto p-6">
        {/* Stats */}
        <HousekeepingStats stats={stats} />

        {/* Filters */}
        <HousekeepingFilters
          selectedDate={selectedDate}
          onDateChange={setSelectedDate}
          selectedStatus={selectedStatus}
          onStatusChange={setSelectedStatus}
          searchTerm={searchTerm}
          onSearchChange={setSearchTerm}
        />

        {/* Tasks View */}
        {viewMode === 'list' ? (
          <HousekeepingList
            tasks={filteredTasks}
            onStatusChange={handleStatusChange}
            onEdit={handleEditTask}
            onDelete={handleDeleteTask}
          />
        ) : (
          <HousekeepingKanban
            tasks={filteredTasks}
            onStatusChange={handleStatusChange}
            onEdit={handleEditTask}
            onDelete={handleDeleteTask}
          />
        )}
      </div>

      {/* Task Dialog */}
      <TaskDialog
        open={showTaskDialog}
        onOpenChange={setShowTaskDialog}
        task={editingTask}
        spaces={spaces}
        users={users}
        onSave={handleSaveTask}
      />
    </div>
  );
}
