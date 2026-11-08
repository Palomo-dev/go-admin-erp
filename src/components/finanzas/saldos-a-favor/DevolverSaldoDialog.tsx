'use client';

/**
 * Devolver en dinero todo o parte de un saldo a favor (Figma `1020:91750`,
 * captura `73-documentos-saldo-devolver.png`). La misma pieza recibe la
 * devolución de un anticipo a proveedor (el dinero entra): el `adaptador`
 * pone textos y servicio.
 *
 * Métodos de la organización y caja abierta de la sucursal del saldo
 * (`GET /api/saldos-a-favor/contexto`); efectivo exige caja abierta. UNA RPC
 * (`POST /api/saldos-a-favor/[id]/devolver` → `fn_saldo_favor_devolver`):
 * pago negativo (sale del arqueo), asiento 2805 contra caja o banco y saldo.
 */
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import { Banknote } from 'lucide-react';
import { AvisoTonal, CampoNumero, Dialogo, FilaDato, FormField, SelectorMetodoPago, simboloMoneda } from '@/components/kit';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toastSuccess } from '@/components/ui/use-toast';
import { useMonedaOrganizacion } from '@/lib/hooks/useOrgCurrency';
import type { ContextoSaldoFavor } from '@/lib/finanzas/saldosAFavor/contrato';
import { validarMonto, type FilaListadoSaldo } from '@/lib/finanzas/saldosAFavor/listadoLogica';
import { nuevaClaveIdempotencia } from './saldosAFavorService';
import { ADAPTADOR_CLIENTE, type AdaptadorSaldos } from './adaptadorSaldos';
import { metodoInicial, opcionesMetodoSaldo, requiereReferencia } from './metodosSaldo';
import { textoErrorSaldo } from './textosSaldo';

/** Solo del proveedor (P7: la devolución real lleva soporte). Con t.has: el cliente no las tiene. */
const CLAVE_SOPORTE = 'devolver.soporte';
/** Proveedor (ronda 2): «$X al banco y $Y de retenciones»; nunca «ingresaron $X+Y». */
const CLAVE_EXITO_PARTES = 'devolver.exitoPartes';

/**
 * Sección propia de un tercero (proveedor: retenciones de la parte devuelta, por impuesto).
 * `adicional` es lo que ese complemento también baja del saldo además del dinero (las
 * retenciones identificadas); su valor viaja en `extra`.
 */
export interface ComplementoDevolver {
  render: (p: {
    saldoId: string;
    dinero: number | null;
    tocado: boolean;
    onCambio: (valor: Record<string, unknown> | null, valido: boolean, adicional: number) => void;
  }) => ReactNode;
}

export interface DevolverSaldoDialogProps {
  abierto: boolean;
  onAbiertoChange: (abierto: boolean) => void;
  saldo: Pick<FilaListadoSaldo, 'id' | 'cliente' | 'disponible' | 'sucursalId'> | null;
  onDevuelto: () => void;
  /** Cliente (por defecto) o proveedor. */
  adaptador?: AdaptadorSaldos;
  complemento?: ComplementoDevolver;
}

export function DevolverSaldoDialog({
  abierto,
  onAbiertoChange,
  saldo,
  onDevuelto,
  adaptador = ADAPTADOR_CLIENTE,
  complemento,
}: DevolverSaldoDialogProps) {
  const t = useTranslations(adaptador.namespace);
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
  const [extra, setExtra] = useState<{ valor: Record<string, unknown> | null; valido: boolean; adicional: number }>({ valor: null, valido: true, adicional: 0 });
  const cambiarExtra = useCallback(
    (valor: Record<string, unknown> | null, valido: boolean, adicional: number) => setExtra({ valor, valido, adicional }),
    [],
  );
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
    setExtra({ valor: null, valido: !complemento, adicional: 0 });
    clave.current = nuevaClaveIdempotencia('devolver');
    adaptador
      .contexto(saldo.sucursalId)
      .then((c) => vigente && setContexto(c))
      .catch((e) => vigente && setError(textoErrorSaldo(t, e)));
    return () => {
      vigente = false;
    };
  }, [abierto, saldo, t, adaptador, complemento]);

  const opciones = useMemo(() => opcionesMetodoSaldo(contexto, t('devolver.sinCaja')), [contexto, t]);
  useEffect(() => {
    if (contexto && metodo === null) setMetodo(metodoInicial(opciones));
  }, [contexto, metodo, opciones]);

  const disponible = saldo?.disponible ?? 0;
  // Lo que el complemento también baja del saldo (retenciones identificadas) reduce el tope del dinero.
  const adicional = complemento ? extra.adicional : 0;
  const errorMonto = validarMonto(monto, Math.max(0, disponible - adicional));
  const esEfectivo = metodo === 'cash';
  // Proveedor (P7): la devolución real lleva su soporte aunque el método no pida referencia.
  const conReferencia = requiereReferencia(contexto, metodo) || adaptador.soporteObligatorio === true;
  const etiquetaReferencia = adaptador.soporteObligatorio && t.has(CLAVE_SOPORTE) ? t(CLAVE_SOPORTE) : t('devolver.referencia');
  const cuentas = contexto?.cuentasBancarias ?? [];
  const faltaMotivo = motivo.trim().length < 3;
  const faltaReferencia = conReferencia && referencia.trim().length < (adaptador.soporteObligatorio ? 3 : 1);
  const sinCaja = esEfectivo && !!contexto && !contexto.caja.abierta;

  const devolver = async () => {
    setTocado(true);
    if (!saldo || !metodo || errorMonto || faltaMotivo || faltaReferencia || sinCaja || monto === null) return;
    if (complemento && !extra.valido) return;
    setEnviando(true);
    setError(null);
    try {
      const r = (await adaptador.devolver(saldo.id, {
        monto,
        metodo,
        motivo: motivo.trim(),
        cuentaBancaria: !esEfectivo && cuenta ? Number(cuenta) : null,
        referencia,
        claveIdempotencia: clave.current,
        extra: complemento ? extra.valor : null,
      })) as { dinero?: unknown; retencion_revertida?: unknown } | null;
      const cliente = saldo.cliente ?? t('sinCliente');
      const retenciones = Number(r?.retencion_revertida ?? 0);
      toastSuccess(
        t.has(CLAVE_EXITO_PARTES)
          ? t(CLAVE_EXITO_PARTES, {
              dinero: moneda.formatear(Number(r?.dinero ?? monto)),
              retenciones: moneda.formatear(Number.isFinite(retenciones) ? retenciones : 0),
              cliente,
            })
          : t('devolver.exito', { monto: moneda.formatear(monto), cliente }),
      );
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
          ayuda={t('devolver.hasta', { monto: moneda.formatear(Math.max(0, disponible - adicional)) })}
          error={tocado && errorMonto ? t(`validacion.${errorMonto}`, { monto: moneda.formatear(Math.max(0, disponible - adicional)) }) : null}
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
          <FormField etiqueta={etiquetaReferencia} obligatorio error={tocado && faltaReferencia ? t('validacion.referencia') : null}>
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
              saldo: moneda.formatear(Math.max(0, disponible - monto - adicional)),
            })}
          />
        )}
        {complemento && saldo && complemento.render({ saldoId: saldo.id, dinero: monto, tocado, onCambio: cambiarExtra })}
        {error && (
          <p role="alert" className="text-sm text-danger-text">
            {error}
          </p>
        )}
      </div>
    </Dialogo>
  );
}
