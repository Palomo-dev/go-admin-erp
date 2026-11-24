'use client';

/**
 * Detalle de una lista de precios (Figma «05 POS y ventas» 04, 3020:274453).
 *
 * Cabecera con su resumen, KPI del mes (clientes, ventas netas con la lista y ahorro contra el
 * precio normal) y pestañas Precios / Clientes. En Clientes: grupos del CRM (dinámicos: quien entra
 * al grupo entra a la lista) y la tabla de clientes uno a uno y por grupo; quitar a alguien que
 * sigue en el grupo lo deja «sin lista» (no lo saca del grupo del CRM).
 */
import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { Copy, ExternalLink, Pencil, Tags, UserMinus, UserPlus, Users } from 'lucide-react';
import { toast } from 'sonner';
import {
  AvisoTonal,
  DataTable,
  EmptyState,
  KpiStrip,
  PageHeader,
  Pagination,
  SearchInput,
  StatCard,
  TabBar,
  clasesBoton,
  idPanel,
  idPestana,
  useOpcionUrl,
  type AccionFila,
  type ColumnaTabla,
} from '@/components/kit';
import { Badge } from '@/components/ui/badge';
import { useMigaVentas } from '@/components/pos/useMigaVentas';
import { useFormatDate } from '@/lib/context/OrganizationTimezoneContext';
import { useMonedaOrganizacion } from '@/lib/hooks/useOrgCurrency';
import { ListasPreciosService, ErrorPeticionLista, tienePermisoLista } from '@/lib/services/listasPreciosService';
import { diferenciaPorcentual } from '@/lib/listasPrecios/precioLista';
import type { ClienteDeLista, DetalleLista, ProductoLista } from '@/lib/listasPrecios/tipos';
import { AgregarClientesDialog } from './AgregarClientesDialog';
import { RUTA_LISTAS, TONO_ESTADO_LISTA, ajustePorcentaje, canalesLista, rutaEditarLista, rutaLista, vigenciaLista } from './vistaListas';

type Pestana = 'precios' | 'clientes';
const PESTANAS: readonly Pestana[] = ['precios', 'clientes'];
const ID = 'detalle-lista';

