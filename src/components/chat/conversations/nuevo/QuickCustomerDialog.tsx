'use client';

import React, { useState, useEffect } from 'react';
import { User, Loader2, CreditCard, Building2 } from 'lucide-react';
import { supabase } from '@/lib/supabase/config';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { QuickCustomerData } from '@/lib/services/newConversationService';
import { MunicipalitySearch } from '@/components/shared/MunicipalitySearch';

interface QuickCustomerDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (data: QuickCustomerData) => Promise<void>;
}

export default function QuickCustomerDialog({
  isOpen,
  onClose,
  onSave
}: QuickCustomerDialogProps) {
  const [formData, setFormData] = useState<QuickCustomerData>({
    first_name: '',
    last_name: '',
    email: '',
    phone: ''
  });
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState('');
  const [selectedRoles, setSelectedRoles] = useState<string[]>(['cliente', 'huesped']);
  const [selectedFiscal, setSelectedFiscal] = useState<string[]>(['R-99-PN']);
  const [municipalityId, setMunicipalityId] = useState('aa4b6637-0060-41bb-9459-bc95f9789e08');
  const [customerRoles, setCustomerRoles] = useState<{code: string; label: string}[]>([]);
  const [fiscalOptions, setFiscalOptions] = useState<{code: string; description: string}[]>([]);

  useEffect(() => {
    async function loadCatalogs() {
      const [rolesRes, fiscalRes] = await Promise.all([
        supabase.from('customer_roles').select('code, label').order('sort_order'),
        supabase.from('dian_fiscal_responsibilities').select('code, description').order('sort_order'),
      ]);
      if (rolesRes.data) setCustomerRoles(rolesRes.data);
      if (fiscalRes.data) setFiscalOptions(fiscalRes.data);
    }
    loadCatalogs();
  }, []);

  const handleSave = async () => {
    if (!formData.first_name.trim()) {
      setError('El nombre es requerido');
      return;
    }

    try {
      setIsSaving(true);
      setError('');
      await onSave(formData);
      setFormData({ first_name: '', last_name: '', email: '', phone: '' });
      onClose();
    } catch (err) {
      console.error('Error creando cliente:', err);
      setError('Error al crear el cliente');
    } finally {
      setIsSaving(false);
    }
  };

  const handleClose = () => {
    setFormData({ first_name: '', last_name: '', email: '', phone: '' });
    setError('');
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <User className="h-5 w-5 text-blue-600" />
            Crear Cliente Rápido
          </DialogTitle>
          <DialogDescription>
            Crea un cliente con los datos mínimos. Podrás completar su perfil después.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="first_name">Nombre *</Label>
              <Input
                id="first_name"
                value={formData.first_name}
                onChange={(e) => setFormData({ ...formData, first_name: e.target.value })}
                placeholder="Juan"
                autoFocus
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="last_name">Apellido</Label>
              <Input
                id="last_name"
                value={formData.last_name}
                onChange={(e) => setFormData({ ...formData, last_name: e.target.value })}
                placeholder="Pérez"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              value={formData.email}
              onChange={(e) => setFormData({ ...formData, email: e.target.value })}
              placeholder="juan@ejemplo.com"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="phone">Teléfono</Label>
            <Input
              id="phone"
              type="tel"
              value={formData.phone}
              onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
              placeholder="+57 300 123 4567"
            />
          </div>

          {/* Roles del Cliente */}
          <div className="space-y-2">
            <Label className="text-sm font-medium flex items-center gap-1">
              <User className="h-3.5 w-3.5" /> Roles
            </Label>
            <div className="flex flex-wrap gap-1.5">
              {customerRoles.map((role) => (
                <div
                  key={role.code}
                  className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md border cursor-pointer transition-all text-xs ${
                    selectedRoles.includes(role.code)
                      ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300'
                      : 'border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-400'
                  }`}
                  onClick={() => setSelectedRoles(prev =>
                    prev.includes(role.code) ? prev.filter(r => r !== role.code) : [...prev, role.code]
                  )}
                >
                  <Checkbox checked={selectedRoles.includes(role.code)} className="pointer-events-none h-3 w-3" />
                  <span>{role.label}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Resp. Fiscal */}
          <div className="space-y-2">
            <Label className="text-sm font-medium flex items-center gap-1">
              <CreditCard className="h-3.5 w-3.5" /> Resp. Fiscal
            </Label>
            <div className="flex flex-wrap gap-1.5">
              {fiscalOptions.map((fiscal) => (
                <div
                  key={fiscal.code}
                  className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md border cursor-pointer transition-all text-xs ${
                    selectedFiscal.includes(fiscal.code)
                      ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300'
                      : 'border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-400'
                  }`}
                  onClick={() => setSelectedFiscal(prev =>
                    prev.includes(fiscal.code) ? prev.filter(f => f !== fiscal.code) : [...prev, fiscal.code]
                  )}
                >
                  <Checkbox checked={selectedFiscal.includes(fiscal.code)} className="pointer-events-none h-3 w-3" />
                  <span>{fiscal.code}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Municipio */}
          <MunicipalitySearch
            value={municipalityId}
            onChange={setMunicipalityId}
            compact
          />

          {error && (
            <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleClose} disabled={isSaving}>
            Cancelar
          </Button>
          <Button onClick={handleSave} disabled={isSaving}>
            {isSaving ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Creando...
              </>
            ) : (
              'Crear Cliente'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
