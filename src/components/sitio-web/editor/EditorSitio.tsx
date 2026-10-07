'use client';

/**
 * Editor visual del sitio, a pantalla completa (Figma A/05a-05n, D/05-13…05-28, «figma-estilo»
 * 01-10). Ruta pública: /app/sitio-web/editor/[pageId] (se sirve fuera del AppLayout).
 *
 * Escritorio (≥ lg): barra superior, lista de secciones (o «Estilo del sitio») a la izquierda,
 * lienzo al centro e inspector (o historial) a la derecha. Celular: vista previa de solo lectura
 * y cambios rápidos. Toda la lógica está en `useEditorSitio`; aquí solo se compone la pantalla y
 * sus estados: cargando, sin permiso, página no encontrada, error y listo.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ArrowLeftRight,
  CalendarX,
  Copy,
  ExternalLink,
  LayoutTemplate,
  MousePointerClick,
  Power,
  PowerOff,
  Search,
  Store,
  Undo2,
} from 'lucide-react';
import {
  AvisoTonal,
  ConfirmDialog,
  EmptyState,
  PanelAdaptable,
  Skeleton,
  useEsEscritorio,
  type AccionFila,
} from '@/components/kit';
import { OrganizationTimezoneProvider, useFormatDate } from '@/lib/context/OrganizationTimezoneContext';
import { FONTS } from '@/lib/services/websiteSettingsService';
import type { WebsiteSettings } from '@/lib/services/websiteSettingsService';
import { leerEstiloSeccion } from '@/lib/website/v2/estiloSeccion';
import { debeActivarAlPublicar } from '@/lib/website/v2/activarAlPublicar';
import { tipoSedeDesdeGiro } from '@/lib/services/website/sectionsByBranchType';
import { resolverEstadoPublicacion, type EstadoPublicacion } from '@/components/sitio-web/ui/estadoPublicacion';
import { useCategoriasMenu } from '@/components/sitio-web/paginas/ColumnaCategoriasInventario';
import { HojaMenu } from '@/components/organization/branding/editor/inspector/HojaMenu';
import { PageLayoutPanel } from '@/components/organization/branding/editor/PageLayoutPanel';
import { PanelHerencia } from '@/components/organization/branding/editor/v2/PanelHerencia';
import { giroDeTipoOrganizacion } from '@/components/sitio-web/paginas/plantillasPagina';
import { shellPorDefecto, shellPorDefectoDelDocumento } from '@/lib/website/v2/plantillaCompleta';
import { nuevoIdSeccion } from '@/lib/website/v2/vistaEditor';
import { BarraEditor, RUTA_PAGINAS_EDITOR } from './BarraEditor';
import { ListaSecciones } from './ListaSecciones';
import { LienzoEditor } from './LienzoEditor';
import { InspectorSeccion, type PestanaSeccion } from './inspector/InspectorSeccion';
import { InspectorEncabezado } from './inspector/InspectorEncabezado';
import { InspectorPie } from './inspector/InspectorPie';
import type { TemaEstiloSeccion } from './inspector/InspectorEstilo';
import { PanelEstiloSitio } from './PanelEstiloSitio';
import { PanelHistorial } from './PanelHistorial';
import { DialogoAnadirSeccion } from './DialogoAnadirSeccion';
import { DialogoPublicar } from './DialogoPublicar';
import { BandaConflicto, DialogoConflicto } from './DialogoConflicto';
import { PreguntaSede } from './PreguntaSede';
import { BandaEnVivo } from './BandaEnVivo';
import { HojaMenuV2 } from './HojaMenuV2';
import { DialogoSeoPagina } from './DialogoSeoPagina';
import { HojaCartaEditor } from './HojaCartaEditor';
import { EditorMovil } from './movil/EditorMovil';
import { nombreDeSeccion } from './iconosSeccion';
import { LECTOR_PUBLICO_V2_LISTO, useEditorSitio, type ZonaGlobal } from './useEditorSitio';
import { useTextosEditor } from './textos';
import { DialogoAplicarPlantillaSede } from '@/components/sitio-web/plantillaSede/DialogoAplicarPlantillaSede';
import { useTextosPlantillaSede } from '@/components/sitio-web/plantillaSede/textos';
import { esTipoSedePlantilla } from '@/lib/website/v2/plantillaSede';

function EsqueletoEditor() {
  return (
    <div aria-busy="true" className="flex h-[100dvh] flex-col bg-canvas">
      <div className="flex h-14 items-center gap-3 border-b border-line bg-surface px-3">
        <Skeleton className="size-9 rounded-lg" />
        <Skeleton className="h-10 w-48 rounded-lg" />
        {/* Misma forma que el selector de dispositivo: 4 iconos (148 px) + «1440 px». */}
        <div className="flex flex-1 items-center justify-center gap-2">
          <Skeleton className="h-10 w-[148px] rounded-lg" />
          <Skeleton className="h-4 w-14 rounded-md" />
        </div>
        <Skeleton className="h-10 w-28 rounded-lg" />
        <Skeleton className="h-10 w-28 rounded-lg" />
      </div>
      <div className="flex min-h-0 flex-1">
        <div className="hidden w-[280px] flex-col gap-2 border-r border-line bg-surface p-4 lg:flex">
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <Skeleton key={i} className="h-10 w-full rounded-lg" />
          ))}
        </div>
        <div className="flex flex-1 flex-col gap-3 p-6">
          <Skeleton className="h-10 w-full rounded-lg" />
          <Skeleton className="h-72 w-full rounded-xl" />
          <div className="grid grid-cols-2 gap-3">
            <Skeleton className="h-32 rounded-xl" />
            <Skeleton className="h-32 rounded-xl" />
          </div>
        </div>
        <div className="hidden w-[360px] flex-col gap-3 border-l border-line bg-surface p-4 lg:flex">
          <Skeleton className="h-6 w-2/3" />
          <Skeleton className="h-9 w-full rounded-lg" />
          <div className="grid grid-cols-2 gap-3">
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} className="aspect-[4/3] rounded-lg" />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function PantallaEstado({ children }: { children: React.ReactNode }) {
  return <div className="flex h-[100dvh] items-center justify-center bg-canvas p-6">{children}</div>;
}

