'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Loader2, Plus, UserPlus } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { toast } from '@/components/ui/use-toast';
import { CustomerSearchSelect } from '@/components/crm/oportunidades/CustomerSearchSelect';
import { PipelineSearchSelect } from '@/components/crm/oportunidades/PipelineSearchSelect';
import { opportunitiesService } from '@/components/crm/oportunidades/opportunitiesService';
import type { Customer, Pipeline } from '@/components/crm/oportunidades/types';
import { describeError, logError } from '@/lib/utils/errorMessage';

/**
 * Alta manual de un lead desde el ERP.
 *
 * Un lead vive en `opportunities` con `record_type='lead'`, y esa tabla NO
 * guarda correo ni teléfono: sin ficha en `customers` no se le puede llamar,
 * escribir ni mandar WhatsApp. Por eso el diálogo obliga a elegir un cliente
 * existente o a crear uno nuevo (que nace con `lifecycle_stage='lead'`).
 *
 * El alta la hace `POST /api/crm/leads`, que resuelve pipeline/etapa por
 * defecto, valida pertenencia a la organización y fija `record_type='lead'`.
 */

/** Orígenes de lead que se ofrecen en el alta manual. */
const LEAD_SOURCES: { value: string; label: string }[] = [
  { value: 'manual_erp', label: 'Alta manual (ERP)' },
  { value: 'llamada_entrante', label: 'Llamada entrante' },
  { value: 'whatsapp', label: 'WhatsApp' },
  { value: 'referido', label: 'Referido' },
  { value: 'evento', label: 'Evento / feria' },
  { value: 'redes_sociales', label: 'Redes sociales' },
  { value: 'otro', label: 'Otro' },
];

const CURRENCIES = ['COP', 'USD', 'EUR', 'MXN'];

interface NewLeadDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Sucursal activa; null = todas. Se propaga al alta y a la búsqueda. */
  branchId: number | null;
  /** Se llama tras crear el lead, para refrescar el listado. */
  onCreated: () => void | Promise<void>;
}

type CustomerMode = 'existing' | 'new';

