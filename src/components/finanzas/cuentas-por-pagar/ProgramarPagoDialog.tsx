'use client';

/**
 * Programar un pago a proveedor (plan F10, D3): NO es un pago. Queda en
 * `ap_payment_schedules` hasta que otra persona con `finance.approve` lo apruebe
 * (D7). Fecha programada y justificación en sus campos; la referencia no se
 * vuelve a tocar al aprobar.
 */
import { useEffect, useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { CalendarClock } from 'lucide-react';
import { Dialogo, FormField } from '@/components/kit';
// El índice del kit aún no reexporta CampoNumero (pedido al agente del kit).
import { CampoNumero } from '@/components/kit/CampoNumero';
import { simboloMoneda } from '@/components/kit/documento';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { toastSuccess } from '@/components/ui/use-toast';
import { crearFormateadorMoneda, type ContextoMoneda } from '@/lib/utils/moneda';
import { validarMontoPago } from '@/lib/services/compras/logica';
import { clienteCompras, ErrorPeticionCompra } from '@/lib/services/compras/clienteCompras';

export interface ProgramarPagoDialogProps {
  abierto: boolean;
  onAbiertoChange: (abierto: boolean) => void;
  cuentaId: string;
  saldo: number;
  /** Ya programado y pendiente de aprobar: no se puede programar más que el saldo restante. */
  programado?: number;
  moneda: ContextoMoneda;
  hoy: string;
  cuotas?: ReadonlyArray<{ id: string; numero: number; saldo: number; vencimiento: string }>;
  onProgramado?: () => void;
}

export function ProgramarPagoDialog({
  abierto,
  onAbiertoChange,
  cuentaId,
  saldo,
  programado = 0,
  moneda,
  hoy,
  cuotas = [],
  onProgramado,
}: ProgramarPagoDialogProps) {
  const t = useTranslations('cuentasPorPagar.programar');
  const te = useTranslations('cuentasPorPagar.errores');
  const formatear = useMemo(() => crearFormateadorMoneda(moneda), [moneda]);
  const disponible = Math.max(0, Math.round((saldo - programado) * 100) / 100);
  const [monto, setMonto] = useState<number | null>(disponible);
  const [fecha, setFecha] = useState(hoy);
  const [cuota, setCuota] = useState('');
  const [referencia, setReferencia] = useState('');
  const [justificacion, setJustificacion] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!abierto) return;
    setMonto(disponible);
    setFecha(hoy);
    setCuota('');
    setReferencia('');
    setJustificacion('');
    setError(null);
  }, [abierto, disponible, hoy]);

  const validacion = validarMontoPago(disponible, monto);
  const errorMonto = !validacion.valido ? t(`errores.${validacion.motivo}`, { disponible: formatear(disponible) }) : null;
  const errorFecha = !fecha || fecha < hoy ? t('errores.fecha') : null;

  const programar = async () => {
    if (errorMonto || errorFecha || monto === null) return;
    setEnviando(true);
    setError(null);
    try {
      await clienteCompras.programarPago(cuentaId, {
        amount: monto,
        scheduled_date: fecha,
        method: 'transfer',
        reference: referencia.trim() || null,
        notes: justificacion.trim() || null,
        installment_id: cuota || null,
      });
      toastSuccess(t('programado', { monto: formatear(monto), fecha }));
      onProgramado?.();
      onAbiertoChange(false);
    } catch (e) {
      const codigo = e instanceof ErrorPeticionCompra ? e.codigo : 'error_desconocido';
      setError(te.has(codigo) ? te(codigo as never) : te('error_desconocido'));
    } finally {
      setEnviando(false);
    }
  };

  return (
    <Dialogo
      abierto={abierto}
      onAbiertoChange={onAbiertoChange}
      titulo={t('titulo')}
      descripcion={t('descripcion')}
      icono={CalendarClock}
      primario={{
        etiqueta: t('confirmar'),
        onClick: programar,
        cargando: enviando,
        deshabilitada: !!errorMonto || !!errorFecha || disponible <= 0,
        motivo: disponible <= 0 ? t('sinDisponible') : errorMonto ?? errorFecha ?? undefined,
      }}
    >
      <div className="flex flex-col gap-4">
        <p className="text-sm text-fg-secondary">
          {t('disponible', { disponible: formatear(disponible), saldo: formatear(saldo), programado: formatear(programado) })}
        </p>
        <FormField etiqueta={t('monto')} error={errorMonto ?? undefined} obligatorio>
          {(c) => (
            <CampoNumero
              id={c.id}
              aria-describedby={c['aria-describedby']}
              aria-invalid={!!errorMonto}
              valor={monto}
              onValorChange={setMonto}
              prefijo={simboloMoneda(moneda)}
              decimales={moneda.decimals}
            />
          )}
        </FormField>
        <FormField etiqueta={t('fecha')} error={errorFecha ?? undefined} obligatorio>
          {(c) => (
            <Input
              id={c.id}
              type="date"
              min={hoy}
              value={fecha}
              onChange={(e) => setFecha(e.target.value)}
              aria-invalid={!!errorFecha}
              aria-describedby={c['aria-describedby']}
              className="h-10"
            />
          )}
        </FormField>
        {cuotas.length > 0 && (
          <FormField etiqueta={t('cuota')}>
            {(c) => (
              <select
                id={c.id}
                value={cuota}
                onChange={(e) => {
                  setCuota(e.target.value);
                  const elegida = cuotas.find((q) => q.id === e.target.value);
                  if (elegida) setMonto(Math.min(elegida.saldo, disponible));
                }}
                className="h-10 w-full rounded-md border border-line-strong bg-surface px-3 text-sm text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
              >
                <option value="">{t('cuotaNinguna')}</option>
                {cuotas.map((q) => (
                  <option key={q.id} value={q.id}>
                    {t('cuotaOpcion', { numero: q.numero, saldo: formatear(q.saldo) })}
                  </option>
                ))}
              </select>
            )}
          </FormField>
        )}
        <FormField etiqueta={t('referencia')} ayuda={t('referenciaAyuda')}>
          {(c) => <Input id={c.id} value={referencia} maxLength={200} onChange={(e) => setReferencia(e.target.value)} aria-describedby={c['aria-describedby']} className="h-10" />}
        </FormField>
        <FormField etiqueta={t('justificacion')}>
          {(c) => <Textarea id={c.id} value={justificacion} maxLength={2000} rows={3} onChange={(e) => setJustificacion(e.target.value)} />}
        </FormField>
        {error && (
          <p role="alert" className="text-sm text-danger-text">
            {error}
          </p>
        )}
      </div>
    </Dialogo>
  );
}
