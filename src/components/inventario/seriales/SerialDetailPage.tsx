'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { RichTextEditor } from '@/components/shared/RichTextEditor';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useToast } from '@/components/ui/use-toast';
import { Skeleton } from '@/components/ui/skeleton';
import {
  ArrowLeft,
  Eye,
  Package,
  CheckCircle2,
  XCircle,
  Truck,
  AlertTriangle,
  Clock,
  RotateCcw,
  ShieldCheck,
  MapPin,
  User,
  DollarSign,
  Calendar,
  Building2,
  ShoppingCart,
  FileText,
  Wrench,
  RefreshCw,
  Loader2,
} from 'lucide-react';
import { serialTrackingService } from '@/lib/services/serialTrackingService';
import type { SerialWithDetails, SerialStatus, SerialTrackingEvent } from '@/lib/services/serialTrackingService';
import { getOrganizationId, getCurrentBranchId, getCurrentUserId } from '@/lib/hooks/useOrganization';
import { formatDate, formatCurrency } from '@/utils/Utils';

const STATUS_CONFIG: Record<SerialStatus, { label: string; color: string; icon: React.ReactNode }> = {
  in_stock: { label: 'En Stock', color: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400', icon: <CheckCircle2 size={14} /> },
  reserved: { label: 'Reservado', color: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400', icon: <Clock size={14} /> },
  sold: { label: 'Vendido', color: 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400', icon: <Package size={14} /> },
  returned: { label: 'Devuelto', color: 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400', icon: <RotateCcw size={14} /> },
  in_transit: { label: 'En Tránsito', color: 'bg-cyan-100 text-cyan-800 dark:bg-cyan-900/30 dark:text-cyan-400', icon: <Truck size={14} /> },
  damaged: { label: 'Dañado', color: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400', icon: <AlertTriangle size={14} /> },
  rma: { label: 'RMA', color: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400', icon: <AlertTriangle size={14} /> },
  warranty_claim: { label: 'Reclamo Garantía', color: 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900/30 dark:text-indigo-400', icon: <ShieldCheck size={14} /> },
};

const EVENT_LABELS: Record<string, { label: string; color: string; icon: React.ReactNode }> = {
  received: { label: 'Recibido', color: 'text-green-600 dark:text-green-400', icon: <Package size={14} /> },
  stock_in: { label: 'Ingreso a Stock', color: 'text-green-600 dark:text-green-400', icon: <CheckCircle2 size={14} /> },
  reserved: { label: 'Reservado', color: 'text-blue-600 dark:text-blue-400', icon: <Clock size={14} /> },
  sold: { label: 'Vendido', color: 'text-purple-600 dark:text-purple-400', icon: <ShoppingCart size={14} /> },
  returned: { label: 'Devuelto', color: 'text-orange-600 dark:text-orange-400', icon: <RotateCcw size={14} /> },
  transferred: { label: 'Transferido', color: 'text-cyan-600 dark:text-cyan-400', icon: <Truck size={14} /> },
  damaged: { label: 'Dañado', color: 'text-red-600 dark:text-red-400', icon: <AlertTriangle size={14} /> },
  rma_created: { label: 'RMA Creado', color: 'text-yellow-600 dark:text-yellow-400', icon: <AlertTriangle size={14} /> },
  warranty_claim: { label: 'Reclamo Garantía', color: 'text-indigo-600 dark:text-indigo-400', icon: <ShieldCheck size={14} /> },
  warranty_resolved: { label: 'Garantía Resuelta', color: 'text-indigo-600 dark:text-indigo-400', icon: <ShieldCheck size={14} /> },
  status_change: { label: 'Cambio de Estado', color: 'text-gray-600 dark:text-gray-400', icon: <RefreshCw size={14} /> },
};

interface SerialDetailPageProps {
  serialId: number;
}

export function SerialDetailPage({ serialId }: SerialDetailPageProps) {
  const router = useRouter();
  const { toast } = useToast();
  const organizationId = getOrganizationId();
  const branchId = getCurrentBranchId();

  const [serial, setSerial] = useState<SerialWithDetails | null>(null);
  const [events, setEvents] = useState<SerialTrackingEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);

  const [showTransferDialog, setShowTransferDialog] = useState(false);
  const [showDamageDialog, setShowDamageDialog] = useState(false);
  const [showStatusDialog, setShowStatusDialog] = useState(false);

  const [transferBranch, setTransferBranch] = useState('');
  const [damageNotes, setDamageNotes] = useState('');
  const [newStatus, setNewStatus] = useState<SerialStatus>('in_stock');
  const [statusNotes, setStatusNotes] = useState('');
  const [sucursales, setSucursales] = useState<{ id: number; name: string }[]>([]);

  const fetchSerial = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await serialTrackingService.getSerialById(serialId);
      if (error) throw error;
      setSerial(data);
      setEvents(data?.events || []);
    } catch (err: any) {
      console.error('Error cargando detalle de serial:', err);
      toast({
        title: 'Error',
        description: err.message || 'No se pudo cargar el serial',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  }, [serialId, toast]);

  const fetchSucursales = useCallback(async () => {
    try {
      const { supabase } = await import('@/lib/supabase/config');
      const { data } = await supabase
        .from('branches')
        .select('id, name')
        .eq('organization_id', organizationId)
        .order('name');
      if (data) setSucursales(data);
    } catch (err) {
      console.error('Error cargando sucursales:', err);
    }
  }, [organizationId]);

  useEffect(() => {
    fetchSerial();
    fetchSucursales();
  }, [fetchSerial, fetchSucursales]);

  const handleTransfer = async () => {
    if (!transferBranch) {
      toast({ title: 'Error', description: 'Seleccione una sucursal destino', variant: 'destructive' });
      return;
    }
    setActionLoading(true);
    try {
      const userId = await getCurrentUserId();
      const { error } = await serialTrackingService.transferSerial(serialId, Number(transferBranch), userId || undefined);
      if (error) throw error;
      toast({ title: 'Transferencia exitosa', description: 'El serial fue marcado en tránsito' });
      setShowTransferDialog(false);
      setTransferBranch('');
      fetchSerial();
    } catch (err: any) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    } finally {
      setActionLoading(false);
    }
  };

  const handleDamage = async () => {
    if (!damageNotes.trim()) {
      toast({ title: 'Error', description: 'Ingrese una descripción del daño', variant: 'destructive' });
      return;
    }
    setActionLoading(true);
    try {
      const userId = await getCurrentUserId();
      const { error } = await serialTrackingService.markAsDamaged(serialId, damageNotes, userId || undefined);
      if (error) throw error;
      toast({ title: 'Serial marcado como dañado' });
      setShowDamageDialog(false);
      setDamageNotes('');
      fetchSerial();
    } catch (err: any) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    } finally {
      setActionLoading(false);
    }
  };

  const handleStatusChange = async () => {
    setActionLoading(true);
    try {
      const userId = await getCurrentUserId();
      const { error } = await serialTrackingService.updateStatus(serialId, newStatus, {
        notes: statusNotes || undefined,
        performed_by: userId || undefined,
      });
      if (error) throw error;
      toast({ title: 'Estado actualizado' });
      setShowStatusDialog(false);
      setStatusNotes('');
      fetchSerial();
    } catch (err: any) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    } finally {
      setActionLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="p-6 space-y-4">
        <Skeleton className="h-8 w-48" />
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <Skeleton className="h-48 rounded-lg" />
          <Skeleton className="h-48 rounded-lg" />
          <Skeleton className="h-48 rounded-lg" />
          <Skeleton className="h-48 rounded-lg" />
        </div>
      </div>
    );
  }

  if (!serial) {
    return (
      <div className="p-6 text-center">
        <Package className="w-12 h-12 mx-auto mb-3 opacity-30 text-gray-400" />
        <p className="text-gray-500 dark:text-gray-400 mb-2">Serial no encontrado</p>
        <Link href="/app/inventario/seriales">
          <Button variant="outline" size="sm">Volver a la lista</Button>
        </Link>
      </div>
    );
  }

  const statusCfg = STATUS_CONFIG[serial.status] || STATUS_CONFIG.in_stock;
  const warrantyValid = serial.warranty_end ? new Date(serial.warranty_end) > new Date() : false;
  const warrantyDaysLeft = serial.warranty_end
    ? Math.ceil((new Date(serial.warranty_end).getTime() - Date.now()) / (1000 * 60 * 60 * 24))
    : 0;

  return (
    <div className="space-y-4 p-4 sm:p-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Link href="/app/inventario/seriales">
            <Button variant="ghost" size="icon" className="h-8 w-8">
              <ArrowLeft size={18} />
            </Button>
          </Link>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-white font-mono">
                {serial.serial}
              </h1>
              <Badge className={`${statusCfg.color} gap-1`} variant="secondary">
                {statusCfg.icon}
                {statusCfg.label}
              </Badge>
            </div>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
              {serial.products?.name || 'N/A'} · SKU: {serial.products?.sku || 'N/A'}
            </p>
          </div>
        </div>
      </div>

      {/* Action Buttons */}
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" size="sm" onClick={() => setShowTransferDialog(true)}>
          <Truck size={16} className="mr-1" />
          Transferir
        </Button>
        <Button variant="outline" size="sm" onClick={() => setShowDamageDialog(true)}>
          <AlertTriangle size={16} className="mr-1" />
          Marcar Dañado
        </Button>
        <Button variant="outline" size="sm" onClick={() => setShowStatusDialog(true)}>
          <RefreshCw size={16} className="mr-1" />
          Cambiar Estado
        </Button>
      </div>

      {/* Info Cards */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Product Info */}
        <Card className="dark:bg-gray-800/50 dark:border-gray-700">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Package size={16} /> Información del Producto
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <InfoRow label="Producto" value={serial.products?.name || 'N/A'} />
            <InfoRow label="SKU" value={serial.products?.sku || 'N/A'} />
            <InfoRow label="Marca" value={serial.products?.brand || 'N/A'} />
            <InfoRow label="Referencia" value={serial.products?.reference || 'N/A'} />
            <InfoRow label="Tracking Serial" value={serial.products?.track_serial ? 'Sí' : 'No'} />
          </CardContent>
        </Card>

        {/* Origin Info */}
        <Card className="dark:bg-gray-800/50 dark:border-gray-700">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Building2 size={16} /> Origen / Recepción
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <InfoRow label="Proveedor" value={serial.suppliers?.name || 'N/A'} icon={<Truck size={14} />} />
            <InfoRow label="Factura de Compra" value={serial.purchase_invoice_id ? serial.purchase_invoice_id.substring(0, 8) + '...' : 'N/A'} />
            <InfoRow label="Orden de Compra" value={serial.purchase_order_id ? `#${serial.purchase_order_id}` : 'N/A'} />
            <InfoRow label="Lote" value={serial.lot_id ? `#${serial.lot_id}` : 'N/A'} />
            <InfoRow label="Costo de Compra" value={serial.cost_at_purchase ? formatCurrency(serial.cost_at_purchase, 'COP') : 'N/A'} icon={<DollarSign size={14} />} />
            <InfoRow label="Sucursal Recepción" value={serial.branches?.name || 'N/A'} icon={<MapPin size={14} />} />
            <InfoRow label="Fecha Recepción" value={serial.received_date ? formatDate(serial.received_date) : 'N/A'} icon={<Calendar size={14} />} />
          </CardContent>
        </Card>

        {/* Sale Info */}
        <Card className="dark:bg-gray-800/50 dark:border-gray-700">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <ShoppingCart size={16} /> Venta
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <InfoRow label="Canal de Venta" value={serial.sale_channel && serial.sale_channel !== 'in_stock' ? serial.sale_channel : 'No vendido'} />
            <InfoRow label="Cliente" value={serial.customers?.full_name || 'N/A'} icon={<User size={14} />} />
            <InfoRow label="Vendedor" value={serial.sold_by_user?.email || 'N/A'} />
            <InfoRow label="Sucursal Venta" value={serial.current_branch?.name || 'N/A'} icon={<MapPin size={14} />} />
            <InfoRow label="Precio de Venta" value={serial.price_at_sale ? formatCurrency(serial.price_at_sale, 'COP') : 'N/A'} icon={<DollarSign size={14} />} />
            <InfoRow label="Fecha de Venta" value={serial.sale_date ? formatDate(serial.sale_date) : 'N/A'} icon={<Calendar size={14} />} />
            <InfoRow label="Venta ID" value={serial.sale_id || serial.invoice_sale_id || serial.web_order_id || 'N/A'} icon={<FileText size={14} />} />
          </CardContent>
        </Card>

        {/* Warranty Info */}
        <Card className="dark:bg-gray-800/50 dark:border-gray-700">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <ShieldCheck size={16} /> Garantía
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <InfoRow label="Meses de Garantía" value={serial.warranty_months ? `${serial.warranty_months} meses` : 'Sin garantía'} />
            <InfoRow label="Inicio Garantía" value={serial.warranty_start ? formatDate(serial.warranty_start) : 'N/A'} icon={<Calendar size={14} />} />
            <InfoRow label="Fin Garantía" value={serial.warranty_end ? formatDate(serial.warranty_end) : 'N/A'} icon={<Calendar size={14} />} />
            <div className="flex items-center justify-between pt-2 border-t border-gray-200 dark:border-gray-700">
              <span className="text-gray-500 dark:text-gray-400">Estado</span>
              {serial.warranty_end ? (
                <Badge className={warrantyValid ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400' : 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400'}>
                  {warrantyValid ? `Vigente (${warrantyDaysLeft} días)` : 'Vencida'}
                </Badge>
              ) : (
                <Badge variant="secondary">N/A</Badge>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Timeline */}
      <Card className="dark:bg-gray-800/50 dark:border-gray-700">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Clock size={16} /> Historial de Trazabilidad
          </CardTitle>
        </CardHeader>
        <CardContent>
          {events.length === 0 ? (
            <p className="text-sm text-gray-500 dark:text-gray-400 text-center py-6">
              No hay eventos registrados
            </p>
          ) : (
            <div className="space-y-3">
              {events.map((event, index) => {
                const eventCfg = EVENT_LABELS[event.event_type] || EVENT_LABELS.status_change;
                return (
                  <div key={event.id} className="flex gap-3">
                    <div className="flex flex-col items-center">
                      <div className={`p-1.5 rounded-full bg-gray-100 dark:bg-gray-700 ${eventCfg.color}`}>
                        {eventCfg.icon}
                      </div>
                      {index < events.length - 1 && (
                        <div className="w-px h-full bg-gray-200 dark:bg-gray-700 min-h-[24px]" />
                      )}
                    </div>
                    <div className="flex-1 pb-3">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium text-gray-900 dark:text-white">
                          {eventCfg.label}
                        </span>
                        <span className="text-xs text-gray-500 dark:text-gray-400">
                          {formatDate(event.event_date)}
                        </span>
                      </div>
                      <div className="text-xs text-gray-500 dark:text-gray-400 mt-1 space-y-0.5">
                        {event.from_status && event.to_status && (
                          <p>Estado: {event.from_status} → {event.to_status}</p>
                        )}
                        {event.from_branch_id && event.to_branch_id && (
                          <p>Sucursal: {event.from_branch_id} → {event.to_branch_id}</p>
                        )}
                        {event.source_table && (
                          <p>Origen: {event.source_table}{event.source_id ? ` #${event.source_id.substring(0, 8)}` : ''}</p>
                        )}
                        {event.notes && <p className="italic">{event.notes}</p>}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Transfer Dialog */}
      <Dialog open={showTransferDialog} onOpenChange={setShowTransferDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Transferir Serial</DialogTitle>
            <DialogDescription>
              Seleccione la sucursal destino. El serial se marcará como "En Tránsito".
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Sucursal Destino</Label>
              <Select value={transferBranch} onValueChange={setTransferBranch}>
                <SelectTrigger>
                  <SelectValue placeholder="Seleccione sucursal..." />
                </SelectTrigger>
                <SelectContent>
                  {sucursales.filter(s => s.id !== serial.current_branch_id).map((s) => (
                    <SelectItem key={s.id} value={String(s.id)}>{s.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowTransferDialog(false)}>Cancelar</Button>
            <Button onClick={handleTransfer} disabled={actionLoading}>
              {actionLoading && <Loader2 size={16} className="mr-1 animate-spin" />}
              Transferir
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Damage Dialog */}
      <Dialog open={showDamageDialog} onOpenChange={setShowDamageDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Marcar como Dañado</DialogTitle>
            <DialogDescription>
              Describa el daño. El serial cambiará a estado "Dañado".
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Descripción del Daño</Label>
              <RichTextEditor
                value={damageNotes}
                onChange={(html) => setDamageNotes(html)}
                placeholder="Describa el problema..."
                minHeight={60}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDamageDialog(false)}>Cancelar</Button>
            <Button variant="destructive" onClick={handleDamage} disabled={actionLoading}>
              {actionLoading && <Loader2 size={16} className="mr-1 animate-spin" />}
              Marcar Dañado
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Status Change Dialog */}
      <Dialog open={showStatusDialog} onOpenChange={setShowStatusDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Cambiar Estado</DialogTitle>
            <DialogDescription>
              Cambie manualmente el estado del serial.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Nuevo Estado</Label>
              <Select value={newStatus} onValueChange={(v) => setNewStatus(v as SerialStatus)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(STATUS_CONFIG).map(([key, cfg]) => (
                    <SelectItem key={key} value={key}>{cfg.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Notas (opcional)</Label>
              <Textarea
                value={statusNotes}
                onChange={(e) => setStatusNotes(e.target.value)}
                placeholder="Razón del cambio..."
                rows={2}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowStatusDialog(false)}>Cancelar</Button>
            <Button onClick={handleStatusChange} disabled={actionLoading}>
              {actionLoading && <Loader2 size={16} className="mr-1 animate-spin" />}
              Cambiar Estado
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function InfoRow({ label, value, icon }: { label: string; value: string; icon?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-gray-500 dark:text-gray-400 flex items-center gap-1.5">
        {icon}
        {label}
      </span>
      <span className="font-medium text-gray-900 dark:text-white text-right truncate max-w-[60%]">
        {value}
      </span>
    </div>
  );
}
