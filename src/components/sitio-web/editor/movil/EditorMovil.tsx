'use client';

/**
 * Editor en el celular (< lg): no hay editor completo (Figma A/05m «Móvil: no hay editor; solo
 * vista previa y cambios rápidos, que también van al borrador»).
 *
 * - A/05j «Editor no disponible»: «Inicio · Vista previa · solo lectura», aviso «Abre el editor
 *   en un computador», la página a 390 y la barra fija «Compartir» / «Cambios rápidos».
 * - A/05k «Cambios rápidos»: lista (Textos de la portada, Fotos, Horario, Platos agotados hoy,
 *   Aviso en el sitio) y barra fija con «N cambios sin publicar» y «Publicar».
 * - A/05l: cada cambio se edita en una hoja inferior con «Cancelar» / «Guardar en borrador».
 * - Sitio sin borrador: la misma banda «Editas el sitio en vivo» del computador (sin «Crear
 *   borrador»: se crea desde el computador).
 * - D/05-27 «Encabezado y pie · Estilo del sitio»: siete ajustes con su hoja inferior
 *   (`EncabezadoPieMovil`), y «Vista previa» / «Publicar» fijos abajo.
 */
import { useMemo, useState } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import { AlertTriangle, ArrowLeft, ChevronRight, Clock, Image as IconoImagen, PanelsTopLeft, Pencil, Share2, Send, UtensilsCrossed, type LucideIcon } from 'lucide-react';
import { AvisoTonal, FormField, PanelAdaptable, clasesBoton } from '@/components/kit';
import { Input } from '@/components/ui/input';
import { getSectionDefinition, type ContentFieldDef, type WebsitePageSection } from '@/lib/services/websitePageBuilderService';
import { PublishStatusBadge } from '@/components/sitio-web/ui/PublishStatusBadge';
import type { EstadoPublicacion } from '@/components/sitio-web/ui/estadoPublicacion';
import { RAIZ_SITIO_WEB } from '@/components/sitio-web/rutasSitioWeb';
import type { CategoriaInventarioMenu } from '@/components/sitio-web/paginas/tiposPaginas';
import { CampoSeccion } from '../inspector/CampoSeccion';
import { LienzoEditor } from '../LienzoEditor';
import type { EditorSitio } from '../useEditorSitio';
import { useTextosEditor } from '../textos';
import { BandaEnVivo } from '../BandaEnVivo';
import { EncabezadoPieMovil } from './EncabezadoPieMovil';

export const RUTA_SUCURSALES = '/app/organizacion/sucursales';
export const RUTA_CARTA = `${RAIZ_SITIO_WEB}/carta`;

type Hoja = 'textos' | 'fotos' | 'aviso' | null;

export interface EditorMovilProps {
  editor: EditorSitio;
  estado: EstadoPublicacion | null;
  onPublicar: () => void;
  /** «Vista previa» del borrador en otra pestaña (el mismo flujo del computador). */
  onVistaPrevia: () => void;
  categorias: { lista: readonly CategoriaInventarioMenu[]; cargando: boolean };
}

function esPortada(s: WebsitePageSection): boolean {
  return s.section_type.includes('hero');
}

