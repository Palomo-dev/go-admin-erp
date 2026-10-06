'use client';

/**
 * «Carta» (Figma B/13-01 escritorio, 13-04 móvil 390, 13-06 estados; notas
 * 13-07 y 13-08): la lista de cartas con su horario por día, sedes, categorías
 * y productos, PDF y «Visible ahora» / «Fuera de horario»; el banner «Ahora tus
 * clientes ven…» y la vista previa lateral. Ordenar arrastrando decide el orden
 * de las pestañas cuando dos cartas coinciden.
 *
 * Solo para restaurantes (organization_module_pages oculta la entrada del menú;
 * si se entra por URL, se explica). La vigencia sale de `get_public_menu` en el
 * servidor; aquí no se calcula.
 */
import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Box, Clock, Copy, Eye, MapPin, Pencil, Plus, QrCode, RefreshCw, Trash2, Upload, ExternalLink } from 'lucide-react';
import {
  AvisoTonal,
  ConfirmDialog,
  EmptyState,
  ListCard,
  RowActionsMenu,
  StatusBadge,
  clasesBoton,
  useArrastreArbol,
  useEsEscritorio,
  type AccionFila,
} from '@/components/kit';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/components/ui/use-toast';
import { cn } from '@/utils/Utils';
import { partesBanner, type CartaResumen, type RespuestaCartas, type SedeCarta } from '@/lib/website/carta';
import { MarcoSitioWeb } from '../../MarcoSitioWeb';
import { CajaIcono } from '../../ui/CajaIcono';
import { RAIZ_SITIO_WEB } from '../../rutasSitioWeb';
import { useTextosConfiguracion, type TraductorConfiguracion } from '../textos';
import { CartaPublicaVista } from './CartaPublicaVista';
import { DialogoNuevaCarta } from './DialogoNuevaCarta';
import { conteoCategorias, conteoProductos, iconoCarta, momentoLocal, resumenHorario, resumenSedes } from './formatoCarta';
import { RUTA_CARTA, RUTA_CARTA_QR, rutaDetalleCarta, rutaVistaPreviaCarta } from './rutasCarta';
import { useCartas, useVistaPreviaCarta } from './useCarta';
import { moverConTeclado } from './teclado';
import { CLASE_TAMANO_ICONO, TRAZO_ICONO } from '../../ui/iconosSitio';
import { ICONO_ESTADO_CARTA } from '../iconosSecciones';

/** Esqueleto de B/13-06: dos filas con miniatura. */
export function EsqueletoCartas() {
  return (
    <div className="flex flex-col gap-3 rounded-xl border border-line bg-surface p-4" aria-busy="true">
      {[0, 1].map((i) => (
        <div key={i} className="flex items-center gap-3 rounded-lg border border-line p-3">
          <Skeleton className="size-10 rounded-lg" />
          <div className="flex flex-1 flex-col gap-2">
            <Skeleton className="h-3 w-1/2 rounded" />
            <Skeleton className="h-3 w-1/3 rounded" />
          </div>
          <Skeleton className="h-3 w-16 rounded" />
        </div>
      ))}
    </div>
  );
}

/** «Visible ahora» (verde) / «Fuera de horario» (neutro) / «Pausada». */
export function EstadoCarta({ t, carta }: { t: TraductorConfiguracion; carta: CartaResumen }) {
  if (!carta.activa) return <StatusBadge tamano="sm" estado="inactiva" icono={ICONO_ESTADO_CARTA.inactiva} etiqueta={t('carta.inactiva')} />;
  if (carta.vigenteEn === null) return null;
  return carta.vigenteEn.length > 0 ? (
    <StatusBadge tamano="sm" estado="visible ahora" icono={ICONO_ESTADO_CARTA.visible} etiqueta={t('carta.visibleAhora')} />
  ) : (
    <StatusBadge tamano="sm" estado="fuera de horario" icono={ICONO_ESTADO_CARTA.fueraDeHorario} etiqueta={t('carta.fueraHorario')} />
  );
}

interface TarjetaCartaProps {
  t: TraductorConfiguracion;
  carta: CartaResumen;
  sedes: SedeCarta[];
  acciones: AccionFila[];
  arrastre?: ReturnType<ReturnType<typeof useArrastreArbol>['nodo']>;
  onMover?: (direccion: -1 | 1) => void;
}

