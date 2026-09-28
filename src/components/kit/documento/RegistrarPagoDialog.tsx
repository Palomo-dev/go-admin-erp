'use client';

import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { AlertTriangle, CircleAlert, CircleDollarSign } from 'lucide-react';
import { cn } from '@/utils/Utils';
import { crearFormateadorMoneda, type ContextoMoneda } from '@/lib/utils/moneda';
import { BotonImporte } from '../BotonImporte';
import { CampoFecha } from '../CampoFecha';
import { CampoNumero } from '../CampoNumero';
import { FilaDato, ListaDatos } from '../FilaDato';
import { FormField } from '../FormField';
import { PanelAdaptable } from '../PanelAdaptable';
import { SelectorMetodoPago } from '../SelectorMetodoPago';
import { clasesBoton } from '../botonClases';
import type { MetodoPagoOpcion } from '../metodosPago';
import { useKitT } from '../useIdiomaKit';
import { simboloMoneda } from './documentoLineasLogica';
import type { TipoDocumento } from './documentos';
import {
  cambioEfectivo,
  montosRapidos,
  pagoInicial,
  pagoLimpio,
  validarPago,
  type CampoPago,
  type DestinoPago,
  type ErrorPago,
  type ValorPago,
} from './pago';

/**
 * Diálogo único de registrar pago (Figma `RegistrarPagoDialog` `730:20644`,
 * Destino factura · cuenta · tercero; sección `741:53717`, P1…P9, M1): lo usan
 * factura de venta y de compra, CxC, CxP, la ficha del cliente, la CxC del POS
 * y el «Registrar cobro» del detalle de venta.
 *
 * **Esqueleto sin lógica de negocio**: pinta el documento, monto (con «Saldo
 * total» y «50 %»), método (los de la organización), efectivo recibido y
 * cambio, fecha (día de la organización, no futura), referencia y notas;
 * valida lo escrito y entrega `ValorPago` a `onConfirmar`. Registrar, repartir
 * entre facturas (`reparto`) y mover la caja lo hace la RPC que conecte la
 * pantalla. Sin caja abierta para efectivo: `avisoCaja` (P6, «Abrir caja»).
 */
export interface DocumentoPago {
  tipo: TipoDocumento;
  numero: string;
  /** Cliente o proveedor. */
  tercero?: string | null;
  total?: number | null;
  saldo: number;
  /** Vencimiento ya formateado en la zona de la organización. */
  vencimiento?: string | null;
}

export interface RegistrarPagoDialogProps {
  abierto: boolean;
  onAbiertoChange: (abierto: boolean) => void;
  destino?: DestinoPago;
  titulo?: string;
  descripcion?: ReactNode;
  documento?: DocumentoPago;
  /** Destino «tercero»: saldo total de lo elegido (si no hay `documento`). */
  saldo?: number;
  moneda: ContextoMoneda | string;
  /** Métodos de la organización (su servicio los lee). */
  metodos: readonly MetodoPagoOpcion[];
  /** Día de la organización `YYYY-MM-DD` (`useFormatDate().getToday()`). */
  hoy: string;
  /** Valores con que abre (método preferido, monto de la cuota). */
  valorInicial?: Partial<ValorPago>;
  onConfirmar: (valor: ValorPago) => void | Promise<void>;
  cargando?: boolean;
  /** Errores del servidor por campo (ya traducidos). */
  errores?: Partial<Record<CampoPago, string>>;
  /** Error general del servidor. */
  error?: string | null;
  /** Sobrante como saldo a favor (destino «tercero»). */
  permitirExcedente?: boolean;
  /** Códigos que se tratan como efectivo (piden «Recibido» y muestran el cambio). */
  codigosEfectivo?: readonly string[];
  /** Códigos que exigen referencia (transferencia, tarjeta). */
  codigosConReferencia?: readonly string[];
  /** Efectivo sin caja abierta (P6): aviso y acción «Abrir caja». */
  avisoCaja?: { mensaje: string; accion?: { etiqueta: string; onClick: () => void } } | null;
  /** Destino «tercero»: reparto entre facturas (FIFO + sobrante), lo arma la pantalla. */
  reparto?: ReactNode;
  /** Campos propios del dominio (cuota, cuenta bancaria de destino). */
  camposExtra?: ReactNode;
  textoConfirmar?: string;
  className?: string;
}

const DE_COMPRAS: readonly TipoDocumento[] = ['facturaCompra', 'cuentaPorPagar', 'ordenCompra', 'documentoSoporte', 'entradaInventario'];
function esDeCompras(tipo: TipoDocumento): boolean {
  return DE_COMPRAS.includes(tipo);
}

