'use client';

import { useState, useEffect, useCallback } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import { toast } from '@/components/ui/use-toast';
import type { Objection, OpportunityObjection } from '@/lib/services/crm/objectionService';
import {
  RefreshCw,
  Loader2,
  Search,
  Plus,
  CheckCircle2,
  Circle,
  AlertCircle,
  MessageSquareWarning,
} from 'lucide-react';

// ─── Tipos locales ───────────────────────────────────────────────────────────

interface ObjecionesListProps {
  /** ID de la oportunidad cuyas objeciones asociadas se mostrarán. */
  opportunityId: string;
}

interface ApiListResponse<T> {
  success: boolean;
  data: T;
  error?: string;
}

// ─── Componente ──────────────────────────────────────────────────────────────

export function ObjecionesList({ opportunityId }: ObjecionesListProps) {
  const [objections, setObjections] = useState<Objection[]>([]);
  const [opportunityObjections, setOpportunityObjections] = useState<OpportunityObjection[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [selectedObjection, setSelectedObjection] = useState<Objection | null>(null);
  const [notes, setNotes] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [resolvingId, setResolvingId] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    setIsLoading(true);
    try {
      const [libRes, oppRes] = await Promise.all([
        fetch('/api/crm/objections', { cache: 'no-store' }),
        fetch(`/api/crm/objections/opportunity/${opportunityId}`, { cache: 'no-store' }),
      ]);

      const libJson: ApiListResponse<Objection[]> = await libRes.json();
      const oppJson: ApiListResponse<OpportunityObjection[]> = await oppRes.json();

      if (libJson.success) setObjections(libJson.data || []);
      if (oppJson.success) setOpportunityObjections(oppJson.data || []);
    } catch (err) {
      console.error('Error cargando objeciones:', err);
      toast({
        title: 'Error',
        description: 'No se pudieron cargar las objeciones',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  }, [opportunityId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Objeciones ya vinculadas (para filtrar de la biblioteca al añadir)
  const linkedObjectionIds = new Set(opportunityObjections.map((o) => o.objection_id));

  const filteredLibrary = objections.filter((obj) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      obj.title.toLowerCase().includes(q) ||
      (obj.category?.toLowerCase().includes(q) ?? false)
    );
  });

  const handleOpenAdd = (objection: Objection) => {
    setSelectedObjection(objection);
    setNotes('');
    setAddDialogOpen(true);
  };

  const handleConfirmAdd = async () => {
    if (!selectedObjection) return;
    setIsSaving(true);
    try {
      const res = await fetch(`/api/crm/objections/opportunity/${opportunityId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          objection_id: selectedObjection.id,
          notes: notes || null,
        }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error || 'Error al vincular objeción');

      toast({
        title: 'Objeción añadida',
        description: `"${selectedObjection.title}" vinculada a la oportunidad`,
      });
      setAddDialogOpen(false);
      setSelectedObjection(null);
      setNotes('');
      await loadData();
    } catch (err) {
      console.error('Error al vincular objeción:', err);
      toast({
        title: 'Error',
        description: 'No se pudo vincular la objeción',
        variant: 'destructive',
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleResolve = async (opportunityObjectionId: string) => {
    setResolvingId(opportunityObjectionId);
    try {
      const res = await fetch(`/api/crm/objections/opportunity/${opportunityId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ resolveId: opportunityObjectionId }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error || 'Error al resolver objeción');

      toast({ title: 'Objeción resuelta' });
      await loadData();
    } catch (err) {
      console.error('Error al resolver objeción:', err);
      toast({
        title: 'Error',
        description: 'No se pudo marcar como resuelta',
        variant: 'destructive',
      });
    } finally {
      setResolvingId(null);
    }
  };

  const resolvedCount = opportunityObjections.filter((o) => o.resolved).length;
  const pendingCount = opportunityObjections.length - resolvedCount;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2">
            <MessageSquareWarning className="h-5 w-5 text-amber-500" />
            Biblioteca de objeciones
          </h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
            Gestiona las objeciones detectadas en esta oportunidad
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={loadData}
          disabled={isLoading}
          className="h-8"
        >
          {isLoading ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <RefreshCw className="h-3.5 w-3.5" />
          )}
          Actualizar
        </Button>
      </div>

      {/* Resumen de objeciones de la oportunidad */}
      <Card className="p-4 bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-700">
        <div className="flex items-center gap-4 flex-wrap">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
              Objeciones detectadas:
            </span>
            <Badge className="bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300 border-blue-200 dark:border-blue-800">
              {opportunityObjections.length}
            </Badge>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-500 dark:text-gray-400">Pendientes:</span>
            <Badge className="bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300 border-amber-200 dark:border-amber-800">
              {pendingCount}
            </Badge>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-500 dark:text-gray-400">Resueltas:</span>
            <Badge className="bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300 border-green-200 dark:border-green-800">
              {resolvedCount}
            </Badge>
          </div>
        </div>
      </Card>

      {/* Objeciones vinculadas a la oportunidad */}
      {isLoading ? (
        <div className="space-y-2">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-20 w-full" />
          ))}
        </div>
      ) : (
        <>
          {opportunityObjections.length === 0 ? (
            <Card className="p-6 bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-700">
              <div className="flex flex-col items-center justify-center text-center">
                <div className="w-10 h-10 rounded-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center mb-2">
                  <MessageSquareWarning className="h-5 w-5 text-gray-400" />
                </div>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  Aún no se han detectado objeciones en esta oportunidad.
                </p>
              </div>
            </Card>
          ) : (
            <div className="space-y-2">
              {opportunityObjections.map((oppObj) => {
                const obj = oppObj.objection;
                return (
                  <Card
                    key={oppObj.id}
                    className="p-3 sm:p-4 bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-700"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          {oppObj.resolved ? (
                            <CheckCircle2 className="h-4 w-4 text-green-500 shrink-0" />
                          ) : (
                            <Circle className="h-4 w-4 text-amber-500 shrink-0" />
                          )}
                          <span className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                            {obj?.title || 'Objeción eliminada'}
                          </span>
                          {obj?.category && (
                            <Badge variant="secondary" className="text-[10px]">
                              {obj.category}
                            </Badge>
                          )}
                          {oppObj.resolved ? (
                            <Badge className="text-[10px] bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300 border-green-200 dark:border-green-800">
                              Resuelta
                            </Badge>
                          ) : (
                            <Badge className="text-[10px] bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300 border-amber-200 dark:border-amber-800">
                              Pendiente
                            </Badge>
                          )}
                        </div>
                        {oppObj.notes && (
                          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1.5">
                            {oppObj.notes}
                          </p>
                        )}
                        {obj?.recommended_response && (
                          <div className="mt-2 p-2 rounded-md bg-blue-50 dark:bg-blue-900/20 border border-blue-100 dark:border-blue-800">
                            <p className="text-[10px] font-medium text-blue-600 dark:text-blue-400 mb-0.5">
                              Respuesta recomendada
                            </p>
                            <p className="text-xs text-gray-600 dark:text-gray-300">
                              {obj.recommended_response}
                            </p>
                          </div>
                        )}
                      </div>
                      {!oppObj.resolved && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleResolve(oppObj.id)}
                          disabled={resolvingId === oppObj.id}
                          className="h-7 px-2 text-xs border-gray-200 dark:border-gray-700 shrink-0"
                        >
                          {resolvingId === oppObj.id ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <CheckCircle2 className="h-3.5 w-3.5" />
                          )}
                          Resolver
                        </Button>
                      )}
                    </div>
                  </Card>
                );
              })}
            </div>
          )}

          {/* Biblioteca de objeciones (para añadir) */}
          <div className="pt-2">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300">
                Añadir objeción desde la biblioteca
              </h3>
            </div>
            <div className="relative max-w-sm mb-3">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar objeción..."
                className="pl-9 bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-700"
              />
            </div>

            {filteredLibrary.length === 0 ? (
              <Card className="p-6 bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-700">
                <p className="text-sm text-gray-500 dark:text-gray-400 text-center">
                  No hay objeciones en la biblioteca{search ? ' que coincidan con la búsqueda' : ''}.
                </p>
              </Card>
            ) : (
              <Accordion type="single" collapsible className="space-y-2">
                {filteredLibrary.map((obj) => {
                  const isLinked = linkedObjectionIds.has(obj.id);
                  return (
                    <AccordionItem
                      key={obj.id}
                      value={obj.id}
                      className="border border-gray-200 dark:border-gray-700 rounded-lg px-3 bg-white dark:bg-gray-900"
                    >
                      <AccordionTrigger className="hover:no-underline py-3">
                        <div className="flex items-center gap-2 flex-1 min-w-0 text-left">
                          <AlertCircle className="h-4 w-4 text-amber-500 shrink-0" />
                          <span className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">
                            {obj.title}
                          </span>
                          {obj.category && (
                            <Badge variant="secondary" className="text-[10px] shrink-0">
                              {obj.category}
                            </Badge>
                          )}
                          {isLinked && (
                            <Badge className="text-[10px] bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300 border-green-200 dark:border-green-800 shrink-0">
                              Vinculada
                            </Badge>
                          )}
                        </div>
                      </AccordionTrigger>
                      <AccordionContent className="pb-3 pt-1">
                        <div className="space-y-2 text-xs">
                          {obj.detection_signals && obj.detection_signals.length > 0 && (
                            <div>
                              <p className="font-medium text-gray-600 dark:text-gray-300 mb-1">
                                Señales de detección:
                              </p>
                              <ul className="list-disc list-inside text-gray-500 dark:text-gray-400 space-y-0.5">
                                {obj.detection_signals.map((sig, i) => (
                                  <li key={i}>{sig}</li>
                                ))}
                              </ul>
                            </div>
                          )}
                          {obj.recommended_response && (
                            <div>
                              <p className="font-medium text-gray-600 dark:text-gray-300 mb-1">
                                Respuesta recomendada:
                              </p>
                              <p className="text-gray-500 dark:text-gray-400">
                                {obj.recommended_response}
                              </p>
                            </div>
                          )}
                          {obj.discovery_questions && obj.discovery_questions.length > 0 && (
                            <div>
                              <p className="font-medium text-gray-600 dark:text-gray-300 mb-1">
                                Preguntas de discovery:
                              </p>
                              <ul className="list-disc list-inside text-gray-500 dark:text-gray-400 space-y-0.5">
                                {obj.discovery_questions.map((q, i) => (
                                  <li key={i}>{q}</li>
                                ))}
                              </ul>
                            </div>
                          )}
                          <Button
                            size="sm"
                            onClick={() => handleOpenAdd(obj)}
                            disabled={isLinked}
                            className="h-7 px-2 text-xs mt-2 bg-blue-600 hover:bg-blue-700 text-white"
                          >
                            <Plus className="h-3.5 w-3.5" />
                            {isLinked ? 'Ya vinculada' : 'Añadir a oportunidad'}
                          </Button>
                        </div>
                      </AccordionContent>
                    </AccordionItem>
                  );
                })}
              </Accordion>
            )}
          </div>
        </>
      )}

      {/* Dialog: añadir objeción con notas */}
      <Dialog open={addDialogOpen} onOpenChange={setAddDialogOpen}>
        <DialogContent className="sm:max-w-md bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-700">
          <DialogHeader>
            <DialogTitle className="text-gray-900 dark:text-white">
              Añadir objeción
            </DialogTitle>
            <DialogDescription className="text-gray-500 dark:text-gray-400">
              Vincula la objeción{' '}
              <span className="font-semibold text-gray-700 dark:text-gray-200">
                &ldquo;{selectedObjection?.title}&rdquo;
              </span>{' '}
              a esta oportunidad.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-2">
              <Label htmlFor="objectionNotes" className="text-gray-700 dark:text-gray-300">
                Notas (opcional)
              </Label>
              <Textarea
                id="objectionNotes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Contexto en el que se detectó la objeción..."
                className="bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-700"
                rows={3}
              />
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              onClick={() => setAddDialogOpen(false)}
              className="border-gray-200 dark:border-gray-700"
            >
              Cancelar
            </Button>
            <Button
              onClick={handleConfirmAdd}
              disabled={isSaving}
              className="bg-blue-600 hover:bg-blue-700 text-white"
            >
              {isSaving ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" />
                  Guardando...
                </>
              ) : (
                <>
                  <Plus className="h-3.5 w-3.5 mr-1" />
                  Vincular
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default ObjecionesList;
