'use client';

import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { AlertTriangle, Lock, Ruler, Scale } from 'lucide-react';
import { Dialogo, useAtajos } from '@/components/kit';
import { textoCantidadParcialValido } from '@/components/kit/cartLineLogica';
import type { Product } from '@/components/pos/types';
import {
  cantidadDesdeTexto,
  decimalesCantidad,
  esPorPeso,
  formatoCantidad,
  importePesada,
  minimoDeVenta,
  pesajeManual,
  simboloUnidad,
  validarPesada,
  type Pesaje,
} from '@/lib/pos/peso';
import { debeAutoAgregar } from '@/lib/pos/bascula/flujoPesada';
import type { ConfigBascula } from '@/lib/pos/bascula/tipos';
import { useLectorBascula, type LectorEnVivo } from '@/lib/pos/bascula/useLectorBascula';
import { CLASE_DIALOGO_ACEPTA_ESCANEO } from '@/hooks/useHardwareBarcodeScanner';
import { crearFormateadorMoneda, type ContextoMoneda } from '@/lib/utils/moneda';
import { cn } from '@/utils/Utils';
import { LecturaBascula } from './LecturaBascula';
import { usePesadaBascula } from './usePesadaBascula';

/**
 * «Pesar» (docs/design/PRODUCTOS-POR-PESO-BASCULA.md §2.6, Figma `DialogoPesar`
 * 1078:702729 y Q4/Q7/Q11). Fase 2: todavía no hay lectura de báscula, así
 * que la lectura es «Sin báscula · peso a mano», solo con el permiso «Pesar a
 * mano en el POS» (resuelto en el servidor) y nunca en un producto que exige
 * báscula: ahí el diálogo lo dice y no deja agregar.
 *
 * Un producto «por medida» (metro, litro) usa el mismo diálogo para escribir
 * la cantidad, sin permiso de peso.
 *
 * Enter agrega (o guarda el peso en «cambiar peso»); Esc cancela. El importe
 * es exacto (0,735 × 18.900 = 13.891,50) y se muestra redondeado a la moneda.
 *
 * Fase 3: con una báscula en este equipo (`bascula`), un producto por peso se
 * lee en vivo (`LecturaBascula`): Cero (Z), Tara (T), tara del producto y
 * «Peso a mano» (M) si la regla y el permiso lo dejan. Agregar solo con
 * lectura estable; la línea lleva `notes.pesaje` con origen «bascula». Sin
 * báscula todo sigue igual que en la fase 2.
 */
export interface DialogoPesarProps {
  abierto: boolean;
  onAbiertoChange: (abierto: boolean) => void;
  producto: Product | null;
  /** Precio por unidad de venta (por kg), el mismo que llevará la línea. */
  precioPorUnidad: number;
  moneda: ContextoMoneda | string;
  /** Permiso resuelto en el servidor (`pos_pesaje_contexto`). */
  puedePesarAMano: boolean;
  /** «Cambiar peso» de una línea que ya está en el carrito. */
  modo?: 'agregar' | 'cambiar';
  cantidadInicial?: number | null;
  onConfirmar: (cantidad: number, pesaje: Pesaje | undefined) => void;
  /**
   * Cantidad válida en vivo (o null) mientras el diálogo está abierto: la
   * caja la usa para la pantalla del cliente («Pesando: 0,735 kg × …»).
   */
  onCantidadEnVivo?: (cantidad: number | null) => void;
  /** Báscula de este equipo (fase 3). Sin ella, peso a mano como siempre. */
  bascula?: ConfigBascula | null;
  /**
   * Lector ya abierto de esa báscula (el del POS, que lee mientras la caja
   * está en pantalla). Sin él, el diálogo abre el suyo mientras está abierto.
   */
  lector?: LectorEnVivo | null;
  /**
   * Venta en un paso (§11): con báscula, agregar solo en cuanto la lectura
   * sea estable y nueva, sin Enter. Solo en «agregar».
   */
  agregarAlEstabilizar?: boolean;
  /** La báscula cambió desde la última pesada agregada (ver `ArmadoBascula`). */
  lecturaNueva?: boolean;
}

