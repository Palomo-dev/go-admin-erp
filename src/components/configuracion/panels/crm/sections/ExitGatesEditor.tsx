'use client';

import { useState, useEffect, useCallback } from 'react';
import { useToast } from '@/components/ui/use-toast';
import { getOrganizationId } from '@/lib/hooks/useOrganization';
import { supabase } from '@/lib/supabase/config';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from '@/components/ui/dialog';
import { Plus, Trash2, RefreshCw, CheckSquare, ListChecks, ExternalLink } from 'lucide-react';
import { type StageRequirement, type ExitCriteria } from '@/lib/services/crm/stageGateService';
import { getDefaultPipeline } from '@/lib/services/kanbanService';

interface StageWithCriteria {
  id: string;
  name: string;
  position: number;
  probability: number | null;
  color: string | null;
  exit_criteria: ExitCriteria | null;
}

export function ExitGatesEditor() {
  const { toast } = useToast();
  const orgId = getOrganizationId();

  const [stages, setStages] = useState<StageWithCriteria[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingStage, setEditingStage] = useState<StageWithCriteria | null>(null);

  const loadStages = useCallback(async () => {
    if (!orgId) return;
    setLoading(true);
    try {
      // Obtener el pipeline por defecto de la organizacion
      const pipeline = await getDefaultPipeline(orgId);
      if (!pipeline) {
        setStages([]);
        setLoading(false);
        return;
      }

      // Obtener las etapas del pipeline con exit_criteria
      const { data, error } = await supabase
        .from('stages')
        .select('id, name, position, probability, color, exit_criteria')
        .eq('pipeline_id', pipeline.id)
        .order('position');

      if (error) throw error;

      const stageData: StageWithCriteria[] = (data || []).map((s) => ({
        id: s.id,
        name: s.name,
        position: s.position,
        probability: s.probability,
        color: s.color,
        exit_criteria: (s as { exit_criteria?: ExitCriteria }).exit_criteria || null,
      }));
      setStages(stageData);
    } catch (error) {
      console.error('Error cargando etapas con criterios:', error);
      toast({ title: 'Error', description: 'No se pudieron cargar las etapas', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }, [orgId, toast]);

  useEffect(() => {
    loadStages();
  }, [loadStages]);

  const handleEditCriteria = (stage: StageWithCriteria) => {
    const criteria: ExitCriteria = stage.exit_criteria
      ? { requirements: [...stage.exit_criteria.requirements] }
      : { requirements: [] };
    setEditingStage({ ...stage, exit_criteria: criteria });
    setDialogOpen(true);
  };

  const addRequirement = () => {
    if (!editingStage?.exit_criteria) return;
    setEditingStage((prev) => {
      if (!prev?.exit_criteria) return prev;
      return {
        ...prev,
        exit_criteria: {
          requirements: [
            ...prev.exit_criteria.requirements,
            { type: 'field', field: '', message: '' },
          ],
        },
      };
    });
  };

  const updateRequirement = (index: number, updates: Partial<StageRequirement>) => {
    if (!editingStage?.exit_criteria) return;
    setEditingStage((prev) => {
      if (!prev?.exit_criteria) return prev;
      return {
        ...prev,
        exit_criteria: {
          requirements: prev.exit_criteria.requirements.map((req, i) =>
            i === index ? { ...req, ...updates } : req
          ),
        },
      };
    });
  };

  const removeRequirement = (index: number) => {
    if (!editingStage?.exit_criteria) return;
    setEditingStage((prev) => {
      if (!prev?.exit_criteria) return prev;
      return {
        ...prev,
        exit_criteria: {
          requirements: prev.exit_criteria.requirements.filter((_, i) => i !== index),
        },
      };
    });
  };

  const handleSaveCriteria = async () => {
    if (!editingStage?.exit_criteria) return;
    setSaving(true);
    try {
      const { error } = await supabase
        .from('stages')
        .update({
          exit_criteria: editingStage.exit_criteria as unknown as Record<string, unknown>,
          updated_at: new Date().toISOString(),
        })
        .eq('id', editingStage.id);

      if (error) throw error;

      toast({ title: 'Criterios guardados', description: `Criterios de salida para "${editingStage.name}" actualizados` });
      setDialogOpen(false);
      loadStages();
    } catch (error) {
      console.error('Error guardando criterios:', error);
      toast({ title: 'Error', description: 'No se pudieron guardar los criterios', variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const handleOpenStageManager = () => {
    window.open('/app/crm/pipeline?tab=stages', '_blank');
  };

  if (loading) {
    return (
      <div className="space-y-3">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="h-20 rounded-lg border border-gray-200 dark:border-gray-700 animate-pulse bg-gray-100 dark:bg-gray-800" />
        ))}
      </div>
    );
  }

  const reqTypeLabels: Record<string, string> = {
    activity: 'Actividad',
    field: 'Campo',
    quotation: 'Cotizacion',
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <ListChecks className="h-5 w-5 text-muted-foreground" />
          <div>
            <p className="text-sm font-medium text-gray-900 dark:text-white">
              {stages.length} etapa{stages.length !== 1 ? 's' : ''}
            </p>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              Define los criterios de salida para avanzar oportunidades
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={handleOpenStageManager}>
            <ExternalLink className="h-4 w-4 mr-1" />
            Stage Manager
          </Button>
          <Button variant="outline" size="sm" onClick={loadStages} disabled={loading}>
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          </Button>
        </div>
      </div>

      {stages.length === 0 ? (
        <div className="text-center py-12">
          <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center">
            <ListChecks className="h-8 w-8 text-gray-400" />
          </div>
          <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">No hay etapas configuradas</h3>
          <p className="text-gray-500 dark:text-gray-400 mb-4">
            Abre el Stage Manager para crear etapas en tu pipeline
          </p>
          <Button onClick={handleOpenStageManager}>
            <ExternalLink className="h-4 w-4 mr-2" />
            Abrir Stage Manager
          </Button>
        </div>
      ) : (
        <div className="space-y-2">
          {stages.map((stage) => {
            const reqCount = stage.exit_criteria?.requirements?.length || 0;
            return (
              <Card key={stage.id} className="border-gray-200 dark:border-gray-700">
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div
                        className="w-3 h-3 rounded-full shrink-0"
                        style={{ backgroundColor: stage.color || '#3b82f6' }}
                      />
                      <CardTitle className="text-sm">{stage.name}</CardTitle>
                      <Badge variant="secondary" className="text-xs">
                        {stage.probability != null ? `${stage.probability}%` : 'N/A'}
                      </Badge>
                    </div>
                    <Button variant="ghost" size="sm" onClick={() => handleEditCriteria(stage)}>
                      <CheckSquare className="h-4 w-4 mr-1" />
                      {reqCount > 0 ? `${reqCount} criterio${reqCount !== 1 ? 's' : ''}` : 'Sin criterios'}
                    </Button>
                  </div>
                </CardHeader>
                {reqCount > 0 && (
                  <CardContent className="pt-0 pb-3">
                    <ul className="space-y-1 ml-5">
                      {stage.exit_criteria!.requirements.map((req, i) => (
                        <li key={i} className="text-xs text-gray-600 dark:text-gray-400 flex items-start gap-1.5">
                          <span className="text-gray-400 mt-0.5">•</span>
                          <span>
                            <Badge variant="outline" className="text-xs mr-1">{reqTypeLabels[req.type] || req.type}</Badge>
                            {req.message || req.field || (req.type === 'activity' ? `Min. ${req.minCount || 1} actividad(es)` : '')}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </CardContent>
                )}
              </Card>
            );
          })}
        </div>
      )}

      {/* Dialog editar criterios */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Criterios de salida - {editingStage?.name}</DialogTitle>
            <DialogDescription>
              Define que debe cumplirse para avanzar oportunidades desde esta etapa
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            {/* Lista de requisitos actuales */}
            <div className="space-y-2">
              {editingStage?.exit_criteria?.requirements && editingStage.exit_criteria.requirements.length > 0 ? (
                editingStage.exit_criteria.requirements.map((req, index) => (
                  <div key={index} className="flex items-start gap-2 p-3 rounded-lg border border-gray-200 dark:border-gray-700">
                    <div className="flex-1 space-y-2">
                      <div className="flex items-center gap-2">
                        <Label className="text-xs text-gray-500">Tipo</Label>
                        <select
                          value={req.type}
                          onChange={(e) => updateRequirement(index, { type: e.target.value as StageRequirement['type'] })}
                          className="text-sm border border-gray-200 dark:border-gray-700 rounded px-2 py-1 bg-white dark:bg-gray-900"
                        >
                          <option value="activity">Actividad</option>
                          <option value="field">Campo</option>
                          <option value="quotation">Cotizacion</option>
                        </select>
                      </div>
                      {req.type === 'activity' && (
                        <div className="flex items-center gap-2">
                          <Label className="text-xs text-gray-500">Min. actividades</Label>
                          <Input
                            type="number"
                            value={req.minCount ?? 1}
                            onChange={(e) => updateRequirement(index, { minCount: Number(e.target.value) })}
                            className="w-24"
                            min={1}
                          />
                        </div>
                      )}
                      {req.type === 'field' && (
                        <div className="flex items-center gap-2">
                          <Label className="text-xs text-gray-500">Campo</Label>
                          <Input
                            value={req.field || ''}
                            onChange={(e) => updateRequirement(index, { field: e.target.value })}
                            placeholder="Ej: company_name, amount..."
                            className="flex-1"
                          />
                        </div>
                      )}
                      <div className="flex items-center gap-2">
                        <Label className="text-xs text-gray-500">Mensaje</Label>
                        <Input
                          value={req.message || ''}
                          onChange={(e) => updateRequirement(index, { message: e.target.value })}
                          placeholder="Mensaje a mostrar si no se cumple"
                          className="flex-1"
                        />
                      </div>
                    </div>
                    <Button variant="ghost" size="icon" onClick={() => removeRequirement(index)}>
                      <Trash2 className="h-4 w-4 text-red-500" />
                    </Button>
                  </div>
                ))
              ) : (
                <p className="text-sm text-gray-500 dark:text-gray-400 text-center py-4">
                  No hay criterios definidos para esta etapa
                </p>
              )}
            </div>

            {/* Agregar nuevo requisito */}
            <Button variant="outline" size="sm" onClick={addRequirement}>
              <Plus className="h-4 w-4 mr-1" />
              Agregar requisito
            </Button>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancelar</Button>
            <Button onClick={handleSaveCriteria} disabled={saving}>
              {saving ? 'Guardando...' : 'Guardar Criterios'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
