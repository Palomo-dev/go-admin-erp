'use client';

/**
 * «Sedes en la web» (Figma B/11-01 escritorio, 11-02 móvil 390, 11-03
 * estados): qué sedes salen en el sitio, con qué dirección, de cuáles sale el
 * stock de la tienda y cómo se muestran (selector o un sitio por sede).
 *
 * - La identidad web de la sede vive aquí; la sucursal operativa (dirección,
 *   horario, caja) sigue en Organización › Sucursales y se lee (B/11-04 nota 1).
 * - Publicar es un interruptor explícito (nota 2); al publicar sin dirección se
 *   sugiere una desde el nombre.
 * - Dirección `tumarca.com/<slug>` (nota 3); el dominio propio de una sede se
 *   conecta en Dominios con la sede preseleccionada.
 * - Un solo guardado (SettingsSaveBar con Ctrl+S) por `useSedesWeb`.
 */
import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Check, Eye, Info, LocateFixed, Package, Pencil, RefreshCw, Store } from 'lucide-react';
import { Label } from '@/components/ui/label';
import {
  AvisoTonal,
  ConfirmDialog,
  DataTable,
  EmptyState,
  FormSection,
  ListCard,
  PanelAdaptable,
  SegmentedControl,
  SettingsSaveBar,
  StatusBadge,
  TarjetaSeleccionable,
  Tarjeta,
  clasesBoton,
  type AccionFila,
  type ColumnaTabla,
} from '@/components/kit';
import { Switch } from '@/components/ui/switch';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/components/ui/use-toast';
import { DomainStatusBadge } from '../ui/DomainStatusBadge';
import type { EstadoDominio } from '../ui/estadoDominio';
import { MarcoSitioWeb, type EstadoVistaSitio } from '../MarcoSitioWeb';
import { RAIZ_SITIO_WEB, rutaDominios } from '../rutasSitioWeb';
import { cn } from '@/utils/Utils';
import { direccionSede, type ModoSedes, type SedeWebFila } from './sedesWeb';
import { textoHorario } from './formatoVentas';
import { CLASE_TAMANO_ICONO, TRAZO_ICONO } from '../ui/iconosSitio';
import { ICONO_DATO_SEDE, ICONO_MODO_SEDES } from './iconosVentas';
import { useTextosVentas, type TraductorVentas } from './textos';
import { useSedesWeb, type ErrorSlug } from './useSedesWeb';
import { ErrorApiVentas } from './useVentasSitio';

export const RUTA_SEDES_WEB = `${RAIZ_SITIO_WEB}/sedes`;
export const RUTA_SUCURSALES = '/app/organizacion/sucursales';


const TEXTO_ERROR_SLUG: Record<ErrorSlug, string> = {
  invalido: 'sedes.tabla.slugInvalido',
  repetido: 'sedes.tabla.slugRepetido',
  requerido: 'sedes.tabla.slugRequerido',
};

function EsqueletoSedes() {
  return (
    <div className="flex flex-col gap-4 rounded-xl border border-line bg-surface p-4" aria-busy="true">
      {[0, 1, 2].map((i) => (
        <div key={i} className="flex items-center gap-3">
          <Skeleton className="size-4 rounded" />
          <Skeleton className="size-10 rounded-lg" />
          <Skeleton className="h-3 w-24 rounded" />
          <Skeleton className="h-3 flex-1 rounded" />
          <Skeleton className="h-3 w-24 rounded" />
        </div>
      ))}
    </div>
  );
}

