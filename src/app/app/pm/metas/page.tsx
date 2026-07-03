'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Plus,
  Search,
  Target,
  Calendar,
  CheckCircle,
  FolderKanban,
  ArrowLeft,
  FileText,
  Lightbulb,
  Zap,
} from 'lucide-react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useToast } from '@/components/ui/use-toast';
import { pmService, type Goal } from '@/lib/services/pmService';
import { supabase } from '@/lib/supabase/config';
import { getOrganizationId } from '@/lib/hooks/useOrganization';
import { getAssignableUsers } from '@/lib/services/userService';
import Link from 'next/link';
import GoalCreationPanel from '@/components/pm/GoalCreationPanel';

const TYPE_LABELS: Record<string, string> = { goal: 'Meta', purpose: 'Propósito', proposal: 'Propuesta' };
const TYPE_COLORS: Record<string, string> = {
  goal: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300',
  purpose: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',
  proposal: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300',
};
const TYPE_ICONS: Record<string, React.ReactNode> = {
  goal: <Target className="h-4 w-4" />,
  purpose: <Lightbulb className="h-4 w-4" />,
  proposal: <FileText className="h-4 w-4" />,
};
const STATUS_LABELS: Record<string, string> = { draft: 'Borrador', active: 'Activa', achieved: 'Lograda', abandoned: 'Abandonada' };
const STATUS_COLORS: Record<string, string> = {
  draft: 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300',
  active: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-300',
  achieved: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300',
  abandoned: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300',
};

