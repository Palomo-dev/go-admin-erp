'use client';

import React, { useEffect, useState } from 'react';
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
import { SearchSelect } from '@/components/ui/search-select';
import { Loader2 } from 'lucide-react';
import {
  type Printer,
  type PrinterFormData,
  type PrinterConnectionType,
  type PrinterStation,
  STATION_LABELS,
  CONNECTION_TYPE_LABELS,
} from '../printersService';

interface PrinterFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  printer?: Printer | null;
  branches: { id: number; name: string }[];
  onSave: (form: PrinterFormData) => Promise<void>;
}

const CONNECTION_TYPES: PrinterConnectionType[] = ['usb', 'network', 'bluetooth', 'system'];
const STATIONS: PrinterStation[] = ['hot_kitchen', 'cold_kitchen', 'bar', 'cashier', 'all'];

const emptyForm: PrinterFormData = {
  name: '',
  branch_id: null,
  connection_type: 'network',
  ip_address: '',
  port: 9100,
  vendor_id: '',
  product_id: '',
  mac_address: '',
  driver: 'escpos_generic',
  paper_width: '80mm',
  is_active: true,
  notes: '',
  stations: [],
};

export function PrinterFormDialog({ open, onOpenChange, printer, branches, onSave }: PrinterFormDialogProps) {
  const [form, setForm] = useState<PrinterFormData>(emptyForm);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    if (printer) {
      setForm({
        name: printer.name,
        branch_id: printer.branch_id,
        connection_type: printer.connection_type,
        ip_address: printer.ip_address || '',
        port: printer.port || 9100,
        vendor_id: printer.vendor_id || '',
        product_id: printer.product_id || '',
        mac_address: printer.mac_address || '',
        driver: printer.driver,
        paper_width: printer.paper_width,
        is_active: printer.is_active,
        notes: printer.notes || '',
        stations: (printer.printer_station_assignments || []).map((s) => s.station),
      });
    } else {
      setForm(emptyForm);
    }
  }, [open, printer]);

  const toggleStation = (station: PrinterStation) => {
    setForm((prev) => ({
      ...prev,
      stations: prev.stations.includes(station)
        ? prev.stations.filter((s) => s !== station)
        : [...prev.stations, station],
    }));
  };

  const handleSubmit = async () => {
    if (!form.name.trim()) return;
    setSaving(true);
    try {
      await onSave(form);
      onOpenChange(false);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{printer ? 'Editar Impresora' : 'Nueva Impresora'}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <Label>Nombre</Label>
            <Input
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              placeholder="Ej: Impresora Cocina Caliente"
            />
          </div>

          <div>
            <Label>Sucursal</Label>
            <SearchSelect
              options={branches.map((b) => ({ value: String(b.id), label: b.name }))}
              value={form.branch_id ? String(form.branch_id) : ''}
              onValueChange={(value) => setForm((f) => ({ ...f, branch_id: value ? Number(value) : null }))}
              placeholder="Todas las sucursales"
              className="w-full"
            />
          </div>

          <div>
            <Label>Tipo de conexión</Label>
            <SearchSelect
              options={CONNECTION_TYPES.map((c) => ({ value: c, label: CONNECTION_TYPE_LABELS[c] }))}
              value={form.connection_type}
              onValueChange={(value) => setForm((f) => ({ ...f, connection_type: value as PrinterConnectionType }))}
              className="w-full"
            />
          </div>

          {form.connection_type === 'network' && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Dirección IP</Label>
                <Input
                  value={form.ip_address || ''}
                  onChange={(e) => setForm((f) => ({ ...f, ip_address: e.target.value }))}
                  placeholder="192.168.1.100"
                />
              </div>
              <div>
                <Label>Puerto</Label>
                <Input
                  type="number"
                  value={form.port ?? ''}
                  onChange={(e) => setForm((f) => ({ ...f, port: e.target.value ? Number(e.target.value) : null }))}
                  placeholder="9100"
                />
              </div>
            </div>
          )}

          {form.connection_type === 'usb' && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Vendor ID</Label>
                <Input
                  value={form.vendor_id || ''}
                  onChange={(e) => setForm((f) => ({ ...f, vendor_id: e.target.value }))}
                  placeholder="0x04b8"
                />
              </div>
              <div>
                <Label>Product ID</Label>
                <Input
                  value={form.product_id || ''}
                  onChange={(e) => setForm((f) => ({ ...f, product_id: e.target.value }))}
                  placeholder="0x0202"
                />
              </div>
            </div>
          )}

          {form.connection_type === 'bluetooth' && (
            <div>
              <Label>Dirección MAC</Label>
              <Input
                value={form.mac_address || ''}
                onChange={(e) => setForm((f) => ({ ...f, mac_address: e.target.value }))}
                placeholder="00:11:22:33:44:55"
              />
            </div>
          )}

          <div>
            <Label>Ancho de papel</Label>
            <SearchSelect
              options={[
                { value: '80mm', label: '80mm' },
                { value: '58mm', label: '58mm' },
              ]}
              value={form.paper_width}
              onValueChange={(value) => setForm((f) => ({ ...f, paper_width: value as '58mm' | '80mm' }))}
              className="w-full"
            />
          </div>

          <div>
            <Label className="mb-2 block">Estaciones asignadas</Label>
            <div className="grid grid-cols-2 gap-2">
              {STATIONS.map((station) => (
                <label key={station} className="flex items-center gap-2 text-sm cursor-pointer">
                  <Checkbox
                    checked={form.stations.includes(station)}
                    onCheckedChange={() => toggleStation(station)}
                  />
                  {STATION_LABELS[station]}
                </label>
              ))}
            </div>
          </div>

          <div>
            <Label>Notas</Label>
            <Textarea
              value={form.notes || ''}
              onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
              placeholder="Marca, modelo, ubicación, etc."
              rows={2}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancelar
          </Button>
          <Button onClick={handleSubmit} disabled={saving || !form.name.trim()}>
            {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Guardar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
