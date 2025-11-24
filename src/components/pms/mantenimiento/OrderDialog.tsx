'use client';

import React, { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Loader2 } from 'lucide-react';
import type { MaintenanceOrder } from '@/lib/services/maintenanceService';
import type { Space } from '@/lib/services/spacesService';

interface OrderDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  order?: MaintenanceOrder | null;
  spaces: Space[];
  users: Array<{ id: string; email: string; name: string }>;
  branchId: number;
  onSave: (data: {
    branch_id: number;
    space_id?: string;
    description: string;
    priority: 'low' | 'med' | 'high';
    cost_estimate?: number;
    assigned_to?: string;
    status?: 'reported' | 'assigned' | 'in_progress' | 'on_hold' | 'completed' | 'cancelled';
    issue_type?: string;
    materials?: string;
  }) => Promise<void>;
}

export function OrderDialog({
  open,
  onOpenChange,
  order,
  spaces,
  users,
  branchId,
  onSave,
}: OrderDialogProps) {
  const [spaceId, setSpaceId] = useState('none');
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState<'low' | 'med' | 'high'>('med');
  const [costEstimate, setCostEstimate] = useState('');
  const [assignedTo, setAssignedTo] = useState('unassigned');
  const [status, setStatus] = useState<'reported' | 'assigned' | 'in_progress' | 'on_hold' | 'completed' | 'cancelled'>('reported');
  const [issueType, setIssueType] = useState('');
  const [materials, setMaterials] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (order) {
      setSpaceId(order.space_id || 'none');
      setDescription(order.description);
      setPriority(order.priority);
      setCostEstimate(order.cost_estimate?.toString() || '');
      setAssignedTo(order.assigned_to || 'unassigned');
      setStatus(order.status);
      setIssueType(order.issue_type || '');
      setMaterials(order.materials || '');
    } else {
      setSpaceId('none');
      setDescription('');
      setPriority('med');
      setCostEstimate('');
      setAssignedTo('unassigned');
      setStatus('reported');
      setIssueType('');
      setMaterials('');
    }
  }, [order, open]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);

    try {
      await onSave({
        branch_id: branchId,
        space_id: spaceId === 'none' ? undefined : spaceId,
        description,
        priority,
        cost_estimate: costEstimate ? parseFloat(costEstimate) : undefined,
        assigned_to: assignedTo === 'unassigned' ? undefined : assignedTo,
        status: order ? status : 'reported',
        issue_type: issueType || undefined,
        materials: materials || undefined,
      });

      onOpenChange(false);
    } catch (error) {
      console.error('Error guardando orden:', error);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {order ? 'Editar Orden de Mantenimiento' : 'Nueva Orden de Mantenimiento'}
          </DialogTitle>
          <DialogDescription>
            {order
              ? 'Modifica los detalles de la orden de mantenimiento.'
              : 'Crea una nueva orden de mantenimiento para un espacio.'}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Espacio */}
          <div className="space-y-2">
            <Label htmlFor="space">Espacio</Label>
            <Select value={spaceId} onValueChange={setSpaceId}>
              <SelectTrigger id="space">
                <SelectValue placeholder="Seleccionar espacio (opcional)" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Sin espacio asignado</SelectItem>
                {spaces.map((space) => (
                  <SelectItem key={space.id} value={space.id}>
                    {space.label}
                    {space.space_types && ` - ${space.space_types.name}`}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Tipo de avería */}
          <div className="space-y-2">
            <Label htmlFor="issueType">Tipo de Avería</Label>
            <Input
              id="issueType"
              placeholder="Ej: Eléctrica, Plomería, Pintura..."
              value={issueType}
              onChange={(e) => setIssueType(e.target.value)}
            />
          </div>

          {/* Descripción */}
          <div className="space-y-2">
            <Label htmlFor="description">Descripción *</Label>
            <Textarea
              id="description"
              placeholder="Describe el problema o trabajo a realizar..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            {/* Prioridad */}
            <div className="space-y-2">
              <Label htmlFor="priority">Prioridad *</Label>
              <Select
                value={priority}
                onValueChange={(value: 'low' | 'med' | 'high') => setPriority(value)}
              >
                <SelectTrigger id="priority">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="low">Baja</SelectItem>
                  <SelectItem value="med">Media</SelectItem>
                  <SelectItem value="high">Alta</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Costo estimado */}
            <div className="space-y-2">
              <Label htmlFor="cost">Costo Estimado</Label>
              <Input
                id="cost"
                type="number"
                placeholder="0.00"
                value={costEstimate}
                onChange={(e) => setCostEstimate(e.target.value)}
                min="0"
                step="0.01"
              />
            </div>
          </div>

          {/* Asignar a */}
          <div className="space-y-2">
            <Label htmlFor="assigned">Asignar a</Label>
            <Select value={assignedTo} onValueChange={setAssignedTo}>
              <SelectTrigger id="assigned">
                <SelectValue placeholder="Sin asignar" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="unassigned">Sin asignar</SelectItem>
                {users.map((user) => (
                  <SelectItem key={user.id} value={user.id}>
                    {user.name} - {user.email}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Estado (solo al editar) */}
          {order && (
            <div className="space-y-2">
              <Label htmlFor="status">Estado</Label>
              <Select value={status} onValueChange={(value) => setStatus(value as 'reported' | 'assigned' | 'in_progress' | 'on_hold' | 'completed' | 'cancelled')}>
                <SelectTrigger id="status">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="reported">Reportada</SelectItem>
                  <SelectItem value="assigned">Asignada</SelectItem>
                  <SelectItem value="in_progress">En Progreso</SelectItem>
                  <SelectItem value="on_hold">En Espera</SelectItem>
                  <SelectItem value="completed">Completada</SelectItem>
                  <SelectItem value="cancelled">Cancelada</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Materiales */}
          <div className="space-y-2">
            <Label htmlFor="materials">Materiales Utilizados</Label>
            <Textarea
              id="materials"
              placeholder="Lista de materiales usados en la reparación..."
              value={materials}
              onChange={(e) => setMaterials(e.target.value)}
              rows={2}
            />
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isSubmitting}
            >
              Cancelar
            </Button>
            <Button
              type="submit"
              disabled={isSubmitting || !description}
              className="bg-blue-600 hover:bg-blue-700"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Guardando...
                </>
              ) : order ? (
                'Guardar Cambios'
              ) : (
                'Crear Orden'
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
