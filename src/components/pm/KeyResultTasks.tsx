'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { Plus, Loader2, Sparkles, Clock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useToast } from '@/components/ui/use-toast';
import { pmService, type PMTask } from '@/lib/services/pmService';
import { RelatedTasksList } from '@/components/pm/RelatedTasksList';
import { getOrganizationId } from '@/lib/hooks/useOrganization';

interface KeyResultTasksProps {
  krId: string;
  krTitle: string;
  krDescription?: string | null;
  users: Array<{ id: string; nombre: string }>;
  /** Se llama cuando cambian las tareas (para refrescar progreso de meta/KR en el contenedor) */
  onChanged?: () => void;
}

export function KeyResultTasks({ krId, krTitle, krDescription, users, onChanged }: KeyResultTasksProps) {
  const { toast } = useToast();
  const [tasks, setTasks] = useState<PMTask[]>([]);
  const [loading, setLoading] = useState(false);
  const [title, setTitle] = useState('');
  const [hours, setHours] = useState('');
  const [assignee, setAssignee] = useState('');
  const [saving, setSaving] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const t = await pmService.getKeyResultTasks(krId);
      setTasks(t);
    } finally {
      setLoading(false);
    }
  }, [krId]);

  useEffect(() => { load(); }, [load]);

  const handleAdd = async () => {
    if (!title.trim()) return;
    setSaving(true);
    try {
      await pmService.createTask({
        key_result_id: krId,
        title: title.trim(),
        estimated_hours: hours ? parseFloat(hours) : null,
        assigned_to: assignee || null,
        priority: 'med',
        status: 'open',
        type: 'task',
      });
      setTitle(''); setHours(''); setAssignee('');
      await load();
      onChanged?.();
    } catch (error: any) {
      toast({ title: 'Error al crear tarea', description: error.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const handleGenerateAI = async () => {
    setAiLoading(true);
    try {
      const res = await fetch('/api/ai-assistant/pm-assist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode: 'task', title: krTitle, description: krDescription || '',
          organizationId: getOrganizationId(),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Error de IA');
      const subtasks = Array.isArray(data.subtasks) ? data.subtasks : [];
      if (subtasks.length === 0) { toast({ title: 'La IA no generó tareas' }); return; }
      const n = await pmService.createTasksForKeyResult(krId, subtasks.map((s: any) => ({
        title: s.title,
        estimated_hours: s.estimated_hours ?? null,
        due_date: s.due_date ?? null,
        priority: s.priority ?? 'med',
      })));
      await load();
      onChanged?.();
      toast({ title: 'Tareas generadas con IA', description: `${n} tarea(s) creadas para el KR` });
    } catch (error: any) {
      toast({ title: 'Error del asistente IA', description: error.message, variant: 'destructive' });
    } finally {
      setAiLoading(false);
    }
  };

  return (
    <div className="mt-2 pl-4 border-l-2 border-gray-100 dark:border-gray-700 space-y-2">
      <RelatedTasksList tasks={tasks} loading={loading} show="none" emptyLabel="Sin tareas. Agrega o genera con IA para medir el avance." />

      {/* Alta de tarea */}
      <div className="flex gap-2">
        <Input
          placeholder="Nueva tarea del KR"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleAdd(); } }}
          className="flex-1 text-sm bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-700"
        />
        <div className="relative w-20">
          <Clock className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-gray-400" />
          <Input
            placeholder="h"
            type="number"
            value={hours}
            onChange={(e) => setHours(e.target.value)}
            className="pl-6 text-sm bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-700"
          />
        </div>
        <Button type="button" variant="outline" size="icon" onClick={handleAdd} disabled={saving} className="h-9 w-9 flex-shrink-0">
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
        </Button>
      </div>

      <div className="flex items-center gap-2">
        <Select value={assignee} onValueChange={setAssignee}>
          <SelectTrigger className="h-8 flex-1 text-xs bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-700">
            <SelectValue placeholder="Responsable (opcional)" />
          </SelectTrigger>
          <SelectContent>
            {users.map(u => <SelectItem key={u.id} value={u.id}>{u.nombre}</SelectItem>)}
          </SelectContent>
        </Select>
        <Button
          type="button" variant="outline" size="sm"
          onClick={handleGenerateAI} disabled={aiLoading}
          className="h-8 gap-1 text-xs border-purple-200 text-purple-600 hover:bg-purple-50 dark:border-purple-800 dark:text-purple-400"
        >
          {aiLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
          Generar con IA
        </Button>
      </div>
    </div>
  );
}