function DireccionWeb({
  sede,
  host,
  error,
  editable,
  onCambiarSlug,
  t,
}: {
  sede: SedeWebFila;
  host: string | null;
  error?: ErrorSlug;
  editable: boolean;
  onCambiarSlug: (slug: string) => void;
  t: TraductorVentas;
}) {
  const [editando, setEditando] = useState(false);
  const dir = direccionSede(host, sede.slug);
  const abierto = editando || !!error;
  return (
    <div className="flex min-w-0 flex-col gap-1">
      {abierto && editable ? (
        <div className="flex items-center gap-1">
          <span className="shrink-0 text-xs text-fg-secondary">{host ? `${host}/` : '/'}</span>
          <Input
            value={sede.slug ?? ''}
            onChange={(e) => onCambiarSlug(e.target.value)}
            onBlur={() => !error && setEditando(false)}
            aria-label={t('sedes.tabla.slug', { sede: sede.nombre })}
            aria-invalid={!!error}
            className="h-8 w-32 rounded-md text-[13px]"
            autoFocus={editando}
          />
        </div>
      ) : sede.publicada && dir ? (
        <span className="flex items-center gap-1">
          <a href={`https://${dir}`} target="_blank" rel="noopener noreferrer" className="truncate text-[13px] font-medium text-link hover:underline">
            {dir}
          </a>
          {editable && (
            <button
              type="button"
              onClick={() => setEditando(true)}
              aria-label={t('sedes.tabla.slug', { sede: sede.nombre })}
              className={cn(clasesBoton({ variante: 'fantasma', tamano: 'sm' }), 'size-8 px-0')}
            >
              <Pencil aria-hidden="true" className={CLASE_TAMANO_ICONO.meta} strokeWidth={TRAZO_ICONO} />
            </button>
          )}
        </span>
      ) : (
        <span className="text-[13px] text-fg-muted">—</span>
      )}
      {error && <span className="text-xs text-danger-text">{t(TEXTO_ERROR_SLUG[error])}</span>}
      {sede.publicada ? (
        sede.dominioPropio ? (
          <span className="flex flex-wrap items-center gap-1 text-xs text-fg-secondary">
            + {sede.dominioPropio.host}
            {sede.dominioPropio.estado && <DomainStatusBadge estado={sede.dominioPropio.estado as EstadoDominio} tamano="sm" />}
          </span>
        ) : (
          <span className="flex flex-wrap items-center gap-1 text-xs text-fg-secondary">
            {t('sedes.tabla.dominioPropioNo')} ·
            <Link href={rutaDominios({ accion: 'conectar', sede: sede.id })} className="font-medium text-link hover:underline">
              {t('sedes.tabla.conectarDominio')}
            </Link>
          </span>
        )
      ) : (
        <span className="flex items-center gap-1 text-xs text-fg-secondary">
          <ICONO_DATO_SEDE.oculta aria-hidden="true" className={cn(CLASE_TAMANO_ICONO.meta, 'shrink-0')} strokeWidth={TRAZO_ICONO} />
          {t('sedes.tabla.noSeMuestra')}
        </span>
      )}
    </div>
  );
}

/** Dirección que ve el cliente: el dominio propio de la sede si existe; si no, `host/slug`. */
export function direccionVisible(host: string | null, sede: Pick<SedeWebFila, 'slug' | 'dominioPropio'>): string | null {
  return sede.dominioPropio?.host ?? direccionSede(host, sede.slug);
}

/**
 * Hoja de una sede en móvil (B/11-02): el interruptor «En la web», la
 * dirección con su error y el dominio propio («Conectar dominio» abre Dominios
 * con la sede preseleccionada). Sin esto, una dirección repetida bloquearía el
 * guardado en móvil sin forma de corregirla.
 */
