'use client';

/**
 * Registro rápido de cliente SIN RED en Go Admin Desktop (fase 4D).
 *
 * El formulario completo (`ClientForm`) necesita Supabase para sus listas
 * (roles, responsabilidades fiscales, tipos de documento, municipios) y para
 * el insert, así que sin conexión el POS abre este diálogo mínimo: nombre,
 * documento, email y teléfono. Llama a `POSService.createCustomer`, que sin
 * red genera el id, guarda en el catálogo local y encola en el outbox de
 * clientes; al volver la red se inserta antes que las ventas.
 *
 * Solo se monta cuando `POSService.usesLocalCatalog()` es true: en la web y
 * en Desktop con red sigue el diálogo completo de siempre.
 */

import { useId, useState, type FormEvent } from 'react';
import { WifiOff } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { FormField, KbdButton, PanelAdaptable } from '@/components/kit';
import { Input } from '@/components/ui/input';
import { PhoneInput } from '@/components/kit/PhoneInput';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { POSService } from '@/lib/services/posService';
import type { Customer } from './types';

// El nombre de cada tipo sale de `posVenta.clienteSinConexion.tiposDocumento.<code>`.
const DOC_TYPES = ['CC', 'CE', 'NIT', 'TI', 'PP', 'PEP'] as const;

interface OfflineCustomerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: (customer: Customer) => void;
}

export function OfflineCustomerDialog({ open, onOpenChange, onCreated }: OfflineCustomerDialogProps) {
  const t = useTranslations('posVenta.clienteSinConexion');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [docType, setDocType] = useState('CC');
  const [docNumber, setDocNumber] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reset = () => {
    setFirstName('');
    setLastName('');
    setDocType('CC');
    setDocNumber('');
    setEmail('');
    setPhone('');
    setError(null);
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!firstName.trim()) {
      setError(t('nombreObligatorio'));
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const customer = await POSService.createCustomer({
        first_name: firstName.trim(),
        last_name: lastName.trim(),
        doc_type: docNumber.trim() ? docType : undefined,
        doc_number: docNumber.trim() || undefined,
        email: email.trim() || undefined,
        phone: phone.trim() || undefined,
      });
      onCreated(customer);
      reset();
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('errorRegistrar'));
    } finally {
      setSaving(false);
    }
  };

  // Figma `187:7225`: diálogo del kit (hoja inferior en el celular). El pie queda fuera del
  // `<form>`, así que «Guardar» se asocia con `form=`: Enter en un campo sigue enviando.
  const idFormulario = useId();

  return (
    <PanelAdaptable
      abierto={open}
      onAbiertoChange={(next) => {
        if (!next) reset();
        onOpenChange(next);
      }}
      titulo={t('titulo')}
      descripcion={t('descripcion')}
      icono={WifiOff}
      ancho={520}
      ocupado={saving}
      pie={
        <>
          <KbdButton variante="secundario" onClick={() => onOpenChange(false)} disabled={saving}>
            {t('cancelar')}
          </KbdButton>
          <KbdButton type="submit" form={idFormulario} cargando={saving}>
            {saving ? t('guardando') : t('guardar')}
          </KbdButton>
        </>
      }
    >
      <form id={idFormulario} onSubmit={handleSubmit} className="flex flex-col gap-3" noValidate>
        <div className="grid grid-cols-2 gap-3">
          <FormField etiqueta={t('nombres')} obligatorio>
            <Input id="offline-customer-first-name" value={firstName} onChange={(e) => setFirstName(e.target.value)} autoFocus required autoComplete="off" />
          </FormField>
          <FormField etiqueta={t('apellidos')}>
            <Input id="offline-customer-last-name" value={lastName} onChange={(e) => setLastName(e.target.value)} autoComplete="off" />
          </FormField>
        </div>
        <div className="grid grid-cols-[9rem_1fr] gap-3">
          <FormField etiqueta={t('tipoDocumento')} id="offline-customer-doc-type">
            {(campo) => (
              <Select value={docType} onValueChange={setDocType}>
                <SelectTrigger id={campo.id} aria-describedby={campo['aria-describedby']}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {DOC_TYPES.map((code) => (
                    <SelectItem key={code} value={code}>
                      {code} · {t(`tiposDocumento.${code}`)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </FormField>
          <FormField etiqueta={t('numeroDocumento')}>
            <Input id="offline-customer-doc-number" value={docNumber} onChange={(e) => setDocNumber(e.target.value)} inputMode="numeric" autoComplete="off" />
          </FormField>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <FormField etiqueta={t('email')}>
            <Input id="offline-customer-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="off" />
          </FormField>
          <FormField etiqueta={t('telefono')}>
            <PhoneInput id="offline-customer-phone" value={phone} onChange={setPhone} autoComplete="off" />
          </FormField>
        </div>
        {error && (
          <p role="alert" className="text-sm text-danger-text">
            {error}
          </p>
        )}
      </form>
    </PanelAdaptable>
  );
}

export default OfflineCustomerDialog;
