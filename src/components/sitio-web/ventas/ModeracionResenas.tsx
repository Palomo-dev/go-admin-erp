'use client';

/**
 * Tienda › Reseñas: moderación de las opiniones de producto con el kit (Figma «16 Sitio web»
 * 3123-88477: 4A computador, 4B opinión abierta, 4C/4D celular). Reemplaza en el módulo al
 * `ReviewsModerationPanel` heredado, que no se borra: lo decide el integrador.
 *
 * - Tarjetas: por revisar, publicadas, promedio publicado (solo clientes) y con compra verificada.
 * - Filtro Pendientes / Publicadas / Ocultas / Todas (en la BD: pending / approved / rejected).
 * - Fila: autor con «Compra verificada», título, texto, fotos y «Llegó por»; Publicar, Responder y
 *   Ocultar a un clic. «Publicar las N» publica las pendientes de la página.
 * - Hoja de la opinión: producto y pedido, estrellas, fotos con «Ocultar foto», correo (no se
 *   publica), «Responder como <tienda>», «Destacar esta opinión» y «Publicar y responder».
 * - Lee y escribe por `/api/sitio-web/tienda/resenas` (permiso `website.sites.edit` en el
 *   servidor); sin permiso, solo lectura.
 * - Fechas con `useFormatDate` (zona de la organización).
 * Textos nuevos: `sitioWeb.resenas.moderacion.*` (es/en/fr/pt); los de la tabla siguen en ventas.
 */
import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { BadgeCheck, Check, EyeOff, Image as IconoImagen, MessageSquare, Pin, Star } from 'lucide-react';
import {
  DataTable,
  KpiStrip,
  ListCard,
  PaginationCompact,
  PanelAdaptable,
  SegmentedControl,
  StatCard,
  StatusBadge,
  clasesBoton,
  type AccionFila,
  type ColumnaTabla,
} from '@/components/kit';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/components/ui/use-toast';
import { useFormatDate } from '@/lib/context/OrganizationTimezoneContext';
import type { AccionResena, ResenaTienda } from '@/lib/website/tiendaSitio.server';
import type { EstadoResena } from '@/lib/services/website/resenasProducto';
import { cn } from '@/utils/Utils';
import { CLASE_TAMANO_ICONO, TRAZO_ICONO } from '../ui/iconosSitio';
import { ICONO_ACCION_RESENA, ICONO_ESTADO_RESENA } from './iconosVentas';
import type { TraductorVentas } from './textos';
import { useResenasTienda, type FiltroResenas } from './useTiendaSitio';

const FILTROS: readonly FiltroResenas[] = ['pending', 'approved', 'rejected', 'all'];
const CANALES = ['ficha', 'correo', 'pedido', 'cuenta'] as const;

/**
 * Estado de la BD → clave de `estadoTono` (el tono lo da el kit, no la página):
 * pendiente ámbar, publicada verde y oculta roja.
 */
const ESTADO_KIT: Record<EstadoResena, string> = { pending: 'pendiente', approved: 'aceptada', rejected: 'rechazada' };

type TraductorResenas = ReturnType<typeof useTranslations>;

export function BadgeResena({ estado, t }: { estado: EstadoResena; t: TraductorVentas }) {
  const tr = useTranslations('sitioWeb.resenas');
  return <StatusBadge estado={ESTADO_KIT[estado]} etiqueta={tr.has(`moderacion.estados.${estado}`) ? tr(`moderacion.estados.${estado}`) : t(`tienda.resenas.estados.${estado}`)} icono={ICONO_ESTADO_RESENA[estado]} tamano="sm" />;
}

/** «★ 4/5»: icono + número (el color nunca va solo) y nombre accesible completo. */
export function Calificacion({ valor, t }: { valor: number; t: TraductorVentas }) {
  const Estrella = ICONO_ACCION_RESENA.calificacion;
  return (
    <span className="inline-flex items-center gap-1 tabular-nums text-[13px] font-medium text-fg" aria-label={t('tienda.resenas.calificacion', { n: valor })} role="img">
      <Estrella aria-hidden="true" className={cn(CLASE_TAMANO_ICONO.base, 'fill-warning text-warning-text')} strokeWidth={TRAZO_ICONO} />
      {valor}/5
    </span>
  );
}

