'use client';

import React, { useState, useCallback, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Separator } from '@/components/ui/separator';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Sparkles,
  Loader2,
  Plus,
  CheckCircle,
  Clock,
  Target,
  AlertTriangle,
  FolderKanban,
  ChevronDown,
  ChevronRight,
  Send,
  Wand2,
} from 'lucide-react';
import { pmService, type PMTask } from '@/lib/services/pmService';
import { useToast } from '@/components/ui/use-toast';

interface AIGeneratedTask {
  title: string;
  description: string;
  priority: 'low' | 'med' | 'high' | 'critical';
  type: string;
  estimated_hours: number;
  due_date: string;
  subtasks: Array<{
    title: string;
    description: string;
    estimated_hours: number;
    due_date: string;
    priority: 'low' | 'med' | 'high' | 'critical';
  }>;
  selected: boolean;
}

interface AITaskPlannerProps {
  projectId?: string;
  onTasksCreated?: () => void;
}

const PRIORITY_COLORS: Record<string, string> = {
  low: 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300',
  med: 'bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-300',
  high: 'bg-orange-100 text-orange-600 dark:bg-orange-900/30 dark:text-orange-300',
  critical: 'bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-300',
};

const PRIORITY_LABELS: Record<string, string> = {
  low: 'Baja', med: 'Media', high: 'Alta', critical: 'Crítica',
};

const EXAMPLE_PROMPTS = [
  'Crear un sitio web corporativo con landing page, blog y formulario de contacto. Fecha límite: 2 semanas. Prioridad alta.',
  'Organizar evento de lanzamiento de producto. Incluye logística, marketing digital, invitaciones VIP. 1 mes de plazo.',
  'Migrar base de datos de MySQL a PostgreSQL. Incluir backup, testing, rollback plan. Prioridad crítica, 5 días.',
  'Rediseño de app móvil: wireframes, diseño UI, prototipo interactivo, tests de usabilidad. 3 semanas.',
];

