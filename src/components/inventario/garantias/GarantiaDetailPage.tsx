'use client';

import React, { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
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
  Package,
  CheckCircle2,
  XCircle,
  Clock,
  ShieldCheck,
  MapPin,
  User,
  DollarSign,
  Calendar,
  ShoppingCart,
  Wrench,
  RefreshCw,
  Loader2,
  AlertTriangle,
  Truck,
  FileText,
} from 'lucide-react';
import {
  warrantyClaimsService,
  type WarrantyClaimWithDetails,
  type WarrantyClaimStatus,
  type ResolutionType,
} from '@/lib/services/warrantyClaimsService';
import { getOrganizationId, getCurrentUserId } from '@/lib/hooks/useOrganization';
import { formatDate, formatCurrency } from '@/utils/Utils';

const STATUS_CONFIG: Record<WarrantyClaimStatus, { label: string; color: string; icon: React.ReactNode }> = {
  pending: { label: 'Pendiente', color: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400', icon: <Clock size={14} /> },
  approved: { label: 'Aprobado', color: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400', icon: <CheckCircle2 size={14} /> },
  rejected: { label: 'Rechazado', color: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400', icon: <XCircle size={14} /> },
  in_process: { label: 'En Proceso', color: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400', icon: <Wrench size={14} /> },
  resolved: { label: 'Resuelto', color: 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900/30 dark:text-indigo-400', icon: <CheckCircle2 size={14} /> },
  cancelled: { label: 'Cancelado', color: 'bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-400', icon: <XCircle size={14} /> },
};

const RESOLUTION_LABELS: Record<ResolutionType, string> = {
  repair: 'Reparación',
  replacement: 'Reemplazo',
  refund: 'Reembolso',
  store_credit: 'Crédito Tienda',
  rejected: 'Rechazado',
};

interface GarantiaDetailPageProps {
  claimId: string;
}

export function GarantiaDetailPage({ claimId }: GarantiaDetailPageProps) {
  const { toast } = useToast();
  const organizationId = getOrganizationId();

  const [claim, setClaim] = useState<WarrantyClaimWithDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);

  const [showResolveDialog, setShowResolveDialog] = useState(false);
  const [showRMADialog, setShowRMADialog] = useState(false);

  const [resolutionType, setResolutionType] = useState<ResolutionType>('repair');
  const [resolutionNotes, setResolutionNotes] = useState('');
  const [refundAmount, setRefundAmount] = useState('');
  const [replacementSerialId, setReplacementSerialId] = useState('');
  const [replacementSerials, setReplacementSerials] = useState<{ id: number; serial: string }[]>([]);

  const [rmaNumber, setRmaNumber] = useState('');
  const [supplierResponse, setSupplierResponse] = useState('');

  const fetchClaim = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await warrantyClaimsService.getClaimById(claimId);
      if (error) throw error;
      setClaim(data);
    } catch (err: any) {
      console.error('Error cargando detalle de reclamo:', err);
      toast({
        title: 'Error',
        description: err.message || 'No se pudo cargar el reclamo',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  }, [claimId, toast]);

  useEffect(() => {
    fetchClaim();
  }, [fetchClaim]);

  const handleApprove = async () => {
    setActionLoading(true);
    try {
      const { error } = await warrantyClaimsService.updateStatus(claimId, 'approved');
      if (error) throw error;
      toast({ title: 'Reclamo aprobado', description: 'El reclamo ha sido aprobado' });
      fetchClaim();
    } catch (err: any) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    } finally {
      setActionLoading(false);
    }
  };

  const handleReject = async () => {
    setActionLoading(true);
    try {
      const { error } = await warrantyClaimsService.updateStatus(claimId, 'rejected', {
        resolution_type: 'rejected',
        resolution: 'Reclamo rechazado',
      });
      if (error) throw error;
      toast({ title: 'Reclamo rechazado' });
      fetchClaim();
    } catch (err: any) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    } finally {
      setActionLoading(false);
    }
  };

  const handleStartProcess = async () => {
    setActionLoading(true);
    try {
      const { error } = await warrantyClaimsService.updateStatus(claimId, 'in_process');
      if (error) throw error;
      toast({ title: 'Reclamo en proceso' });
      fetchClaim();
    } catch (err: any) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    } finally {
      setActionLoading(false);
    }
  };

  const handleOpenResolveDialog = async () => {
    if (claim?.serial_numbers?.product_id) {
      const { data } = await warrantyClaimsService.getSerialsForReplacement(
        organizationId,
        claim.serial_numbers.product_id
      );
      setReplacementSerials(data);
    }
    setResolutionType('repair');
    setResolutionNotes('');
    setRefundAmount('');
    setReplacementSerialId('');
    setShowResolveDialog(true);
  };

  const handleResolve = async () => {
    setActionLoading(true);
    try {
      const resolutionData: any = {
        resolution: resolutionNotes || undefined,
        resolution_type: resolutionType,
      };

      if (resolutionType === 'refund' && refundAmount) {
        resolutionData.refund_amount = Number(refundAmount);
      }
      if (resolutionType === 'replacement' && replacementSerialId) {
        resolutionData.replacement_serial_id = Number(replacementSerialId);
      }

      const { error } = await warrantyClaimsService.updateStatus(claimId, 'resolved', resolutionData);
      if (error) throw error;
      toast({ title: 'Reclamo resuelto', description: 'La resolución ha sido registrada' });
      setShowResolveDialog(false);
      fetchClaim();
    } catch (err: any) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    } finally {
      setActionLoading(false);
    }
  };

  const handleSendRMA = async () => {
    setActionLoading(true);
    try {
      const { error } = await warrantyClaimsService.updateStatus(claimId, 'in_process', {
        supplier_rma_number: rmaNumber || undefined,
        supplier_response: supplierResponse || undefined,
      });
      if (error) throw error;
      toast({ title: 'RMA enviado a proveedor', description: 'El reclamo está en proceso con RMA' });
      setShowRMADialog(false);
      setRmaNumber('');
      setSupplierResponse('');
      fetchClaim();
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

  if (!claim) {
    return (
      <div className="p-6 text-center">
        <ShieldCheck className="w-12 h-12 mx-auto mb-3 opacity-30 text-gray-400" />
        <p className="text-gray-500 dark:text-gray-400 mb-2">Reclamo no encontrado</p>
        <Link href="/app/inventario/garantias">
          <Button variant="outline" size="sm">Volver a la lista</Button>
        </Link>
      </div>
    );
  }

  const statusCfg = STATUS_CONFIG[claim.status] || STATUS_CONFIG.pending;
  const serial = claim.serial_numbers;
  const warrantyValid = serial?.warranty_end ? new Date(serial.warranty_end) > new Date() : false;
  const warrantyDaysLeft = serial?.warranty_end
    ? Math.ceil((new Date(serial.warranty_end).getTime() - Date.now()) / (1000 * 60 * 60 * 24))
    : 0;

  const canAct = claim.status === 'pending' || claim.status === 'approved' || claim.status === 'in_process';

  return (
    <div className="space-y-4 p-4 sm:p-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Link href="/app/inventario/garantias">
            <Button variant="ghost" size="icon" className="h-8 w-8">
              <ArrowLeft size={18} />
            </Button>
          </Link>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-white">
                Reclamo #{claim.id.substring(0, 8)}
              </h1>
              <Badge className={`${statusCfg.color} gap-1`} variant="secondary">
                {statusCfg.icon}
                {statusCfg.label}
              </Badge>
            </div>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
              {claim.claim_reason}
            </p>
          </div>
        </div>
      </div>

      {/* Action Buttons */}
      {canAct && (
        <div className="flex flex-wrap gap-2">
          {claim.status === 'pending' && (
            <>
              <Button variant="outline" size="sm" className="text-green-600 border-green-300 hover:bg-green-50" onClick={handleApprove} disabled={actionLoading}>
                {actionLoading ? <Loader2 size={16} className="mr-1 animate-spin" /> : <CheckCircle2 size={16} className="mr-1" />}
                Aprobar
              </Button>
              <Button variant="outline" size="sm" className="text-red-600 border-red-300 hover:bg-red-50" onClick={handleReject} disabled={actionLoading}>
                <XCircle size={16} className="mr-1" />
                Rechazar
              </Button>
              <Button variant="outline" size="sm" onClick={handleStartProcess} disabled={actionLoading}>
                <Wrench size={16} className="mr-1" />
                Iniciar Proceso
              </Button>
            </>
          )}
          {claim.status === 'approved' && (
            <>
              <Button variant="outline" size="sm" onClick={handleOpenResolveDialog} disabled={actionLoading}>
                <CheckCircle2 size={16} className="mr-1" />
                Resolver
              </Button>
              <Button variant="outline" size="sm" onClick={() => setShowRMADialog(true)} disabled={actionLoading}>
                <Truck size={16} className="mr-1" />
                Enviar a Proveedor (RMA)
              </Button>
            </>
          )}
          {claim.status === 'in_process' && (
            <Button variant="outline" size="sm" onClick={handleOpenResolveDialog} disabled={actionLoading}>
              <CheckCircle2 size={16} className="mr-1" />
              Resolver
            </Button>
          )}
        </div>
      )}

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
            <InfoRow label="Producto" value={serial?.products?.name || 'N/A'} />
            <InfoRow label="SKU" value={serial?.products?.sku || 'N/A'} />
            <InfoRow label="Marca" value={serial?.products?.brand || 'N/A'} />
            <InfoRow label="Serial" value={serial?.serial || 'N/A'} icon={<ShieldCheck size={14} />} />
            <InfoRow label="Fecha de Compra" value={serial?.sale_date ? formatDate(serial.sale_date) : 'N/A'} icon={<Calendar size={14} />} />
            <InfoRow label="Sucursal de Compra" value={serial?.branches?.name || 'N/A'} icon={<MapPin size={14} />} />
            <div className="flex items-center justify-between pt-2 border-t border-gray-200 dark:border-gray-700">
              <span className="text-gray-500 dark:text-gray-400">Estado de Garantía</span>
              {serial?.warranty_end ? (
                <Badge className={warrantyValid ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400' : 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400'}>
                  {warrantyValid ? `Vigente (${warrantyDaysLeft} días)` : 'Vencida'}
                </Badge>
              ) : (
                <Badge variant="secondary">N/A</Badge>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Customer Info */}
        <Card className="dark:bg-gray-800/50 dark:border-gray-700">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <User size={16} /> Información del Cliente
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <InfoRow label="Nombre" value={claim.customers?.full_name || 'N/A'} icon={<User size={14} />} />
            <InfoRow label="Teléfono" value={claim.customers?.phone || 'N/A'} />
            <InfoRow label="Email" value={claim.customers?.email || 'N/A'} />
            <InfoRow label="Dirección" value={(claim.customers as any)?.address || 'N/A'} icon={<MapPin size={14} />} />
          </CardContent>
        </Card>

        {/* Claim Info */}
        <Card className="dark:bg-gray-800/50 dark:border-gray-700">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <FileText size={16} /> Detalles del Reclamo
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <InfoRow label="Fecha del Reclamo" value={formatDate(claim.claim_date)} icon={<Calendar size={14} />} />
            <InfoRow label="Motivo" value={claim.claim_reason} />
            <div className="pt-1">
              <span className="text-gray-500 dark:text-gray-400 block mb-1">Descripción</span>
              <p className="text-gray-900 dark:text-white text-sm bg-gray-50 dark:bg-gray-900/50 rounded p-2">
                {claim.description || 'Sin descripción'}
              </p>
            </div>
            {claim.attachments && claim.attachments.length > 0 && (
              <div className="pt-2 border-t border-gray-200 dark:border-gray-700">
                <span className="text-gray-500 dark:text-gray-400 block mb-1">Adjuntos ({claim.attachments.length})</span>
                <div className="flex flex-wrap gap-2">
                  {claim.attachments.map((att: any, i: number) => (
                    <Badge key={i} variant="outline" className="gap-1">
                      <FileText size={12} />
                      {att.name || `Archivo ${i + 1}`}
                    </Badge>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Resolution Info */}
        <Card className="dark:bg-gray-800/50 dark:border-gray-700">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <ShieldCheck size={16} /> Resolución
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            {claim.resolution_type ? (
              <>
                <InfoRow label="Tipo de Resolución" value={RESOLUTION_LABELS[claim.resolution_type] || claim.resolution_type} />
                {claim.refund_amount != null && (
                  <InfoRow label="Monto Reembolso" value={formatCurrency(claim.refund_amount, 'COP')} icon={<DollarSign size={14} />} />
                )}
                {claim.replacement_serial && (
                  <InfoRow label="Serial de Reemplazo" value={claim.replacement_serial.serial} icon={<Package size={14} />} />
                )}
                {claim.supplier_rma_number && (
                  <InfoRow label="RMA Proveedor" value={claim.supplier_rma_number} icon={<Truck size={14} />} />
                )}
                {claim.supplier_response && (
                  <div className="pt-1">
                    <span className="text-gray-500 dark:text-gray-400 block mb-1">Respuesta del Proveedor</span>
                    <p className="text-gray-900 dark:text-white text-sm bg-gray-50 dark:bg-gray-900/50 rounded p-2">
                      {claim.supplier_response}
                    </p>
                  </div>
                )}
                <InfoRow label="Fecha de Resolución" value={claim.resolution_date ? formatDate(claim.resolution_date) : 'N/A'} icon={<Calendar size={14} />} />
                <InfoRow label="Resuelto por" value={claim.resolved_by_user?.email || 'N/A'} />
                {claim.resolution && (
                  <div className="pt-1">
                    <span className="text-gray-500 dark:text-gray-400 block mb-1">Notas de Resolución</span>
                    <p className="text-gray-900 dark:text-white text-sm bg-gray-50 dark:bg-gray-900/50 rounded p-2">
                      {claim.resolution}
                    </p>
                  </div>
                )}
              </>
            ) : (
              <p className="text-sm text-gray-500 dark:text-gray-400 text-center py-4">
                Este reclamo aún no ha sido resuelto
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Timeline */}
      <Card className="dark:bg-gray-800/50 dark:border-gray-700">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Clock size={16} /> Historial del Reclamo
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            <TimelineItem
              icon={<FileText size={14} />}
              color="text-blue-600 dark:text-blue-400"
              label="Reclamo Creado"
              date={formatDate(claim.created_at)}
              details={`Creado por: ${claim.created_by_user?.email || 'N/A'}`}
            />
            {claim.status !== 'pending' && (
              <TimelineItem
                icon={<Wrench size={14} />}
                color="text-yellow-600 dark:text-yellow-400"
                label="En Proceso"
                date={formatDate(claim.updated_at)}
                details={claim.supplier_rma_number ? `RMA: ${claim.supplier_rma_number}` : undefined}
              />
            )}
            {(claim.status === 'resolved' || claim.status === 'rejected') && (
              <TimelineItem
                icon={<CheckCircle2 size={14} />}
                color="text-indigo-600 dark:text-indigo-400"
                label={claim.status === 'rejected' ? 'Rechazado' : 'Resuelto'}
                date={claim.resolution_date ? formatDate(claim.resolution_date) : formatDate(claim.updated_at)}
                details={claim.resolution || undefined}
              />
            )}
            {claim.status === 'cancelled' && (
              <TimelineItem
                icon={<XCircle size={14} />}
                color="text-gray-600 dark:text-gray-400"
                label="Cancelado"
                date={formatDate(claim.updated_at)}
              />
            )}
          </div>
        </CardContent>
      </Card>

      {/* Resolve Dialog */}
      <Dialog open={showResolveDialog} onOpenChange={setShowResolveDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Resolver Reclamo de Garantía</DialogTitle>
            <DialogDescription>
              Seleccione el tipo de resolución y complete los detalles.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Tipo de Resolución</Label>
              <Select value={resolutionType} onValueChange={(v) => setResolutionType(v as ResolutionType)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="repair">Reparación</SelectItem>
                  <SelectItem value="replacement">Reemplazo</SelectItem>
                  <SelectItem value="refund">Reembolso</SelectItem>
                  <SelectItem value="store_credit">Crédito de Tienda</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {resolutionType === 'replacement' && (
              <div>
                <Label>Serial de Reemplazo</Label>
                <Select value={replacementSerialId} onValueChange={setReplacementSerialId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Seleccione un serial en stock..." />
                  </SelectTrigger>
                  <SelectContent>
                    {replacementSerials.map((s) => (
                      <SelectItem key={s.id} value={String(s.id)}>{s.serial}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {replacementSerials.length === 0 && (
                  <p className="text-xs text-gray-500 mt-1">No hay seriales disponibles en stock para este producto</p>
                )}
              </div>
            )}
            {resolutionType === 'refund' && (
              <div>
                <Label>Monto de Reembolso</Label>
                <Input
                  type="number"
                  value={refundAmount}
                  onChange={(e) => setRefundAmount(e.target.value)}
                  placeholder="0"
                />
              </div>
            )}
            <div>
              <Label>Notas de Resolución</Label>
              <Textarea
                value={resolutionNotes}
                onChange={(e) => setResolutionNotes(e.target.value)}
                placeholder="Describa la resolución..."
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowResolveDialog(false)}>Cancelar</Button>
            <Button onClick={handleResolve} disabled={actionLoading}>
              {actionLoading && <Loader2 size={16} className="mr-1 animate-spin" />}
              Resolver Reclamo
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* RMA Dialog */}
      <Dialog open={showRMADialog} onOpenChange={setShowRMADialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Enviar a Proveedor (RMA)</DialogTitle>
            <DialogDescription>
              Registre el número de RMA del proveedor para enviar el reclamo.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Número de RMA del Proveedor</Label>
              <Input
                value={rmaNumber}
                onChange={(e) => setRmaNumber(e.target.value)}
                placeholder="Ej: RMA-2024-001"
              />
            </div>
            <div>
              <Label>Respuesta del Proveedor (opcional)</Label>
              <Textarea
                value={supplierResponse}
                onChange={(e) => setSupplierResponse(e.target.value)}
                placeholder="Respuesta o instrucciones del proveedor..."
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowRMADialog(false)}>Cancelar</Button>
            <Button onClick={handleSendRMA} disabled={actionLoading}>
              {actionLoading && <Loader2 size={16} className="mr-1 animate-spin" />}
              Enviar RMA
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

function TimelineItem({
  icon,
  color,
  label,
  date,
  details,
}: {
  icon: React.ReactNode;
  color: string;
  label: string;
  date: string;
  details?: string;
}) {
  return (
    <div className="flex gap-3">
      <div className="flex flex-col items-center">
        <div className={`p-1.5 rounded-full bg-gray-100 dark:bg-gray-700 ${color}`}>
          {icon}
        </div>
        <div className="w-px h-full bg-gray-200 dark:bg-gray-700 min-h-[24px]" />
      </div>
      <div className="flex-1 pb-3">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium text-gray-900 dark:text-white">{label}</span>
          <span className="text-xs text-gray-500 dark:text-gray-400">{date}</span>
        </div>
        {details && (
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">{details}</p>
        )}
      </div>
    </div>
  );
}
