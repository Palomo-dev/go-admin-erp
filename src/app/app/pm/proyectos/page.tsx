'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Plus,
  Search,
  FolderKanban,
  Calendar,
  ArrowLeft,
  CheckCircle,
  Clock,
  Pause,
  XCircle,
  FileEdit,
  TrendingUp,
} from 'lucide-react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useToast } from '@/components/ui/use-toast';
import { pmService, type Project, PROJECT_STATUS_LABELS, PROJECT_STATUS_COLORS, PRIORITY_LABELS, PRIORITY_COLORS } from '@/lib/services/pmService';
import { getAssignableUsers } from '@/lib/services/userService';
import Link from 'next/link';
import ProjectCreationPanel from '@/components/pm/ProjectCreationPanel';

export default function ProjectsPage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [showCreatePanel, setShowCreatePanel] = useState(false);
  const [editProject, setEditProject] = useState<Project | null>(null);
  const [users, setUsers] = useState<Array<{id: string, nombre: string}>>([]);
  const { toast } = useToast();

  const openCreate = () => { setEditProject(null); setShowCreatePanel(true); };
  const openEdit = (p: Project) => { setEditProject(p); setShowCreatePanel(true); };
  const closePanel = () => { setShowCreatePanel(false); setEditProject(null); };

  const loadProjects = useCallback(async () => {
    try {
      const data = await pmService.getProjects({ status: statusFilter });
      setProjects(data);
    } catch (error) {
      console.error('Error cargando proyectos:', error);
    } finally {
      setLoading(false);
    }
  }, [statusFilter]);

  useEffect(() => { loadProjects(); }, [loadProjects]);
  useEffect(() => { getAssignableUsers().then(setUsers); }, []);


  const filtered = projects.filter(p =>
    p.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (p.description || '').toLowerCase().includes(searchTerm.toLowerCase())
  );

  // Stats
  const stats = {
    total: projects.length,
    active: projects.filter(p => p.status === 'active').length,
    completed: projects.filter(p => p.status === 'completed').length,
    onHold: projects.filter(p => p.status === 'on_hold').length,
  };

  const statusIcons: Record<string, React.ReactNode> = {
    draft: <FileEdit className="h-4 w-4" />,
    active: <TrendingUp className="h-4 w-4" />,
    on_hold: <Pause className="h-4 w-4" />,
    completed: <CheckCircle className="h-4 w-4" />,
    cancelled: <XCircle className="h-4 w-4" />,
  };

  return (
    <div className="flex h-full overflow-hidden">
    <div className="flex-1 overflow-y-auto p-3 sm:p-4 md:p-6 space-y-4 sm:space-y-6 bg-gray-50 dark:bg-gray-900">
      {/* Header */}
      <div className="flex flex-col gap-4">
        <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
          <Link href="/app/pm" className="hover:text-blue-600 flex items-center gap-1">
            <ArrowLeft className="h-4 w-4" />PM
          </Link>
          <span>/</span>
          <span className="text-gray-900 dark:text-white font-medium">Proyectos</span>
        </div>
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-100 dark:bg-blue-900/30 rounded-lg">
              <FolderKanban className="h-6 w-6 text-blue-600 dark:text-blue-400" />
            </div>
            <div>
              <h1 className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-white">Proyectos</h1>
              <p className="text-xs sm:text-sm text-gray-500 dark:text-gray-400">Administra los proyectos de tu organización</p>
            </div>
          </div>
          <Button onClick={openCreate} className="bg-blue-600 hover:bg-blue-700 text-white gap-2">
            <Plus size={16} />Nuevo Proyecto
          </Button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'Total', value: stats.total, icon: <FolderKanban className="h-4 w-4" />, color: 'text-blue-600', bg: 'bg-blue-50 dark:bg-blue-950/20' },
          { label: 'Activos', value: stats.active, icon: <TrendingUp className="h-4 w-4" />, color: 'text-green-600', bg: 'bg-green-50 dark:bg-green-950/20' },
          { label: 'Completados', value: stats.completed, icon: <CheckCircle className="h-4 w-4" />, color: 'text-emerald-600', bg: 'bg-emerald-50 dark:bg-emerald-950/20' },
          { label: 'En Pausa', value: stats.onHold, icon: <Pause className="h-4 w-4" />, color: 'text-yellow-600', bg: 'bg-yellow-50 dark:bg-yellow-950/20' },
        ].map(s => (
          <Card key={s.label} className={`${s.bg} border-0`}>
            <CardContent className="p-3 sm:p-4">
              <div className="flex items-center gap-1.5 mb-1">
                <span className={s.color}>{s.icon}</span>
                <span className="text-xs font-medium text-gray-500">{s.label}</span>
              </div>
              <p className={`text-xl sm:text-2xl font-bold ${s.color}`}>{s.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <Input placeholder="Buscar proyectos..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="pl-9 bg-white dark:bg-gray-800" />
        </div>
        <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v); setLoading(true); }}>
          <SelectTrigger className="w-[180px] bg-white dark:bg-gray-800">
            <SelectValue placeholder="Estado" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos los estados</SelectItem>
            <SelectItem value="draft">Borrador</SelectItem>
            <SelectItem value="active">Activo</SelectItem>
            <SelectItem value="on_hold">En Pausa</SelectItem>
            <SelectItem value="completed">Completado</SelectItem>
            <SelectItem value="cancelled">Cancelado</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Projects Grid */}
      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <Card key={i}><CardContent className="p-4"><Skeleton className="h-4 w-3/4 mb-3" /><Skeleton className="h-3 w-full mb-2" /><Skeleton className="h-3 w-2/3" /></CardContent></Card>
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center">
            <FolderKanban className="h-12 w-12 text-gray-300 dark:text-gray-600 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 dark:text-white">No hay proyectos</h3>
            <p className="text-gray-500 dark:text-gray-400 mt-1">Crea tu primer proyecto para empezar</p>
            <Button onClick={openCreate} className="mt-4 gap-2"><Plus size={16} />Crear Proyecto</Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((project) => {
            const daysLeft = project.end_date ? Math.ceil((new Date(project.end_date).getTime() - Date.now()) / (1000 * 60 * 60 * 24)) : null;
            return (
              <Card key={project.id} onClick={() => openEdit(project)} className="hover:shadow-md transition-all group border-l-4 cursor-pointer" style={{ borderLeftColor: project.status === 'active' ? '#22c55e' : project.status === 'completed' ? '#3b82f6' : project.status === 'on_hold' ? '#eab308' : '#d1d5db' }}>
                <CardHeader className="pb-2">
                  <div className="flex items-start justify-between">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        {statusIcons[project.status]}
                        <CardTitle className="text-base truncate">{project.name}</CardTitle>
                      </div>
                      <div className="flex gap-1.5 flex-wrap">
                        <Badge className={`text-[10px] ${PROJECT_STATUS_COLORS[project.status]}`}>
                          {PROJECT_STATUS_LABELS[project.status]}
                        </Badge>
                        <Badge className={`text-[10px] ${PRIORITY_COLORS[project.priority]}`}>
                          {PRIORITY_LABELS[project.priority]}
                        </Badge>
                      </div>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  {project.description && (
                    <p className="text-xs text-gray-500 dark:text-gray-400 line-clamp-2 mb-3">{project.description.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim()}</p>
                  )}
                  <div className="space-y-2">
                    <div className="flex items-center gap-3 text-xs text-gray-500">
                      {project.start_date && (
                        <span className="flex items-center gap-1">
                          <Calendar className="h-3 w-3" />
                          {new Date(project.start_date).toLocaleDateString('es-ES', { day: '2-digit', month: 'short' })}
                          {project.end_date && ` - ${new Date(project.end_date).toLocaleDateString('es-ES', { day: '2-digit', month: 'short' })}`}
                        </span>
                      )}
                    </div>
                    {daysLeft !== null && project.status === 'active' && (
                      <div className="flex items-center gap-1.5 text-xs">
                        <Clock className="h-3 w-3" />
                        <span className={daysLeft < 0 ? 'text-red-500 font-medium' : daysLeft < 7 ? 'text-yellow-600' : 'text-gray-500'}>
                          {daysLeft < 0 ? `Vencido hace ${Math.abs(daysLeft)} días` : `${daysLeft} días restantes`}
                        </span>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      </div>

      {/* Panel lateral */}
      <ProjectCreationPanel
        isOpen={showCreatePanel}
        onClose={closePanel}
        users={users}
        editProject={editProject}
        onProjectCreated={loadProjects}
      />
    </div>
  );
}
