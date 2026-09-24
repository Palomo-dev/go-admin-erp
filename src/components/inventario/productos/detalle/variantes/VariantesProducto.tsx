'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { ExternalLink, GitBranch, Pencil, Plus, Power, PowerOff, Sparkles, Trash2 } from 'lucide-react';
import { DataTable, type ColumnaTabla } from '@/components/kit/DataTable';
import { EmptyState } from '@/components/kit/EmptyState';
import { ListCard } from '@/components/kit/ListCard';
import { StatusBadge } from '@/components/kit/StatusBadge';
import type { AccionFila } from '@/components/kit/acciones';
import { useFormatoEntero, useLocaleIntl } from '@/components/kit/useIdiomaKit';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/components/ui/use-toast';
import { productoService } from '@/lib/services/productoService';
import { calcularMargen, tonoMargen } from '../../logica/margen';
import { resumenAtributos } from '../../logica/variantes';
import { useProductoDetalle } from '../ContextoProducto';
import { DialogoVariante } from './DialogoVariante';
import { GeneradorVariantes } from './GeneradorVariantes';
import { useCatalogoAtributos } from './catalogoAtributos';
import { cargarVariantes, stockVariante, type VarianteDetalle } from './modeloVariantes';

/**
 * Sub-pestaña «Variantes» del detalle (PARIDAD A.4; Figma «Producto —
 * Variantes y modificadores»): resumen de atributos, tabla (SKU · Nombre ·
 * Atributos · Precio · Costo · Margen · Stock · Código · Estado), crear y
 * editar en diálogo (hoja en móvil), generar combinaciones, activar o
 * desactivar y eliminar como baja lógica (`status = 'deleted'`: el historial
 * de ventas y kardex de la variante se conserva).
 */
type Carga = 'cargando' | 'listo' | 'error';

