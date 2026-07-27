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
import { Loader2, Wifi, Printer as PrinterIcon, Check, Usb, AlertTriangle } from 'lucide-react';
import { cn } from '@/utils/Utils';
import {
  type Printer,
  type PrinterFormData,
  type PrinterConnectionType,
  type PrinterStation,
  STATION_LABELS,
  CONNECTION_TYPE_LABELS,
} from '../printersService';
import {
  isDesktop,
  desktopSupports,
  getDesktopBridge,
  type DesktopPrintersResponse,
  type DesktopDiscoverResponse,
  type DesktopUsbResponse,
  type DesktopUsbDevice,
} from '@/lib/utils/desktop';

const DISCOVERY_URL = 'http://localhost:3456';

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
  const [detecting, setDetecting] = useState(false);
  const [systemPrinters, setSystemPrinters] = useState<{ name: string; isDefault: boolean }[]>([]);
  const [networkPrinters, setNetworkPrinters] = useState<{ ip: string; port: number }[]>([]);
  const [usbDevices, setUsbDevices] = useState<DesktopUsbDevice[]>([]);
  const [showDetected, setShowDetected] = useState(false);
  const [detectError, setDetectError] = useState<string | null>(null);

  const detectionErrorMessage = isDesktop()
    ? 'No se pudieron detectar impresoras. Verifica que el agente esté iniciado en Go Admin Desktop.'
    : 'No se pudo conectar al Print Agent. Instala Go Admin Desktop o asegúrate de que el agente esté corriendo en esta PC.';

  /**
   * Dentro de Go Admin Desktop se consulta el hardware por IPC nativo.
   * En el navegador se usa el servidor de descubrimiento del print-agent
   * de consola (HTTP en localhost).
   */
  const fetchDetection = (): Promise<
    [
      PromiseSettledResult<DesktopPrintersResponse>,
      PromiseSettledResult<DesktopDiscoverResponse>,
      PromiseSettledResult<DesktopUsbResponse>,
    ]
  > => {
    const bridge = getDesktopBridge();

    // El USB se pide por el puente si el Desktop instalado lo soporta, y si no
    // por HTTP: el servidor de descubrimiento del agente expone /usb en ambos
    // casos, asi que un .exe antiguo sigue detectando dispositivos.
    const usb: Promise<DesktopUsbResponse> =
      bridge && desktopSupports('listUsbDevices')
        ? bridge.listUsbDevices!()
        : fetch(`${DISCOVERY_URL}/usb`).then((r) => r.json());

    const base =
      bridge && desktopSupports('listPrinters') && desktopSupports('discoverNetwork')
        ? [bridge.listPrinters!(), bridge.discoverNetwork!()]
        : [
            fetch(`${DISCOVERY_URL}/printers`).then((r) => r.json()),
            fetch(`${DISCOVERY_URL}/discover`).then((r) => r.json()),
          ];

    return Promise.allSettled([...base, usb]) as Promise<
      [
        PromiseSettledResult<DesktopPrintersResponse>,
        PromiseSettledResult<DesktopDiscoverResponse>,
        PromiseSettledResult<DesktopUsbResponse>,
      ]
    >;
  };

  const handleDetect = async () => {
    setDetecting(true);
    setDetectError(null);
    setSystemPrinters([]);
    setNetworkPrinters([]);
    setUsbDevices([]);
    setShowDetected(true);
    try {
      const [printersRes, discoverRes, usbRes] = await fetchDetection();

      if (printersRes.status === 'fulfilled' && printersRes.value?.printers) {
        setSystemPrinters(printersRes.value.printers);
      }
      if (discoverRes.status === 'fulfilled' && discoverRes.value?.printers) {
        setNetworkPrinters(discoverRes.value.printers);
      }
      if (usbRes.status === 'fulfilled' && usbRes.value?.devices) {
        setUsbDevices(usbRes.value.devices);
      }
      if (
        printersRes.status === 'rejected' &&
        discoverRes.status === 'rejected' &&
        usbRes.status === 'rejected'
      ) {
        setDetectError(detectionErrorMessage);
      }
    } catch {
      setDetectError(detectionErrorMessage);
    } finally {
      setDetecting(false);
    }
  };

  const selectSystemPrinter = (name: string) => {
    setForm((f) => ({ ...f, connection_type: 'system', name: f.name || name }));
    setShowDetected(false);
  };

  const selectNetworkPrinter = (ip: string, port: number) => {
    setForm((f) => ({ ...f, connection_type: 'network', ip_address: ip, port, name: f.name || `Impresora ${ip}` }));
    setShowDetected(false);
  };

  const selectUsbDevice = (device: DesktopUsbDevice) => {
    setForm((f) => ({
      ...f,
      connection_type: 'usb',
      vendor_id: device.vendorId,
      product_id: device.productId,
      name: f.name || device.name || `USB ${device.vendorId}:${device.productId}`,
    }));
    setShowDetected(false);
  };

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

  /**
   * Cada tipo de conexion necesita sus propios datos para que el agente pueda
   * hablarle al hardware. Antes solo se exigia el nombre, asi que se podia
   * guardar una impresora USB sin Vendor/Product ID: el agente fallaba al
   * imprimir y el error no llegaba a esta pantalla, con lo que parecia que
   * ESC/POS simplemente no funcionaba.
   */
  const validationError = ((): string | null => {
    if (!form.name.trim()) return 'Escribe un nombre para identificar la impresora.';

    if (form.connection_type === 'network' && !form.ip_address?.trim()) {
      return 'Una impresora de red necesita su direccion IP.';
    }
    if (form.connection_type === 'usb' && (!form.vendor_id?.trim() || !form.product_id?.trim())) {
      return 'Una impresora USB necesita Vendor ID y Product ID. Pulsa "Detectar impresoras" para rellenarlos.';
    }
    if (form.connection_type === 'bluetooth' && !form.mac_address?.trim()) {
      return 'Una impresora Bluetooth necesita su direccion MAC.';
    }
    return null;
  })();

  const handleSubmit = async () => {
    if (validationError) return;
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

          {/* Botón detectar impresoras */}
          <div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleDetect}
              disabled={detecting}
              className="w-full"
            >
              {detecting ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Detectando impresoras...
                </>
              ) : (
                <>
                  <Wifi className="h-4 w-4 mr-2" />
                  Detectar impresoras automáticamente
                </>
              )}
            </Button>

            {detectError && (
              <p className="text-xs text-red-500 mt-2">{detectError}</p>
            )}

            {showDetected && !detectError && (
              <div className="mt-3 space-y-3 border rounded-lg p-3 bg-gray-50 dark:bg-gray-800/50">
                {/* Impresoras del sistema */}
                <div>
                  <p className="text-xs font-medium text-gray-600 dark:text-gray-400 mb-2 flex items-center gap-1">
                    <PrinterIcon className="h-3 w-3" />
                    Impresoras del sistema ({systemPrinters.length})
                  </p>
                  {systemPrinters.length === 0 ? (
                    <p className="text-xs text-gray-400">No se encontraron impresoras instaladas</p>
                  ) : (
                    <div className="space-y-1">
                      {systemPrinters.map((p) => (
                        <button
                          key={p.name}
                          type="button"
                          onClick={() => selectSystemPrinter(p.name)}
                          className="flex items-center justify-between w-full text-left px-2 py-1.5 text-xs rounded hover:bg-white dark:hover:bg-gray-700 transition-colors"
                        >
                          <span className="flex items-center gap-2">
                            <PrinterIcon className="h-3 w-3 text-gray-400" />
                            {p.name}
                          </span>
                          {p.isDefault && (
                            <span className="text-[10px] text-blue-500 font-medium">Predeterminada</span>
                          )}
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {/* Impresoras de red */}
                <div>
                  <p className="text-xs font-medium text-gray-600 dark:text-gray-400 mb-2 flex items-center gap-1">
                    <Wifi className="h-3 w-3" />
                    Impresoras de red ({networkPrinters.length})
                  </p>
                  {networkPrinters.length === 0 ? (
                    <p className="text-xs text-gray-400">No se encontraron impresoras en la red</p>
                  ) : (
                    <div className="space-y-1">
                      {networkPrinters.map((p) => (
                        <button
                          key={p.ip}
                          type="button"
                          onClick={() => selectNetworkPrinter(p.ip, p.port)}
                          className="flex items-center justify-between w-full text-left px-2 py-1.5 text-xs rounded hover:bg-white dark:hover:bg-gray-700 transition-colors"
                        >
                          <span className="flex items-center gap-2">
                            <Wifi className="h-3 w-3 text-green-500" />
                            {p.ip}:{p.port}
                          </span>
                          <Check className="h-3 w-3 text-green-500" />
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {/* Dispositivos USB */}
                <div>
                  <p className="text-xs font-medium text-gray-600 dark:text-gray-400 mb-2 flex items-center gap-1">
                    <Usb className="h-3 w-3" />
                    Dispositivos USB ({usbDevices.length})
                  </p>
                  {usbDevices.length === 0 ? (
                    <p className="text-xs text-gray-400">
                      No se encontraron dispositivos USB. Una impresora ya instalada en Windows no
                      aparece aqui: pertenece al spooler y esta via no la alcanza. Usala como{' '}
                      <strong>Impresora del sistema</strong>.
                    </p>
                  ) : (
                    <div className="space-y-1">
                      {usbDevices.map((d) => (
                        <button
                          key={`${d.vendorId}:${d.productId}`}
                          type="button"
                          onClick={() => selectUsbDevice(d)}
                          className="flex items-center justify-between w-full text-left px-2 py-1.5 text-xs rounded hover:bg-white dark:hover:bg-gray-700 transition-colors"
                        >
                          <span className="flex items-center gap-2 min-w-0">
                            <Usb className={cn('h-3 w-3 shrink-0', d.isPrinter ? 'text-green-500' : 'text-gray-400')} />
                            <span className="truncate">{d.name || `${d.vendorId}:${d.productId}`}</span>
                          </span>
                          <span className="shrink-0 ml-2 text-[10px] text-gray-400 font-mono">
                            {d.vendorId}:{d.productId}
                          </span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                <p className="text-[10px] text-gray-400">
                  Haz clic en una impresora para autocompletar el formulario
                </p>
              </div>
            )}
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
            <div className="flex gap-2 rounded-md bg-amber-50 dark:bg-amber-950/30 px-3 py-2 text-xs text-amber-700 dark:text-amber-400">
              <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
              <span>
                La conexion USB le habla al dispositivo por libusb, saltandose Windows. Si esta
                impresora ya aparece instalada en Windows, el spooler tiene el dispositivo tomado y
                esta via <strong>no va a funcionar</strong>: elige <strong>Impresora del sistema</strong>{' '}
                y seleccionala por su nombre.
              </span>
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

        {validationError && (
          <p className="text-xs text-amber-600 dark:text-amber-400 text-right">{validationError}</p>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancelar
          </Button>
          <Button onClick={handleSubmit} disabled={saving || !!validationError}>
            {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Guardar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
