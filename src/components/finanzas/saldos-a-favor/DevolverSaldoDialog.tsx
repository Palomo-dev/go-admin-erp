'use client';

/**
 * Devolver en dinero todo o parte de un saldo a favor (Figma `1020:91750`,
 * captura `73-documentos-saldo-devolver.png`).
 *
 * Métodos de la organización y caja abierta de la sucursal del saldo
 * (`GET /api/saldos-a-favor/contexto`); efectivo exige caja abierta. UNA RPC
 * (`POST /api/saldos-a-favor/[id]/devolver` → `fn_saldo_favor_devolver`):
 * pago negativo (sale del arqueo), asiento 2805 contra caja o banco y saldo.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Banknote } from 'lucide-react';
import { AvisoTonal, CampoNumero, Dialogo, FilaDato, FormField, SelectorMetodoPago, simboloMoneda } from '@/components/kit';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toastSuccess } from '@/components/ui/use-toast';
import { useMonedaOrganizacion } from '@/lib/hooks/useOrgCurrency';
import type { ContextoSaldoFavor } from '@/lib/finanzas/saldosAFavor/contrato';
import { validarMonto, type FilaListadoSaldo } from '@/lib/finanzas/saldosAFavor/listadoLogica';
import { nuevaClaveIdempotencia, saldosAFavorService } from './saldosAFavorService';
import { metodoInicial, opcionesMetodoSaldo, requiereReferencia } from './metodosSaldo';
import { textoErrorSaldo } from './textosSaldo';

export interface DevolverSaldoDialogProps {
  abierto: boolean;
  onAbiertoChange: (abierto: boolean) => void;
  saldo: Pick<FilaListadoSaldo, 'id' | 'cliente' | 'disponible' | 'sucursalId'> | null;
  onDevuelto: () => void;
}

export function DevolverSaldoDialog({ abierto, onAbiertoChange, saldo, onDevuelto }: DevolverSaldoDialogProps) {
  const t = useTranslations('finanzasDocumentosR3.saldos');
  const moneda = useMonedaOrganizacion();
  const [contexto, setContexto] = useState<ContextoSaldoFavor | null>(null);
  const [monto, setMonto] = useState<number | null>(null);
  const [metodo, setMetodo] = useState<string | null>(null);
  const [cuenta, setCuenta] = useState('');
  const [referencia, setReferencia] = useState('');
  const [motivo, setMotivo] = useState('');
  const [tocado, setTocado] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const clave = useRef('');

  useEffect(() => {
    if (!abierto || !saldo) return;
    let vigente = true;
    setContexto(null);
    setMonto(saldo.disponible);
    setMetodo(null);
    setCuenta('');
    setReferencia('');
    setMotivo('');
    setTocado(false);
    setError(null);
    clave.current = nuevaClaveIdempotencia('devolver');
    saldosAFavorService
      .contexto(saldo.sucursalId)
      .then((c) => vigente && setContexto(c))
      .catch((e) => vigente && setError(textoErrorSaldo(t, e)));
    return () => {
      vigente = false;
    };
  }, [abierto, saldo, t]);

  const opciones = useMemo(() => opcionesMetodoSaldo(contexto, t('devolver.sinCaja')), [contexto, t]);
  useEffect(() => {
    if (contexto && metodo === null) setMetodo(metodoInicial(opciones));
  }, [contexto, metodo, opciones]);

  const disponible = saldo?.disponible ?? 0;
  const errorMonto = validarMonto(monto, disponible);
  const esEfectivo = metodo === 'cash';
  const conReferencia = requiereReferencia(contexto, metodo);
  const cuentas = contexto?.cuentasBancarias ?? [];
  const faltaMotivo = motivo.trim().length < 3;
  const faltaReferencia = conReferencia && !referencia.trim();
  const sinCaja = esEfectivo && !!contexto && !contexto.caja.abierta;

  const devolver = async () => {
    setTocado(true);
    if (!saldo || !metodo || errorMonto || faltaMotivo || faltaReferencia || sinCaja || monto === null) return;
    setEnviando(true);
    setError(null);
    try {
      await saldosAFavorService.devolver(saldo.id, {
        monto,
        metodo,
        motivo: motivo.trim(),
        cuentaBancaria: !esEfectivo && cuenta ? Number(cuenta) : null,
        referencia,
        claveIdempotencia: clave.current,
      });
      toastSuccess(t('devolver.exito', { monto: moneda.formatear(monto), cliente: saldo.cliente ?? t('sinCliente') }));
      onAbiertoChange(false);
      onDevuelto();
    } catch (e) {
      setError(textoErrorSaldo(t, e));
    } finally {
      setEnviando(false);
    }
  };

  const nombreCuenta = (id: string) => {
    const c = cuentas.find((x) => String(x.id) === id);
    return c ? `${c.name}${c.ultimos ? ` ··${c.ultimos}` : ''}` : '';
  };
  const origenDinero = esEfectivo
    ? contexto?.caja.abierta
      ? t('devolver.cajaAbierta', { id: contexto.caja.id ?? '' })
      : t('devolver.sinCaja')
    : cuenta
      ? nombreCuenta(cuenta)
      : t('devolver.cuentaDelMetodo');

  return (
    <Dialogo
      abierto={abierto}
      onAbiertoChange={(v) => !enviando && onAbiertoChange(v)}
      titulo={t('devolver.titulo')}
      descripcion={saldo ? t('devolver.descripcion', { cliente: saldo.cliente ?? t('sinCliente'), disponible: moneda.formatear(disponible) }) : undefined}
      icono={Banknote}
      ancho={520}
      primario={{
        etiqueta: monto && !errorMonto ? t('devolver.confirmarMonto', { monto: moneda.formatear(monto) }) : t('devolver.confirmar'),
        onClick: () => void devolver(),
        cargando: enviando,
        deshabilitada: !contexto || !metodo || sinCaja,
        motivo: sinCaja ? t('devolver.sinCaja') : t('cargando'),
      }}
    >
      <div className="flex flex-col gap-4">
        <FormField
          etiqueta={t('devolver.valor')}
          obligatorio
          ayuda={t('devolver.hasta', { monto: moneda.formatear(disponible) })}
          error={tocado && errorMonto ? t(`validacion.${errorMonto}`, { monto: moneda.formatear(disponible) }) : null}
        >
          {(c) => (
            <CampoNumero
              id={c.id}
              aria-describedby={c['aria-describedby']}
              aria-invalid={c['aria-invalid']}
              valor={monto}
              onValorChange={setMonto}
              minimo={0}
              prefijo={simboloMoneda(moneda.paraDocumento(null))}
            />
          )}
        </FormField>

        <FormField etiqueta={t('devolver.como')}>
          {(c) =>
            contexto ? (
              <SelectorMetodoPago metodos={opciones} valor={metodo} onValorChange={setMetodo} etiqueta={t('devolver.como')} />
            ) : (
              <p id={c.id} className="text-sm text-fg-muted">
                {t('cargando')}
              </p>
            )
          }
        </FormField>

        {!esEfectivo && metodo && cuentas.length > 0 && (
          <FormField etiqueta={t('devolver.cuenta')}>
            {(c) => (
              <Select value={cuenta} onValueChange={setCuenta}>
                <SelectTrigger id={c.id} aria-labelledby={c.idEtiqueta} className="h-10 border-line-strong bg-surface">
                  <SelectValue placeholder={t('devolver.cuentaPlaceholder')} />
                </SelectTrigger>
                <SelectContent>
                  {cuentas.map((b) => (
                    <SelectItem key={b.id} value={String(b.id)}>
                      {b.name}
                      {b.ultimos ? ` ··${b.ultimos}` : ''}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </FormField>
        )}

        {metodo && <FilaDato etiqueta={t('devolver.saleDe')} valor={origenDinero} tono={sinCaja ? 'peligro' : undefined} />}

        {conReferencia && (
          <FormField etiqueta={t('devolver.referencia')} obligatorio error={tocado && faltaReferencia ? t('validacion.referencia') : null}>
            <Input value={referencia} onChange={(e) => setReferencia(e.target.value)} maxLength={200} />
          </FormField>
        )}

        <FormField etiqueta={t('devolver.motivo')} obligatorio error={tocado && faltaMotivo ? t('validacion.motivo') : null}>
          <Input value={motivo} onChange={(e) => setMotivo(e.target.value)} maxLength={500} placeholder={t('devolver.motivoPlaceholder')} />
        </FormField>

        {monto !== null && !errorMonto && (
          <AvisoTonal
            tono="informacion"
            titulo={t('devolver.quePasaTitulo')}
            descripcion={t(esEfectivo ? 'devolver.quePasaEfectivo' : 'devolver.quePasaBanco', {
              monto: moneda.formatear(monto),
              origen: origenDinero,
              saldo: moneda.formatear(Math.max(0, disponible - monto)),
            })}
          />
        )}
        {error && (
          <p role="alert" className="text-sm text-danger-text">
            {error}
          </p>
        )}
      </div>
    </Dialogo>
  );
}