export function AITaskPlanner({ projectId, onTasksCreated }: AITaskPlannerProps) {
  const [prompt, setPrompt] = useState('');
  const [generating, setGenerating] = useState(false);
  const [creating, setCreating] = useState(false);
  const [generatedTasks, setGeneratedTasks] = useState<AIGeneratedTask[]>([]);
  const [expandedTasks, setExpandedTasks] = useState<Set<number>>(new Set());
  const [goals, setGoals] = useState<Array<{ id: string; title: string }>>([]);
  const [selectedGoalId, setSelectedGoalId] = useState<string>('');
  const [autoAssign, setAutoAssign] = useState(false);
  const { toast } = useToast();

  // Cargar metas para poder vincular las tareas generadas a una meta
  useEffect(() => {
    pmService.getGoals().then(gs => setGoals(gs.map(g => ({ id: g.id, title: g.title }))));
  }, []);

  const generateWithAI = useCallback(async () => {
    if (!prompt.trim()) return;

    setGenerating(true);
    setGeneratedTasks([]);
    try {
      const response = await fetch('/api/ai-assistant/pm-planner', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: prompt.trim(), projectId }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        if (response.status === 429) {
          throw new Error('Cuota de OpenAI agotada. Revisa el plan y facturación en platform.openai.com.');
        }
        if (response.status === 401) {
          throw new Error('Clave de API de OpenAI inválida o no configurada. Contacta al administrador.');
        }
        throw new Error(errorData.error || 'Error generando plan con IA');
      }

      const data = await response.json();
      const tasks = (data.tasks || []).map((t: any) => ({ ...t, selected: true }));
      setGeneratedTasks(tasks);

      if (tasks.length === 0) {
        toast({ title: 'Sin resultados', description: 'La IA no generó tareas. Intenta ser más específico.', variant: 'destructive' });
      }
    } catch (error: any) {
      console.error('Error IA:', error);
      toast({ title: 'Error', description: error.message || 'No se pudo generar el plan', variant: 'destructive' });
    } finally {
      setGenerating(false);
    }
  }, [prompt, projectId, toast]);

  const toggleTask = (index: number) => {
    setGeneratedTasks(prev => prev.map((t, i) => i === index ? { ...t, selected: !t.selected } : t));
  };

  const toggleExpand = (index: number) => {
    setExpandedTasks(prev => {
      const next = new Set(prev);
      next.has(index) ? next.delete(index) : next.add(index);
      return next;
    });
  };

  const selectAll = () => {
    const allSelected = generatedTasks.every(t => t.selected);
    setGeneratedTasks(prev => prev.map(t => ({ ...t, selected: !allSelected })));
  };

  const createSelectedTasks = async () => {
    const selected = generatedTasks.filter(t => t.selected);
    if (selected.length === 0) {
      toast({ title: 'Selecciona tareas', description: 'Selecciona al menos una tarea para crear', variant: 'destructive' });
      return;
    }

    setCreating(true);
    let created = 0;
    try {
      for (const task of selected) {
        const parentTask = await pmService.createTask({
          title: task.title,
          description: task.description,
          priority: task.priority,
          type: task.type,
          status: 'open',
          estimated_hours: task.estimated_hours,
          due_date: task.due_date,
          project_id: projectId || null,
          goal_id: selectedGoalId || null,
          tags: ['ai-generated'],
        });
        created++;

        // Crear subtareas
        if (task.subtasks?.length > 0) {
          for (const sub of task.subtasks) {
            await pmService.createTask({
              title: sub.title,
              description: sub.description,
              priority: sub.priority,
              status: 'open',
              estimated_hours: sub.estimated_hours,
              due_date: sub.due_date,
              project_id: projectId || null,
              goal_id: selectedGoalId || null,
              parent_task_id: parentTask.id,
              type: 'tarea',
              tags: ['ai-generated'],
            });
          }
        }
      }

      // Asignar automáticamente por cargo/departamento si se solicitó y hay proyecto
      let assignedMsg = '';
      if (autoAssign && projectId) {
        const n = await pmService.distributeProjectTasks(projectId);
        assignedMsg = ` · ${n} asignada(s) por cargo`;
      }
      toast({ title: 'Tareas creadas', description: `${created} tareas con sus subtareas creadas exitosamente${assignedMsg}` });
      setGeneratedTasks([]);
      setPrompt('');
      onTasksCreated?.();
    } catch (error: any) {
      toast({ title: 'Error', description: `Se crearon ${created} tareas. Error: ${error.message}`, variant: 'destructive' });
    } finally {
      setCreating(false);
    }
  };

  const totalHours = generatedTasks.filter(t => t.selected).reduce((sum, t) => {
    const subHours = (t.subtasks || []).reduce((s, sub) => s + (sub.estimated_hours || 0), 0);
    return sum + (t.estimated_hours || 0) + subHours;
  }, 0);

  return (
    <div className="space-y-4">
      {/* Input de IA */}
      <Card className="border-purple-200 dark:border-purple-800 bg-gradient-to-br from-purple-50 to-blue-50 dark:from-purple-950/20 dark:to-blue-950/20">
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <div className="p-2 bg-purple-100 dark:bg-purple-900/40 rounded-lg">
              <Sparkles className="h-5 w-5 text-purple-600 dark:text-purple-400" />
            </div>
            <div>
              <CardTitle className="text-lg">Planificador con IA</CardTitle>
              <CardDescription>Describe tu proyecto y la IA creará un plan de tareas detallado</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          <Textarea
            placeholder="Ejemplo: Necesito crear una landing page con formulario de contacto, integrar pasarela de pagos y hacer SEO básico. Tengo 2 semanas y prioridad alta..."
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            rows={4}
            className="resize-none bg-white dark:bg-gray-900 border-purple-200 dark:border-purple-700 focus:border-purple-400"
          />

          {/* Sugerencias */}
          <div className="flex flex-wrap gap-1.5">
            {EXAMPLE_PROMPTS.map((ex, i) => (
              <button
                key={i}
                onClick={() => setPrompt(ex)}
                className="text-xs px-2 py-1 rounded-full bg-white dark:bg-gray-800 border border-purple-200 dark:border-purple-700 text-purple-600 dark:text-purple-400 hover:bg-purple-50 dark:hover:bg-purple-900/20 transition-colors truncate max-w-[250px]"
              >
                {ex.slice(0, 60)}...
              </button>
            ))}
          </div>

          <div className="flex justify-end">
            <Button
              onClick={generateWithAI}
              disabled={generating || !prompt.trim()}
              className="bg-purple-600 hover:bg-purple-700 text-white gap-2"
            >
              {generating ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Generando plan...
                </>
              ) : (
                <>
                  <Wand2 className="h-4 w-4" />
                  Generar Plan con IA
                </>
              )}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Resultados */}
      {generatedTasks.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-lg">Plan Generado</CardTitle>
                <CardDescription>
                  {generatedTasks.filter(t => t.selected).length} de {generatedTasks.length} tareas seleccionadas
                  {totalHours > 0 && ` · ~${totalHours}h estimadas`}
                </CardDescription>
              </div>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" onClick={selectAll}>
                  {generatedTasks.every(t => t.selected) ? 'Deseleccionar' : 'Seleccionar'} todo
                </Button>
                <Button size="sm" onClick={createSelectedTasks} disabled={creating} className="bg-green-600 hover:bg-green-700 text-white gap-1">
                  {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                  Crear Tareas
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-2">
            {/* Opciones de asignación y vínculo a meta */}
            <div className="flex flex-wrap items-center gap-3 pb-2">
              <div className="flex items-center gap-2">
                <Label className="text-xs text-gray-500">Meta:</Label>
                <Select value={selectedGoalId || 'none'} onValueChange={(v) => setSelectedGoalId(v === 'none' ? '' : v)}>
                  <SelectTrigger className="h-8 w-[200px] text-xs"><SelectValue placeholder="Sin meta" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Sin meta</SelectItem>
                    {goals.map(g => <SelectItem key={g.id} value={g.id}>{g.title}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <label className={`flex items-center gap-2 text-xs ${projectId ? 'text-gray-600 dark:text-gray-300 cursor-pointer' : 'text-gray-400'}`}>
                <Checkbox checked={autoAssign} onCheckedChange={(c) => setAutoAssign(!!c)} disabled={!projectId} />
                Asignar automáticamente por cargo/departamento
              </label>
              {!projectId && <span className="text-[11px] text-amber-500">Selecciona un proyecto en el filtro para poder asignar.</span>}
            </div>
            {generatedTasks.map((task, index) => (
              <div key={index} className={`rounded-lg border ${task.selected ? 'border-blue-200 dark:border-blue-800 bg-blue-50/50 dark:bg-blue-950/10' : 'border-gray-200 dark:border-gray-700 opacity-60'} transition-all`}>
                <div className="flex items-start gap-3 p-3">
                  <Checkbox
                    checked={task.selected}
                    onCheckedChange={() => toggleTask(index)}
                    className="mt-1"
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h4 className="font-medium text-gray-900 dark:text-white text-sm">{task.title}</h4>
                      <Badge className={PRIORITY_COLORS[task.priority]}>{PRIORITY_LABELS[task.priority]}</Badge>
                      {task.estimated_hours > 0 && (
                        <span className="text-xs text-gray-500 flex items-center gap-1">
                          <Clock className="h-3 w-3" />{task.estimated_hours}h
                        </span>
                      )}
                      {task.due_date && (
                        <span className="text-xs text-gray-500">{new Date(task.due_date).toLocaleDateString('es-ES')}</span>
                      )}
                    </div>
                    {task.description && (
                      <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 line-clamp-2">{task.description}</p>
                    )}
                  </div>
                  {task.subtasks?.length > 0 && (
                    <button onClick={() => toggleExpand(index)} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 p-1">
                      {expandedTasks.has(index) ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                    </button>
                  )}
                </div>

                {/* Subtareas */}
                {expandedTasks.has(index) && task.subtasks?.length > 0 && (
                  <div className="px-3 pb-3 ml-8 space-y-1.5">
                    <Separator />
                    <p className="text-xs text-gray-500 font-medium pt-1">
                      {task.subtasks.length} subtareas:
                    </p>
                    {task.subtasks.map((sub, si) => (
                      <div key={si} className="flex items-center gap-2 text-xs p-2 bg-white dark:bg-gray-800 rounded border border-gray-100 dark:border-gray-700">
                        <CheckCircle className="h-3 w-3 text-gray-300 shrink-0" />
                        <span className="flex-1 text-gray-700 dark:text-gray-300">{sub.title}</span>
                        <Badge variant="outline" className="text-[10px]">{PRIORITY_LABELS[sub.priority]}</Badge>
                        {sub.estimated_hours > 0 && <span className="text-gray-400">{sub.estimated_hours}h</span>}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