export function EditorMovil({ editor, estado, onPublicar, onVistaPrevia, categorias }: EditorMovilProps) {
  const t = useTextosEditor();
  const [modo, setModo] = useState<'vista' | 'rapidos' | 'encabezado'>(() =>
    typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('modo') === 'rapido' ? 'rapidos' : 'vista',
  );
  const [hoja, setHoja] = useState<Hoja>(null);
  const pagina = editor.currentPage;
  const secciones = useMemo(() => pagina?.sections ?? [], [pagina]);
  const portada = secciones.find(esPortada) ?? null;
  const [borradorAviso, setBorradorAviso] = useState<string>('');
  /** Cambios de la hoja aún sin aplicar: «Cancelar» los descarta (A/05l). */
  const [borrador, setBorrador] = useState<Record<string, Record<string, unknown>>>({});
  const valorDe = (s: WebsitePageSection, clave: string) => (borrador[s.id] && clave in borrador[s.id] ? borrador[s.id][clave] : (s.content ?? {})[clave]);
  const anotar = (s: WebsitePageSection, cambios: Record<string, unknown>) =>
    setBorrador((b) => ({ ...b, [s.id]: { ...(b[s.id] ?? {}), ...cambios } }));
  const abrir = (h: Hoja) => {
    setBorrador({});
    setHoja(h);
  };

  const camposTexto = useMemo((): ContentFieldDef[] => {
    if (!portada) return [];
    return (getSectionDefinition(portada.section_type)?.contentFields ?? [])
      .filter((c) => (c.group ?? 'content') === 'content' && (c.type === 'text' || c.type === 'textarea'))
      .slice(0, 4);
  }, [portada]);
  const camposFoto = useMemo(
    () =>
      secciones.flatMap((s) =>
        (getSectionDefinition(s.section_type)?.contentFields ?? [])
          .filter((c) => c.type === 'image')
          .map((c) => ({ seccion: s, campo: c })),
      ),
    [secciones],
  );
  const sedeNombre = editor.nombreSitio;

  const compartir = async () => {
    try {
      const url = await editor.pedirVistaPrevia();
      if (!url) return;
      if (typeof navigator !== 'undefined' && navigator.share) {
        await navigator.share({ title: pagina?.title ?? '', url });
      } else {
        await navigator.clipboard.writeText(url);
        toast.success(t('movil.enlaceCopiado'));
      }
    } catch {
      /* compartir cancelado */
    }
  };

  const guardar = async () => {
    if (hoja === 'aviso') {
      editor.cambiarAjustes({ topbar_announcement: borradorAviso.trim() || null, show_topbar: borradorAviso.trim().length > 0 } as never);
    }
    for (const s of secciones) {
      if (borrador[s.id]) editor.cambiarContenido(s.id, { ...(s.content ?? {}), ...borrador[s.id] });
    }
    // En V2 va al borrador; en legacy guardar es publicar (como en el computador).
    const ok = editor.enV2 ? await editor.guardarAhora() : await editor.guardarLegacy();
    if (ok) {
      setBorrador({});
      setHoja(null);
    }
  };

  const cabecera = (titulo: string, subtitulo: string, onVolver?: () => void, href?: string) => (
    <header className="flex h-14 shrink-0 items-center gap-2 border-b border-line bg-surface px-2">
      {href ? (
        <Link href={href} aria-label={t('barra.volver')} className="flex size-10 items-center justify-center rounded-lg text-fg-secondary hover:bg-hover">
          <ArrowLeft aria-hidden="true" className="size-5" strokeWidth={1.5} />
        </Link>
      ) : (
        <button type="button" onClick={onVolver} aria-label={t('barra.volver')} className="flex size-10 items-center justify-center rounded-lg text-fg-secondary hover:bg-hover">
          <ArrowLeft aria-hidden="true" className="size-5" strokeWidth={1.5} />
        </button>
      )}
      <div className="min-w-0">
        <h1 className="truncate text-base font-semibold leading-5 text-fg">{titulo}</h1>
        <p className="truncate text-xs leading-4 text-fg-secondary">{subtitulo}</p>
      </div>
    </header>
  );

  if (modo === 'encabezado') {
    return <EncabezadoPieMovil editor={editor} onVolver={() => setModo('rapidos')} onPublicar={onPublicar} onVistaPrevia={onVistaPrevia} />;
  }

  if (modo === 'vista') {
    return (
      <div className="flex h-[100dvh] flex-col bg-canvas">
        {cabecera(pagina?.title ?? '', t('movil.soloLectura'), undefined, `${RAIZ_SITIO_WEB}/paginas`)}
        {!editor.enV2 && <BandaEnVivo />}
        <div className="px-4 pt-4">
          <AvisoTonal tono="informacion" titulo={t('movil.avisoTitulo')} descripcion={t('movil.avisoDescripcion')} />
        </div>
        <LienzoEditor
          url={editor.urlLienzo}
          preparando={editor.preparandoLienzo}
          host={editor.host}
          dispositivo="celular"
          recarga={editor.previewRefreshKey}
          secciones={editor.seccionesLienzo}
          ajustes={editor.ajustesLienzo}
          seleccion={null}
          etiquetaSeleccion={null}
          className="pb-20"
        />
        <div className="fixed inset-x-0 bottom-0 z-20 flex gap-2 border-t border-line bg-surface p-4">
          <button type="button" onClick={() => void compartir()} className={clasesBoton({ variante: 'secundario', tamano: 'md', anchoCompleto: true })}>
            <Share2 aria-hidden="true" className="size-4" strokeWidth={1.5} />
            {t('movil.compartir')}
          </button>
          <button
            type="button"
            onClick={() => setModo('rapidos')}
            disabled={!editor.permisos.editar}
            className={clasesBoton({ variante: 'primario', tamano: 'md', anchoCompleto: true })}
          >
            <Pencil aria-hidden="true" className="size-4" strokeWidth={1.5} />
            {t('movil.cambiosRapidos')}
          </button>
        </div>
      </div>
    );
  }

  const filas: { id: string; icono: LucideIcon; titulo: string; detalle: string; onClick?: () => void; href?: string; oculta?: boolean }[] = [
    { id: 'textos', icono: Pencil, titulo: t('movil.textos'), detalle: t('movil.textosDetalle'), onClick: () => abrir('textos'), oculta: camposTexto.length === 0 },
    { id: 'fotos', icono: IconoImagen, titulo: t('movil.fotos'), detalle: t('movil.fotosDetalle'), onClick: () => abrir('fotos'), oculta: camposFoto.length === 0 },
    { id: 'horario', icono: Clock, titulo: t('movil.horario'), detalle: t('movil.horarioDetalle', { sede: sedeNombre }), href: RUTA_SUCURSALES },
    { id: 'agotados', icono: UtensilsCrossed, titulo: t('movil.agotados'), detalle: t('movil.agotadosDetalle'), href: RUTA_CARTA },
    { id: 'encabezado', icono: PanelsTopLeft, titulo: t('encabezadoPie.titulo'), detalle: t('encabezadoPie.detalleFila'), onClick: () => setModo('encabezado') },
    {
      id: 'aviso',
      icono: AlertTriangle,
      titulo: t('movil.aviso'),
      detalle: t('movil.avisoEjemplo'),
      onClick: () => {
        setBorradorAviso(String((editor.settings as unknown as Record<string, unknown> | null)?.topbar_announcement ?? ''));
        abrir('aviso');
      },
    },
  ];

  return (
    <div className="flex h-[100dvh] flex-col bg-canvas">
      {cabecera(t('movil.cambiosRapidos'), t(editor.enV2 ? 'movil.rapidosSubtitulo' : 'movil.rapidosSubtituloLegacy', { pagina: pagina?.title ?? '' }), () => setModo('vista'))}
      {!editor.enV2 && <BandaEnVivo />}
      <ul className="flex flex-col divide-y divide-line bg-surface">
        {filas
          .filter((f) => !f.oculta)
          .map((f) => {
            const Icono = f.icono;
            const contenido = (
              <>
                <Icono aria-hidden="true" className="size-5 shrink-0 text-fg-secondary" strokeWidth={1.5} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-fg">{f.titulo}</span>
                  <span className="block truncate text-[13px] leading-[18px] text-fg-secondary">{f.detalle}</span>
                </span>
                <ChevronRight aria-hidden="true" className="size-4 shrink-0 text-fg-muted" strokeWidth={1.5} />
              </>
            );
            return (
              <li key={f.id}>
                {f.href ? (
                  <Link href={f.href} className="flex min-h-14 items-center gap-3 px-4 py-3 hover:bg-hover">
                    {contenido}
                  </Link>
                ) : (
                  <button type="button" onClick={f.onClick} className="flex min-h-14 w-full items-center gap-3 px-4 py-3 text-left hover:bg-hover">
                    {contenido}
                  </button>
                )}
              </li>
            );
          })}
      </ul>
      <div className="mt-auto flex items-center justify-between gap-3 border-t border-line bg-surface p-4">
        {estado ? <PublishStatusBadge estado={estado} /> : <span />}
        <button type="button" onClick={onPublicar} disabled={!editor.permisos.publicar} className={clasesBoton({ variante: 'primario', tamano: 'md' })}>
          <Send aria-hidden="true" className="size-4" strokeWidth={1.5} />
          {editor.enV2 ? t('barra.publicar') : t('barra.guardarPublicar')}
        </button>
      </div>

      <PanelAdaptable
        abierto={hoja !== null}
        onAbiertoChange={(a) => !a && setHoja(null)}
        titulo={hoja === 'textos' ? t('movil.textos') : hoja === 'fotos' ? t('movil.fotos') : t('movil.aviso')}
        ocupado={editor.isSaving}
        pie={
          <div className="flex w-full gap-2">
            <button type="button" onClick={() => setHoja(null)} className={clasesBoton({ variante: 'secundario', tamano: 'md', anchoCompleto: true })}>
              {t('acciones.cancelar')}
            </button>
            <button type="button" onClick={() => void guardar()} className={clasesBoton({ variante: 'primario', tamano: 'md', anchoCompleto: true })}>
              {editor.enV2 ? t('movil.guardarBorrador') : t('barra.guardarPublicar')}
            </button>
          </div>
        }
      >
        <div className="flex flex-col gap-4">
          {hoja === 'textos' &&
            portada &&
            camposTexto.map((c) => (
              <CampoSeccion
                key={c.key}
                campo={c}
                valor={valorDe(portada, c.key)}
                contenido={{ ...(portada.content ?? {}), ...(borrador[portada.id] ?? {}) }}
                onCambiar={(v) => anotar(portada, { [c.key]: v })}
                onCambiarContenido={(contenido) => anotar(portada, contenido)}
                organizationId={editor.organizationId}
                categorias={categorias}
              />
            ))}
          {hoja === 'fotos' &&
            camposFoto.map(({ seccion, campo }) => (
              <CampoSeccion
                key={`${seccion.id}-${campo.key}`}
                campo={{ ...campo, label: `${getSectionDefinition(seccion.section_type)?.label ?? ''} · ${campo.label}` }}
                valor={valorDe(seccion, campo.key)}
                contenido={{ ...(seccion.content ?? {}), ...(borrador[seccion.id] ?? {}) }}
                onCambiar={(v) => anotar(seccion, { [campo.key]: v })}
                onCambiarContenido={(contenido) => anotar(seccion, contenido)}
                organizationId={editor.organizationId}
                categorias={categorias}
              />
            ))}
          {hoja === 'aviso' && (
            <FormField etiqueta={t('movil.aviso')} ayuda={t('movil.avisoAyuda')}>
              <Input value={borradorAviso} maxLength={160} onChange={(e) => setBorradorAviso(e.target.value)} placeholder={t('movil.avisoPlaceholder')} className="h-10 rounded-lg" />
            </FormField>
          )}
        </div>
      </PanelAdaptable>
    </div>
  );
}
