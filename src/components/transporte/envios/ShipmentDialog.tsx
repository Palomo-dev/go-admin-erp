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
import { RichTextEditor } from '@/components/shared/RichTextEditor';
import { PhoneInput } from '@/components/ui/phone-input';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Loader2, Package, Plus, Trash2, Box, User, Truck } from 'lucide-react';
import type { ShipmentWithDetails } from '@/lib/services/shipmentsService';
import { CustomerSearchSelect, type CustomerSearchResult } from './CustomerSearchSelect';
import { shippingRatesService, type ShippingRateWithCarrier } from '@/lib/services/shippingRatesService';

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

interface ShipmentItem {
  id: string;
  description: string;
  quantity: number;
  weight_kg?: number;
  unit_value?: number;
}

interface ShipmentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  shipment?: ShipmentWithDetails | null;
  stops: Stop[];
  onSave: (data: Partial<ShipmentWithDetails>) => Promise<void>;
  onSearchCustomer?: (query: string) => Promise<Customer[]>;
  organizationId?: number;
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
  organizationId,
}: ShipmentDialogProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [items, setItems] = useState<ShipmentItem[]>([]);
  const [shippingRates, setShippingRates] = useState<ShippingRateWithCarrier[]>([]);
  const [loadingRates, setLoadingRates] = useState(false);
  const [showRateSelector, setShowRateSelector] = useState(false);

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
        const meta = (shipment.metadata as Record<string, unknown> | null) || {};
        setFormData({
          sender_name: (meta.sender_name as string) || shipment.sender_name || '',
          sender_phone: (meta.sender_phone as string) || shipment.sender_phone || '',
          sender_customer_id: (meta.sender_customer_id as string) || shipment.sender_customer_id || '',
          receiver_name: shipment.delivery_contact_name || shipment.receiver_name || shipment.customer?.full_name || '',
          receiver_phone: shipment.delivery_contact_phone || shipment.receiver_phone || shipment.customer?.phone || '',
          receiver_customer_id: shipment.customer_id || shipment.receiver_customer_id || '',
          origin_stop_id: (meta.origin_stop_id as string) || shipment.origin_stop_id || '',
          destination_stop_id: (meta.destination_stop_id as string) || shipment.destination_stop_id || '',
          package_type: (meta.package_type as string) || shipment.package_type || 'small_box',
          weight_kg: shipment.weight_kg || 0,
          declared_value: shipment.declared_value || 0,
          freight_cost: shipment.shipping_fee || shipment.freight_cost || 0,
          insurance_cost: shipment.insurance_fee || shipment.insurance_cost || 0,
          total_cost: shipment.total_cost || 0,
          delivery_type: (meta.delivery_type as string) || shipment.delivery_type || 'standard',
          payment_status: shipment.payment_status || 'pending',
          is_fragile: (meta.is_fragile as boolean) || shipment.is_fragile || false,
          requires_signature: (meta.requires_signature as boolean) || shipment.requires_signature || false,
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
      setItems(shipment?.metadata ? ((shipment.metadata as any).items || []) : []);
    }
  }, [open, shipment]);

  useEffect(() => {
    if (open && organizationId) {
      setLoadingRates(true);
      shippingRatesService.getShippingRates(organizationId, { is_active: true })
        .then((rates) => setShippingRates(rates))
        .catch((err) => console.error('Error loading shipping rates:', err))
        .finally(() => setLoadingRates(false));
    }
  }, [open, organizationId]);

  useEffect(() => {
    const total = (formData.freight_cost || 0) + (formData.insurance_cost || 0);
    setFormData((prev) => ({ ...prev, total_cost: total }));
  }, [formData.freight_cost, formData.insurance_cost]);

  const selectSender = (customer: CustomerSearchResult) => {
    setFormData((prev) => ({
      ...prev,
      sender_customer_id: customer.id,
      sender_name: customer.full_name,
      sender_phone: customer.phone || '',
    }));
  };

  const selectReceiver = (customer: CustomerSearchResult) => {
    setFormData((prev) => ({
      ...prev,
      receiver_customer_id: customer.id,
      receiver_name: customer.full_name,
      receiver_phone: customer.phone || '',
    }));
  };

  const addItem = () => {
    setItems((prev) => [...prev, { id: crypto.randomUUID(), description: '', quantity: 1 }]);
  };

  const updateItem = (id: string, field: keyof ShipmentItem, value: string | number) => {
    setItems((prev) => prev.map((item) => (item.id === id ? { ...item, [field]: value } : item)));
  };

  const removeItem = (id: string) => {
    setItems((prev) => prev.filter((item) => item.id !== id));
  };

  const handleSubmit = async () => {
    if (!formData.sender_name || !formData.receiver_name) return;

    setIsSubmitting(true);
    try {
      const metadata: Record<string, unknown> = {
        sender_name: formData.sender_name,
        sender_phone: formData.sender_phone || undefined,
        sender_customer_id: formData.sender_customer_id || undefined,
        origin_stop_id: formData.origin_stop_id || undefined,
        destination_stop_id: formData.destination_stop_id || undefined,
        package_type: formData.package_type,
        delivery_type: formData.delivery_type,
        is_fragile: formData.is_fragile,
        requires_signature: formData.requires_signature,
        items: items.length > 0 ? items : undefined,
      };

      await onSave({
        customer_id: formData.receiver_customer_id || undefined,
        delivery_contact_name: formData.receiver_name,
        delivery_contact_phone: formData.receiver_phone || undefined,
        weight_kg: formData.weight_kg || undefined,
        declared_value: formData.declared_value || undefined,
        shipping_fee: formData.freight_cost,
        insurance_fee: formData.insurance_cost || undefined,
        total_cost: formData.total_cost,
        payment_status: formData.payment_status as ShipmentWithDetails['payment_status'],
        notes: formData.notes || undefined,
        metadata,
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
            <Package className="h-5 w-5 text-blue-600 dark:text-blue-300" />
            {shipment ? 'Editar Envío' : 'Nuevo Envío'}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 sm:space-y-6">
          {/* Remitente */}
          <div className="border rounded-lg p-4">
            <h4 className="font-medium mb-3 flex items-center gap-2">
              <User className="h-4 w-4" />
              Remitente
            </h4>
            {onSearchCustomer && (
              <div className="mb-3">
                <CustomerSearchSelect
                  onSearch={onSearchCustomer}
                  onSelect={selectSender}
                  selectedName={formData.sender_name || undefined}
                  selectedPhone={formData.sender_phone || undefined}
                  placeholder="Buscar remitente..."
                />
              </div>
            )}
            <div className="grid grid-cols-2 gap-2 sm:gap-4">
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
                <PhoneInput
                  value={formData.sender_phone}
                  onChange={(v) => setFormData((p) => ({ ...p, sender_phone: v }))}
                  placeholder="300 123 4567"
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
                <CustomerSearchSelect
                  onSearch={onSearchCustomer}
                  onSelect={selectReceiver}
                  selectedName={formData.receiver_name || undefined}
                  selectedPhone={formData.receiver_phone || undefined}
                  placeholder="Buscar destinatario..."
                />
              </div>
            )}
            <div className="grid grid-cols-2 gap-2 sm:gap-4">
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
                <PhoneInput
                  value={formData.receiver_phone}
                  onChange={(v) => setFormData((p) => ({ ...p, receiver_phone: v }))}
                  placeholder="300 123 4567"
                />
              </div>
            </div>
          </div>

          {/* Origen y Destino */}
          <div className="grid grid-cols-2 gap-2 sm:gap-4">
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
          <div className="grid grid-cols-3 gap-2 sm:gap-4">
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
          <div className="grid grid-cols-4 gap-2 sm:gap-4">
            <div className="space-y-2">
              <Label>Flete</Label>
              <div className="flex gap-1">
                <Input
                  type="number"
                  value={formData.freight_cost}
                  onChange={(e) => setFormData((p) => ({ ...p, freight_cost: Number(e.target.value) || 0 }))}
                  className="flex-1"
                />
                {organizationId && shippingRates.length > 0 && (
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    onClick={() => setShowRateSelector(!showRateSelector)}
                    title="Ver tarifas configuradas"
                  >
                    {loadingRates ? <Loader2 className="h-4 w-4 animate-spin" /> : <Truck className="h-4 w-4" />}
                  </Button>
                )}
              </div>
              {showRateSelector && shippingRates.length > 0 && (
                <div className="absolute z-50 mt-1 w-72 max-h-60 overflow-y-auto rounded-lg border bg-white dark:bg-gray-900 shadow-lg">
                  {shippingRates.map((rate) => (
                    <button
                      key={rate.id}
                      type="button"
                      className="w-full text-left px-3 py-2 hover:bg-gray-100 dark:hover:bg-gray-800 border-b border-gray-100 dark:border-gray-800 last:border-0"
                      onClick={() => {
                        setFormData((p) => ({ ...p, freight_cost: rate.base_rate || rate.min_charge || 0 }));
                        setShowRateSelector(false);
                      }}
                    >
                      <div className="text-sm font-medium text-gray-900 dark:text-gray-100">{rate.rate_name}</div>
                      <div className="text-xs text-gray-500 flex items-center gap-2 dark:text-gray-400">
                        {rate.transport_carriers && <span>{rate.transport_carriers.name}</span>}
                        <span className="font-semibold text-green-600 dark:text-green-400">
                          ${rate.base_rate || rate.min_charge || 0}
                        </span>
                        {rate.calculation_method === 'weight' && rate.rate_per_kg && (
                          <span>+ ${rate.rate_per_kg}/kg</span>
                        )}
                      </div>
                    </button>
                  ))}
                </div>
              )}
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
          <div className="grid grid-cols-2 gap-2 sm:gap-4">
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
            <div className="space-y-3 sm:space-y-4 pt-6">
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

          {/* Items / Productos */}
          <div className="border rounded-lg p-4">
            <div className="flex items-center justify-between mb-3">
              <h4 className="font-medium flex items-center gap-2">
                <Box className="h-4 w-4" />
                Items del Envío
              </h4>
              <Button type="button" size="sm" variant="outline" onClick={addItem}>
                <Plus className="h-4 w-4 mr-1" />
                Agregar Item
              </Button>
            </div>
            {items.length === 0 ? (
              <p className="text-sm text-gray-500 text-center py-4 dark:text-gray-400">
                No hay items agregados
              </p>
            ) : (
              <div className="space-y-2">
                {items.map((item) => (
                  <div key={item.id} className="grid grid-cols-12 gap-2 items-end">
                    <div className="col-span-5">
                      <Label className="text-xs">Descripción</Label>
                      <Input
                        value={item.description}
                        onChange={(e) => updateItem(item.id, 'description', e.target.value)}
                        placeholder="Descripción del item"
                        className="h-9"
                      />
                    </div>
                    <div className="col-span-2">
                      <Label className="text-xs">Cantidad</Label>
                      <Input
                        type="number"
                        min={1}
                        value={item.quantity}
                        onChange={(e) => updateItem(item.id, 'quantity', Number(e.target.value) || 1)}
                        className="h-9"
                      />
                    </div>
                    <div className="col-span-2">
                      <Label className="text-xs">Peso (kg)</Label>
                      <Input
                        type="number"
                        step="0.1"
                        value={item.weight_kg || ''}
                        onChange={(e) => updateItem(item.id, 'weight_kg', Number(e.target.value) || 0)}
                        placeholder="0"
                        className="h-9"
                      />
                    </div>
                    <div className="col-span-2">
                      <Label className="text-xs">Valor Unit.</Label>
                      <Input
                        type="number"
                        value={item.unit_value || ''}
                        onChange={(e) => updateItem(item.id, 'unit_value', Number(e.target.value) || 0)}
                        placeholder="0"
                        className="h-9"
                      />
                    </div>
                    <div className="col-span-1 flex justify-end">
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        onClick={() => removeItem(item.id)}
                        className="text-red-500 hover:text-red-700 dark:text-red-400 dark:hover:text-red-200"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Notas */}
          <div className="space-y-2">
            <Label>Notas</Label>
            <RichTextEditor
              value={formData.notes}
              onChange={(html) => setFormData((p) => ({ ...p, notes: html }))}
              placeholder="Notas adicionales..."
              minHeight={60}
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
