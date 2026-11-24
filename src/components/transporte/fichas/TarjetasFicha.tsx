'use client';

/**
 * Tarjetas compartidas de las fichas del catálogo común (vehículo 2872:1691 y persona 2874:2806):
 * Documentos, Historial de viajes, Envíos y Novedades. Cada tarjeta sirve para «Resumen» (con
 * `limite` y «Ver los N») y para su pestaña (todas las filas).
 *
 * Los documentos se suben y renuevan con `DialogoDocumento` de Flota (lo abre la pantalla) y el
 * archivo se ve con la URL firmada de `documentosService.urlArchivo`, como en Flota.
 */
import type { ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { ArrowRight, Eye, FileCheck2, FileUp, History, Package, Paperclip, TriangleAlert } from 'lucide-react';
import { DataTable, ListCard, StatusBadge, Tarjeta, clasesBoton, type AccionFila, type ColumnaTabla } from '@/components/kit';
import { useFormatoEntero } from '@/components/kit/useIdiomaKit';
import { toastError } from '@/components/ui/use-toast';
import { useFormatDate } from '@/lib/context/OrganizationTimezoneContext';
import { useMonedaOrganizacion } from '@/lib/hooks/useOrgCurrency';
import { supabase } from '@/lib/supabase/config';
import { formatMoneda } from '@/lib/utils/moneda';
import type { Trip } from '@/lib/services/transportService';
import { urlArchivo } from '@/lib/services/transporte/documentosService';
import type { EnvioFicha, NovedadFicha } from '@/lib/services/transporte/fichaCatalogoService';
import { rutaEnvio } from '@/lib/logistica/rutas';
import { TONO_DOCS } from '@/lib/transporte/catalogoComun';
import {
  TONO_ENVIO,
  TONO_NOVEDAD,
  TONO_VIAJE,
  costoNovedad,
  llegadaViaje,
  ocupacionViaje,
  type FilaDocumentoFicha,
} from '@/lib/transporte/fichaCatalogo';

type EstadoCarga = 'cargando' | 'error' | 'listo';

const estadoTabla = (carga: EstadoCarga, n: number) => (carga === 'cargando' && n === 0 ? 'cargando' : carga === 'error' ? 'error' : n === 0 ? 'vacio' : 'listo');

function BotonVerTodos({ n, onClick }: { n: number; onClick: () => void }) {
  const t = useTranslations('catalogoComun.comun.ficha');
  const entero = useFormatoEntero();
  return (
    <button type="button" onClick={onClick} className={clasesBoton({ variante: 'fantasma', tamano: 'sm' })}>
      <ArrowRight aria-hidden="true" className="size-4" strokeWidth={1.5} />
      {t('verTodos', { n: entero(n) })}
    </button>
  );
}

const dosLineas = (principal: ReactNode, detalle: ReactNode | null, clasePrincipal = 'text-fg') => (
  <div className="flex min-w-0 flex-col">
    <span className={`truncate ${clasePrincipal}`}>{principal}</span>
    {detalle && <span className="truncate text-xs text-fg-muted">{detalle}</span>}
  </div>
);

/** Etiqueta de un tipo de documento (las de Despachos: SOAT, Licencia de conducción…). */
export function useTipoDocumento() {
  const tCausas = useTranslations('transporte.despachos.causas');
  return (tipo: string) => (tCausas.has(tipo) ? tCausas(tipo) : tipo);
}

/** Capacidad de un vehículo como en la lista: «40 pasajeros o 500 kg · 3 m³». */
export function useCapacidadVehiculo() {
  const tv = useTranslations('catalogoComun.vehiculos');
  const entero = useFormatoEntero();
  return (v: { pasajeros: number | null; kg: number | null; m3: number | null }): string | null => {
    const carga = [v.kg ? tv('capacidad.kg', { n: entero(v.kg) }) : null, v.m3 ? tv('capacidad.m3', { n: entero(v.m3) }) : null].filter(Boolean).join(' · ');
    if (v.pasajeros) return [tv('capacidad.pasajeros', { count: v.pasajeros }), carga ? tv('capacidad.o', { carga }) : null].filter(Boolean).join(' ');
    return carga || null;
  };
}

/** Abre el archivo de un documento con una URL firmada de 5 minutos (bucket privado). */
export function useAbrirArchivo() {
  const tFlota = useTranslations('transporte.flota');
  return async (ruta: string) => {
    // La pestaña se abre dentro del clic; la URL firmada llega después.
    const ventana = window.open('', '_blank');
    try {
      const url = await urlArchivo(supabase, ruta);
      if (ventana) ventana.location.href = url;
      else window.location.href = url;
    } catch {
      ventana?.close();
      toastError(tFlota('errores.archivo'));
    }
  };
}

// ── Documentos ─────────────────────────────────────────────────────────────

export interface TarjetaDocumentosProps {
  filas: readonly FilaDocumentoFicha[];
  titulo: string;
  descripcion: string;
  /** Vehículo: «Número»; persona: «Número o entidad». */
  columnaNumero: 'numero' | 'numeroEntidad';
  aviso?: ReactNode;
  carga: EstadoCarga;
  onSubir: () => void;
  onRenovar: (f: FilaDocumentoFicha) => void;
  onReintentar: () => void;
}

export function TarjetaDocumentosFicha({ filas, titulo, descripcion, columnaNumero, aviso, carga, onSubir, onRenovar, onReintentar }: TarjetaDocumentosProps) {
  const t = useTranslations('catalogoComun.comun.ficha.documentos');
  const tc = useTranslations('catalogoComun.comun');
  const tFlota = useTranslations('transporte.flota.acciones');
  const { formatPlain } = useFormatDate();
  const tipoTexto = useTipoDocumento();
  const abrirArchivo = useAbrirArchivo();

  const detalleTipo = (f: FilaDocumentoFicha) =>
    [f.categoria, f.archivo ? f.archivoNombre || t('conArchivo') : t('sinArchivo'), f.bloquea ? null : t('noBloquea')].filter(Boolean).join(' · ');
  const numero = (f: FilaDocumentoFicha) => (columnaNumero === 'numero' ? f.numero : f.numero ?? f.entidad);
  const numeroDetalle = (f: FilaDocumentoFicha) => (columnaNumero === 'numeroEntidad' && f.numero && f.entidad ? f.entidad : null);
  const dias = (f: FilaDocumentoFicha) =>
    f.dias === null || f.estado === 'vigente' ? null : f.dias < 0 ? t('diasVencido', { count: -f.dias }) : t('diasFaltan', { count: f.dias });
  const badge = (f: FilaDocumentoFicha) => <StatusBadge estado={f.estado} tono={TONO_DOCS[f.estado]} etiqueta={tc(`docs.${f.estado}`)} />;
  const acciones = (f: FilaDocumentoFicha): AccionFila[] => [
    { id: 'archivo', etiqueta: tFlota('verArchivo'), icono: Paperclip, onSelect: () => f.archivo && void abrirArchivo(f.archivo), oculta: !f.archivo },
    { id: 'renovar', etiqueta: f.docId ? tFlota('renovar') : tFlota('cargar'), icono: FileUp, onSelect: () => onRenovar(f) },
  ];

  const columnas: ColumnaTabla<FilaDocumentoFicha>[] = [
    { id: 'documento', encabezado: t('columnas.documento'), celda: (f) => dosLineas(tipoTexto(f.tipo), detalleTipo(f)) },
    { id: 'numero', encabezado: t(`columnas.${columnaNumero}`), ocultarDebajo: 'md', celda: (f) => dosLineas(numero(f) || '—', numeroDetalle(f)) },
    {
      id: 'vence',
      encabezado: t('columnas.vence'),
      celda: (f) => (
        <div className="flex flex-col">
          <span className="tabular-nums text-fg">{f.vence ? formatPlain(f.vence) : t('sinVence')}</span>
          {dias(f) && <span className={`text-xs ${f.estado === 'vencido' ? 'text-danger-text' : 'text-warning-text'}`}>{dias(f)}</span>}
        </div>
      ),
    },
    { id: 'estado', encabezado: t('columnas.estado'), celda: badge },
  ];

  return (
    <Tarjeta
      titulo={titulo}
      descripcion={descripcion}
      icono={FileCheck2}
      accion={
        <button type="button" onClick={onSubir} className={clasesBoton({ variante: 'secundario', tamano: 'sm' })}>
          <FileUp aria-hidden="true" className="size-4" strokeWidth={1.5} />
          <span className="hidden sm:inline">{t('subir')}</span>
          <span className="sr-only sm:hidden">{t('subir')}</span>
        </button>
      }
    >
      <div className="flex flex-col gap-3">
        {aviso}
        <DataTable
          etiqueta={titulo}
          densidad="compacta"
          columnas={columnas}
          filas={filas}
          obtenerId={(f) => f.id}
          estado={estadoTabla(carga, filas.length)}
          etiquetaFila={(f) => tipoTexto(f.tipo)}
          acciones={acciones}
          tonoFila={(f) => (f.estado === 'vencido' ? 'peligro' : undefined)}
          tarjetaMovil={(f) => (
            <ListCard
              icono={FileCheck2}
              titulo={tipoTexto(f.tipo)}
              subtitulo={[numero(f), detalleTipo(f)].filter(Boolean).join(' · ')}
              meta={[f.vence ? formatPlain(f.vence) : t('sinVence'), dias(f)].filter(Boolean).join(' · ')}
              estado={badge(f)}
              acciones={acciones(f)}
            />
          )}
          vacio={{ icono: FileCheck2, titulo: t('vacio.titulo'), descripcion: t('vacio.descripcion'), accion: { etiqueta: t('subir'), icono: FileUp, onClick: onSubir } }}
          error={{ titulo: tc('ficha.errorCarga') }}
          onReintentar={onReintentar}
        />
      </div>
    </Tarjeta>
  );
}

// ── Viajes ─────────────────────────────────────────────────────────────────

export interface TarjetaViajesProps {
  viajes: readonly Trip[];
  /** Columna del otro lado: el vehículo (ficha de persona) o el conductor (ficha de vehículo). */
  otro: { columna: 'vehiculo' | 'conductor'; nombre: (v: Trip) => string | null };
  descripcion: string;
  carga: EstadoCarga;
  limite?: number;
  onVerTodos?: () => void;
  onReportarNovedad?: (v: Trip) => void;
  onReintentar: () => void;
  vacioDescripcion?: string;
}

export function TarjetaViajesFicha({ viajes, otro, descripcion, carga, limite, onVerTodos, onReportarNovedad, onReintentar, vacioDescripcion }: TarjetaViajesProps) {
  const t = useTranslations('catalogoComun.comun.ficha.viajes');
  const tc = useTranslations('catalogoComun.comun.ficha');
  const router = useRouter();
  const entero = useFormatoEntero();
  const { formatPlain, formatTime } = useFormatDate();
  const filas = limite ? viajes.slice(0, limite) : viajes;

  const estadoTexto = (s: string) => (t.has(`estados.${s}`) ? t(`estados.${s}`) : s);
  const ver = (v: Trip) => router.push(`/app/transporte/viajes/${encodeURIComponent(v.id)}`);
  const ruta = (v: Trip) => v.transport_routes?.name ?? t('sinRuta');
  const pasajeros = (v: Trip) => {
    const o = ocupacionViaje(v);
    return o ? t('ocupacion', { vendidos: entero(o.vendidos), total: entero(o.total) }) : '—';
  };
  const llegada = (v: Trip) => {
    const l = llegadaViaje(v);
    if (l.tipo === 'aTiempo') return <StatusBadge estado="a_tiempo" tono="exito" etiqueta={t('aTiempo')} />;
    if (l.tipo === 'retraso') return <StatusBadge estado="retraso" tono="advertencia" etiqueta={t('retraso', { n: entero(l.minutos) })} />;
    return <StatusBadge estado={l.estado} tono={TONO_VIAJE[l.estado] ?? 'neutro'} etiqueta={estadoTexto(l.estado)} />;
  };
  const acciones = (v: Trip): AccionFila[] => [
    { id: 'ver', etiqueta: t('ver'), icono: Eye, onSelect: () => ver(v) },
    { id: 'novedad', etiqueta: t('reportarNovedad'), icono: TriangleAlert, onSelect: () => onReportarNovedad?.(v), oculta: !onReportarNovedad },
  ];

  const columnas: ColumnaTabla<Trip>[] = [
    { id: 'fecha', encabezado: t('columnas.fecha'), celda: (v) => <span className="tabular-nums text-fg">{formatPlain(v.trip_date)}</span> },
    { id: 'viaje', encabezado: t('columnas.viaje'), celda: (v) => dosLineas(`${v.trip_code} · ${ruta(v)}`, v.scheduled_departure ? formatTime(v.scheduled_departure) : null) },
    { id: 'otro', encabezado: t(`columnas.${otro.columna}`), ocultarDebajo: 'md', celda: (v) => <span className="text-fg">{otro.nombre(v) ?? '—'}</span> },
    { id: 'pasajeros', encabezado: t('columnas.pasajeros'), ocultarDebajo: 'lg', celda: (v) => <span className="tabular-nums text-fg">{pasajeros(v)}</span> },
    { id: 'llegada', encabezado: t('columnas.llegada'), celda: llegada },
  ];

  return (
    <Tarjeta
      titulo={t('titulo')}
      descripcion={descripcion}
      icono={History}
      accion={onVerTodos && limite && viajes.length > limite ? <BotonVerTodos n={viajes.length} onClick={onVerTodos} /> : undefined}
    >
      <DataTable
        etiqueta={t('titulo')}
        densidad="compacta"
        columnas={columnas}
        filas={filas}
        obtenerId={(v) => v.id}
        estado={estadoTabla(carga, viajes.length)}
        onFilaClick={ver}
        etiquetaFila={(v) => v.trip_code}
        acciones={acciones}
        tarjetaMovil={(v) => (
          <ListCard
            icono={History}
            titulo={`${v.trip_code} · ${ruta(v)}`}
            subtitulo={[formatPlain(v.trip_date), v.scheduled_departure ? formatTime(v.scheduled_departure) : null, otro.nombre(v)].filter(Boolean).join(' · ')}
            meta={pasajeros(v) !== '—' ? pasajeros(v) : undefined}
            estado={llegada(v)}
            acciones={acciones(v)}
            onClick={() => ver(v)}
          />
        )}
        vacio={{ icono: History, titulo: t('vacio.titulo'), descripcion: vacioDescripcion ?? t('vacio.descripcion') }}
        error={{ titulo: tc('errorCarga') }}
        onReintentar={onReintentar}
      />
    </Tarjeta>
  );
}

// ── Envíos ─────────────────────────────────────────────────────────────────

export interface TarjetaEnviosProps {
  envios: readonly EnvioFicha[];
  total: number;
  descripcion: string;
  carga: EstadoCarga;
  limite?: number;
  onVerTodos?: () => void;
  onReintentar: () => void;
}

export function TarjetaEnviosFicha({ envios, total, descripcion, carga, limite, onVerTodos, onReintentar }: TarjetaEnviosProps) {
  const t = useTranslations('catalogoComun.comun.ficha.envios');
  const tc = useTranslations('catalogoComun.comun.ficha');
  const tEstados = useTranslations('logistica.misEnvios.estados');
  const router = useRouter();
  const entero = useFormatoEntero();
  const { formatDate } = useFormatDate();
  const filas = limite ? envios.slice(0, limite) : envios;

  const estadoTexto = (s: string) => (tEstados.has(s) ? tEstados(s) : s);
  const ver = (e: EnvioFicha) => router.push(rutaEnvio(e.id));
  const destino = (e: EnvioFicha) => [e.delivery_address, e.delivery_city].filter(Boolean).join(', ') || '—';
  const badge = (e: EnvioFicha) => <StatusBadge estado={e.status} tono={TONO_ENVIO[e.status] ?? 'neutro'} etiqueta={estadoTexto(e.status)} />;
  const acciones = (e: EnvioFicha): AccionFila[] => [{ id: 'ver', etiqueta: t('ver'), icono: Eye, onSelect: () => ver(e) }];

  const columnas: ColumnaTabla<EnvioFicha>[] = [
    // `created_at` y `delivered_at` son timestamptz: pasan por la zona de la organización.
    { id: 'fecha', encabezado: t('columnas.fecha'), celda: (e) => <span className="tabular-nums text-fg">{formatDate(e.delivered_at ?? e.created_at)}</span> },
    { id: 'envio', encabezado: t('columnas.envio'), celda: (e) => dosLineas(e.shipment_number || t('sinNumero'), e.delivery_contact_name) },
    { id: 'destino', encabezado: t('columnas.destino'), ocultarDebajo: 'md', celda: (e) => <span className="truncate text-fg">{destino(e)}</span> },
    { id: 'estado', encabezado: t('columnas.estado'), celda: badge },
  ];

  return (
    <Tarjeta
      titulo={t('titulo')}
      descripcion={[descripcion, total > 0 ? t('total', { count: total }) : null].filter(Boolean).join(' · ')}
      icono={Package}
      accion={onVerTodos && limite && envios.length > limite ? <BotonVerTodos n={Math.min(total, envios.length)} onClick={onVerTodos} /> : undefined}
    >
      <DataTable
        etiqueta={t('titulo')}
        densidad="compacta"
        columnas={columnas}
        filas={filas}
        obtenerId={(e) => e.id}
        estado={estadoTabla(carga, envios.length)}
        onFilaClick={ver}
        etiquetaFila={(e) => e.shipment_number || e.id}
        acciones={acciones}
        tarjetaMovil={(e) => (
          <ListCard
            icono={Package}
            titulo={e.shipment_number || t('sinNumero')}
            subtitulo={destino(e)}
            meta={formatDate(e.delivered_at ?? e.created_at)}
            estado={badge(e)}
            acciones={acciones(e)}
            onClick={() => ver(e)}
          />
        )}
        vacio={{ icono: Package, titulo: t('vacio.titulo'), descripcion: t('vacio.descripcion') }}
        error={{ titulo: tc('errorCarga') }}
        onReintentar={onReintentar}
      />
      {total > envios.length && !limite && <p className="pt-2 text-xs text-fg-muted">{tc('viajes.ultimos', { n: entero(envios.length) })}</p>}
    </Tarjeta>
  );
}

// ── Novedades ──────────────────────────────────────────────────────────────

export interface TarjetaNovedadesProps {
  novedades: readonly NovedadFicha[];
  descripcion: string;
  /** Contexto de la novedad: el viaje o el envío al que pertenece. */
  referencia: (n: NovedadFicha) => string | null;
  carga: EstadoCarga;
  limite?: number;
  onVerTodos?: () => void;
  onReintentar: () => void;
}

export function TarjetaNovedadesFicha({ novedades, descripcion, referencia, carga, limite, onVerTodos, onReintentar }: TarjetaNovedadesProps) {
  const t = useTranslations('catalogoComun.comun.ficha.novedades');
  const tc = useTranslations('catalogoComun.comun.ficha');
  const router = useRouter();
  const moneda = useMonedaOrganizacion();
  const { formatDate } = useFormatDate();
  const filas = limite ? novedades.slice(0, limite) : novedades;

  const estadoTexto = (s: string) => (t.has(`estados.${s}`) ? t(`estados.${s}`) : s);
  const tipoTexto = (s: string) => (t.has(`tipos.${s}`) ? t(`tipos.${s}`) : s);
  const ver = (n: NovedadFicha) => router.push(`/app/transporte/incidentes/${encodeURIComponent(n.id)}`);
  const costo = (n: NovedadFicha) => {
    const v = costoNovedad(n);
    return v === null ? '—' : formatMoneda(v, moneda.paraDocumento(n.currency));
  };
  const fecha = (n: NovedadFicha) => (n.occurred_at ?? n.reported_at ? formatDate(n.occurred_at ?? n.reported_at) : '—');
  const badge = (n: NovedadFicha) => <StatusBadge estado={n.status} tono={TONO_NOVEDAD[n.status] ?? 'neutro'} etiqueta={estadoTexto(n.status)} />;
  const detalle = (n: NovedadFicha) => [tipoTexto(n.incident_type), referencia(n)].filter(Boolean).join(' · ');
  const acciones = (n: NovedadFicha): AccionFila[] => [{ id: 'ver', etiqueta: t('ver'), icono: Eye, onSelect: () => ver(n) }];

  const columnas: ColumnaTabla<NovedadFicha>[] = [
    { id: 'fecha', encabezado: t('columnas.fecha'), celda: (n) => <span className="tabular-nums text-fg">{fecha(n)}</span> },
    { id: 'novedad', encabezado: t('columnas.novedad'), celda: (n) => dosLineas(n.title, detalle(n)) },
    { id: 'costo', encabezado: t('columnas.costo'), variante: 'importe', ocultarDebajo: 'md', celda: (n) => costo(n) },
    { id: 'estado', encabezado: t('columnas.estado'), celda: badge },
  ];

  return (
    <Tarjeta
      titulo={t('titulo')}
      descripcion={descripcion}
      icono={TriangleAlert}
      accion={onVerTodos && limite && novedades.length > limite ? <BotonVerTodos n={novedades.length} onClick={onVerTodos} /> : undefined}
    >
      <DataTable
        etiqueta={t('titulo')}
        densidad="compacta"
        columnas={columnas}
        filas={filas}
        obtenerId={(n) => n.id}
        estado={estadoTabla(carga, novedades.length)}
        onFilaClick={ver}
        etiquetaFila={(n) => n.title}
        acciones={acciones}
        tarjetaMovil={(n) => (
          <ListCard icono={TriangleAlert} titulo={n.title} subtitulo={detalle(n)} meta={fecha(n)} estado={badge(n)} acciones={acciones(n)} onClick={() => ver(n)} />
        )}
        vacio={{ icono: TriangleAlert, titulo: t('vacio.titulo'), descripcion: t('vacio.descripcion') }}
        error={{ titulo: tc('errorCarga') }}
        onReintentar={onReintentar}
      />
    </Tarjeta>
  );
}
