'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Search,
  ClipboardList,
  LayoutGrid,
  List,
  Calendar,
  Sparkles,
  ArrowLeft,
  Clock,
  CheckCircle,
  AlertTriangle,
  TrendingUp,
  RefreshCw,
  Plus,
} from 'lucide-react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import Link from 'next/link';
import { useSearchParams, useRouter } from 'next/navigation';
import { pmService, type PMTask, type TaskTimeEntry, PRIORITY_LABELS, TASK_TYPE_LABELS } from '@/lib/services/pmService';
import { supabase } from '@/lib/supabase/config';
import { getOrganizationId } from '@/lib/hooks/useOrganization';
import { getAssignableUsers } from '@/lib/services/userService';
import { KanbanBoard } from '@/components/pm/views/KanbanBoard';
import { CalendarView } from '@/components/pm/views/CalendarView';
import { TaskListView } from '@/components/pm/views/TaskListView';
import { AITaskPlanner } from '@/components/pm/ai/AITaskPlanner';
import TaskCreationPanel from '@/components/pm/TaskCreationPanel';
import { DataTablePagination } from '@/components/ui/DataTablePagination';

// Devuelve true si la tarea entra en el filtro de fecha de vencimiento
function matchesDueFilter(task: PMTask, filter: string, customFrom: string, customTo: string): boolean {
  if (filter === 'all') return true;
  if (!task.due_date) return false;
  const startOfDay = (d: Date) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };
  const today = startOfDay(new Date());
  const due = startOfDay(new Date(task.due_date));
  const dayMs = 86400000;
  const diffDays = Math.round((due.getTime() - today.getTime()) / dayMs);
  const isClosed = task.status === 'done' || task.status === 'canceled';
  switch (filter) {
    case 'overdue': return diffDays < 0 && !isClosed;
    case 'today': return diffDays === 0;
    case 'tomorrow': return diffDays === 1;
    case '7d': return diffDays >= 0 && diffDays <= 7;
    case '15d': return diffDays >= 0 && diffDays <= 15;
    case '30d': return diffDays >= 0 && diffDays <= 30;
    case 'custom': {
      const from = customFrom ? startOfDay(new Date(customFrom)) : null;
      const to = customTo ? startOfDay(new Date(customTo)) : null;
      if (from && due < from) return false;
      if (to && due > to) return false;
      return true;
    }
    default: return true;
  }
}

type ViewTab = 'list' | 'kanban' | 'calendar' | 'ai';

const TABS: { id: ViewTab; label: string; icon: React.ReactNode }[] = [
  { id: 'list', label: 'Lista', icon: <List className="h-4 w-4" /> },
  { id: 'kanban', label: 'Kanban', icon: <LayoutGrid className="h-4 w-4" /> },
  { id: 'calendar', label: 'Calendario', icon: <Calendar className="h-4 w-4" /> },
  { id: 'ai', label: 'IA Planner', icon: <Sparkles className="h-4 w-4" /> },
];

