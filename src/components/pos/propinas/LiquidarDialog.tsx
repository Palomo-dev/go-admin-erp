'use client';

/**
 * Asistente «Liquidar propinas» en 3 pasos (Figma `1087:712124`: paso 2
 * `1087:715501`, paso 3 `1087:715611`; paso 1 nuevo `2695:190611`).
 *
 * 1. Qué se liquida: periodo, persona y medio; separa lo que sale de la caja
 *    en efectivo de lo que entró al banco y bloquea la propina de una venta
 *    todavía abierta.
 * 2. Cómo se reparte: a quien atendió (por defecto) o pozo por porcentaje;
 *    ajustes a mano que suman cero, con motivo.
 * 3. Cómo se paga: efectivo de la caja abierta (egreso), transferencia (una
 *    referencia por persona) o nómina (requiere HRM, todavía no disponible).
 *
 * Todo lo que se ve aquí es vista previa (`liquidacionLogica.ts`): la
 * liquidación la hace la base en una transacción (`POST /api/pos/propinas/
 * liquidaciones` → `fn_propinas_liquidacion_crear`).
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Banknote, Check, ClipboardList, HandCoins, Send } from 'lucide-react';
import {
  AvatarIniciales,
  AvisoTonal,
  CampoNumero,
  DateRangeButton,
  FormField,
  PanelAdaptable,
  SegmentedControl,
  TarjetaSeleccionable,
} from '@/components/kit';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn } from '@/utils/Utils';
import { pedirCajaAbierta, pedirPropinas, liquidarPropinas } from '@/lib/pos/propinas/clientePropinas';
import { codigoErrorPropina } from '@/lib/pos/propinas/errores';
import {
  armarDatosLiquidacion,
  calcularReparto,
  centavos,
  cumpleMedio,
  liquidable,
  participacionesIguales,
  problemasPago,
  problemasReparto,
  resumirSeleccion,
  sumaParticipaciones,
  type FiltroMedio,
} from '@/lib/pos/propinas/liquidacionLogica';
import type {
  CajaAbiertaPropinas,
  FilaPropina,
  MedioLiquidacion,
  PersonaPropina,
  RepartoLiquidacion,
  ResultadoLiquidacion,
} from '@/lib/pos/propinas/tiposPropinas';
import { useEtiquetasPropinas, useFormatoPropinas } from './formatoPropinas';

type Paso = 'que' | 'reparto' | 'pago';
const PASOS: readonly Paso[] = ['que', 'reparto', 'pago'];

export interface LiquidarDialogProps {
  abierto: boolean;
  onAbiertoChange: (abierto: boolean) => void;
  sucursal: { id: number; nombre: string } | null;
  periodo: { desde: string; hasta: string };
  /** Propinas elegidas en la tabla; `null` = todas las que se puedan liquidar. */
  seleccionInicial: readonly string[] | null;
  /** Personas de la sucursal que pueden entrar al pozo por porcentaje. */
  personasPozo: readonly PersonaPropina[];
  onLiquidada: (resultado: ResultadoLiquidacion, imprimir: boolean) => void;
}

function nuevaSolicitud(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  // Respaldo RFC 4122 v4 para navegadores sin randomUUID.
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

function PasoTarjeta({
  numero,
  titulo,
  resumen,
  estado,
  onClick,
}: {
  numero: number;
  titulo: string;
  resumen: string;
  estado: 'hecho' | 'actual' | 'pendiente';
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!onClick}
      aria-current={estado === 'actual' ? 'step' : undefined}
      className={cn(
        'flex min-w-0 flex-1 items-center gap-3 rounded-lg border px-3 py-2.5 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand',
        estado === 'hecho' && 'border-line-success bg-success-subtle hover:brightness-[0.98]',
        estado === 'actual' && 'border-line-brand bg-brand-tint',
        estado === 'pendiente' && 'border-line bg-surface',
        !onClick && 'cursor-default',
      )}
    >
      <span
        aria-hidden="true"
        className={cn(
          'flex size-7 shrink-0 items-center justify-center rounded-full text-[13px] font-semibold',
          estado === 'hecho' && 'bg-success text-fg-on-brand',
          estado === 'actual' && 'bg-brand-action text-fg-on-brand',
          estado === 'pendiente' && 'border border-line-strong text-fg-muted',
        )}
      >
        {estado === 'hecho' ? <Check className="size-4" strokeWidth={2} /> : numero}
      </span>
      <span className="flex min-w-0 flex-col">
        <span className="truncate text-sm font-medium text-fg">{titulo}</span>
        <span className={cn('truncate text-xs', estado === 'hecho' ? 'text-success-text' : 'text-fg-secondary')}>{resumen}</span>
      </span>
    </button>
  );
}

