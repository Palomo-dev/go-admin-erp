'use client';

/**
 * Pestaña «Por sede» del detalle de una carta (F-flujos/1, paso 2): por sede,
 * qué productos de ESTA carta salen en la web, su precio web (vacío = el
 * precio vigente de Inventario, que se muestra como placeholder) y si están
 * agotados (con «hasta» opcional).
 *
 * Es un componente CONTROLADO: no guarda ni tiene barra propia. Cada cambio va
 * al borrador de `useDetalleCarta` (`onCambiar`) y se guarda en el mismo lote
 * que el resto del detalle, con la SettingsSaveBar de la página. Lee con el
 * servicio único de Carta por sede (`useListadoCartaSede` → `/api/website/carta-sede`)
 * y aplica las mismas reglas de borrador (`vistaDe`, `sumarCambio`), así que no
 * hay una segunda lógica de «heredado / personalizado / agotado».
 *
 * Solo lista las categorías de la carta abierta: las demás no se ven aquí.
 */
import { useEffect, useMemo, useState } from 'react';
import { Check, Eye, EyeOff, Link2, PackageX, Pencil, RotateCcw, Store, Undo2 } from 'lucide-react';
import {
  CampoFecha,
  CampoNumero,
  EmptyState,
  PaginationCompact,
  RowActionsMenu,
  SearchInput,
  SegmentedControl,
  StatusBadge,
  type AccionFila,
} from '@/components/kit';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/utils/Utils';
import type { CategoriaCarta, SedeCarta } from '@/lib/website/carta';
import {
  FILTROS_CARTA_SEDE,
  esVistaPrincipal,
  vistaDe,
  type AccionCategoria,
  type CambioProducto,
  type FiltroCartaSede,
  type ProductoCartaSede,
  type VistaAjusteSede,
} from '@/lib/services/website/cartaSede';
import { formatearPrecio } from '../../ui/PriceTag';
import { CLASE_TAMANO_ICONO, TRAZO_ICONO } from '../../ui/iconosSitio';
import type { TraductorConfiguracion } from '../textos';
import { useListadoCartaSede } from './useCarta';

export interface PorSedeCartaProps {
  t: TraductorConfiguracion;
  /** Sedes donde sale la carta (ya filtradas por «En qué sedes»). */
  sedes: SedeCarta[];
  /** Categorías de la carta abierta, con sus productos. */
  categorias: CategoriaCarta[];
  moneda: string;
  /** Cambios sin guardar de cada sede (borrador del detalle). */
  porSede: Record<number, Record<number, CambioProducto>>;
  onCambiar: (sedeId: number, productoId: number, parche: Omit<CambioProducto, 'product_id'>) => void;
  /** Aplica una acción a todos los productos de la categoría en la sede (en el borrador). */
  onCategoria: (sedeId: number, categoriaId: number, accion: AccionCategoria) => void;
  deshabilitado?: boolean;
  /** Cambia tras guardar o descartar: vuelve a leer lo guardado. */
  recarga: unknown;
}

const ICONO_ACCION: Record<AccionCategoria, typeof Eye> = {
  mostrar: Eye,
  ocultar: EyeOff,
  agotar: PackageX,
  disponible: Check,
  restablecer: RotateCcw,
};