export default function PMTasksPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const initialView = (searchParams.get('view') as ViewTab) || 'list';

  const [activeTab, setActiveTab] = useState<ViewTab>(initialView);
  const [tasks, setTasks] = useState<PMTask[]>([]);
  const [projects, setProjects] = useState<Array<{id: string, name: string}>>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [projectFilter, setProjectFilter] = useState<string>('all');
  const [priorityFilter, setPriorityFilter] = useState<string>('all');
  const [assigneeFilter, setAssigneeFilter] = useState<string>('all');
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [moduleFilter, setModuleFilter] = useState<string>('all');
  const [dueFilter, setDueFilter] = useState<string>('all');
  const [customFrom, setCustomFrom] = useState<string>('');
  const [customTo, setCustomTo] = useState<string>('');
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [showCreatePanel, setShowCreatePanel] = useState(false);
  const [editTask, setEditTask] = useState<PMTask | null>(null);
  const [users, setUsers] = useState<Array<{id: string, nombre: string}>>([]);
  const [runningTimers, setRunningTimers] = useState<Record<string, TaskTimeEntry>>({});

  const openCreate = () => { setEditTask(null); setShowCreatePanel(true); };
  const openEdit = (t: PMTask) => { setEditTask(t); setShowCreatePanel(true); };
  const closePanel = () => { setShowCreatePanel(false); setEditTask(null); };

  // Abrir una subtarea en el editor completo (reutiliza el panel con todas sus funciones)
  const openSubtask = async (subtaskId: string) => {
    const sub = await pmService.getTaskById(subtaskId);
    if (sub) setEditTask(sub);
  };

  // Abrir la tarea padre desde una subtarea en el editor completo
  const openParentTask = async (parentTaskId: string) => {
    const parent = await pmService.getTaskById(parentTaskId);
    if (parent) setEditTask(parent);
  };

  const loadTasks = useCallback(async () => {
    setLoading(true);
    try {
      const data = await pmService.getTasks({
        status: statusFilter,
        projectId: projectFilter,
        type: typeFilter,
        module: moduleFilter,
      });
      setTasks(data);
    } catch (error) {
      console.error('Error cargando tareas PM:', error);
    } finally {
      setLoading(false);
    }
  }, [statusFilter, projectFilter, typeFilter, moduleFilter]);

  // Recarga en segundo plano sin mostrar el skeleton (para acciones fluidas como Kanban)
  const loadTasksSilent = useCallback(async () => {
    try {
      const data = await pmService.getTasks({ status: statusFilter, projectId: projectFilter, type: typeFilter, module: moduleFilter });
      setTasks(data);
    } catch (error) {
      console.error('Error recargando tareas PM:', error);
    }
  }, [statusFilter, projectFilter, typeFilter, moduleFilter]);

  useEffect(() => { loadTasks(); }, [loadTasks]);

  // Cargar en lote las sesiones de cronómetro activas para las tareas visibles (evita 1 consulta por tarjeta)
  useEffect(() => {
    const ids = tasks.map(t => t.id);
    if (ids.length === 0) { setRunningTimers({}); return; }
    pmService.getRunningTimeEntriesForTasks(ids).then(setRunningTimers).catch(() => setRunningTimers({}));
  }, [tasks]);

  useEffect(() => {
    const loadProjects = async () => {
      const orgId = getOrganizationId();
      if (!orgId) return;
      const { data } = await supabase.from('projects').select('id, name').eq('organization_id', orgId).order('name');
      setProjects(data || []);
    };
    loadProjects();
    getAssignableUsers().then(setUsers);
  }, []);

  const handleTabChange = (tab: ViewTab) => {
    setActiveTab(tab);
    router.replace(`/app/pm/tareas?view=${tab}`, { scroll: false });
  };

  const filtered = useMemo(() => tasks.filter(t => {
    const matchesSearch = t.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (t.description || '').toLowerCase().includes(searchTerm.toLowerCase());
    const matchesPriority = priorityFilter === 'all' || t.priority === priorityFilter;
    const matchesAssignee = assigneeFilter === 'all'
      || (assigneeFilter === 'unassigned' ? !t.assigned_to : t.assigned_to === assigneeFilter);
    const matchesDue = matchesDueFilter(t, dueFilter, customFrom, customTo);
    return matchesSearch && matchesPriority && matchesAssignee && matchesDue;
  }), [tasks, searchTerm, priorityFilter, assigneeFilter, dueFilter, customFrom, customTo]);

  // Reiniciar a la primera página cuando cambian filtros/búsqueda
  useEffect(() => { setCurrentPage(1); }, [searchTerm, statusFilter, projectFilter, priorityFilter, assigneeFilter, typeFilter, moduleFilter, dueFilter, customFrom, customTo, activeTab]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const paged = useMemo(() => filtered.slice((currentPage - 1) * pageSize, currentPage * pageSize), [filtered, currentPage, pageSize]);

  const stats = {
    total: tasks.length,
    open: tasks.filter(t => t.status === 'open').length,
    inProgress: tasks.filter(t => t.status === 'in_progress').length,
    done: tasks.filter(t => t.status === 'done').length,
    overdue: tasks.filter(t => t.due_date && new Date(t.due_date) < new Date() && t.status !== 'done' && t.status !== 'canceled').length,
  };

  return (
    <div className="flex h-full overflow-hidden">
      {/* Contenido principal */}
      <div className="flex-1 overflow-y-auto p-3 sm:p-4 md:p-6 space-y-4 sm:space-y-6 bg-gray-50 dark:bg-gray-900">
        {/* Header */}
        <div className="flex flex-col gap-4">
          <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
            <Link href="/app/pm" className="hover:text-blue-600 flex items-center gap-1"><ArrowLeft className="h-4 w-4" />PM</Link>
            <span>/</span>
            <span className="text-gray-900 dark:text-white font-medium">Tareas</span>
          </div>
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-blue-100 dark:bg-blue-900/30 rounded-lg">
                <ClipboardList className="h-6 w-6 text-blue-600 dark:text-blue-400" />
              </div>
              <div>
                <h1 className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-white">Tareas</h1>
                <p className="text-xs sm:text-sm text-gray-500 dark:text-gray-400">Gestiona todas las tareas de la organización</p>
              </div>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={loadTasks} className="gap-1">
                <RefreshCw className="h-4 w-4" />Actualizar
              </Button>
              <Button size="sm" onClick={openCreate} className="gap-1 bg-blue-600 hover:bg-blue-700 text-white">
                <Plus className="h-4 w-4" />Nueva Tarea
              </Button>
            </div>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
          {[
            { label: 'Total', value: stats.total, icon: <ClipboardList className="h-4 w-4" />, color: 'text-blue-600', bg: 'bg-blue-50 dark:bg-blue-950/20' },
            { label: 'Pendientes', value: stats.open, icon: <Clock className="h-4 w-4" />, color: 'text-gray-600', bg: 'bg-gray-50 dark:bg-gray-800' },
            { label: 'En Progreso', value: stats.inProgress, icon: <TrendingUp className="h-4 w-4" />, color: 'text-yellow-600', bg: 'bg-yellow-50 dark:bg-yellow-950/20' },
            { label: 'Completadas', value: stats.done, icon: <CheckCircle className="h-4 w-4" />, color: 'text-green-600', bg: 'bg-green-50 dark:bg-green-950/20' },
            { label: 'Vencidas', value: stats.overdue, icon: <AlertTriangle className="h-4 w-4" />, color: 'text-red-600', bg: 'bg-red-50 dark:bg-red-950/20' },
          ].map(s => (
            <Card key={s.label} className={`${s.bg} border-0`}>
              <CardContent className="p-3">
                <div className="flex items-center gap-1.5 mb-1">
                  <span className={s.color}>{s.icon}</span>
                  <span className="text-xs font-medium text-gray-500">{s.label}</span>
                </div>
                <p className={`text-xl font-bold ${s.color}`}>{s.value}</p>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Tabs */}
        <div className="flex items-center gap-1 p-1 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 w-fit">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => handleTabChange(tab.id)}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-md text-sm font-medium transition-all ${
                activeTab === tab.id
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700'
              }`}
            >
              {tab.icon}
              <span className="hidden sm:inline">{tab.label}</span>
            </button>
          ))}
        </div>

        {/* Filters (except for AI tab) */}
        {activeTab !== 'ai' && (
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <Input placeholder="Buscar tareas..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="pl-9 bg-white dark:bg-gray-800" />
            </div>
            <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v); }}>
              <SelectTrigger className="w-[160px] bg-white dark:bg-gray-800"><SelectValue placeholder="Estado" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                <SelectItem value="open">Pendiente</SelectItem>
                <SelectItem value="in_progress">En Progreso</SelectItem>
                <SelectItem value="done">Completada</SelectItem>
                <SelectItem value="canceled">Cancelada</SelectItem>
              </SelectContent>
            </Select>
            <Select value={projectFilter} onValueChange={(v) => { setProjectFilter(v); }}>
              <SelectTrigger className="w-[200px] bg-white dark:bg-gray-800"><SelectValue placeholder="Proyecto" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos los proyectos</SelectItem>
                {projects.map((p) => (<SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>))}
              </SelectContent>
            </Select>
            <Select value={dueFilter} onValueChange={setDueFilter}>
              <SelectTrigger className="w-[170px] bg-white dark:bg-gray-800"><SelectValue placeholder="Vencimiento" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Toda fecha</SelectItem>
                <SelectItem value="overdue">Vencidas</SelectItem>
                <SelectItem value="today">Vencen hoy</SelectItem>
                <SelectItem value="tomorrow">Vencen mañana</SelectItem>
                <SelectItem value="7d">En 7 días</SelectItem>
                <SelectItem value="15d">En 15 días</SelectItem>
                <SelectItem value="30d">En 30 días</SelectItem>
                <SelectItem value="custom">Personalizado</SelectItem>
              </SelectContent>
            </Select>
            <Select value={priorityFilter} onValueChange={setPriorityFilter}>
              <SelectTrigger className="w-[150px] bg-white dark:bg-gray-800"><SelectValue placeholder="Prioridad" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Toda prioridad</SelectItem>
                {Object.entries(PRIORITY_LABELS).map(([k, v]) => (<SelectItem key={k} value={k}>{v}</SelectItem>))}
              </SelectContent>
            </Select>
            <Select value={assigneeFilter} onValueChange={setAssigneeFilter}>
              <SelectTrigger className="w-[170px] bg-white dark:bg-gray-800"><SelectValue placeholder="Asignado" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos los asignados</SelectItem>
                <SelectItem value="unassigned">Sin asignar</SelectItem>
                {users.map((u) => (<SelectItem key={u.id} value={u.id}>{u.nombre}</SelectItem>))}
              </SelectContent>
            </Select>
            <Select value={moduleFilter} onValueChange={setModuleFilter}>
              <SelectTrigger className="w-[150px] bg-white dark:bg-gray-800"><SelectValue placeholder="Módulo" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos los módulos</SelectItem>
                <SelectItem value="crm">CRM</SelectItem>
                <SelectItem value="projects">Proyectos</SelectItem>
                <SelectItem value="general">General</SelectItem>
              </SelectContent>
            </Select>
            <Select value={typeFilter} onValueChange={setTypeFilter}>
              <SelectTrigger className="w-[160px] bg-white dark:bg-gray-800"><SelectValue placeholder="Tipo" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos los tipos</SelectItem>
                {Object.entries(TASK_TYPE_LABELS).map(([k, v]) => (<SelectItem key={k} value={k}>{v}</SelectItem>))}
              </SelectContent>
            </Select>
          </div>
        )}
        {activeTab !== 'ai' && dueFilter === 'custom' && (
          <div className="flex flex-col sm:flex-row gap-3 items-center">
            <span className="text-sm text-gray-500 dark:text-gray-400">Rango:</span>
            <Input type="date" value={customFrom} onChange={(e) => setCustomFrom(e.target.value)} className="w-[170px] bg-white dark:bg-gray-800" />
            <span className="text-sm text-gray-400">a</span>
            <Input type="date" value={customTo} onChange={(e) => setCustomTo(e.target.value)} className="w-[170px] bg-white dark:bg-gray-800" />
          </div>
        )}

        {/* Content */}
        {loading && activeTab !== 'ai' ? (
          <div className="space-y-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <Card key={i}><CardContent className="p-4"><Skeleton className="h-4 w-3/4 mb-2" /><Skeleton className="h-3 w-1/2" /></CardContent></Card>
            ))}
          </div>
        ) : (
          <>
            {activeTab === 'list' && (
              <>
                <TaskListView tasks={paged} onTaskClick={openEdit} onTaskUpdate={loadTasks} users={users} projects={projects} runningTimers={runningTimers} />
                <DataTablePagination
                  currentPage={currentPage}
                  totalPages={totalPages}
                  pageSize={pageSize}
                  totalItems={filtered.length}
                  onPageChange={setCurrentPage}
                  onPageSizeChange={(s) => { setPageSize(s); setCurrentPage(1); }}
                />
              </>
            )}

            {activeTab === 'kanban' && (
              <>
                <KanbanBoard tasks={paged} onTaskUpdate={loadTasksSilent} onTaskClick={openEdit} runningTimers={runningTimers} />
                <DataTablePagination
                  currentPage={currentPage}
                  totalPages={totalPages}
                  pageSize={pageSize}
                  totalItems={filtered.length}
                  onPageChange={setCurrentPage}
                  onPageSizeChange={(s) => { setPageSize(s); setCurrentPage(1); }}
                />
              </>
            )}

            {activeTab === 'calendar' && (
              <CalendarView tasks={filtered} onTaskClick={openEdit} />
            )}

            {activeTab === 'ai' && (
              <AITaskPlanner
                projectId={projectFilter !== 'all' ? projectFilter : undefined}
                onTasksCreated={loadTasks}
              />
            )}
          </>
        )}
      </div>

      {/* Panel lateral - empuja el contenido */}
      <TaskCreationPanel
        isOpen={showCreatePanel}
        onClose={closePanel}
        projects={projects}
        existingTasks={tasks.map(t => ({ id: t.id, title: t.title, status: t.status }))}
        users={users}
        editTask={editTask}
        onTaskCreated={loadTasks}
        onOpenSubtask={openSubtask}
        onOpenParent={openParentTask}
      />
    </div>
  );
}