/** Colores y fuentes del estilo del sitio (para el estilo por sección), desde los ajustes en edición. */
function temaDeAjustes(s: WebsiteSettings | null): TemaEstiloSeccion {
  const r = (s ?? {}) as unknown as Record<string, unknown>;
  const txt = (k: string) => (typeof r[k] === 'string' && r[k] ? (r[k] as string) : null);
  return {
    colores: {
      primario: txt('primary_color'),
      secundario: txt('secondary_color'),
      acento: txt('accent_color'),
      texto: txt('text_color'),
      fondo: txt('background_color'),
    },
    fuentes: { titulos: txt('font_heading'), cuerpo: txt('font_body') },
  };
}

function Editor() {
  const t = useTextosEditor();
  const ed = useEditorSitio();
  const esEscritorio = useEsEscritorio();
  const { formatDateTime } = useFormatDate(null);

  const [panelIzquierdo, setPanelIzquierdo] = useState<'secciones' | 'estilo'>('secciones');
  const [panelDerecho, setPanelDerecho] = useState<'inspector' | 'historial'>('inspector');
  const [anadir, setAnadir] = useState(false);
  const [publicarAbierto, setPublicarAbierto] = useState(false);
  const [conflictoAbierto, setConflictoAbierto] = useState(false);
  const [eliminar, setEliminar] = useState<string | null>(null);
  const [crearSitio, setCrearSitio] = useState<number | null | undefined>(undefined);
  const [creandoSitio, setCreandoSitio] = useState(false);
  const [adopcion, setAdopcion] = useState<boolean | null>(null);
  const [herencia, setHerencia] = useState(false);
  const [hojaMenu, setHojaMenu] = useState(false);
  const [seoAbierto, setSeoAbierto] = useState(false);
  const [disenoPagina, setDisenoPagina] = useState(false);
  const [cambioPagina, setCambioPagina] = useState<string | null>(null);
  /** Hoja «Carta» de la sección `menu_full`: solo elige la carta y lleva a Carta (B/13-07). */
  const [carta, setCarta] = useState<{ seccionId: string } | null>(null);
  const [vistaPrevia, setVistaPrevia] = useState(false);
  const [plantillaSede, setPlantillaSede] = useState(false);
  const tp = useTextosPlantillaSede();
  const categoriasSitio = useCategoriasMenu(ed.enV2 ? ed.sitioBranch : ed.selectedBranchId, ed.estadoCarga !== 'listo');
  const categorias = useMemo(() => ({ lista: categoriasSitio.categorias, cargando: categoriasSitio.cargando }), [categoriasSitio]);

  // Entradas directas: ?seleccion=encabezado|pie (Diseño › Encabezado y pie), ?panel=seo (SEO y
  // redes › «Corregir»), ?accion=publicar (vista previa del borrador).
  const [entradaHecha, setEntradaHecha] = useState(false);
  useEffect(() => {
    if (entradaHecha || ed.estadoCarga !== 'listo' || typeof window === 'undefined') return;
    setEntradaHecha(true);
    const q = new URLSearchParams(window.location.search);
    const seleccion = q.get('seleccion');
    if (seleccion === 'encabezado') ed.seleccionarZona('header');
    if (seleccion === 'pie') ed.seleccionarZona('footer');
    if (q.get('panel') === 'seo') setSeoAbierto(true);
    if (q.get('accion') === 'publicar' && ed.enV2) setPublicarAbierto(true);
  }, [entradaHecha, ed]);

  // Un conflicto abre su diálogo (A/05i).
  const hayConflicto = !!ed.conflicto;
  useEffect(() => {
    if (hayConflicto) setConflictoAbierto(true);
  }, [hayConflicto]);

  // Atajos del editor (Ctrl+Z, Ctrl+Shift+Z / Ctrl+Y, Ctrl+S, Ctrl+D, Supr, Esc).
  useEffect(() => {
    const alPulsar = (e: KeyboardEvent) => {
      const ctrl = e.ctrlKey || e.metaKey;
      const tag = (e.target as HTMLElement | null)?.tagName;
      const escribiendo = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || (e.target as HTMLElement | null)?.isContentEditable;
      const k = e.key.toLowerCase();
      if (ctrl && k === 's') {
        e.preventDefault();
        void ed.guardarAhora();
        return;
      }
      if (escribiendo) return;
      if (ctrl && !e.shiftKey && k === 'z') {
        e.preventDefault();
        if (ed.canUndo) ed.deshacer();
      } else if (ctrl && ((e.shiftKey && k === 'z') || k === 'y')) {
        e.preventDefault();
        if (ed.canRedo) ed.rehacer();
      } else if (ctrl && k === 'd' && ed.activeSectionId) {
        e.preventDefault();
        void ed.duplicarSeccion(ed.activeSectionId);
      } else if (e.key === 'Delete' && ed.activeSectionId) {
        e.preventDefault();
        setEliminar(ed.activeSectionId);
      } else if (e.key === 'Escape' && !hojaMenu) {
        ed.seleccionarSeccion(null);
        ed.seleccionarZona(null);
      }
    };
    window.addEventListener('keydown', alPulsar);
    return () => window.removeEventListener('keydown', alPulsar);
  }, [ed, hojaMenu]);

  // Salir con cambios: el navegador avisa (legacy sin guardar o un guardado V2 en curso).
  const pendiente = ed.hasChanges;
  useEffect(() => {
    if (!pendiente) return;
    const avisar = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    window.addEventListener('beforeunload', avisar);
    return () => window.removeEventListener('beforeunload', avisar);
  }, [pendiente]);

  const settings = ed.settings;
  const tema = useMemo(() => temaDeAjustes(settings), [settings]);

  // Paneles «Encabezado» y «Pie de página»: valores de la plantilla, menús y destinos de botón.
  const giroShell = useMemo(() => giroDeTipoOrganizacion(ed.giroTypeId), [ed.giroTypeId]);
  const porDefectoShell = useMemo(() => {
    if (ed.enV2) return ed.documento ? shellPorDefectoDelDocumento(ed.documento, giroShell) : null;
    const plantilla = (settings as unknown as Record<string, unknown> | null)?.template_id;
    return shellPorDefecto(typeof plantilla === 'string' ? plantilla : null, giroShell, ed.pages.map((p) => p.slug));
  }, [ed.enV2, ed.documento, ed.pages, settings, giroShell]);
  const paginasDestino = useMemo(
    () => (ed.enV2 && ed.documento ? ed.documento.paginas.map((p) => ({ slug: p.slug, titulo: p.titulo })) : ed.pages.map((p) => ({ slug: p.slug, titulo: p.title }))),
    [ed.enV2, ed.documento, ed.pages],
  );
  const menusEncabezado = useMemo(
    () =>
      ed.enV2 && ed.documento
        ? ed.documento.menus.map((m) => ({ id: m.id, name: m.nombre, enlaces: m.items.length }))
        : ed.availableMenus.map((m) => ({ id: m.id, name: m.name })),
    [ed.enV2, ed.documento, ed.availableMenus],
  );
  const menusPie = useMemo(() => {
    if (!ed.enV2 || !ed.documento) return null;
    const doc = ed.documento;
    return doc.shell.footer.menuIds.map((id) => doc.menus.find((m) => m.id === id)).filter((m): m is NonNullable<typeof m> => !!m).map((m) => ({ id: m.id, nombre: m.nombre }));
  }, [ed.enV2, ed.documento]);
  const coloresTema = useMemo(
    () => ({ fondo: tema.colores.fondo ?? '#FFFFFF', texto: tema.colores.texto ?? '#111827', acento: tema.colores.acento ?? tema.colores.primario ?? '#3651D4' }),
    [tema],
  );
  const { cambiarDocumento } = ed;
  const anadirMenuPie = useCallback(() => {
    cambiarDocumento((d) => {
      const id = nuevoIdSeccion();
      return { ...d, menus: [...d.menus, { id, nombre: t('zonaGlobal.pie.nuevoMenu'), items: [] }], shell: { ...d.shell, footer: { ...d.shell.footer, menuIds: [...d.shell.footer.menuIds, id] } } };
    });
    setHojaMenu(true);
  }, [cambiarDocumento, t]);
  const quitarMenuPie = useCallback(
    (id: string) => cambiarDocumento((d) => ({ ...d, shell: { ...d.shell, footer: { ...d.shell.footer, menuIds: d.shell.footer.menuIds.filter((x) => x !== id) } } })),
    [cambiarDocumento],
  );
  const paleta = useMemo(() => {
    const c = tema.colores;
    return c.primario && c.secundario && c.acento && c.fondo && c.texto
      ? { primary: c.primario, secondary: c.secundario, accent: c.acento, background: c.fondo, text: c.texto }
      : undefined;
  }, [tema]);

  const pagina = ed.currentPage;
  const seccion = pagina?.sections.find((s) => s.id === ed.activeSectionId) ?? null;

  const estadoPill: EstadoPublicacion | null = useMemo(() => {
    if (!ed.enV2) return null;
    if (ed.programacion && !ed.hasChanges) return { tipo: 'programado', fecha: ed.programacion.ejecutarEn };
    if (ed.estadoGuardado === 'guardando' || ed.hasChanges) return { tipo: 'guardando' };
    if (ed.listaCambios) {
      return resolverEstadoPublicacion({
        publicadoEn: ed.hayPublicacion ? 'publicado' : null,
        cambiosSinPublicar: ed.listaCambios.length,
      });
    }
    if (!ed.hayPublicacion) return { tipo: 'sin_publicar' };
    return ed.cambiosSinPublicar ? { tipo: 'borrador' } : { tipo: 'publicado' };
  }, [ed.enV2, ed.programacion, ed.hasChanges, ed.estadoGuardado, ed.listaCambios, ed.hayPublicacion, ed.cambiosSinPublicar]);

  const seleccionarDesdeLienzo = useCallback(
    (id: string, detalle: { enlace: boolean; productoId?: number }) => {
      if (id === 'header' || id === 'footer') {
        const zona = id as ZonaGlobal;
        if (detalle.enlace && ed.zonaGlobal === zona) setHojaMenu(true);
        ed.seleccionarZona(zona);
        setPanelDerecho('inspector');
        return;
      }
      ed.seleccionarSeccion(id);
      setPanelDerecho('inspector');
      const s = ed.currentPage?.sections.find((x) => x.id === id);
      if (s?.section_type === 'menu_full' && detalle.productoId && ed.ambitoSeccion(id) !== 'heredada') {
        setCarta({ seccionId: id });
      }
    },
    [ed],
  );

  const abrirVistaPrevia = async () => {
    const pestana = window.open('', '_blank');
    if (pestana) pestana.opener = null;
    setVistaPrevia(true);
    try {
      const url = await ed.pedirVistaPrevia();
      if (!url) {
        pestana?.close();
        return;
      }
      if (pestana) pestana.location.href = url;
      else window.open(url, '_blank', 'noopener,noreferrer');
    } catch {
      pestana?.close();
    } finally {
      setVistaPrevia(false);
    }
  };

  const elegirSitio = async (id: string | null) => {
    const branchId = id === null ? null : Number(id);
    if (!ed.enV2) {
      // Una sede sin sitio propio NO se edita sobre las páginas del principal (el editor legacy
      // caía a ellas sin avisar): se ofrece crear su sitio, con la plantilla de su tipo de negocio.
      if (branchId !== null && ed.apiV2 && ed.permisos.editar && !ed.sitios.some((s) => s.branchId === branchId)) {
        setCrearSitio(branchId);
        return;
      }
      await ed.cambiarSedeLegacy(branchId);
      return;
    }
    const r = await ed.elegirSitioV2(branchId);
    if (r === 'crear') setCrearSitio(branchId);
  };

  /** Sitio principal sin borrador V2: se puede crear (menú «⋯» y banda «Editas el sitio en vivo»). */
  const puedeCrearBorrador =
    !ed.enV2 && ed.apiV2 && ed.selectedBranchId === null && ed.permisos.editar && !ed.sitios.some((s) => s.branchId === null && s.versionBorrador !== null);

  // ── Menú «⋯» ────────────────────────────────────────────────────────────
  const acciones: AccionFila[] = [];
  acciones.push({ id: 'seo', etiqueta: t('acciones.seoPagina'), icono: Search, onSelect: () => setSeoAbierto(true) });
  if (!ed.enV2) {
    acciones.push({ id: 'diseno', etiqueta: t('acciones.disenoPagina'), icono: LayoutTemplate, onSelect: () => setDisenoPagina(true) });
  }
  if (ed.urlPublica) {
    acciones.push({ id: 'ver', etiqueta: t('barra.verPublicado'), icono: ExternalLink, onSelect: () => window.open(ed.urlPublica as string, '_blank', 'noopener,noreferrer') });
  }
  if (ed.enV2 && ed.documento) {
    if (ed.programacion) {
      acciones.push({ id: 'cancelar-prog', etiqueta: t('acciones.cancelarProgramacion'), icono: CalendarX, onSelect: () => void ed.cancelarProgramacion() });
    }
    if (ed.esSedeV2) {
      acciones.push({ id: 'herencia', etiqueta: t('acciones.verHerencia'), icono: Store, onSelect: () => setHerencia(true) });
      // «Aplicar plantilla de <tipo> a esta sede»: reemplaza el borrador (queda en el historial).
      const tipoSede = ed.tipoDeSede(ed.sitioBranch);
      if (esTipoSedePlantilla(tipoSede) && ed.permisos.editar) {
        acciones.push({
          id: 'plantilla-sede',
          etiqueta: tp('accion', { tipo: tp(`tipos.${tipoSede}`) }),
          icono: LayoutTemplate,
          onSelect: () => setPlantillaSede(true),
        });
      }
      const propios = new Set(ed.documento.menus.map((m) => m.id));
      for (const m of ed.basePrincipal?.documento.menus ?? []) {
        if (!propios.has(m.id)) continue;
        acciones.push({ id: `copiar-${m.id}`, etiqueta: t('acciones.copiarMenu', { menu: m.nombre }), icono: Copy, onSelect: () => void ed.llevarMenu(m.id) });
      }
    }
    if (ed.sitioV2.sitio?.v2Adoptado) {
      acciones.push({ id: 'desactivar', etiqueta: t('acciones.desactivarV2'), icono: PowerOff, onSelect: () => setAdopcion(false), destructiva: true });
    } else {
      acciones.push({
        id: 'activar',
        etiqueta: t('acciones.activarV2'),
        icono: Power,
        onSelect: () => setAdopcion(true),
        deshabilitada: !LECTOR_PUBLICO_V2_LISTO || !ed.sitioV2.sitio?.revisionPublicadaId,
        motivo: !LECTOR_PUBLICO_V2_LISTO ? t('acciones.activarV2SinLector') : t('acciones.activarV2PublicaPrimero'),
      });
      if (!ed.esSedeV2) {
        acciones.push({ id: 'legacy', etiqueta: t('acciones.editarSinV2'), icono: Undo2, onSelect: () => void ed.salirDeV2() });
      }
    }
  } else if (puedeCrearBorrador) {
    acciones.push({ id: 'crear-v2', etiqueta: t('acciones.crearBorrador'), icono: ArrowLeftRight, onSelect: () => setCrearSitio(null) });
  }

  // ── Estados de pantalla ─────────────────────────────────────────────────
  if (ed.estadoCarga === 'cargando' || !ed.organizationId) return <EsqueletoEditor />;
  if (ed.estadoCarga === 'sin_permiso') {
    return (
      <PantallaEstado>
        <EmptyState
          variante="forbidden"
          titulo={t('estado.sinPermisoTitulo')}
          descripcion={t('estado.sinPermisoDescripcion')}
          accion={{ etiqueta: t('estado.volverPaginas'), href: RUTA_PAGINAS_EDITOR }}
        />
      </PantallaEstado>
    );
  }
  if (ed.estadoCarga === 'no_encontrada' || !pagina) {
    return (
      <PantallaEstado>
        <EmptyState
          variante="error"
          titulo={t('estado.noEncontradaTitulo')}
          descripcion={t('estado.noEncontradaDescripcion')}
          accion={{ etiqueta: t('estado.irPaginas'), href: RUTA_PAGINAS_EDITOR }}
        />
      </PantallaEstado>
    );
  }
  if (ed.estadoCarga === 'error') {
    return (
      <PantallaEstado>
        <EmptyState variante="error" titulo={t('estado.errorTitulo')} descripcion={t('estado.errorDescripcion')} onReintentar={ed.recargar} />
      </PantallaEstado>
    );
  }

  const nombreSeccionSel = seccion ? nombreDeSeccion(seccion.section_type) : null;
  const etiquetaSeleccion = ed.zonaGlobal
    ? t(ed.zonaGlobal === 'header' ? 'lienzo.encabezado' : 'lienzo.pie')
    : nombreSeccionSel
      ? leerEstiloSeccion(seccion?.settings).tipografia?.modo === 'propia'
        ? t('lienzo.seccionPropia', { seccion: nombreSeccionSel })
        : t('lienzo.seccion', { seccion: nombreSeccionSel })
      : null;

  const textoPublicar = ed.enV2 ? (ed.esSedeV2 ? t('barra.publicarSede', { sede: ed.nombreSitio }) : t('barra.publicar')) : t('barra.guardarPublicar');
  // En legacy guardar sale en vivo: exige publicar (y el servidor lo vuelve a exigir).
  const puedePublicar = ed.enV2
    ? ed.permisos.publicar && (ed.cambiosSinPublicar || !ed.hayPublicacion)
    : ed.permisos.editar && ed.permisos.publicar && ed.hasChanges;
  const motivoNoPublicar = !ed.permisos.publicar
    ? t('barra.sinPermisoPublicar')
    : ed.enV2
      ? t('barra.nadaQuePublicar')
      : !ed.hasChanges
        ? t('barra.nadaQueGuardar')
        : undefined;
  const alPublicar = () => (ed.enV2 ? setPublicarAbierto(true) : void ed.guardarLegacy());

  const dialogos = (
    <>
      <DialogoPublicar
        abierto={publicarAbierto}
        onAbiertoChange={setPublicarAbierto}
        nombreSitio={ed.nombreSitio}
        esSede={ed.esSedeV2}
        direccion={ed.host}
        cambios={ed.listaCambios}
        ultimaPublicacion={ed.ultimaPublicacion}
        principalConCambios={ed.basePrincipal?.principalConCambiosSinPublicar}
        v2Adoptado={!!ed.sitioV2.sitio?.v2Adoptado}
        activaraWeb={debeActivarAlPublicar({ v2Adoptado: !!ed.sitioV2.sitio?.v2Adoptado, lectorListo: LECTOR_PUBLICO_V2_LISTO })}
        programarDisponible={ed.programarDisponible}
        publicando={ed.publicando}
        onVer={(destino) => {
          if (destino.paginaId !== pagina.id) void ed.cambiarPagina(destino.paginaId);
          if (destino.seccionId) ed.seleccionarSeccion(destino.seccionId);
        }}
        onPublicar={async (o) => {
          if (await ed.publicar({ nota: o.nota, tambienPrincipal: o.tambienPrincipal })) setPublicarAbierto(false);
        }}
        onProgramar={async (cuando, nota) => {
          if (await ed.programar(cuando, nota)) setPublicarAbierto(false);
        }}
      />
      <ConfirmDialog
        abierto={eliminar !== null}
        onAbiertoChange={(a) => !a && setEliminar(null)}
        titulo={t('eliminar.titulo')}
        descripcion={
          ed.esSedeV2 && eliminar
            ? t('eliminar.descripcionSede', { sede: ed.nombreSitio })
            : ed.enV2
              ? t('eliminar.descripcionBorrador')
              : t('eliminar.descripcionLegacy')
        }
        textoConfirmar={t('eliminar.confirmar')}
        tono="peligro"
        onConfirmar={async () => {
          if (eliminar) await ed.eliminarSeccion(eliminar);
          setEliminar(null);
        }}
      />
      <ConfirmDialog
        abierto={crearSitio !== undefined}
        onAbiertoChange={(a) => !a && !creandoSitio && setCrearSitio(undefined)}
        titulo={crearSitio === null ? t('sede.crearBorradorTitulo') : t('sede.sinSitioTitulo', { sede: ed.nombreSede(crearSitio ?? null) })}
        descripcion={
          crearSitio === null
            ? t('sede.crearBorradorDescripcion')
            : esTipoSedePlantilla(ed.tipoDeSede(crearSitio ?? null))
              ? t('sede.crearSitioDescripcionPlantilla', { tipo: tp(`tipos.${ed.tipoDeSede(crearSitio ?? null)}`) })
              : t('sede.crearSitioDescripcion')
        }
        textoConfirmar={
          crearSitio === null
            ? t('sede.crearBorrador')
            : esTipoSedePlantilla(ed.tipoDeSede(crearSitio ?? null))
              ? t('sede.crearConPlantilla', { tipo: tp(`tipos.${ed.tipoDeSede(crearSitio ?? null)}`) })
              : t('sede.crearSitio')
        }
        tono="marca"
        cargando={creandoSitio}
        onConfirmar={async () => {
          if (crearSitio === undefined) return;
          setCreandoSitio(true);
          const ok = await ed.crearSitioSede(crearSitio);
          setCreandoSitio(false);
          if (ok) setCrearSitio(undefined);
        }}
      />
      <ConfirmDialog
        abierto={adopcion !== null}
        onAbiertoChange={(a) => !a && setAdopcion(null)}
        titulo={adopcion ? t('adopcion.activarTitulo', { sitio: ed.nombreSitio }) : t('adopcion.desactivarTitulo', { sitio: ed.nombreSitio })}
        descripcion={adopcion ? t('adopcion.activarDescripcion') : ed.esSedeV2 ? t('adopcion.desactivarSede') : t('adopcion.desactivarDescripcion')}
        textoConfirmar={adopcion ? t('adopcion.activar') : t('adopcion.desactivar')}
        tono={adopcion ? 'marca' : 'peligro'}
        onConfirmar={async () => {
          if (adopcion !== null && (await ed.cambiarAdopcion(adopcion))) setAdopcion(null);
        }}
      />
      <ConfirmDialog
        abierto={cambioPagina !== null}
        onAbiertoChange={(a) => !a && setCambioPagina(null)}
        titulo={t('pagina.descartarTitulo')}
        descripcion={t('pagina.descartarDescripcion')}
        textoConfirmar={t('pagina.descartar')}
        tono="advertencia"
        onConfirmar={async () => {
          if (cambioPagina) await ed.cambiarPagina(cambioPagina);
          setCambioPagina(null);
        }}
      />
      {ed.esSedeV2 && ed.sitioBranch !== null && (
        <DialogoAplicarPlantillaSede
          abierto={plantillaSede}
          onAbiertoChange={setPlantillaSede}
          branchId={ed.sitioBranch}
          nombreSede={ed.nombreSitio}
          antesDeAplicar={ed.guardarAhora}
          onAplicada={ed.trasAplicarPlantilla}
        />
      )}
      <DialogoSeoPagina
        abierto={seoAbierto}
        onAbiertoChange={setSeoAbierto}
        pagina={pagina.title}
        valores={{ meta_title: pagina.meta_title ?? '', meta_description: pagina.meta_description ?? '', og_image_url: pagina.og_image_url ?? '' }}
        onGuardar={ed.cambiarSeoPagina}
      />
      {ed.conflicto && (
        <DialogoConflicto
          abierto={conflictoAbierto}
          onAbiertoChange={setConflictoAbierto}
          conflicto={ed.conflicto}
          prepararCombinacion={ed.prepararCombinacion}
          onResolver={ed.resolverConflicto}
        />
      )}
    </>
  );

  if (!esEscritorio) {
    return (
      <>
        <EditorMovil editor={ed} estado={estadoPill} onPublicar={alPublicar} onVistaPrevia={() => void abrirVistaPrevia()} categorias={categorias} />
        {ed.preguntaSede && (
          <PreguntaSede flotante sede={ed.nombreSitio} accion={ed.preguntaSede.accion} onResponder={(d) => void ed.responderPreguntaSede(d)} onCancelar={ed.cancelarPreguntaSede} />
        )}
        {dialogos}
      </>
    );
  }

  const sedesSwitcher = ed.enV2
    ? ed.sedes.filter((s) => s.enLaWeb || s.tieneSitio).map((s) => ({ id: String(s.branchId), nombre: s.nombre }))
    : ed.publishedBranches.map((b) => ({ id: String(b.id), nombre: b.name }));
  const sitioActual = ed.enV2 ? (ed.sitioBranch === null ? null : String(ed.sitioBranch)) : ed.selectedBranchId === null ? null : String(ed.selectedBranchId);

  return (
    <div className="flex h-[100dvh] flex-col overflow-hidden bg-canvas text-fg">
      <BarraEditor
        paginas={ed.pages.map((p) => ({ id: p.id, title: p.title }))}
        paginaId={pagina.id}
        onCambiarPagina={(id) => (!ed.enV2 && ed.hasChanges ? setCambioPagina(id) : void ed.cambiarPagina(id))}
        sitioActual={sitioActual}
        sedes={sedesSwitcher}
        onCambiarSitio={sedesSwitcher.length > 0 ? (id) => void elegirSitio(id) : undefined}
        dispositivo={ed.dispositivo}
        onDispositivo={ed.setDispositivo}
        onDeshacer={ed.deshacer}
        onRehacer={ed.rehacer}
        puedeDeshacer={ed.canUndo}
        puedeRehacer={ed.canRedo}
        estado={estadoPill}
        errorGuardado={ed.enV2 && ed.estadoGuardado === 'error' && !ed.conflicto}
        cambiosLegacy={ed.hasChanges}
        enV2={ed.enV2}
        urlPublica={ed.hayPublicacion ? ed.urlPublica : null}
        onVistaPrevia={() => void abrirVistaPrevia()}
        generandoVistaPrevia={vistaPrevia}
        textoPublicar={textoPublicar}
        onPublicar={alPublicar}
        publicando={ed.publicando || ed.isSaving}
        puedePublicar={puedePublicar}
        motivoNoPublicar={puedePublicar ? undefined : motivoNoPublicar}
        acciones={acciones}
      />

      {ed.conflicto && (
        <BandaConflicto conflicto={ed.conflicto} onResolver={() => setConflictoAbierto(true)} />
      )}
      {!ed.enV2 && !ed.conflicto && (
        <BandaEnVivo onCrearBorrador={puedeCrearBorrador ? () => setCrearSitio(null) : undefined} />
      )}
      {ed.programacion && ed.hasChanges && (
        <div className="border-b border-line px-4 py-2">
          <AvisoTonal
            tono="advertencia"
            compacto
            titulo={t('publicar.programadaConCambiosTitulo', { fecha: formatDateTime(ed.programacion.ejecutarEn) })}
            descripcion={t('publicar.programadaConCambios')}
          />
        </div>
      )}

      <div className="flex min-h-0 flex-1">
        <div className={panelIzquierdo === 'estilo' ? 'w-[360px] shrink-0 border-r border-line' : 'w-[280px] shrink-0 border-r border-line'}>
          {panelIzquierdo === 'estilo' ? (
            <PanelEstiloSitio
              enV2={ed.enV2}
              sitio={ed.sitioV2}
              documento={ed.documento}
              onCambiarDocumento={ed.cambiarDocumento}
              settings={settings}
              onCambiarAjustes={ed.cambiarAjustes}
              giroTypeId={ed.giroTypeId}
              onCerrar={() => setPanelIzquierdo('secciones')}
            />
          ) : (
            <ListaSecciones
              className="h-full"
              tituloPagina={pagina.title}
              secciones={pagina.sections}
              seleccionada={ed.activeSectionId}
              zona={ed.zonaGlobal}
              onSeleccionar={(id) => {
                ed.seleccionarSeccion(id);
                setPanelDerecho('inspector');
              }}
              onSeleccionarZona={(z) => {
                ed.seleccionarZona(z);
                setPanelDerecho('inspector');
              }}
              onAlternarVisible={ed.alternarVisible}
              onDuplicar={(id) => void ed.duplicarSeccion(id)}
              onEliminar={setEliminar}
              onMover={ed.moverSeccion}
              onAnadir={() => {
                ed.recargarConteoFuentes();
                setAnadir(true);
              }}
              onEstiloSitio={() => setPanelIzquierdo('estilo')}
              onHistorial={ed.enV2 ? () => setPanelDerecho((p) => (p === 'historial' ? 'inspector' : 'historial')) : undefined}
              historialActivo={panelDerecho === 'historial'}
              ambito={ed.esSedeV2 ? ed.ambitoSeccion : undefined}
              onPorDefecto={() => void ed.materializarPorDefecto()}
            />
          )}
        </div>

        <LienzoEditor
          url={ed.urlLienzo}
          host={ed.host}
          dispositivo={ed.dispositivo}
          recarga={ed.previewRefreshKey}
          secciones={ed.seccionesLienzo}
          ajustes={ed.ajustesLienzo}
          seleccion={ed.activeSectionId ?? ed.zonaGlobal}
          pagina={{ tipo: pagina?.page_type ?? null, slug: pagina?.slug ?? null }}
          etiquetaSeleccion={ed.vistaVersion ? null : etiquetaSeleccion}
          avisoSeccion={ed.avisoSeccion}
          onClic={ed.vistaVersion ? undefined : seleccionarDesdeLienzo}
          onQuitar={(id) => setEliminar(id)}
          version={
            ed.vistaVersion
              ? {
                  titulo: t('historial.viendo', { n: ed.vistaVersion.numero, fecha: formatDateTime(ed.vistaVersion.publicadaEn) }),
                  onVolver: ed.cerrarVistaVersion,
                  onRestaurar: () => void ed.restaurar({ tipo: 'revision', id: ed.vistaVersion!.id }),
                }
              : null
          }
        />

        <div className="flex w-[360px] shrink-0 flex-col border-l border-line bg-surface">
          {ed.preguntaSede && (
            <PreguntaSede
              className="m-3 mb-0"
              sede={ed.nombreSitio}
              accion={ed.preguntaSede.accion}
              onResponder={(d) => void ed.responderPreguntaSede(d)}
              onCancelar={ed.cancelarPreguntaSede}
            />
          )}
          <div className="min-h-0 flex-1">
          {panelDerecho === 'historial' && ed.enV2 && ed.sitioV2.sitio ? (
            <PanelHistorial
              className="h-full"
              sitioId={ed.sitioV2.sitio.id}
              borradorActualizadoEn={ed.sitioV2.borrador?.actualizadoEn ?? null}
              cambiosBorrador={ed.listaCambios?.length ?? null}
              marca={`${ed.sitioV2.sitio.revisionPublicadaId ?? ''}|${ed.sitioV2.borrador?.version ?? ''}`}
              onCerrar={() => setPanelDerecho('inspector')}
              onVer={(r) => void ed.verVersion(r)}
              onRestaurar={ed.restaurar}
            />
          ) : ed.zonaGlobal && settings && porDefectoShell ? (
            ed.zonaGlobal === 'header' ? (
              <InspectorEncabezado
                key="header"
                ajustes={settings as unknown as Record<string, unknown>}
                onCambiar={(c) => ed.cambiarAjustes(c as Partial<WebsiteSettings>)}
                menus={menusEncabezado}
                paginas={paginasDestino}
                porDefecto={porDefectoShell}
                enBorrador={ed.enV2}
                dispositivo={ed.dispositivo}
                coloresTema={coloresTema}
                onEditarMenu={() => setHojaMenu(true)}
                onCerrar={() => ed.seleccionarZona(null)}
              />
            ) : (
              <InspectorPie
                key="footer"
                ajustes={settings as unknown as Record<string, unknown>}
                onCambiar={(c) => ed.cambiarAjustes(c as Partial<WebsiteSettings>)}
                menusPie={menusPie}
                porDefecto={porDefectoShell}
                enBorrador={ed.enV2}
                giro={giroShell}
                coloresTema={coloresTema}
                onEditarMenus={() => setHojaMenu(true)}
                onAnadirMenu={ed.enV2 && ed.documento ? anadirMenuPie : undefined}
                onQuitarMenu={ed.enV2 && ed.documento ? quitarMenuPie : undefined}
                onCerrar={() => ed.seleccionarZona(null)}
              />
            )
          ) : seccion ? (
            <InspectorSeccion
              key={seccion.id}
              className="h-full"
              seccion={seccion}
              organizationId={ed.organizationId}
              enBorrador={ed.enV2}
              onCambiarContenido={(c) => ed.cambiarContenido(seccion.id, c)}
              onCambiarVariante={(v) => ed.cambiarVariante(seccion.id, v)}
              onCambiarEstilo={(e) => ed.cambiarEstilo(seccion.id, e)}
              onCambiarVisibilidad={(v) => ed.cambiarVisibilidad(seccion.id, v)}
              onAlternarVisible={() => ed.alternarVisible(seccion.id, !seccion.is_visible)}
              onDuplicar={() => void ed.duplicarSeccion(seccion.id)}
              onEliminar={() => setEliminar(seccion.id)}
              onEditarCarta={seccion.section_type === 'menu_full' ? () => setCarta({ seccionId: seccion.id }) : undefined}
              tema={tema}
              paleta={paleta}
              catalogoFuentes={FONTS}
              categorias={categorias}
              aviso={ed.avisoSeccion(seccion)}
              pestanaInicial={(new URLSearchParams(typeof window === 'undefined' ? '' : window.location.search).get('pestana') as PestanaSeccion | null) ?? undefined}
              sede={
                ed.esSedeV2
                  ? {
                      nombre: ed.nombreSitio,
                      estilo: (() => {
                        const origen = ed.origenEstilo(seccion);
                        return origen ? { nombre: ed.nombreSitio, origen, onRestablecer: (g) => ed.restablecerGrupo(seccion.id, g) } : null;
                      })(),
                    }
                  : null
              }
            />
          ) : (
            <div className="flex h-full flex-col items-center justify-center gap-2 p-6 text-center">
              <MousePointerClick aria-hidden="true" className="size-8 text-fg-muted" strokeWidth={1.5} />
              <p className="text-sm font-medium text-fg">{t('inspector.vacioTitulo')}</p>
              <p className="text-[13px] leading-[18px] text-fg-secondary">{t('inspector.vacioDescripcion')}</p>
            </div>
          )}
          </div>
        </div>
      </div>

      {dialogos}

      <DialogoAnadirSeccion
        abierto={anadir}
        onAbiertoChange={setAnadir}
        onAnadir={(tipo, variante) => void ed.anadirSeccion(tipo, variante)}
        tipoSede={
          ed.publishedBranches.find((b) => b.id === (ed.enV2 ? ed.sitioBranch : ed.selectedBranchId))?.branch_type ?? tipoSedeDesdeGiro(ed.giro)
        }
        tipoPagina={pagina.page_type}
        pagina={pagina.title}
        despuesDe={(() => {
          const i = ed.indiceInsercion() - 1;
          const previa = i >= 0 ? pagina.sections[i] : null;
          return previa ? nombreDeSeccion(previa.section_type) : null;
        })()}
        sede={ed.esSedeV2 ? ed.nombreSitio : null}
        conteos={ed.conteoFuentes}
      />

      {ed.zonaGlobal &&
        (ed.enV2 && ed.documento ? (
          <HojaMenuV2
            abierto={hojaMenu}
            onAbiertoChange={setHojaMenu}
            zona={ed.zonaGlobal}
            documento={ed.documento}
            branchId={ed.sitioBranch}
            onCambiarItems={ed.cambiarItemsMenu}
          />
        ) : (
          ed.organizationId && (
            <HojaMenu
              abierto={hojaMenu}
              onAbiertoChange={setHojaMenu}
              zona={ed.zonaGlobal}
              organizationId={ed.organizationId}
              menuEncabezado={
                settings?.header_menu_id
                  ? { id: settings.header_menu_id, name: ed.availableMenus.find((m) => m.id === settings.header_menu_id)?.name ?? t('menu.asignado') }
                  : null
              }
              pendingMenuUpdatesRef={ed.pendingMenuUpdates}
              onPendingChanges={(hay) => {
                if (hay) ed.marcarCambio();
              }}
            />
          )
        ))}

      {ed.esSedeV2 && settings && (
        <PanelHerencia
          abierto={herencia}
          onAbiertoChange={setHerencia}
          nombreSede={ed.nombreSitio}
          origenes={ed.origenes}
          valores={settings as unknown as Record<string, unknown>}
          onHeredar={(c) => ed.fijarHerenciaCampo(c, 'inherit')}
          onVaciar={(c) => ed.fijarHerenciaCampo(c, 'clear')}
        />
      )}

      {!ed.enV2 && (
        <PanelAdaptable abierto={disenoPagina} onAbiertoChange={setDisenoPagina} titulo={t('acciones.disenoPagina')} icono={LayoutTemplate}>
          <PageLayoutPanel pageType={pagina.page_type} pageSettings={pagina.page_settings} onUpdate={ed.cambiarDisenoPagina} />
        </PanelAdaptable>
      )}

      {carta &&
        (() => {
          const s = pagina.sections.find((x) => x.id === carta.seccionId);
          if (!s) return null;
          return (
            <HojaCartaEditor
              abierto
              onAbiertoChange={(a) => !a && setCarta(null)}
              content={(s.content ?? {}) as Record<string, unknown>}
              onCambiarContenido={(c) => ed.cambiarContenido(s.id, c)}
              deshabilitado={!ed.permisos.editar}
            />
          );
        })()}

      <span className="sr-only" aria-live="polite">
        {ed.estadoGuardado === 'guardando' ? t('guardado.guardando') : ''}
      </span>
    </div>
  );
}

export default function EditorSitio() {
  return (
    <OrganizationTimezoneProvider>
      <Editor />
    </OrganizationTimezoneProvider>
  );
}
