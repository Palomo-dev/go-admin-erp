'use client';

import React, { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/components/ui/use-toast';
import { supabase } from '@/lib/supabase/config';
import { formatCurrency } from '@/utils/Utils';
import {
  obtenerContextoSalidaAnticipada,
  ejecutarSalidaAnticipada,
  type ContextoSalidaAnticipada,
} from '@/lib/services/pms/salidaAnticipadaService';

const METODOS = [
  { value: '', label: 'Sin pago ahora (queda como deuda)' },
  { value: 'cash', label: 'Efectivo' },
  { value: 'card', label: 'Tarjeta' },
  { value: 'transfer', label: 'Transferencia' },
];

interface Props {
  reservationId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDone: () => void;
}

export function SalidaAnticipadaDialog({ reservationId, open, onOpenChange, onDone }: Props) {
  const { toast } = useToast();
  const [ctx, setCtx] = useState<ContextoSalidaAnticipada | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [motivo, setMotivo] = useState('');
  const [metodo, setMetodo] = useState('');
  const [monto, setMonto] = useState('');
  const [enviando, setEnviando] = useState(false);

  useEffect(() => {
    if (!open) return;
    setCtx(null); setError(null); setMotivo(''); setMetodo(''); setMonto('');
    obtenerContextoSalidaAnticipada(reservationId)
      .then((c) => { setCtx(c); setMonto(String(Math.max(0, c.resumen.saldo))); })
      .catch((e) => setError(e?.message || 'No se pudo calcular la salida anticipada'));
  }, [open, reservationId]);

  const r = ctx?.resumen;
  const montoNum = Number(monto) || 0;
  const valido = !!ctx && motivo.trim().length >= 5 && (metodo === '' || montoNum > 0);

  const confirmar = async () => {
    if (!ctx || !valido) return;
    setEnviando(true);
    try {
      const { data } = await supabase.auth.getUser();
      await ejecutarSalidaAnticipada(ctx, {
        userId: data.user?.id,
        motivo: motivo.trim(),
        pago: metodo ? { method: metodo, amount: montoNum } : null,
      });
      toast({ title: 'Estadía cerrada', description: 'Salida anticipada registrada; la habitación pasó a limpieza.' });
      onOpenChange(false);
      onDone();
    } catch (e: any) {
      toast({ title: 'Error', description: e?.message || 'No se pudo registrar la salida anticipada', variant: 'destructive' });
    } finally {
      setEnviando(false);
    }
  };

  const fila = (k: string, v: string, fuerte = false) => (
    <div className={`flex justify-between text-sm ${fuerte ? 'font-semibold' : ''}`}>
      <span className="text-gray-600 dark:text-gray-400">{k}</span>
      <span className="text-gray-900 dark:text-gray-100">{v}</span>
    </div>
  );

  return (
    <Dialog open={open} onOpenChange={(o) => !enviando && onOpenChange(o)}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Cancelar estadía (salida anticipada)</DialogTitle>
          <DialogDescription>
            Se cobran las noches usadas y los consumos; se anulan las noches no usadas y la habitación pasa a limpieza.
          </DialogDescription>
        </DialogHeader>

        {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
        {!ctx && !error && <p className="text-sm text-gray-500">Calculando…</p>}

        {ctx && r && (
          <div className="space-y-3">
            <div className="rounded-md border border-gray-200 dark:border-gray-700 p-3 space-y-1">
              {fila('Llegada', ctx.checkin)}
              {fila('Salida prevista → real', `${ctx.checkoutPrevisto} → ${ctx.hoy}`)}
              {fila('Noches usadas / previstas', `${r.nochesUsadas} / ${r.nochesPrevistas}`)}
              {fila(`Hospedaje usado (${r.nochesUsadas} × ${formatCurrency(r.tarifaNoche)})`, formatCurrency(r.hospedajeUsado))}
              {fila(`Noches anuladas (${r.nochesAnuladas})`, `− ${formatCurrency(r.hospedajeAnulado)}`)}
              {fila('Consumos del folio', formatCurrency(r.consumos))}
              {fila('Total a cobrar', formatCurrency(r.totalACobrar), true)}
              {fila('Pagos y depósitos', `− ${formatCurrency(r.pagos)}`)}
              {fila(r.saldo >= 0 ? 'Saldo pendiente' : 'Saldo a favor del huésped', formatCurrency(Math.abs(r.saldo)), true)}
            </div>
            {ctx.facturaId && r.hospedajeAnulado > 0 && (
              <p className="text-xs text-amber-700 dark:text-amber-400">
                La reserva ya tiene factura: se emitirá una nota crédito por {formatCurrency(r.hospedajeAnulado)} (no se borra la factura).
              </p>
            )}
            <div className="space-y-1">
              <label className="text-sm font-medium">Motivo (obligatorio)</label>
              <Textarea value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Ej.: el huésped adelantó su viaje" />
            </div>
            {r.saldo > 0 && (
              <div className="grid grid-cols-2 gap-2">
                <Select value={metodo || 'none'} onValueChange={(v) => setMetodo(v === 'none' ? '' : v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {METODOS.map((m) => (
                      <SelectItem key={m.value || 'none'} value={m.value || 'none'}>{m.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Input type="number" min={0} value={monto} disabled={!metodo} onChange={(e) => setMonto(e.target.value)} />
              </div>
            )}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={enviando}>Volver</Button>
          <Button onClick={confirmar} disabled={!valido || enviando} className="bg-amber-600 hover:bg-amber-700 text-white">
            {enviando ? 'Procesando…' : 'Confirmar salida anticipada'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
