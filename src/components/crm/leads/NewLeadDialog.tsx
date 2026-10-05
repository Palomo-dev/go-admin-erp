'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { aE164, mensajeErrorTelefono, normalizarTelefono } from '@/lib/utils/telefono';
import { useMonedaOrganizacion } from '@/lib/hooks/useOrgCurrency';
import { toast } from '@/components/ui/use-toast';
import { opportunitiesService } from '@/components/crm/oportunidades/opportunitiesService';
import type { Customer, Pipeline } from '@/components/crm/oportunidades/types';
import { describeError, logError } from '@/lib/utils/errorMessage';
import { NewLeadDialogView } from './NewLeadDialogView';

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

/**
 * Monedas extra del selector. La base de la organización y la del formulario
 * se añaden siempre; no se cablea ninguna moneda local.
 */
const CURRENCIES = ['USD', 'EUR', 'MXN'];

interface NewLeadDialogProps {
  initialPhone?: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Sucursal activa; null = todas. Se propaga al alta y a la búsqueda. */
  branchId: number | null;
  /** Se llama tras crear el lead, para refrescar el listado. */
  onCreated: () => void | Promise<void>;
}

type CustomerMode = 'existing' | 'new';

export function NewLeadDialog({ open, onOpenChange, branchId, onCreated, initialPhone }: NewLeadDialogProps) {
  const [customerMode, setCustomerMode] = useState<CustomerMode>('existing');
  const [isSaving, setIsSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Lead
  const [name, setName] = useState('');
  const [amount, setAmount] = useState('');
  // Vacía hasta que se resuelve la moneda base de la organización.
  const [currency, setCurrency] = useState('');
  const { code: monedaBase, resuelta: monedaResuelta } = useMonedaOrganizacion();
  useEffect(() => {
    if (monedaResuelta && !currency) setCurrency(monedaBase);
  }, [monedaResuelta, monedaBase, currency]);
  const opcionesMoneda = Array.from(new Set([monedaResuelta ? monedaBase : '', currency, ...CURRENCIES].filter(Boolean)));
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

  useEffect(() => {
    if (!open || !initialPhone || !/^\+[1-9][0-9]{6,14}$/.test(initialPhone) || aE164(initialPhone) !== initialPhone) return;
    setCustomerMode('new');
    setNewPhone(normalizarTelefono(initialPhone));
    setSource('llamada_entrante');
  }, [open, initialPhone]);

  const resetForm = useCallback(() => {
    setCustomerMode('existing');
    setFormError(null);
    setName('');
    setAmount('');
    setCurrency('');
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
      const errorTelefono = mensajeErrorTelefono(newPhone);
      if (errorTelefono) {
        setFormError(errorTelefono);
        return;
      }
    }

    const payload: Record<string, unknown> = {
      name: name.trim(),
      amount: amount ? Number(amount) : 0,
      // Sin moneda elegida no se manda: la base la pone el servidor.
      currency: currency || undefined,
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

  return <NewLeadDialogView {...{ open, handleOpenChange, handleSubmit, isSaving, formError, name, setName, customerMode, setCustomerMode, customerResults, customerId, setCustomerId, handleCustomerSearchChange, isSearchingCustomers, customerSearchError, newFirstName, setNewFirstName, newLastName, setNewLastName, newEmail, setNewEmail, newPhone, setNewPhone, newCompany, setNewCompany, source, setSource, pipelines, pipelineId, setPipelineId, amount, setAmount, currency, setCurrency, opcionesMoneda, expectedCloseDate, setExpectedCloseDate }} />;
}