export function DialogoPesar({
  abierto,
  onAbiertoChange,
  producto,
  precioPorUnidad,
  moneda,
  puedePesarAMano,
  modo = 'agregar',
  cantidadInicial,
  onConfirmar,
  onCantidadEnVivo,
  bascula = null,
  lector: lectorExterno = null,
  agregarAlEstabilizar = false,
  lecturaNueva = true,
}: DialogoPesarProps) {
  const t = useTranslations('posPeso.dialogo');
  const tb = useTranslations('posBascula.lectura');
  const idCampo = useId();
  const idAyuda = useId();
  const campo = useRef<HTMLInputElement>(null);
  const [texto, setTexto] = useState('');
  const [intentado, setIntentado] = useState(false);

  const porPeso = esPorPeso(producto);
  const decimales = decimalesCantidad(producto);
  const unidad = simboloUnidad(producto?.unit_code) || (producto?.unit_code ?? '').trim();
  const formatear = useMemo(() => crearFormateadorMoneda(moneda), [moneda]);
  const formatoDecimal = (n: number) => formatoCantidad(n, producto);

  // Báscula (fase 3): solo productos por peso; «Peso a mano» cambia a 'manual'.
  const [modoLectura, setModoLectura] = useState<'bascula' | 'manual'>('bascula');
  const usaBascula = porPeso && !!bascula && modoLectura === 'bascula';
  const lectorPropio = useLectorBascula(lectorExterno ? null : porPeso ? bascula : null, abierto && usaBascula && !lectorExterno);
  const pb = usePesadaBascula({
    config: porPeso ? bascula : null,
    lector: lectorExterno ?? lectorPropio,
    activo: abierto && usaBascula,
    producto,
  });
  const esperandoAuto = abierto && usaBascula && modo === 'agregar' && agregarAlEstabilizar;
  // Agregar solo al estabilizar (una vez por apertura; si falla, queda Enter).
  const enviadoAuto = useRef(false);
  useEffect(() => {
    if (abierto) enviadoAuto.current = false;
  }, [abierto, producto?.id]);
  useEffect(() => {
    if (!debeAutoAgregar({ esperando: esperandoAuto, vista: pb.vista, armada: lecturaNueva, yaEnviado: enviadoAuto.current })) return;
    const pesaje = pb.pesaje();
    if (!pesaje) return;
    enviadoAuto.current = true;
    onConfirmar(pesaje.neto, pesaje);
  }, [esperandoAuto, pb, lecturaNueva, onConfirmar]);
  const puedeManual = porPeso && puedePesarAMano && !producto?.require_scale;
  // Atajos con báscula (con el peso a mano manda el campo: Enter en el input).
  useAtajos(
    [
      {
        tecla: 'Enter',
        descripcion: tb('atajos.agregar'),
        // Con el foco en un botón (Cancelar, Cero…), Enter es ese botón.
        cuando: () => !(typeof document !== 'undefined' && document.activeElement instanceof HTMLButtonElement),
        accion: () => {
          const pesaje = pb.pesaje();
          if (pesaje) onConfirmar(pesaje.neto, pesaje);
        },
      },
      { tecla: 'Z', descripcion: tb('acciones.cero'), accion: pb.lector.cero },
      { tecla: 'T', descripcion: tb('acciones.tara'), accion: () => (pb.tara > 0 ? pb.quitarTara() : pb.tomarTara()) },
      { tecla: 'M', descripcion: tb('acciones.pesarAMano'), cuando: () => puedeManual, accion: () => setModoLectura('manual') },
    ],
    { activo: abierto && usaBascula },
  );

  // Al abrir: el peso actual en «cambiar peso»; vacío al agregar.
  useEffect(() => {
    if (!abierto) return;
    setModoLectura('bascula');
    setIntentado(false);
    setTexto(cantidadInicial && cantidadInicial > 0 ? String(cantidadInicial).replace('.', ',') : '');
    const id = setTimeout(() => campo.current?.focus(), 30);
    return () => clearTimeout(id);
  }, [abierto, cantidadInicial]);

  // Con báscula el foco va a la lectura: Enter agrega (sin él, la «×» del diálogo lo tomaba).
  useEffect(() => {
    if (!abierto || !usaBascula) return;
    const id = setTimeout(() => {
      const el = document.querySelector<HTMLElement>('[data-lectura-bascula]');
      el?.focus();
    }, 30);
    return () => clearTimeout(id);
  }, [abierto, usaBascula]);

  // «Peso a mano» desde la báscula: el foco va al campo.
  useEffect(() => {
    if (abierto && modoLectura === 'manual') campo.current?.focus();
  }, [abierto, modoLectura]);

  // Pantalla del cliente: la misma cantidad que se agregaría (null sin peso válido o sin permiso).
  const cantidadEnVivo = (() => {
    if (!producto) return null;
    if (usaBascula) return pb.vista.neto !== null && pb.vista.neto > 0 && pb.vista.estado !== 'error' ? pb.vista.neto : null;
    const r = validarPesada({ producto, cantidad: cantidadDesdeTexto(texto, decimales), origen: 'manual', permisoPesoManual: puedePesarAMano });
    return r.ok ? r.cantidad : null;
  })();
  useEffect(() => {
    if (abierto) onCantidadEnVivo?.(cantidadEnVivo);
  }, [abierto, cantidadEnVivo, onCantidadEnVivo]);

  if (!producto) return null;

  const bloqueoPeso: 'exige' | 'sinPermiso' | null = porPeso
    ? producto.require_scale
      ? 'exige'
      : !puedePesarAMano
        ? 'sinPermiso'
        : null
    : null;

  const cantidad = cantidadDesdeTexto(texto, decimales);
  const resultado = validarPesada({ producto, cantidad, origen: 'manual', permisoPesoManual: puedePesarAMano });
  const netoBascula = usaBascula && pb.vista.neto !== null && pb.vista.neto > 0 ? pb.vista.neto : null;
  const cantidadCalculo = usaBascula ? netoBascula : resultado.ok ? resultado.cantidad : null;
  const importe = cantidadCalculo !== null ? importePesada(cantidadCalculo, precioPorUnidad) : 0;
  const minimo = minimoDeVenta(producto);

  const mensajeError = (() => {
    if (resultado.ok || bloqueoPeso) return null;
    switch (resultado.error) {
      case 'bajo_minimo':
        return t('errores.bajoMinimo', { minimo: formatoDecimal(resultado.minimo ?? 0) });
      case 'demasiados_decimales':
        return t('errores.demasiadosDecimales', { decimales: resultado.decimales ?? decimales });
      default:
        return texto.trim() === '' && !intentado ? null : t(porPeso ? 'errores.pesoInvalido' : 'errores.cantidadInvalida');
    }
  })();

  const confirmar = () => {
    setIntentado(true);
    if (usaBascula) {
      const pesaje = pb.pesaje();
      if (pesaje) onConfirmar(pesaje.neto, pesaje);
      return;
    }
    if (bloqueoPeso || !resultado.ok) return;
    onConfirmar(resultado.cantidad, porPeso ? pesajeManual(producto, resultado.cantidad) : undefined);
  };

  const titulo = t(modo === 'cambiar' ? 'tituloCambiar' : porPeso ? 'titulo' : 'tituloMedida', { producto: producto.name });
  const existencias = typeof producto.stock_quantity === 'number' && producto.track_stock !== false
    ? t('existencias', { cantidad: formatoDecimal(producto.stock_quantity) })
    : null;
  const subtitulo = [
    t('precioPor', { precio: formatear(precioPorUnidad), unidad }),
    existencias,
    porPeso ? (usaBascula && bascula ? tb('basculaDe', { nombre: bascula.nombre }) : t('sinBascula')) : null,
  ]
    .filter(Boolean)
    .join(' · ');

  const bloqueado = usaBascula ? false : !!bloqueoPeso;
  const etiquetaPrimaria = bloqueado
    ? t('agregarDeshabilitado')
    : modo === 'cambiar'
      ? t('guardar')
      : t('agregar', { importe: formatear(importe) });

  const cajaCalculo = (
    <div className="flex items-center justify-between gap-3 rounded-lg border border-brand bg-brand-tint px-4 py-3">
      <div className="flex min-w-0 flex-col">
        <span className="text-sm font-medium tabular-nums text-fg">
          {t('calculo', {
            cantidad: cantidadCalculo !== null ? formatoDecimal(cantidadCalculo) : `— ${unidad}`,
            precio: formatear(precioPorUnidad),
            unidad,
          })}
        </span>
        <span className="text-xs text-fg-secondary">
          {[minimo !== null ? t('minimo', { minimo: formatoDecimal(minimo) }) : null, porPeso ? t('cobroAlGramo') : null]
            .filter(Boolean)
            .join(' · ')}
        </span>
      </div>
      <span className="shrink-0 text-2xl font-bold tabular-nums text-fg" aria-live="polite">
        {formatear(importe)}
      </span>
    </div>
  );

  return (
    <Dialogo
      abierto={abierto}
      onAbiertoChange={onAbiertoChange}
      titulo={titulo}
      descripcion={subtitulo}
      icono={porPeso ? Scale : Ruler}
      // El lector de códigos sigue activo con «Pesar» abierto (§11).
      className={CLASE_DIALOGO_ACEPTA_ESCANEO}
      textoCancelar={t('cancelar')}
      primario={{
        etiqueta: etiquetaPrimaria,
        onClick: confirmar,
        deshabilitada: usaBascula ? !pb.vista.puedeAgregar : !!bloqueoPeso || (intentado && !resultado.ok),
        motivo: usaBascula
          ? pb.vista.puedeAgregar
            ? undefined
            : tb('motivoAgregar')
          : bloqueoPeso
            ? t(bloqueoPeso === 'exige' ? 'exigeBascula.texto' : 'sinPermiso.texto', { producto: producto.name })
            : undefined,
      }}
    >
      {usaBascula && bascula ? (
        <>
          <LecturaBascula
            estado={pb.vista.estado}
            nombreBascula={bascula.nombre}
            neto={pb.vista.neto !== null ? formatoDecimal(pb.vista.neto) : null}
            bruto={pb.vista.tara !== null && pb.vista.bruto !== null ? formatoDecimal(pb.vista.bruto) : null}
            tara={pb.vista.tara !== null ? formatoDecimal(pb.vista.tara) : null}
            fueraDeRango={pb.vista.fueraDeRango}
            capacidad={bascula.capacidad !== null ? formatoCantidad(bascula.capacidad, { sale_mode: 'weight', unit_code: bascula.unidad }) : null}
            error={pb.vista.error}
            motivo={pb.vista.motivo}
            minimo={minimo !== null ? formatoDecimal(minimo) : null}
            taraProducto={pb.taraProducto !== null ? formatoDecimal(pb.taraProducto) : null}
            taraActiva={pb.tara > 0}
            onCero={pb.lector.cero}
            onTara={pb.tomarTara}
            onQuitarTara={pb.quitarTara}
            onTaraProducto={pb.taraProducto !== null && pb.tara !== pb.taraProducto ? pb.usarTaraProducto : undefined}
            onReintentar={pb.lector.reintentar}
            onConectar={pb.lector.puedeElegirPuerto ? () => void pb.lector.conectarWebSerial() : undefined}
            onPesarAMano={puedeManual ? () => setModoLectura('manual') : undefined}
            esperandoAuto={esperandoAuto ? (lecturaNueva ? 'estable' : 'pesoNuevo') : null}
          />
          {cajaCalculo}
        </>
      ) : bloqueoPeso ? (
        <div role="alert" className="flex items-start gap-3 rounded-lg border border-line-danger bg-danger-subtle px-4 py-3 text-sm text-danger-text">
          {bloqueoPeso === 'exige' ? (
            <AlertTriangle aria-hidden="true" className="mt-0.5 size-5 shrink-0" strokeWidth={1.5} />
          ) : (
            <Lock aria-hidden="true" className="mt-0.5 size-5 shrink-0" strokeWidth={1.5} />
          )}
          <div className="flex flex-col gap-1">
            <p className="font-semibold">{t(bloqueoPeso === 'exige' ? 'exigeBascula.titulo' : 'sinPermiso.titulo')}</p>
            <p>{t(bloqueoPeso === 'exige' ? 'exigeBascula.texto' : 'sinPermiso.texto', { producto: producto.name })}</p>
          </div>
        </div>
      ) : (
        <>
          <div className="flex flex-col gap-2 rounded-lg border border-line bg-subtle px-4 py-3">
            <div className="flex items-center justify-between gap-2 text-xs text-fg-secondary">
              <span className="inline-flex items-center gap-1.5">
                <span aria-hidden="true" className="size-2 rounded-full bg-fg-muted" />
                {t(porPeso ? 'estadoManual' : 'estadoMedida')}
              </span>
              {porPeso && bascula ? (
                <button
                  type="button"
                  onClick={() => setModoLectura('bascula')}
                  className="inline-flex items-center gap-1 rounded text-brand underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
                >
                  <Scale aria-hidden="true" className="size-3.5" strokeWidth={1.5} />
                  {tb('acciones.usarBascula')}
                </button>
              ) : porPeso ? (
                // Sin báscula registrada para este equipo, conectarla no basta:
                // se registra en Configuración › POS › Básculas. Pestaña nueva
                // para no perder la venta en curso.
                <a
                  href="/app/configuracion?modulo=pos#pos-basculas"
                  target="_blank"
                  rel="noopener"
                  className="inline-flex items-center gap-1 rounded text-brand underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
                >
                  <Scale aria-hidden="true" className="size-3.5" strokeWidth={1.5} />
                  {t('configurarBascula')}
                </a>
              ) : null}
            </div>
            <label htmlFor={idCampo} className="sr-only">
              {t(porPeso ? 'campo' : 'campoMedida', { unidad })}
            </label>
            <div
              className={cn(
                'flex h-12 items-center rounded-md border bg-surface text-fg focus-within:ring-2 focus-within:ring-brand',
                mensajeError ? 'border-line-danger' : 'border-line-strong',
              )}
            >
              <input
                ref={campo}
                id={idCampo}
                type="text"
                inputMode="decimal"
                autoComplete="off"
                value={texto}
                aria-invalid={mensajeError ? true : undefined}
                aria-describedby={idAyuda}
                onChange={(e) => {
                  if (textoCantidadParcialValido(e.target.value, decimales)) setTexto(e.target.value);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    confirmar();
                  }
                }}
                className="h-full w-full min-w-0 bg-transparent px-3 text-right text-2xl font-semibold tabular-nums outline-none"
              />
              <span aria-hidden="true" className="shrink-0 border-l border-line px-3 text-sm text-fg-secondary">
                {unidad}
              </span>
            </div>
            <p id={idAyuda} className={cn('text-xs', mensajeError ? 'text-danger-text' : 'text-fg-secondary')} aria-live="polite">
              {mensajeError ?? (porPeso ? t('ayudaManual') : t('ayudaMedida', { decimales }))}
            </p>
          </div>

          {cajaCalculo}
        </>
      )}
    </Dialogo>
  );
}