function HojaSede({
  sede,
  host,
  error,
  editable,
  onPublicar,
  onCambiarSlug,
  t,
}: {
  sede: SedeWebFila;
  host: string | null;
  error?: ErrorSlug;
  editable: boolean;
  onPublicar: (v: boolean) => void;
  onCambiarSlug: (slug: string) => void;
  t: TraductorVentas;
}) {
  const idSwitch = `sede-web-${sede.id}`;
  const idSlug = `sede-slug-${sede.id}`;
  const ejemplo = direccionSede(host, sede.slug || sede.slugSugerido) ?? '';
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3 rounded-lg border border-line bg-surface p-3">
        <Label htmlFor={idSwitch} className="flex min-w-0 items-center gap-2 text-sm font-medium text-fg">
          <ICONO_DATO_SEDE.sitio aria-hidden="true" className={cn(CLASE_TAMANO_ICONO.base, 'shrink-0 text-fg-secondary')} strokeWidth={TRAZO_ICONO} />
          {t('sedes.tabla.enWeb')}
        </Label>
        <Switch id={idSwitch} checked={sede.publicada} disabled={!editable} onCheckedChange={onPublicar} aria-label={t('sedes.tabla.publicar', { sede: sede.nombre })} />
      </div>

      {sede.publicada ? (
        <>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={idSlug} className="flex items-center gap-2 text-[13px] font-medium text-fg">
              <ICONO_DATO_SEDE.direccionWeb aria-hidden="true" className={cn(CLASE_TAMANO_ICONO.base, 'shrink-0 text-fg-secondary')} strokeWidth={TRAZO_ICONO} />
              {t('sedes.tabla.direccion')}
            </Label>
            <div className="flex min-w-0 items-center gap-1">
              <span className="shrink-0 truncate text-[13px] text-fg-secondary">{host ? `${host}/` : '/'}</span>
              <Input
                id={idSlug}
                value={sede.slug ?? ''}
                onChange={(e) => onCambiarSlug(e.target.value)}
                disabled={!editable}
                aria-invalid={!!error}
                aria-describedby={`${idSlug}-ayuda`}
                className="h-10 min-w-0 flex-1 rounded-lg text-sm"
              />
            </div>
            <p id={`${idSlug}-ayuda`} className={cn('text-xs', error ? 'text-danger-text' : 'text-fg-secondary')}>
              {error ? t(TEXTO_ERROR_SLUG[error]) : t('sedes.tabla.direccionAyuda', { ejemplo })}
            </p>
          </div>

          <div className="flex flex-col gap-1.5">
            <p className="flex items-center gap-2 text-[13px] font-medium text-fg">
              <ICONO_DATO_SEDE.dominio aria-hidden="true" className={cn(CLASE_TAMANO_ICONO.base, 'shrink-0 text-fg-secondary')} strokeWidth={TRAZO_ICONO} />
              {t('sedes.tabla.dominioPropio')}
            </p>
            {sede.dominioPropio ? (
              <span className="flex flex-wrap items-center gap-2 text-[13px] text-fg">
                {sede.dominioPropio.host}
                {sede.dominioPropio.estado && <DomainStatusBadge estado={sede.dominioPropio.estado as EstadoDominio} tamano="sm" />}
              </span>
            ) : (
              <Link href={rutaDominios({ accion: 'conectar', sede: sede.id })} className={cn(clasesBoton({ variante: 'secundario', tamano: 'md' }), 'w-full')}>
                <ICONO_DATO_SEDE.dominio aria-hidden="true" className={CLASE_TAMANO_ICONO.base} strokeWidth={TRAZO_ICONO} />
                {t('sedes.tabla.conectarDominio')}
              </Link>
            )}
          </div>
        </>
      ) : (
        <p className="flex items-center gap-2 text-[13px] text-fg-secondary">
          <ICONO_DATO_SEDE.oculta aria-hidden="true" className={cn(CLASE_TAMANO_ICONO.base, 'shrink-0')} strokeWidth={TRAZO_ICONO} />
          {t('sedes.tabla.noSeMuestra')}
        </p>
      )}

      <p className="flex items-center gap-2 text-[13px] text-fg-secondary">
        <ICONO_DATO_SEDE.horario aria-hidden="true" className={cn(CLASE_TAMANO_ICONO.base, 'shrink-0')} strokeWidth={TRAZO_ICONO} />
        {textoHorario(sede.horario, t)}
      </p>
    </div>
  );
}

