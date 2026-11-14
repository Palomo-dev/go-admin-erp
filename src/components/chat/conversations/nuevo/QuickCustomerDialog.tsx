'use client';

/**
 * «Crear cliente rápido» desde Nueva conversación. Los roles, la
 * responsabilidad fiscal y el municipio que se eligen aquí viajan a
 * `createQuickCustomer`; antes se mostraban pero se descartaban al guardar.
 */
import React, { useState, useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { User, Loader2, CreditCard } from 'lucide-react';
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
import { PhoneInput, mensajeErrorTelefono } from '@/components/kit/PhoneInput';
import { CLIENTE_RAPIDO_POR_DEFECTO, type QuickCustomerData } from '@/lib/services/newConversationService';
import { MunicipalitySearch } from '@/components/shared/MunicipalitySearch';
import { cn } from '@/utils/Utils';

interface QuickCustomerDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (data: QuickCustomerData) => Promise<void>;
}

const VACIO = { first_name: '', last_name: '', email: '', phone: '' };

export default function QuickCustomerDialog({ isOpen, onClose, onSave }: QuickCustomerDialogProps) {
  const t = useTranslations('chatClienteRapido');
  const [formData, setFormData] = useState<QuickCustomerData>(VACIO);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState('');
  const [selectedRoles, setSelectedRoles] = useState<string[]>([...CLIENTE_RAPIDO_POR_DEFECTO.roles]);
  const [selectedFiscal, setSelectedFiscal] = useState<string[]>([...CLIENTE_RAPIDO_POR_DEFECTO.fiscal_responsibilities]);
  const [municipalityId, setMunicipalityId] = useState<string>(CLIENTE_RAPIDO_POR_DEFECTO.fiscal_municipality_id);
  const [customerRoles, setCustomerRoles] = useState<{ code: string; label: string }[]>([]);
  const [fiscalOptions, setFiscalOptions] = useState<{ code: string; description: string }[]>([]);

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

  const reiniciar = () => {
    setFormData(VACIO);
    setSelectedRoles([...CLIENTE_RAPIDO_POR_DEFECTO.roles]);
    setSelectedFiscal([...CLIENTE_RAPIDO_POR_DEFECTO.fiscal_responsibilities]);
    setMunicipalityId(CLIENTE_RAPIDO_POR_DEFECTO.fiscal_municipality_id);
    setError('');
  };

  const handleSave = async () => {
    if (!formData.first_name.trim()) {
      setError(t('errores.nombreRequerido'));
      return;
    }
    const errorTelefono = mensajeErrorTelefono(formData.phone);
    if (errorTelefono) {
      setError(errorTelefono);
      return;
    }

    try {
      setIsSaving(true);
      setError('');
      await onSave({
        ...formData,
        roles: selectedRoles,
        fiscal_responsibilities: selectedFiscal,
        fiscal_municipality_id: municipalityId || undefined,
      });
      reiniciar();
      onClose();
    } catch (err) {
      console.error('Error creando cliente:', err);
      setError(t('errores.alCrear'));
    } finally {
      setIsSaving(false);
    }
  };

  const handleClose = () => {
    reiniciar();
    onClose();
  };

  const alternar = (lista: string[], codigo: string) =>
    lista.includes(codigo) ? lista.filter((c) => c !== codigo) : [...lista, codigo];

  const claseOpcion = (activa: boolean) =>
    cn(
      'flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs transition-colors',
      activa ? 'border-brand bg-brand-tint text-brand-deep' : 'border-line text-fg-secondary hover:bg-subtle',
    );

  return (
    <Dialog open={isOpen} onOpenChange={(abierto) => !abierto && handleClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <User className="h-5 w-5 text-brand" aria-hidden />
            {t('titulo')}
          </DialogTitle>
          <DialogDescription>{t('descripcion')}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="first_name">{t('nombre')} *</Label>
              <Input
                id="first_name"
                value={formData.first_name}
                onChange={(e) => setFormData({ ...formData, first_name: e.target.value })}
                placeholder={t('nombrePlaceholder')}
                autoFocus
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="last_name">{t('apellido')}</Label>
              <Input
                id="last_name"
                value={formData.last_name}
                onChange={(e) => setFormData({ ...formData, last_name: e.target.value })}
                placeholder={t('apellidoPlaceholder')}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="email">{t('correo')}</Label>
            <Input
              id="email"
              type="email"
              value={formData.email}
              onChange={(e) => setFormData({ ...formData, email: e.target.value })}
              placeholder={t('correoPlaceholder')}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="phone">{t('telefono')}</Label>
            <PhoneInput id="phone" value={formData.phone} onChange={(v) => setFormData({ ...formData, phone: v })} />
          </div>

          <fieldset className="space-y-2">
            <legend className="flex items-center gap-1 text-sm font-medium text-fg">
              <User className="h-3.5 w-3.5" aria-hidden /> {t('roles')}
            </legend>
            <div className="flex flex-wrap gap-1.5">
              {customerRoles.map((role) => {
                const activa = selectedRoles.includes(role.code);
                return (
                  <button
                    key={role.code}
                    type="button"
                    aria-pressed={activa}
                    className={claseOpcion(activa)}
                    onClick={() => setSelectedRoles((prev) => alternar(prev, role.code))}
                  >
                    <Checkbox checked={activa} className="pointer-events-none h-3 w-3" tabIndex={-1} aria-hidden />
                    <span>{role.label}</span>
                  </button>
                );
              })}
            </div>
          </fieldset>

          <fieldset className="space-y-2">
            <legend className="flex items-center gap-1 text-sm font-medium text-fg">
              <CreditCard className="h-3.5 w-3.5" aria-hidden /> {t('responsabilidadFiscal')}
            </legend>
            <div className="flex flex-wrap gap-1.5">
              {fiscalOptions.map((fiscal) => {
                const activa = selectedFiscal.includes(fiscal.code);
                return (
                  <button
                    key={fiscal.code}
                    type="button"
                    aria-pressed={activa}
                    title={fiscal.description}
                    className={claseOpcion(activa)}
                    onClick={() => setSelectedFiscal((prev) => alternar(prev, fiscal.code))}
                  >
                    <Checkbox checked={activa} className="pointer-events-none h-3 w-3" tabIndex={-1} aria-hidden />
                    <span>{fiscal.code}</span>
                  </button>
                );
              })}
            </div>
          </fieldset>

          <MunicipalitySearch value={municipalityId} onChange={setMunicipalityId} compact />

          {error && (
            <p role="alert" className="text-sm text-danger-text">
              {error}
            </p>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleClose} disabled={isSaving}>
            {t('cancelar')}
          </Button>
          <Button onClick={handleSave} disabled={isSaving}>
            {isSaving ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />
                {t('creando')}
              </>
            ) : (
              t('crear')
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
