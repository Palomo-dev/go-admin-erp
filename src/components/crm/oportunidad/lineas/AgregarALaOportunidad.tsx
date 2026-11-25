'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { BookOpen, CalendarClock, Check, Dumbbell, Package, Ticket, type LucideIcon } from 'lucide-react';
import { PanelAdaptable } from '@/components/kit/PanelAdaptable';
import { TabBar } from '@/components/kit/TabBar';
import { SearchInput } from '@/components/kit/SearchInput';
import { EmptyState } from '@/components/kit/EmptyState';
import { StatusBadge } from '@/components/kit/StatusBadge';
import { clasesBoton } from '@/components/kit/botonClases';
import { VariantSelectorDialog } from '@/components/pos/VariantSelectorDialog';
import type { OpcionUsuario } from '@/components/crm/kit/camposCrm';
import { useBranchOpcional } from '@/lib/context/BranchContext';
import { getOrganizationId } from '@/lib/hooks/useOrganization';
import { formatMoneda, type ContextoMoneda } from '@/lib/utils/moneda';
import { SERVICIOS_MODELO_NUEVO, textoVariante, type LineaEspacio, type LineaProducto, type TipoServicio } from '../lineasLogica';
import { buscarCatalogo, contarCatalogo, tiposHospedaje, type ItemCatalogo, type PestanaCatalogo } from './catalogoOportunidad';
import { ConfigurarServicioDialog, type ServicioAConfigurar } from './ConfigurarServicioDialog';
import { HospedajeFormulario } from './HospedajeFormulario';

/**
 * «Agregar a la oportunidad» (Figma 1771:171737 Productos, 1771:172205
 * Servicios, 1783:310575 Hospedaje; estados 1783:896980; móvil 1785:896517):
 * un solo selector con pestañas. El ítem decide qué se pregunta: variante y
 * modificadores (`VariantSelectorDialog` del POS, 3a/3b), configuración por
 * tipo de servicio (3c) u hospedaje (3d); estándar y productos simples se
 * agregan directo. Se puede cotizar sin stock: el bloqueo real está al emitir
 * la factura (`fn_invoice_stock_shortages`).
 */
export type PestanaAgregar = PestanaCatalogo | 'hospedaje';

export interface AgregarALaOportunidadProps {
  abierto: boolean;
  onAbiertoChange: (abierto: boolean) => void;
  /** «Convenio de bienestar 2027» (subtítulo). */
  contexto?: string | null;
  moneda: ContextoMoneda;
  usuarios: readonly OpcionUsuario[];
  totalLineas: number;
  pestanaInicial?: PestanaAgregar;
  /** En lote no se ofrece hospedaje (fechas y huéspedes son por cliente). */
  sinHospedaje?: boolean;
  onAgregarProducto: (l: LineaProducto) => void;
  onAgregarEspacios: (l: LineaEspacio[]) => void;
}

type Resultado = { estado: 'cargando' } | { estado: 'error' } | { estado: 'sinPermiso' } | { estado: 'listo'; filas: ItemCatalogo[] };

const ICONO_SERVICIO: Record<TipoServicio, LucideIcon> = { standard: Package, membership: Ticket, session_pack: Ticket, class: Dumbbell, course: BookOpen, appointment: CalendarClock };

const esSinPermiso = (e: unknown) => !!e && typeof e === 'object' && ((e as { code?: string }).code === '42501' || (e as { status?: number }).status === 403);

