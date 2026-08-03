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
import { IntegrationCredential } from '@/lib/services/integrationsService';

export interface CredentialFormData {
  credentialType: string;
  purpose: string;
  secretRef: string;
  keyPrefix?: string;
  expiresAt?: string;
}

interface CredentialDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  credential: IntegrationCredential | null;
  mode: 'create' | 'edit' | 'duplicate';
  onSave: (data: CredentialFormData) => Promise<boolean>;
}

export function CredentialDialog({
  open,
  onOpenChange,
  credential,
  mode,
  onSave,
}: CredentialDialogProps) {
  const [saving, setSaving] = useState(false);
  const [formData, setFormData] = useState<CredentialFormData>({
    credentialType: '',
    purpose: 'primary',
    secretRef: '',
    keyPrefix: '',
    expiresAt: '',
  });

  useEffect(() => {
    if (open) {
      if (mode === 'create') {
        setFormData({
          credentialType: '',
          purpose: 'primary',
          secretRef: '',
          keyPrefix: '',
          expiresAt: '',
        });
      } else if (credential) {
        setFormData({
          credentialType: credential.credential_type,
          purpose: credential.purpose,
          secretRef: mode === 'edit' ? '' : '',
          keyPrefix: credential.key_prefix || '',
          expiresAt: credential.expires_at
            ? credential.expires_at.split('T')[0]
            : '',
        });
      }
    }
  }, [open, mode, credential]);

  const handleSave = async () => {
    if (!formData.credentialType || !formData.secretRef) return;
    setSaving(true);
    const success = await onSave({
      ...formData,
      expiresAt: formData.expiresAt || undefined,
      keyPrefix: formData.keyPrefix || undefined,
    });
    setSaving(false);
    if (success) {
      onOpenChange(false);
    }
  };

  const title =
    mode === 'create' ? 'Nueva credencial' :
    mode === 'edit' ? 'Rotar credencial' :
    'Duplicar credencial';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="dark:bg-gray-800 dark:border-gray-700">
        <DialogHeader>
          <DialogTitle className="dark:text-white">{title}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label className="dark:text-gray-300">Tipo de credencial</Label>
            <Input
              value={formData.credentialType}
              onChange={(e) => setFormData({ ...formData, credentialType: e.target.value })}
              className="dark:bg-gray-900 dark:border-gray-700 dark:text-white"
              placeholder="Ej: api_key, oauth_token, basic_auth"
              disabled={mode === 'edit'}
            />
          </div>

          <div className="space-y-2">
            <Label className="dark:text-gray-300">Propósito</Label>
            <Select
              value={formData.purpose}
              onValueChange={(v) => setFormData({ ...formData, purpose: v })}
            >
              <SelectTrigger className="dark:bg-gray-900 dark:border-gray-700 dark:text-white">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="dark:bg-gray-800 dark:border-gray-700">
                <SelectItem value="primary">Principal</SelectItem>
                <SelectItem value="backup">Backup</SelectItem>
                <SelectItem value="rotation">Rotación</SelectItem>
                <SelectItem value="legacy">Legacy</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label className="dark:text-gray-300">
              {mode === 'edit' ? 'Nuevo valor (secreto)' : 'Valor (secreto)'}
            </Label>
            <Input
              type="password"
              value={formData.secretRef}
              onChange={(e) => setFormData({ ...formData, secretRef: e.target.value })}
              className="dark:bg-gray-900 dark:border-gray-700 dark:text-white"
              placeholder="Ingresa el valor secreto"
            />
          </div>

          <div className="space-y-2">
            <Label className="dark:text-gray-300">Prefijo de clave (opcional)</Label>
            <Input
              value={formData.keyPrefix}
              onChange={(e) => setFormData({ ...formData, keyPrefix: e.target.value })}
              className="dark:bg-gray-900 dark:border-gray-700 dark:text-white"
              placeholder="Ej: sk_live_..."
            />
          </div>

          <div className="space-y-2">
            <Label className="dark:text-gray-300">Fecha de expiración (opcional)</Label>
            <Input
              type="date"
              value={formData.expiresAt}
              onChange={(e) => setFormData({ ...formData, expiresAt: e.target.value })}
              className="dark:bg-gray-900 dark:border-gray-700 dark:text-white"
            />
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
          <Button
            onClick={handleSave}
            disabled={saving || !formData.credentialType || !formData.secretRef}
          >
            {saving ? 'Guardando...' : 'Guardar'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
