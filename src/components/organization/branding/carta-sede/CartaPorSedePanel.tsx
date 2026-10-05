'use client';

/**
 * Carta por sede (Sitio web → «Carta por sede»). Figma ERP 1786:898095 · paso 2
 * 1787:142162. Por sede y por categoría: si el producto sale en la web, su
 * precio web (vacío = precio vigente de Inventario, que se muestra como
 * placeholder) y si está agotado (con «hasta» opcional). Los cambios se
 * acumulan en un borrador y se guardan en UN lote; las acciones de categoría
 * se aplican a toda la categoría en un lote.
 *
 * Lee y escribe por `/api/website/carta-sede` (organización de la sesión,
 * RLS y `website.sites.edit` en el servidor). Sedes con `branchService` y
 * categorías con `categoryService`.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Ban, Check, Eye, EyeOff, Info, Link2, PackageX, Pencil, RotateCcw, Store, Undo2 } from 'lucide-react';
import { useOrganization } from '@/lib/hooks/useOrganization';
import { useMonedaOrganizacion } from '@/lib/hooks/useOrgCurrency';
import { useToast } from '@/components/ui/use-toast';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  CampoFecha,
  CampoNumero,
  Dialogo,
  EmptyState,
  PaginationCompact,
  RowActionsMenu,
  SearchInput,
  SegmentedControl,
  StatusBadge,
  clasesBoton,
  type AccionFila,
} from '@/components/kit';
import { branchService } from '@/lib/services/branchService';
import categoryService, { type Category } from '@/lib/services/categoryService';
import {
  AJUSTE_PRINCIPAL,
  FILTROS_CARTA_SEDE,
  type AccionCategoria,
  type CambioProducto,
  type FiltroCartaSede,
  type ProductoCartaSede,
  type RespuestaListadoCartaSede,
} from '@/lib/services/website/cartaSede';
import type { Branch } from '@/types/branch';
import { cn } from '@/utils/Utils';

const SIN_CATEGORIA = 'todas';

/** Lo que se ve en pantalla: ajuste guardado + borrador. */
interface Vista {
  is_listed: boolean;
  web_price: number | null;
  is_sold_out: boolean;
  agotado_hasta: string | null;
}

function vistaDe(p: ProductoCartaSede, cambio: CambioProducto | undefined): Vista {
  const base: Vista = p.ajuste
    ? { is_listed: p.ajuste.is_listed, web_price: p.ajuste.web_price, is_sold_out: p.ajuste.agotado_ahora, agotado_hasta: p.ajuste.agotado_hasta }
    : { is_listed: true, web_price: null, is_sold_out: false, agotado_hasta: null };
  if (!cambio) return base;
  if (cambio.restablecer) return { is_listed: true, web_price: null, is_sold_out: false, agotado_hasta: null };
  return {
    is_listed: cambio.is_listed ?? base.is_listed,
    web_price: cambio.web_price !== undefined ? cambio.web_price : base.web_price,
    is_sold_out: cambio.is_sold_out ?? base.is_sold_out,
    agotado_hasta: cambio.is_sold_out === false ? null : cambio.agotado_hasta !== undefined ? cambio.agotado_hasta : base.agotado_hasta,
  };
}

function esPrincipal(v: Vista): boolean {
  return v.is_listed && v.web_price === null && !v.is_sold_out;
}

/** Suma un cambio parcial al borrador. Tras «restablecer», los campos se escriben explícitos. */
function sumarCambio(previo: CambioProducto | undefined, productId: number, parche: Omit<CambioProducto, 'product_id'>): CambioProducto {
  if (parche.restablecer) return { product_id: productId, restablecer: true };
  if (previo?.restablecer) {
    return {
      product_id: productId,
      is_listed: AJUSTE_PRINCIPAL.is_listed,
      web_price: AJUSTE_PRINCIPAL.web_price,
      is_sold_out: AJUSTE_PRINCIPAL.is_sold_out,
      agotado_hasta: null,
      ...parche,
    };
  }
  return { ...(previo ?? {}), ...parche, product_id: productId };
}

interface Grupo {
  categoriaId: number | null;
  productos: ProductoCartaSede[];
}