function TarjetaCarta({ t, carta, sedes, acciones, arrastre, onMover }: TarjetaCartaProps) {
  const Icono = iconoCarta(carta.icono);
  return (
    <div
      {...(arrastre?.props ?? {})}
      aria-keyshortcuts={onMover ? 'Alt+ArrowUp Alt+ArrowDown' : undefined}
      onKeyDown={(e) => onMover && moverConTeclado(e, onMover)}
      className={cn(
        'flex items-start gap-3 rounded-xl border border-line bg-surface p-4',
        arrastre?.esOrigen && 'opacity-50',
        arrastre?.esDestino && 'ring-2 ring-brand',
      )}
    >
      <CajaIcono icono={Icono} tamano="md" />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-[15px] font-semibold text-fg">{carta.nombre}</p>
          <EstadoCarta t={t} carta={carta} />
          {carta.pdfUrl && <Badge variant="outline">{t('carta.pdf')}</Badge>}
        </div>
        <p className="mt-1 flex items-start gap-1.5 text-[13px] leading-[18px] text-fg-secondary">
          <Clock aria-hidden="true" className={`mt-0.5 shrink-0 ${CLASE_TAMANO_ICONO.meta}`} strokeWidth={TRAZO_ICONO} />
          <span>{resumenHorario(t, carta.horario)}</span>
        </p>
        <p className="mt-0.5 flex items-start gap-1.5 text-[13px] leading-[18px] text-fg-secondary">
          <MapPin aria-hidden="true" className={`mt-0.5 shrink-0 ${CLASE_TAMANO_ICONO.meta}`} strokeWidth={TRAZO_ICONO} />
          <span>
            {[resumenSedes(t, carta.sedes, sedes), conteoCategorias(t, carta.categorias), conteoProductos(t, carta.productos)].join(' · ')}
          </span>
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-1">
        <Link href={rutaDetalleCarta(carta.id)} className={clasesBoton({ variante: 'secundario', tamano: 'sm' })}>
          {t('carta.editar')}
        </Link>
        <RowActionsMenu titulo={carta.nombre} acciones={acciones} />
      </div>
    </div>
  );
}

/** Vista previa lateral (B/13-01, columna derecha): la carta pública de la primera sede, ahora. */
function VistaPreviaLateral({ t, datos }: { t: TraductorConfiguracion; datos: RespuestaCartas }) {
  const sede = datos.sedes[0] ?? null;
  const vista = useVistaPreviaCarta({ sedeId: sede?.id ?? null, fecha: null, hora: null });
  const d = vista.datos;
  return (
    <aside aria-label={t('carta.vistaLateral.titulo')} className="flex flex-col gap-3 rounded-xl border border-line bg-surface p-4">
      <p className="truncate text-xs text-fg-muted">
        {[datos.host ? `${datos.host}/menu` : null, sede?.nombre].filter(Boolean).join(' · ')}
      </p>
      {vista.cargando ? (
        <div className="flex flex-col gap-2" aria-busy="true">
          <Skeleton className="h-6 w-2/3 rounded-full" />
          <Skeleton className="h-16 rounded-xl" />
          <Skeleton className="h-16 rounded-xl" />
        </div>
      ) : !d || !d.disponible ? (
        <p className="text-[13px] text-fg-secondary">{t('carta.vistaLateral.noDisponible')}</p>
      ) : d.cartas.length === 0 ? (
        <p className="text-[13px] text-fg-secondary">{t('carta.vistaLateral.sinCartas')}</p>
      ) : (
        <CartaPublicaVista t={t} cartas={d.cartas} moneda={d.moneda} compacto />
      )}
    </aside>
  );
}

