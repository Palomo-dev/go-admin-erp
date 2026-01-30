'use client';

import { useState, useEffect } from 'react';
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
import { Checkbox } from '@/components/ui/checkbox';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Loader2, Package, Search, User } from 'lucide-react';
import type { ShipmentWithDetails } from '@/lib/services/shipmentsService';

interface Stop {
  id: string;
  name: string;
  city?: string;
}

interface Customer {
  id: string;
  full_name: string;
  email?: string;
  phone?: string;
  address?: string;
  city?: string;
}

interface ShipmentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  shipment?: ShipmentWithDetails | null;
  stops: Stop[];
  onSave: (data: Partial<ShipmentWithDetails>) => Promise<void>;
  onSearchCustomer?: (query: string) => Promise<Customer[]>;
}

const PACKAGE_TYPES = [
  { value: 'envelope', label: 'Sobre' },
  { value: 'small_box', label: 'Caja Pequeña' },
  { value: 'medium_box', label: 'Caja Mediana' },
  { value: 'large_box', label: 'Caja Grande' },
  { value: 'pallet', label: 'Pallet' },
  { value: 'other', label: 'Otro' },
];

const DELIVERY_TYPES = [
  { value: 'standard', label: 'Estándar' },
  { value: 'express', label: 'Express' },
  { value: 'same_day', label: 'Mismo Día' },
];

const PAYMENT_STATUSES = [
  { value: 'pending', label: 'Pendiente' },
  { value: 'paid', label: 'Pagado' },
  { value: 'cod', label: 'Contra Entrega' },
];