export function NewLeadDialog({ open, onOpenChange, branchId, onCreated }: NewLeadDialogProps) {
  const [customerMode, setCustomerMode] = useState<CustomerMode>('existing');
  const [isSaving, setIsSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Lead
  const [name, setName] = useState('');
  const [amount, setAmount] = useState('');
  const [currency, setCurrency] = useState('COP');
  const [source, setSource] = useState('manual_erp');
  const [expectedCloseDate, setExpectedCloseDate] = useState('');

  // Pipeline (opcional: si se deja vacío, lo resuelve el servidor)
  const [pipelines, setPipelines] = useState<Pipeline[]>([]);
  const [pipelineId, setPipelineId] = useState('');

  // Cliente existente
  const [customerId, setCustomerId] = useState('');
  const [customerResults, setCustomerResults] = useState<Customer[]>([]);
  const [isSearchingCustomers, setIsSearchingCustomers] = useState(false);
  const [customerSearchError, setCustomerSearchError] = useState<string | null>(null);
  const searchSeq = useRef(0);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Cliente nuevo
  const [newFirstName, setNewFirstName] = useState('');
  const [newLastName, setNewLastName] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [newPhone, setNewPhone] = useState('');
  const [newCompany, setNewCompany] = useState('');

  const resetForm = useCallback(() => {
    setCustomerMode('existing');
    setFormError(null);
    setName('');
    setAmount('');
    setCurrency('COP');
    setSource('manual_erp');
    setExpectedCloseDate('');
    setPipelineId('');
    setCustomerId('');
    setCustomerResults([]);
    setCustomerSearchError(null);
    setNewFirstName('');
    setNewLastName('');
    setNewEmail('');
    setNewPhone('');
    setNewCompany('');
  }, []);

  // Pipelines de la organización (para poder elegir si hay más de uno).
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    opportunitiesService
      .getPipelines()
      .then((data) => {
        if (!cancelled) setPipelines(data);
      })
      .catch((err) => logError('[NewLeadDialog] cargar pipelines', err));
    return () => {
      cancelled = true;
    };
  }, [open]);

  // Primera tanda de clientes al abrir, para que el selector no salga vacío.
  useEffect(() => {
    if (!open) return;
    void runCustomerSearch('');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, branchId]);

  useEffect(() => {
    return () => {
      if (searchTimer.current) clearTimeout(searchTimer.current);
    };
  }, []);

  async function runCustomerSearch(term: string) {
    const seq = ++searchSeq.current;
    setIsSearchingCustomers(true);
    setCustomerSearchError(null);
    try {
      const data = await opportunitiesService.searchCustomers(term, branchId);
      // Descartar respuestas de búsquedas viejas que llegan tarde.
      if (seq !== searchSeq.current) return;
      setCustomerResults(data);
    } catch (err) {
      if (seq !== searchSeq.current) return;
      logError('[NewLeadDialog] buscar clientes', err);
      setCustomerResults([]);
      setCustomerSearchError(describeError(err));
    } finally {
      if (seq === searchSeq.current) setIsSearchingCustomers(false);
    }
  }

  const handleCustomerSearchChange = (term: string) => {
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => {
      void runCustomerSearch(term);
    }, 300);
  };

  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen && isSaving) return;
    if (!nextOpen) resetForm();
    onOpenChange(nextOpen);
  };

  const handleSubmit = async () => {
    setFormError(null);

    if (!name.trim()) {
      setFormError('El nombre del lead es obligatorio.');
      return;
    }

    if (customerMode === 'existing' && !customerId) {
      setFormError('Elige un cliente existente o crea uno nuevo: un lead sin ficha no se puede contactar.');
      return;
    }

    if (customerMode === 'new') {
      if (!newFirstName.trim()) {
        setFormError('El nombre del cliente nuevo es obligatorio.');
        return;
      }
      if (!newEmail.trim() && !newPhone.trim()) {
        setFormError('El cliente nuevo necesita al menos correo o teléfono.');
        return;
      }
    }

    const payload: Record<string, unknown> = {
      name: name.trim(),
      amount: amount ? Number(amount) : 0,
      currency,
      source,
      expected_close_date: expectedCloseDate || undefined,
      pipeline_id: pipelineId || undefined,
      branch_id: branchId ?? undefined,
    };

    if (customerMode === 'existing') {
      payload.customer_id = customerId;
    } else {
      payload.new_customer = {
        // `customers.full_name` es columna generada: se envían los nombres sueltos.
        first_name: newFirstName.trim(),
        last_name: newLastName.trim() || undefined,
        email: newEmail.trim() || undefined,
        phone: newPhone.trim() || undefined,
        company_name: newCompany.trim() || undefined,
      };
    }

    setIsSaving(true);
    try {
      const res = await fetch('/api/crm/leads', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json?.success) {
        throw new Error(json?.error || `Error ${res.status}`);
      }

      toast({
        title: 'Lead creado',
        description: `"${name.trim()}" se registró como lead.`,
      });
      resetForm();
      onOpenChange(false);
      await onCreated();
    } catch (err) {
      logError('[NewLeadDialog] crear lead', err);
      setFormError(describeError(err));
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-700">
        <DialogHeader>
          <DialogTitle className="text-gray-900 dark:text-white">Nuevo lead</DialogTitle>
          <DialogDescription className="text-gray-500 dark:text-gray-400">
            Un lead siempre nace con ficha de cliente: es lo que permite llamarlo,
            escribirle o mandarle WhatsApp más adelante.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Nombre del lead */}
          <div className="space-y-2">
            <Label htmlFor="lead-name" className="text-gray-700 dark:text-gray-300">
              Nombre del lead *
            </Label>
            <Input
              id="lead-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ej. Restaurante La Playa — punto de venta"
              className="bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-700"
            />
          </div>

          {/* Cliente: existente o nuevo */}
          <Tabs value={customerMode} onValueChange={(v) => setCustomerMode(v as CustomerMode)}>
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="existing">Cliente existente</TabsTrigger>
              <TabsTrigger value="new">
                <UserPlus className="h-3.5 w-3.5 mr-1" />
                Cliente nuevo
              </TabsTrigger>
            </TabsList>

            <TabsContent value="existing" className="pt-3">
              <CustomerSearchSelect
                customers={customerResults}
                selectedCustomerId={customerId}
                onSelect={setCustomerId}
                onSearchChange={handleCustomerSearchChange}
                isSearching={isSearchingCustomers}
                searchError={customerSearchError}
                allowEmpty={false}
                label="Cliente *"
              />
            </TabsContent>

            <TabsContent value="new" className="pt-3 space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label htmlFor="lead-customer-first" className="text-gray-700 dark:text-gray-300">
                    Nombre *
                  </Label>
                  <Input
                    id="lead-customer-first"
                    value={newFirstName}
                    onChange={(e) => setNewFirstName(e.target.value)}
                    placeholder="Nombre"
                    className="bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-700"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="lead-customer-last" className="text-gray-700 dark:text-gray-300">
                    Apellidos
                  </Label>
                  <Input
                    id="lead-customer-last"
                    value={newLastName}
                    onChange={(e) => setNewLastName(e.target.value)}
                    placeholder="Apellidos"
                    className="bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-700"
                  />
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label htmlFor="lead-customer-email" className="text-gray-700 dark:text-gray-300">
                    Correo
                  </Label>
                  <Input
                    id="lead-customer-email"
                    type="email"
                    value={newEmail}
                    onChange={(e) => setNewEmail(e.target.value)}
                    placeholder="correo@ejemplo.com"
                    className="bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-700"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="lead-customer-phone" className="text-gray-700 dark:text-gray-300">
                    Teléfono
                  </Label>
                  <Input
                    id="lead-customer-phone"
                    value={newPhone}
                    onChange={(e) => setNewPhone(e.target.value)}
                    placeholder="+57 300 000 0000"
                    className="bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-700"
                  />
                </div>
              </div>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Hace falta al menos correo o teléfono.
              </p>
              <div className="space-y-2">
                <Label htmlFor="lead-customer-company" className="text-gray-700 dark:text-gray-300">
                  Empresa
                </Label>
                <Input
                  id="lead-customer-company"
                  value={newCompany}
                  onChange={(e) => setNewCompany(e.target.value)}
                  placeholder="Razón social (opcional)"
                  className="bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-700"
                />
              </div>
            </TabsContent>
          </Tabs>

          {/* Origen */}
          <div className="space-y-2">
            <Label className="text-gray-700 dark:text-gray-300">Origen</Label>
            <Select value={source} onValueChange={setSource}>
              <SelectTrigger className="bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-700">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {LEAD_SOURCES.map((s) => (
                  <SelectItem key={s.value} value={s.value}>
                    {s.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Pipeline (solo si hay más de uno) */}
          {pipelines.length > 1 && (
            <PipelineSearchSelect
              pipelines={pipelines}
              selectedPipelineId={pipelineId}
              onSelect={setPipelineId}
              label="Pipeline"
            />
          )}

          {/* Importe y moneda */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="lead-amount" className="text-gray-700 dark:text-gray-300">
                Valor estimado
              </Label>
              <Input
                id="lead-amount"
                type="number"
                min="0"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0"
                className="bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-700"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-gray-700 dark:text-gray-300">Moneda</Label>
              <Select value={currency} onValueChange={setCurrency}>
                <SelectTrigger className="bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-700">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CURRENCIES.map((c) => (
                    <SelectItem key={c} value={c}>
                      {c}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Fecha estimada de cierre */}
          <div className="space-y-2">
            <Label htmlFor="lead-close-date" className="text-gray-700 dark:text-gray-300">
              Cierre estimado
            </Label>
            <Input
              id="lead-close-date"
              type="date"
              value={expectedCloseDate}
              onChange={(e) => setExpectedCloseDate(e.target.value)}
              className="bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-700"
            />
          </div>

          {formError && (
            <p
              role="alert"
              className="text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-md px-3 py-2"
            >
              {formError}
            </p>
          )}
        </div>

        <DialogFooter className="gap-2">
          <Button
            variant="outline"
            onClick={() => handleOpenChange(false)}
            disabled={isSaving}
            className="border-gray-200 dark:border-gray-700"
          >
            Cancelar
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={isSaving}
            className="bg-blue-600 hover:bg-blue-700 text-white"
          >
            {isSaving ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" />
                Creando...
              </>
            ) : (
              <>
                <Plus className="h-3.5 w-3.5 mr-1" />
                Crear lead
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
