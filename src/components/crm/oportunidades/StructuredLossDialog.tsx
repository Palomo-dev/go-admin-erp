'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Loader2 } from 'lucide-react';
import type { LossReasonData } from './types';

/**
 * Razones de perdida por defecto (fallback) usadas cuando el catalogo
 * del servicio no esta disponible o no devuelve resultados.
 */
const FALLBACK_LOSS_REASONS: LossReason[] = [
  { id: 'price', label: 'Precio muy alto', code: 'price' },
  { id: 'competitor', label: 'Eligió a la competencia', code: 'competitor' },
  { id: 'features', label: 'Faltan funcionalidades', code: 'features' },
  { id: 'budget', label: 'Sin presupuesto', code: 'budget' },
  { id: 'timing', label: 'No es el momento adecuado', code: 'timing' },
  { id: 'no_response', label: 'Sin respuesta del cliente', code: 'no_response' },
  { id: 'requirements', label: 'No cumple requisitos', code: 'requirements' },
  { id: 'other', label: 'Otro motivo', code: 'other' },
];

interface LossReason {
  id: string;
  label: string;
  code?: string;
}

interface StructuredLossDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (data: LossReasonData) => void;
  isLoading?: boolean;
}

/**
 * Determina si una razon corresponde a "competitor" revisando su codigo/etiqueta.
 */
function isCompetitorReason(reason: LossReason | undefined): boolean {
  if (!reason) return false;
  const code = (reason.code || reason.id || '').toLowerCase();
  const label = (reason.label || '').toLowerCase();
  return code.includes('competitor') || label.includes('compet');
}

/**
 * Determina si una razon corresponde a "features" revisando su codigo/etiqueta.
 */
function isFeaturesReason(reason: LossReason | undefined): boolean {
  if (!reason) return false;
  const code = (reason.code || reason.id || '').toLowerCase();
  const label = (reason.label || '').toLowerCase();
  return (
    code.includes('feature') ||
    label.includes('funcionalidad') ||
    label.includes('caracteristica')
  );
}

