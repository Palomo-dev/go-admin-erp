'use client';

import { useState, useEffect, useCallback } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { toast } from '@/components/ui/use-toast';
import type {
  DiscoveryTemplate,
  DiscoveryData,
  DiscoveryQuestion,
} from '@/lib/services/crm/discoveryService';
import {
  Loader2,
  ChevronLeft,
  ChevronRight,
  CheckCircle2,
  Save,
  FileText,
  RefreshCw,
} from 'lucide-react';

// ─── Tipos locales ───────────────────────────────────────────────────────────

interface DiscoveryWizardProps {
  /** ID de la oportunidad sobre la que se ejecuta el discovery. */
  opportunityId: string;
  /** Callback opcional al finalizar el discovery. */
  onComplete?: () => void;
}

interface ApiResponse<T> {
  success: boolean;
  data: T;
  error?: string;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Cuenta cuántas preguntas obligatorias tienen respuesta. */
function countAnsweredRequired(data: DiscoveryData | null, template: DiscoveryTemplate | null): {
  answered: number;
  total: number;
} {
  if (!template || !data) return { answered: 0, total: 0 };
  let total = 0;
  let answered = 0;
  template.sections.forEach((section) => {
    section.questions.forEach((q) => {
      if (q.required) {
        total += 1;
        const sec = data.sections.find((s) => s.sectionId === section.id);
        const ans = sec?.answers.find((a) => a.questionId === q.id);
        if (ans && ans.value != null && String(ans.value).trim() !== '') {
          answered += 1;
        }
      }
    });
  });
  return { answered, total };
}

// ─── Componente ──────────────────────────────────────────────────────────────

export function DiscoveryWizard({ opportunityId, onComplete }: DiscoveryWizardProps) {
  const [templates, setTemplates] = useState<DiscoveryTemplate[]>([]);
  const [selectedTemplate, setSelectedTemplate] = useState<DiscoveryTemplate | null>(null);
  const [discoveryData, setDiscoveryData] = useState<DiscoveryData | null>(null);
  const [currentStep, setCurrentStep] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isCompleting, setIsCompleting] = useState(false);
  const [hasExistingData, setHasExistingData] = useState(false);