export default function GoalsPage() {
  const [goals, setGoals] = useState<Goal[]>([]);
  const [projects, setProjects] = useState<Array<{id: string, name: string}>>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [showCreatePanel, setShowCreatePanel] = useState(false);
  const [editGoal, setEditGoal] = useState<Goal | null>(null);
  const [users, setUsers] = useState<Array<{id: string, nombre: string}>>([]);
  const { toast } = useToast();

  const openCreate = () => { setEditGoal(null); setShowCreatePanel(true); };
  const openEdit = (g: Goal) => { setEditGoal(g); setShowCreatePanel(true); };
  const closePanel = () => { setShowCreatePanel(false); setEditGoal(null); };

  const loadGoals = useCallback(async () => {
    try {
      const data = await pmService.getGoals({ type: typeFilter });
      setGoals(data);
    } catch (error) {
      console.error('Error cargando metas:', error);
    } finally {
      setLoading(false);
    }
  }, [typeFilter]);

  useEffect(() => { loadGoals(); }, [loadGoals]);

  useEffect(() => {
    const load = async () => {
      const orgId = getOrganizationId();
      if (!orgId) return;
      const { data } = await supabase.from('projects').select('id, name').eq('organization_id', orgId).order('name');
      setProjects(data || []);
    };
    load();
    getAssignableUsers().then(setUsers);
  }, []);


  const filtered = goals.filter(g =>
    g.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (g.description || '').toLowerCase().includes(searchTerm.toLowerCase())
  );

  const stats = {
    total: goals.length,
    active: goals.filter(g => g.status === 'active').length,
    achieved: goals.filter(g => g.status === 'achieved').length,
    proposals: goals.filter(g => g.type === 'proposal').length,
  };

  return (
    <div className="flex h-full overflow-hidden">
    <div className="flex-1 overflow-y-auto p-3 sm:p-4 md:p-6 space-y-4 sm:space-y-6 bg-gray-50 dark:bg-gray-900">
      {/* Header */}
      <div className="flex flex-col gap-4">
        <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
          <Link href="/app/pm" className="hover:text-blue-600 flex items-center gap-1"><ArrowLeft className="h-4 w-4" />PM</Link>
          <span>/</span>
          <span className="text-gray-900 dark:text-white font-medium">Metas</span>
        </div>
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-100 dark:bg-blue-900/30 rounded-lg">
              <Target className="h-6 w-6 text-blue-600 dark:text-blue-400" />
            </div>
            <div>
              <h1 className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-white">Metas y Propuestas</h1>
              <p className="text-xs sm:text-sm text-gray-500 dark:text-gray-400">Gestiona metas, propósitos y propuestas</p>
            </div>
          </div>
          <Button onClick={openCreate} className="bg-blue-600 hover:bg-blue-700 text-white gap-2">
            <Plus size={16} />Nueva Meta
          </Button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'Total', value: stats.total, icon: <Target className="h-4 w-4" />, color: 'text-blue-600', bg: 'bg-blue-50 dark:bg-blue-950/20' },
          { label: 'Activas', value: stats.active, icon: <Zap className="h-4 w-4" />, color: 'text-yellow-600', bg: 'bg-yellow-50 dark:bg-yellow-950/20' },
          { label: 'Logradas', value: stats.achieved, icon: <CheckCircle className="h-4 w-4" />, color: 'text-green-600', bg: 'bg-green-50 dark:bg-green-950/20' },
          { label: 'Propuestas', value: stats.proposals, icon: <FileText className="h-4 w-4" />, color: 'text-purple-600', bg: 'bg-purple-50 dark:bg-purple-950/20' },
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
          <Input placeholder="Buscar metas..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="pl-9 bg-white dark:bg-gray-800" />
        </div>
        <Select value={typeFilter} onValueChange={(v) => { setTypeFilter(v); setLoading(true); }}>
          <SelectTrigger className="w-[180px] bg-white dark:bg-gray-800"><SelectValue placeholder="Tipo" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos los tipos</SelectItem>
            <SelectItem value="goal">Metas</SelectItem>
            <SelectItem value="purpose">Propósitos</SelectItem>
            <SelectItem value="proposal">Propuestas</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Goals Grid */}
      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <Card key={i}><CardContent className="p-4"><Skeleton className="h-4 w-3/4 mb-3" /><Skeleton className="h-3 w-full mb-2" /><Skeleton className="h-2 w-full" /></CardContent></Card>
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center">
            <Target className="h-12 w-12 text-gray-300 dark:text-gray-600 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 dark:text-white">No hay metas</h3>
            <p className="text-gray-500 dark:text-gray-400 mt-1">Crea tu primera meta o propuesta</p>
            <Button onClick={openCreate} className="mt-4 gap-2"><Plus size={16} />Crear Meta</Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((goal) => {
            const daysLeft = goal.target_date ? Math.ceil((new Date(goal.target_date).getTime() - Date.now()) / (1000 * 60 * 60 * 24)) : null;
            return (
              <Card key={goal.id} onClick={() => openEdit(goal)} className="hover:shadow-md transition-all border-l-4 cursor-pointer" style={{ borderLeftColor: goal.status === 'achieved' ? '#22c55e' : goal.status === 'active' ? '#eab308' : goal.type === 'proposal' ? '#a855f7' : '#d1d5db' }}>
                <CardHeader className="pb-2">
                  <div className="flex items-start gap-2">
                    <div className={`p-1.5 rounded-lg mt-0.5 ${TYPE_COLORS[goal.type]}`}>
                      {TYPE_ICONS[goal.type]}
                    </div>
                    <div className="flex-1 min-w-0">
                      <CardTitle className="text-base truncate">{goal.title}</CardTitle>
                      <div className="flex gap-1.5 mt-1 flex-wrap">
                        <Badge className={`text-[10px] ${TYPE_COLORS[goal.type]}`}>{TYPE_LABELS[goal.type]}</Badge>
                        <Badge className={`text-[10px] ${STATUS_COLORS[goal.status]}`}>{STATUS_LABELS[goal.status]}</Badge>
                      </div>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  {goal.description && (
                    <p className="text-xs text-gray-500 dark:text-gray-400 line-clamp-2 mb-3">{goal.description}</p>
                  )}
                  <div className="mb-3">
                    <div className="flex justify-between text-xs text-gray-500 mb-1">
                      <span>Progreso</span>
                      <span className="font-medium">{goal.progress}%</span>
                    </div>
                    <div className="h-2 bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden">
                      <div className={`h-full rounded-full transition-all ${goal.progress >= 100 ? 'bg-green-500' : goal.progress >= 50 ? 'bg-blue-500' : 'bg-yellow-400'}`} style={{ width: `${Math.min(goal.progress, 100)}%` }} />
                    </div>
                  </div>
                  <div className="flex items-center gap-3 text-xs text-gray-500">
                    {goal.projects?.name && (
                      <span className="flex items-center gap-1"><FolderKanban className="h-3 w-3" />{goal.projects.name}</span>
                    )}
                    {goal.target_date && (
                      <span className={`flex items-center gap-1 ${daysLeft !== null && daysLeft < 0 && goal.status !== 'achieved' ? 'text-red-500' : ''}`}>
                        <Calendar className="h-3 w-3" />{new Date(goal.target_date).toLocaleDateString('es-ES', { day: '2-digit', month: 'short' })}
                      </span>
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
      <GoalCreationPanel
        isOpen={showCreatePanel}
        onClose={closePanel}
        projects={projects}
        users={users}
        editGoal={editGoal}
        onGoalCreated={loadGoals}
      />
    </div>
  );
}
