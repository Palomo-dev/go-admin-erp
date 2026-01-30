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
import { FileCheck, Plus, Image, PenTool, Star, Loader2, User } from 'lucide-react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';

interface POD {
  id: string;
  delivered_at: string;
  recipient_name: string;
  recipient_doc_type?: string;
  recipient_doc_number?: string;
  recipient_relationship?: string;
  signature_url?: string;
  photo_urls?: string[];
  delivery_location_type?: string;
  notes?: string;
  customer_feedback?: string;
  customer_rating?: number;
}

interface ProofOfDeliveryProps {
  pod: POD | null;
  isLoading: boolean;
  canRegister: boolean;
  onRegisterPOD: (pod: Omit<POD, 'id' | 'delivered_at'>) => Promise<void>;
}

const DOC_TYPES = [
  { value: 'CC', label: 'Cédula de Ciudadanía' },
  { value: 'CE', label: 'Cédula de Extranjería' },
  { value: 'TI', label: 'Tarjeta de Identidad' },
  { value: 'PP', label: 'Pasaporte' },
  { value: 'NIT', label: 'NIT' },
];

const RELATIONSHIPS = [
  { value: 'self', label: 'Mismo destinatario' },
  { value: 'family', label: 'Familiar' },
  { value: 'colleague', label: 'Compañero de trabajo' },
  { value: 'neighbor', label: 'Vecino' },
  { value: 'doorman', label: 'Portero/Vigilante' },
  { value: 'other', label: 'Otro' },
];

const LOCATION_TYPES = [
  { value: 'door', label: 'En la puerta' },
  { value: 'lobby', label: 'Recepción/Lobby' },
  { value: 'mailbox', label: 'Buzón' },
  { value: 'neighbor', label: 'Con vecino' },
  { value: 'office', label: 'Oficina' },
  { value: 'other', label: 'Otro' },
];

