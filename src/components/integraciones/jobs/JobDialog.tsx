'use client';

import React, { useState, useEffect } from 'react';
import { Cog } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { IntegrationConnection } from '@/lib/services/integrationsService';

interface JobDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  connections: IntegrationConnection[];
  onSave: (data: JobFormData) => Promise<boolean>;
}

export interface JobFormData {
  connectionId: string;
  jobType: string;
  resourceType: string;
}

const JOB_TYPES = [
  { value: 'pull', label: 'Pull (Obtener datos)' },
  { value: 'push', label: 'Push (Enviar datos)' },
  { value: 'full_sync', label: 'Sincronización Completa' },
  { value: 'incremental', label: 'Sincronización Incremental' },
  { value: 'reconcile', label: 'Reconciliación' },
];

const RESOURCE_TYPES = [
  'products',
  'orders',
  'customers',
  'inventory',
  'invoices',
  'payments',
  'shipments',
  'categories',
];

export function JobDialog({
  open,
  onOpenChange,
  connections,
  onSave,
}: JobDialogProps) {
  const [formData, setFormData] = useState<JobFormData>({
    connectionId: '',
    jobType: 'pull',
    resourceType: 'products',
  });
  const [customResourceType, setCustomResourceType] = useState('');
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (open) {
      setFormData({
        connectionId: connections[0]?.id || '',
        jobType: 'pull',
        resourceType: 'products',
      });
      setCustomResourceType('');
      setErrors({});
    }
  }, [open, connections]);

  const validateForm = (): boolean => {
    const newErrors: Record<string, string> = {};

    if (!formData.connectionId) {
      newErrors.connectionId = 'Selecciona una conexión';
    }
    if (!formData.jobType) {
      newErrors.jobType = 'Selecciona un tipo de job';
    }
    if (!formData.resourceType && !customResourceType) {
      newErrors.resourceType = 'Selecciona o escribe un tipo de recurso';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validateForm()) return;

    setSaving(true);
    try {
      const data = {
        ...formData,
        resourceType: customResourceType || formData.resourceType,
      };
      const success = await onSave(data);
      if (success) {
        onOpenChange(false);
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="sm:max-w-[450px] dark:bg-gray-900 dark:border-gray-800"
        onPointerDownOutside={(e) => e.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 dark:text-white">
            <Cog className="h-5 w-5 text-orange-500" />
            Nuevo Job de Sincronización
          </DialogTitle>
          <DialogDescription className="dark:text-gray-400">
            Crea un nuevo job para sincronizar datos manualmente
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Conexión */}
          <div className="space-y-2">
            <Label htmlFor="connectionId" className="dark:text-gray-300">
              Conexión
            </Label>
            <Select
              value={formData.connectionId}
              onValueChange={(value) => setFormData({ ...formData, connectionId: value })}
            >
              <SelectTrigger className={errors.connectionId ? 'border-red-500' : ''}>
                <SelectValue placeholder="Selecciona una conexión" />
              </SelectTrigger>
              <SelectContent className="z-[200]">
                {connections.map((conn) => (
                  <SelectItem key={conn.id} value={conn.id}>
                    {conn.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {errors.connectionId && (
              <p className="text-xs text-red-500">{errors.connectionId}</p>
            )}
          </div>

          {/* Tipo de Job */}
          <div className="space-y-2">
            <Label htmlFor="jobType" className="dark:text-gray-300">
              Tipo de Job
            </Label>
            <Select
              value={formData.jobType}
              onValueChange={(value) => setFormData({ ...formData, jobType: value })}
            >
              <SelectTrigger className={errors.jobType ? 'border-red-500' : ''}>
                <SelectValue placeholder="Selecciona el tipo" />
              </SelectTrigger>
              <SelectContent className="z-[200]">
                {JOB_TYPES.map((type) => (
                  <SelectItem key={type.value} value={type.value}>
                    {type.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {errors.jobType && <p className="text-xs text-red-500">{errors.jobType}</p>}
          </div>

          {/* Tipo de Recurso */}
          <div className="space-y-2">
            <Label htmlFor="resourceType" className="dark:text-gray-300">
              Tipo de Recurso
            </Label>
            <Select
              value={formData.resourceType}
              onValueChange={(value) => {
                setFormData({ ...formData, resourceType: value });
                setCustomResourceType('');
              }}
            >
              <SelectTrigger className={errors.resourceType ? 'border-red-500' : ''}>
                <SelectValue placeholder="Selecciona el recurso" />
              </SelectTrigger>
              <SelectContent className="z-[200]">
                {RESOURCE_TYPES.map((type) => (
                  <SelectItem key={type} value={type}>
                    {type}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div className="text-xs text-gray-500 dark:text-gray-400">
              O escribe un tipo personalizado:
            </div>
            <Input
              value={customResourceType}
              onChange={(e) => {
                setCustomResourceType(e.target.value);
                if (e.target.value) {
                  setFormData({ ...formData, resourceType: '' });
                }
              }}
              placeholder="custom_resource"
              className="font-mono"
            />
            {errors.resourceType && (
              <p className="text-xs text-red-500">{errors.resourceType}</p>
            )}
          </div>

          <DialogFooter className="pt-4">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={saving}
              className="dark:border-gray-700 dark:text-gray-300"
            >
              Cancelar
            </Button>
            <Button
              type="submit"
              disabled={saving}
              className="bg-blue-600 hover:bg-blue-700 text-white"
            >
              {saving ? 'Creando...' : 'Crear Job'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export default JobDialog;
