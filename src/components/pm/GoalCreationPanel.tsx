'use client';

import React, { useState, useCallback, useEffect } from 'react';
import {
  X,
  Loader2,
  Target,
  CalendarIcon,
  ChevronDown,
  ChevronUp,
  Trash2,
  ListChecks,
  Plus,
  Sparkles,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RichTextEditor } from '@/components/pm/RichTextEditor';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useToast } from '@/components/ui/use-toast';
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet';
import * as VisuallyHidden from '@radix-ui/react-visually-hidden';
import { pmService, type Goal, type PMTask } from '@/lib/services/pmService';
import { RelatedTasksList } from '@/components/pm/RelatedTasksList';
import { KeyResultTasks } from '@/components/pm/KeyResultTasks';
import { getOrganizationId } from '@/lib/hooks/useOrganization';
import { cn } from '@/utils/Utils';

interface KRItem {
  id: string;
  title: string;
  target_value?: string;
  unit?: string;
  current_value?: number;
  progress?: number;
  persisted?: boolean;
}

interface GoalCreationPanelProps {
  isOpen: boolean;
  onClose: () => void;
  projects: Array<{ id: string; name: string }>;
  users: Array<{ id: string; nombre: string }>;
  onGoalCreated: () => void;
  editGoal?: Goal | null;
}

const INITIAL_FORM = {
  title: '',
  description: '',
  type: 'goal',
  status: 'draft',
  target_date: '',
  project_id: '',
  owner_id: '',
  start_date: '',
  complexity: 'med',
  priority: 'med',
};

