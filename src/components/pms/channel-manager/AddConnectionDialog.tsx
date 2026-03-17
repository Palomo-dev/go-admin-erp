'use client';

import React, { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Loader2, ExternalLink } from 'lucide-react';
import { CHANNEL_PROVIDERS, type ChannelProvider } from '@/lib/services/channelManagerService';

interface AddConnectionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  spaces: Array<{ id: string; label: string; space_type?: string }>;
  onSubmit: (data: {
    space_id: string;
    channel: string;
    ical_import_url?: string;
    commission_percent?: number;
    notes?: string;
  }) => Promise<void>;
  preselectedSpaceId?: string;
}

export function AddConnectionDialog({
  open,
  onOpenChange,
  spaces,
  onSubmit,
  preselectedSpaceId,
}: AddConnectionDialogProps) {
  const [spaceId, setSpaceId] = useState(preselectedSpaceId || '');
  const [channel, setChannel] = useState('');
  const [icalImportUrl, setIcalImportUrl] = useState('');
  const [commissionPercent, setCommissionPercent] = useState(0);
  const [notes, setNotes] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [selectedProvider, setSelectedProvider] = useState<ChannelProvider | null>(null);

  useEffect(() => {
    if (preselectedSpaceId) setSpaceId(preselectedSpaceId);
  }, [preselectedSpaceId]);

  useEffect(() => {
    if (channel) {
      const provider = CHANNEL_PROVIDERS.find(p => p.id === channel);
      setSelectedProvider(provider || null);
      if (provider) {
        setCommissionPercent(provider.commission_default);
      }
    } else {
      setSelectedProvider(null);
    }
  }, [channel]);

  const handleSubmit = async () => {
    if (!spaceId || !channel) return;

    setIsSubmitting(true);
    try {
      await onSubmit({
        space_id: spaceId,
        channel,
        ical_import_url: icalImportUrl || undefined,
        commission_percent: commissionPercent,
        notes: notes || undefined,
      });
      resetForm();
      onOpenChange(false);
    } catch {
      // El error se maneja en el componente padre
    } finally {
      setIsSubmitting(false);
    }
  };

  const resetForm = () => {
    if (!preselectedSpaceId) setSpaceId('');
    setChannel('');
    setIcalImportUrl('');
    setCommissionPercent(0);
    setNotes('');
    setSelectedProvider(null);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[520px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-gray-900 dark:text-gray-100">
            Nueva Conexión de Canal
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Espacio */}
          <div className="space-y-2">
            <Label className="text-gray-700 dark:text-gray-300">Espacio</Label>
            <Select value={spaceId} onValueChange={setSpaceId}>
              <SelectTrigger>
                <SelectValue placeholder="Seleccionar espacio" />
              </SelectTrigger>
              <SelectContent>
                {spaces.map(space => (
                  <SelectItem key={space.id} value={space.id}>
                    {space.label} {space.space_type ? `(${space.space_type})` : ''}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Canal */}
          <div className="space-y-2">
            <Label className="text-gray-700 dark:text-gray-300">Canal / OTA</Label>
            <Select value={channel} onValueChange={setChannel}>
              <SelectTrigger>
                <SelectValue placeholder="Seleccionar canal" />
              </SelectTrigger>
              <SelectContent>
                {CHANNEL_PROVIDERS.map(provider => (
                  <SelectItem key={provider.id} value={provider.id}>
                    <div className="flex items-center gap-2">
                      <div
                        className="w-3 h-3 rounded-full"
                        style={{ backgroundColor: provider.color }}
                      />
                      {provider.name}
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {selectedProvider && (
              <p className="text-xs text-gray-500 dark:text-gray-400">
                {selectedProvider.description}
              </p>
            )}
          </div>

          {/* URL iCal de importación */}
          {selectedProvider?.supports_ical_import && (
            <div className="space-y-2">
              <Label className="text-gray-700 dark:text-gray-300">
                URL del Calendario iCal (importar)
              </Label>
              <Input
                placeholder="https://www.airbnb.com/calendar/ical/..."
                value={icalImportUrl}
                onChange={(e) => setIcalImportUrl(e.target.value)}
                className="font-mono text-sm"
              />
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Pega la URL del calendario iCal de {selectedProvider.name}.
                {selectedProvider.ical_help_url && (
                  <a
                    href={selectedProvider.ical_help_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-600 dark:text-blue-400 ml-1 inline-flex items-center gap-1"
                  >
                    Ver instrucciones <ExternalLink className="h-3 w-3" />
                  </a>
                )}
              </p>
            </div>
          )}

          {/* Comisión */}
          <div className="space-y-2">
            <Label className="text-gray-700 dark:text-gray-300">Comisión (%)</Label>
            <Input
              type="number"
              min={0}
              max={100}
              step={0.5}
              value={commissionPercent}
              onChange={(e) => setCommissionPercent(Number(e.target.value))}
            />
            <p className="text-xs text-gray-500 dark:text-gray-400">
              Porcentaje de comisión que cobra el canal por cada reserva
            </p>
          </div>

          {/* Notas */}
          <div className="space-y-2">
            <Label className="text-gray-700 dark:text-gray-300">Notas (opcional)</Label>
            <Textarea
              placeholder="Notas adicionales sobre esta conexión..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
            />
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => { resetForm(); onOpenChange(false); }}
          >
            Cancelar
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={!spaceId || !channel || isSubmitting}
            className="bg-blue-600 hover:bg-blue-700 text-white"
          >
            {isSubmitting ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Creando...
              </>
            ) : (
              'Crear Conexión'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