function llegoPor(r: ResenaTienda, tr: TraductorResenas): string | null {
  const c = r.llegoPor;
  if (!c || !(CANALES as readonly string[]).includes(c)) return null;
  return tr('moderacion.llegoPor', { canal: tr(`moderacion.canales.${c}`) });
}

export function ModeracionResenas({
  t,
  puedeEditar,
  pendientes,
  alCambiar,
  nombreTienda,
}: {
  t: TraductorVentas;
  puedeEditar: boolean;
  pendientes: number;
  alCambiar: () => void;
  /** «Responder como <tienda>»; sin él, «Responder como la tienda». */
  nombreTienda?: string | null;
}) {
  const tr = useTranslations('sitioWeb.resenas');
  const { toast } = useToast();
  const { formatDate } = useFormatDate();
  const [filtro, setFiltro] = useState<FiltroResenas>('pending');
  const [pagina, setPagina] = useState(1);
  const { datos, cargando, fallo, recargar, moderar } = useResenasTienda(filtro, pagina, alCambiar);
  const [abierta, setAbierta] = useState<ResenaTienda | null>(null);
  const [respuesta, setRespuesta] = useState('');
  const [ocupado, setOcupado] = useState<string | null>(null);
  const editable = puedeEditar && (datos?.puedeEditar ?? true);

  const AVISO: Partial<Record<AccionResena, string>> = {
    aprobar: 'moderacion.publicada',
    publicar: 'moderacion.publicada',
    rechazar: 'moderacion.oculta',
    responder: 'moderacion.respondida',
    destacar: 'moderacion.destacadaOk',
    quitarDestacada: 'moderacion.quitadaDestacada',
    ocultarFoto: 'moderacion.fotoOcultada',
    mostrarFoto: 'moderacion.fotoMostrada',
  };

  const ejecutar = async (r: ResenaTienda, accion: AccionResena, texto?: string, foto?: string, silencio = false) => {
    setOcupado(r.id);
    try {
      if (foto !== undefined) await moderar(r.id, accion, texto, foto);
      else await moderar(r.id, accion, texto);
      if (!silencio) toast({ title: tr(AVISO[accion] ?? 'moderacion.publicada') });
      return true;
    } catch (error) {
      toast({ title: t('tienda.resenas.errorAccion', { mensaje: (error as Error).message }), variant: 'destructive' });
      return false;
    } finally {
      setOcupado(null);
    }
  };

  const abrir = (r: ResenaTienda) => {
    setAbierta(r);
    setRespuesta(r.respuesta ?? '');
  };

  const publicarTodas = async () => {
    const lista = (datos?.resenas ?? []).filter((r) => r.estado === 'pending');
    for (const r of lista) {
      if (!(await ejecutar(r, 'aprobar', undefined, undefined, true))) return;
    }
    if (lista.length > 0) toast({ title: tr('moderacion.publicada') });
  };

  const acciones = (r: ResenaTienda): AccionFila[] =>
    editable
      ? [
          ...(r.estado !== 'approved' ? [{ id: 'aprobar', etiqueta: tr('moderacion.publicar'), icono: ICONO_ACCION_RESENA.aprobar, onSelect: () => void ejecutar(r, 'aprobar') }] : []),
          { id: 'responder', etiqueta: tr(r.respuesta ? 'moderacion.editarRespuesta' : 'moderacion.responder'), icono: ICONO_ACCION_RESENA.responder, onSelect: () => abrir(r) },
          r.destacada
            ? { id: 'quitarDestacada', etiqueta: tr('moderacion.quitarDestacada'), icono: Pin, onSelect: () => void ejecutar(r, 'quitarDestacada') }
            : { id: 'destacar', etiqueta: tr('moderacion.destacar'), icono: Pin, onSelect: () => void ejecutar(r, 'destacar') },
          ...(r.estado !== 'rejected'
            ? [{ id: 'rechazar', etiqueta: tr('moderacion.ocultar'), icono: EyeOff, onSelect: () => void ejecutar(r, 'rechazar'), separadorAntes: true }]
            : []),
        ]
      : [];

  /** Publicar a un clic (con texto); responder y ocultar con icono. No destructivos: se revierten. */
  const accionesRapidas = (r: ResenaTienda) =>
    editable && r.estado === 'pending' ? (
      <span className="flex items-center gap-1">
        <button type="button" disabled={ocupado === r.id} onClick={() => void ejecutar(r, 'aprobar')} className={clasesBoton({ variante: 'secundario', tamano: 'sm' })}>
          <Check aria-hidden="true" className={cn(CLASE_TAMANO_ICONO.base, 'text-success-text')} strokeWidth={TRAZO_ICONO} />
          {tr('moderacion.publicar')}
        </button>
        <button type="button" disabled={ocupado === r.id} onClick={() => abrir(r)} aria-label={tr('moderacion.responder')} title={tr('moderacion.responder')} className={cn(clasesBoton({ variante: 'secundario', tamano: 'sm' }), 'w-8 px-0')}>
          <MessageSquare aria-hidden="true" className={CLASE_TAMANO_ICONO.base} strokeWidth={TRAZO_ICONO} />
        </button>
        <button type="button" disabled={ocupado === r.id} onClick={() => void ejecutar(r, 'rechazar')} aria-label={tr('moderacion.ocultar')} title={tr('moderacion.ocultar')} className={cn(clasesBoton({ variante: 'secundario', tamano: 'sm' }), 'w-8 px-0')}>
          <EyeOff aria-hidden="true" className={CLASE_TAMANO_ICONO.base} strokeWidth={TRAZO_ICONO} />
        </button>
      </span>
    ) : null;

  const textoResena = (r: ResenaTienda) => (
    <div className="min-w-0">
      <p className="flex flex-wrap items-center gap-1.5 text-sm font-medium text-fg">
        <span className="truncate">{r.autor}</span>
        {r.compraVerificada && (
          <span className="inline-flex items-center gap-1 rounded-full bg-success-subtle px-1.5 py-px text-[11px] font-medium text-success-text">
            <BadgeCheck aria-hidden="true" className="size-3" strokeWidth={TRAZO_ICONO} />
            {t('tienda.resenas.compraVerificada')}
          </span>
        )}
        {r.destacada && (
          <span className="inline-flex items-center gap-1 rounded-full bg-subtle px-1.5 py-px text-[11px] font-medium text-fg-secondary">
            <Pin aria-hidden="true" className="size-3" strokeWidth={TRAZO_ICONO} />
            {tr('moderacion.destacada')}
          </span>
        )}
      </p>
      {r.titulo && <p className="truncate text-[13px] font-medium text-fg">{r.titulo}</p>}
      <p className={cn('line-clamp-2 text-[13px]', r.texto ? 'text-fg-secondary' : 'text-fg-muted')}>{r.texto || tr('moderacion.sinTexto')}</p>
      {(r.imagenes?.length ?? 0) > 0 && (
        <span className="mt-1 flex gap-1">
          {r.imagenes!.slice(0, 3).map((src, i) => (
            // eslint-disable-next-line @next/next/no-img-element -- fotos subidas por clientes (storage público)
            <img key={src} src={src} alt={tr('moderacion.foto', { n: i + 1, autor: r.autor })} className="size-10 rounded-md border border-line object-cover" />
          ))}
        </span>
      )}
      {r.respuesta && (
        <p className="mt-1 flex items-start gap-1 text-xs text-fg-secondary">
          <ICONO_ACCION_RESENA.responder aria-hidden="true" className={cn(CLASE_TAMANO_ICONO.meta, 'mt-0.5 shrink-0')} strokeWidth={TRAZO_ICONO} />
          <span className="line-clamp-1">{r.respuesta}</span>
        </p>
      )}
      {llegoPor(r, tr) && <p className="mt-1 text-[11px] text-fg-muted">{llegoPor(r, tr)}</p>}
    </div>
  );

  const columnas: ColumnaTabla<ResenaTienda>[] = [
    { id: 'resena', encabezado: t('tienda.resenas.columnas.resena'), celda: textoResena },
    { id: 'producto', encabezado: t('tienda.resenas.columnas.producto'), ocultarDebajo: 'xl', celda: (r) => <span className="text-[13px] text-fg">{r.producto?.nombre ?? '—'}</span> },
    { id: 'calificacion', encabezado: t('tienda.resenas.columnas.calificacion'), ancho: 110, celda: (r) => <Calificacion valor={r.calificacion} t={t} /> },
    { id: 'fecha', encabezado: t('tienda.resenas.columnas.fecha'), ancho: 120, celda: (r) => <span className="tabular-nums text-[13px] text-fg-secondary">{formatDate(r.creadaEn)}</span> },
    { id: 'estado', encabezado: t('tienda.resenas.columnas.estado'), ancho: 140, celda: (r) => <BadgeResena estado={r.estado} t={t} /> },
  ];

  const estadoTabla = cargando ? 'cargando' : fallo === 'sin_permiso' ? 'sinPermiso' : fallo ? 'error' : 'listo';
  const resumen = datos?.resumen;
  const pendientesPagina = (datos?.resenas ?? []).filter((r) => r.estado === 'pending').length;
  const responderComo = nombreTienda ? tr('moderacion.responderComo', { tienda: nombreTienda }) : tr('moderacion.responderComoTienda');
  const respuestaCambio = !!abierta && respuesta.trim() !== (abierta.respuesta ?? '').trim();

  return (
    <div className="flex flex-col gap-4">
      {resumen && (
        <KpiStrip columnas={4} etiqueta={tr('moderacion.kpis.etiqueta')}>
          <StatCard
            etiqueta={tr('moderacion.kpis.porRevisar')}
            valor={resumen.porRevisar}
            detalle={resumen.pendienteMasVieja ? tr('moderacion.kpis.masVieja', { fecha: formatDate(resumen.pendienteMasVieja) }) : undefined}
            icono={ICONO_ESTADO_RESENA.pending}
            tono={resumen.porRevisar > 0 ? 'advertencia' : 'neutro'}
          />
          <StatCard etiqueta={tr('moderacion.kpis.publicadas')} valor={resumen.publicadas} detalle={tr('moderacion.kpis.mes', { n: resumen.publicadasMes })} icono={ICONO_ESTADO_RESENA.approved} />
          <StatCard
            etiqueta={tr('moderacion.kpis.promedio')}
            valor={resumen.publicadas > 0 ? resumen.promedio.toLocaleString('es-CO', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) : '—'}
            detalle={tr('moderacion.kpis.soloClientes')}
            icono={Star}
          />
          <StatCard
            etiqueta={tr('moderacion.kpis.verificadas')}
            valor={resumen.publicadas > 0 ? `${Math.round((resumen.verificadas / resumen.publicadas) * 100)} %` : '—'}
            detalle={tr('moderacion.kpis.deTotal', { n: resumen.verificadas, total: resumen.publicadas })}
            icono={BadgeCheck}
          />
        </KpiStrip>
      )}
      <SegmentedControl
        etiqueta={t('tienda.resenas.filtroEstado')}
        opciones={FILTROS.map((f) => ({
          valor: f,
          etiqueta: tr(`moderacion.filtros.${f}`),
          icono: f === 'all' ? undefined : f === 'rejected' ? EyeOff : ICONO_ESTADO_RESENA[f],
          contador: f === 'pending' && pendientes > 0 ? pendientes : undefined,
        }))}
        valor={filtro}
        onValorChange={(v) => {
          setFiltro(v);
          setPagina(1);
        }}
        tamano="sm"
      />
      {!editable && <p className="text-xs text-fg-secondary">{t('tienda.resenas.soloLectura')}</p>}
      <DataTable
        etiqueta={t('tienda.resenas.etiqueta')}
        columnas={columnas}
        filas={datos?.resenas ?? []}
        obtenerId={(r) => r.id}
        estado={estadoTabla}
        onReintentar={() => void recargar()}
        onFilaClick={abrir}
        etiquetaFila={(r) => tr('moderacion.detalle', { autor: r.autor })}
        acciones={acciones}
        accionesRapidas={accionesRapidas}
        vacio={{ titulo: tr(`moderacion.vacio.${filtro}`), icono: ICONO_ACCION_RESENA.calificacion }}
        error={{ titulo: t('tienda.resenas.errorCarga') }}
        tarjetaMovil={(r) => (
          <ListCard
            inicio="icono"
            icono={ICONO_ACCION_RESENA.calificacion}
            titulo={r.autor}
            subtitulo={r.texto || r.titulo || tr('moderacion.sinTexto')}
            datos={[
              r.producto && { icono: ICONO_ACCION_RESENA.calificacion, etiqueta: t('tienda.resenas.columnas.producto'), texto: r.producto.nombre },
              !!r.respuesta && { icono: ICONO_ACCION_RESENA.responder, etiqueta: t('tienda.resenas.respuesta'), texto: r.respuesta },
              (r.imagenes?.length ?? 0) > 0 && { icono: IconoImagen, etiqueta: tr('moderacion.foto', { n: r.imagenes!.length, autor: r.autor }), texto: String(r.imagenes!.length) },
            ]}
            meta={formatDate(r.creadaEn)}
            valor={<Calificacion valor={r.calificacion} t={t} />}
            estado={<BadgeResena estado={r.estado} t={t} />}
            onClick={() => abrir(r)}
            acciones={acciones(r)}
          />
        )}
        pie={
          datos && datos.total > datos.tamano ? (
            <PaginationCompact pagina={datos.pagina} tamano={datos.tamano} total={datos.total} onPaginaChange={setPagina} cargando={cargando} />
          ) : undefined
        }
      />
      {editable && filtro === 'pending' && pendientesPagina > 1 && (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-[13px] text-fg-secondary">{tr('moderacion.pieTodas', { n: pendientesPagina })}</p>
          <button type="button" disabled={ocupado !== null} onClick={() => void publicarTodas()} className={clasesBoton({ variante: 'secundario', tamano: 'md' })}>
            <Check aria-hidden="true" className={cn(CLASE_TAMANO_ICONO.base, 'text-success-text')} strokeWidth={TRAZO_ICONO} />
            {tr('moderacion.publicarTodas', { n: pendientesPagina })}
          </button>
        </div>
      )}

      <PanelAdaptable
        abierto={abierta !== null}
        onAbiertoChange={(v) => !v && setAbierta(null)}
        titulo={abierta ? tr('moderacion.detalle', { autor: abierta.autor }) : ''}
        descripcion={abierta?.producto?.nombre}
        icono={ICONO_ACCION_RESENA.calificacion}
        ocupado={!!abierta && ocupado === abierta.id}
        pie={
          abierta && editable ? (
            <>
              {abierta.estado !== 'rejected' && (
                <button
                  type="button"
                  disabled={ocupado === abierta.id}
                  onClick={async () => (await ejecutar(abierta, 'rechazar')) && setAbierta(null)}
                  className={clasesBoton({ variante: 'secundario', tamano: 'md' })}
                >
                  <EyeOff aria-hidden="true" className={CLASE_TAMANO_ICONO.base} strokeWidth={TRAZO_ICONO} />
                  {tr('moderacion.ocultar')}
                </button>
              )}
              {abierta.estado !== 'approved' ? (
                <button
                  type="button"
                  disabled={ocupado === abierta.id}
                  onClick={async () => (await ejecutar(abierta, 'publicar', respuestaCambio ? respuesta : undefined)) && setAbierta(null)}
                  className={clasesBoton({ variante: 'primario', tamano: 'md' })}
                >
                  <Check aria-hidden="true" className={CLASE_TAMANO_ICONO.base} strokeWidth={TRAZO_ICONO} />
                  {respuestaCambio ? tr('moderacion.publicarYResponder') : tr('moderacion.publicar')}
                </button>
              ) : (
                <button
                  type="button"
                  disabled={ocupado === abierta.id || !respuestaCambio}
                  onClick={async () => (await ejecutar(abierta, 'responder', respuesta)) && setAbierta(null)}
                  className={clasesBoton({ variante: 'primario', tamano: 'md' })}
                >
                  <ICONO_ACCION_RESENA.responder aria-hidden="true" className={CLASE_TAMANO_ICONO.base} strokeWidth={TRAZO_ICONO} />
                  {tr('moderacion.guardarRespuesta')}
                </button>
              )}
            </>
          ) : undefined
        }
      >
        {abierta && (
          <div className="flex flex-col gap-4">
            <div className="flex flex-wrap items-center gap-2">
              <BadgeResena estado={abierta.estado} t={t} />
              {abierta.compraVerificada && <StatusBadge estado="verificado" etiqueta={t('tienda.resenas.compraVerificada')} icono={BadgeCheck} tamano="sm" />}
            </div>
            {abierta.pedido && (
              <p className="rounded-lg border border-line bg-canvas px-3 py-2 text-[13px] text-fg-secondary">
                {[tr('moderacion.pedido', { numero: abierta.pedido.numero }), abierta.pedido.entregadoEn ? tr('moderacion.entregado', { fecha: formatDate(abierta.pedido.entregadoEn) }) : null].filter(Boolean).join(' · ')}
              </p>
            )}
            <div className="flex flex-wrap items-center gap-2 text-xs text-fg-secondary">
              <Calificacion valor={abierta.calificacion} t={t} />
              {[abierta.ciudad, formatDate(abierta.creadaEn)].filter(Boolean).join(' · ')}
            </div>
            <div>
              {abierta.titulo && <p className="text-sm font-semibold text-fg">{abierta.titulo}</p>}
              <p className={cn('whitespace-pre-line text-[13px]', abierta.texto ? 'text-fg-secondary' : 'text-fg-muted')}>{abierta.texto || tr('moderacion.sinTexto')}</p>
            </div>
            {((abierta.imagenes?.length ?? 0) > 0 || (abierta.imagenesOcultas?.length ?? 0) > 0) && (
              <div className="flex flex-wrap gap-3">
                {[...(abierta.imagenes ?? []).map((src) => ({ src, oculta: false })), ...(abierta.imagenesOcultas ?? []).map((src) => ({ src, oculta: true }))].map((f, i) => (
                  <div key={f.src} className="flex w-24 flex-col items-center gap-1">
                    {/* eslint-disable-next-line @next/next/no-img-element -- fotos subidas por clientes (storage público) */}
                    <img src={f.src} alt={tr('moderacion.foto', { n: i + 1, autor: abierta.autor })} className={cn('size-24 rounded-lg border border-line object-cover', f.oculta && 'opacity-40')} />
                    {f.oculta && <span className="text-center text-[11px] text-fg-muted">{tr('moderacion.fotoOculta')}</span>}
                    {editable && (
                      <button
                        type="button"
                        disabled={ocupado === abierta.id}
                        onClick={async () => {
                          if (await ejecutar(abierta, f.oculta ? 'mostrarFoto' : 'ocultarFoto', undefined, f.src)) {
                            setAbierta({
                              ...abierta,
                              imagenes: f.oculta ? [...(abierta.imagenes ?? []), f.src] : (abierta.imagenes ?? []).filter((u) => u !== f.src),
                              imagenesOcultas: f.oculta ? (abierta.imagenesOcultas ?? []).filter((u) => u !== f.src) : [...(abierta.imagenesOcultas ?? []), f.src],
                            });
                          }
                        }}
                        className="text-[12px] font-medium text-fg-secondary underline-offset-2 hover:underline"
                      >
                        {f.oculta ? tr('moderacion.mostrarFoto') : tr('moderacion.ocultarFoto')}
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
            {(abierta.correo || llegoPor(abierta, tr)) && (
              <p className="rounded-lg bg-subtle px-3 py-2 text-xs text-fg-secondary">
                {[abierta.correo ? tr('moderacion.correo', { correo: abierta.correo }) : null, llegoPor(abierta, tr)].filter(Boolean).join(' · ')}
              </p>
            )}
            <label className="flex flex-col gap-1.5 border-t border-line pt-4">
              <span className="flex items-center gap-2 text-[13px] font-medium text-fg">
                <ICONO_ACCION_RESENA.responder aria-hidden="true" className={cn(CLASE_TAMANO_ICONO.base, 'text-fg-secondary')} strokeWidth={TRAZO_ICONO} />
                {responderComo}
              </span>
              <Textarea
                value={respuesta}
                onChange={(e) => setRespuesta(e.target.value)}
                disabled={!editable}
                maxLength={1000}
                rows={4}
                placeholder={tr('moderacion.respuestaPlaceholder')}
                className="rounded-lg"
              />
              <span className="text-xs text-fg-secondary">{tr('moderacion.respuestaAyuda')}</span>
            </label>
            <div className="flex items-start justify-between gap-3">
              <div className="flex min-w-0 flex-col gap-0.5">
                <label htmlFor={`destacar-${abierta.id}`} className="flex items-center gap-1.5 text-[13px] font-medium text-fg">
                  <Pin aria-hidden="true" className={cn(CLASE_TAMANO_ICONO.base, 'text-fg-secondary')} strokeWidth={TRAZO_ICONO} />
                  {tr('moderacion.destacar')}
                </label>
                <span className="text-xs text-fg-secondary">{tr('moderacion.destacarAyuda')}</span>
              </div>
              <Switch
                id={`destacar-${abierta.id}`}
                checked={!!abierta.destacada}
                disabled={!editable || ocupado === abierta.id}
                onCheckedChange={async (v) => {
                  if (await ejecutar(abierta, v ? 'destacar' : 'quitarDestacada')) setAbierta({ ...abierta, destacada: v });
                }}
              />
            </div>
          </div>
        )}
      </PanelAdaptable>
    </div>
  );
}