export default function GoalCreationPanel({ isOpen, onClose, projects, users, onGoalCreated, editGoal }: GoalCreationPanelProps) {
  const { toast } = useToast();
  const [isMobile, setIsMobile] = useState(false);
  const isEdit = !!editGoal;

  useEffect(() => {
    const mq = window.matchMedia('(max-width: 1023px)');
    setIsMobile(mq.matches);
    const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  const [form, setForm] = useState(INITIAL_FORM);
  const [creating, setCreating] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [keyResults, setKeyResults] = useState<KRItem[]>([]);
  const [showKeyResults, setShowKeyResults] = useState(false);
  const [newKR, setNewKR] = useState('');
  const [newKRTarget, setNewKRTarget] = useState('');
  const [newKRUnit, setNewKRUnit] = useState('');
  const [aiLoading, setAiLoading] = useState(false);
  const [relatedTasks, setRelatedTasks] = useState<PMTask[]>([]);
  const [loadingTasks, setLoadingTasks] = useState(false);
  const [expandedKR, setExpandedKR] = useState<string | null>(null);

  // Refresca el progreso de los KRs y el de la meta tras cambios en tareas
  const refreshKRs = useCallback(async () => {
    if (!editGoal) return;
    const krs = await pmService.getKeyResults(editGoal.id);
    setKeyResults(prev => prev.map(item => {
      const fresh = krs.find(k => k.id === item.id);
      return fresh ? { ...item, progress: fresh.progress } : item;
    }));
    onGoalCreated();
  }, [editGoal, onGoalCreated]);

  const resetForm = useCallback(() => {
    setForm(INITIAL_FORM);
    setKeyResults([]);
    setNewKR('');
    setNewKRTarget('');
    setNewKRUnit('');
    setShowKeyResults(false);
  }, []);

  // Precargar datos al editar
  useEffect(() => {
    if (editGoal) {
      setForm({
        title: editGoal.title || '',
        description: editGoal.description || '',
        type: editGoal.type || 'goal',
        status: editGoal.status || 'draft',
        target_date: editGoal.target_date || '',
        project_id: editGoal.project_id || '',
        owner_id: editGoal.owner_id || '',
        start_date: editGoal.start_date || '',
        complexity: editGoal.complexity || 'med',
        priority: editGoal.priority || 'med',
      });
      pmService.getKeyResults(editGoal.id).then(krs => {
        setKeyResults(krs.map(k => ({
          id: k.id, title: k.title,
          target_value: k.target_value != null ? String(k.target_value) : '',
          unit: k.unit || '', current_value: k.current_value, progress: k.progress, persisted: true,
        })));
        if (krs.length > 0) setShowKeyResults(true);
      });
      setLoadingTasks(true);
      pmService.getGoalTasks(editGoal.id).then(t => { setRelatedTasks(t); setLoadingTasks(false); }).catch(() => setLoadingTasks(false));
    } else {
      resetForm();
      setRelatedTasks([]);
    }
  }, [editGoal, resetForm]);

  const handleDelete = async () => {
    if (!editGoal) return;
    if (!window.confirm(`¿Eliminar "${editGoal.title}"? Esta acción no se puede deshacer.`)) return;
    setDeleting(true);
    try {
      await pmService.deleteGoal(editGoal.id);
      toast({ title: 'Meta eliminada' });
      resetForm();
      onClose();
      onGoalCreated();
    } catch (error: any) {
      toast({ title: 'Error al eliminar', description: error.message, variant: 'destructive' });
    } finally {
      setDeleting(false);
    }
  };

  const clearKRInputs = () => { setNewKR(''); setNewKRTarget(''); setNewKRUnit(''); };

  const handleAddKR = async () => {
    if (!newKR.trim()) return;
    const title = newKR.trim();
    const target = newKRTarget.trim();
    const unit = newKRUnit.trim();
    clearKRInputs();
    if (isEdit && editGoal) {
      try {
        const created = await pmService.createKeyResult(editGoal.id, {
          title, target_value: target ? parseFloat(target) : null, unit: unit || null,
          metric_type: unit === '%' ? 'percentage' : 'number',
        });
        setKeyResults(prev => [...prev, { id: created.id, title, target_value: target, unit, progress: 0, persisted: true }]);
        onGoalCreated();
      } catch (error: any) {
        toast({ title: 'Error al crear KR', description: error.message, variant: 'destructive' });
      }
      return;
    }
    setKeyResults(prev => [...prev, { id: crypto.randomUUID(), title, target_value: target, unit }]);
  };

  const handleRemoveKR = async (id: string) => {
    const kr = keyResults.find(k => k.id === id);
    setKeyResults(prev => prev.filter(x => x.id !== id));
    if (kr?.persisted) {
      try { await pmService.deleteKeyResult(id); onGoalCreated(); }
      catch (error: any) { toast({ title: 'Error al eliminar KR', description: error.message, variant: 'destructive' }); }
    }
  };

  const handleAISuggest = async () => {
    if (!form.title.trim()) { toast({ title: 'Escribe un título primero', variant: 'destructive' }); return; }
    setAiLoading(true);
    try {
      const res = await fetch('/api/ai-assistant/pm-assist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode: 'goal', title: form.title, description: form.description,
          complexity: form.complexity, startDate: form.start_date || undefined, organizationId: getOrganizationId(),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Error de IA');
      setForm(f => ({ ...f, target_date: f.target_date || data.target_date || '' }));
      const suggested = (data.key_results || []).map((k: any) => ({
        title: k.title,
        target_value: k.target_value != null ? String(k.target_value) : '',
        unit: k.unit || '',
      }));
      setShowKeyResults(true);
      if (isEdit && editGoal) {
        const created = await Promise.all(suggested.map((k: any, i: number) => pmService.createKeyResult(editGoal.id, {
          title: k.title, target_value: k.target_value ? parseFloat(k.target_value) : null,
          unit: k.unit || null, metric_type: k.unit === '%' ? 'percentage' : 'number', sort_order: i,
        })));
        setKeyResults(prev => [...prev, ...created.map((c, idx) => ({ id: c.id, title: c.title, target_value: suggested[idx].target_value, unit: suggested[idx].unit, progress: 0, persisted: true }))]);
        onGoalCreated();
      } else {
        setKeyResults(prev => [...prev, ...suggested.map((k: any) => ({ id: crypto.randomUUID(), title: k.title, target_value: k.target_value, unit: k.unit }))]);
      }
      toast({ title: 'IA sugirió KRs', description: `${suggested.length} resultado(s) clave · fecha objetivo aterrizada` });
    } catch (error: any) {
      toast({ title: 'Error del asistente IA', description: error.message, variant: 'destructive' });
    } finally {
      setAiLoading(false);
    }
  };

  const [descLoading, setDescLoading] = useState(false);
  const handleGenerateDescription = async () => {
    if (!form.title.trim()) { toast({ title: 'Escribe un título primero', variant: 'destructive' }); return; }
    setDescLoading(true);
    try {
      const owner = users.find(u => u.id === form.owner_id)?.nombre;
      const project = projects.find(p => p.id === form.project_id)?.name;
      const res = await fetch('/api/ai-assistant/pm-assist', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode: 'describe', entity: 'meta', title: form.title, description: form.description,
          organizationId: getOrganizationId(),
          context: { priority: form.priority, complexity: form.complexity, due_date: form.target_date, assignee: owner, goal: project },
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Error de IA');
      if (data.description) setForm(f => ({ ...f, description: data.description }));
      toast({ title: 'Descripción generada con IA' });
    } catch (error: any) {
      toast({ title: 'Error del asistente IA', description: error.message, variant: 'destructive' });
    } finally {
      setDescLoading(false);
    }
  };

  const handleCreate = async () => {
    if (!form.title.trim()) { toast({ title: 'El título es requerido', variant: 'destructive' }); return; }

    setCreating(true);
    try {
      const payload = {
        title: form.title.trim(),
        description: form.description.trim() || null,
        type: form.type as any,
        status: form.status as any,
        target_date: form.target_date || null,
        project_id: form.project_id || null,
        owner_id: form.owner_id || null,
        start_date: form.start_date || null,
        complexity: form.complexity as any,
        priority: form.priority as any,
      };

      if (isEdit && editGoal) {
        await pmService.updateGoal(editGoal.id, payload);
        toast({ title: 'Meta actualizada', description: `"${form.title}" guardada` });
      } else {
        const goal = await pmService.createGoal(payload);
        // Persistir KRs locales
        if (keyResults.length > 0) {
          await Promise.all(keyResults.map((kr, i) => pmService.createKeyResult(goal.id, {
            title: kr.title,
            target_value: kr.target_value ? parseFloat(kr.target_value) : null,
            unit: kr.unit || null,
            metric_type: kr.unit === '%' ? 'percentage' : 'number',
            sort_order: i,
          })));
        }
        toast({ title: 'Meta creada exitosamente', description: `"${form.title}" con ${keyResults.length} KR(s)` });
      }
      resetForm();
      onClose();
      onGoalCreated();
    } catch (error: any) {
      toast({ title: isEdit ? 'Error al actualizar meta' : 'Error al crear meta', description: error.message, variant: 'destructive' });
    } finally {
      setCreating(false);
    }
  };

  const renderContent = () => (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 flex-shrink-0">
        <div className="flex items-center gap-2.5">
          <div className="p-1.5 bg-blue-100 dark:bg-blue-900/30 rounded-lg">
            <Target className="h-5 w-5 text-blue-600 dark:text-blue-400" />
          </div>
          <div>
            <h2 className="text-base font-semibold text-gray-900 dark:text-white">{isEdit ? 'Editar Meta' : 'Nueva Meta'}</h2>
            <p className="text-xs text-gray-500 dark:text-gray-400">Define objetivos con resultados clave</p>
          </div>
        </div>
        <Button variant="ghost" size="icon" onClick={() => { resetForm(); onClose(); }} className="h-8 w-8">
          <X className="h-4 w-4" />
        </Button>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5 min-h-0">
        {/* Título */}
        <div className="space-y-1.5">
          <Label className="text-sm font-medium">Título *</Label>
          <Input
            placeholder="¿Qué quieres lograr?"
            value={form.title}
            onChange={(e) => setForm(f => ({ ...f, title: e.target.value }))}
            className="bg-gray-50 dark:bg-gray-800 border-gray-200 dark:border-gray-700"
            autoFocus
          />
        </div>

        {/* Descripción */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <Label className="text-sm font-medium">Descripción / Contexto</Label>
            <Button
              type="button" variant="outline" size="sm"
              onClick={handleGenerateDescription} disabled={descLoading}
              className="h-7 gap-1 text-xs border-purple-200 text-purple-600 hover:bg-purple-50 dark:border-purple-800 dark:text-purple-400"
            >
              {descLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
              Generar con IA
            </Button>
          </div>
          <RichTextEditor
            value={form.description}
            onChange={(html) => setForm(f => ({ ...f, description: html }))}
            placeholder="Razón, contexto o impacto esperado..."
          />
        </div>

        {/* Tipo + Estado */}
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label className="text-sm font-medium">Tipo</Label>
            <Select value={form.type} onValueChange={(v) => setForm(f => ({ ...f, type: v }))}>
              <SelectTrigger className="bg-gray-50 dark:bg-gray-800 border-gray-200 dark:border-gray-700">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="goal">Meta</SelectItem>
                <SelectItem value="purpose">Propósito</SelectItem>
                <SelectItem value="proposal">Propuesta</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-sm font-medium">Estado</Label>
            <Select value={form.status} onValueChange={(v) => setForm(f => ({ ...f, status: v }))}>
              <SelectTrigger className="bg-gray-50 dark:bg-gray-800 border-gray-200 dark:border-gray-700">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="draft">Borrador</SelectItem>
                <SelectItem value="active">Activa</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Fecha + Responsable */}
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label className="text-sm font-medium flex items-center gap-1"><CalendarIcon className="h-3.5 w-3.5" />Fecha objetivo</Label>
            <Input
              type="date"
              value={form.target_date}
              onChange={(e) => setForm(f => ({ ...f, target_date: e.target.value }))}
              className="bg-gray-50 dark:bg-gray-800 border-gray-200 dark:border-gray-700"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-sm font-medium">Responsable</Label>
            <Select value={form.owner_id} onValueChange={(v) => setForm(f => ({ ...f, owner_id: v }))}>
              <SelectTrigger className="bg-gray-50 dark:bg-gray-800 border-gray-200 dark:border-gray-700">
                <SelectValue placeholder="Seleccionar" />
              </SelectTrigger>
              <SelectContent>
                {users.map(u => <SelectItem key={u.id} value={u.id}>{u.nombre}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Fecha inicio + Complejidad + Prioridad */}
        <div className="grid grid-cols-3 gap-3">
          <div className="space-y-1.5">
            <Label className="text-sm font-medium flex items-center gap-1"><CalendarIcon className="h-3.5 w-3.5" />Inicio</Label>
            <Input
              type="date"
              value={form.start_date}
              onChange={(e) => setForm(f => ({ ...f, start_date: e.target.value }))}
              className="bg-gray-50 dark:bg-gray-800 border-gray-200 dark:border-gray-700"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-sm font-medium">Complejidad</Label>
            <Select value={form.complexity} onValueChange={(v) => setForm(f => ({ ...f, complexity: v }))}>
              <SelectTrigger className="bg-gray-50 dark:bg-gray-800 border-gray-200 dark:border-gray-700">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="low">Baja</SelectItem>
                <SelectItem value="med">Media</SelectItem>
                <SelectItem value="high">Alta</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-sm font-medium">Prioridad</Label>
            <Select value={form.priority} onValueChange={(v) => setForm(f => ({ ...f, priority: v }))}>
              <SelectTrigger className="bg-gray-50 dark:bg-gray-800 border-gray-200 dark:border-gray-700">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="low">Baja</SelectItem>
                <SelectItem value="med">Media</SelectItem>
                <SelectItem value="high">Alta</SelectItem>
                <SelectItem value="urgent">Urgente</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Proyecto asociado */}
        <div className="space-y-1.5">
          <Label className="text-sm font-medium">Proyecto asociado</Label>
          <Select value={form.project_id} onValueChange={(v) => setForm(f => ({ ...f, project_id: v }))}>
            <SelectTrigger className="bg-gray-50 dark:bg-gray-800 border-gray-200 dark:border-gray-700">
              <SelectValue placeholder="Sin proyecto (independiente)" />
            </SelectTrigger>
            <SelectContent>
              {projects.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>

        {/* Divider */}
        <div className="border-t border-gray-100 dark:border-gray-800" />

        {/* Key Results - collapsible */}
        <div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setShowKeyResults(!showKeyResults)}
              className="flex items-center gap-2 flex-1 text-left text-sm font-medium text-gray-700 dark:text-gray-300 hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
            >
              <ListChecks className="h-4 w-4" />
              Resultados Clave (KRs)
              {keyResults.length > 0 && <Badge variant="secondary" className="text-xs px-1.5 py-0">{keyResults.length}</Badge>}
              {showKeyResults ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
            </button>
            <Button
              type="button" variant="outline" size="sm"
              onClick={handleAISuggest} disabled={aiLoading}
              className="h-7 gap-1 text-xs border-purple-200 text-purple-600 hover:bg-purple-50 dark:border-purple-800 dark:text-purple-400"
            >
              {aiLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
              Sugerir con IA
            </Button>
          </div>

          {showKeyResults && (
            <div className="mt-3 space-y-2">
              <p className="text-xs text-gray-500">¿Cómo medirás el éxito de esta meta? (valor objetivo opcional)</p>
              {keyResults.map((kr, idx) => (
                <div key={kr.id} className="bg-gray-50 dark:bg-gray-800 rounded-lg px-3 py-2">
                  <div className="flex items-center gap-2 group">
                    <span className="text-xs font-bold text-blue-600 flex-shrink-0">{idx + 1}.</span>
                    <span className="text-sm flex-1 text-gray-700 dark:text-gray-300 truncate">{kr.title}</span>
                    {kr.target_value && (
                      <Badge variant="secondary" className="text-[10px] px-1.5 py-0 flex-shrink-0">
                        {kr.target_value}{kr.unit ? ` ${kr.unit}` : ''}
                      </Badge>
                    )}
                    {kr.persisted && typeof kr.progress === 'number' && (
                      <span className="text-[10px] text-gray-400 flex-shrink-0">{kr.progress}%</span>
                    )}
                    {kr.persisted && (
                      <button
                        type="button"
                        onClick={() => setExpandedKR(expandedKR === kr.id ? null : kr.id)}
                        className="text-gray-400 hover:text-blue-600 transition-colors flex-shrink-0"
                        title="Tareas del KR"
                      >
                        {expandedKR === kr.id ? <ChevronUp className="h-3.5 w-3.5" /> : <ListChecks className="h-3.5 w-3.5" />}
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => handleRemoveKR(kr.id)}
                      className="opacity-0 group-hover:opacity-100 text-red-400 hover:text-red-600 transition-opacity flex-shrink-0"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                  {kr.persisted && expandedKR === kr.id && (
                    <KeyResultTasks krId={kr.id} krTitle={kr.title} users={users} onChanged={refreshKRs} />
                  )}
                </div>
              ))}
              <div className="flex gap-2">
                <Input
                  placeholder="Ej: Ventas mensuales"
                  value={newKR}
                  onChange={(e) => setNewKR(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleAddKR(); } }}
                  className="flex-1 text-sm bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-700"
                />
                <Input
                  placeholder="Meta"
                  type="number"
                  value={newKRTarget}
                  onChange={(e) => setNewKRTarget(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleAddKR(); } }}
                  className="w-20 text-sm bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-700"
                />
                <Input
                  placeholder="Un."
                  value={newKRUnit}
                  onChange={(e) => setNewKRUnit(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleAddKR(); } }}
                  className="w-16 text-sm bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-700"
                />
                <Button type="button" variant="outline" size="icon" onClick={handleAddKR} className="h-9 w-9 flex-shrink-0">
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
        </div>

        {/* Tareas de la meta (solo edición) */}
        {isEdit && (
          <>
            <div className="border-t border-gray-100 dark:border-gray-800" />
            <div>
              <div className="flex items-center gap-2 mb-3 text-sm font-medium text-gray-700 dark:text-gray-300">
                <ListChecks className="h-4 w-4" />
                Tareas de la meta
                {relatedTasks.length > 0 && <Badge variant="secondary" className="text-xs px-1.5 py-0">{relatedTasks.length}</Badge>}
              </div>
              <RelatedTasksList tasks={relatedTasks} loading={loadingTasks} show="project" emptyLabel="Aún no hay tareas vinculadas a esta meta." />
            </div>
          </>
        )}
      </div>

      {/* Footer */}
      <div className="px-5 py-4 border-t border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 flex gap-2 flex-shrink-0">
        {isEdit ? (
          <Button variant="outline" onClick={handleDelete} disabled={deleting} className="text-red-600 border-red-200 hover:bg-red-50 hover:text-red-700 dark:border-red-900/40">
            {deleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
          </Button>
        ) : (
          <Button variant="outline" onClick={() => { resetForm(); onClose(); }} className="flex-1">
            Cancelar
          </Button>
        )}
        <Button
          onClick={handleCreate}
          disabled={creating || !form.title.trim()}
          className="flex-1 bg-blue-600 hover:bg-blue-700 text-white"
        >
          {creating ? (
            <><Loader2 className="h-4 w-4 mr-1.5 animate-spin" />{isEdit ? 'Guardando...' : 'Creando...'}</>
          ) : (
            isEdit ? 'Guardar Cambios' : 'Crear Meta'
          )}
        </Button>
      </div>
    </div>
  );

  return (
    <Sheet open={isOpen} onOpenChange={(open) => { if (!open) { resetForm(); onClose(); } }}>
      <SheetContent
        side="right"
        className="w-full sm:max-w-2xl lg:max-w-3xl p-0 border-0 bg-white dark:bg-gray-900 [&>button:last-child]:hidden"
      >
        <VisuallyHidden.Root>
          <SheetTitle>{isEdit ? 'Editar Meta' : 'Nueva Meta'}</SheetTitle>
        </VisuallyHidden.Root>
        {renderContent()}
      </SheetContent>
    </Sheet>
  );
}