export function PorSedeCarta({ t, sedes, categorias, moneda, porSede, onCambiar, onCategoria, deshabilitado, recarga }: PorSedeCartaProps) {
  const [sedeId, setSedeId] = useState<number | null>(sedes[0]?.id ?? null);
  const [categoriaId, setCategoriaId] = useState<number | null>(categorias[0]?.id ?? null);
  const [busqueda, setBusqueda] = useState('');
  const [filtro, setFiltro] = useState<FiltroCartaSede>('todos');
  const [pagina, setPagina] = useState(1);

  // Si la carta deja de salir en la sede elegida o se quita la categoría, se toma la primera.
  useEffect(() => {
    if (!sedes.some((s) => s.id === sedeId)) setSedeId(sedes[0]?.id ?? null);
  }, [sedes, sedeId]);
  useEffect(() => {
    if (!categorias.some((c) => c.id === categoriaId)) setCategoriaId(categorias[0]?.id ?? null);
  }, [categorias, categoriaId]);

  const l = useListadoCartaSede({ sedeId, categoriaId, busqueda, filtro, pagina, recarga });
  const puedeEditar = !deshabilitado && l.datos?.puedeEditar === true;
  const borrador = (sedeId ? porSede[sedeId] : undefined) ?? {};
  const sede = sedes.find((s) => s.id === sedeId) ?? null;
  const categoria = categorias.find((c) => c.id === categoriaId) ?? null;
  const opcionesFiltro = useMemo(() => FILTROS_CARTA_SEDE.map((f) => ({ valor: f, etiqueta: t(`porSede.filtros.${f}`) })), [t]);

  if (sedes.length === 0) return <EmptyState variante="sinSucursal" titulo={t('porSede.sinSedesTitulo')} descripcion={t('porSede.sinSedesDescripcion')} />;
  if (categorias.length === 0) return <EmptyState icono={Store} titulo={t('porSede.sinCategoriasTitulo')} descripcion={t('porSede.sinCategoriasDescripcion')} />;

  const accionesCategoria: AccionFila[] =
    sedeId && categoriaId && puedeEditar && !categoria?.nueva
      ? (['mostrar', 'ocultar', 'agotar', 'disponible', 'restablecer'] as const).map((accion) => ({
          id: accion,
          etiqueta: t(`porSede.lote.${accion}`),
          icono: ICONO_ACCION[accion],
          separadorAntes: accion === 'agotar' || accion === 'restablecer',
          onSelect: () => onCategoria(sedeId, categoriaId, accion),
        }))
      : [];

  const productos = l.datos?.productos ?? [];
  const reiniciar = () => setPagina(1);

  const cuerpo = () => {
    if (l.fallo) return <EmptyState variante="error" titulo={t('porSede.errorTitulo')} descripcion={t('porSede.errorDescripcion')} onReintentar={l.reintentar} />;
    if (l.cargando && !l.datos) {
      return (
        <div className="flex flex-col gap-2" aria-busy="true">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-14 rounded-lg" />
          ))}
        </div>
      );
    }
    if (categoria?.nueva) return <EmptyState icono={Store} titulo={t('porSede.categoriaNuevaTitulo')} descripcion={t('porSede.categoriaNuevaDescripcion')} />;
    if (productos.length === 0) {
      return busqueda || filtro !== 'todos' ? (
        <EmptyState
          variante="search"
          termino={busqueda || undefined}
          onLimpiarFiltros={() => {
            setBusqueda('');
            setFiltro('todos');
            reiniciar();
          }}
        />
      ) : (
        <EmptyState icono={Store} titulo={t('porSede.vacioTitulo')} descripcion={t('porSede.vacioDescripcion')} />
      );
    }
    const filaDe = (p: ProductoCartaSede, modo: 'fila' | 'tarjeta') => (
      <FilaProductoSede
        key={p.id}
        t={t}
        producto={p}
        vista={vistaDe(p, borrador[p.id])}
        editado={borrador[p.id] !== undefined}
        puedeEditar={puedeEditar}
        hoy={l.datos?.hoy}
        moneda={moneda}
        onCambio={(parche) => sedeId && onCambiar(sedeId, p.id, parche)}
        modo={modo}
      />
    );
    return (
      <div className={cn('flex flex-col gap-3', l.cargando && 'opacity-60')} aria-busy={l.cargando || undefined}>
        <div className="overflow-hidden rounded-xl border border-line bg-surface">
          {/* Escritorio: tabla */}
          <table className="hidden w-full text-sm md:table">
            <thead>
              <tr className="border-b border-line text-left text-xs text-fg-secondary">
                <th scope="col" className="px-4 py-2 font-medium">{t('porSede.col.producto')}</th>
                <th scope="col" className="px-4 py-2 font-medium">{t('porSede.col.enWeb')}</th>
                <th scope="col" className="px-4 py-2 font-medium">{t('porSede.col.precio')}</th>
                <th scope="col" className="px-4 py-2 font-medium">{t('porSede.col.origen')}</th>
                <th scope="col" className="px-4 py-2 font-medium">{t('porSede.col.agotado')}</th>
              </tr>
            </thead>
            <tbody>{productos.map((p) => filaDe(p, 'fila'))}</tbody>
          </table>
          {/* Celular: tarjetas (ListCard) */}
          <ul className="divide-y divide-line md:hidden">{productos.map((p) => filaDe(p, 'tarjeta'))}</ul>
        </div>
        {l.datos && l.datos.total > l.datos.tamano && (
          <PaginationCompact pagina={pagina} tamano={l.datos.tamano} total={l.datos.total} onPaginaChange={setPagina} cargando={l.cargando} />
        )}
        <p className="text-xs text-fg-muted">{t('porSede.pie')}</p>
      </div>
    );
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:flex-wrap lg:items-center">
        <Select
          value={sedeId ? String(sedeId) : undefined}
          onValueChange={(v) => {
            setSedeId(Number(v));
            reiniciar();
          }}
        >
          <SelectTrigger className="h-10 w-full rounded-lg sm:w-56" aria-label={t('porSede.sede')}>
            <SelectValue placeholder={t('porSede.elegirSede')} />
          </SelectTrigger>
          <SelectContent>
            {sedes.map((s) => (
              <SelectItem key={s.id} value={String(s.id)}>
                {s.nombre}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          value={categoriaId ? String(categoriaId) : undefined}
          onValueChange={(v) => {
            setCategoriaId(Number(v));
            reiniciar();
          }}
        >
          <SelectTrigger className="h-10 w-full rounded-lg sm:w-56" aria-label={t('porSede.categoria')}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {categorias.map((c) => (
              <SelectItem key={c.id} value={String(c.id)}>
                {c.nombre}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <SearchInput
          value={busqueda}
          onChange={(v) => {
            setBusqueda(v);
            reiniciar();
          }}
          debounceMs={300}
          placeholder={t('porSede.buscar')}
          etiqueta={t('porSede.buscar')}
          atajo={false}
          className="w-full lg:w-64"
        />
        <SegmentedControl
          opciones={opcionesFiltro}
          valor={filtro}
          onValorChange={(v) => {
            setFiltro(v);
            reiniciar();
          }}
          etiqueta={t('porSede.filtrar')}
          tamano="sm"
          className="max-w-full overflow-x-auto"
        />
        {accionesCategoria.length > 0 && (
          <div className="lg:ml-auto">
            <RowActionsMenu
              acciones={accionesCategoria}
              titulo={t('porSede.lote.titulo')}
              etiquetaBoton={t('porSede.lote.boton', { categoria: categoria?.nombre ?? '', sede: sede?.nombre ?? '' })}
              iconoBoton={Pencil}
              tamano="md"
            />
          </div>
        )}
      </div>
      {l.datos && !l.datos.puedeEditar && <p className="text-sm text-fg-secondary">{t('porSede.soloLectura')}</p>}
      {cuerpo()}
    </div>
  );
}

interface FilaProductoSedeProps {
  t: TraductorConfiguracion;
  producto: ProductoCartaSede;
  vista: VistaAjusteSede;
  editado: boolean;
  puedeEditar: boolean;
  hoy?: string;
  moneda: string;
  onCambio: (parche: Omit<CambioProducto, 'product_id'>) => void;
  modo: 'fila' | 'tarjeta';
}

function FilaProductoSede({ t, producto: p, vista: v, editado, puedeEditar, hoy, moneda, onCambio, modo }: FilaProductoSedeProps) {
  const placeholder = p.precio_vigente != null ? formatearPrecio(p.precio_vigente, moneda) : t('porSede.sinPrecio');
  const heredado = esVistaPrincipal(v);

  const nombre = (
    <div className="min-w-0">
      <p className={cn('truncate font-medium text-fg', !v.is_listed && 'text-fg-muted line-through')}>{p.name}</p>
      <p className="truncate text-xs text-fg-muted">
        {p.sku}
        {editado && <span className="ml-2 text-link">· {t('porSede.editado')}</span>}
      </p>
    </div>
  );

  const enWeb = (
    <Switch checked={v.is_listed} onCheckedChange={(c) => onCambio({ is_listed: c })} disabled={!puedeEditar} aria-label={t('porSede.aria.enWeb', { producto: p.name })} />
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
        aria-label={t('porSede.aria.precio', { producto: p.name })}
      />
      {v.web_price != null && p.precio_vigente != null && (
        <span className="text-xs tabular-nums text-fg-muted">{t('porSede.base', { precio: formatearPrecio(p.precio_vigente, moneda) })}</span>
      )}
    </div>
  );

  const origen = heredado ? (
    <StatusBadge tamano="sm" estado="heredado" icono={Link2} etiqueta={t('porSede.heredado')} />
  ) : (
    <div className="flex flex-col items-start gap-1">
      <StatusBadge tamano="sm" estado="personalizado" icono={Pencil} etiqueta={t('porSede.personalizado')} />
      {puedeEditar && (
        <button
          type="button"
          onClick={() => onCambio({ restablecer: true })}
          className="inline-flex items-center gap-1 text-xs text-fg-secondary hover:text-fg"
          aria-label={t('porSede.aria.restablecer', { producto: p.name })}
        >
          <Undo2 aria-hidden="true" className={CLASE_TAMANO_ICONO.meta} strokeWidth={TRAZO_ICONO} />
          {t('porSede.restablecer')}
        </button>
      )}
    </div>
  );

  const agotado = (
    <div className="flex flex-wrap items-center gap-2">
      <Switch
        checked={v.is_sold_out}
        onCheckedChange={(c) => onCambio({ is_sold_out: c })}
        disabled={!puedeEditar}
        aria-label={t('porSede.aria.agotado', { producto: p.name })}
      />
      {v.is_sold_out ? (
        <>
          <StatusBadge tamano="sm" estado="agotado" tono="advertencia" icono={PackageX} etiqueta={t('porSede.agotado')} />
          <CampoFecha
            valor={v.agotado_hasta}
            onValorChange={(d) => onCambio({ is_sold_out: true, agotado_hasta: d || null })}
            min={hoy}
            hoy={hoy}
            limpiable
            placeholder={t('porSede.hastaOpcional')}
            disabled={!puedeEditar}
            tamano="sm"
            aria-label={t('porSede.aria.hasta', { producto: p.name })}
          />
        </>
      ) : (
        <StatusBadge tamano="sm" estado="disponible" tono="exito" icono={Check} etiqueta={t('porSede.disponible')} />
      )}
    </div>
  );

  if (modo === 'fila') {
    return (
      <tr className={cn('border-b border-line last:border-b-0', editado && 'bg-brand-tint')}>
        <td className="max-w-xs px-4 py-2">{nombre}</td>
        <td className="px-4 py-2">{enWeb}</td>
        <td className="px-4 py-2">{precio}</td>
        <td className="px-4 py-2">{origen}</td>
        <td className="px-4 py-2">{agotado}</td>
      </tr>
    );
  }
  return (
    <li className={cn('flex flex-col gap-2 px-4 py-3', editado && 'bg-brand-tint')}>
      <div className="flex items-start justify-between gap-3">
        {nombre}
        <div className="flex items-center gap-2 text-xs text-fg-secondary">
          {t('porSede.col.enWeb')}
          {enWeb}
        </div>
      </div>
      {precio}
      {origen}
      {agotado}
    </li>
  );
}
