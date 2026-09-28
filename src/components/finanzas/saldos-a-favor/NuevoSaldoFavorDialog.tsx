'use client';

import React, { useEffect, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/components/ui/use-toast';
import { Loader2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import {
  saldosAFavorService,
  ClienteSimple,
  ContextoSaldoFavor,
  ErrorPeticionSaldoFavor,
  nuevaClaveIdempotencia,
} from './saldosAFavorService';
import { useBranch } from '@/lib/context/BranchContext';
import { BranchSelectorField } from '@/components/inventario/BranchSelectorField';
import { CampoFecha } from '@/components/kit/CampoFecha';

interface NuevoSaldoFavorDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  organizationId: number;
  onSuccess?: () => void;
}

export function NuevoSaldoFavorDialog({
  open,
  onOpenChange,
  organizationId,
  onSuccess,
}: NuevoSaldoFavorDialogProps) {
  const { toast } = useToast();
  const t = useTranslations('saldosAFavor');
  const { selectedBranchId } = useBranch();
  const [branchId, setBranchId] = useState<number | null>(selectedBranchId);
  const [isLoading, setIsLoading] = useState(false);
  const [clientes, setClientes] = useState<ClienteSimple[]>([]);
  const [errorClientes, setErrorClientes] = useState(false);
  const [contexto, setContexto] = useState<ContextoSaldoFavor | null>(null);
  const [customerId, setCustomerId] = useState('');
  const [amount, setAmount] = useState<number>(0);
  const [metodo, setMetodo] = useState('');
  const [cuentaBancaria, setCuentaBancaria] = useState('');
  const [referencia, setReferencia] = useState('');
  const [notes, setNotes] = useState('');
  const [expiry, setExpiry] = useState('');
  // Una clave por apertura: un doble clic o un reintento no registra dos anticipos.
  const [clave, setClave] = useState('');

  const textoError = (error: unknown): string => {
    const codigo = error instanceof ErrorPeticionSaldoFavor ? error.codigo : 'error_desconocido';
    return t.has(`errores.${codigo}`) ? t(`errores.${codigo}`) : t('errores.error_desconocido');
  };

  useEffect(() => {
    if (open && organizationId) {
      setErrorClientes(false);
      saldosAFavorService
        .listarClientes(organizationId)
        .then(setClientes)
        .catch(() => {
          setClientes([]);
          setErrorClientes(true);
        });
      setCustomerId('');
      setAmount(0);
      setMetodo('');
      setCuentaBancaria('');
      setReferencia('');
      setNotes('');
      setExpiry('');
      setClave(nuevaClaveIdempotencia('anticipo'));
    }
  }, [open, organizationId]);

  // Métodos de la organización y caja abierta de la sucursal elegida.
  useEffect(() => {
    if (!open) return;
    let vigente = true;
    setContexto(null);
    saldosAFavorService
      .contexto(branchId)
      .then((c) => {
        if (vigente) setContexto(c);
      })
      .catch((error: unknown) => {
        if (vigente) toast({ title: 'Error', description: textoError(error), variant: 'destructive' });
      });
    return () => {
      vigente = false;
    };
    // textoError y toast no cambian el contexto que se pide.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, branchId]);

  const metodoSel = contexto?.metodos.find((m) => m.code === metodo) ?? null;
  const esEfectivo = metodo === 'cash';
  const sinCaja = esEfectivo && contexto !== null && !contexto.caja.abierta;

  const handleSubmit = async () => {
    if (!customerId) {
      toast({ title: 'Error', description: 'Selecciona un cliente', variant: 'destructive' });
      return;
    }
    if (!amount || amount <= 0) {
      toast({ title: 'Error', description: 'El monto debe ser mayor a 0', variant: 'destructive' });
      return;
    }
    if (!metodo) {
      toast({ title: 'Error', description: t('nuevo.metodoPlaceholder'), variant: 'destructive' });
      return;
    }
    if (metodoSel?.requires_reference && !referencia.trim()) {
      toast({ title: 'Error', description: t('errores.referencia_obligatoria'), variant: 'destructive' });
      return;
    }

    setIsLoading(true);
    try {
      const resultado = await saldosAFavorService.crear({
        customerId,
        amount,
        metodo,
        cuentaBancaria: !esEfectivo && cuentaBancaria ? Number(cuentaBancaria) : null,
        referencia,
        notes,
        expiry: expiry || null,
        branchId,
        claveIdempotencia: clave,
      });
      toast({ title: 'Saldo a favor creado', description: t('nuevo.creado', { recibo: resultado.recibo }) });
      onOpenChange(false);
      if (onSuccess) onSuccess();
    } catch (error: unknown) {
      toast({ title: 'Error', description: textoError(error), variant: 'destructive' });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle>Nuevo saldo a favor</DialogTitle>
          <DialogDescription>{t('nuevo.descripcion')}</DialogDescription>
        </DialogHeader>

        <div className="grid gap-3 py-2">
          <BranchSelectorField value={branchId} onChange={setBranchId} required />

          <div className="grid gap-1.5">
            <Label>Cliente</Label>
            <Select value={customerId} onValueChange={setCustomerId}>
              <SelectTrigger>
                <SelectValue placeholder="Selecciona un cliente" />
              </SelectTrigger>
              <SelectContent>
                {clientes.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.full_name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {errorClientes && <p className="text-xs text-red-600 dark:text-red-400">{t('errorClientes')}</p>}
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="montoSaldo">Monto</Label>
            <Input
              id="montoSaldo"
              type="number"
              min="0"
              value={amount || 0}
              onChange={(e) => setAmount(parseFloat(e.target.value) || 0)}
            />
          </div>

          <div className="grid gap-1.5">
            <Label>{t('nuevo.metodo')}</Label>
            <Select value={metodo} onValueChange={setMetodo}>
              <SelectTrigger>
                <SelectValue placeholder={t('nuevo.metodoPlaceholder')} />
              </SelectTrigger>
              <SelectContent>
                {(contexto?.metodos ?? []).map((m) => (
                  <SelectItem key={m.code} value={m.code}>
                    {m.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {sinCaja && <p className="text-xs text-red-600 dark:text-red-400">{t('nuevo.sinCaja')}</p>}
          </div>

          {metodo && !esEfectivo && (contexto?.cuentasBancarias.length ?? 0) > 0 && (
            <div className="grid gap-1.5">
              <Label>{t('nuevo.cuentaBancaria')}</Label>
              <Select value={cuentaBancaria} onValueChange={setCuentaBancaria}>
                <SelectTrigger>
                  <SelectValue placeholder={t('nuevo.cuentaBancariaPlaceholder')} />
                </SelectTrigger>
                <SelectContent>
                  {(contexto?.cuentasBancarias ?? []).map((c) => (
                    <SelectItem key={c.id} value={String(c.id)}>
                      {c.name}
                      {c.ultimos ? ` ··${c.ultimos}` : ''}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {metodoSel?.requires_reference && (
            <div className="grid gap-1.5">
              <Label htmlFor="referenciaSaldo">{t('nuevo.referencia')}</Label>
              <Input id="referenciaSaldo" value={referencia} onChange={(e) => setReferencia(e.target.value)} />
            </div>
          )}

          <div className="grid gap-1.5">
            <Label htmlFor="expirySaldo">Vencimiento (opcional)</Label>
            <CampoFecha
              id="expirySaldo"
              min={contexto?.hoy || undefined}
              hoy={contexto?.hoy || undefined}
              valor={expiry}
              onValorChange={setExpiry}
            />
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="notasSaldo">Notas (opcional)</Label>
            <Textarea
              id="notasSaldo"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              placeholder="Motivo del saldo a favor..."
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isLoading}>
            Cancelar
          </Button>
          <Button onClick={handleSubmit} disabled={isLoading || sinCaja}>
            {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Crear saldo
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