const FECHA_CLASES =
  'h-10 w-full rounded-md border border-line-strong bg-surface px-3 text-sm text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand aria-[invalid=true]:border-line-danger';

export function RegistrarPagoDialog({
  abierto,
  onAbiertoChange,
  destino = 'factura',
  titulo,
  descripcion,
  documento,
  saldo: saldoProp,
  moneda,
  metodos,
  hoy,
  valorInicial,
  onConfirmar,
  cargando,
  errores: erroresServidor,
  error,
  permitirExcedente,
  codigosEfectivo = ['cash', 'efectivo'],
  codigosConReferencia = [],
  avisoCaja,
  reparto,
  camposExtra,
  textoConfirmar,
  className,
}: RegistrarPagoDialogProps) {
  const t = useKitT();
  const formatear = useMemo(() => crearFormateadorMoneda(moneda), [moneda]);
  const simbolo = useMemo(() => simboloMoneda(moneda), [moneda]);
  const decimales = typeof moneda === 'string' ? 2 : moneda.decimals;
  const saldo = documento?.saldo ?? saldoProp ?? 0;
  const [valor, setValor] = useState<ValorPago>(() => ({ ...pagoInicial(saldo, hoy), ...valorInicial }));
  const [mostrarErrores, setMostrarErrores] = useState(false);

  // Cada apertura parte del saldo actual y de los valores iniciales.
  useEffect(() => {
    if (!abierto) return;
    setValor({ ...pagoInicial(saldo, hoy), ...valorInicial });
    setMostrarErrores(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- solo al abrir
  }, [abierto]);

  const esEfectivo = !!valor.metodo && codigosEfectivo.includes(valor.metodo);
  const exigeReferencia = !!valor.metodo && codigosConReferencia.includes(valor.metodo);
  const erroresLocales = validarPago(valor, { saldo, hoy, permitirExcedente, esEfectivo, exigeReferencia });
  const hayErrores = Object.keys(erroresLocales).length > 0;
  const cambio = esEfectivo ? cambioEfectivo(valor.recibido, valor.monto) : null;
  const bloqueadoPorCaja = esEfectivo && !!avisoCaja;

  const textoError = (campo: CampoPago): string | null => {
    const servidor = erroresServidor?.[campo];
    if (servidor) return servidor;
    const e: ErrorPago | undefined = erroresLocales[campo];
    if (!mostrarErrores || !e) return null;
    if (e === 'montoExcede') return t('pago.errores.montoExcede', { saldo: formatear(saldo) });
    return t(`pago.errores.${e}`);
  };

  const cambiar = (cambio: Partial<ValorPago>) => setValor((v) => ({ ...v, ...cambio }));

  const confirmar = () => {
    setMostrarErrores(true);
    if (hayErrores || bloqueadoPorCaja) return;
    void onConfirmar(pagoLimpio(valor));
  };

  const tituloFinal = titulo ?? t(`pago.titulo.${destino}`);

  return (
    <PanelAdaptable
      abierto={abierto}
      onAbiertoChange={onAbiertoChange}
      titulo={tituloFinal}
      descripcion={descripcion}
      icono={CircleDollarSign}
      ancho={560}
      ocupado={cargando}
      className={className}
      pie={
        <>
          <button
            type="button"
            disabled={cargando}
            onClick={() => onAbiertoChange(false)}
            className={clasesBoton({ variante: 'secundario', className: 'w-full sm:w-auto' })}
          >
            {t('comun.cancelar')}
          </button>
          <BotonImporte
            etiqueta={textoConfirmar ?? t('pago.registrar')}
            importe={typeof valor.monto === 'number' && valor.monto > 0 ? formatear(valor.monto) : undefined}
            estado={cargando ? 'procesando' : bloqueadoPorCaja ? 'deshabilitado' : 'listo'}
            motivo={bloqueadoPorCaja ? avisoCaja?.mensaje : undefined}
            onClick={confirmar}
            tamano="md"
            anchoCompleto={false}
            className="w-full sm:w-auto sm:min-w-[240px]"
          />
        </>
      }
    >
      {documento && (
        <ListaDatos etiqueta={t('pago.documento')} className="rounded-lg border border-line bg-subtle px-3 py-2">
          <FilaDato etiqueta={t(`documento.tipos.${documento.tipo}`)} valor={documento.numero} tono="fuerte" />
          {documento.tercero && (
            <FilaDato etiqueta={esDeCompras(documento.tipo) ? t('pago.proveedor') : t('pago.cliente')} valor={documento.tercero} />
          )}
          {typeof documento.total === 'number' && <FilaDato etiqueta={t('pago.total')} valor={formatear(documento.total)} />}
          {documento.vencimiento && <FilaDato etiqueta={t('pago.vence')} valor={documento.vencimiento} />}
          <FilaDato etiqueta={t('pago.saldo')} valor={formatear(documento.saldo)} tono={documento.saldo > 0 ? 'peligro' : 'exito'} />
        </ListaDatos>
      )}

      {reparto}

      <FormField etiqueta={t('pago.monto')} obligatorio error={textoError('monto')}>
        <CampoNumero
          prefijo={simbolo}
          valor={valor.monto}
          decimales={decimales}
          minimo={0}
          onValorChange={(v) => cambiar({ monto: v })}
        />
      </FormField>
      {montosRapidos(saldo, decimales).length > 0 && (
        <div role="group" aria-label={t('pago.montosRapidos')} className="-mt-2 flex flex-wrap gap-2">
          {montosRapidos(saldo, decimales).map((m) => (
            <button
              key={m.clave}
              type="button"
              aria-pressed={valor.monto === m.monto}
              onClick={() => cambiar({ monto: m.monto })}
              className={cn(
                'h-8 rounded-full border px-3 text-[13px] font-medium tabular-nums transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand',
                valor.monto === m.monto ? 'border-line-brand bg-brand-tint text-brand-deep' : 'border-line-strong bg-surface text-fg-secondary hover:bg-hover hover:text-fg',
              )}
            >
              {t(`pago.rapido.${m.clave}`, { monto: formatear(m.monto) })}
            </button>
          ))}
        </div>
      )}

      <FormField etiqueta={t('pago.metodo')} obligatorio error={textoError('metodo')}>
        {(campo) => (
          <SelectorMetodoPago
            etiqueta={t('pago.metodo')}
            metodos={metodos}
            valor={valor.metodo}
            onValorChange={(codigo) => cambiar({ metodo: codigo })}
            className={campo['aria-invalid'] ? 'rounded-lg ring-1 ring-danger' : undefined}
          />
        )}
      </FormField>

      {bloqueadoPorCaja && avisoCaja && (
        <div role="note" className="flex flex-col gap-2 rounded-lg border border-line-warning bg-warning-subtle px-3 py-2.5 text-sm text-warning-text sm:flex-row sm:items-center">
          <span className="flex flex-1 items-start gap-2">
            <AlertTriangle aria-hidden="true" className="mt-0.5 size-4 shrink-0" strokeWidth={1.5} />
            {avisoCaja.mensaje}
          </span>
          {avisoCaja.accion && (
            <button type="button" onClick={avisoCaja.accion.onClick} className={clasesBoton({ variante: 'secundario', tamano: 'sm' })}>
              {avisoCaja.accion.etiqueta}
            </button>
          )}
        </div>
      )}

      {esEfectivo && !bloqueadoPorCaja && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <FormField etiqueta={t('pago.recibido')} error={textoError('recibido')}>
            <CampoNumero prefijo={simbolo} valor={valor.recibido ?? null} decimales={decimales} minimo={0} onValorChange={(v) => cambiar({ recibido: v })} />
          </FormField>
          <ListaDatos className="self-end rounded-lg bg-subtle px-3 py-1.5">
            <FilaDato etiqueta={t('pago.cambio')} valor={cambio === null ? '—' : formatear(cambio)} tono={cambio ? 'fuerte' : 'neutro'} />
          </ListaDatos>
        </div>
      )}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <FormField etiqueta={t('pago.fecha')} obligatorio error={textoError('fecha')}>
          <CampoFecha valor={valor.fecha} max={hoy} hoy={hoy} limpiable={false} onValorChange={(fecha) => cambiar({ fecha })} />
        </FormField>
        <FormField etiqueta={t('pago.referencia')} obligatorio={exigeReferencia} error={textoError('referencia')}>
          <input
            type="text"
            value={valor.referencia}
            maxLength={120}
            onChange={(e) => cambiar({ referencia: e.target.value })}
            placeholder={t('pago.referenciaPlaceholder')}
            className={cn(FECHA_CLASES, 'placeholder:text-fg-muted')}
          />
        </FormField>
      </div>

      {camposExtra}

      <FormField etiqueta={t('pago.notas')}>
        <textarea
          rows={2}
          value={valor.notas}
          maxLength={500}
          onChange={(e) => cambiar({ notas: e.target.value })}
          className="w-full resize-y rounded-lg border border-line-strong bg-surface px-3 py-2 text-sm text-fg placeholder:text-fg-muted focus-visible:border-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/20"
        />
      </FormField>

      {error && (
        <p role="alert" className="flex items-start gap-2 text-sm text-danger-text">
          <CircleAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0" strokeWidth={1.5} />
          {error}
        </p>
      )}
    </PanelAdaptable>
  );
}
