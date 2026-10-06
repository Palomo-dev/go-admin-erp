'use client';

/**
 * Sitio web › Páginas › Menú y navegación (Figma A/04c, D/04-09 y D/04-10).
 *
 * - Arriba, la vista previa del encabezado con el tema del SITIO (y el megamenú armado con las
 *   categorías reales del Inventario cuando el enlace elegido las tiene).
 * - Tres columnas: «Encabezado» (árbol arrastrable; las páginas fuera del menú salen atenuadas),
 *   «Pie de página» por grupos (o «Categorías del Inventario» si el enlace elegido tiene submenú
 *   de categorías, o el menú elegido en la lista) e Inspector del enlace (o «Nuevo menú»).
 * - Abajo, «Menús de <sitio>» con el selector de sede, la herencia del principal y los menús con
 *   nombre (ubicación, enlaces, procedencia).
 *
 * Toda edición es local y pura (`operacionesMenu.ts`); «Guardar en borrador» guarda el documento
 * con `useSitioV2` (compare-and-swap; 409 → diálogo de conflicto). Si el sitio aún no tiene
 * borrador, el primer guardado lo crea a partir del sitio actual (`asegurar`) sin cambiar la web
 * pública. Una sede que hereda es de solo lectura hasta «Personalizar en esta sede».
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Eye, History, Loader2, Plus, RotateCcw, Save } from 'lucide-react';
import { AvisoTonal, ConfirmDialog, EmptyState, PanelAdaptable, RowActionsMenu, SettingsSaveBar, clasesBoton, useEsEscritorio, type AccionFila } from '@/components/kit';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from '@/components/ui/use-toast';
import { useOrganization } from '@/lib/hooks/useOrganization';
import { serializarDeterminista, type DocumentoSitio, type ItemMenu } from '@/lib/website/contrato/documentoSitio';
import { clienteSitiosV2, ErrorApiSitio } from '@/lib/website/v2/clienteSitiosV2';
import { MarcoSitioWeb } from '@/components/sitio-web/MarcoSitioWeb';
import { MegaMenuPreview } from '@/components/sitio-web/ui/MegaMenuPreview';
import { SiteHeaderPreview } from '@/components/sitio-web/ui/SiteHeaderPreview';
import { CLASE_TAMANO_ICONO, ICONO_TAREA_SITIO, TRAZO_ICONO } from '@/components/sitio-web/ui/iconosSitio';
import { RAIZ_SITIO_WEB, rutaEditorSitio } from '@/components/sitio-web/rutasSitioWeb';
import { useSitioV2 } from '@/components/sitio-web/useSitioV2';
import { useUrlSitio } from '@/components/sitio-web/useUrlSitio';
import { apiPaginas, ErrorApiPaginas } from './apiPaginas';
import { ColumnaCategoriasInventario, useCategoriasMenu } from './ColumnaCategoriasInventario';
import { ConstructorMenus } from './ConstructorMenus';
import { DialogoConflicto } from './DialogoConflicto';
import { FormularioNuevoMenu, type DatosNuevoMenu } from './FormularioNuevoMenu';
import { ICONO_ZONA_MENU, iconoDeItem } from './iconosPagina';
import { InspectorEnlace } from './InspectorEnlace';
import { ListaMenusSede } from './ListaMenusSede';
import {
  buscarItem,
  cabeHijo,
  cambiarUbicacion,
  categoriasComoSubmenu,
  categoriasDeItem,
  contarItems,
  crearMenu,
  duplicarMenu,
  eliminarMenu,
  fijarDestino,
  insertarItem,
  menuEncabezado,
  menusPie,
  nuevoItem,
  paginasEnMenu,
  quitarItem,
  reemplazarItemsMenu,
  renombrarItem,
  renombrarMenu,
  restablecerMenusDesde,
  urlContacto,
  type DestinoEnlace,
  type ErrorMenu,
  type UbicacionMenu,
} from './operacionesMenu';
import { esInicio, esPaginaLegal, esPlantillaTienda } from './tipoPagina';
import { useTextosPaginas } from './textos';
import type { RespuestaMenusSitio } from './tiposPaginas';
import { TituloZona } from './TituloZona';
import { useArrastreMenu } from './useArrastreMenu';
import { columnasMegaMenu, disposicionEncabezado, enlacesEncabezado, logoMarca, nombreMarca, temaDesdeDocumento } from './vistaMenus';

export const RUTA_PAGINAS_SITIO = `${RAIZ_SITIO_WEB}/paginas`;
const generarId = () => crypto.randomUUID();
const clonar = <T,>(v: T): T => JSON.parse(JSON.stringify(v)) as T;
const firmaMenus = (d: DocumentoSitio | null) => (d ? serializarDeterminista({ menus: d.menus, shell: d.shell }) : '');

interface Seleccion {
  menuId: string;
  itemId: string;
}

/** GET de permisos, sedes, giro y documento de solo lectura (`/api/sitio-web/paginas/menu`). */
function useMenusSitio(branchId: number | null) {
  const [datos, setDatos] = useState<RespuestaMenusSitio | null>(null);
  const [cargando, setCargando] = useState(true);
  const [fallo, setFallo] = useState<'error' | 'sin_permiso' | null>(null);
  const recargar = useCallback(
    async (silencioso = false) => {
      if (!silencioso) setCargando(true);
      setFallo(null);
      try {
        setDatos(await apiPaginas.menus(branchId));
      } catch (error) {
        setFallo(error instanceof ErrorApiPaginas && error.esSinPermiso ? 'sin_permiso' : 'error');
      } finally {
        if (!silencioso) setCargando(false);
      }
    },
    [branchId],
  );
  useEffect(() => {
    void recargar();
  }, [recargar]);
  return { datos, cargando, fallo, recargar };
}

