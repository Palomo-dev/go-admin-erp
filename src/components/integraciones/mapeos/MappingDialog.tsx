'use client';

import React, { useState, useEffect } from 'react';
import { GitMerge } from 'lucide-react';
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
import { IntegrationConnection, IntegrationMapping } from '@/lib/services/integrationsService';

interface MappingDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  connections: IntegrationConnection[];
  mapping?: IntegrationMapping | null;
  onSave: (data: MappingFormData) => Promise<boolean>;
}

export interface MappingFormData {
  connectionId: string;
  externalType: string;
  externalId: string;
  internalTable: string;
  internalId: string;
}

const COMMON_EXTERNAL_TYPES = [
  'product',
  'order',
  'customer',
  'invoice',
  'payment',
  'category',
  'variant',
  'shipment',
  'inventory',
];

const COMMON_INTERNAL_TABLES = [
  'products',
  'orders',
  'customers',
  'invoices',
  'payments',
  'categories',
  'inventory_items',
  'shipments',
  'branches',
];

export function MappingDialog({
  open,
  onOpenChange,
  connections,
  mapping,
  onSave,
}: MappingDialogProps) {
  const isEdit = !!mapping;
  
  const [formData, setFormData] = useState<MappingFormData>({
    connectionId: '',
    externalType: '',
    externalId: '',
    internalTable: '',
    internalId: '',
  });
  const [customExternalType, setCustomExternalType] = useState('');
  const [customInternalTable, setCustomInternalTable] = useState('');
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (open) {
      if (mapping) {
        setFormData({
          connectionId: mapping.connection_id,
          externalType: COMMON_EXTERNAL_TYPES.includes(mapping.external_type) ? mapping.external_type : '',
          externalId: mapping.external_id,
          internalTable: COMMON_INTERNAL_TABLES.includes(mapping.internal_table) ? mapping.internal_table : '',
          internalId: mapping.internal_id,
        });
        setCustomExternalType(COMMON_EXTERNAL_TYPES.includes(mapping.external_type) ? '' : mapping.external_type);
        setCustomInternalTable(COMMON_INTERNAL_TABLES.includes(mapping.internal_table) ? '' : mapping.internal_table);
      } else {
        setFormData({
          connectionId: connections[0]?.id || '',
          externalType: '',
          externalId: '',
          internalTable: '',
          internalId: '',
        });
        setCustomExternalType('');
        setCustomInternalTable('');
      }
      setErrors({});
    }
  }, [open, mapping, connections]);

  const validateForm = (): boolean => {
    const newErrors: Record<string, string> = {};

    if (!formData.connectionId) {
      newErrors.connectionId = 'Selecciona una conexión';
    }
    if (!formData.externalType && !customExternalType) {
      newErrors.externalType = 'Selecciona o escribe un tipo externo';
    }
    if (!formData.externalId.trim()) {
      newErrors.externalId = 'El ID externo es requerido';
    }
    if (!formData.internalTable && !customInternalTable) {
      newErrors.internalTable = 'Selecciona o escribe una tabla interna';
    }
    if (!formData.internalId.trim()) {
      newErrors.internalId = 'El ID interno es requerido';
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
        externalType: customExternalType || formData.externalType,
        internalTable: customInternalTable || formData.internalTable,
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
        className="sm:max-w-[500px] dark:bg-gray-900 dark:border-gray-800"
        onPointerDownOutside={(e) => e.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 dark:text-white">
            <GitMerge className="h-5 w-5 text-indigo-500" />
            {isEdit ? 'Editar Mapeo' : 'Nuevo Mapeo'}
          </DialogTitle>
          <DialogDescription className="dark:text-gray-400">
            {isEdit
              ? 'Modifica la relación entre IDs externos e internos'
              : 'Crea una nueva relación entre un ID externo y uno interno'}
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
              disabled={isEdit}
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

          {/* Tipo Externo */}
          <div className="space-y-2">
            <Label htmlFor="externalType" className="dark:text-gray-300">
              Tipo Externo
            </Label>
            <Select
              value={formData.externalType}
              onValueChange={(value) => {
                setFormData({ ...formData, externalType: value });
                setCustomExternalType('');
              }}
            >
              <SelectTrigger className={errors.externalType ? 'border-red-500' : ''}>
                <SelectValue placeholder="Selecciona el tipo" />
              </SelectTrigger>
              <SelectContent className="z-[200]">
                {COMMON_EXTERNAL_TYPES.map((type) => (
                  <SelectItem key={type} value={type}>
                    {type}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Input
              value={customExternalType}
              onChange={(e) => {
                setCustomExternalType(e.target.value);
                if (e.target.value) {
                  setFormData({ ...formData, externalType: '' });
                }
              }}
              placeholder="O escribe un tipo personalizado"
              className="font-mono text-sm"
            />
            {errors.externalType && (
              <p className="text-xs text-red-500">{errors.externalType}</p>
            )}
          </div>

          {/* ID Externo */}
          <div className="space-y-2">
            <Label htmlFor="externalId" className="dark:text-gray-300">
              ID Externo
            </Label>
            <Input
              id="externalId"
              value={formData.externalId}
              onChange={(e) => setFormData({ ...formData, externalId: e.target.value })}
              placeholder="ej: prod_12345"
              className={`font-mono ${errors.externalId ? 'border-red-500' : ''}`}
            />
            {errors.externalId && (
              <p className="text-xs text-red-500">{errors.externalId}</p>
            )}
          </div>

          {/* Tabla Interna */}
          <div className="space-y-2">
            <Label htmlFor="internalTable" className="dark:text-gray-300">
              Tabla Interna
            </Label>
            <Select
              value={formData.internalTable}
              onValueChange={(value) => {
                setFormData({ ...formData, internalTable: value });
                setCustomInternalTable('');
              }}
            >
              <SelectTrigger className={errors.internalTable ? 'border-red-500' : ''}>
                <SelectValue placeholder="Selecciona la tabla" />
              </SelectTrigger>
              <SelectContent className="z-[200]">
                {COMMON_INTERNAL_TABLES.map((table) => (
                  <SelectItem key={table} value={table}>
                    {table}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Input
              value={customInternalTable}
              onChange={(e) => {
                setCustomInternalTable(e.target.value);
                if (e.target.value) {
                  setFormData({ ...formData, internalTable: '' });
                }
              }}
              placeholder="O escribe una tabla personalizada"
              className="font-mono text-sm"
            />
            {errors.internalTable && (
              <p className="text-xs text-red-500">{errors.internalTable}</p>
            )}
          </div>

          {/* ID Interno */}
          <div className="space-y-2">
            <Label htmlFor="internalId" className="dark:text-gray-300">
              ID Interno
            </Label>
            <Input
              id="internalId"
              value={formData.internalId}
              onChange={(e) => setFormData({ ...formData, internalId: e.target.value })}
              placeholder="ej: 550e8400-e29b-41d4-a716-446655440000"
              className={`font-mono ${errors.internalId ? 'border-red-500' : ''}`}
            />
            {errors.internalId && (
              <p className="text-xs text-red-500">{errors.internalId}</p>
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
              {saving ? 'Guardando...' : isEdit ? 'Guardar Cambios' : 'Crear Mapeo'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export default MappingDialog;
