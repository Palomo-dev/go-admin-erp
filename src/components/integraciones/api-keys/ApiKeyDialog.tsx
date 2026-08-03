'use client';

import React, { useState, useEffect } from 'react';
import { Key, Copy, Check, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { ChannelApiKey } from '@/lib/services/integrationsService';

interface ApiKeyDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  apiKey?: ChannelApiKey | null;
  onSave: (data: ApiKeyFormData) => Promise<{ success: boolean; fullKey?: string }>;
}

export interface ApiKeyFormData {
  name: string;
  scopes: string[];
  expiresAt: string;
}

const AVAILABLE_SCOPES = [
  { id: 'read:products', label: 'Leer productos', description: 'Acceso de lectura al catálogo' },
  { id: 'write:products', label: 'Escribir productos', description: 'Crear y modificar productos' },
  { id: 'read:orders', label: 'Leer órdenes', description: 'Acceso de lectura a pedidos' },
  { id: 'write:orders', label: 'Escribir órdenes', description: 'Crear y modificar pedidos' },
  { id: 'read:customers', label: 'Leer clientes', description: 'Acceso de lectura a clientes' },
  { id: 'write:customers', label: 'Escribir clientes', description: 'Crear y modificar clientes' },
  { id: 'read:inventory', label: 'Leer inventario', description: 'Acceso de lectura a stock' },
  { id: 'write:inventory', label: 'Escribir inventario', description: 'Modificar niveles de stock' },
  { id: 'read:reports', label: 'Leer reportes', description: 'Acceso a reportes y analytics' },
  { id: 'webhooks', label: 'Webhooks', description: 'Gestionar webhooks' },
];

export function ApiKeyDialog({
  open,
  onOpenChange,
  apiKey,
  onSave,
}: ApiKeyDialogProps) {
  const isEdit = !!apiKey;
  
  const [formData, setFormData] = useState<ApiKeyFormData>({
    name: '',
    scopes: [],
    expiresAt: '',
  });
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [generatedKey, setGeneratedKey] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (open) {
      if (apiKey) {
        setFormData({
          name: apiKey.name,
          scopes: apiKey.scopes || [],
          expiresAt: apiKey.expires_at ? apiKey.expires_at.split('T')[0] : '',
        });
      } else {
        setFormData({
          name: '',
          scopes: ['read:products', 'read:orders'],
          expiresAt: '',
        });
      }
      setErrors({});
      setGeneratedKey(null);
      setCopied(false);
    }
  }, [open, apiKey]);

  const validateForm = (): boolean => {
    const newErrors: Record<string, string> = {};

    if (!formData.name.trim()) {
      newErrors.name = 'El nombre es requerido';
    }
    if (formData.scopes.length === 0) {
      newErrors.scopes = 'Selecciona al menos un permiso';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleScopeChange = (scopeId: string, checked: boolean) => {
    setFormData((prev) => ({
      ...prev,
      scopes: checked
        ? [...prev.scopes, scopeId]
        : prev.scopes.filter((s) => s !== scopeId),
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validateForm()) return;

    setSaving(true);
    try {
      const result = await onSave(formData);
      if (result.success && result.fullKey) {
        setGeneratedKey(result.fullKey);
      } else if (result.success) {
        onOpenChange(false);
      }
    } finally {
      setSaving(false);
    }
  };

  const handleCopyKey = () => {
    if (generatedKey) {
      navigator.clipboard.writeText(generatedKey);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleClose = () => {
    setGeneratedKey(null);
    onOpenChange(false);
  };

  // Vista de key generada
  if (generatedKey) {
    return (
      <Dialog open={open} onOpenChange={handleClose}>
        <DialogContent className="sm:max-w-[500px] dark:bg-gray-900 dark:border-gray-800">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 dark:text-white">
              <Key className="h-5 w-5 text-green-500" />
              API Key Creada
            </DialogTitle>
            <DialogDescription className="dark:text-gray-400">
              Guarda esta clave en un lugar seguro. No podrás verla de nuevo.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="p-4 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg">
              <div className="flex items-start gap-2 mb-3">
                <AlertTriangle className="h-5 w-5 text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" />
                <p className="text-sm text-amber-800 dark:text-amber-300">
                  Esta es la única vez que verás la clave completa. Cópiala ahora y guárdala de forma segura.
                </p>
              </div>
            </div>

            <div className="space-y-2">
              <Label className="dark:text-gray-300">Tu API Key</Label>
              <div className="flex gap-2">
                <Input
                  value={generatedKey}
                  readOnly
                  className="font-mono text-sm bg-gray-100 dark:bg-gray-800"
                />
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleCopyKey}
                  className="flex-shrink-0"
                >
                  {copied ? (
                    <Check className="h-4 w-4 text-green-500" />
                  ) : (
                    <Copy className="h-4 w-4" />
                  )}
                </Button>
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button
              onClick={handleClose}
              className="bg-blue-600 hover:bg-blue-700 text-white"
            >
              Entendido, la guardé
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="sm:max-w-[500px] dark:bg-gray-900 dark:border-gray-800"
        onPointerDownOutside={(e) => e.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 dark:text-white">
            <Key className="h-5 w-5 text-amber-500" />
            {isEdit ? 'Editar API Key' : 'Nueva API Key'}
          </DialogTitle>
          <DialogDescription className="dark:text-gray-400">
            {isEdit
              ? 'Modifica los permisos y configuración de la API key'
              : 'Crea una nueva clave para acceso programático a tu API'}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Nombre */}
          <div className="space-y-2">
            <Label htmlFor="name" className="dark:text-gray-300">
              Nombre
            </Label>
            <Input
              id="name"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              placeholder="ej: Integración Shopify"
              className={errors.name ? 'border-red-500' : ''}
            />
            {errors.name && <p className="text-xs text-red-500">{errors.name}</p>}
          </div>

          {/* Expiración */}
          <div className="space-y-2">
            <Label htmlFor="expiresAt" className="dark:text-gray-300">
              Fecha de expiración (opcional)
            </Label>
            <Input
              id="expiresAt"
              type="date"
              value={formData.expiresAt}
              onChange={(e) => setFormData({ ...formData, expiresAt: e.target.value })}
              min={new Date().toISOString().split('T')[0]}
            />
            <p className="text-xs text-gray-500 dark:text-gray-400">
              Deja vacío para que no expire
            </p>
          </div>

          {/* Scopes */}
          <div className="space-y-2">
            <Label className="dark:text-gray-300">Permisos (Scopes)</Label>
            {errors.scopes && <p className="text-xs text-red-500">{errors.scopes}</p>}
            <div className="grid grid-cols-1 gap-1 max-h-[180px] overflow-y-auto border border-gray-200 dark:border-gray-700 rounded-lg p-2">
              {AVAILABLE_SCOPES.map((scope) => (
                <div
                  key={scope.id}
                  className="flex items-start gap-3 p-2 rounded hover:bg-gray-50 dark:hover:bg-gray-800"
                >
                  <Checkbox
                    id={scope.id}
                    checked={formData.scopes.includes(scope.id)}
                    onCheckedChange={(checked) =>
                      handleScopeChange(scope.id, checked as boolean)
                    }
                  />
                  <div className="flex-1">
                    <label
                      htmlFor={scope.id}
                      className="text-sm font-medium text-gray-900 dark:text-white cursor-pointer"
                    >
                      {scope.label}
                    </label>
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      {scope.description}
                    </p>
                  </div>
                </div>
              ))}
            </div>
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
              {saving ? 'Guardando...' : isEdit ? 'Guardar Cambios' : 'Crear API Key'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export default ApiKeyDialog;
