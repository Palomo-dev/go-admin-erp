'use client';

import { useState, useEffect, useCallback } from 'react';
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
      toast({ title: 'Error', description: 'No se pudieron cargar las razones de perdida', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }, [toast]);

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
      toast({ title: 'Validacion', description: 'La razon es obligatoria', variant: 'destructive' });
      return;
    }
    if (editingReason?.is_global) {
      toast({ title: 'Restriccion', description: 'Las razones globales no se pueden editar', variant: 'destructive' });
      return;
    }
    setSaving(true);
    try {
      if (editingReason) {
        await lossReasonsService.updateLossReason(editingReason.id, { reason: formData.reason.trim() });
        toast({ title: 'Razon actualizada', description: 'Los cambios se guardaron correctamente' });
      } else {
        await lossReasonsService.createLossReason({ reason: formData.reason.trim() });
        toast({ title: 'Razon creada', description: 'La razon de perdida se creo correctamente' });
      }
      setDialogOpen(false);
      loadReasons();
    } catch (error) {
      console.error('Error guardando razon:', error);
      toast({ title: 'Error', description: 'No se pudo guardar la razon', variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const confirmDelete = async () => {
    if (!reasonToDelete) return;
    if (reasonToDelete.is_global) {
      toast({ title: 'Restriccion', description: 'Las razones globales no se pueden eliminar', variant: 'destructive' });
      setDeleteDialogOpen(false);
      setReasonToDelete(null);
      return;
    }
    try {
      await lossReasonsService.deleteLossReason(reasonToDelete.id);
      toast({ title: 'Razon eliminada', description: 'La razon de perdida se desactivo correctamente' });
      loadReasons();
    } catch (error) {
      console.error('Error eliminando razon:', error);
      toast({ title: 'Error', description: 'No se pudo eliminar la razon', variant: 'destructive' });
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
                Inactiva
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
              <Badge variant="secondary" className="text-xs">Global</Badge>
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
              {reasons.length} razon{reasons.length !== 1 ? 'es' : ''} de perdida
            </p>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              Globales y especificas de la organizacion
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={loadReasons} disabled={loading}>
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          </Button>
          <Button size="sm" onClick={handleCreate}>
            <Plus className="h-4 w-4 mr-1" />
            Nueva Razon
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
                <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Globales</h4>
              </div>
              {globalReasons.map(renderReasonItem)}
            </div>
          )}

          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Building2 className="h-4 w-4 text-gray-400" />
              <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wide">De la organizacion</h4>
            </div>
            {orgReasons.length === 0 ? (
              <div className="text-center py-8 rounded-lg border border-dashed border-gray-200 dark:border-gray-700">
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  No hay razones especificas. Crea una para personalizar.
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
            <DialogTitle>{editingReason ? 'Editar Razon' : 'Nueva Razon de Perdida'}</DialogTitle>
            <DialogDescription>
              {editingReason
                ? 'Modifica la razon de perdida'
                : 'Crea una nueva razon para registrar por que se pierden oportunidades'}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="reason-text">Razon *</Label>
              <Input
                id="reason-text"
                value={formData.reason}
                onChange={(e) => setFormData((prev) => ({ ...prev, reason: e.target.value }))}
                placeholder="Ej: Precio muy alto, Sin presupuesto, Competidor..."
                maxLength={200}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancelar</Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? 'Guardando...' : 'Guardar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog eliminar */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Desactivar razon de perdida?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta accion desactivara la razon &quot;{reasonToDelete?.reason}&quot;. Las oportunidades
              que ya usen esta razon mantendran el registro historico.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDelete}
              className="bg-red-600 hover:bg-red-700 text-white"
            >
              Desactivar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