export function AgregarALaOportunidad(p: AgregarALaOportunidadProps) {
  const { abierto, onAbiertoChange, moneda } = p;
  const t = useTranslations('crm.oportunidad.agregar');
  const tl = useTranslations('crm.oportunidad.lineas');
  const sucursales = useBranchOpcional();
  const sucursalHeader = sucursales?.selectedBranchId ?? null;
  const org = Number(getOrganizationId());
  const [pestana, setPestana] = useState<PestanaAgregar>(p.pestanaInicial ?? 'productos');
  const [texto, setTexto] = useState('');
  const [res, setRes] = useState<Resultado>({ estado: 'cargando' });
  const [conteos, setConteos] = useState<{ productos: number; servicios: number; tipos: number } | null>(null);
  const [reintento, setReintento] = useState(0);
  const [variante, setVariante] = useState<ItemCatalogo | null>(null);
  const [servicio, setServicio] = useState<ServicioAConfigurar | null>(null);
  const [agregadas, setAgregadas] = useState(0);

  useEffect(() => {
    if (!abierto) return;
    setPestana(p.pestanaInicial ?? 'productos');
    setTexto('');
    setAgregadas(0);
    const c = new AbortController();
    Promise.all([contarCatalogo(org, c.signal), p.sinHospedaje ? Promise.resolve([]) : tiposHospedaje(org, c.signal)]).then(
      ([n, tipos]) => setConteos({ ...n, tipos: new Set(tipos.map((x) => x.space_type_id)).size }),
      () => undefined,
    );
    return () => c.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [abierto]);

  useEffect(() => {
    if (!abierto || pestana === 'hospedaje') return;
    const c = new AbortController();
    setRes({ estado: 'cargando' });
    buscarCatalogo(org, { texto, pestana }, c.signal).then(
      (filas) => setRes({ estado: 'listo', filas }),
      (e) => !c.signal.aborted && setRes({ estado: esSinPermiso(e) ? 'sinPermiso' : 'error' }),
    );
    return () => c.abort();
  }, [abierto, org, pestana, texto, reintento]);

  const nombreSucursal = useCallback((id: number) => sucursales?.branches.find((b) => b.id === id)?.name ?? t('sucursalN', { id }), [sucursales?.branches, t]);

  const agregarDirecto = (it: ItemCatalogo) => {
    p.onAgregarProducto({ product_id: it.id, nombre: it.nombre, sku: it.sku, quantity: 1, unit_price: it.precio, es_servicio: it.es_servicio, tipo_servicio: it.tipo_servicio, controla_stock: it.es_servicio ? false : it.controla_stock, tasa_impuesto: it.tasa_impuesto, service_config: {} });
    setAgregadas((x) => x + 1);
  };

  const accion = (it: ItemCatalogo): { tipo: 'variante' | 'configurar' | 'agregar'; etiqueta: string } => {
    if (it.variantes > 0) return { tipo: 'variante', etiqueta: t('elegirVariante') };
    if (it.modificadores) return { tipo: 'configurar', etiqueta: t('configurar') };
    if (it.es_servicio && it.tipo_servicio && it.tipo_servicio !== 'standard') return { tipo: 'configurar', etiqueta: t('configurar') };
    return { tipo: 'agregar', etiqueta: t('agregar') };
  };

  const ejecutar = (it: ItemCatalogo) => {
    const a = accion(it);
    if (a.tipo === 'agregar') agregarDirecto(it);
    else if (it.variantes > 0 || it.modificadores) setVariante(it);
    else setServicio({ id: it.id, nombre: it.nombre, sku: it.sku, tipo: it.tipo_servicio ?? 'standard', precio: it.precio, tasa_impuesto: it.tasa_impuesto });
  };

  const filas = res.estado === 'listo' ? res.filas : [];
  const total = pestana === 'servicios' ? conteos?.servicios : conteos?.productos;

  const insignias = (it: ItemCatalogo) => {
    const b: { texto: string; tono: 'informacion' | 'neutro' | 'advertencia' | 'peligro' }[] = [];
    if (it.es_servicio) {
      b.push({ texto: tl('insignia.servicio', { tipo: tl(`tipoServicio.${it.tipo_servicio ?? 'standard'}`) }), tono: 'informacion' });
      if (it.tipo_servicio && SERVICIOS_MODELO_NUEVO.includes(it.tipo_servicio)) b.push({ texto: tl('insignia.modeloNuevo'), tono: 'advertencia' });
      return b;
    }
    if (it.variantes > 0) b.push({ texto: t('insignia.variantes'), tono: 'informacion' });
    if (it.modificadores) b.push({ texto: t('insignia.modificadores'), tono: 'neutro' });
    b.push({ texto: it.controla_stock ? tl('insignia.controlaStock') : tl('insignia.noControlaStock'), tono: 'neutro' });
    if (it.controla_stock && it.stock.reduce((s, x) => s + x.cantidad, 0) <= 0) b.push({ texto: t('insignia.sinStock'), tono: 'peligro' });
    return b;
  };

  const detalle = (it: ItemCatalogo) => {
    const partes = [it.sku];
    if (it.variantes > 0) partes.push(it.atributos.length ? t('nVariantesAtributos', { n: it.variantes, atributos: it.atributos.join(' y ') }) : t('nVariantes', { n: it.variantes }));
    else if (it.controla_stock && it.stock.reduce((s, x) => s + x.cantidad, 0) <= 0) partes.push(t('cotizarSinStock'));
    else if (it.compuesto) partes.push(t('compuesto'));
    else if (it.descripcion) partes.push(it.descripcion);
    return partes.filter(Boolean).join(' · ');
  };

  const columnaStock = (it: ItemCatalogo) => {
    if (it.es_servicio || !it.controla_stock) {
      return it.compuesto ? (
        <span className="text-[13px] text-fg-secondary">{t('recetaAlEmitir')}</span>
      ) : (
        <span className="text-[13px] text-fg-muted">{tl('insignia.noControlaStock')}</span>
      );
    }
    const orden = [...it.stock].sort((a, b) => Number(b.branch_id === sucursalHeader) - Number(a.branch_id === sucursalHeader) || b.cantidad - a.cantidad).slice(0, 2);
    if (orden.length === 0) return <span className="text-[13px] text-danger-text">{t('stockCero')}</span>;
    return (
      <ul className="flex flex-col text-[13px]">
        {orden.map((s, i) => (
          <li key={s.branch_id} className={s.cantidad <= 0 ? 'text-danger-text' : i === 0 ? 'text-success-text' : 'text-fg-secondary'}>
            {t('stockSucursal', { sucursal: nombreSucursal(s.branch_id), n: s.cantidad })}
          </li>
        ))}
      </ul>
    );
  };

  const pie =
    pestana === 'hospedaje' ? undefined : (
      <div className="flex w-full flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-between">
        <span className="text-[13px] text-fg-secondary">{t('lineasEnOportunidad', { n: p.totalLineas })}</span>
        <button type="button" onClick={() => onAbiertoChange(false)} className={clasesBoton()}>
          <Check aria-hidden="true" className="size-4" />
          {t('listo', { n: p.totalLineas })}
        </button>
      </div>
    );

  const pestanas = useMemo(
    () => [
      { valor: 'productos' as const, etiqueta: t('pestanas.productos'), contador: conteos?.productos },
      { valor: 'servicios' as const, etiqueta: t('pestanas.servicios'), contador: conteos?.servicios },
      ...(p.sinHospedaje ? [] : [{ valor: 'hospedaje' as const, etiqueta: conteos ? t('pestanas.hospedajeTipos', { n: conteos.tipos }) : t('pestanas.hospedaje') }]),
    ],
    [conteos, p.sinHospedaje, t],
  );

  return (
    <>
      <PanelAdaptable
        abierto={abierto && !variante && !servicio}
        onAbiertoChange={onAbiertoChange}
        titulo={t('titulo')}
        descripcion={[p.contexto, moneda.code, t('stockTodas')].filter(Boolean).join(' · ')}
        icono={Package}
        ancho={800}
        pantallaCompletaMovil
        debajoCabecera={<TabBar id="agregar-oportunidad" etiqueta={t('titulo')} pestanas={pestanas} valor={pestana} onValorChange={(v) => { setPestana(v); setTexto(''); }} />}
        pie={pie}
      >
        {pestana === 'hospedaje' ? (
          <HospedajeFormulario
            moneda={moneda}
            onListo={(l) => {
              p.onAgregarEspacios(l);
              onAbiertoChange(false);
            }}
          />
        ) : (
          <div className="flex flex-col gap-3">
            <SearchInput
              value={texto}
              onChange={setTexto}
              debounceMs={250}
              autoFocus
              atajo={false}
              placeholder={pestana === 'servicios' ? t('buscarServicio') : t('buscarProducto')}
              etiqueta={pestana === 'servicios' ? t('buscarServicio') : t('buscarProducto')}
              cargando={res.estado === 'cargando'}
              onEnter={() => {
                if (filas[0]) {
                  ejecutar(filas[0]);
                  return true;
                }
              }}
            />
            {res.estado === 'listo' && filas.length > 0 && (
              <p className="text-xs text-fg-muted">{pestana === 'servicios' ? t('ayudaServicios', { n: filas.length, total: total ?? filas.length }) : t('ayudaProductos', { n: filas.length, total: total ?? filas.length })}</p>
            )}
            {res.estado === 'cargando' ? (
              <ul className="flex flex-col gap-2" aria-busy="true">
                {[0, 1, 2, 3].map((i) => <li key={i} className="h-20 animate-pulse rounded-lg bg-subtle" />)}
              </ul>
            ) : res.estado === 'error' ? (
              <EmptyState variante="error" titulo={t('error')} descripcion={t('errorDetalle')} onReintentar={() => setReintento((x) => x + 1)} compacto />
            ) : res.estado === 'sinPermiso' ? (
              <EmptyState variante="forbidden" titulo={t('sinPermiso')} descripcion={t('sinPermisoDetalle')} compacto />
            ) : filas.length === 0 ? (
              <EmptyState variante="search" titulo={texto ? t('sinResultados', { texto }) : t('vacio')} descripcion={texto ? t('sinResultadosDetalle') : undefined} onLimpiarFiltros={texto ? () => setTexto('') : undefined} compacto />
            ) : (
              <ul className="flex flex-col gap-2">
                {filas.map((it) => {
                  const a = accion(it);
                  const Icono = it.es_servicio ? ICONO_SERVICIO[it.tipo_servicio ?? 'standard'] : Package;
                  return (
                    <li key={it.id} className="flex flex-col gap-3 rounded-lg border border-line p-3 sm:flex-row sm:items-center">
                      <div className="flex min-w-0 flex-1 items-start gap-3">
                        <span aria-hidden="true" className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-subtle text-fg-secondary">
                          <Icono className="size-4" strokeWidth={1.5} />
                        </span>
                        <div className="flex min-w-0 flex-1 flex-col gap-1">
                          <span className="text-sm font-medium text-fg">{it.nombre}</span>
                          <span className="text-[13px] text-fg-secondary">{detalle(it)}</span>
                          <div className="flex flex-wrap gap-1">
                            {insignias(it).map((b) => <StatusBadge key={b.texto} estado={b.texto} etiqueta={b.texto} tono={b.tono} tamano="sm" />)}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center justify-between gap-3 sm:w-[380px] sm:justify-end">
                        <div className="min-w-0 sm:w-36">{columnaStock(it)}</div>
                        <span className="whitespace-nowrap text-sm font-semibold tabular-nums text-fg">{it.variantes > 0 ? t('desde', { precio: formatMoneda(it.precio, moneda) }) : formatMoneda(it.precio, moneda)}</span>
                        <button type="button" onClick={() => ejecutar(it)} className={clasesBoton({ variante: a.tipo === 'agregar' && it.controla_stock && it.stock.reduce((s, x) => s + x.cantidad, 0) <= 0 ? 'secundario' : 'primario', tamano: 'sm' })}>
                          {a.etiqueta}
                        </button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
            {agregadas > 0 && <p role="status" className="sr-only">{t('agregadas', { n: agregadas })}</p>}
          </div>
        )}
      </PanelAdaptable>

      {variante && (
        <VariantSelectorDialog
          open={!!variante}
          onOpenChange={(x) => !x && setVariante(null)}
          product={{ id: variante.id, name: variante.nombre, sku: variante.sku ?? '', price: variante.precio, track_stock: variante.controla_stock }}
          sucursal={{ filtro: sucursalHeader, nombre: sucursalHeader ? nombreSucursal(sucursalHeader) : null }}
          conCantidad
          onSelectVariant={(v, mods, cantidad) => {
            const extra = mods.reduce((s, m) => s + (m.extraPrice || 0), 0);
            p.onAgregarProducto({
              product_id: v.id,
              nombre: variante.nombre,
              sku: v.sku || variante.sku,
              variante: textoVariante(v.variant_data),
              quantity: cantidad,
              unit_price: (Number(v.price ?? variante.precio) || 0) + extra,
              modifiers: mods.map((m) => ({ modifier_id: m.modifierId, group_id: m.groupId, name: m.name, group_name: m.groupName, extra_price: m.extraPrice })),
              es_servicio: variante.es_servicio,
              tipo_servicio: variante.tipo_servicio,
              controla_stock: v.track_stock ?? variante.controla_stock,
              tasa_impuesto: variante.tasa_impuesto,
              service_config: {},
            });
            setAgregadas((x) => x + 1);
            setVariante(null);
          }}
        />
      )}
      <ConfigurarServicioDialog
        abierto={!!servicio}
        onAbiertoChange={(x) => !x && setServicio(null)}
        servicio={servicio}
        moneda={moneda}
        usuarios={p.usuarios}
        onListo={(l) => {
          p.onAgregarProducto(l);
          setAgregadas((x) => x + 1);
        }}
      />
    </>
  );
}