function agrupar(productos: readonly ProductoCartaSede[]): Grupo[] {
  const grupos: Grupo[] = [];
  for (const p of productos) {
    const ultimo = grupos[grupos.length - 1];
    if (ultimo && ultimo.categoriaId === p.category_id) ultimo.productos.push(p);
    else grupos.push({ categoriaId: p.category_id, productos: [p] });
  }
  return grupos;
}

async function leerError(res: Response): Promise<string> {
  const json = (await res.json().catch(() => ({}))) as { error?: string };
  return json.error || `HTTP ${res.status}`;
}

export default function CartaPorSedePanel() {
  const t = useTranslations('org.branding.cartaSede');
  const { organization } = useOrganization();
  const organizationId = organization?.id;
  const { toast } = useToast();
  const { formatear } = useMonedaOrganizacion();

  const [sedes, setSedes] = useState<Branch[] | null>(null);
  const [categorias, setCategorias] = useState<Category[]>([]);
  const [sedeId, setSedeId] = useState<number | null>(null);
  const [categoriaId, setCategoriaId] = useState<string>(SIN_CATEGORIA);
  const [busqueda, setBusqueda] = useState('');
  const [filtro, setFiltro] = useState<FiltroCartaSede>('todos');
  const [pagina, setPagina] = useState(1);

  const [datos, setDatos] = useState<RespuestaListadoCartaSede | null>(null);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [borrador, setBorrador] = useState<Map<number, CambioProducto>>(new Map());
  const [guardando, setGuardando] = useState(false);
  const [accionPendiente, setAccionPendiente] = useState<{ categoriaId: number; accion: AccionCategoria } | null>(null);
  const [recarga, setRecarga] = useState(0);

  // Sedes y categorías de la organización (servicios existentes).
  useEffect(() => {
    if (!organizationId) return;
    let cancelado = false;
    branchService
      .getBranches(organizationId)
      .then((lista) => {
        if (cancelado) return;
        const activas = lista.filter((b) => b.is_active !== false && b.id != null);
        setSedes(activas);
        const principal = activas.find((b) => b.is_main) ?? activas[0];
        setSedeId((actual) => actual ?? (principal?.id as number | undefined) ?? null);
      })
      .catch(() => !cancelado && setSedes([]));
    categoryService
      .getAll(organizationId)
      .then((lista) => !cancelado && setCategorias(lista.filter((c) => c.is_active !== false)))
      .catch(() => !cancelado && setCategorias([]));
    return () => {
      cancelado = true;
    };
  }, [organizationId]);

  // Listado de la sede.
  useEffect(() => {
    if (!sedeId) return;
    const control = new AbortController();
    const params = new URLSearchParams({ branch_id: String(sedeId), filtro, pagina: String(pagina) });
    if (categoriaId !== SIN_CATEGORIA) params.set('category_id', categoriaId);
    if (busqueda.trim()) params.set('q', busqueda.trim());
    setCargando(true);
    setError(null);
    fetch(`/api/website/carta-sede?${params.toString()}`, { signal: control.signal, cache: 'no-store' })
      .then(async (res) => {
        if (!res.ok) throw new Error(await leerError(res));
        return (await res.json()) as RespuestaListadoCartaSede;
      })
      .then((r) => setDatos(r))
      .catch((e: unknown) => {
        if ((e as { name?: string })?.name === 'AbortError') return;
        setError(e instanceof Error ? e.message : String(e));
      })
      .finally(() => !control.signal.aborted && setCargando(false));
    return () => control.abort();
  }, [sedeId, categoriaId, busqueda, filtro, pagina, recarga]);

  const nombreCategoria = useMemo(() => {
    const mapa = new Map(categorias.map((c) => [c.id, c.name]));
    return (id: number | null) => (id == null ? t('sinCategoria') : mapa.get(id) ?? t('categoriaN', { id }));
  }, [categorias, t]);

  const sede = sedes?.find((s) => s.id === sedeId) ?? null;
  const puedeEditar = datos?.puedeEditar === true;
  const sucio = borrador.size > 0;

  const cambiar = useCallback((productId: number, parche: Omit<CambioProducto, 'product_id'>) => {
    setBorrador((prev) => {
      const siguiente = new Map(prev);
      siguiente.set(productId, sumarCambio(prev.get(productId), productId, parche));
      return siguiente;
    });
  }, []);

  const guardar = async () => {
    if (!sedeId || !sucio) return;
    setGuardando(true);
    try {
      const res = await fetch('/api/website/carta-sede', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tipo: 'productos', branch_id: sedeId, cambios: Array.from(borrador.values()) }),
      });
      if (!res.ok) throw new Error(await leerError(res));
      const r = (await res.json()) as { guardados: number };
      toast({ title: t('guardado'), description: t('guardadoDesc', { n: r.guardados }) });
      setBorrador(new Map());
      setRecarga((n) => n + 1);
    } catch (e) {
      toast({ title: t('errorGuardar'), description: e instanceof Error ? e.message : String(e), variant: 'destructive' });
    } finally {
      setGuardando(false);
    }
  };

  const aplicarCategoria = async () => {
    if (!sedeId || !accionPendiente) return;
    setGuardando(true);
    try {
      const res = await fetch('/api/website/carta-sede', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tipo: 'categoria', branch_id: sedeId, category_id: accionPendiente.categoriaId, accion: accionPendiente.accion }),
      });
      if (!res.ok) throw new Error(await leerError(res));
      const r = (await res.json()) as { guardados: number };
      toast({ title: t('guardado'), description: t('guardadoDesc', { n: r.guardados }) });
      // Los cambios de esa categoría en el borrador quedan superados por el lote.
      setBorrador((prev) => {
        const siguiente = new Map(prev);
        for (const p of datos?.productos ?? []) if (p.category_id === accionPendiente.categoriaId) siguiente.delete(p.id);
        return siguiente;
      });
      setAccionPendiente(null);
      setRecarga((n) => n + 1);
    } catch (e) {
      toast({ title: t('errorGuardar'), description: e instanceof Error ? e.message : String(e), variant: 'destructive' });
    } finally {
      setGuardando(false);
    }
  };

  const accionesCategoria = (id: number): AccionFila[] => [
    { id: 'mostrar', etiqueta: t('lote.mostrar'), icono: Eye, onSelect: () => setAccionPendiente({ categoriaId: id, accion: 'mostrar' }) },
    { id: 'ocultar', etiqueta: t('lote.ocultar'), icono: EyeOff, onSelect: () => setAccionPendiente({ categoriaId: id, accion: 'ocultar' }) },
    { id: 'agotar', etiqueta: t('lote.agotar'), icono: PackageX, onSelect: () => setAccionPendiente({ categoriaId: id, accion: 'agotar' }), separadorAntes: true },
    { id: 'disponible', etiqueta: t('lote.disponible'), icono: Check, onSelect: () => setAccionPendiente({ categoriaId: id, accion: 'disponible' }) },
    { id: 'restablecer', etiqueta: t('lote.restablecer'), icono: RotateCcw, onSelect: () => setAccionPendiente({ categoriaId: id, accion: 'restablecer' }), separadorAntes: true },
  ];

  const opcionesFiltro = FILTROS_CARTA_SEDE.map((f) => ({ valor: f, etiqueta: t(`filtros.${f}`) }));

  if (sedes && sedes.length === 0) {
    return <EmptyState variante="sinSucursal" titulo={t('sinSedes')} descripcion={t('sinSedesDesc')} />;
  }

  const grupos = agrupar(datos?.productos ?? []);

  return (
    <div className="space-y-4 pb-24">
      {/* Encabezado de la sección */}
      <div className="flex flex-col gap-1">
        <h2 className="text-lg font-semibold text-fg">{t('titulo')}</h2>
        <p className="text-sm text-fg-secondary">{t('descripcion')}</p>
      </div>

      {/* Barra: sede, categoría, búsqueda y filtro */}
      <div className="flex flex-col gap-3 lg:flex-row lg:flex-wrap lg:items-center">
        <div className="flex min-w-0 items-center gap-2">
          <label htmlFor="carta-sede-sede" className="shrink-0 text-sm font-medium text-fg">
            {t('sede')}
          </label>
          <Select
            value={sedeId ? String(sedeId) : undefined}
            onValueChange={(v) => {
              setSedeId(Number(v));
              setPagina(1);
            }}
            disabled={sucio || !sedes}
          >
            <SelectTrigger id="carta-sede-sede" className="w-full sm:w-56" aria-describedby={sucio ? 'carta-sede-sucio' : undefined}>
              <SelectValue placeholder={t('elegirSede')} />
            </SelectTrigger>
            <SelectContent>
              {(sedes ?? []).map((s) => (
                <SelectItem key={s.id} value={String(s.id)}>
                  {s.name}
                  {s.is_main ? ` · ${t('principal')}` : ''}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Select
          value={categoriaId}
          onValueChange={(v) => {
            setCategoriaId(v);
            setPagina(1);
          }}
        >
          <SelectTrigger className="w-full sm:w-56" aria-label={t('categoria')}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={SIN_CATEGORIA}>{t('todasCategorias')}</SelectItem>
            {categorias.map((c) => (
              <SelectItem key={c.id} value={String(c.id)}>
                {c.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <SearchInput
          value={busqueda}
          onChange={(v) => {
            setBusqueda(v);
            setPagina(1);
          }}
          debounceMs={300}
          placeholder={t('buscar')}
          etiqueta={t('buscar')}
          atajo={false}
          className="w-full lg:w-64"
        />
        <SegmentedControl
          opciones={opcionesFiltro}
          valor={filtro}
          onValorChange={(v) => {
            setFiltro(v);
            setPagina(1);
          }}
          etiqueta={t('filtrar')}
          tamano="sm"
          className="max-w-full overflow-x-auto"
        />
        <span className="flex items-center gap-1 text-xs text-fg-muted lg:ml-auto">
          <Link2 className="size-3.5" aria-hidden />
          {t('leyenda')}
        </span>
      </div>

      <div className="flex items-start gap-2 rounded-lg border border-line-info bg-info-subtle p-3 text-sm text-info-text">
        <Info className="mt-0.5 size-4 shrink-0" aria-hidden />
        <p>{t('aviso')}</p>
      </div>

      {datos && !datos.puedeEditar && (
        <div className="flex items-start gap-2 rounded-lg border border-line bg-subtle p-3 text-sm text-fg-secondary" role="status">
          <Ban className="mt-0.5 size-4 shrink-0" aria-hidden />
          <p>{t('soloLectura')}</p>
        </div>
      )}

      {error ? (
        <EmptyState variante="error" titulo={t('errorCargar')} descripcion={t('errorCargarDesc')} onReintentar={() => setRecarga((n) => n + 1)} />
      ) : cargando && !datos ? (
        <div className="space-y-2" aria-busy="true" aria-label={t('cargando')}>
          {[0, 1, 2, 3, 4].map((i) => (
            <div key={i} className="h-14 animate-pulse rounded-lg bg-subtle" />
          ))}
        </div>
      ) : grupos.length === 0 ? (
        busqueda || filtro !== 'todos' || categoriaId !== SIN_CATEGORIA ? (
          <EmptyState
            variante="search"
            termino={busqueda || undefined}
            onLimpiarFiltros={() => {
              setBusqueda('');
              setFiltro('todos');
              setCategoriaId(SIN_CATEGORIA);
              setPagina(1);
            }}
          />
        ) : (
          <EmptyState icono={Store} titulo={t('vacio')} descripcion={t('vacioDesc')} />
        )
      ) : (
        <div className={cn('space-y-4', cargando && 'opacity-60')} aria-busy={cargando || undefined}>
          {grupos.map((g, gi) => (
            <section key={`${g.categoriaId ?? 'x'}-${gi}`} className="overflow-hidden rounded-xl border border-line bg-surface">
              <header className="flex items-center justify-between gap-2 border-b border-line bg-subtle px-4 py-2">
                <h3 className="truncate text-sm font-semibold text-fg">
                  {nombreCategoria(g.categoriaId)}
                  <span className="ml-2 font-normal text-fg-muted">{t('enPagina', { n: g.productos.length })}</span>
                </h3>
                {puedeEditar && g.categoriaId != null && (
                  <RowActionsMenu
                    acciones={accionesCategoria(g.categoriaId)}
                    titulo={t('lote.titulo')}
                    etiquetaBoton={t('lote.boton', { categoria: nombreCategoria(g.categoriaId) })}
                    iconoBoton={Pencil}
                    tamano="sm"
                  />
                )}
              </header>

              {/* Escritorio: tabla */}
              <table className="hidden w-full text-sm md:table">
                <thead>
                  <tr className="border-b border-line text-left text-xs text-fg-secondary">
                    <th scope="col" className="px-4 py-2 font-medium">{t('col.producto')}</th>
                    <th scope="col" className="px-4 py-2 font-medium">{t('col.enWeb')}</th>
                    <th scope="col" className="px-4 py-2 font-medium">{t('col.precio')}</th>
                    <th scope="col" className="px-4 py-2 font-medium">{t('col.origen')}</th>
                    <th scope="col" className="px-4 py-2 font-medium">{t('col.agotado')}</th>
                  </tr>
                </thead>
                <tbody>
                  {g.productos.map((p) => (
                    <FilaProducto
                      key={p.id}
                      producto={p}
                      vista={vistaDe(p, borrador.get(p.id))}
                      editado={borrador.has(p.id)}
                      puedeEditar={puedeEditar}
                      hoy={datos?.hoy}
                      formatear={formatear}
                      onCambio={(parche) => cambiar(p.id, parche)}
                      modo="fila"
                    />
                  ))}
                </tbody>
              </table>

              {/* Celular: tarjetas */}
              <ul className="divide-y divide-line md:hidden">
                {g.productos.map((p) => (
                  <FilaProducto
                    key={p.id}
                    producto={p}
                    vista={vistaDe(p, borrador.get(p.id))}
                    editado={borrador.has(p.id)}
                    puedeEditar={puedeEditar}
                    hoy={datos?.hoy}
                    formatear={formatear}
                    onCambio={(parche) => cambiar(p.id, parche)}
                    modo="tarjeta"
                  />
                ))}
              </ul>
            </section>
          ))}

          {datos && datos.total > datos.tamano && (
            <PaginationCompact pagina={pagina} tamano={datos.tamano} total={datos.total} onPaginaChange={setPagina} cargando={cargando} />
          )}
          <p className="text-xs text-fg-muted">{t('pie')}</p>
        </div>
      )}

      {/* Barra de cambios sin guardar */}
      {sucio && (
        <div className="fixed inset-x-0 bottom-0 z-20 border-t border-line bg-surface px-4 py-3 shadow-lg" role="region" aria-label={t('cambios', { n: borrador.size })}>
          <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-2">
            <p id="carta-sede-sucio" className="text-sm text-fg">
              {t('cambios', { n: borrador.size })}
            </p>
            <div className="flex gap-2">
              <button type="button" className={clasesBoton({ variante: 'secundario', tamano: 'sm' })} onClick={() => setBorrador(new Map())} disabled={guardando}>
                {t('descartar')}
              </button>
              <button type="button" className={clasesBoton({ variante: 'primario', tamano: 'sm' })} onClick={guardar} disabled={guardando}>
                {guardando ? t('guardando') : t('guardar')}
              </button>
            </div>
          </div>
        </div>
      )}

      <Dialogo
        abierto={accionPendiente !== null}
        onAbiertoChange={(abierto) => !abierto && !guardando && setAccionPendiente(null)}
        titulo={accionPendiente ? t(`lote.confirmar.${accionPendiente.accion}`) : ''}
        descripcion={
          accionPendiente
            ? t('lote.confirmarDesc', { categoria: nombreCategoria(accionPendiente.categoriaId), sede: sede?.name ?? '' })
            : undefined
        }
        primario={{ etiqueta: t('lote.aplicar'), onClick: aplicarCategoria, cargando: guardando, destructiva: accionPendiente?.accion === 'ocultar' }}
        textoCancelar={t('cancelar')}
      />
    </div>
  );
}

interface FilaProductoProps {
  producto: ProductoCartaSede;
  vista: Vista;
  editado: boolean;
  puedeEditar: boolean;
  hoy?: string;
  formatear: (v: number | string | null | undefined) => string;
  onCambio: (parche: Omit<CambioProducto, 'product_id'>) => void;
  modo: 'fila' | 'tarjeta';
}

function FilaProducto({ producto: p, vista: v, editado, puedeEditar, hoy, formatear, onCambio, modo }: FilaProductoProps) {
  const t = useTranslations('org.branding.cartaSede');
  const placeholder = p.precio_vigente != null ? formatear(p.precio_vigente) : t('sinPrecio');
  const principal = esPrincipal(v);

  const nombre = (
    <div className="min-w-0">
      <p className={cn('truncate font-medium text-fg', !v.is_listed && 'text-fg-muted line-through')}>{p.name}</p>
      <p className="truncate text-xs text-fg-muted">
        {p.sku}
        {editado && <span className="ml-2 text-brand">· {t('editado')}</span>}
      </p>
    </div>
  );

  const switchWeb = (
    <Switch
      checked={v.is_listed}
      onCheckedChange={(c) => onCambio({ is_listed: c })}
      disabled={!puedeEditar}
      aria-label={t('aria.enWeb', { producto: p.name })}
    />
  );

  const precio = (
    <div className="flex flex-col gap-0.5">
      <CampoNumero
        valor={v.web_price}
        onValorChange={(n) => onCambio({ web_price: n })}
        decimales={2}
        minimo={0}
        placeholder={placeholder}
        disabled={!puedeEditar}
        tamano="sm"
        className="w-36"
        aria-label={t('aria.precio', { producto: p.name })}
      />
      {v.web_price != null && p.precio_vigente != null && (
        <span className="text-xs text-fg-muted">{t('base', { precio: formatear(p.precio_vigente) })}</span>
      )}
    </div>
  );

  const origen = principal ? (
    <span className="inline-flex items-center gap-1 rounded-full bg-subtle px-2 py-0.5 text-xs text-fg-secondary">
      <Link2 className="size-3" aria-hidden />
      {t('heredado')}
    </span>
  ) : (
    <div className="flex flex-col items-start gap-1">
      <span className="inline-flex items-center gap-1 rounded-full bg-brand-tint px-2 py-0.5 text-xs text-brand">
        <Pencil className="size-3" aria-hidden />
        {t('personalizado')}
      </span>
      {puedeEditar && (
        <button
          type="button"
          onClick={() => onCambio({ restablecer: true })}
          className="inline-flex items-center gap-1 text-xs text-fg-secondary hover:text-fg"
          aria-label={t('aria.restablecer', { producto: p.name })}
        >
          <Undo2 className="size-3" aria-hidden />
          {t('restablecer')}
        </button>
      )}
    </div>
  );

  const agotado = (
    <div className="flex flex-wrap items-center gap-2">
      <Switch
        checked={v.is_sold_out}
        onCheckedChange={(c) => onCambio(c ? { is_sold_out: true } : { is_sold_out: false })}
        disabled={!puedeEditar}
        aria-label={t('aria.agotado', { producto: p.name })}
      />
      {v.is_sold_out ? (
        <>
          <StatusBadge estado="agotado" tono="advertencia" etiqueta={t('agotado')} />
          <CampoFecha
            valor={v.agotado_hasta}
            onValorChange={(d) => onCambio({ is_sold_out: true, agotado_hasta: d || null })}
            min={hoy}
            hoy={hoy}
            limpiable
            placeholder={t('hastaOpcional')}
            disabled={!puedeEditar}
            tamano="sm"
            aria-label={t('aria.hasta', { producto: p.name })}
          />
        </>
      ) : (
        <StatusBadge estado="disponible" tono="exito" etiqueta={t('disponible')} />
      )}
    </div>
  );

  if (modo === 'fila') {
    return (
      <tr className={cn('border-b border-line last:border-b-0', editado && 'bg-brand-tint/40')}>
        <td className="max-w-xs px-4 py-2">{nombre}</td>
        <td className="px-4 py-2">{switchWeb}</td>
        <td className="px-4 py-2">{precio}</td>
        <td className="px-4 py-2">{origen}</td>
        <td className="px-4 py-2">{agotado}</td>
      </tr>
    );
  }

  return (
    <li className={cn('space-y-2 px-4 py-3', editado && 'bg-brand-tint/40')}>
      <div className="flex items-start justify-between gap-3">
        {nombre}
        <div className="flex items-center gap-2 text-xs text-fg-secondary">
          {t('col.enWeb')}
          {switchWeb}
        </div>
      </div>
      {precio}
      {origen}
      {agotado}
    </li>
  );
}
