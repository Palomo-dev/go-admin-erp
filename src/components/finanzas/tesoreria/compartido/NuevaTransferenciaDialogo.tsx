'use client';

/**
 * Nueva transferencia entre cuentas bancarias (Figma `2329:131620`), con el
 * kit. Una sola pieza: la abren Transferencias, Movimientos («Nuevo ›
 * Traslado») y el detalle de una cuenta bancaria.
 *
 * Conserva el comportamiento del diálogo viejo: una clave de idempotencia por
 * apertura (`fn_transferencia_registrar`), cuentas distintas, monto > 0, saldo
 * suficiente (en bancos se BLOQUEA: decisión del dueño), fecha del día de la
 * organización, sucursal, referencia y notas. El servidor decide al final.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeftRight } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { CampoFecha, CampoNumero, Dialogo, FormField } from '@/components/kit';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { BranchSelectorField } from '@/components/inventario/BranchSelectorField';
import { transferenciasService, type BankAccount } from '@/lib/services/transferenciasService';
import { useMonedaOrganizacion } from '@/lib/hooks/useOrgCurrency';
import { useFormatDate } from '@/lib/context/OrganizationTimezoneContext';
import { useBranch } from '@/lib/context/BranchContext';
import { efectoEnCuenta } from '@/lib/finanzas/tesoreria/efectoEnCuenta';
import { EfectoEnCuentaTarjeta, SelectNativo } from './TesoreriaComun';

export interface NuevaTransferenciaDialogoProps {
  abierto: boolean;
  onAbiertoChange: (abierto: boolean) => void;
  onHecha: (id?: string) => void;
  /** Cuenta de origen elegida al abrir (desde el detalle de una cuenta). */
  origenInicial?: number | null;
}

export function NuevaTransferenciaDialogo({ abierto, onAbiertoChange, onHecha, origenInicial }: NuevaTransferenciaDialogoProps) {
  const t = useTranslations('finanzasTesoreriaR3.transferencia');
  const te = useTranslations('tesoreria');
  const { formatear } = useMonedaOrganizacion();
  const { getToday } = useFormatDate();
  const { selectedBranchId } = useBranch();
  const clave = useRef('');
  const [cuentas, setCuentas] = useState<BankAccount[]>([]);
  const [origen, setOrigen] = useState('');
  const [destino, setDestino] = useState('');
  const [monto, setMonto] = useState<number | null>(null);
  const [fecha, setFecha] = useState('');
  const [referencia, setReferencia] = useState('');
  const [notas, setNotas] = useState('');
  const [sucursal, setSucursal] = useState<number | null>(selectedBranchId);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    try {
      setCuentas(await transferenciasService.getBankAccounts());
    } catch {
      toast.error(te('errorCarga.cuentasBancarias'), { action: { label: te('reintentar'), onClick: () => void cargar() } });
    }
  }, [te]);

  useEffect(() => {
    if (!abierto) return;
    clave.current = globalThis.crypto.randomUUID();
    setOrigen(origenInicial ? String(origenInicial) : '');
    setDestino('');
    setMonto(null);
    setFecha(getToday());
    setReferencia('');
    setNotas('');
    setError(null);
    setSucursal(selectedBranchId);
    void cargar();
  }, [abierto, origenInicial, getToday, cargar, selectedBranchId]);

  const cuentaOrigen = cuentas.find((c) => String(c.id) === origen) ?? null;
  const efecto = useMemo(
    () => efectoEnCuenta({ saldo: cuentaOrigen ? Number(cuentaOrigen.balance) : null, importe: monto, sentido: 'salida', cuenta: 'banco' }),
    [cuentaOrigen, monto],
  );
  const opciones = cuentas.map((c) => ({
    valor: String(c.id),
    etiqueta: [c.name, c.bank_name ? `· ${c.bank_name}` : '', `· ${formatear(Number(c.balance))}`].filter(Boolean).join(' '),
  }));

  const guardar = async () => {
    setError(null);
    if (!origen) return setError(t('errores.origen'));
    if (!destino) return setError(t('errores.destino'));
    if (origen === destino) return setError(te('errores.cuentas_iguales'));
    if (!monto || monto <= 0) return setError(te('errores.monto_invalido'));
    if (efecto.bloquea) return setError(te('errores.saldo_insuficiente'));
    setGuardando(true);
    try {
      const r = await transferenciasService.createTransfer(
        {
          from_account_id: Number(origen),
          to_account_id: Number(destino),
          amount: monto,
          transfer_date: fecha,
          reference: referencia.trim() || undefined,
          notes: notas.trim() || undefined,
          branch_id: sucursal,
        },
        clave.current || undefined,
      );
      if (!r.success) {
        setError(te(`errores.${r.codigo ?? 'desconocido'}`));
        return;
      }
      toast.success(r.repetida ? te('transferenciaRepetida') : t('exito'));
      onHecha(r.id);
    } catch {
      setError(te('errores.desconocido'));
    } finally {
      setGuardando(false);
    }
  };

  return (
    <Dialogo
      abierto={abierto}
      onAbiertoChange={(a) => !guardando && onAbiertoChange(a)}
      titulo={t('titulo')}
      descripcion={t('descripcion')}
      icono={ArrowLeftRight}
      ancho={880}
      primario={{
        etiqueta: monto ? t('confirmarCon', { monto: formatear(monto) }) : t('confirmar'),
        onClick: () => void guardar(),
        cargando: guardando,
        deshabilitada: efecto.bloquea,
        motivo: efecto.bloquea ? te('errores.saldo_insuficiente') : undefined,
      }}
    >
      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <div className="space-y-4">
          <BranchSelectorField value={sucursal} onChange={setSucursal} />
          <FormField etiqueta={t('origen')} obligatorio>
            {(c) => <SelectNativo id={c.id} valor={origen} onCambiar={setOrigen} vacio={t('elegir')} opciones={opciones} aria-describedby={c['aria-describedby']} />}
          </FormField>
          <FormField etiqueta={t('destino')} obligatorio>
            {(c) => (
              <SelectNativo
                id={c.id}
                valor={destino}
                onCambiar={setDestino}
                vacio={t('elegir')}
                opciones={opciones.map((o) => ({ ...o, deshabilitada: o.valor === origen }))}
                aria-describedby={c['aria-describedby']}
              />
            )}
          </FormField>
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField etiqueta={t('monto')} obligatorio>
              {(c) => <CampoNumero id={c.id} valor={monto} onValorChange={setMonto} minimo={0} alinear="derecha" />}
            </FormField>
            <FormField etiqueta={t('fecha')} obligatorio>
              {(c) => <CampoFecha id={c.id} valor={fecha} onValorChange={setFecha} limpiable={false} aria-labelledby={c.idEtiqueta} />}
            </FormField>
          </div>
          <FormField etiqueta={t('referencia')}>
            <Input value={referencia} onChange={(e) => setReferencia(e.target.value)} maxLength={120} />
          </FormField>
          <FormField etiqueta={t('notas')}>
            <Textarea value={notas} onChange={(e) => setNotas(e.target.value)} rows={2} />
          </FormField>
          {error && (
            <p role="alert" className="text-sm font-medium text-danger-text">
              {error}
            </p>
          )}
        </div>
        <EfectoEnCuentaTarjeta
          cuenta={cuentaOrigen ? cuentaOrigen.name : t('sinOrigen')}
          efecto={efecto}
          formatear={formatear}
          nota={t('asientoNota')}
        />
      </div>
    </Dialogo>
  );
}