/** Vista previa del selector público «¿Dónde quieres comprar?» (B/11-01, panel lateral). */
export function VistaPreviaSelector({ sedes, t }: { sedes: readonly SedeWebFila[]; t: TraductorVentas }) {
  const publicadas = sedes.filter((s) => s.publicada);
  return (
    <div className="flex flex-col gap-3 rounded-xl border border-line bg-canvas p-4" aria-label={t('sedes.vistaPrevia')}>
      <div>
        <p className="text-base font-semibold text-fg">{t('sedes.selector.titulo')}</p>
        <p className="text-xs text-fg-secondary">{t('sedes.selector.descripcion')}</p>
      </div>
      <span aria-hidden="true" className={cn(clasesBoton({ variante: 'secundario', tamano: 'sm' }), 'pointer-events-none w-fit')}>
        <LocateFixed className={CLASE_TAMANO_ICONO.base} strokeWidth={TRAZO_ICONO} />
        {t('sedes.selector.ubicacion')}
      </span>
      {publicadas.length === 0 ? (
        <p className="text-[13px] text-fg-secondary">{t('sedes.selector.vacio')}</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {publicadas.map((s, i) => (
            <li
              key={s.id}
              className={cn('flex items-start justify-between gap-2 rounded-lg border p-3', i === 0 ? 'border-brand bg-brand-tint' : 'border-line bg-surface')}
            >
              <div className="min-w-0">
                <p className="truncate text-[13px] font-semibold text-fg">{s.nombre}</p>
                {s.direccion && (
                  <p className="flex items-center gap-1 truncate text-xs text-fg-secondary">
                    <ICONO_DATO_SEDE.ubicacion aria-hidden="true" className={cn(CLASE_TAMANO_ICONO.meta, 'shrink-0')} strokeWidth={TRAZO_ICONO} />
                    {s.direccion}
                  </p>
                )}
                {s.apertura && (
                  <p className={cn('text-xs font-medium', s.apertura.abierto ? 'text-success-text' : 'text-fg-secondary')}>
                    {s.apertura.abierto && s.apertura.hasta ? t('sedes.selector.abiertoHasta', { hora: s.apertura.hasta }) : t('sedes.selector.cerradoAhora')}
                  </p>
                )}
              </div>
              {i === 0 && <Check aria-hidden="true" className={cn(CLASE_TAMANO_ICONO.base, 'shrink-0 text-brand')} strokeWidth={TRAZO_ICONO} />}
            </li>
          ))}
        </ul>
      )}
      <span aria-hidden="true" className={cn(clasesBoton({ variante: 'primario', tamano: 'md' }), 'pointer-events-none w-fit')}>
        {t('sedes.selector.continuar')}
      </span>
    </div>
  );
}

function BloqueStock({
  sedes,
  editable,
  onCambiar,
  t,
}: {
  sedes: readonly SedeWebFila[];
  editable: boolean;
  onCambiar: (id: number, v: boolean) => void;
  t: TraductorVentas;
}) {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-x-4 gap-y-2" role="group" aria-label={t('sedes.stockTitulo')}>
        {sedes.map((s) => (
          <label key={s.id} className="flex items-center gap-2 text-[13px] text-fg">
            <Checkbox checked={s.fuenteStock} disabled={!editable} onCheckedChange={(v) => onCambiar(s.id, v === true)} />
            {s.nombre}
          </label>
        ))}
      </div>
      <p className="text-xs text-fg-secondary">{t('sedes.stockAyuda')}</p>
    </div>
  );
}

