'use client';

/**
 * «Crear cliente rápido» desde Nueva conversación. Los roles, la
 * responsabilidad fiscal y el municipio que se eligen aquí viajan a
 * `createQuickCustomer`; antes se mostraban pero se descartaban al guardar.
 * Aspecto: Figma 94-chat-recuperado-11 (520 px, campos del kit, opciones con
 * casilla y «Crear cliente» con icono).
 */
import React, { useState, useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { User, UserPlus, Loader2, CreditCard } from 'lucide-react';
import { supabase } from '@/lib/supabase/config';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { FormField, clasesBoton } from '@/components/kit';
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
      'inline-flex h-7 items-center gap-1.5 rounded-md border px-2 text-[13px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand',
      activa ? 'border-line-brand bg-brand-tint text-brand-deep' : 'border-line bg-surface text-fg-secondary hover:bg-hover',
    );

  return (
    <Dialog open={isOpen} onOpenChange={(abierto) => !abierto && !isSaving && handleClose()}>
      <DialogContent className="w-[calc(100%-32px)] max-w-none gap-0 rounded-2xl border-line bg-surface p-6 text-fg sm:max-w-[520px] sm:rounded-2xl">
        <div className="pr-8">
          <DialogTitle className="text-lg font-semibold leading-6 text-fg">{t('titulo')}</DialogTitle>
          <DialogDescription className="mt-1 text-sm leading-5 text-fg-secondary">{t('descripcion')}</DialogDescription>
        </div>

        <div className="mt-4 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <FormField etiqueta={t('nombre')} obligatorio error={error === t('errores.nombreRequerido') ? error : null}>
              <Input
                id="first_name"
                value={formData.first_name}
                onChange={(e) => setFormData({ ...formData, first_name: e.target.value })}
                placeholder={t('nombrePlaceholder')}
                autoComplete="off"
                autoFocus
              />
            </FormField>
            <FormField etiqueta={t('apellido')}>
              <Input
                id="last_name"
                value={formData.last_name}
                onChange={(e) => setFormData({ ...formData, last_name: e.target.value })}
                placeholder={t('apellidoPlaceholder')}
                autoComplete="off"
              />
            </FormField>
          </div>

          <FormField etiqueta={t('correo')}>
            <Input
              id="email"
              type="email"
              value={formData.email}
              onChange={(e) => setFormData({ ...formData, email: e.target.value })}
              placeholder={t('correoPlaceholder')}
              autoComplete="off"
            />
          </FormField>

          <FormField etiqueta={t('telefono')}>
            <PhoneInput id="phone" value={formData.phone} onChange={(v) => setFormData({ ...formData, phone: v })} />
          </FormField>

          <fieldset className="space-y-2">
            <legend className="mb-2 flex items-center gap-1.5 text-[15px] font-medium text-fg">
              <User className="size-4 text-fg-secondary" strokeWidth={1.5} aria-hidden /> {t('roles')}
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
                    <Checkbox checked={activa} className="pointer-events-none size-3.5" tabIndex={-1} aria-hidden />
                    <span>{role.label}</span>
                  </button>
                );
              })}
            </div>
          </fieldset>

          <fieldset className="space-y-2">
            <legend className="mb-2 flex items-center gap-1.5 text-[15px] font-medium text-fg">
              <CreditCard className="size-4 text-fg-secondary" strokeWidth={1.5} aria-hidden /> {t('responsabilidadFiscal')}
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
                    <Checkbox checked={activa} className="pointer-events-none size-3.5" tabIndex={-1} aria-hidden />
                    <span>{fiscal.code}</span>
                  </button>
                );
              })}
            </div>
          </fieldset>

          <MunicipalitySearch value={municipalityId} onChange={setMunicipalityId} compact />

          {error && error !== t('errores.nombreRequerido') && (
            <p role="alert" className="text-sm text-danger-text">
              {error}
            </p>
          )}
        </div>

        <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end sm:gap-3">
          <button type="button" onClick={handleClose} disabled={isSaving} className={clasesBoton({ variante: 'secundario' })}>
            {t('cancelar')}
          </button>
          <button type="button" onClick={() => void handleSave()} disabled={isSaving} aria-busy={isSaving || undefined} className={clasesBoton()}>
            {isSaving ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <UserPlus className="size-4" strokeWidth={1.5} aria-hidden />}
            {isSaving ? t('creando') : t('crear')}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