export function ProofOfDelivery({ pod, isLoading, canRegister, onRegisterPOD }: ProofOfDeliveryProps) {
  const [showDialog, setShowDialog] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formData, setFormData] = useState({
    recipient_name: '',
    recipient_doc_type: 'CC',
    recipient_doc_number: '',
    recipient_relationship: 'self',
    delivery_location_type: 'door',
    notes: '',
    customer_feedback: '',
    customer_rating: 5,
  });

  const handleSubmit = async () => {
    if (!formData.recipient_name) return;

    setIsSubmitting(true);
    try {
      await onRegisterPOD(formData);
      setShowDialog(false);
    } catch (error) {
      console.error('Error registering POD:', error);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isLoading) {
    return (
      <Card className="p-4">
        <div className="flex items-center justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin text-blue-600" />
        </div>
      </Card>
    );
  }

  if (pod) {
    return (
      <Card className="p-4">
        <h3 className="font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
          <FileCheck className="h-4 w-4 text-green-600" />
          Prueba de Entrega
          <Badge className="bg-green-100 text-green-800">Registrada</Badge>
        </h3>

        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-sm text-gray-500">Entregado el</p>
              <p className="font-medium">
                {format(new Date(pod.delivered_at), "d 'de' MMMM yyyy, HH:mm", { locale: es })}
              </p>
            </div>
            <div>
              <p className="text-sm text-gray-500">Lugar de entrega</p>
              <p className="font-medium">
                {LOCATION_TYPES.find(l => l.value === pod.delivery_location_type)?.label || pod.delivery_location_type}
              </p>
            </div>
          </div>

          <div className="border-t pt-4">
            <div className="flex items-center gap-2 mb-2">
              <User className="h-4 w-4 text-gray-500" />
              <span className="text-sm text-gray-500">Recibió:</span>
            </div>
            <p className="font-medium">{pod.recipient_name}</p>
            {pod.recipient_doc_number && (
              <p className="text-sm text-gray-600">
                {pod.recipient_doc_type}: {pod.recipient_doc_number}
              </p>
            )}
            {pod.recipient_relationship && pod.recipient_relationship !== 'self' && (
              <p className="text-sm text-gray-600">
                Relación: {RELATIONSHIPS.find(r => r.value === pod.recipient_relationship)?.label}
              </p>
            )}
          </div>

          {pod.signature_url && (
            <div className="border-t pt-4">
              <div className="flex items-center gap-2 mb-2">
                <PenTool className="h-4 w-4 text-gray-500" />
                <span className="text-sm text-gray-500">Firma:</span>
              </div>
              <img src={pod.signature_url} alt="Firma" className="max-h-24 border rounded" />
            </div>
          )}

          {pod.photo_urls && pod.photo_urls.length > 0 && (
            <div className="border-t pt-4">
              <div className="flex items-center gap-2 mb-2">
                <Image className="h-4 w-4 text-gray-500" />
                <span className="text-sm text-gray-500">Fotos ({pod.photo_urls.length}):</span>
              </div>
              <div className="flex gap-2 flex-wrap">
                {pod.photo_urls.map((url, idx) => (
                  <img key={idx} src={url} alt={`Foto ${idx + 1}`} className="h-20 w-20 object-cover rounded border" />
                ))}
              </div>
            </div>
          )}

          {pod.customer_rating && (
            <div className="border-t pt-4">
              <div className="flex items-center gap-2">
                <Star className="h-4 w-4 text-yellow-500 fill-yellow-500" />
                <span className="font-medium">{pod.customer_rating}/5</span>
                {pod.customer_feedback && (
                  <span className="text-gray-600">- {pod.customer_feedback}</span>
                )}
              </div>
            </div>
          )}

          {pod.notes && (
            <div className="border-t pt-4">
              <p className="text-sm text-gray-500">Notas:</p>
              <p className="text-gray-700 dark:text-gray-300">{pod.notes}</p>
            </div>
          )}
        </div>
      </Card>
    );
  }

  return (
    <Card className="p-4">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-semibold text-gray-900 dark:text-white flex items-center gap-2">
          <FileCheck className="h-4 w-4" />
          Prueba de Entrega
        </h3>
      </div>

      {canRegister ? (
        <div className="text-center py-6">
          <FileCheck className="h-12 w-12 mx-auto text-gray-300 mb-3" />
          <p className="text-gray-500 mb-4">No hay prueba de entrega registrada</p>
          <Button onClick={() => setShowDialog(true)} className="bg-green-600 hover:bg-green-700">
            <Plus className="h-4 w-4 mr-2" />
            Registrar Entrega
          </Button>
        </div>
      ) : (
        <p className="text-gray-500 text-center py-4">No hay prueba de entrega registrada</p>
      )}

      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileCheck className="h-5 w-5 text-green-600" />
              Registrar Prueba de Entrega
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 max-h-[60vh] overflow-y-auto">
            <div className="space-y-2">
              <Label>Nombre de quien recibe *</Label>
              <Input
                value={formData.recipient_name}
                onChange={(e) => setFormData((p) => ({ ...p, recipient_name: e.target.value }))}
                placeholder="Nombre completo"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Tipo de documento</Label>
                <Select
                  value={formData.recipient_doc_type}
                  onValueChange={(v) => setFormData((p) => ({ ...p, recipient_doc_type: v }))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {DOC_TYPES.map((doc) => (
                      <SelectItem key={doc.value} value={doc.value}>{doc.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Número de documento</Label>
                <Input
                  value={formData.recipient_doc_number}
                  onChange={(e) => setFormData((p) => ({ ...p, recipient_doc_number: e.target.value }))}
                  placeholder="Número"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Relación con destinatario</Label>
                <Select
                  value={formData.recipient_relationship}
                  onValueChange={(v) => setFormData((p) => ({ ...p, recipient_relationship: v }))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {RELATIONSHIPS.map((rel) => (
                      <SelectItem key={rel.value} value={rel.value}>{rel.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Lugar de entrega</Label>
                <Select
                  value={formData.delivery_location_type}
                  onValueChange={(v) => setFormData((p) => ({ ...p, delivery_location_type: v }))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {LOCATION_TYPES.map((loc) => (
                      <SelectItem key={loc.value} value={loc.value}>{loc.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <Label>Calificación del cliente</Label>
              <div className="flex gap-1">
                {[1, 2, 3, 4, 5].map((star) => (
                  <button
                    key={star}
                    type="button"
                    onClick={() => setFormData((p) => ({ ...p, customer_rating: star }))}
                    className="p-1"
                  >
                    <Star
                      className={`h-6 w-6 ${star <= formData.customer_rating ? 'text-yellow-500 fill-yellow-500' : 'text-gray-300'}`}
                    />
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <Label>Comentarios del cliente</Label>
              <Textarea
                value={formData.customer_feedback}
                onChange={(e) => setFormData((p) => ({ ...p, customer_feedback: e.target.value }))}
                placeholder="Comentarios opcionales..."
                rows={2}
              />
            </div>

            <div className="space-y-2">
              <Label>Notas</Label>
              <Textarea
                value={formData.notes}
                onChange={(e) => setFormData((p) => ({ ...p, notes: e.target.value }))}
                placeholder="Notas adicionales..."
                rows={2}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDialog(false)}>Cancelar</Button>
            <Button 
              onClick={handleSubmit} 
              disabled={isSubmitting || !formData.recipient_name}
              className="bg-green-600 hover:bg-green-700"
            >
              {isSubmitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Confirmar Entrega
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