export function PantallaSedesWeb() {
  const t = useTextosVentas();
  const router = useRouter();
  const { toast } = useToast();
  const s = useSedesWeb();
  const [hoja, setHoja] = useState<'vista' | 'stock' | null>(null);
  const [sedeAbierta, setSedeAbierta] = useState<number | null>(null);
  const [confirmarRecarga, setConfirmarRecarga] = useState(false);
  const datos = s.datos;
  const editable = !!datos?.permisos.editar;
  const host = datos?.host ?? null;
  const ejemploHost = host ?? 'tumarca.com';

  const estado: EstadoVistaSitio = s.cargando ? 'cargando' : s.fallo === 'sin_permiso' ? 'sin_permiso' : s.fallo || !datos ? 'error' : 'listo';
  const publicadas = s.sedes.filter((x) => x.publicada).length;
  const hayErrores = Object.keys(s.erroresSlug).length > 0;

  const sedeHoja = sedeAbierta === null ? null : s.sedes.find((x) => x.id === sedeAbierta) ?? null;

  /** «Recargar» no borra cambios sin guardar sin preguntar. */
  const pedirRecarga = () => {
    if (s.cambios > 0) setConfirmarRecarga(true);
    else void s.recargar();
  };

  const guardar = async () => {
    try {
      await s.guardar();
      toast({ title: t('sedes.guardado') });
    } catch (error) {
      const e = error as ErrorApiVentas;
      toast({ title: t('sedes.error', { mensaje: e.message }), variant: 'destructive' });
    }
  };

  const menu: AccionFila[] = [
    { id: 'recargar', etiqueta: t('sedes.recargar'), icono: RefreshCw, onSelect: pedirRecarga },
    { id: 'sucursales', etiqueta: t('sedes.irSucursales'), icono: Store, onSelect: () => router.push(RUTA_SUCURSALES) },
    { id: 'vista', etiqueta: t('sedes.verVistaPrevia'), icono: Eye, onSelect: () => setHoja('vista') },
    { id: 'stock', etiqueta: t('sedes.verStock'), icono: Package, onSelect: () => setHoja('stock') },
  ];

  const columnas: ColumnaTabla<SedeWebFila>[] = [
    {
      id: 'sede',
      encabezado: t('sedes.tabla.sede'),
      celda: (x) => (
        <div className="min-w-0">
          <p className="flex items-center gap-2 truncate text-sm font-medium text-fg">
            {x.nombre}
            {x.principal && <StatusBadge estado="principal" etiqueta={t('sedes.tabla.principal')} tono="marca" tamano="sm" />}
          </p>
          <p className="truncate text-xs text-fg-secondary">{[x.direccion, x.ciudad].filter(Boolean).join(', ') || (x.publicada ? '' : t('sedes.tabla.soloStock'))}</p>
        </div>
      ),
    },
    {
      id: 'web',
      encabezado: t('sedes.tabla.enWeb'),
      ancho: 96,
      celda: (x) => (
        <Switch checked={x.publicada} disabled={!editable} onCheckedChange={(v) => s.publicar(x.id, v)} aria-label={t('sedes.tabla.publicar', { sede: x.nombre })} />
      ),
    },
    {
      id: 'direccion',
      encabezado: t('sedes.tabla.direccion'),
      celda: (x) => (
        <DireccionWeb sede={x} host={host} error={s.erroresSlug[x.id]} editable={editable} onCambiarSlug={(v) => s.cambiarSlug(x.id, v)} t={t} />
      ),
    },
    {
      id: 'horario',
      encabezado: t('sedes.tabla.horario'),
      ocultarDebajo: 'xl',
      celda: (x) => (
        <span className="flex items-center gap-1.5 text-[13px] text-fg-secondary">
          <ICONO_DATO_SEDE.horario aria-hidden="true" className={cn(CLASE_TAMANO_ICONO.base, 'shrink-0')} strokeWidth={TRAZO_ICONO} />
          {textoHorario(x.horario, t)}
        </span>
      ),
    },
  ];

  const modoOpciones: { valor: ModoSedes; titulo: string; corto: string; descripcion: string }[] = [
    { valor: 'selector', titulo: t('sedes.modo.selector'), corto: t('sedes.modo.selectorCorto'), descripcion: t('sedes.modo.selectorDescripcion', { host: ejemploHost }) },
    { valor: 'per_branch', titulo: t('sedes.modo.porSede'), corto: t('sedes.modo.porSedeCorto'), descripcion: t('sedes.modo.porSedeDescripcion', { host: ejemploHost }) },
  ];
  const modoBloqueado = !editable || !!datos?.modoPendienteMigracion;

  return (
    <MarcoSitioWeb
      href={RUTA_SEDES_WEB}
      subtitulo={datos && datos.estado === 'listo' ? t('sedes.subtitulo', { total: s.sedes.length, publicadas }) : undefined}
      sinVerSitio
      estado={estado === 'sin_permiso' ? 'listo' : estado}
      acciones={
        estado === 'sin_permiso' ? (
          <></>
        ) : undefined
      }
      accionesSecundarias={
        <>
          <button
            type="button"
            onClick={pedirRecarga}
            aria-label={t('sedes.recargar')}
            title={t('sedes.recargar')}
            className={cn(clasesBoton({ variante: 'secundario', tamano: 'md' }), 'w-10 px-0')}
          >
            <RefreshCw aria-hidden="true" className={CLASE_TAMANO_ICONO.base} strokeWidth={TRAZO_ICONO} />
          </button>
          <Link href={RUTA_SUCURSALES} className={clasesBoton({ variante: 'secundario', tamano: 'md' })}>
            <Store aria-hidden="true" className={CLASE_TAMANO_ICONO.base} strokeWidth={TRAZO_ICONO} />
            {t('sedes.irSucursales')}
          </Link>
        </>
      }
      menu={menu}
      onReintentar={() => void s.recargar()}
      esqueleto={<EsqueletoSedes />}
      nombreContenido={t('sedes.nombreContenido')}
    >
      {estado === 'sin_permiso' ? (
        <EmptyState variante="forbidden" titulo={t('sedes.sinPermiso.titulo')} descripcion={t('sedes.sinPermiso.descripcion')} />
      ) : datos?.estado === 'una_sede' ? (
        <EmptyState
          variante="empty"
          icono={Package}
          titulo={t('sedes.unaSede.titulo')}
          descripcion={t('sedes.unaSede.descripcion', { sede: datos.sedePrincipal ?? '' })}
          accion={{ etiqueta: t('sedes.irSucursales'), href: RUTA_SUCURSALES, icono: Store }}
        />
      ) : datos ? (
        <div className="flex flex-col gap-4 pb-24 lg:gap-6 lg:pb-0">
          {/* Modo: dos tarjetas en escritorio, SegmentedControl en móvil. */}
          <div className="hidden lg:block">
            <FormSection
              titulo={t('sedes.modo.titulo')}
              descripcion={datos.modoPendienteMigracion ? t('sedes.modo.pendienteMigracion') : undefined}
              columnas={2}
            >
              <div role="radiogroup" aria-label={t('sedes.modo.titulo')} className="contents">
                {modoOpciones.map((o) => (
                  <TarjetaSeleccionable
                    key={o.valor}
                    orientacion="horizontal"
                    icono={ICONO_MODO_SEDES[o.valor]}
                    titulo={o.valor === 'selector' ? `${o.titulo} · ${t('sedes.modo.recomendado')}` : o.titulo}
                    descripcion={o.descripcion}
                    seleccionada={s.modo === o.valor}
                    onSeleccionar={() => s.cambiarModo(o.valor)}
                    deshabilitada={modoBloqueado}
                  />
                ))}
              </div>
            </FormSection>
          </div>
          <div className="lg:hidden">
            <SegmentedControl
              anchoCompleto
              etiqueta={t('sedes.modo.titulo')}
              opciones={modoOpciones.map((o) => ({ valor: o.valor, etiqueta: o.corto, icono: ICONO_MODO_SEDES[o.valor] }))}
              valor={s.modo}
              onValorChange={s.cambiarModo}
              deshabilitado={modoBloqueado}
            />
          </div>

          <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_300px] lg:gap-6">
            <div className="flex min-w-0 flex-col gap-4 lg:gap-6">
              <div className="hidden lg:block">
                <DataTable
                  etiqueta={t('sedes.tabla.etiqueta')}
                  columnas={columnas}
                  filas={s.sedes}
                  obtenerId={(x) => String(x.id)}
                  densidad="comoda"
                />
              </div>
              {/* Móvil 390: una tarjeta por sede con su interruptor (B/11-02). */}
              <div className="flex flex-col gap-2 lg:hidden">
                {s.sedes.map((x) => (
                  <ListCard
                    key={x.id}
                    titulo={x.nombre}
                    datos={
                      x.publicada
                        ? [
                            {
                              icono: x.dominioPropio ? ICONO_DATO_SEDE.dominio : ICONO_DATO_SEDE.direccionWeb,
                              etiqueta: t('sedes.tabla.direccion'),
                              texto: <span className="text-link">{direccionVisible(host, x) ?? '—'}</span>,
                            },
                            { icono: ICONO_DATO_SEDE.horario, etiqueta: t('sedes.tabla.horario'), texto: textoHorario(x.horario, t) },
                          ]
                        : [
                            { icono: ICONO_DATO_SEDE.oculta, texto: t('sedes.tabla.noSeMuestra') },
                            x.fuenteStock && { icono: ICONO_DATO_SEDE.soloStock, texto: t('sedes.tabla.soloStock') },
                          ]
                    }
                    subtitulo={s.erroresSlug[x.id] ? <span className="text-danger-text">{t(TEXTO_ERROR_SLUG[s.erroresSlug[x.id]])}</span> : undefined}
                    onClick={() => setSedeAbierta(x.id)}
                    estado={
                      <Switch
                        checked={x.publicada}
                        disabled={!editable}
                        onCheckedChange={(v) => s.publicar(x.id, v)}
                        aria-label={t('sedes.tabla.publicar', { sede: x.nombre })}
                      />
                    }
                  />
                ))}
              </div>

              <AvisoTonal
                tono="informacion"
                icono={Info}
                titulo={t('sedes.aviso.titulo', { ejemplo: `${ejemploHost}/centro`, incorrecto: 'centro.tu-marca.goadmin.io' })}
                descripcion={t('sedes.aviso.descripcion', { dominio: ejemploHost })}
              />

              <div className="hidden lg:block">
                <Tarjeta titulo={t('sedes.stockTitulo')}>
                  <BloqueStock sedes={s.sedes} editable={editable} onCambiar={s.cambiarFuenteStock} t={t} />
                </Tarjeta>
              </div>
            </div>

            <aside className="hidden lg:block">
              <Tarjeta titulo={t('sedes.vistaPrevia')} icono={Eye}>
                <VistaPreviaSelector sedes={s.sedes} t={t} />
              </Tarjeta>
            </aside>
          </div>

          <SettingsSaveBar
            cambios={s.cambios}
            onGuardar={() => void guardar()}
            onDescartar={s.descartar}
            guardando={s.guardando}
            deshabilitado={hayErrores || !editable}
            motivo={hayErrores ? t('sedes.tabla.slugInvalido') : undefined}
          />
        </div>
      ) : null}

      <PanelAdaptable
        abierto={sedeHoja !== null}
        onAbiertoChange={(v) => !v && setSedeAbierta(null)}
        titulo={sedeHoja ? t('sedes.tabla.editarSede', { sede: sedeHoja.nombre }) : ''}
        descripcion={t('sedes.hoja.descripcion')}
        icono={ICONO_MODO_SEDES.selector}
      >
        {sedeHoja && (
          <HojaSede
            sede={sedeHoja}
            host={host}
            error={s.erroresSlug[sedeHoja.id]}
            editable={editable}
            onPublicar={(v) => s.publicar(sedeHoja.id, v)}
            onCambiarSlug={(v) => s.cambiarSlug(sedeHoja.id, v)}
            t={t}
          />
        )}
      </PanelAdaptable>

      <ConfirmDialog
        abierto={confirmarRecarga}
        onAbiertoChange={setConfirmarRecarga}
        tono="advertencia"
        icono={RefreshCw}
        titulo={t('sedes.recargarConfirmar.titulo')}
        descripcion={t('sedes.recargarConfirmar.descripcion', { n: s.cambios })}
        textoConfirmar={t('sedes.recargarConfirmar.confirmar')}
        textoCancelar={t('sedes.recargarConfirmar.cancelar')}
        onConfirmar={() => {
          setConfirmarRecarga(false);
          void s.recargar();
        }}
      />

      <PanelAdaptable
        abierto={hoja !== null}
        onAbiertoChange={(v) => !v && setHoja(null)}
        titulo={hoja === 'stock' ? t('sedes.stockTitulo') : t('sedes.vistaPrevia')}
        icono={hoja === 'stock' ? Package : Eye}
        pantallaCompletaMovil
      >
        {hoja === 'stock' ? (
          <BloqueStock sedes={s.sedes} editable={editable} onCambiar={s.cambiarFuenteStock} t={t} />
        ) : (
          <VistaPreviaSelector sedes={s.sedes} t={t} />
        )}
      </PanelAdaptable>
    </MarcoSitioWeb>
  );
}