export function DetalleListaPrecios({ id }: { id: string }) {
  const t = useTranslations('listasPrecios.detalle');
  const tl = useTranslations('listasPrecios');
  const te = useTranslations('listasPrecios.errores');
  const router = useRouter();
  const migaVentas = useMigaVentas();
  const { formatear } = useMonedaOrganizacion();
  const { formatPlain, formatDate, getToday } = useFormatDate();
  const [pestana, setPestana] = useOpcionUrl<Pestana>('pestana', PESTANAS, 'precios');

  const [d, setD] = useState<DetalleLista | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [puedeGestionar, setPuedeGestionar] = useState(false);
  const [clientes, setClientes] = useState<{ total: number; clientes: ClienteDeLista[] } | null>(null);
  const [q, setQ] = useState('');
  const [pagina, setPagina] = useState(1);
  const [tamano, setTamano] = useState(20);
  const [dlg, setDlg] = useState<null | 'clientes' | 'grupo'>(null);

  const cargar = useCallback(async () => {
    try {
      setD(await ListasPreciosService.detalle(id));
      setError(null);
    } catch (e) {
      setError(e instanceof ErrorPeticionLista ? e.codigo : 'error_desconocido');
    }
  }, [id]);

  const cargarClientes = useCallback(async () => {
    try {
      setClientes(await ListasPreciosService.clientes(id, q, pagina, tamano));
    } catch {
      setClientes({ total: 0, clientes: [] });
    }
  }, [id, q, pagina, tamano]);

  useEffect(() => {
    void cargar();
    tienePermisoLista('pos.listas_precios.gestionar').then(setPuedeGestionar).catch(() => setPuedeGestionar(false));
  }, [cargar]);

  useEffect(() => {
    if (pestana === 'clientes') void cargarClientes();
  }, [pestana, cargarClientes]);

  const ejecutar = async (accion: () => Promise<unknown>, exito: string) => {
    try {
      await accion();
      toast.success(exito);
      void cargar();
      void cargarClientes();
    } catch (e) {
      toast.error(te(e instanceof ErrorPeticionLista ? e.codigo : 'error_desconocido'));
    }
  };

  if (error) {
    return (
      <div className="p-6">
        <EmptyState
          variante={error === 'sin_permiso' ? 'forbidden' : 'error'}
          titulo={te(error as never)}
          icono={Tags}
          accion={{ etiqueta: t('volver'), href: RUTA_LISTAS }}
        />
      </div>
    );
  }
  if (!d) return <div className="p-6 text-sm text-fg-secondary">{tl('cargando')}</div>;

  const l = d.lista;
  const general = l.base_mode === 'percent' ? ajustePorcentaje(tl, l.base_percent) : null;
  const subtitulo = [
    tl(`estado.${d.estado}`),
    general ? t('enTodo', { ajuste: general }) : null,
    d.productos.length > 0 ? t('preciosFijos', { n: d.productos.length }) : null,
    vigenciaLista(tl, l, getToday(), formatPlain),
  ]
    .filter(Boolean)
    .join(' · ');

  const columnasPrecios: ColumnaTabla<ProductoLista>[] = [
    { id: 'producto', encabezado: t('precios.producto'), celda: (p) => <span><span className="block text-fg">{p.name}</span>{p.sku && <span className="block text-xs text-fg-muted">{p.sku}</span>}</span> },
    { id: 'normal', encabezado: t('precios.normal'), variante: 'importe', celda: (p) => (p.normal_price !== null ? formatear(p.normal_price) : '—') },
    {
      id: 'lista',
      encabezado: t('precios.enLista'),
      variante: 'importe',
      celda: (p) => (p.escalones[0] ? formatear(p.escalones[0].price) : '—'),
    },
    {
      id: 'dif',
      encabezado: t('precios.diferencia'),
      celda: (p) => {
        const dif = p.escalones[0] ? diferenciaPorcentual(p.escalones[0].price, p.normal_price) : null;
        return dif === null ? '—' : <Badge tono={dif > 0 ? 'advertencia' : 'exito'} apariencia="suave" tamano="sm">{`${dif > 0 ? '+' : ''}${dif} %`}</Badge>;
      },
    },
    {
      id: 'escalones',
      encabezado: t('precios.porCantidad'),
      ocultarDebajo: 'md',
      celda: (p) =>
        p.escalones.length > 1
          ? p.escalones.slice(1).map((e) => t('precios.escalon', { n: e.min_qty, precio: formatear(e.price) })).join(' · ')
          : '—',
    },
  ];

  const accionesCliente = (c: ClienteDeLista): AccionFila[] => [
    { id: 'ver', etiqueta: t('clientes.ver'), icono: ExternalLink, onSelect: () => router.push(`/app/clientes/${c.id}`) },
    {
      id: 'quitar',
      etiqueta: t('clientes.quitar'),
      icono: UserMinus,
      destructiva: true,
      oculta: !puedeGestionar,
      onSelect: () => void ejecutar(() => ListasPreciosService.quitar(id, { customer_id: c.id }), t('clientes.quitado')),
    },
  ];

  const columnasClientes: ColumnaTabla<ClienteDeLista>[] = [
    { id: 'cliente', encabezado: t('clientes.cliente'), celda: (c) => c.nombre ?? '—' },
    { id: 'doc', encabezado: t('clientes.documento'), ocultarDebajo: 'md', celda: (c) => [c.doc_type, c.doc_number].filter(Boolean).join(' ') || '—' },
    { id: 'via', encabezado: t('clientes.comoLlego'), celda: (c) => (c.via === 'grupo' ? t('clientes.porGrupo', { grupo: c.grupo ?? '' }) : t('clientes.unoAUno')) },
    { id: 'ultima', encabezado: t('clientes.ultimaCompra'), ocultarDebajo: 'lg', celda: (c) => (c.ultima_compra ? formatDate(c.ultima_compra) : t('clientes.sinCompras')) },
    { id: 'ventas', encabezado: t('clientes.ventasMes'), variante: 'importe', ocultarDebajo: 'md', celda: (c) => formatear(c.ventas_netas_mes) },
    { id: 'ahorro', encabezado: t('clientes.ahorroMes'), variante: 'importe', ocultarDebajo: 'lg', celda: (c) => formatear(c.ahorro_mes) },
  ];

  return (
    <div className="flex flex-col gap-4 p-4 sm:p-6">
      <PageHeader
        variante="detail"
        titulo={l.name}
        subtitulo={subtitulo}
        volverA={RUTA_LISTAS}
        badge={<Badge tono={TONO_ESTADO_LISTA[d.estado]} apariencia="suave" punto>{tl(`estado.${d.estado}`)}</Badge>}
        migas={[migaVentas, { etiqueta: tl('titulo'), href: RUTA_LISTAS }, { etiqueta: l.name }]}
        acciones={
          puedeGestionar ? (
            <>
              <button
                type="button"
                className={clasesBoton({ variante: 'secundario' })}
                onClick={() =>
                  void (async () => {
                    try {
                      const r = await ListasPreciosService.duplicar(id, tl('copiaDe', { nombre: l.name }));
                      toast.success(tl('toast.duplicada'));
                      router.push(rutaLista(r.id));
                    } catch (e) {
                      toast.error(te(e instanceof ErrorPeticionLista ? e.codigo : 'error_desconocido'));
                    }
                  })()
                }
              >
                <Copy aria-hidden="true" className="size-4" strokeWidth={1.5} /> {t('duplicar')}
              </button>
              <Link href={rutaEditarLista(id)} className={clasesBoton({ variante: 'primario' })}>
                <Pencil aria-hidden="true" className="size-4" strokeWidth={1.5} /> {t('editar')}
              </Link>
            </>
          ) : undefined
        }
      />

      <KpiStrip etiqueta={t('kpi.etiqueta')}>
        <StatCard
          etiqueta={t('kpi.clientes')}
          valor={d.kpis.clientes.toLocaleString()}
          detalle={t('kpi.clientesDetalle', { grupo: d.kpis.clientes_grupo, directos: d.kpis.clientes_directos })}
          icono={Users}
        />
        <StatCard etiqueta={t('kpi.ventas')} valor={formatear(d.kpis.ventas_netas_mes)} detalle={t('kpi.ventasDetalle', { n: d.kpis.ventas_mes })} />
        <StatCard etiqueta={t('kpi.ahorro')} valor={formatear(d.kpis.ahorro_mes)} detalle={t('kpi.ahorroDetalle')} />
      </KpiStrip>

      <TabBar
        id={ID}
        etiqueta={l.name}
        valor={pestana}
        onValorChange={setPestana}
        pestanas={[
          { valor: 'precios', etiqueta: t('pestanas.precios'), contador: d.productos.length },
          { valor: 'clientes', etiqueta: t('pestanas.clientes'), contador: d.kpis.clientes },
        ]}
      />

      <div role="tabpanel" id={idPanel(ID, pestana)} aria-labelledby={idPestana(ID, pestana)} className="flex min-w-0 flex-col gap-4">
        {pestana === 'precios' ? (
          <>
            <div className="flex flex-wrap gap-2 text-sm text-fg-secondary">
              <span>{t('canales', { canales: canalesLista(tl, l) })}</span>
              {d.reglas.length > 0 && (
                <span>
                  · {d.reglas
                    .map((r) => `${r.scope === 'category' ? r.category_name : r.brand}: ${r.no_discount ? t('sinDescuento') : ajustePorcentaje(tl, r.adjust_percent) ?? '0 %'}`)
                    .join(' · ')}
                </span>
              )}
            </div>
            <DataTable
              etiqueta={t('pestanas.precios')}
              columnas={columnasPrecios}
              filas={d.productos}
              obtenerId={(p) => String(p.product_id)}
              estado={d.productos.length === 0 ? 'vacio' : 'listo'}
              vacio={{ titulo: t('precios.vacioTitulo'), descripcion: t('precios.vacioDescripcion'), icono: Tags }}
            />
          </>
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-2">
              <div className="min-w-0 flex-1">
                <SearchInput value={q} onChange={(v) => { setQ(v); setPagina(1); }} placeholder={t('clientes.buscar')} etiqueta={t('clientes.buscar')} />
              </div>
              {puedeGestionar && (
                <>
                  <button type="button" className={clasesBoton({ variante: 'secundario' })} onClick={() => setDlg('grupo')}>
                    <Users aria-hidden="true" className="size-4" strokeWidth={1.5} /> {t('clientes.agregarGrupo')}
                  </button>
                  <button type="button" className={clasesBoton({ variante: 'primario' })} onClick={() => setDlg('clientes')}>
                    <UserPlus aria-hidden="true" className="size-4" strokeWidth={1.5} /> {t('clientes.agregar')}
                  </button>
                </>
              )}
            </div>
            {d.grupos.length > 0 && (
              <div className="flex flex-col gap-2 rounded-xl border border-line p-4">
                <p className="text-sm font-medium text-fg">{t('clientes.gruposCrm')}</p>
                {d.grupos.map((g) => (
                  <div key={g.segment_id} className="flex flex-wrap items-center gap-3 rounded-lg bg-subtle px-3 py-2">
                    <Users aria-hidden="true" className="size-4 text-fg-muted" strokeWidth={1.5} />
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm text-fg">{g.name}</span>
                      <span className="block text-xs text-fg-secondary">{t('clientes.grupoDetalle', { n: g.miembros })}</span>
                    </span>
                    <Badge tono="informacion" apariencia="contorno" tamano="sm">{g.is_dynamic ? t('clientes.dinamico') : t('clientes.fijo')}</Badge>
                    <Link href={`/app/crm/segmentos/${g.segment_id}`} className="flex items-center gap-1 text-sm text-fg">
                      <ExternalLink aria-hidden="true" className="size-4" strokeWidth={1.5} /> {t('clientes.verCrm')}
                    </Link>
                    {puedeGestionar && (
                      <button
                        type="button"
                        className="text-sm text-fg"
                        onClick={() => void ejecutar(() => ListasPreciosService.quitar(id, { segment_id: g.segment_id }), t('clientes.grupoQuitado'))}
                      >
                        {t('clientes.quitarGrupo')}
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
            <DataTable
              etiqueta={t('pestanas.clientes')}
              columnas={columnasClientes}
              filas={clientes?.clientes ?? []}
              obtenerId={(c) => c.id}
              estado={!clientes ? 'cargando' : clientes.total === 0 ? (q ? 'sinResultados' : 'vacio') : 'listo'}
              acciones={accionesCliente}
              onFilaClick={(c) => router.push(`/app/clientes/${c.id}`)}
              etiquetaFila={(c) => c.nombre ?? c.id}
              vacio={{
                titulo: t('clientes.vacioTitulo'),
                descripcion: t('clientes.vacioDescripcion'),
                icono: Users,
                accion: puedeGestionar ? { etiqueta: t('clientes.agregar'), onClick: () => setDlg('clientes'), icono: UserPlus } : undefined,
              }}
              onLimpiarFiltros={() => setQ('')}
              termino={q || undefined}
              pie={
                clientes && clientes.total > 0 ? (
                  <Pagination
                    pagina={pagina}
                    tamano={tamano}
                    total={clientes.total}
                    onPaginaChange={setPagina}
                    onTamanoChange={(n) => {
                      setTamano(n);
                      setPagina(1);
                    }}
                    sustantivo={{ singular: t('clientes.singular'), plural: t('clientes.plural') }}
                  />
                ) : undefined
              }
            />
            <AvisoTonal tono="informacion" compacto titulo={t('clientes.regla')} />
          </>
        )}
      </div>

      <AgregarClientesDialog
        abierto={dlg !== null}
        onAbiertoChange={(v) => !v && setDlg(null)}
        listaId={id}
        listaNombre={l.name}
        pestanaInicial={dlg === 'grupo' ? 'grupo' : 'clientes'}
        onAgregado={() => {
          void cargar();
          void cargarClientes();
        }}
      />
    </div>
  );
}