export function LiquidarDialog({
  abierto,
  onAbiertoChange,
  sucursal,
  periodo: periodoInicial,
  seleccionInicial,
  personasPozo,
  onLiquidada,
}: LiquidarDialogProps) {
  const t = useTranslations('posPropinas');
  const f = useFormatoPropinas();
  const etiqueta = useEtiquetasPropinas();

  const [paso, setPaso] = useState<Paso>('que');
  const [periodo, setPeriodo] = useState(periodoInicial);
  const [persona, setPersona] = useState<string>('todas');
  const [medioFiltro, setMedioFiltro] = useState<FiltroMedio>('todos');
  const [filas, setFilas] = useState<FilaPropina[]>([]);
  const [cargando, setCargando] = useState(false);
  const [errorCarga, setErrorCarga] = useState(false);
  const [seleccion, setSeleccion] = useState<Set<string>>(new Set());
  const [reparto, setReparto] = useState<RepartoLiquidacion>('atendio');
  const [participaciones, setParticipaciones] = useState<Record<string, number>>({});
  const [ajustes, setAjustes] = useState<Record<string, number>>({});
  const [motivoAjuste, setMotivoAjuste] = useState('');
  const [medio, setMedio] = useState<MedioLiquidacion>('efectivo');
  const [referencias, setReferencias] = useState<Record<string, string>>({});
  const [caja, setCaja] = useState<CajaAbiertaPropinas | null>(null);
  const [imprimir, setImprimir] = useState(true);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [solicitud, setSolicitud] = useState(nuevaSolicitud);
  const [primeraCarga, setPrimeraCarga] = useState(true);

  // Al abrir: todo de cero (una solicitud nueva = una liquidación nueva).
  useEffect(() => {
    if (!abierto) return;
    setPaso('que');
    setPeriodo(periodoInicial);
    setPersona('todas');
    setMedioFiltro('todos');
    setReparto('atendio');
    setParticipaciones({});
    setAjustes({});
    setMotivoAjuste('');
    setMedio('efectivo');
    setReferencias({});
    setError(null);
    setSolicitud(nuevaSolicitud());
    setPrimeraCarga(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [abierto]);

  useEffect(() => {
    if (!abierto || !sucursal) return;
    let vigente = true;
    pedirCajaAbierta(sucursal.id)
      .then((c) => vigente && setCaja(c))
      .catch(() => vigente && setCaja(null));
    return () => {
      vigente = false;
    };
  }, [abierto, sucursal]);

  const cargar = useCallback(() => {
    if (!sucursal) return;
    setCargando(true);
    setErrorCarga(false);
    const q = new URLSearchParams({ vista: 'por_liquidar', desde: periodo.desde, hasta: periodo.hasta, sucursal: String(sucursal.id), tamano: '500' });
    pedirPropinas(q)
      .then((r) => {
        setFilas(r.filas);
        // Primera carga: lo elegido en la tabla (o todo lo liquidable). Al
        // cambiar el periodo, todo lo liquidable del periodo nuevo.
        const liquidables = r.filas.filter(liquidable).map((x) => x.id);
        if (primeraCarga && seleccionInicial && seleccionInicial.length > 0) {
          const pedidas = new Set(seleccionInicial);
          setSeleccion(new Set(liquidables.filter((id) => pedidas.has(id))));
        } else {
          setSeleccion(new Set(liquidables));
        }
        setPrimeraCarga(false);
      })
      .catch(() => setErrorCarga(true))
      .finally(() => setCargando(false));
  }, [sucursal, periodo, primeraCarga, seleccionInicial]);

  useEffect(() => {
    if (abierto) cargar();
    // Solo al abrir y al cambiar el periodo.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [abierto, periodo.desde, periodo.hasta, sucursal?.id]);

  const personas = useMemo(() => {
    const m = new Map<string, PersonaPropina>();
    filas.forEach((x) => m.set(x.persona.id, x.persona));
    return [...m.values()];
  }, [filas]);

  const visibles = useMemo(
    () => filas.filter((x) => (persona === 'todas' || x.persona.id === persona) && cumpleMedio(x, medioFiltro)),
    [filas, persona, medioFiltro],
  );
  /** Lo que de verdad entra: elegidas Y visibles con los filtros del paso 1. */
  const elegidas = useMemo(() => visibles.filter((x) => seleccion.has(x.id) && liquidable(x)), [visibles, seleccion]);
  const resumen = useMemo(() => resumirSeleccion(visibles, seleccion), [visibles, seleccion]);
  const bloqueadasVisibles = visibles.filter((x) => !liquidable(x));
  const liquidablesVisibles = visibles.filter(liquidable);
  const todasMarcadas = liquidablesVisibles.length > 0 && liquidablesVisibles.every((x) => seleccion.has(x.id));
  const algunaMarcada = liquidablesVisibles.some((x) => seleccion.has(x.id));

  // Pozo: quienes atendieron + las personas de la sucursal.
  const personasDelPozo = useMemo(() => {
    const m = new Map<string, PersonaPropina>();
    elegidas.forEach((x) => m.set(x.persona.id, x.persona));
    personasPozo.forEach((p) => m.has(p.id) || m.set(p.id, p));
    return [...m.values()];
  }, [elegidas, personasPozo]);

  useEffect(() => {
    if (reparto === 'porcentaje' && Object.keys(participaciones).length === 0) {
      setParticipaciones(participacionesIguales([...new Set(elegidas.map((x) => x.persona.id))]));
    }
  }, [reparto, participaciones, elegidas]);

  const lineas = useMemo(
    () => calcularReparto(elegidas, reparto, participaciones, personasDelPozo, ajustes),
    [elegidas, reparto, participaciones, personasDelPozo, ajustes],
  );
  const problemas2 = problemasReparto(lineas, reparto, participaciones, motivoAjuste);
  const problemas3 = problemasPago(medio, lineas, { cajaAbierta: !!caja, referencias, motivo: '' });
  const totalAjustes = centavos(lineas.reduce((a, l) => a + l.ajuste, 0));
  const nAjustes = lineas.filter((l) => l.ajuste !== 0).length;
  const total = resumen.total;

  const alternar = (id: string, si: boolean) =>
    setSeleccion((s) => {
      const n = new Set(s);
      if (si) n.add(id);
      else n.delete(id);
      return n;
    });

  const confirmar = async () => {
    if (!sucursal) return;
    setEnviando(true);
    setError(null);
    try {
      const datos = armarDatosLiquidacion({
        solicitud,
        sucursalId: sucursal.id,
        propinas: elegidas.map((x) => x.id),
        reparto,
        participaciones,
        lineas,
        motivoAjuste,
        medio,
        referencias,
        motivo: '',
        desde: periodo.desde,
        hasta: periodo.hasta,
      });
      const r = await liquidarPropinas(datos);
      onLiquidada(r, imprimir);
    } catch (e) {
      setError(t(`errores.${codigoErrorPropina(e)}`));
    } finally {
      setEnviando(false);
    }
  };

  const indice = PASOS.indexOf(paso);
  const estadoPaso = (p: Paso): 'hecho' | 'actual' | 'pendiente' => (p === paso ? 'actual' : PASOS.indexOf(p) < indice ? 'hecho' : 'pendiente');
  const resumenPaso1 = t('liquidar.pasos.queResumen', { n: f.entero(resumen.cantidad), count: resumen.cantidad, monto: f.formatear(total) });
  const resumenPaso2 =
    indice >= 1
      ? nAjustes > 0
        ? t('liquidar.pasos.repartoConAjustes', { reparto: etiqueta.reparto(reparto), count: nAjustes })
        : etiqueta.reparto(reparto)
      : t('liquidar.pasos.repartoResumen');
  const resumenPaso3 =
    indice >= 2 ? (medio === 'efectivo' && caja ? t('liquidar.pasos.efectivoDeCaja', { caja: caja.id }) : etiqueta.medio(medio)) : t('liquidar.pasos.pendiente');

  const descripcion =
    paso === 'que'
      ? t('liquidar.descripcionPaso1', { sucursal: sucursal?.nombre ?? '', caja: caja ? t('liquidar.cajaAbierta', { caja: caja.id }) : t('liquidar.sinCaja') })
      : t('liquidar.descripcion', {
          periodo: f.periodo(periodo.desde, periodo.hasta),
          sucursal: sucursal?.nombre ?? '',
          personas: lineas.length,
          monto: f.formatear(total),
        });

  const pie = (
    <div className="flex w-full flex-col-reverse gap-2 sm:flex-row sm:justify-end">
      {paso === 'que' ? (
        <Button variant="outline" className="h-10" onClick={() => onAbiertoChange(false)} disabled={enviando}>
          {t('liquidar.cancelar')}
        </Button>
      ) : (
        <Button variant="outline" className="h-10" onClick={() => setPaso(PASOS[indice - 1])} disabled={enviando}>
          {t('liquidar.atras')}
        </Button>
      )}
      {paso === 'que' && (
        <Button className="h-10" disabled={resumen.cantidad === 0 || cargando} onClick={() => setPaso('reparto')}>
          {t('liquidar.siguienteReparto')}
        </Button>
      )}
      {paso === 'reparto' && (
        <Button className="h-10" disabled={problemas2.length > 0} onClick={() => setPaso('pago')}>
          {t('liquidar.continuar')}
        </Button>
      )}
      {paso === 'pago' && (
        <Button className="h-10 gap-2" disabled={problemas3.length > 0 || enviando || resumen.cantidad === 0} onClick={() => void confirmar()}>
          <HandCoins aria-hidden="true" className="size-4" strokeWidth={1.5} />
          {enviando ? t('liquidar.liquidando') : t('liquidar.confirmar', { monto: f.formatear(total) })}
        </Button>
      )}
    </div>
  );

  return (
    <PanelAdaptable
      abierto={abierto}
      onAbiertoChange={onAbiertoChange}
      titulo={t('liquidar.titulo')}
      descripcion={descripcion}
      ancho={880}
      ocupado={enviando}
      bloquearClicFuera
      pie={pie}
    >
      <div className="flex flex-col gap-4">
        <ol className="flex flex-col gap-2 sm:flex-row" aria-label={t('liquidar.pasos.etiqueta')}>
          <li className="flex flex-1">
            <PasoTarjeta numero={1} titulo={t('liquidar.pasos.que')} resumen={resumenPaso1} estado={estadoPaso('que')} onClick={indice > 0 ? () => setPaso('que') : undefined} />
          </li>
          <li className="flex flex-1">
            <PasoTarjeta numero={2} titulo={t('liquidar.pasos.reparto')} resumen={resumenPaso2} estado={estadoPaso('reparto')} onClick={indice > 1 ? () => setPaso('reparto') : undefined} />
          </li>
          <li className="flex flex-1">
            <PasoTarjeta numero={3} titulo={t('liquidar.pasos.pago')} resumen={resumenPaso3} estado={estadoPaso('pago')} />
          </li>
        </ol>

        {!sucursal && <AvisoTonal tono="advertencia" titulo={t('liquidar.eligeSucursal')} />}

        {paso === 'que' && sucursal && (
          <div className="flex flex-col gap-3">
            <div className="grid gap-3 sm:grid-cols-3">
              <FormField etiqueta={t('liquidar.periodo')} ayuda={t('liquidar.periodoAyuda')}>
                {() => (
                  <DateRangeButton
                    valor={periodo}
                    hoy={f.hoy}
                    max={f.hoy}
                    etiqueta={t('liquidar.periodo')}
                    onValorChange={(r) => setPeriodo({ desde: r.desde, hasta: r.hasta })}
                    className="w-full"
                  />
                )}
              </FormField>
              <FormField etiqueta={t('liquidar.persona')} ayuda={t('liquidar.personaAyuda')}>
                {(c) => (
                  <Select value={persona} onValueChange={setPersona}>
                    <SelectTrigger id={c.id} aria-labelledby={c.idEtiqueta} className="h-10 border-line-strong bg-surface">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="todas">{t('liquidar.todasPersonas')}</SelectItem>
                      {personas.map((p) => (
                        <SelectItem key={p.id} value={p.id}>
                          {p.nombre ?? t('sinNombre')}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </FormField>
              <FormField etiqueta={t('liquidar.medio')} ayuda={t('liquidar.medioAyuda')}>
                {(c) => (
                  <Select value={medioFiltro} onValueChange={(v) => setMedioFiltro(v as FiltroMedio)}>
                    <SelectTrigger id={c.id} aria-labelledby={c.idEtiqueta} className="h-10 border-line-strong bg-surface">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="todos">{t('liquidar.medios.todos')}</SelectItem>
                      <SelectItem value="efectivo">{t('liquidar.medios.efectivo')}</SelectItem>
                      <SelectItem value="banco">{t('liquidar.medios.banco')}</SelectItem>
                    </SelectContent>
                  </Select>
                )}
              </FormField>
            </div>

            {errorCarga ? (
              <AvisoTonal tono="peligro" titulo={t('liquidar.errorCarga')} accion={{ etiqueta: t('estados.reintentar'), onClick: cargar }} />
            ) : (
              <div className="overflow-hidden rounded-lg border border-line" aria-busy={cargando}>
                <label className="flex items-center gap-3 border-b border-line bg-brand-tint/40 px-4 py-2.5 text-sm font-medium text-fg">
                  <Checkbox
                    checked={todasMarcadas ? true : algunaMarcada ? 'indeterminate' : false}
                    disabled={liquidablesVisibles.length === 0}
                    onCheckedChange={(v) =>
                      setSeleccion((s) => {
                        const n = new Set(s);
                        liquidablesVisibles.forEach((x) => (v === true ? n.add(x.id) : n.delete(x.id)));
                        return n;
                      })
                    }
                  />
                  <span className="flex-1">{t('liquidar.todas', { n: resumen.cantidad, total: visibles.length })}</span>
                  <span className="tabular-nums">{f.formatear(total)}</span>
                </label>
                <ul className="max-h-[320px] divide-y divide-line overflow-y-auto">
                  {cargando && filas.length === 0 && <li className="px-4 py-6 text-center text-sm text-fg-secondary">{t('estados.cargando')}</li>}
                  {!cargando && visibles.length === 0 && <li className="px-4 py-6 text-center text-sm text-fg-secondary">{t('liquidar.sinPropinas')}</li>}
                  {visibles.map((x) => {
                    const bloqueada = !liquidable(x);
                    const titulo = [x.venta?.numero ?? t('tabla.sinDocumento'), x.venta?.mesa ?? (x.venta?.origen === 'web' ? t('origenes.web') : x.venta ? t('origenes.mostrador') : null)]
                      .filter(Boolean)
                      .join(' · ');
                    const detalle = [x.persona.nombre ?? t('sinNombre'), x.persona.cargo, etiqueta.tipo(x.tipo), f.hora(x.fecha), bloqueada ? t('liquidar.ventaSinCerrar') : null]
                      .filter(Boolean)
                      .join(' · ');
                    return (
                      <li key={x.id}>
                        <label className={cn('flex items-center gap-3 px-4 py-3', bloqueada ? 'cursor-not-allowed' : 'cursor-pointer hover:bg-brand-tint/30')}>
                          <Checkbox checked={!bloqueada && seleccion.has(x.id)} disabled={bloqueada} onCheckedChange={(v) => alternar(x.id, v === true)} />
                          <span className="flex min-w-0 flex-1 flex-col">
                            <span className={cn('truncate text-sm font-medium', bloqueada ? 'text-fg-muted' : 'text-fg')}>{titulo}</span>
                            <span className="truncate text-xs text-fg-secondary">{detalle}</span>
                          </span>
                          <span className={cn('text-sm tabular-nums', bloqueada ? 'text-fg-muted' : 'font-medium text-fg')}>{f.formatear(x.monto)}</span>
                        </label>
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}

            <dl className="flex flex-col gap-1.5 text-sm">
              <div className="flex justify-between gap-3">
                <dt className="text-fg-secondary">{caja ? t('liquidar.efectivoSaleDe', { caja: caja.id }) : t('liquidar.efectivo')}</dt>
                <dd className="tabular-nums text-fg">{f.formatear(resumen.efectivo)}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-fg-secondary">{t('liquidar.banco')}</dt>
                <dd className="tabular-nums text-fg">{f.formatear(resumen.banco)}</dd>
              </div>
              <div className="flex justify-between gap-3 pt-1">
                <dt className="font-medium text-fg">{t('liquidar.totalALiquidar')}</dt>
                <dd className="text-lg font-semibold tabular-nums text-fg">{f.formatear(total)}</dd>
              </div>
            </dl>
            {bloqueadasVisibles.length > 0 && (
              <p className="text-sm text-fg-secondary">
                {t('liquidar.ventasAbiertas', {
                  count: bloqueadasVisibles.length,
                  venta: bloqueadasVisibles[0].venta?.numero ?? t('tabla.sinDocumento'),
                })}
              </p>
            )}
          </div>
        )}

        {paso === 'reparto' && (
          <div className="flex flex-col gap-3">
            <SegmentedControl
              etiqueta={t('liquidar.reparto')}
              anchoCompleto
              valor={reparto}
              onValorChange={(v) => {
                setReparto(v as RepartoLiquidacion);
                setAjustes({});
              }}
              opciones={[
                { valor: 'atendio', etiqueta: t('repartos.atendio') },
                { valor: 'horas', etiqueta: t('repartos.horas'), deshabilitada: true },
                { valor: 'porcentaje', etiqueta: t('repartos.porcentaje') },
              ]}
            />
            {reparto === 'porcentaje' && Math.abs(sumaParticipaciones(participaciones) - 100) > 0.01 && (
              <AvisoTonal tono="advertencia" compacto titulo={t('liquidar.porcentajesNoSuman', { pct: sumaParticipaciones(participaciones) })} />
            )}
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] text-sm">
                <caption className="sr-only">{t('liquidar.reparto')}</caption>
                <thead>
                  <tr className="text-left text-xs text-fg-secondary">
                    <th scope="col" className="py-2 pr-2 font-medium">{t('liquidar.columnas.persona')}</th>
                    <th scope="col" className="px-2 py-2 text-right font-medium">{t('liquidar.columnas.base')}</th>
                    <th scope="col" className="px-2 py-2 text-right font-medium">{t('liquidar.columnas.participacion')}</th>
                    <th scope="col" className="px-2 py-2 text-right font-medium">{t('liquidar.columnas.calculado')}</th>
                    <th scope="col" className="px-2 py-2 text-right font-medium">{t('liquidar.columnas.ajuste')}</th>
                    <th scope="col" className="py-2 pl-2 text-right font-medium">{t('liquidar.columnas.aPagar')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {lineas.map((l) => (
                    <tr key={l.persona.id} className={l.ajuste !== 0 ? 'bg-warning-subtle' : undefined}>
                      <td className="py-2.5 pr-2">
                        <div className="flex items-center gap-2.5">
                          <AvatarIniciales nombre={l.persona.nombre ?? '?'} tamano="sm" />
                          <div className="flex min-w-0 flex-col">
                            <span className="truncate font-medium text-fg">{l.persona.nombre ?? t('sinNombre')}</span>
                            {l.persona.cargo && <span className="truncate text-xs text-fg-secondary">{l.persona.cargo}</span>}
                          </div>
                        </div>
                      </td>
                      <td className="px-2 py-2.5 text-right tabular-nums text-fg-secondary">{f.formatear(l.base)}</td>
                      <td className="px-2 py-2.5 text-right tabular-nums">
                        {reparto === 'porcentaje' ? (
                          <CampoNumero
                            aria-label={t('liquidar.participacionDe', { persona: l.persona.nombre ?? '' })}
                            valor={participaciones[l.persona.id] ?? 0}
                            onValorChange={(v) => setParticipaciones((p) => ({ ...p, [l.persona.id]: v ?? 0 }))}
                            decimales={2}
                            minimo={0}
                            maximo={100}
                            sufijo="%"
                            alinear="derecha"
                            tamano="sm"
                            className="w-24"
                          />
                        ) : (
                          `${Math.round(l.pct)} %`
                        )}
                      </td>
                      <td className="px-2 py-2.5 text-right tabular-nums text-fg">{f.formatear(l.calculado)}</td>
                      <td className="px-2 py-2.5 text-right">
                        <CampoNumero
                          aria-label={t('liquidar.ajusteDe', { persona: l.persona.nombre ?? '' })}
                          valor={ajustes[l.persona.id] ?? 0}
                          onValorChange={(v) => setAjustes((a) => ({ ...a, [l.persona.id]: v ?? 0 }))}
                          decimales={2}
                          alinear="derecha"
                          tamano="sm"
                          className={cn('w-28', l.ajuste < 0 ? 'text-warning-text' : l.ajuste > 0 ? 'text-warning-text' : '')}
                        />
                      </td>
                      <td className="py-2.5 pl-2 text-right font-semibold tabular-nums text-fg">{f.formatear(l.monto)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {reparto === 'porcentaje' && personasDelPozo.length > lineas.length && (
              <FormField etiqueta={t('liquidar.agregarAlPozo')}>
                {(c) => (
                  <Select value="" onValueChange={(id) => setParticipaciones((p) => ({ ...p, [id]: 0.01 }))}>
                    <SelectTrigger id={c.id} aria-labelledby={c.idEtiqueta} className="h-10 border-line-strong bg-surface">
                      <SelectValue placeholder={t('liquidar.agregarAlPozoPlaceholder')} />
                    </SelectTrigger>
                    <SelectContent>
                      {personasDelPozo
                        .filter((p) => !lineas.some((l) => l.persona.id === p.id))
                        .map((p) => (
                          <SelectItem key={p.id} value={p.id}>
                            {p.nombre ?? t('sinNombre')}
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                )}
              </FormField>
            )}
            <FormField
              etiqueta={t('liquidar.motivoAjuste')}
              ayuda={t('liquidar.motivoAjusteAyuda')}
              error={problemas2.includes('motivoAjuste') && motivoAjuste.length > 0 ? t('liquidar.motivoCorto') : undefined}
            >
              {(c) => (
                <Input
                  id={c.id}
                  aria-describedby={c['aria-describedby']}
                  value={motivoAjuste}
                  maxLength={500}
                  onChange={(e) => setMotivoAjuste(e.target.value)}
                  className="h-10 border-line-strong bg-surface"
                />
              )}
            </FormField>
            {problemas2.includes('ajustesNoSumanCero') && (
              <AvisoTonal tono="advertencia" compacto titulo={t('liquidar.ajustesNoSuman', { monto: f.formatear(totalAjustes) })} />
            )}
            {problemas2.includes('ajusteNegativo') && <AvisoTonal tono="peligro" compacto titulo={t('errores.AJUSTE_NEGATIVO')} />}
            <dl className="flex flex-col gap-1.5 text-sm">
              <div className="flex justify-between gap-3">
                <dt className="text-fg-secondary">{t('liquidar.totalPropinas')}</dt>
                <dd className="tabular-nums text-fg">{f.formatear(total)}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-fg-secondary">{t('liquidar.ajustesSumanCero')}</dt>
                <dd className={cn('tabular-nums', totalAjustes !== 0 ? 'text-danger-text' : 'text-fg')}>{f.formatear(totalAjustes)}</dd>
              </div>
              <div className="flex justify-between gap-3 pt-1">
                <dt className="font-medium text-fg">{t('liquidar.aPagar')}</dt>
                <dd className="text-lg font-semibold tabular-nums text-fg">{f.formatear(centavos(lineas.reduce((a, l) => a + l.monto, 0)))}</dd>
              </div>
            </dl>
          </div>
        )}

        {paso === 'pago' && (
          <div className="flex flex-col gap-3" role="radiogroup" aria-label={t('liquidar.pasos.pago')}>
            <TarjetaSeleccionable
              rol="radio"
              orientacion="horizontal"
              icono={Banknote}
              titulo={t('liquidar.pago.efectivo')}
              seleccionada={medio === 'efectivo'}
              onSeleccionar={() => setMedio('efectivo')}
              descripcion={
                <span className="flex flex-wrap items-center gap-2">
                  <span>
                    {caja
                      ? t('liquidar.pago.efectivoDetalle', {
                          caja: caja.id,
                          persona: caja.abierta_por ?? t('sinNombre'),
                          esperado: caja.esperado === null ? t('liquidar.pago.esperadoOculto') : f.formatear(caja.esperado),
                        })
                      : t('liquidar.pago.sinCaja')}
                  </span>
                  {caja && (
                    <Badge tono="marca" apariencia="contorno" tamano="sm">
                      {t('liquidar.pago.recomendado')}
                    </Badge>
                  )}
                </span>
              }
            />
            <TarjetaSeleccionable
              rol="radio"
              orientacion="horizontal"
              icono={Send}
              titulo={t('liquidar.pago.transferencia')}
              descripcion={t('liquidar.pago.transferenciaDetalle')}
              seleccionada={medio === 'transferencia'}
              onSeleccionar={() => setMedio('transferencia')}
            />
            {medio === 'transferencia' && (
              <div className="grid gap-3 rounded-lg border border-line p-3 sm:grid-cols-2">
                {lineas
                  .filter((l) => l.monto > 0)
                  .map((l) => (
                    <FormField key={l.persona.id} etiqueta={t('liquidar.pago.referenciaDe', { persona: l.persona.nombre ?? t('sinNombre'), monto: f.formatear(l.monto) })}>
                      {(c) => (
                        <Input
                          id={c.id}
                          value={referencias[l.persona.id] ?? ''}
                          maxLength={120}
                          onChange={(e) => setReferencias((r) => ({ ...r, [l.persona.id]: e.target.value }))}
                          className="h-10 border-line-strong bg-surface"
                        />
                      )}
                    </FormField>
                  ))}
              </div>
            )}
            <TarjetaSeleccionable
              rol="radio"
              orientacion="horizontal"
              icono={ClipboardList}
              titulo={t('liquidar.pago.nomina')}
              descripcion={
                <span className="flex flex-wrap items-center gap-2">
                  <span>{t('liquidar.pago.nominaDetalle')}</span>
                  <Badge tono="neutro" apariencia="contorno" tamano="sm">
                    {t('liquidar.pago.requiereHrm')}
                  </Badge>
                </span>
              }
              seleccionada={false}
              deshabilitada
              onSeleccionar={() => undefined}
            />
            {!caja && medio === 'efectivo' && (
              <AvisoTonal
                tono="advertencia"
                titulo={t('liquidar.pago.sinCajaTitulo')}
                descripcion={t('liquidar.pago.sinCajaDescripcion')}
                accion={{ etiqueta: t('liquidar.pago.abrirCaja'), href: '/app/pos/cajas' }}
              />
            )}
            <AvisoTonal tono="informacion" compacto titulo={medio === 'efectivo' ? t('liquidar.pago.notaEfectivo') : t('liquidar.pago.notaTransferencia')} />
            <label className="flex items-center gap-2 text-sm text-fg">
              <Checkbox checked={imprimir} onCheckedChange={(v) => setImprimir(v === true)} />
              {t('liquidar.pago.imprimir')}
            </label>
            {problemas3.includes('referencias') && <p className="text-sm text-warning-text">{t('errores.REFERENCIA_REQUERIDA')}</p>}
          </div>
        )}

        {error && <AvisoTonal tono="peligro" rol="alert" titulo={error} />}
      </div>
    </PanelAdaptable>
  );
}
