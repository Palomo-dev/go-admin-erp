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

import { useState, type FormEvent } from 'react';
import { WifiOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { POSService } from '@/lib/services/posService';
import type { Customer } from './types';

const DOC_TYPES: Array<{ code: string; label: string }> = [
  { code: 'CC', label: 'Cédula de ciudadanía' },
  { code: 'CE', label: 'Cédula de extranjería' },
  { code: 'NIT', label: 'NIT' },
  { code: 'TI', label: 'Tarjeta de identidad' },
  { code: 'PP', label: 'Pasaporte' },
  { code: 'PEP', label: 'Permiso especial de permanencia' },
];

interface OfflineCustomerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: (customer: Customer) => void;
}

export function OfflineCustomerDialog({ open, onOpenChange, onCreated }: OfflineCustomerDialogProps) {
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
      setError('El nombre es obligatorio');
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
      setError(err instanceof Error ? err.message : 'No se pudo registrar el cliente');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) reset();
        onOpenChange(next);
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Nuevo cliente (sin conexión)</DialogTitle>
          <DialogDescription className="flex items-start gap-2">
            <WifiOff className="h-4 w-4 mt-0.5 shrink-0 text-amber-600" aria-hidden="true" />
            <span>
              Se guarda en este equipo y se enviará a Go Admin al volver la red, antes que las ventas que lo usen. Los demás datos
              (dirección, municipio, responsabilidades fiscales) se completan después desde Clientes.
            </span>
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-3" noValidate>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label htmlFor="offline-customer-first-name">Nombres *</Label>
              <Input id="offline-customer-first-name" value={firstName} onChange={(e) => setFirstName(e.target.value)} autoFocus required autoComplete="off" />
            </div>
            <div className="space-y-1">
              <Label htmlFor="offline-customer-last-name">Apellidos</Label>
              <Input id="offline-customer-last-name" value={lastName} onChange={(e) => setLastName(e.target.value)} autoComplete="off" />
            </div>
          </div>
          <div className="grid grid-cols-[9rem_1fr] gap-3">
            <div className="space-y-1">
              <Label htmlFor="offline-customer-doc-type">Tipo de documento</Label>
              <Select value={docType} onValueChange={setDocType}>
                <SelectTrigger id="offline-customer-doc-type" aria-label="Tipo de documento">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {DOC_TYPES.map((d) => (
                    <SelectItem key={d.code} value={d.code}>
                      {d.code} · {d.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label htmlFor="offline-customer-doc-number">Número de documento</Label>
              <Input id="offline-customer-doc-number" value={docNumber} onChange={(e) => setDocNumber(e.target.value)} inputMode="numeric" autoComplete="off" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label htmlFor="offline-customer-email">Email</Label>
              <Input id="offline-customer-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="off" />
            </div>
            <div className="space-y-1">
              <Label htmlFor="offline-customer-phone">Teléfono</Label>
              <Input id="offline-customer-phone" type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} autoComplete="off" />
            </div>
          </div>
          {error && (
            <p role="alert" className="text-sm text-red-600 dark:text-red-400">
              {error}
            </p>
          )}
          <DialogFooter className="gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
              Cancelar
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? 'Guardando…' : 'Guardar cliente'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export default OfflineCustomerDialog;