export function VariantesProducto() {
  const t = useTranslations('productoDetalle.variantes');
  const tc = useTranslations('productoDetalle.comun');
  const { producto, organizacionId, resumen, permisos, recargar, moneda, sucursalActiva, mensajeError } = useProductoDetalle();
  const router = useRouter();
  const { toast } = useToast();
  const formatoEntero = useFormatoEntero();
  const localeIntl = useLocaleIntl();
  const catalogo = useCatalogoAtributos(organizacionId);

  const [variantes, setVariantes] = useState<VarianteDetalle[]>([]);
  const [carga, setCarga] = useState<Carga>('cargando');
  const [mostrarInactivas, setMostrarInactivas] = useState(true);
  const [dialogo, setDialogo] = useState<{ abierto: boolean; variante: VarianteDetalle | null }>({ abierto: false, variante: null });
  const [generadorAbierto, setGeneradorAbierto] = useState(false);
  const [aEliminar, setAEliminar] = useState<VarianteDetalle | null>(null);
  const [eliminando, setEliminando] = useState(false);
  const turno = useRef(0);

  const uuids = useMemo(() => new Map((producto.children ?? []).map((c) => [c.id, c.uuid] as const)), [producto.children]);
  const rastreoPorVariante = useMemo(
    () => new Map((producto.children ?? []).map((c) => [c.id, c.track_stock] as const)),
    [producto.children],
  );

  const cargar = useCallback(
    async (silencioso = false) => {
      const mio = ++turno.current;
      if (!silencioso) setCarga('cargando');
      try {
        const lista = await cargarVariantes(organizacionId, producto.id);
        if (mio === turno.current) {
          setVariantes(lista);
          setCarga('listo');
        }
      } catch {
        if (mio === turno.current) setCarga('error');
      }
    },
    [organizacionId, producto.id],
  );

  useEffect(() => {
    void cargar();
  }, [cargar]);

  const trasEscribir = useCallback(async () => {
    await Promise.all([cargar(true), recargar(), catalogo.recargar()]);
  }, [cargar, recargar, catalogo]);

  const permisosListos = resumen !== null;
  const motivoSinPermiso = permisosListos ? tc('sinPermiso') : tc('cargando');
  const esVariante = producto.parent_product_id !== null;

  const inactivas = variantes.filter((v) => v.status !== 'active').length;
  const visibles = mostrarInactivas ? variantes : variantes.filter((v) => v.status === 'active');
  const atributos = useMemo(() => resumenAtributos(variantes.map((v) => ({ attributes: v.attributes }))), [variantes]);

  const abrirNueva = () => setDialogo({ abierto: true, variante: null });
  const abrirEditar = (v: VarianteDetalle) => setDialogo({ abierto: true, variante: v });

  const cambiarEstado = async (v: VarianteDetalle, estado: 'active' | 'inactive') => {
    try {
      await productoService.estadoVariante(organizacionId, v.id, estado);
      toast({ title: estado === 'active' ? t('toasts.activada') : t('toasts.desactivada'), description: v.name });
      await trasEscribir();
    } catch (e) {
      toast({ variant: 'destructive', title: t('toasts.errorEstado'), description: mensajeError(e) });
    }
  };

  const eliminar = async () => {
    if (!aEliminar) return;
    setEliminando(true);
    try {
      await productoService.estadoVariante(organizacionId, aEliminar.id, 'deleted');
      toast({ title: t('toasts.eliminada'), description: aEliminar.name });
      await trasEscribir();
    } catch (e) {
      toast({ variant: 'destructive', title: t('toasts.errorEliminar'), description: mensajeError(e) });
    } finally {
      setEliminando(false);
    }
  };

  const acciones = (v: VarianteDetalle): AccionFila[] => {
    const activa = v.status === 'active';
    return [
      {
        id: 'editar',
        etiqueta: tc('editar'),
        icono: Pencil,
        onSelect: () => abrirEditar(v),
        deshabilitada: !permisos.editar,
        motivo: permisos.editar ? undefined : motivoSinPermiso,
      },
      {
        id: 'ficha',
        etiqueta: t('acciones.verFicha'),
        icono: ExternalLink,
        onSelect: () => {
          const uuid = uuids.get(v.id);
          if (uuid) router.push(`/app/inventario/productos/${uuid}`);
        },
        oculta: !uuids.get(v.id),
      },
      {
        id: 'estado',
        etiqueta: activa ? t('acciones.desactivar') : t('acciones.activar'),
        icono: activa ? PowerOff : Power,
        onSelect: () => void cambiarEstado(v, activa ? 'inactive' : 'active'),
        deshabilitada: !permisos.editar,
        motivo: permisos.editar ? undefined : motivoSinPermiso,
      },
      {
        id: 'eliminar',
        etiqueta: tc('eliminar'),
        icono: Trash2,
        destructiva: true,
        separadorAntes: true,
        onSelect: () => setAEliminar(v),
        deshabilitada: !permisos.eliminar,
        motivo: permisos.eliminar ? undefined : motivoSinPermiso,
      },
    ];
  };

  const insigniasAtributos = (v: VarianteDetalle) => {
    const pares = Object.entries(v.attributes).filter(([, val]) => val.trim());
    if (pares.length === 0) return <span className="text-fg-muted">—</span>;
    return (
      <div className="flex flex-wrap gap-1">
        {pares.map(([k, val]) => (
          <Badge key={k} tono="neutro" tamano="sm">
            {k}: {val}
          </Badge>
        ))}
      </div>
    );
  };

  const rastrea = (v: VarianteDetalle) => producto.track_stock && rastreoPorVariante.get(v.id) !== false;
  const textoStock = (v: VarianteDetalle) =>
    rastrea(v) ? (
      formatoEntero(stockVariante(v, sucursalActiva))
    ) : (
      <Badge tono="neutro" tamano="sm">
        {t('sinSeguimiento')}
      </Badge>
    );
  const insigniaMargen = (v: VarianteDetalle) => {
    const m = calcularMargen(v.price, v.cost);
    if (m === null) return <span className="text-fg-muted">—</span>;
    return (
      <Badge tono={tonoMargen(m)} tamano="sm">
        {m.toLocaleString(localeIntl, { maximumFractionDigits: 1 })} %
      </Badge>
    );
  };
  const importe = (n: number | null) => (n === null ? <span className="text-fg-muted">—</span> : moneda.formatear(n));

  const columnas: ColumnaTabla<VarianteDetalle>[] = [
    { id: 'sku', encabezado: t('columnas.sku'), variante: 'mono', celda: (v) => v.sku },
    { id: 'nombre', encabezado: t('columnas.nombre'), celda: (v) => <span className="font-medium text-fg">{v.name}</span> },
    { id: 'atributos', encabezado: t('columnas.atributos'), celda: insigniasAtributos, ocultarDebajo: 'xl' },
    { id: 'precio', encabezado: t('columnas.precio'), variante: 'importe', celda: (v) => importe(v.price) },
    { id: 'costo', encabezado: t('columnas.costo'), variante: 'importe', celda: (v) => importe(v.cost) },
    { id: 'margen', encabezado: t('columnas.margen'), alinear: 'derecha', celda: insigniaMargen, ocultarDebajo: 'xl' },
    { id: 'stock', encabezado: sucursalActiva !== null ? t('columnas.stockSucursal') : t('columnas.stock'), variante: 'importe', celda: textoStock },
    {
      id: 'codigo',
      encabezado: t('columnas.codigo'),
      variante: 'mono',
      celda: (v) => v.barcode ?? <span className="font-sans text-fg-muted">—</span>,
      ocultarDebajo: 'xl',
    },
    { id: 'estado', encabezado: t('columnas.estado'), celda: (v) => <StatusBadge estado={v.status} /> },
  ];

  if (esVariante) {
    return (
      <EmptyState
        variante="empty"
        icono={GitBranch}
        titulo={t('esVariante.titulo')}
        descripcion={t('esVariante.descripcion')}
        compacto
      />
    );
  }

  const puedeCrear = permisos.crear || permisos.editar;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h2 className="text-lg font-semibold text-fg">{t('titulo')}</h2>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => setGeneradorAbierto(true)}
            disabled={!puedeCrear || carga !== 'listo'}
            title={puedeCrear ? undefined : motivoSinPermiso}
            className="flex-1 sm:flex-none"
          >
            <Sparkles aria-hidden="true" className="mr-2 size-4" /> {t('generar')}
          </Button>
          <Button
            type="button"
            onClick={abrirNueva}
            disabled={!puedeCrear || carga !== 'listo'}
            title={puedeCrear ? undefined : motivoSinPermiso}
            className="flex-1 sm:flex-none"
          >
            <Plus aria-hidden="true" className="mr-2 size-4" /> {t('nueva')}
          </Button>
        </div>
      </div>

      {atributos.length > 0 && (
        <div className="flex flex-col gap-2" aria-label={t('resumenAtributos')}>
          {atributos.map((a) => (
            <div key={a.nombre} className="flex flex-wrap items-center gap-1.5">
              <span className="min-w-[60px] text-sm font-medium text-fg-secondary">{a.nombre}:</span>
              {a.valores.map((val) => (
                <Badge key={val} tono="marca" tamano="sm">
                  {val}
                </Badge>
              ))}
            </div>
          ))}
        </div>
      )}

      {inactivas > 0 && (
        <label className="inline-flex items-center gap-2 self-start text-sm text-fg-secondary">
          <Switch checked={mostrarInactivas} onCheckedChange={setMostrarInactivas} />
          {t('mostrarInactivas', { count: inactivas })}
        </label>
      )}

      <DataTable<VarianteDetalle>
        etiqueta={t('titulo')}
        columnas={columnas}
        filas={visibles}
        obtenerId={(v) => String(v.id)}
        estado={carga === 'cargando' ? 'cargando' : carga === 'error' ? 'error' : 'listo'}
        filasEsqueleto={4}
        onReintentar={() => void cargar()}
        error={{ titulo: t('error.titulo'), descripcion: t('error.descripcion') }}
        vacio={{
          icono: GitBranch,
          titulo: variantes.length > 0 ? t('vacio.soloInactivas') : t('vacio.titulo'),
          descripcion: variantes.length > 0 ? undefined : t('vacio.descripcion'),
          accion:
            variantes.length > 0
              ? { etiqueta: t('vacio.verInactivas'), onClick: () => setMostrarInactivas(true) }
              : puedeCrear
                ? { etiqueta: t('vacio.crearPrimera'), onClick: abrirNueva, icono: Plus }
                : undefined,
        }}
        onFilaClick={permisos.editar ? abrirEditar : undefined}
        etiquetaFila={(v) => v.name}
        acciones={acciones}
        accionesRapidas={(v) => (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              abrirEditar(v);
            }}
            disabled={!permisos.editar}
            aria-label={t('acciones.editarDe', { nombre: v.name })}
            title={permisos.editar ? tc('editar') : motivoSinPermiso}
            className="flex size-8 items-center justify-center rounded-lg text-fg-secondary hover:bg-hover hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand disabled:opacity-40"
          >
            <Pencil aria-hidden="true" className="size-4" />
          </button>
        )}
        tarjetaMovil={(v) => (
          <ListCard
            icono={GitBranch}
            titulo={v.name}
            subtitulo={<span className="font-mono">{v.sku}</span>}
            etiquetas={
              Object.values(v.attributes).some((x) => x.trim()) ? (
                <>
                  {Object.entries(v.attributes)
                    .filter(([, val]) => val.trim())
                    .map(([k, val]) => (
                      <Badge key={k} tono="neutro" tamano="sm">
                        {k}: {val}
                      </Badge>
                    ))}
                </>
              ) : undefined
            }
            meta={
              <>
                {t('movil.costo', { costo: v.cost === null ? '—' : moneda.formatear(v.cost) })} ·{' '}
                {rastrea(v) ? t('movil.stock', { stock: formatoEntero(stockVariante(v, sucursalActiva)) }) : t('sinSeguimiento')}
              </>
            }
            valor={v.price === null ? '—' : moneda.formatear(v.price)}
            estado={<StatusBadge estado={v.status} />}
            onClick={permisos.editar ? () => abrirEditar(v) : undefined}
            acciones={acciones(v)}
          />
        )}
      />

      <DialogoVariante
        abierto={dialogo.abierto}
        onAbiertoChange={(abierto) => setDialogo((d) => ({ ...d, abierto }))}
        variante={dialogo.variante}
        variantes={variantes}
        catalogo={catalogo}
        onGuardada={() => void trasEscribir()}
      />

      <GeneradorVariantes
        abierto={generadorAbierto}
        onAbiertoChange={setGeneradorAbierto}
        variantes={variantes}
        catalogo={catalogo.tipos}
        onTerminado={() => void trasEscribir()}
      />

      <ConfirmDialog
        open={aEliminar !== null}
        onOpenChange={(abierto) => !abierto && !eliminando && setAEliminar(null)}
        title={t('eliminar.titulo', { nombre: aEliminar?.name ?? '' })}
        description={t('eliminar.descripcion')}
        confirmLabel={tc('eliminar')}
        cancelLabel={tc('cancelar')}
        variant="destructive"
        loading={eliminando}
        onConfirm={eliminar}
      />
    </div>
  );
}