export function ShipmentDialog({
  open,
  onOpenChange,
  shipment,
  stops,
  onSave,
  onSearchCustomer,
}: ShipmentDialogProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [searchingSender, setSearchingSender] = useState(false);
  const [searchingReceiver, setSearchingReceiver] = useState(false);
  const [senderResults, setSenderResults] = useState<Customer[]>([]);
  const [receiverResults, setReceiverResults] = useState<Customer[]>([]);
  const [senderSearch, setSenderSearch] = useState('');
  const [receiverSearch, setReceiverSearch] = useState('');

  const [formData, setFormData] = useState({
    sender_name: '',
    sender_phone: '',
    sender_customer_id: '',
    receiver_name: '',
    receiver_phone: '',
    receiver_customer_id: '',
    origin_stop_id: '',
    destination_stop_id: '',
    package_type: 'small_box',
    weight_kg: 0,
    declared_value: 0,
    freight_cost: 0,
    insurance_cost: 0,
    total_cost: 0,
    delivery_type: 'standard',
    payment_status: 'pending',
    is_fragile: false,
    requires_signature: false,
    notes: '',
  });

  useEffect(() => {
    if (open) {
      if (shipment) {
        setFormData({
          sender_name: shipment.sender_name || '',
          sender_phone: shipment.sender_phone || '',
          sender_customer_id: shipment.sender_customer_id || '',
          receiver_name: shipment.receiver_name || '',
          receiver_phone: shipment.receiver_phone || '',
          receiver_customer_id: shipment.receiver_customer_id || '',
          origin_stop_id: shipment.origin_stop_id || '',
          destination_stop_id: shipment.destination_stop_id || '',
          package_type: shipment.package_type || 'small_box',
          weight_kg: shipment.weight_kg || 0,
          declared_value: shipment.declared_value || 0,
          freight_cost: shipment.freight_cost || 0,
          insurance_cost: shipment.insurance_cost || 0,
          total_cost: shipment.total_cost || 0,
          delivery_type: shipment.delivery_type || 'standard',
          payment_status: shipment.payment_status || 'pending',
          is_fragile: shipment.is_fragile || false,
          requires_signature: shipment.requires_signature || false,
          notes: shipment.notes || '',
        });
      } else {
        setFormData({
          sender_name: '',
          sender_phone: '',
          sender_customer_id: '',
          receiver_name: '',
          receiver_phone: '',
          receiver_customer_id: '',
          origin_stop_id: '',
          destination_stop_id: '',
          package_type: 'small_box',
          weight_kg: 0,
          declared_value: 0,
          freight_cost: 0,
          insurance_cost: 0,
          total_cost: 0,
          delivery_type: 'standard',
          payment_status: 'pending',
          is_fragile: false,
          requires_signature: false,
          notes: '',
        });
      }
      setSenderResults([]);
      setReceiverResults([]);
      setSenderSearch('');
      setReceiverSearch('');
    }
  }, [open, shipment]);

  useEffect(() => {
    const total = (formData.freight_cost || 0) + (formData.insurance_cost || 0);
    setFormData((prev) => ({ ...prev, total_cost: total }));
  }, [formData.freight_cost, formData.insurance_cost]);

  const handleSearchSender = async () => {
    if (!onSearchCustomer || !senderSearch.trim()) return;
    setSearchingSender(true);
    try {
      const results = await onSearchCustomer(senderSearch);
      setSenderResults(results);
    } catch (error) {
      console.error('Error searching sender:', error);
    } finally {
      setSearchingSender(false);
    }
  };

  const handleSearchReceiver = async () => {
    if (!onSearchCustomer || !receiverSearch.trim()) return;
    setSearchingReceiver(true);
    try {
      const results = await onSearchCustomer(receiverSearch);
      setReceiverResults(results);
    } catch (error) {
      console.error('Error searching receiver:', error);
    } finally {
      setSearchingReceiver(false);
    }
  };

  const selectSender = (customer: Customer) => {
    setFormData((prev) => ({
      ...prev,
      sender_customer_id: customer.id,
      sender_name: customer.full_name,
      sender_phone: customer.phone || '',
    }));
    setSenderResults([]);
    setSenderSearch('');
  };

  const selectReceiver = (customer: Customer) => {
    setFormData((prev) => ({
      ...prev,
      receiver_customer_id: customer.id,
      receiver_name: customer.full_name,
      receiver_phone: customer.phone || '',
    }));
    setReceiverResults([]);
    setReceiverSearch('');
  };

  const handleSubmit = async () => {
    if (!formData.sender_name || !formData.receiver_name) return;

    setIsSubmitting(true);
    try {
      await onSave({
        sender_name: formData.sender_name,
        sender_phone: formData.sender_phone || undefined,
        sender_customer_id: formData.sender_customer_id || undefined,
        receiver_name: formData.receiver_name,
        receiver_phone: formData.receiver_phone || undefined,
        receiver_customer_id: formData.receiver_customer_id || undefined,
        origin_stop_id: formData.origin_stop_id || undefined,
        destination_stop_id: formData.destination_stop_id || undefined,
        package_type: formData.package_type,
        weight_kg: formData.weight_kg || undefined,
        declared_value: formData.declared_value || undefined,
        freight_cost: formData.freight_cost,
        insurance_cost: formData.insurance_cost || undefined,
        total_cost: formData.total_cost,
        delivery_type: formData.delivery_type as ShipmentWithDetails['delivery_type'],
        payment_status: formData.payment_status as ShipmentWithDetails['payment_status'],
        is_fragile: formData.is_fragile,
        requires_signature: formData.requires_signature,
        notes: formData.notes || undefined,
      });
      onOpenChange(false);
    } catch (error) {
      console.error('Error saving shipment:', error);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Package className="h-5 w-5 text-blue-600" />
            {shipment ? 'Editar Envío' : 'Nuevo Envío'}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          {/* Remitente */}
          <div className="border rounded-lg p-4">
            <h4 className="font-medium mb-3 flex items-center gap-2">
              <User className="h-4 w-4" />
              Remitente
            </h4>
            {onSearchCustomer && (
              <div className="mb-3">
                <div className="flex gap-2">
                  <Input
                    placeholder="Buscar cliente..."
                    value={senderSearch}
                    onChange={(e) => setSenderSearch(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleSearchSender()}
                  />
                  <Button type="button" variant="outline" onClick={handleSearchSender} disabled={searchingSender}>
                    {searchingSender ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                  </Button>
                </div>
                {senderResults.length > 0 && (
                  <div className="border rounded-lg divide-y max-h-32 overflow-y-auto mt-2">
                    {senderResults.map((c) => (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() => selectSender(c)}
                        className="w-full p-2 text-left hover:bg-gray-50 dark:hover:bg-gray-800 text-sm"
                      >
                        <p className="font-medium">{c.full_name}</p>
                        <p className="text-xs text-gray-500">{c.phone} · {c.city}</p>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Nombre *</Label>
                <Input
                  value={formData.sender_name}
                  onChange={(e) => setFormData((p) => ({ ...p, sender_name: e.target.value }))}
                  placeholder="Nombre del remitente"
                />
              </div>
              <div className="space-y-2">
                <Label>Teléfono</Label>
                <Input
                  value={formData.sender_phone}
                  onChange={(e) => setFormData((p) => ({ ...p, sender_phone: e.target.value }))}
                  placeholder="3001234567"
                />
              </div>
            </div>
          </div>

          {/* Destinatario */}
          <div className="border rounded-lg p-4">
            <h4 className="font-medium mb-3 flex items-center gap-2">
              <User className="h-4 w-4" />
              Destinatario
            </h4>
            {onSearchCustomer && (
              <div className="mb-3">
                <div className="flex gap-2">
                  <Input
                    placeholder="Buscar cliente..."
                    value={receiverSearch}
                    onChange={(e) => setReceiverSearch(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleSearchReceiver()}
                  />
                  <Button type="button" variant="outline" onClick={handleSearchReceiver} disabled={searchingReceiver}>
                    {searchingReceiver ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                  </Button>
                </div>
                {receiverResults.length > 0 && (
                  <div className="border rounded-lg divide-y max-h-32 overflow-y-auto mt-2">
                    {receiverResults.map((c) => (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() => selectReceiver(c)}
                        className="w-full p-2 text-left hover:bg-gray-50 dark:hover:bg-gray-800 text-sm"
                      >
                        <p className="font-medium">{c.full_name}</p>
                        <p className="text-xs text-gray-500">{c.phone} · {c.city}</p>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Nombre *</Label>
                <Input
                  value={formData.receiver_name}
                  onChange={(e) => setFormData((p) => ({ ...p, receiver_name: e.target.value }))}
                  placeholder="Nombre del destinatario"
                />
              </div>
              <div className="space-y-2">
                <Label>Teléfono</Label>
                <Input
                  value={formData.receiver_phone}
                  onChange={(e) => setFormData((p) => ({ ...p, receiver_phone: e.target.value }))}
                  placeholder="3001234567"
                />
              </div>
            </div>
          </div>

          {/* Origen y Destino */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Origen</Label>
              <Select
                value={formData.origin_stop_id || '__none__'}
                onValueChange={(v) => setFormData((p) => ({ ...p, origin_stop_id: v === '__none__' ? '' : v }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Seleccionar origen" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">Seleccionar...</SelectItem>
                  {stops.map((stop) => (
                    <SelectItem key={stop.id} value={stop.id}>
                      {stop.name} {stop.city && `(${stop.city})`}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Destino</Label>
              <Select
                value={formData.destination_stop_id || '__none__'}
                onValueChange={(v) => setFormData((p) => ({ ...p, destination_stop_id: v === '__none__' ? '' : v }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Seleccionar destino" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">Seleccionar...</SelectItem>
                  {stops.map((stop) => (
                    <SelectItem key={stop.id} value={stop.id}>
                      {stop.name} {stop.city && `(${stop.city})`}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Paquete */}
          <div className="grid grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label>Tipo de Paquete</Label>
              <Select
                value={formData.package_type}
                onValueChange={(v) => setFormData((p) => ({ ...p, package_type: v }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PACKAGE_TYPES.map((t) => (
                    <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Peso (kg)</Label>
              <Input
                type="number"
                step="0.1"
                value={formData.weight_kg}
                onChange={(e) => setFormData((p) => ({ ...p, weight_kg: Number(e.target.value) || 0 }))}
              />
            </div>
            <div className="space-y-2">
              <Label>Valor Declarado</Label>
              <Input
                type="number"
                value={formData.declared_value}
                onChange={(e) => setFormData((p) => ({ ...p, declared_value: Number(e.target.value) || 0 }))}
              />
            </div>
          </div>

          {/* Costos */}
          <div className="grid grid-cols-4 gap-4">
            <div className="space-y-2">
              <Label>Flete</Label>
              <Input
                type="number"
                value={formData.freight_cost}
                onChange={(e) => setFormData((p) => ({ ...p, freight_cost: Number(e.target.value) || 0 }))}
              />
            </div>
            <div className="space-y-2">
              <Label>Seguro</Label>
              <Input
                type="number"
                value={formData.insurance_cost}
                onChange={(e) => setFormData((p) => ({ ...p, insurance_cost: Number(e.target.value) || 0 }))}
              />
            </div>
            <div className="space-y-2">
              <Label>Total</Label>
              <Input
                type="number"
                value={formData.total_cost}
                readOnly
                className="bg-gray-50 dark:bg-gray-800"
              />
            </div>
            <div className="space-y-2">
              <Label>Estado Pago</Label>
              <Select
                value={formData.payment_status}
                onValueChange={(v) => setFormData((p) => ({ ...p, payment_status: v }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PAYMENT_STATUSES.map((s) => (
                    <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Tipo de Entrega y Opciones */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Tipo de Entrega</Label>
              <Select
                value={formData.delivery_type}
                onValueChange={(v) => setFormData((p) => ({ ...p, delivery_type: v }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {DELIVERY_TYPES.map((t) => (
                    <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-4 pt-6">
              <div className="flex items-center gap-2">
                <Checkbox
                  id="fragile"
                  checked={formData.is_fragile}
                  onCheckedChange={(c) => setFormData((p) => ({ ...p, is_fragile: !!c }))}
                />
                <Label htmlFor="fragile" className="cursor-pointer">Frágil</Label>
              </div>
              <div className="flex items-center gap-2">
                <Checkbox
                  id="signature"
                  checked={formData.requires_signature}
                  onCheckedChange={(c) => setFormData((p) => ({ ...p, requires_signature: !!c }))}
                />
                <Label htmlFor="signature" className="cursor-pointer">Requiere Firma</Label>
              </div>
            </div>
          </div>

          {/* Notas */}
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
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={isSubmitting || !formData.sender_name || !formData.receiver_name}
            className="bg-blue-600 hover:bg-blue-700"
          >
            {isSubmitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            {shipment ? 'Guardar Cambios' : 'Crear Envío'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
