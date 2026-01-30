'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
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
import { Loader2, Search, Truck, Package } from 'lucide-react';

interface Reference {
  type: 'trip' | 'shipment';
  id: string;
  code: string;
  status: string;
}

interface Stop {
  id: string;
  name: string;
  city: string;
}

interface RegisterEventDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (event: {
    reference_type: 'trip' | 'shipment';
    reference_id: string;
    event_type: string;
    description?: string;
    location_text?: string;
    stop_id?: string;
    external_event_id?: string;
  }) => Promise<void>;
  onSearchReferences: (query: string) => Promise<Reference[]>;
  stops: Stop[];
}

const EVENT_TYPES = [
  { value: 'departed', label: 'Partió / Salió' },
  { value: 'arrived', label: 'Llegó a parada' },
  { value: 'in_transit', label: 'En tránsito' },
  { value: 'dispatched', label: 'Despachado' },
  { value: 'out_for_delivery', label: 'En reparto' },
  { value: 'delivered', label: 'Entregado' },
  { value: 'delayed', label: 'Retrasado' },
  { value: 'incident', label: 'Incidente' },
  { value: 'note', label: 'Nota / Observación' },
];

export function RegisterEventDialog({
  open,
  onOpenChange,
  onSubmit,
  onSearchReferences,
  stops,
}: RegisterEventDialogProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<Reference[]>([]);
  const [selectedReference, setSelectedReference] = useState<Reference | null>(null);
  const [formData, setFormData] = useState({
    event_type: '',
    description: '',
    location_text: '',
    stop_id: '',
    external_event_id: '',
  });

  useEffect(() => {
    if (!open) {
      setSearchQuery('');
      setSearchResults([]);
      setSelectedReference(null);
      setFormData({
        event_type: '',
        description: '',
        location_text: '',
        stop_id: '',
        external_event_id: '',
      });
    }
  }, [open]);

  const handleSearch = async () => {
    if (!searchQuery.trim()) return;
    setIsSearching(true);
    try {
      const results = await onSearchReferences(searchQuery);
      setSearchResults(results);
    } catch (error) {
      console.error('Error searching references:', error);
    } finally {
      setIsSearching(false);
    }
  };

  const handleSubmit = async () => {
    if (!selectedReference || !formData.event_type) return;

    setIsSubmitting(true);
    try {
      await onSubmit({
        reference_type: selectedReference.type,
        reference_id: selectedReference.id,
        event_type: formData.event_type,
        description: formData.description || undefined,
        location_text: formData.location_text || undefined,
        stop_id: formData.stop_id || undefined,
        external_event_id: formData.external_event_id || undefined,
      });
      onOpenChange(false);
    } catch (error) {
      console.error('Error registering event:', error);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Registrar Evento Manual</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 max-h-[60vh] overflow-y-auto">
          {/* Search Reference */}
          {!selectedReference ? (
            <div className="space-y-3">
              <Label>Buscar Viaje o Envío</Label>
              <div className="flex gap-2">
                <Input
                  placeholder="Código de viaje o tracking..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                />
                <Button variant="outline" onClick={handleSearch} disabled={isSearching}>
                  {isSearching ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                </Button>
              </div>

              {searchResults.length > 0 && (
                <div className="border rounded-lg divide-y max-h-[200px] overflow-y-auto">
                  {searchResults.map((ref) => (
                    <button
                      key={`${ref.type}-${ref.id}`}
                      className="w-full p-3 text-left hover:bg-gray-50 dark:hover:bg-gray-800 flex items-center gap-3"
                      onClick={() => setSelectedReference(ref)}
                    >
                      {ref.type === 'trip' ? (
                        <Truck className="h-4 w-4 text-purple-600" />
                      ) : (
                        <Package className="h-4 w-4 text-green-600" />
                      )}
                      <div>
                        <p className="font-mono font-medium">{ref.code}</p>
                        <p className="text-xs text-gray-500">{ref.type === 'trip' ? 'Viaje' : 'Envío'} - {ref.status}</p>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <div className="p-3 border rounded-lg bg-gray-50 dark:bg-gray-900">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  {selectedReference.type === 'trip' ? (
                    <Truck className="h-4 w-4 text-purple-600" />
                  ) : (
                    <Package className="h-4 w-4 text-green-600" />
                  )}
                  <span className="font-mono font-medium">{selectedReference.code}</span>
                  <span className="text-sm text-gray-500">({selectedReference.type === 'trip' ? 'Viaje' : 'Envío'})</span>
                </div>
                <Button variant="ghost" size="sm" onClick={() => setSelectedReference(null)}>
                  Cambiar
                </Button>
              </div>
            </div>
          )}

          {selectedReference && (
            <>
              <div className="space-y-2">
                <Label>Tipo de Evento *</Label>
                <Select
                  value={formData.event_type}
                  onValueChange={(v) => setFormData((p) => ({ ...p, event_type: v }))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Seleccionar evento" />
                  </SelectTrigger>
                  <SelectContent>
                    {EVENT_TYPES.map((type) => (
                      <SelectItem key={type.value} value={type.value}>
                        {type.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Parada (opcional)</Label>
                <Select
                  value={formData.stop_id}
                  onValueChange={(v) => setFormData((p) => ({ ...p, stop_id: v }))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Seleccionar parada" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">Sin parada específica</SelectItem>
                    {stops.map((stop) => (
                      <SelectItem key={stop.id} value={stop.id}>
                        {stop.name} - {stop.city}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Ubicación (texto libre)</Label>
                <Input
                  value={formData.location_text}
                  onChange={(e) => setFormData((p) => ({ ...p, location_text: e.target.value }))}
                  placeholder="Ej: Km 45 vía Bogotá-Medellín"
                />
              </div>

              <div className="space-y-2">
                <Label>Descripción</Label>
                <Textarea
                  value={formData.description}
                  onChange={(e) => setFormData((p) => ({ ...p, description: e.target.value }))}
                  placeholder="Detalles adicionales del evento..."
                  rows={2}
                />
              </div>

              <div className="space-y-2">
                <Label>ID Evento Externo (para deduplicación)</Label>
                <Input
                  value={formData.external_event_id}
                  onChange={(e) => setFormData((p) => ({ ...p, external_event_id: e.target.value }))}
                  placeholder="ID único de sistema externo"
                />
                <p className="text-xs text-gray-500">
                  Si ingresa un ID externo, el sistema validará que no exista duplicado
                </p>
              </div>
            </>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={isSubmitting || !selectedReference || !formData.event_type}
          >
            {isSubmitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Registrar Evento
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