export function PantallaCartas() {
  const t = useTextosConfiguracion();
  const c = useCartas();
  const router = useRouter();
  const { toast } = useToast();
  const esEscritorio = useEsEscritorio();
  const [nueva, setNueva] = useState(false);
  const [eliminar, setEliminar] = useState<CartaResumen | null>(null);
  const d = c.datos;
  const cartas = d?.cartas ?? [];
  const puedeOrdenar = !!d?.disponible && cartas.length > 1;

  const arrastre = useArrastreArbol({
    puedeSoltar: (origen, destino) => (destino === null || origen === destino ? t('carta.mover') : true),
    onSoltar: (origen, destino) => {
      if (destino === null) return;
      void c.mover(origen, destino).then((ok) => !ok && toast({ title: t('carta.errorOrden'), variant: 'destructive' }));
    },
    deshabilitado: !puedeOrdenar,
    ayuda: t('carta.mover'),
  });

  const crear = async (datos: Parameters<typeof c.crear>[0]) => {
    const id = await c.crear(datos);
    setNueva(false);
    if (!id) return toast({ title: d?.disponible ? t('carta.errorAccion') : t('carta.pendiente'), variant: 'destructive' });
    router.push(rutaDetalleCarta(id));
  };

  const duplicar = async (carta: CartaResumen) => {
    const nombre = t('carta.copia', { nombre: carta.nombre }).slice(0, 80);
    const id = await c.crear({ nombre, duplicarDe: carta.id, todasLasCategorias: false });
    toast(id ? { title: t('carta.duplicada', { nombre }) } : { title: t('carta.errorAccion'), variant: 'destructive' });
  };

  const accionesDe = (carta: CartaResumen): AccionFila[] => [
    { id: 'editar', etiqueta: t('carta.editar'), icono: Pencil, onSelect: () => router.push(rutaDetalleCarta(carta.id)) },
    { id: 'duplicar', etiqueta: t('carta.duplicar'), icono: Copy, onSelect: () => void duplicar(carta), oculta: carta.implicita || !d?.disponible },
    { id: 'ver', etiqueta: t('carta.verComoCliente'), icono: Eye, onSelect: () => router.push(rutaVistaPreviaCarta({ menu: carta.implicita ? null : carta.id })) },
    { id: 'eliminar', etiqueta: t('carta.eliminar'), icono: Trash2, destructiva: true, onSelect: () => setEliminar(carta), oculta: carta.implicita },
  ];

  const urlPublica = d?.host ? `https://${d.host}/menu` : null;
  const sinPermiso = c.fallo === 'sin_permiso' || (!!d && !d.permisos.editar);
  const noRestaurante = !!d && !d.esRestaurante;
  const bloqueada = sinPermiso || noRestaurante || !!c.fallo;

  const subtitulo = d
    ? cartas.length === 1
      ? t('carta.subtituloUna')
      : t('carta.subtitulo', { n: cartas.length })
    : undefined;

  const contenido = () => {
    if (sinPermiso) return <EmptyState variante="forbidden" titulo={t('carta.sinPermisoTitulo')} descripcion={t('carta.sinPermisoDescripcion')} />;
    if (c.fallo) {
      return <EmptyState variante="error" titulo={t('carta.errorTitulo')} descripcion={t('carta.errorDescripcion')} onReintentar={() => void c.recargar()} />;
    }
    if (!d) return null;
    if (noRestaurante) {
      return (
        <EmptyState
          variante="forbidden"
          titulo={t('carta.noRestauranteTitulo')}
          descripcion={t('carta.noRestauranteDescripcion')}
          accion={{ etiqueta: t('carta.irResumen'), href: RAIZ_SITIO_WEB }}
        />
      );
    }
    if (cartas.length === 0) {
      return (
        <EmptyState
          variante="empty"
          icono={Box}
          titulo={t('carta.vacioTitulo')}
          descripcion={t('carta.vacioDescripcion')}
          accion={{
            etiqueta: t('carta.vacioAccion'),
            icono: Upload,
            onClick: () => void crear({ nombre: t('carta.principal'), icono: 'principal', duplicarDe: null, todasLasCategorias: true }),
          }}
        />
      );
    }

    const partes = partesBanner(d.vigentes);
    const banner =
      d.disponible && d.ahora ? (
        <AvisoTonal
          tono={partes.length > 0 ? 'exito' : 'informacion'}
          icono={Clock}
          rol="status"
          titulo={
            partes.length > 0
              ? t('carta.bannerAhora', {
                  momento: momentoLocal(t, d.ahora),
                  detalle: partes.map((p) => t('carta.bannerEn', { cartas: p.cartas, sede: p.sede })).join(' · '),
                })
              : t('carta.bannerNinguna', { momento: momentoLocal(t, d.ahora) })
          }
          accion={urlPublica ? { etiqueta: t('carta.verPublica'), href: urlPublica, externo: true } : undefined}
        />
      ) : !d.disponible ? (
        <AvisoTonal tono="informacion" titulo={t('carta.implicitaTitulo')} descripcion={t('carta.implicitaDescripcion')} />
      ) : null;

    if (!esEscritorio) {
      return (
        <div className="flex flex-col gap-4 pb-20">
          {banner}
          <ul className="flex flex-col gap-3">
            {cartas.map((carta) => (
              <li key={carta.id}>
                <ListCard
                  icono={iconoCarta(carta.icono)}
                  titulo={carta.nombre}
                  subtitulo={`${resumenHorario(t, carta.horario, true)} · ${resumenSedes(t, carta.sedes, d.sedes, true)}`}
                  etiquetas={<EstadoCarta t={t} carta={carta} />}
                  onClick={() => router.push(rutaDetalleCarta(carta.id))}
                />
              </li>
            ))}
          </ul>
          <div className="fixed inset-x-0 bottom-0 z-30 flex gap-3 border-t border-line bg-surface p-4">
            <Link href={RUTA_CARTA_QR} className={clasesBoton({ variante: 'secundario', tamano: 'lg', anchoCompleto: true })}>
              <QrCode aria-hidden="true" className={CLASE_TAMANO_ICONO.fila} strokeWidth={TRAZO_ICONO} />
              {t('carta.cartaQr')}
            </Link>
            <button type="button" className={clasesBoton({ variante: 'primario', tamano: 'lg', anchoCompleto: true })} onClick={() => setNueva(true)} disabled={!d.disponible}>
              <Plus aria-hidden="true" className={CLASE_TAMANO_ICONO.fila} strokeWidth={TRAZO_ICONO} />
              {t('carta.nuevaCarta')}
            </button>
          </div>
        </div>
      );
    }

    return (
      <div className="flex flex-col gap-4 lg:gap-6">
        {banner}
        <div className="grid grid-cols-1 items-start gap-6 xl:grid-cols-[minmax(0,1fr)_22rem]">
          <div className="flex flex-col gap-3">
            <ul className="flex flex-col gap-3">
              {cartas.map((carta, i) => (
                <li key={carta.id}>
                <TarjetaCarta
                  t={t}
                  carta={carta}
                  sedes={d.sedes}
                  acciones={accionesDe(carta)}
                  arrastre={puedeOrdenar ? arrastre.nodo(i) : undefined}
                  onMover={
                    puedeOrdenar
                      ? (dir) => {
                          const destino = i + dir;
                          if (destino >= 0 && destino < cartas.length) void c.mover(i, destino);
                        }
                      : undefined
                  }
                />
                </li>
              ))}
            </ul>
            {cartas.length > 1 && <p className="text-xs text-fg-muted">{t('carta.notaOrden')}</p>}
          </div>
          <VistaPreviaLateral t={t} datos={d} />
        </div>
      </div>
    );
  };

  return (
    <MarcoSitioWeb
      href={RUTA_CARTA}
      subtitulo={subtitulo}
      estado={c.cargando ? 'cargando' : 'listo'}
      esqueleto={<EsqueletoCartas />}
      nombreContenido={t('carta.nombreContenido')}
      sinVerSitio
      acciones={bloqueada ? <></> : undefined}
      menu={
        // «⋯» solo en móvil: en escritorio Recargar y Carta QR ya están a la vista.
        bloqueada || esEscritorio
          ? undefined
          : [
              { id: 'qr', etiqueta: t('carta.cartaQr'), icono: QrCode, onSelect: () => router.push(RUTA_CARTA_QR) },
              { id: 'recargar', etiqueta: t('carta.recargar'), icono: RefreshCw, onSelect: () => void c.recargar() },
              ...(urlPublica ? [{ id: 'publica', etiqueta: t('carta.verPublica'), icono: ExternalLink, onSelect: () => window.open(urlPublica, '_blank', 'noopener,noreferrer') }] : []),
            ]
      }
      accionesSecundarias={
        <>
          <button
            type="button"
            className={clasesBoton({ variante: 'secundario', tamano: 'md', className: 'w-10 px-0' })}
            aria-label={t('carta.recargar')}
            title={t('carta.recargar')}
            onClick={() => void c.recargar()}
          >
            <RefreshCw aria-hidden="true" className={CLASE_TAMANO_ICONO.base} strokeWidth={TRAZO_ICONO} />
          </button>
          <Link href={RUTA_CARTA_QR} className={clasesBoton({ variante: 'secundario', tamano: 'md' })}>
            <QrCode aria-hidden="true" className={CLASE_TAMANO_ICONO.base} strokeWidth={TRAZO_ICONO} />
            {t('carta.cartaQr')}
          </Link>
        </>
      }
      accionPrimaria={
        <button
          type="button"
          className={clasesBoton({ variante: 'primario', tamano: 'md' })}
          onClick={() => setNueva(true)}
          disabled={!d?.disponible}
          title={d && !d.disponible ? t('carta.pendiente') : undefined}
        >
          <Plus aria-hidden="true" className={CLASE_TAMANO_ICONO.base} strokeWidth={TRAZO_ICONO} />
          {t('carta.nuevaCarta')}
        </button>
      }
    >
      {contenido()}
      <DialogoNuevaCarta t={t} abierto={nueva} onAbiertoChange={setNueva} cartas={cartas} creando={c.ocupado} onCrear={(x) => void crear(x)} />
      <ConfirmDialog
        abierto={eliminar !== null}
        onAbiertoChange={(v) => !v && setEliminar(null)}
        titulo={eliminar ? t('carta.eliminarTitulo', { nombre: eliminar.nombre }) : ''}
        descripcion={t('carta.eliminarDescripcion')}
        textoConfirmar={t('carta.eliminar')}
        tono="peligro"
        icono={Trash2}
        cargando={c.ocupado}
        onConfirmar={async () => {
          if (!eliminar) return;
          const ok = await c.eliminar(eliminar.id);
          setEliminar(null);
          toast(ok ? { title: t('carta.eliminada') } : { title: t('carta.errorAccion'), variant: 'destructive' });
        }}
      />
    </MarcoSitioWeb>
  );
}
