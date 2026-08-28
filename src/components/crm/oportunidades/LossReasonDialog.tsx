'use client';

import { useState } from 'react';
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
import type { LossReasonData } from './types';

interface LossReasonDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (data: LossReasonData) => void;
  isLoading?: boolean;
}

const LOSS_REASONS = [
  { value: 'price', label: 'Precio muy alto' },
  { value: 'competitor', label: 'Eligió a la competencia' },
  { value: 'budget', label: 'Sin presupuesto' },
  { value: 'timing', label: 'No es el momento adecuado' },
  { value: 'no_response', label: 'Sin respuesta del cliente' },
  { value: 'requirements', label: 'No cumple requisitos' },
  { value: 'other', label: 'Otro motivo' },
];

export function LossReasonDialog({
  open,
  onOpenChange,
  onConfirm,
  isLoading,
}: LossReasonDialogProps) {
  const [selectedReason, setSelectedReason] = useState<string>('');
  const [customReason, setCustomReason] = useState<string>('');
  const [competitor, setCompetitor] = useState<string>('');
  const [competitorPrice, setCompetitorPrice] = useState<string>('');
  const [recontactDate, setRecontactDate] = useState<string>('');
  const [notes, setNotes] = useState<string>('');

  const handleConfirm = () => {
    const reasonData = LOSS_REASONS.find((r) => r.value === selectedReason);
    const label =
      selectedReason === 'other'
        ? customReason
        : reasonData?.label || selectedReason;

    const data: LossReasonData = {
      lossReasonId: selectedReason,
      lossReasonLabel: label,
      competitor: competitor || undefined,
      competitorPrice: competitorPrice ? parseFloat(competitorPrice) : undefined,
      recontactDate: recontactDate || undefined,
      notes: notes || undefined,
    };

    onConfirm(data);
    // Resetear estado
    setSelectedReason('');
    setCustomReason('');
    setCompetitor('');
    setCompetitorPrice('');
    setRecontactDate('');
    setNotes('');
  };

  const handleCancel = () => {
    setSelectedReason('');
    setCustomReason('');
    setCompetitor('');
    setCompetitorPrice('');
    setRecontactDate('');
    setNotes('');
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
        <DialogHeader>
          <DialogTitle className="text-gray-900 dark:text-white">
            Registrar razón de pérdida
          </DialogTitle>
          <DialogDescription className="text-gray-500 dark:text-gray-400">
            Por favor, indica el motivo por el cual se perdió esta oportunidad.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="reason" className="text-gray-700 dark:text-gray-300">
              Motivo de pérdida
            </Label>
            <Select value={selectedReason} onValueChange={setSelectedReason}>
              <SelectTrigger className="bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-700">
                <SelectValue placeholder="Selecciona un motivo" />
              </SelectTrigger>
              <SelectContent className="bg-white dark:bg-gray-800">
                {LOSS_REASONS.map((reason) => (
                  <SelectItem key={reason.value} value={reason.value}>
                    {reason.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {selectedReason === 'other' && (
            <div className="space-y-2">
              <Label htmlFor="customReason" className="text-gray-700 dark:text-gray-300">
                Describe el motivo
              </Label>
              <Textarea
                id="customReason"
                value={customReason}
                onChange={(e) => setCustomReason(e.target.value)}
                placeholder="Escribe el motivo de la pérdida..."
                className="bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-700"
                rows={3}
              />
            </div>
          )}

          {/* Campos estructurados adicionales */}
          {selectedReason === 'competitor' && (
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
          )}

          {selectedReason === 'competitor' && (
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
          )}

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
            disabled={!selectedReason || (selectedReason === 'other' && !customReason) || isLoading}
            className="bg-red-600 hover:bg-red-700 text-white"
          >
            {isLoading ? 'Guardando...' : 'Confirmar pérdida'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