export function StructuredLossDialog({
  open,
  onOpenChange,
  onConfirm,
  isLoading,
}: StructuredLossDialogProps) {
  const [lossReasons, setLossReasons] = useState<LossReason[]>(FALLBACK_LOSS_REASONS);
  const [isLoadingReasons, setIsLoadingReasons] = useState(false);
  const [selectedReasonId, setSelectedReasonId] = useState<string>('');
  const [competitor, setCompetitor] = useState<string>('');
  const [competitorPrice, setCompetitorPrice] = useState<string>('');
  const [missingFeatures, setMissingFeatures] = useState<string>('');
  const [recontactDate, setRecontactDate] = useState<string>('');
  const [notes, setNotes] = useState<string>('');

  // Cargar catalogo de razones de perdida desde el servicio
  const loadLossReasons = useCallback(async () => {
    setIsLoadingReasons(true);
    try {
      // Import dinamico para evitar romper el build si el servicio aun no existe
      const moduleNS = await import('@/lib/services/crm/lossReasonsService');
      const service = moduleNS.lossReasonsService || moduleNS.default;
      if (service && typeof service.list === 'function') {
        const reasons = await service.list();
        if (Array.isArray(reasons) && reasons.length > 0) {
          // Mapear a la forma local evitando conflictos de tipos con el servicio
          const rawReasons = reasons as unknown as Record<string, unknown>[];
          const mapped: LossReason[] = rawReasons
            .map((r) => ({
              id: String(r.id ?? r.code ?? ''),
              label: String(r.label ?? r.name ?? ''),
              code: r.code ? String(r.code) : undefined,
            }))
            .filter((r) => r.id);
          if (mapped.length > 0) {
            setLossReasons(mapped);
          }
        }
      }
    } catch {
      // El servicio no esta disponible: usar razones por defecto
      setLossReasons(FALLBACK_LOSS_REASONS);
    } finally {
      setIsLoadingReasons(false);
    }
  }, []);

  useEffect(() => {
    if (open) {
      loadLossReasons();
    }
  }, [open, loadLossReasons]);

  const selectedReason = lossReasons.find((r) => r.id === selectedReasonId);
  const showCompetitorFields = isCompetitorReason(selectedReason);
  const showFeaturesField = isFeaturesReason(selectedReason);

  const resetState = () => {
    setSelectedReasonId('');
    setCompetitor('');
    setCompetitorPrice('');
    setMissingFeatures('');
    setRecontactDate('');
    setNotes('');
  };

  const handleConfirm = () => {
    const reason = lossReasons.find((r) => r.id === selectedReasonId);
    const featuresArray = missingFeatures
      .split('\n')
      .map((f) => f.trim())
      .filter((f) => f.length > 0);

    const data: LossReasonData = {
      lossReasonId: selectedReasonId,
      lossReasonLabel: reason?.label || selectedReasonId,
      competitor: showCompetitorFields && competitor ? competitor : undefined,
      competitorPrice:
        showCompetitorFields && competitorPrice
          ? parseFloat(competitorPrice)
          : undefined,
      missingFeatures: showFeaturesField && featuresArray.length > 0 ? featuresArray : undefined,
      recontactDate: recontactDate || undefined,
      notes: notes || undefined,
    };

    onConfirm(data);
    resetState();
  };

  const handleCancel = () => {
    resetState();
    onOpenChange(false);
  };

  const canConfirm = !!selectedReasonId && !isLoadingReasons;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-700">
        <DialogHeader>
          <DialogTitle className="text-gray-900 dark:text-white">
            Registrar razón de pérdida
          </DialogTitle>
          <DialogDescription className="text-gray-500 dark:text-gray-400">
            Indica el motivo por el cual se perdió esta oportunidad y los datos
            estructurados asociados.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4 max-h-[60vh] overflow-y-auto">
          {/* Razon de perdida */}
          <div className="space-y-2">
            <Label htmlFor="lossReason" className="text-gray-700 dark:text-gray-300">
              Motivo de pérdida *
            </Label>
            <Select value={selectedReasonId} onValueChange={setSelectedReasonId}>
              <SelectTrigger className="bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-700">
                <SelectValue placeholder="Selecciona un motivo" />
              </SelectTrigger>
              <SelectContent className="bg-white dark:bg-gray-800">
                {lossReasons.map((reason) => (
                  <SelectItem key={reason.id} value={reason.id}>
                    {reason.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {isLoadingReasons && (
              <p className="text-xs text-gray-400 flex items-center gap-1">
                <Loader2 className="h-3 w-3 animate-spin" />
                Cargando catálogo...
              </p>
            )}
          </div>

          {/* Campos para razon "competitor" */}
          {showCompetitorFields && (
            <>
              <div className="space-y-2">
                <Label htmlFor="competitor" className="text-gray-700 dark:text-gray-300">
                  Competidor
                </Label>
                <Input
                  id="competitor"
                  value={competitor}
                  onChange={(e) => setCompetitor(e.target.value)}
                  placeholder="Nombre del competidor"
                  className="bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-700"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="competitorPrice" className="text-gray-700 dark:text-gray-300">
                  Precio del competidor
                </Label>
                <Input
                  id="competitorPrice"
                  type="number"
                  value={competitorPrice}
                  onChange={(e) => setCompetitorPrice(e.target.value)}
                  placeholder="0.00"
                  className="bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-700"
                />
              </div>
            </>
          )}

          {/* Campo para razon "features" */}
          {showFeaturesField && (
            <div className="space-y-2">
              <Label htmlFor="missingFeatures" className="text-gray-700 dark:text-gray-300">
                Funcionalidades faltantes
              </Label>
              <Textarea
                id="missingFeatures"
                value={missingFeatures}
                onChange={(e) => setMissingFeatures(e.target.value)}
                placeholder="Una funcionalidad por línea..."
                className="bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-700"
                rows={3}
              />
              <p className="text-xs text-gray-400">
                Escribe una funcionalidad por línea.
              </p>
            </div>
          )}

          {/* Fecha de recontacto */}
          <div className="space-y-2">
            <Label htmlFor="recontactDate" className="text-gray-700 dark:text-gray-300">
              Fecha de recontacto (opcional)
            </Label>
            <Input
              id="recontactDate"
              type="date"
              value={recontactDate}
              onChange={(e) => setRecontactDate(e.target.value)}
              className="bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-700"
            />
          </div>

          {/* Notas adicionales */}
          <div className="space-y-2">
            <Label htmlFor="lossNotes" className="text-gray-700 dark:text-gray-300">
              Notas adicionales (opcional)
            </Label>
            <Textarea
              id="lossNotes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Notas sobre la pérdida..."
              className="bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-700"
              rows={2}
            />
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button
            variant="outline"
            onClick={handleCancel}
            className="border-gray-200 dark:border-gray-700"
          >
            Cancelar
          </Button>
          <Button
            onClick={handleConfirm}
            disabled={!canConfirm || isLoading}
            className="bg-red-600 hover:bg-red-700 text-white"
          >
            {isLoading ? 'Guardando...' : 'Confirmar pérdida'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
