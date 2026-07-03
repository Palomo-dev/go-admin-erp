'use client';

import React, { useState, useEffect, useCallback } from 'react';
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
import { pmService, type PMTask } from '@/lib/services/pmService';
import { supabase } from '@/lib/supabase/config';
import { getOrganizationId } from '@/lib/hooks/useOrganization';
import { getAssignableUsers } from '@/lib/services/userService';
import { KanbanBoard } from '@/components/pm/views/KanbanBoard';
import { CalendarView } from '@/components/pm/views/CalendarView';
import { TaskListView } from '@/components/pm/views/TaskListView';
import { AITaskPlanner } from '@/components/pm/ai/AITaskPlanner';
import TaskCreationPanel from '@/components/pm/TaskCreationPanel';

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
  const [showCreatePanel, setShowCreatePanel] = useState(false);
  const [editTask, setEditTask] = useState<PMTask | null>(null);
  const [users, setUsers] = useState<Array<{id: string, nombre: string}>>([]);

  const openCreate = () => { setEditTask(null); setShowCreatePanel(true); };
  const openEdit = (t: PMTask) => { setEditTask(t); setShowCreatePanel(true); };
  const closePanel = () => { setShowCreatePanel(false); setEditTask(null); };

  const loadTasks = useCallback(async () => {
    setLoading(true);
    try {
      const data = await pmService.getTasks({
        status: statusFilter,
        projectId: projectFilter,
      });
      setTasks(data);
    } catch (error) {
      console.error('Error cargando tareas PM:', error);
    } finally {
      setLoading(false);
    }
  }, [statusFilter, projectFilter]);

  useEffect(() => { loadTasks(); }, [loadTasks]);

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

  const filtered = tasks.filter(t =>
    t.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (t.description || '').toLowerCase().includes(searchTerm.toLowerCase())
  );

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
                <h1 className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-white">Tareas de Proyecto</h1>
                <p className="text-xs sm:text-sm text-gray-500 dark:text-gray-400">Gestiona tareas vinculadas a proyectos</p>
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
              <TaskListView tasks={filtered} onTaskClick={openEdit} onTaskUpdate={loadTasks} />
            )}

            {activeTab === 'kanban' && (
              <KanbanBoard tasks={filtered} onTaskUpdate={loadTasks} />
            )}

            {activeTab === 'calendar' && (
              <CalendarView tasks={filtered} />
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
      />
    </div>
  );
}