function EsqueletoMenus() {
  return (
    <div className="flex flex-col gap-4 lg:gap-6" aria-busy="true">
      <Skeleton className="h-16 rounded-lg" />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3 lg:gap-6">
        {[0, 1, 2].map((i) => (
          <div key={i} className="flex flex-col gap-2 rounded-xl border border-line bg-surface p-4">
            <Skeleton className="h-5 w-1/2" />
            {[0, 1, 2, 3, 4].map((j) => (
              <Skeleton key={j} className="h-10 rounded-lg" />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

export function PantallaMenus() {
  const t = useTextosPaginas();
  const router = useRouter();
  const esEscritorio = useEsEscritorio();
  const { organization } = useOrganization();
  const url = useUrlSitio(organization?.id);
  const [sede, setSede] = useState<number | null>(null);
  const meta = useMenusSitio(sede);
  const sitioV2 = useSitioV2({ branchId: sede });
  const permisos = meta.datos?.permisos;
  const heredado = !sitioV2.borrador && meta.datos?.modo === 'heredado';
  const soloLectura = !permisos?.editar || heredado;
  const original = sitioV2.borrador?.documento ?? (meta.datos && meta.datos.modo !== 'v2' ? meta.datos.documento : null);
  const base = sitioV2.borrador?.basePrincipal?.documento ?? (heredado ? meta.datos?.documento ?? null : null);
  const categorias = useCategoriasMenu(sede, !permisos);

  const [local, setLocal] = useState<DocumentoSitio | null>(null);
  const [seleccion, setSeleccion] = useState<Seleccion | null>(null);
  const [menuEnEdicion, setMenuEnEdicion] = useState<string | null>(null);
  const [panel, setPanel] = useState<'inspector' | 'nuevo'>('inspector');
  const [restablecer, setRestablecer] = useState(false);
  const [personalizando, setPersonalizando] = useState(false);
  const [pendienteGuardar, setPendienteGuardar] = useState(false);
  const [sedePendiente, setSedePendiente] = useState<{ id: number | null } | null>(null);
  const localRef = useRef(local);
  localRef.current = local;
  const conservarLocal = useRef(false);

  // ── Guardado ──────────────────────────────────────────────────────────────
  const hacerGuardado = useCallback(async () => {
    const doc = localRef.current;
    if (!doc) return false;
    const ok = await sitioV2.guardar(() => doc);
    conservarLocal.current = false;
    if (ok) {
      toast({ title: t('menu.guardado') });
      void meta.recargar(true);
    } else if (!sitioV2.conflicto) {
      toast({ title: t('lista.noSePudo'), variant: 'destructive' });
    }
    return ok;
  }, [sitioV2, meta, t]);

  // Se declara ANTES del reinicio: tras crear el borrador, guarda lo que la persona editó.
  useEffect(() => {
    if (pendienteGuardar && sitioV2.borrador) {
      setPendienteGuardar(false);
      void hacerGuardado();
    }
  }, [pendienteGuardar, sitioV2.borrador, hacerGuardado]);

  const claveOriginal = sitioV2.borrador ? `v2:${sitioV2.borrador.sitio.id}:${sitioV2.borrador.version}` : meta.datos ? `m:${meta.datos.modo}:${sede}` : null;
  useEffect(() => {
    if (conservarLocal.current) return;
    setLocal(original ? clonar(original) : null);
    setSeleccion(null);
    setMenuEnEdicion(null);
    // `original` cambia de identidad en cada render; la clave dice cuándo es otro documento.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [claveOriginal]);

  const sucio = !!local && !!original && firmaMenus(local) !== firmaMenus(original);
  const cambios = useMemo(() => {
    if (!local || !original) return 0;
    const ids = new Set([...local.menus.map((m) => m.id), ...original.menus.map((m) => m.id)]);
    let n = 0;
    ids.forEach((id) => {
      const a = local.menus.find((m) => m.id === id);
      const b = original.menus.find((m) => m.id === id);
      if (serializarDeterminista(a ?? null) !== serializarDeterminista(b ?? null)) n += 1;
    });
    if (serializarDeterminista(local.shell) !== serializarDeterminista(original.shell)) n += 1;
    return n;
  }, [local, original]);

  useEffect(() => {
    if (!sucio) return;
    const aviso = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', aviso);
    return () => window.removeEventListener('beforeunload', aviso);
  }, [sucio]);

  const guardar = async () => {
    if (!local || soloLectura) return;
    if (!sitioV2.borrador) {
      conservarLocal.current = true;
      const creado = await sitioV2.asegurar();
      if (!creado) {
        conservarLocal.current = false;
        toast({ title: t('lista.noSePudo'), variant: 'destructive' });
        return;
      }
      setPendienteGuardar(true);
      return;
    }
    await hacerGuardado();
  };

  const vistaPrevia = async () => {
    if (!url.host) {
      toast({ title: t('menu.vistaPreviaError'), description: t('menu.vistaPreviaSinDireccion') });
      return;
    }
    if (!sitioV2.sitio) {
      window.open(`https://${url.host}`, '_blank', 'noopener,noreferrer');
      return;
    }
    const pestana = window.open('', '_blank');
    if (pestana) pestana.opener = null;
    try {
      if (sucio && !(await hacerGuardado())) {
        pestana?.close();
        return;
      }
      const { token } = await clienteSitiosV2.vistaPrevia(sitioV2.sitio.id, null);
      const destino = `https://${url.host}/vista-previa/${token}`;
      if (pestana) pestana.location.href = destino;
      else window.open(destino, '_blank', 'noopener,noreferrer');
    } catch (error) {
      pestana?.close();
      toast({ title: t('menu.vistaPreviaError'), description: error instanceof ErrorApiSitio ? error.message : undefined, variant: 'destructive' });
    }
  };

  const cambiarSede = (id: number | null) => {
    conservarLocal.current = false;
    setSede(id);
  };

  const personalizar = async () => {
    setPersonalizando(true);
    try {
      const s = await sitioV2.asegurar();
      if (!s) toast({ title: t('lista.noSePudo'), variant: 'destructive' });
      else toast({ title: t('sedes.personalizado') });
      await meta.recargar(true);
    } finally {
      setPersonalizando(false);
    }
  };

  // ── Derivados del documento local ───────────────────────────────────────
  const paginas = useMemo(() => (local?.paginas ?? []).filter((p) => !esPlantillaTienda(p)), [local]);
  const encabezado = local ? menuEncabezado(local) : null;
  const pie = local ? menusPie(local) : [];
  const enEncabezado = useMemo(() => paginasEnMenu(encabezado), [encabezado]);
  const ocultas = paginas.filter((p) => !enEncabezado.has(p.id) && !esPaginaLegal(p));
  const categoriasPorId = useMemo(() => new Map(categorias.categorias.map((c) => [String(c.id), c])), [categorias.categorias]);
  const menuSel = seleccion && local ? local.menus.find((m) => m.id === seleccion.menuId) ?? null : null;
  const nodoSel = menuSel && seleccion ? buscarItem(menuSel.items, seleccion.itemId) : null;
  const itemSel = nodoSel?.item ?? null;
  const paginasPorId = useMemo(() => new Map(paginas.map((p) => [p.id, p])), [paginas]);
  // El inspector lleva el mismo icono que la fila elegida (Carta = cubiertos, categoría = etiqueta).
  const iconoSel = itemSel ? iconoDeItem(itemSel, paginasPorId) : ICONO_TAREA_SITIO.menu;
  const conCategorias = !!(nodoSel && encabezado && menuSel?.id === encabezado.id && nodoSel.nivel === 0 && categoriasDeItem(nodoSel.item).size > 0);
  const menuMedio = menuEnEdicion && local ? local.menus.find((m) => m.id === menuEnEdicion && !pie.some((p) => p.id === m.id) && m.id !== encabezado?.id) ?? null : null;

  const cambiarDoc = (fn: (d: DocumentoSitio) => DocumentoSitio) => setLocal((d) => (d ? fn(d) : d));
  const aplicarItems = (menuId: string, items: ItemMenu[]) => cambiarDoc((d) => reemplazarItemsMenu(d, menuId, items));
  const errorMenu = (e: ErrorMenu) => toast({ title: t(`nuevoMenu.errores.${e}`), variant: 'destructive' });

  /** Menú del encabezado; si no existe, lo crea (vacío) en el documento local. */
  const asegurarEncabezado = (d: DocumentoSitio): { doc: DocumentoSitio; id: string } | null => {
    const actual = menuEncabezado(d);
    if (actual) return { doc: d, id: actual.id };
    const r = crearMenu(d, { nombre: t('menu.encabezado'), ubicacion: { tipo: 'encabezado' } }, generarId);
    if (!r.ok) {
      errorMenu(r.error);
      return null;
    }
    return { doc: r.documento, id: r.menuId };
  };

  const anadirEnlace = (menuId: string | null, destino?: DestinoEnlace, etiqueta?: string) => {
    if (!local) return;
    let doc = local;
    let id = menuId;
    if (id === null) {
      const r = asegurarEncabezado(doc);
      if (!r) return;
      doc = r.doc;
      id = r.id;
    }
    const menu = doc.menus.find((m) => m.id === id);
    if (!menu) return;
    if (contarItems(menu.items) >= 200) {
      toast({ title: t('menu.limiteItems'), variant: 'destructive' });
      return;
    }
    const enMenu = paginasEnMenu(menu);
    const pagina = paginas.find((p) => !enMenu.has(p.id)) ?? paginas[0];
    const dest: DestinoEnlace | undefined = destino ?? (pagina ? { tipo: 'page', paginaId: pagina.id } : undefined);
    if (!dest) return;
    const item = nuevoItem(dest, etiqueta ?? (dest.tipo === 'page' ? pagina?.titulo ?? '' : t('inspector.destino.externo')), generarId);
    setLocal(reemplazarItemsMenu(doc, id, [...menu.items, item]));
    setSeleccion({ menuId: id, itemId: item.id });
    setPanel('inspector');
  };

  const mostrarPagina = (paginaId: string) => {
    const p = paginas.find((x) => x.id === paginaId);
    if (p) anadirEnlace(encabezado?.id ?? null, { tipo: 'page', paginaId }, p.titulo);
  };

  const anadirCategoria = (categoriaId: number, padreId: string | null) => {
    if (!encabezado) return;
    const c = categoriasPorId.get(String(categoriaId));
    if (!c || !cabeHijo(encabezado.items, padreId)) {
      toast({ title: t('menu.profundidad'), variant: 'destructive' });
      return;
    }
    const item = nuevoItem({ tipo: 'entity', entidad: 'category', entidadId: String(c.id) }, c.nombre, generarId);
    aplicarItems(encabezado.id, insertarItem(encabezado.items, item, padreId));
  };

  const arrastreEncabezado = useArrastreMenu({
    items: encabezado?.items ?? [],
    onCambiar: (items) => encabezado && aplicarItems(encabezado.id, items),
    onSoltarCategoria: anadirCategoria,
    deshabilitado: soloLectura || !encabezado,
    ayuda: t('menu.arrastrarAnidar'),
  });

  // ── Acciones del inspector ──────────────────────────────────────────────
  const conItemSel = (fn: (items: ItemMenu[], id: string) => ItemMenu[]) => {
    if (menuSel && seleccion) aplicarItems(menuSel.id, fn(menuSel.items, seleccion.itemId));
  };
  const inspector = (
    <InspectorEnlace
      item={itemSel}
      nivel={nodoSel?.nivel ?? 0}
      paginas={paginas}
      categorias={categorias.categorias}
      giro={meta.datos?.giro ?? 'tienda'}
      soloLectura={soloLectura}
      onRenombrar={(texto) => conItemSel((items, id) => renombrarItem(items, id, texto))}
      onDestino={(destino) => conItemSel((items, id) => fijarDestino(items, id, destino))}
      onCategoriasSubmenu={(activar) =>
        conItemSel((items, id) =>
          categoriasComoSubmenu(
            items,
            id,
            categorias.categorias.filter((c) => c.padreId === null && c.activa).map((c) => ({ id: c.id, nombre: c.nombre })),
            activar,
            generarId,
          ),
        )
      }
      onQuitar={() => {
        conItemSel((items, id) => quitarItem(items, id).items);
        setSeleccion(null);
      }}
    />
  );

  // ── Menús con nombre ────────────────────────────────────────────────────
  const crearNuevoMenu = (datos: DatosNuevoMenu): string | null => {
    if (!local) return null;
    const r = crearMenu(local, { nombre: datos.nombre, ubicacion: datos.ubicacion }, generarId);
    if (!r.ok) return t(`nuevoMenu.errores.${r.error}`);
    let doc = r.documento;
    let primerItem: string | null = null;
    if (datos.primerEnlace) {
      const primeraCategoria = categorias.categorias.find((c) => c.padreId === null && c.activa);
      const destino: DestinoEnlace | null =
        datos.primerEnlace === 'pagina' && paginas[0]
          ? { tipo: 'page', paginaId: paginas[0].id }
          : datos.primerEnlace === 'categoria' && primeraCategoria
            ? { tipo: 'entity', entidad: 'category', entidadId: String(primeraCategoria.id) }
            : datos.primerEnlace === 'externo'
              ? { tipo: 'custom', url: 'https://' }
              : datos.primerEnlace === 'contacto'
                ? { tipo: 'custom', url: urlContacto('whatsapp', '') }
                : null;
      if (destino) {
        const etiqueta =
          destino.tipo === 'page' ? paginas[0].titulo : destino.tipo === 'entity' ? primeraCategoria?.nombre ?? '' : t(`nuevoMenu.tipos.${datos.primerEnlace}`);
        const item = nuevoItem(destino, etiqueta, generarId);
        doc = reemplazarItemsMenu(doc, r.menuId, [item]);
        primerItem = item.id;
      }
    }
    setLocal(doc);
    setMenuEnEdicion(r.menuId);
    setSeleccion(primerItem ? { menuId: r.menuId, itemId: primerItem } : null);
    setPanel('inspector');
    toast({ title: t('nuevoMenu.creado', { nombre: datos.nombre.trim() }) });
    return null;
  };

  const sedesEditables = (meta.datos?.sedes ?? []).map((s) => ({ id: String(s.branchId), nombre: s.nombre }));
  const nombreSitio = sede === null ? t('sedes.sitioPrincipal') : sedesEditables.find((s) => s.id === String(sede))?.nombre ?? '';

  // ── Cabecera ────────────────────────────────────────────────────────────
  const paginaInicio = paginas.find((p) => esInicio(p)) ?? paginas[0];
  const menuCabecera: AccionFila[] = [
    {
      id: 'restablecer',
      etiqueta: t('menu.restablecer'),
      icono: RotateCcw,
      oculta: !(sede !== null && sitioV2.borrador && base),
      deshabilitada: soloLectura,
      onSelect: () => setRestablecer(true),
    },
    {
      id: 'historial',
      etiqueta: t('menu.verHistorial'),
      icono: History,
      oculta: !paginaInicio,
      onSelect: () => paginaInicio && router.push(`${rutaEditorSitio(paginaInicio.id)}?panel=historial`),
    },
  ];
  const accionesCabecera =
    meta.fallo === 'sin_permiso' || (permisos && !permisos.editar) ? (
      <></>
    ) : (
      <>
        <button type="button" onClick={() => void vistaPrevia()} className={clasesBoton({ variante: 'secundario' })}>
          <Eye aria-hidden="true" className={CLASE_TAMANO_ICONO.base} strokeWidth={TRAZO_ICONO} />
          {t('menu.vistaPrevia')}
        </button>
        <button
          type="button"
          onClick={() => void guardar()}
          disabled={soloLectura || !sucio || sitioV2.guardando}
          className={clasesBoton({ variante: 'primario' })}
        >
          {sitioV2.guardando ? (
            <Loader2 aria-hidden="true" className={`${CLASE_TAMANO_ICONO.base} animate-spin motion-reduce:animate-none`} strokeWidth={TRAZO_ICONO} />
          ) : (
            <Save aria-hidden="true" className={CLASE_TAMANO_ICONO.base} strokeWidth={TRAZO_ICONO} />
          )}
          {t('menu.guardar')}
        </button>
        <RowActionsMenu acciones={menuCabecera} titulo={t('menu.masAcciones')} orientacion="horizontal" tamano="md" />
      </>
    );
  const subtitulo = sucio
    ? t('menu.cambiosSinGuardar')
    : conCategorias && itemSel
      ? t('menu.subtituloMega', { nombre: itemSel.etiqueta })
      : sedesEditables.length > 0
        ? t('menu.subtituloSedes')
        : t('menu.subtitulo');

  // ── Estados ─────────────────────────────────────────────────────────────
  const cargando = meta.cargando || (sitioV2.cargando && !local);
  const sinPermiso = meta.fallo === 'sin_permiso' || (!!permisos && !permisos.editar);
  const error = meta.fallo === 'error' || (!cargando && !local && !sinPermiso);

  let cuerpo;
  if (sinPermiso) {
    cuerpo = <EmptyState variante="forbidden" titulo={t('menu.sinPermisoTitulo')} descripcion={t('menu.sinPermisoDescripcion')} />;
  } else if (cargando) {
    cuerpo = <EsqueletoMenus />;
  } else if (error || !local) {
    cuerpo = (
      <EmptyState
        variante="error"
        titulo={t('menu.errorTitulo')}
        descripcion={t('lista.errorDescripcion')}
        onReintentar={() => {
          void meta.recargar();
          void sitioV2.recargar();
        }}
      />
    );
  } else {
    const columnaMedia = conCategorias ? (
      <ColumnaCategoriasInventario
        datos={categorias}
        enMenu={itemSel ? categoriasDeItem(itemSel) : new Set()}
        onAnadir={(id) => anadirCategoria(id, seleccion?.itemId ?? null)}
        arrastre={arrastreEncabezado}
        soloLectura={soloLectura}
        branchId={sede}
      />
    ) : menuMedio ? (
      <div className="flex flex-col gap-3">
        <TituloZona icono={ICONO_TAREA_SITIO.menu}>{menuMedio.nombre}</TituloZona>
        <ConstructorMenus
          menu={menuMedio}
          paginas={paginas}
          categorias={categoriasPorId}
          seleccionado={seleccion?.menuId === menuMedio.id ? seleccion.itemId : null}
          onSeleccionar={(itemId) => {
            setSeleccion({ menuId: menuMedio.id, itemId });
            setPanel('inspector');
          }}
          onCambiar={(items) => aplicarItems(menuMedio.id, items)}
          soloLectura={soloLectura}
          onAnadir={() => anadirEnlace(menuMedio.id)}
          textoVacio={t('menu.grupoVacio')}
        />
      </div>
    ) : (
      <div className="flex flex-col gap-3">
        <TituloZona icono={ICONO_ZONA_MENU.pie}>{t('menu.piePagina')}</TituloZona>
        {pie.length === 0 && <p className="text-sm text-fg-secondary">{t('menu.sinPie')}</p>}
        {pie.map((grupo) => (
          <div key={grupo.id} className="flex flex-col gap-1">
            <TituloZona nivel={3}>
              {grupo.nombre}
            </TituloZona>
            <ConstructorMenus
              menu={grupo}
              paginas={paginas}
              categorias={categoriasPorId}
              seleccionado={seleccion?.menuId === grupo.id ? seleccion.itemId : null}
              onSeleccionar={(itemId) => {
                setSeleccion({ menuId: grupo.id, itemId });
                setPanel('inspector');
              }}
              onCambiar={(items) => aplicarItems(grupo.id, items)}
              soloLectura={soloLectura}
              onAnadir={() => anadirEnlace(grupo.id)}
              textoVacio={t('menu.grupoVacio')}
            />
          </div>
        ))}
        {!soloLectura && pie.length < 10 && (
          <button
            type="button"
            onClick={() => {
              const r = crearMenu(local, { nombre: t('menu.grupoNuevo'), ubicacion: { tipo: 'pie', columna: pie.length + 1 } }, generarId);
              if (r.ok) setLocal(r.documento);
              else errorMenu(r.error);
            }}
            className="inline-flex h-8 items-center gap-2 self-start rounded-md px-2 text-[13px] font-medium text-fg hover:bg-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
          >
            <Plus aria-hidden="true" className={CLASE_TAMANO_ICONO.base} strokeWidth={TRAZO_ICONO} />
            {t('menu.anadirGrupo')}
          </button>
        )}
      </div>
    );

    const panelDerecho =
      panel === 'nuevo' && !soloLectura ? (
        <FormularioNuevoMenu
          sitioNombre={nombreSitio}
          columnasPie={pie.length}
          hayEncabezado={!!encabezado}
          onCrear={crearNuevoMenu}
          onCancelar={() => setPanel('inspector')}
        />
      ) : (
        <div className="flex flex-col gap-4">
          <TituloZona icono={iconoSel}>{itemSel ? t('inspector.titulo', { nombre: itemSel.etiqueta }) : t('inspector.tituloVacio')}</TituloZona>
          {inspector}
        </div>
      );

    const columnasMega = conCategorias ? columnasMegaMenu(itemSel, categoriasPorId, (n) => t('categorias.productos', { n })) : [];

    cuerpo = (
      <div className="flex flex-col gap-4 pb-20 lg:gap-6 lg:pb-0">
        {!sitioV2.borrador && meta.datos?.modo === 'legacy' && (
          <AvisoTonal tono="informacion" compacto titulo={t('menu.soloLecturaTitulo')} descripcion={t('menu.soloLecturaDescripcion')} />
        )}
        <div className="flex flex-col gap-0 overflow-hidden rounded-xl border border-line">
          <SiteHeaderPreview
            disposicion={disposicionEncabezado(local)}
            marca={{ nombre: nombreMarca(local, organization?.name ?? ''), logoUrl: logoMarca(local) }}
            enlaces={enlacesEncabezado(local, seleccion?.itemId ?? null)}
            textoBoton={meta.datos?.giro === 'restaurante' ? undefined : null}
            tema={temaDesdeDocumento(local)}
            celular={!esEscritorio}
            className="rounded-none border-0"
          />
          {columnasMega.length > 0 && esEscritorio && (
            <MegaMenuPreview columnas={columnasMega} tema={temaDesdeDocumento(local)} className="rounded-none border-0 border-t" />
          )}
        </div>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3 lg:gap-6">
          <section aria-labelledby="menu-encabezado" className="flex flex-col gap-3 rounded-xl border border-line bg-surface p-4">
            <div className="flex items-center justify-between gap-2">
              <TituloZona id="menu-encabezado" icono={ICONO_ZONA_MENU.encabezado}>
                {t('menu.encabezado')}
              </TituloZona>
              {!soloLectura && esEscritorio && <span className="text-xs text-fg-muted">{t('menu.arrastrarAnidar')}</span>}
            </div>
            <ConstructorMenus
              menu={encabezado ?? { id: '__sin__', nombre: t('menu.encabezado'), items: [] }}
              paginas={paginas}
              categorias={categoriasPorId}
              seleccionado={encabezado && seleccion?.menuId === encabezado.id ? seleccion.itemId : null}
              onSeleccionar={(itemId) => {
                if (!encabezado) return;
                setSeleccion({ menuId: encabezado.id, itemId });
                setPanel('inspector');
              }}
              onCambiar={(items) => encabezado && aplicarItems(encabezado.id, items)}
              soloLectura={soloLectura}
              ocultas={ocultas}
              onMostrarPagina={mostrarPagina}
              arrastre={arrastreEncabezado}
              onAnadir={() => anadirEnlace(encabezado?.id ?? null)}
              textoVacio={t('menu.sinEncabezado')}
            />
          </section>
          <section className="flex flex-col gap-3 rounded-xl border border-line bg-surface p-4">{columnaMedia}</section>
          {esEscritorio ? (
            <section className="flex flex-col gap-3 self-start rounded-xl border border-line bg-surface p-4">{panelDerecho}</section>
          ) : (
            panel === 'nuevo' &&
            !soloLectura && <section className="flex flex-col gap-3 rounded-xl border border-line bg-surface p-4">{panelDerecho}</section>
          )}
        </div>

        <ListaMenusSede
          documento={local}
          base={base}
          modo={sede === null ? 'principal' : heredado ? 'heredado' : 'propio'}
          sitioNombre={nombreSitio}
          sedes={sedesEditables}
          sedeActual={sede === null ? null : String(sede)}
          onCambiarSede={(id) => {
            const destino = id === null ? null : Number(id);
            if (sucio) setSedePendiente({ id: destino });
            else cambiarSede(destino);
          }}
          soloLectura={soloLectura}
          menuActivo={menuEnEdicion}
          onEditar={(id) => {
            setMenuEnEdicion(id);
            setPanel('inspector');
          }}
          onNuevo={() => setPanel('nuevo')}
          onRenombrar={(id, nombre) => cambiarDoc((d) => renombrarMenu(d, id, nombre))}
          onUbicacion={(id, u: UbicacionMenu) => {
            const r = cambiarUbicacion(local, id, u);
            if (r.ok) setLocal(r.documento);
            else errorMenu(r.error);
          }}
          onDuplicar={(id) => {
            const m = local.menus.find((x) => x.id === id);
            const r = duplicarMenu(local, id, t('sedes.copiaDe', { nombre: m?.nombre ?? '' }), generarId);
            if (r.ok) setLocal(r.documento);
            else errorMenu(r.error);
          }}
          onEliminar={(id) => {
            cambiarDoc((d) => eliminarMenu(d, id));
            if (seleccion?.menuId === id) setSeleccion(null);
            if (menuEnEdicion === id) setMenuEnEdicion(null);
          }}
          onPersonalizar={() => void personalizar()}
          onRestablecer={() => setRestablecer(true)}
          personalizando={personalizando}
        />

        {!esEscritorio && (
          <PanelAdaptable
            abierto={!!itemSel && panel === 'inspector'}
            onAbiertoChange={(v) => !v && setSeleccion(null)}
            titulo={itemSel ? t('inspector.titulo', { nombre: itemSel.etiqueta }) : ''}
            icono={iconoSel}
          >
            {inspector}
          </PanelAdaptable>
        )}

        {!soloLectura && (
          <SettingsSaveBar
            cambios={cambios}
            guardando={sitioV2.guardando}
            onGuardar={() => void guardar()}
            onDescartar={() => setLocal(original ? clonar(original) : null)}
            textoGuardar={t('menu.guardar')}
          />
        )}
      </div>
    );
  }

  return (
    <MarcoSitioWeb
      href={RUTA_PAGINAS_SITIO}
      titulo={t('menu.titulo')}
      icono={ICONO_TAREA_SITIO.menu}
      migasPadre={[{ etiqueta: t('menu.migaPaginas'), href: RUTA_PAGINAS_SITIO }]}
      subtitulo={sinPermiso ? url.host ?? undefined : subtitulo}
      host={url.host}
      estado={cargando && !sinPermiso ? 'cargando' : 'listo'}
      esqueleto={<EsqueletoMenus />}
      acciones={accionesCabecera}
    >
      {cuerpo}
      <ConfirmDialog
        abierto={restablecer}
        onAbiertoChange={setRestablecer}
        titulo={t('sedes.restablecerTitulo', { nombre: nombreSitio })}
        descripcion={t('sedes.restablecerDescripcion')}
        textoConfirmar={t('sedes.restablecerConfirmar')}
        tono="advertencia"
        icono={RotateCcw}
        onConfirmar={() => {
          if (base) cambiarDoc((d) => restablecerMenusDesde(d, base));
          setSeleccion(null);
          setRestablecer(false);
        }}
      />
      <ConfirmDialog
        abierto={sedePendiente !== null}
        onAbiertoChange={(v) => !v && setSedePendiente(null)}
        titulo={t('menu.salirTitulo')}
        descripcion={t('menu.salirDescripcion')}
        textoConfirmar={t('menu.salirConfirmar')}
        tono="advertencia"
        onConfirmar={() => {
          if (sedePendiente) cambiarSede(sedePendiente.id);
          setSedePendiente(null);
        }}
      />
      <DialogoConflicto
        abierto={sitioV2.conflicto}
        onCerrar={() => void sitioV2.recargar()}
        onRecargar={async () => {
          conservarLocal.current = false;
          await sitioV2.recargar();
        }}
      />
    </MarcoSitioWeb>
  );
}
