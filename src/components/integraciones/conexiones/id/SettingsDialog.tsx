'use client';

import React, { useState, useEffect } from 'react';
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { IntegrationConnection } from '@/lib/services/integrationsService';

interface SettingsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  connection: IntegrationConnection | null;
  branches: Array<{ id: number; name: string }>;
  onSave: (data: {
    name: string;
    environment: string;
    countryCode?: string;
    branchId?: number | null;
    settings: Record<string, unknown>;
  }) => Promise<boolean>;
}

export function SettingsDialog({
  open,
  onOpenChange,
  connection,
  branches,
  onSave,
}: SettingsDialogProps) {
  const [saving, setSaving] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    environment: 'production',
    countryCode: '',
    branchId: '' as string,
  });

  useEffect(() => {
    if (connection && open) {
      setFormData({
        name: connection.name || '',
        environment: connection.environment || 'production',
        countryCode: connection.country_code || '',
        branchId: connection.branch_id ? String(connection.branch_id) : '',
      });
    }
  }, [connection, open]);

  const handleSave = async () => {
    setSaving(true);
    const success = await onSave({
      name: formData.name,
      environment: formData.environment,
      countryCode: formData.countryCode || undefined,
      branchId: formData.branchId ? Number(formData.branchId) : null,
      settings: connection?.settings || {},
    });
    setSaving(false);
    if (success) {
      onOpenChange(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="dark:bg-gray-800 dark:border-gray-700">
        <DialogHeader>
          <DialogTitle className="dark:text-white">Configurar conexión</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label className="dark:text-gray-300">Nombre</Label>
            <Input
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              className="dark:bg-gray-900 dark:border-gray-700 dark:text-white"
              placeholder="Nombre de la conexión"
            />
          </div>

          <div className="space-y-2">
            <Label className="dark:text-gray-300">Entorno</Label>
            <Select
              value={formData.environment}
              onValueChange={(v) => setFormData({ ...formData, environment: v })}
            >
              <SelectTrigger className="dark:bg-gray-900 dark:border-gray-700 dark:text-white">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="dark:bg-gray-800 dark:border-gray-700">
                <SelectItem value="production">Producción</SelectItem>
                <SelectItem value="sandbox">Sandbox</SelectItem>
                <SelectItem value="test">Test</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label className="dark:text-gray-300">Código de país</Label>
            <Input
              value={formData.countryCode}
              onChange={(e) => setFormData({ ...formData, countryCode: e.target.value })}
              className="dark:bg-gray-900 dark:border-gray-700 dark:text-white"
              placeholder="Ej: CO, MX, US"
            />
          </div>

          <div className="space-y-2">
            <Label className="dark:text-gray-300">Sucursal</Label>
            <Select
              value={formData.branchId}
              onValueChange={(v) => setFormData({ ...formData, branchId: v })}
            >
              <SelectTrigger className="dark:bg-gray-900 dark:border-gray-700 dark:text-white">
                <SelectValue placeholder="Sin sucursal" />
              </SelectTrigger>
              <SelectContent className="dark:bg-gray-800 dark:border-gray-700">
                {branches.map((b) => (
                  <SelectItem key={b.id} value={String(b.id)}>
                    {b.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            className="dark:border-gray-600 dark:text-gray-300"
          >
            Cancelar
          </Button>
          <Button onClick={handleSave} disabled={saving || !formData.name}>
            {saving ? 'Guardando...' : 'Guardar'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
