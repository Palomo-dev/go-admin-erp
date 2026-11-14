'use client';

import { useState, useEffect, useCallback } from 'react';
import { useTranslations } from 'next-intl';
import { useToast } from '@/components/ui/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Plus, Pencil, Trash2, RefreshCw, AlertCircle, Globe, Building2 } from 'lucide-react';
import { lossReasonsService, type LossReason } from '@/lib/services/crm/lossReasonsService';

export function LossReasonsManager() {
  const t = useTranslations('configuracionTextos.lossReasonsManager');
  const { toast } = useToast();

  const [reasons, setReasons] = useState<LossReason[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [editingReason, setEditingReason] = useState<LossReason | null>(null);
  const [reasonToDelete, setReasonToDelete] = useState<LossReason | null>(null);
  const [saving, setSaving] = useState(false);
  const [formData, setFormData] = useState({ reason: '' });

  const loadReasons = useCallback(async () => {
    setLoading(true);
    try {
      const data = await lossReasonsService.getLossReasons(true);
      setReasons(data);
    } catch (error) {
      console.error('Error cargando razones de perdida:', error);
      toast({ title: t('toast.error'), description: t('toast.errorCargar'), variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }, [toast, t]);

  useEffect(() => {
    loadReasons();
  }, [loadReasons]);

  const handleCreate = () => {
    setEditingReason(null);
    setFormData({ reason: '' });
    setDialogOpen(true);
  };

  const handleEdit = (reason: LossReason) => {
    setEditingReason(reason);
    setFormData({ reason: reason.reason });
    setDialogOpen(true);
  };

  const handleDelete = (reason: LossReason) => {
    setReasonToDelete(reason);
    setDeleteDialogOpen(true);
  };

  const handleSave = async () => {
    if (!formData.reason.trim()) {
      toast({ title: t('toast.validacion'), description: t('toast.razonObligatoria'), variant: 'destructive' });
      return;
    }
    if (editingReason?.is_global) {
      toast({ title: t('toast.restriccion'), description: t('toast.globalesNoEditables'), variant: 'destructive' });
      return;
    }
    setSaving(true);
    try {
      if (editingReason) {
        await lossReasonsService.updateLossReason(editingReason.id, { reason: formData.reason.trim() });
        toast({ title: t('toast.actualizada'), description: t('toast.cambiosGuardados') });
      } else {
        await lossReasonsService.createLossReason({ reason: formData.reason.trim() });
        toast({ title: t('toast.creada'), description: t('toast.creadaDescripcion') });
      }
      setDialogOpen(false);
      loadReasons();
    } catch (error) {
      console.error('Error guardando razon:', error);
      toast({ title: t('toast.error'), description: t('toast.errorGuardar'), variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const confirmDelete = async () => {
    if (!reasonToDelete) return;
    if (reasonToDelete.is_global) {
      toast({ title: t('toast.restriccion'), description: t('toast.globalesNoEliminables'), variant: 'destructive' });
      setDeleteDialogOpen(false);
      setReasonToDelete(null);
      return;
    }
    try {
      await lossReasonsService.deleteLossReason(reasonToDelete.id);
      toast({ title: t('toast.eliminada'), description: t('toast.eliminadaDescripcion') });
      loadReasons();
    } catch (error) {
      console.error('Error eliminando razon:', error);
      toast({ title: t('toast.error'), description: t('toast.errorEliminar'), variant: 'destructive' });
    } finally {
      setDeleteDialogOpen(false);
      setReasonToDelete(null);
    }
  };

  const globalReasons = reasons.filter((r) => r.is_global);
  const orgReasons = reasons.filter((r) => !r.is_global);

  const renderReasonItem = (reason: LossReason) => (
    <Card key={reason.id} className="border-gray-200 dark:border-gray-700">
      <CardContent className="p-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 flex-1 min-w-0">
            {reason.is_global ? (
              <Globe className="h-4 w-4 text-blue-500 shrink-0" />
            ) : (
              <Building2 className="h-4 w-4 text-gray-400 shrink-0" />
            )}
            <p className="text-sm text-gray-900 dark:text-white truncate">{reason.reason}</p>
            {!reason.is_active && (
              <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 dark:bg-gray-800 text-gray-500">
                {t('lista.inactiva')}
              </span>
            )}
          </div>
          <div className="flex items-center gap-1 ml-2">
            {!reason.is_global && (
              <>
                <Button variant="ghost" size="icon" onClick={() => handleEdit(reason)}>
                  <Pencil className="h-4 w-4" />
                </Button>
                <Button variant="ghost" size="icon" onClick={() => handleDelete(reason)}>
                  <Trash2 className="h-4 w-4 text-red-500" />
                </Button>
              </>
            )}
            {reason.is_global && (
              <Badge variant="secondary" className="text-xs">{t('lista.global')}</Badge>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <AlertCircle className="h-5 w-5 text-muted-foreground" />
          <div>
            <p className="text-sm font-medium text-gray-900 dark:text-white">
              {t('encabezado.conteo', { n: reasons.length })}
            </p>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              {t('encabezado.descripcion')}
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={loadReasons} disabled={loading}>
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          </Button>
          <Button size="sm" onClick={handleCreate}>
            <Plus className="h-4 w-4 mr-1" />
            {t('encabezado.nuevaRazon')}
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="space-y-2">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-12 rounded-lg border border-gray-200 dark:border-gray-700 animate-pulse bg-gray-100 dark:bg-gray-800" />
          ))}
        </div>
      ) : (
        <div className="space-y-4">
          {globalReasons.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Globe className="h-4 w-4 text-blue-500" />
                <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{t('lista.globales')}</h4>
              </div>
              {globalReasons.map(renderReasonItem)}
            </div>
          )}

          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Building2 className="h-4 w-4 text-gray-400" />
              <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{t('lista.deLaOrganizacion')}</h4>
            </div>
            {orgReasons.length === 0 ? (
              <div className="text-center py-8 rounded-lg border border-dashed border-gray-200 dark:border-gray-700">
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  {t('lista.vacio')}
                </p>
              </div>
            ) : (
              orgReasons.map(renderReasonItem)
            )}
          </div>
        </div>
      )}

      {/* Dialog crear/editar */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingReason ? t('dialogo.tituloEditar') : t('dialogo.tituloNueva')}</DialogTitle>
            <DialogDescription>
              {editingReason
                ? t('dialogo.descripcionEditar')
                : t('dialogo.descripcionNueva')}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="reason-text">{t('dialogo.razonEtiqueta')}</Label>
              <Input
                id="reason-text"
                value={formData.reason}
                onChange={(e) => setFormData((prev) => ({ ...prev, reason: e.target.value }))}
                placeholder={t('dialogo.razonPlaceholder')}
                maxLength={200}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>{t('acciones.cancelar')}</Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? t('acciones.guardando') : t('acciones.guardar')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog eliminar */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('desactivar.titulo')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('desactivar.descripcion', { razon: reasonToDelete?.reason ?? '' })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('acciones.cancelar')}</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDelete}
              className="bg-red-600 hover:bg-red-700 text-white"
            >
              {t('desactivar.confirmar')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