  // ─── Carga inicial: templates + discovery_data existente ─────────────────
  const loadInitial = useCallback(async () => {
    setIsLoading(true);
    try {
      const [tplRes, dataRes] = await Promise.all([
        fetch('/api/crm/discovery/templates', { cache: 'no-store' }),
        fetch(`/api/crm/discovery/${opportunityId}`, { cache: 'no-store' }),
      ]);

      const tplJson: ApiResponse<DiscoveryTemplate[]> = await tplRes.json();
      const dataJson: ApiResponse<DiscoveryData | null> = await dataRes.json();

      if (tplJson.success) setTemplates(tplJson.data || []);

      if (dataJson.success && dataJson.data) {
        setDiscoveryData(dataJson.data);
        setHasExistingData(true);
        // Si hay data, buscar el template correspondiente para mostrar preguntas
        if (dataJson.data.templateId) {
          const tpl = (tplJson.data || []).find((t) => t.id === dataJson.data!.templateId);
          if (tpl) setSelectedTemplate(tpl);
        }
      }
    } catch (err) {
      console.error('Error cargando discovery:', err);
      toast({
        title: 'Error',
        description: 'No se pudieron cargar los datos de discovery',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  }, [opportunityId]);

  useEffect(() => {
    loadInitial();
  }, [loadInitial]);

  // ─── Selección de template: inicializa discovery_data ────────────────────
  const handleSelectTemplate = async (templateId: string) => {
    const tpl = templates.find((t) => t.id === templateId);
    if (!tpl) return;

    setIsLoading(true);
    try {
      // Si ya hay data con este template, no reinicializar
      if (discoveryData?.templateId === templateId) {
        setSelectedTemplate(tpl);
        setCurrentStep(0);
        return;
      }

      // Inicializar discovery_data desde el template vía API
      const res = await fetch(
        `/api/crm/discovery/${opportunityId}?templateId=${templateId}`,
        { cache: 'no-store' }
      );
      const json: ApiResponse<DiscoveryData> = await res.json();
      if (!json.success) throw new Error(json.error || 'Error al inicializar discovery');

      setSelectedTemplate(tpl);
      setDiscoveryData(json.data);
      setHasExistingData(true);
      setCurrentStep(0);
      toast({
        title: 'Template seleccionado',
        description: `Discovery iniciado con "${tpl.name}"`,
      });
    } catch (err) {
      console.error('Error al seleccionar template:', err);
      toast({
        title: 'Error',
        description: 'No se pudo inicializar el discovery',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  // ─── Actualizar respuesta de una pregunta ────────────────────────────────
  const updateAnswer = (sectionId: string, questionId: string, value: unknown) => {
    if (!discoveryData) return;
    const updated: DiscoveryData = {
      ...discoveryData,
      sections: discoveryData.sections.map((sec) => {
        if (sec.sectionId !== sectionId) return sec;
        return {
          ...sec,
          answers: sec.answers.map((ans) =>
            ans.questionId === questionId ? { ...ans, value } : ans
          ),
        };
      }),
      updatedAt: new Date().toISOString(),
    };
    setDiscoveryData(updated);
  };

  const getAnswer = (sectionId: string, questionId: string): unknown => {
    if (!discoveryData) return null;
    const sec = discoveryData.sections.find((s) => s.sectionId === sectionId);
    const ans = sec?.answers.find((a) => a.questionId === questionId);
    return ans?.value ?? null;
  };

  // ─── Guardar progreso (PUT) ──────────────────────────────────────────────
  const handleSave = async (silent = false) => {
    if (!discoveryData) return;
    setIsSaving(true);
    try {
      const res = await fetch(`/api/crm/discovery/${opportunityId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(discoveryData),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error || 'Error al guardar');

      if (!silent) {
        toast({ title: 'Progreso guardado' });
      }
    } catch (err) {
      console.error('Error al guardar discovery:', err);
      toast({
        title: 'Error',
        description: 'No se pudo guardar el progreso',
        variant: 'destructive',
      });
    } finally {
      setIsSaving(false);
    }
  };

  // ─── Finalizar discovery ─────────────────────────────────────────────────
  const handleComplete = async () => {
    if (!discoveryData) return;
    setIsCompleting(true);
    try {
      const finalData: DiscoveryData = {
        ...discoveryData,
        completedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      const res = await fetch(`/api/crm/discovery/${opportunityId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(finalData),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error || 'Error al finalizar');

      setDiscoveryData(finalData);
      toast({
        title: 'Discovery finalizado',
        description: 'Las respuestas se guardaron correctamente',
      });
      onComplete?.();
    } catch (err) {
      console.error('Error al finalizar discovery:', err);
      toast({
        title: 'Error',
        description: 'No se pudo finalizar el discovery',
        variant: 'destructive',
      });
    } finally {
      setIsCompleting(false);
    }
  };

  // ─── Navegación entre steps ──────────────────────────────────────────────
  const totalSteps = selectedTemplate?.sections.length ?? 0;
  const isLastStep = currentStep === totalSteps - 1;
  const isFirstStep = currentStep === 0;
  const progressValue = totalSteps > 0 ? ((currentStep + 1) / totalSteps) * 100 : 0;

  const { answered, total } = countAnsweredRequired(discoveryData, selectedTemplate);
  const canComplete = total === 0 || answered === total;

  const currentSection = selectedTemplate?.sections[currentStep] ?? null;
  const isCompleted = !!discoveryData?.completedAt;

  // ─── Render ──────────────────────────────────────────────────────────────
  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-6 w-full" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2">
            <FileText className="h-5 w-5 text-blue-500" />
            Discovery
          </h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
            Completa el cuestionario de discovery para esta oportunidad
          </p>
        </div>
        {discoveryData && (
          <div className="flex items-center gap-2">
            {isCompleted && (
              <Badge className="bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300 border-green-200 dark:border-green-800">
                <CheckCircle2 className="h-3 w-3 mr-0.5" />
                Completado
              </Badge>
            )}
            <Button
              variant="outline"
              size="sm"
              onClick={() => handleSave(false)}
              disabled={isSaving}
              className="h-8"
            >
              {isSaving ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Save className="h-3.5 w-3.5" />
              )}
              Guardar
            </Button>
          </div>
        )}
      </div>

      {/* Selector de template (si no hay data) */}
      {!discoveryData && (
        <Card className="p-6 bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-700">
          {templates.length === 0 ? (
            <div className="flex flex-col items-center justify-center text-center py-8">
              <div className="w-12 h-12 rounded-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center mb-3">
                <FileText className="h-6 w-6 text-gray-400" />
              </div>
              <p className="text-sm text-gray-500 dark:text-gray-400 mb-1">
                No hay templates de discovery activos.
              </p>
              <p className="text-xs text-gray-400">
                Crea un template desde la configuración de CRM para comenzar.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label className="text-gray-700 dark:text-gray-300">
                  Selecciona un template de discovery
                </Label>
                <Select onValueChange={handleSelectTemplate}>
                  <SelectTrigger className="bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-700">
                    <SelectValue placeholder="Elige un template..." />
                  </SelectTrigger>
                  <SelectContent className="bg-white dark:bg-gray-800">
                    {templates.map((tpl) => (
                      <SelectItem key={tpl.id} value={tpl.id}>
                        {tpl.name}
                        {tpl.vertical_id && ` (${tpl.vertical_id})`}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}
        </Card>
      )}

      {/* Wizard de discovery */}
      {discoveryData && selectedTemplate && currentSection && (
        <>
          {/* Info del template + progreso */}
          <Card className="p-4 bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-700">
            <div className="flex items-center justify-between flex-wrap gap-2 mb-3">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                  {selectedTemplate.name}
                </span>
                <Badge variant="secondary" className="text-[10px]">
                  {totalSteps} secciones
                </Badge>
              </div>
              <span className="text-xs text-gray-500 dark:text-gray-400">
                Paso {currentStep + 1} de {totalSteps}
                {total > 0 && ` · ${answered}/${total} obligatorias`}
              </span>
            </div>
            <Progress value={progressValue} className="h-2" indicatorClassName="bg-blue-600" />
          </Card>

          {/* Indicador de steps */}
          <div className="flex gap-1 flex-wrap">
            {selectedTemplate.sections.map((section, idx) => {
              const secData = discoveryData.sections.find((s) => s.sectionId === section.id);
              const secAnswered = secData
                ? secData.answers.filter((a) => a.value != null && String(a.value).trim() !== '').length
                : 0;
              const secTotal = section.questions.length;
              const isFullyAnswered = secAnswered === secTotal && secTotal > 0;
              return (
                <button
                  key={section.id}
                  onClick={() => setCurrentStep(idx)}
                  className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium transition-colors ${
                    idx === currentStep
                      ? 'bg-blue-600 text-white'
                      : isFullyAnswered
                        ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300'
                        : 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700'
                  }`}
                >
                  {isFullyAnswered && idx !== currentStep ? (
                    <CheckCircle2 className="h-3 w-3" />
                  ) : (
                    <span className="w-3 text-center">{idx + 1}</span>
                  )}
                  <span className="truncate max-w-[120px]">{section.title}</span>
                </button>
              );
            })}
          </div>

          {/* Preguntas del step actual */}
          <Card className="p-4 sm:p-6 bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-700">
            <h3 className="text-base font-semibold text-gray-900 dark:text-white mb-4">
              {currentSection.title}
            </h3>
            <div className="space-y-5">
              {currentSection.questions.map((question) => (
                <QuestionField
                  key={question.id}
                  question={question}
                  value={getAnswer(currentSection.id, question.id)}
                  onChange={(val) => updateAnswer(currentSection.id, question.id, val)}
                />
              ))}
            </div>
          </Card>

          {/* Navegación */}
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <Button
              variant="outline"
              onClick={() => setCurrentStep((s) => Math.max(0, s - 1))}
              disabled={isFirstStep}
              className="border-gray-200 dark:border-gray-700"
            >
              <ChevronLeft className="h-4 w-4" />
              Anterior
            </Button>

            <div className="flex items-center gap-2">
              {!isCompleted && (
                <Button
                  variant="outline"
                  onClick={() => handleSave(false)}
                  disabled={isSaving}
                  className="border-gray-200 dark:border-gray-700"
                >
                  {isSaving ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Save className="h-4 w-4" />
                  )}
                  Guardar progreso
                </Button>
              )}

              {isLastStep ? (
                <Button
                  onClick={handleComplete}
                  disabled={isCompleting || (!canComplete && !isCompleted)}
                  className="bg-green-600 hover:bg-green-700 text-white"
                >
                  {isCompleting ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin mr-1" />
                      Finalizando...
                    </>
                  ) : isCompleted ? (
                    <>
                      <CheckCircle2 className="h-4 w-4 mr-1" />
                      Discovery completado
                    </>
                  ) : (
                    <>
                      <CheckCircle2 className="h-4 w-4 mr-1" />
                      Finalizar discovery
                    </>
                  )}
                </Button>
              ) : (
                <Button
                  onClick={() => {
                    setCurrentStep((s) => Math.min(totalSteps - 1, s + 1));
                    handleSave(true);
                  }}
                  className="bg-blue-600 hover:bg-blue-700 text-white"
                >
                  Siguiente
                  <ChevronRight className="h-4 w-4" />
                </Button>
              )}
            </div>
          </div>

          {/* Reiniciar / cambiar template */}
          {hasExistingData && !isCompleted && (
            <div className="flex justify-center pt-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={loadInitial}
                className="text-xs text-gray-400 hover:text-gray-600"
              >
                <RefreshCw className="h-3 w-3 mr-1" />
                Recargar datos guardados
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ─── Sub-componente: render de una pregunta ──────────────────────────────────

interface QuestionFieldProps {
  question: DiscoveryQuestion;
  value: unknown;
  onChange: (value: unknown) => void;
}

function QuestionField({ question, value, onChange }: QuestionFieldProps) {
  const strValue = value == null ? '' : String(value);

  if (question.type === 'textarea') {
    return (
      <div className="space-y-1.5">
        <Label className="text-sm font-medium text-gray-700 dark:text-gray-300">
          {question.label}
          {question.required && <span className="text-red-500 ml-0.5">*</span>}
        </Label>
        <Textarea
          value={strValue}
          onChange={(e) => onChange(e.target.value)}
          placeholder={question.placeholder || 'Escribe tu respuesta...'}
          className="bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-700"
          rows={3}
        />
      </div>
    );
  }

  if (question.type === 'number') {
    return (
      <div className="space-y-1.5">
        <Label className="text-sm font-medium text-gray-700 dark:text-gray-300">
          {question.label}
          {question.required && <span className="text-red-500 ml-0.5">*</span>}
        </Label>
        <Input
          type="number"
          value={strValue}
          onChange={(e) => onChange(e.target.value === '' ? null : Number(e.target.value))}
          placeholder={question.placeholder || '0'}
          className="bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-700"
        />
      </div>
    );
  }

  if (question.type === 'boolean') {
    const boolValue = value === true || value === 'true';
    return (
      <div className="space-y-1.5">
        <Label className="text-sm font-medium text-gray-700 dark:text-gray-300">
          {question.label}
          {question.required && <span className="text-red-500 ml-0.5">*</span>}
        </Label>
        <Select
          value={boolValue ? 'true' : value === false || value === 'false' ? 'false' : ''}
          onValueChange={(v) => onChange(v === 'true')}
        >
          <SelectTrigger className="bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-700">
            <SelectValue placeholder="Selecciona..." />
          </SelectTrigger>
          <SelectContent className="bg-white dark:bg-gray-800">
            <SelectItem value="true">Sí</SelectItem>
            <SelectItem value="false">No</SelectItem>
          </SelectContent>
        </Select>
      </div>
    );
  }

  if (question.type === 'select') {
    return (
      <div className="space-y-1.5">
        <Label className="text-sm font-medium text-gray-700 dark:text-gray-300">
          {question.label}
          {question.required && <span className="text-red-500 ml-0.5">*</span>}
        </Label>
        <Select value={strValue} onValueChange={onChange}>
          <SelectTrigger className="bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-700">
            <SelectValue placeholder={question.placeholder || 'Selecciona...'} />
          </SelectTrigger>
          <SelectContent className="bg-white dark:bg-gray-800">
            {(question.options || []).map((opt) => (
              <SelectItem key={opt} value={opt}>
                {opt}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    );
  }

  if (question.type === 'multiselect') {
    const selected = Array.isArray(value) ? (value as string[]) : [];
    const toggle = (opt: string) => {
      const next = selected.includes(opt)
        ? selected.filter((o) => o !== opt)
        : [...selected, opt];
      onChange(next);
    };
    return (
      <div className="space-y-1.5">
        <Label className="text-sm font-medium text-gray-700 dark:text-gray-300">
          {question.label}
          {question.required && <span className="text-red-500 ml-0.5">*</span>}
        </Label>
        <div className="flex flex-wrap gap-2">
          {(question.options || []).map((opt) => {
            const isSelected = selected.includes(opt);
            return (
              <button
                key={opt}
                type="button"
                onClick={() => toggle(opt)}
                className={`px-3 py-1.5 rounded-md text-xs font-medium border transition-colors ${
                  isSelected
                    ? 'bg-blue-600 text-white border-blue-600'
                    : 'bg-white dark:bg-gray-900 text-gray-600 dark:text-gray-300 border-gray-200 dark:border-gray-700 hover:border-blue-400'
                }`}
              >
                {opt}
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  // Default: text
  return (
    <div className="space-y-1.5">
      <Label className="text-sm font-medium text-gray-700 dark:text-gray-300">
        {question.label}
        {question.required && <span className="text-red-500 ml-0.5">*</span>}
      </Label>
      <Input
        value={strValue}
        onChange={(e) => onChange(e.target.value)}
        placeholder={question.placeholder || 'Escribe tu respuesta...'}
        className="bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-700"
      />
    </div>
  );
}

export default DiscoveryWizard;
