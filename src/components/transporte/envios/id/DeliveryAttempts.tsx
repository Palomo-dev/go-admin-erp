'use client';

import { useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Truck, Plus, CheckCircle, XCircle, AlertTriangle, Loader2, Calendar } from 'lucide-react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';

interface DeliveryAttempt {
  id: string;
  attempt_number: number;
  attempted_at: string;
  status: 'successful' | 'failed' | 'partial';
  failure_reason_code?: string;
  failure_reason_text?: string;
  driver_notes?: string;
  reschedule_date?: string;
  reschedule_notes?: string;
}

interface DeliveryAttemptsProps {
  attempts: DeliveryAttempt[];
  isLoading: boolean;
  canRegister: boolean;
  onRegisterAttempt: (attempt: Omit<DeliveryAttempt, 'id' | 'attempt_number' | 'attempted_at'>) => Promise<void>;
}

const FAILURE_REASONS = [
  { code: 'no_answer', label: 'No responde / No hay nadie' },
  { code: 'wrong_address', label: 'Dirección incorrecta' },
  { code: 'refused', label: 'Rechazado por destinatario' },
  { code: 'damaged', label: 'Paquete dañado' },
  { code: 'incomplete_address', label: 'Dirección incompleta' },
  { code: 'access_denied', label: 'No se pudo acceder' },
  { code: 'reschedule_requested', label: 'Reprogramación solicitada' },
  { code: 'other', label: 'Otro motivo' },
];

const STATUS_CONFIG = {
  successful: { label: 'Exitoso', color: 'bg-green-100 text-green-800', icon: CheckCircle },
  failed: { label: 'Fallido', color: 'bg-red-100 text-red-800', icon: XCircle },
  partial: { label: 'Parcial', color: 'bg-yellow-100 text-yellow-800', icon: AlertTriangle },
};

export function DeliveryAttempts({ attempts, isLoading, canRegister, onRegisterAttempt }: DeliveryAttemptsProps) {
  const [showDialog, setShowDialog] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formData, setFormData] = useState({
    status: 'failed' as 'successful' | 'failed' | 'partial',
    failure_reason_code: '',
    failure_reason_text: '',
    driver_notes: '',
    reschedule_date: '',
    reschedule_notes: '',
  });

  const handleSubmit = async () => {
    setIsSubmitting(true);
    try {
      await onRegisterAttempt(formData);
      setShowDialog(false);
      setFormData({
        status: 'failed',
        failure_reason_code: '',
        failure_reason_text: '',
        driver_notes: '',
        reschedule_date: '',
        reschedule_notes: '',
      });
    } catch (error) {
      console.error('Error registering attempt:', error);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Card className="p-4">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-semibold text-gray-900 dark:text-white flex items-center gap-2">
          <Truck className="h-4 w-4" />
          Intentos de Entrega ({attempts.length})
        </h3>
        {canRegister && (
          <Button variant="outline" size="sm" onClick={() => setShowDialog(true)}>
            <Plus className="h-4 w-4 mr-2" />
            Registrar Intento
          </Button>
        )}
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin text-blue-600" />
        </div>
      ) : attempts.length === 0 ? (
        <p className="text-gray-500 text-center py-4">No hay intentos de entrega registrados</p>
      ) : (
        <div className="space-y-3">
          {attempts.map((attempt) => {
            const config = STATUS_CONFIG[attempt.status];
            const Icon = config.icon;
            const failureReason = FAILURE_REASONS.find(r => r.code === attempt.failure_reason_code);

            return (
              <div key={attempt.id} className="border rounded-lg p-3">
                <div className="flex items-start justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <span className="font-medium">Intento #{attempt.attempt_number}</span>
                    <Badge className={config.color}>
                      <Icon className="h-3 w-3 mr-1" />
                      {config.label}
                    </Badge>
                  </div>
                  <span className="text-sm text-gray-500">
                    {format(new Date(attempt.attempted_at), "d MMM yyyy, HH:mm", { locale: es })}
                  </span>
                </div>
                
                {attempt.status === 'failed' && (
                  <div className="mt-2 text-sm">
                    <p className="text-red-600 font-medium">
                      {failureReason?.label || attempt.failure_reason_code}
                    </p>
                    {attempt.failure_reason_text && (
                      <p className="text-gray-600 mt-1">{attempt.failure_reason_text}</p>
                    )}
                  </div>
                )}
                
                {attempt.driver_notes && (
                  <p className="text-sm text-gray-600 mt-2">
                    <strong>Notas:</strong> {attempt.driver_notes}
                  </p>
                )}

                {attempt.reschedule_date && (
                  <div className="mt-2 flex items-center gap-2 text-sm text-blue-600">
                    <Calendar className="h-4 w-4" />
                    Reprogramado para: {format(new Date(attempt.reschedule_date), "d MMM yyyy", { locale: es })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Registrar Intento de Entrega</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Resultado del Intento</Label>
              <Select
                value={formData.status}
                onValueChange={(v) => setFormData((p) => ({ ...p, status: v as typeof formData.status }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="successful">Exitoso - Entregado</SelectItem>
                  <SelectItem value="failed">Fallido - No entregado</SelectItem>
                  <SelectItem value="partial">Parcial - Entrega incompleta</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {formData.status === 'failed' && (
              <>
                <div className="space-y-2">
                  <Label>Motivo del Fallo</Label>
                  <Select
                    value={formData.failure_reason_code}
                    onValueChange={(v) => setFormData((p) => ({ ...p, failure_reason_code: v }))}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Seleccionar motivo" />
                    </SelectTrigger>
                    <SelectContent>
                      {FAILURE_REASONS.map((reason) => (
                        <SelectItem key={reason.code} value={reason.code}>
                          {reason.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Descripción adicional</Label>
                  <Textarea
                    value={formData.failure_reason_text}
                    onChange={(e) => setFormData((p) => ({ ...p, failure_reason_text: e.target.value }))}
                    placeholder="Detalles del fallo..."
                    rows={2}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Reprogramar para</Label>
                  <Input
                    type="date"
                    value={formData.reschedule_date}
                    onChange={(e) => setFormData((p) => ({ ...p, reschedule_date: e.target.value }))}
                  />
                </div>
              </>
            )}

            <div className="space-y-2">
              <Label>Notas del conductor</Label>
              <Textarea
                value={formData.driver_notes}
                onChange={(e) => setFormData((p) => ({ ...p, driver_notes: e.target.value }))}
                placeholder="Observaciones..."
                rows={2}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDialog(false)}>Cancelar</Button>
            <Button onClick={handleSubmit} disabled={isSubmitting}>
              {isSubmitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Registrar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
