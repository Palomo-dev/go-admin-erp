'use client';

/**
 * Crear o editar una lista de precios en UNA pantalla (Figma «05 POS y ventas» 02, 3019:273070).
 * Con nombre y una regla ya se puede guardar.
 *
 * Secciones: lo esencial (nombre, activa, moneda de la organización, vigencia) · cómo se define
 * el precio (regla general en % o solo precios fijos, excepciones por categoría o marca) · precios
 * fijos por producto con escalones · redondeo · dónde aplica (POS, tienda web, cotizaciones y
 * facturas; sedes) · clientes. «En palabras» y los avisos de precios más caros que el normal
 * (se permiten, decisión 3 del dueño) van a la derecha.
 *
 * Guarda TODO en una transacción (`price_list_save` por /api/listas-precios). El cálculo del precio
 * no se repite aquí: lo hace la base (`fn_lista_precios_resolver`).
 */
import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { AlertTriangle, Check, ChevronDown, ChevronUp, Download, Plus, Store, Trash2, Upload, Users, FileText, Globe } from 'lucide-react';
import { toast } from 'sonner';
import { AvisoTonal, FormField, FormSection, PageHeader, SegmentedControl, clasesBoton } from '@/components/kit';
import { CampoFecha } from '@/components/kit/CampoFecha';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useMigaVentas } from '@/components/pos/useMigaVentas';
import { AgregarProductosDocumento } from '@/components/finanzas/documento/productos';
import { useBranch } from '@/lib/context/BranchContext';
import { useFormatDate } from '@/lib/context/OrganizationTimezoneContext';
import { useMonedaOrganizacion } from '@/lib/hooks/useOrgCurrency';
import { getOrganizationId } from '@/lib/hooks/useOrganization';
import { supabase } from '@/lib/supabase/config';
import { ListasPreciosService, ErrorPeticionLista } from '@/lib/services/listasPreciosService';
import { diferenciaPorcentual } from '@/lib/listasPrecios/precioLista';
import { exportarCsv } from '@/lib/listasPrecios/archivoPrecios';
import type { BaseLista, DatosLista, DetalleLista, ModoRedondeo, ReglaLista } from '@/lib/listasPrecios/tipos';
import { ImportarPreciosDialog } from './ImportarPreciosDialog';
import { RUTA_LISTAS, ajustePorcentaje, rutaLista } from './vistaListas';

interface ProductoFijo {
  product_id: number;
  name: string;
  sku: string | null;
  normal: number | null;
  escalones: { min_qty: number; price: number }[];
  abierto?: boolean;
}

interface ReglaEditable extends ReglaLista {
  clave: string;
  /** Subir o bajar: el % se guarda con signo. */
  sentido: 'bajar' | 'subir';
  valor: number;
}

const PASOS_REDONDEO = [0, 50, 100, 1000] as const;
let secuencia = 0;
const nuevaClave = () => `r${Date.now().toString(36)}${(secuencia++).toString(36)}`;

function aEditable(r: ReglaLista): ReglaEditable {
  const pct = Number(r.adjust_percent) || 0;
  return { ...r, clave: nuevaClave(), sentido: pct > 0 ? 'subir' : 'bajar', valor: Math.abs(pct) };
}

export function EditorListaPrecios({ id }: { id?: string }) {
  const t = useTranslations('listasPrecios.editor');
  const tl = useTranslations('listasPrecios');
  const te = useTranslations('listasPrecios.errores');
  const router = useRouter();
  const migaVentas = useMigaVentas();
  const moneda = useMonedaOrganizacion();
  const { formatear } = moneda;
  const { branches } = useBranch();
  const { getToday } = useFormatDate();

  const [cargando, setCargando] = useState(!!id);
  const [guardando, setGuardando] = useState(false);
  const [detalle, setDetalle] = useState<DetalleLista | null>(null);

  const [nombre, setNombre] = useState('');
  const [activa, setActiva] = useState(true);
  const [desde, setDesde] = useState<string>(getToday());
  const [hasta, setHasta] = useState<string | null>(null);
  const [base, setBase] = useState<BaseLista>('percent');
  const [sentido, setSentido] = useState<'bajar' | 'subir'>('bajar');
  const [porcentaje, setPorcentaje] = useState(10);
  const [reglas, setReglas] = useState<ReglaEditable[]>([]);
  const [productos, setProductos] = useState<ProductoFijo[]>([]);
  const [paso, setPaso] = useState<number>(100);
  const [modo, setModo] = useState<ModoRedondeo>('down');
  const [pos, setPos] = useState(true);
  const [web, setWeb] = useState(true);
  const [documentos, setDocumentos] = useState(true);
  const [sedes, setSedes] = useState<number[] | null>(null);
  const [errorNombre, setErrorNombre] = useState<string | null>(null);

  const [categorias, setCategorias] = useState<{ id: number; name: string }[]>([]);
  const [marcas, setMarcas] = useState<string[]>([]);
  const [dlgProductos, setDlgProductos] = useState(false);
  const [dlgImportar, setDlgImportar] = useState(false);
  const [busquedaFijos, setBusquedaFijos] = useState('');

  const cargarDetalle = async (listaId: string) => {
    const d = await ListasPreciosService.detalle(listaId);
    setDetalle(d);
    const l = d.lista;
    setNombre(l.name);
    setActiva(l.is_active);
    setDesde(l.effective_from);
    setHasta(l.effective_to);
    setBase(l.base_mode);
    setSentido(Number(l.base_percent) > 0 ? 'subir' : 'bajar');
    setPorcentaje(Math.abs(Number(l.base_percent) || 0));
    setReglas(d.reglas.map(aEditable));
    setProductos(d.productos.map((p) => ({ product_id: p.product_id, name: p.name, sku: p.sku, normal: p.normal_price, escalones: p.escalones })));
    setPaso(Number(l.rounding_step) || 0);
    setModo(l.rounding_mode);
    setPos(l.applies_to_pos);
    setWeb(l.applies_to_web);
    setDocumentos(l.applies_to_documents);
    setSedes(Array.isArray(l.branches) && l.branches.length > 0 ? l.branches.map(Number) : null);
  };

  useEffect(() => {
    if (!id) return;
    let vivo = true;
    cargarDetalle(id)
      .catch((e) => vivo && toast.error(te(e instanceof ErrorPeticionLista ? e.codigo : 'error_desconocido')))
      .finally(() => vivo && setCargando(false));
    return () => {
      vivo = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  useEffect(() => {
    const org = getOrganizationId();
    if (!org) return;
    void supabase
      .from('categories')
      .select('id, name')
      .eq('organization_id', org)
      .order('name')
      .then(({ data }) => setCategorias(((data ?? []) as { id: number; name: string }[])));
    void supabase
      .from('products')
      .select('brand')
      .eq('organization_id', org)
      .not('brand', 'is', null)
      .limit(5000)
      .then(({ data }) => {
        const vistas = new Map<string, string>();
        for (const f of (data ?? []) as { brand: string | null }[]) {
          const b = (f.brand ?? '').trim();
          if (b && !vistas.has(b.toLowerCase())) vistas.set(b.toLowerCase(), b);
        }
        setMarcas(Array.from(vistas.values()).sort((a, b) => a.localeCompare(b)));
      });
  }, []);

  const pctGeneral = base === 'percent' ? (sentido === 'bajar' ? -porcentaje : porcentaje) : 0;

  const datos = (): DatosLista => ({
    name: nombre.trim(),
    is_active: activa,
    effective_from: desde,
    effective_to: hasta,
    base_mode: base,
    base_percent: pctGeneral,
    rounding_step: paso,
    rounding_mode: modo,
    applies_to_pos: pos,
    applies_to_web: web,
    applies_to_documents: documentos,
    branches: sedes && sedes.length > 0 ? sedes : null,
    rules: reglas.map((r) => ({
      scope: r.scope,
      category_id: r.scope === 'category' ? r.category_id : null,
      brand: r.scope === 'brand' ? r.brand : null,
      adjust_percent: r.no_discount ? null : r.sentido === 'bajar' ? -Math.abs(r.valor) : Math.abs(r.valor),
      no_discount: r.no_discount,
    })),
    items: productos.flatMap((p) => p.escalones.map((e) => ({ product_id: p.product_id, min_qty: e.min_qty, price: e.price }))),
  });

  const guardar = async () => {
    if (!nombre.trim()) {
      setErrorNombre(t('errorNombre'));
      return;
    }
    setGuardando(true);
    try {
      const r = id ? await ListasPreciosService.guardar(id, datos()) : await ListasPreciosService.crear(datos());
      toast.success(t('guardada'));
      router.push(rutaLista(r.id));
    } catch (e) {
      toast.error(te(e instanceof ErrorPeticionLista ? e.codigo : 'error_desconocido'));
    } finally {
      setGuardando(false);
    }
  };

  const agregarRegla = (scope: 'category' | 'brand', valor: string) => {
    if (!valor) return;
    if (scope === 'category') {
      const cid = Number(valor);
      if (reglas.some((r) => r.scope === 'category' && r.category_id === cid)) return;
      const cat = categorias.find((c) => c.id === cid);
      setReglas((rs) => [...rs, { clave: nuevaClave(), scope, category_id: cid, category_name: cat?.name ?? null, brand: null, adjust_percent: null, no_discount: false, sentido: 'bajar', valor: porcentaje || 10 }]);
    } else {
      if (reglas.some((r) => r.scope === 'brand' && (r.brand ?? '').toLowerCase() === valor.toLowerCase())) return;
      setReglas((rs) => [...rs, { clave: nuevaClave(), scope, category_id: null, brand: valor, adjust_percent: null, no_discount: false, sentido: 'bajar', valor: porcentaje || 10 }]);
    }
  };
  const cambiarRegla = (clave: string, cambio: Partial<ReglaEditable>) => setReglas((rs) => rs.map((r) => (r.clave === clave ? { ...r, ...cambio } : r)));

  const cambiarProducto = (pid: number, cambio: Partial<ProductoFijo>) =>
    setProductos((ps) => ps.map((p) => (p.product_id === pid ? { ...p, ...cambio } : p)));
  const cambiarEscalon = (pid: number, i: number, cambio: Partial<{ min_qty: number; price: number }>) =>
    setProductos((ps) => ps.map((p) => (p.product_id === pid ? { ...p, escalones: p.escalones.map((e, j) => (j === i ? { ...e, ...cambio } : e)) } : p)));

  const masCaros = productos.filter((p) => p.normal !== null && p.escalones.some((e) => e.price > (p.normal ?? 0)));
  const fijosVisibles = useMemo(() => {
    const q = busquedaFijos.trim().toLowerCase();
    return q ? productos.filter((p) => p.name.toLowerCase().includes(q) || (p.sku ?? '').toLowerCase().includes(q)) : productos;
  }, [productos, busquedaFijos]);

  const enPalabras = useMemo(() => {
    const partes: string[] = [];
    const g = base === 'percent' ? ajustePorcentaje(tl, pctGeneral) : null;
    partes.push(g ? t('palabras.general', { nombre: nombre || t('estaLista'), ajuste: g }) : t('palabras.soloFijos', { nombre: nombre || t('estaLista') }));
    for (const r of reglas) {
      const quien = r.scope === 'category' ? r.category_name ?? '' : r.brand ?? '';
      partes.push(r.no_discount ? t('palabras.sinDescuento', { quien }) : t('palabras.regla', { quien, ajuste: ajustePorcentaje(tl, r.sentido === 'bajar' ? -r.valor : r.valor) ?? '0 %' }));
    }
    if (productos.length > 0) partes.push(t('palabras.fijos', { n: productos.length }));
    partes.push(hasta ? t('palabras.vigenciaHasta', { hasta }) : t('palabras.sinFin'));
    if (paso > 0) partes.push(t('palabras.redondeo', { paso: formatear(paso), modo: t(`redondeo.modos.${modo}`).toLowerCase() }));
    partes.push(t('palabras.promociones'));
    return partes.join(' ');
  }, [base, pctGeneral, nombre, reglas, productos.length, hasta, paso, modo, formatear, t, tl]);

  const titulo = id ? t('tituloEditar', { nombre: detalle?.lista.name ?? '' }) : t('tituloNueva');
  const campo = 'h-10 rounded-md border border-line-strong bg-surface px-3 text-sm text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand';

  if (cargando) {
    return <div className="p-6 text-sm text-fg-secondary">{tl('cargando')}</div>;
  }

  return (
    <div className="flex flex-col gap-4 p-4 pb-24 sm:p-6 sm:pb-24">
      <PageHeader
        variante="form"
        titulo={titulo}
        subtitulo={t('subtitulo')}
        volverA={id ? rutaLista(id) : RUTA_LISTAS}
        migas={[migaVentas, { etiqueta: tl('titulo'), href: RUTA_LISTAS }, ...(id && detalle ? [{ etiqueta: detalle.lista.name, href: rutaLista(id) }] : [])]}
      />

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="flex min-w-0 flex-col gap-4">
          <FormSection titulo={t('esencial.titulo')} descripcion={t('esencial.descripcion')}>
            <div className="flex items-end gap-3">
              <FormField etiqueta={t('esencial.nombre')} obligatorio error={errorNombre} ayuda={t('esencial.nombreAyuda')} className="flex-1">
                <input
                  className={`${campo} w-full`}
                  value={nombre}
                  maxLength={120}
                  onChange={(e) => {
                    setNombre(e.target.value);
                    setErrorNombre(null);
                  }}
                />
              </FormField>
              <label className="mb-7 flex shrink-0 items-center gap-2 text-sm">
                <Switch checked={activa} onCheckedChange={setActiva} aria-label={t('esencial.activa')} />
                {t('esencial.activa')}
              </label>
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              <FormField etiqueta={t('esencial.moneda')} obligatorio ayuda={t('esencial.monedaAyuda')}>
                <input className={`${campo} w-full`} value={moneda.code} disabled readOnly />
              </FormField>
              <FormField etiqueta={t('esencial.desde')} obligatorio ayuda={t('esencial.desdeAyuda')}>
                {(c) => <CampoFecha id={c.id} valor={desde} onValorChange={(v) => v && setDesde(v)} />}
              </FormField>
              <FormField etiqueta={t('esencial.hasta')} ayuda={t('esencial.hastaAyuda')}>
                {(c) => <CampoFecha id={c.id} valor={hasta} onValorChange={(v) => setHasta(v || null)} placeholder={t('esencial.sinFin')} limpiable />}
              </FormField>
            </div>
          </FormSection>

          <FormSection titulo={t('como.titulo')} descripcion={t('como.descripcion')}>
            <div className="flex flex-wrap items-center gap-3">
              <span className="text-sm text-fg-secondary">{t('como.base')}</span>
              <SegmentedControl<BaseLista>
                etiqueta={t('como.base')}
                valor={base}
                onValorChange={setBase}
                opciones={[
                  { valor: 'percent', etiqueta: t('como.porcentaje') },
                  { valor: 'fixed_only', etiqueta: t('como.soloFijos') },
                ]}
              />
            </div>
            {base === 'percent' && (
              <div className="flex flex-wrap items-center gap-2 rounded-lg bg-subtle p-3 text-sm">
                <span className="font-medium text-fg">{t('como.todoCatalogo')}</span>
                <Select value={sentido} onValueChange={(v) => setSentido(v as 'bajar' | 'subir')}>
                  <SelectTrigger className="h-9 w-28"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="bajar">{t('como.bajar')}</SelectItem>
                    <SelectItem value="subir">{t('como.subir')}</SelectItem>
                  </SelectContent>
                </Select>
                <input
                  type="number"
                  min={0}
                  max={sentido === 'bajar' ? 100 : 1000}
                  step="0.5"
                  className={`${campo} h-9 w-20`}
                  value={porcentaje}
                  onChange={(e) => setPorcentaje(Math.max(0, Number(e.target.value) || 0))}
                  aria-label={t('como.porcentajeEtiqueta')}
                />
                <span>{t('como.sobreNormal')}</span>
                <span className="ml-auto text-xs text-fg-muted">
                  {t('como.ejemplo', { antes: formatear(10000), despues: formatear(Math.max(0, 10000 * (1 + pctGeneral / 100))) })}
                </span>
              </div>
            )}
            {sentido === 'subir' && base === 'percent' && porcentaje > 0 && (
              <p className="flex items-center gap-2 text-sm text-warning-text"><AlertTriangle aria-hidden="true" className="size-4" />{t('como.avisoSubir')}</p>
            )}

            <div className="flex flex-col gap-2">
              <p className="text-sm font-medium text-fg">{t('excepciones.titulo')}</p>
              {reglas.length > 0 && (
                <div className="overflow-x-auto rounded-lg border border-line">
                  <table className="w-full text-sm">
                    <thead className="bg-subtle text-left text-xs text-fg-secondary">
                      <tr>
                        <th className="px-3 py-2 font-medium">{t('excepciones.aplicaA')}</th>
                        <th className="px-3 py-2 font-medium">{t('excepciones.ajuste')}</th>
                        <th className="w-10 px-3 py-2"><span className="sr-only">{t('excepciones.quitar')}</span></th>
                      </tr>
                    </thead>
                    <tbody>
                      {reglas.map((r) => (
                        <tr key={r.clave} className="border-t border-line">
                          <td className="px-3 py-2">
                            <Badge tono="neutro" apariencia="suave" tamano="sm">{t(r.scope === 'category' ? 'excepciones.categoria' : 'excepciones.marca')}</Badge>
                            <span className="ml-2 text-fg">{r.scope === 'category' ? r.category_name ?? `#${r.category_id}` : r.brand}</span>
                          </td>
                          <td className="px-3 py-2">
                            <div className="flex flex-wrap items-center gap-2">
                              {!r.no_discount && (
                                <>
                                  <input
                                    type="number"
                                    min={0}
                                    step="0.5"
                                    className={`${campo} h-9 w-20`}
                                    value={r.valor}
                                    onChange={(e) => cambiarRegla(r.clave, { valor: Math.max(0, Number(e.target.value) || 0) })}
                                    aria-label={t('como.porcentajeEtiqueta')}
                                  />
                                  <Select value={r.sentido} onValueChange={(v) => cambiarRegla(r.clave, { sentido: v as 'bajar' | 'subir' })}>
                                    <SelectTrigger className="h-9 w-28"><SelectValue /></SelectTrigger>
                                    <SelectContent>
                                      <SelectItem value="bajar">{t('excepciones.menos')}</SelectItem>
                                      <SelectItem value="subir">{t('excepciones.mas')}</SelectItem>
                                    </SelectContent>
                                  </Select>
                                </>
                              )}
                              <label className="flex items-center gap-2 text-xs text-fg-secondary">
                                <Switch checked={r.no_discount} onCheckedChange={(v) => cambiarRegla(r.clave, { no_discount: v })} aria-label={t('excepciones.sinDescuento')} />
                                {t('excepciones.sinDescuento')}
                              </label>
                            </div>
                          </td>
                          <td className="px-3 py-2">
                            <button type="button" aria-label={t('excepciones.quitar')} className="text-fg-muted hover:text-danger-text" onClick={() => setReglas((rs) => rs.filter((x) => x.clave !== r.clave))}>
                              <Trash2 aria-hidden="true" className="size-4" strokeWidth={1.5} />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              <div className="flex flex-wrap gap-2">
                <Select value="" onValueChange={(v) => agregarRegla('category', v)}>
                  <SelectTrigger className={clasesBoton({ variante: 'secundario', tamano: 'sm', className: 'w-auto' })}>
                    <Plus aria-hidden="true" className="size-4" /> {t('excepciones.agregarCategoria')}
                  </SelectTrigger>
                  <SelectContent>
                    {categorias.map((c) => (
                      <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select value="" onValueChange={(v) => agregarRegla('brand', v)} disabled={marcas.length === 0}>
                  <SelectTrigger className={clasesBoton({ variante: 'secundario', tamano: 'sm', className: 'w-auto' })}>
                    <Plus aria-hidden="true" className="size-4" /> {t('excepciones.agregarMarca')}
                  </SelectTrigger>
                  <SelectContent>
                    {marcas.map((m) => (
                      <SelectItem key={m} value={m}>{m}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </FormSection>

          <FormSection
            titulo={t('fijos.titulo')}
            descripcion={t('fijos.descripcion')}
            accion={
              <div className="flex gap-2">
                {id && (
                  <button type="button" className={clasesBoton({ variante: 'secundario', tamano: 'sm' })} onClick={() => setDlgImportar(true)}>
                    <Upload aria-hidden="true" className="size-4" strokeWidth={1.5} /> {t('fijos.importar')}
                  </button>
                )}
                <button
                  type="button"
                  className={clasesBoton({ variante: 'secundario', tamano: 'sm' })}
                  disabled={productos.length === 0}
                  onClick={() => {
                    const csv = exportarCsv(
                      { sku: t('fijos.csv.sku'), precio: t('fijos.csv.precio'), cantidad: t('fijos.csv.cantidad'), producto: t('fijos.csv.producto') },
                      productos,
                    );
                    const url = URL.createObjectURL(new Blob([`﻿${csv}`], { type: 'text/csv;charset=utf-8' }));
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = `${nombre || 'lista'}.csv`;
                    a.click();
                    URL.revokeObjectURL(url);
                  }}
                >
                  <Download aria-hidden="true" className="size-4" strokeWidth={1.5} /> {t('fijos.exportar')}
                </button>
              </div>
            }
          >
            {productos.length > 5 && (
              <input className={`${campo} w-full`} placeholder={t('fijos.buscar')} value={busquedaFijos} onChange={(e) => setBusquedaFijos(e.target.value)} aria-label={t('fijos.buscar')} />
            )}
            {productos.length > 0 && (
              <div className="overflow-x-auto rounded-lg border border-line">
                <table className="w-full text-sm">
                  <thead className="bg-subtle text-left text-xs text-fg-secondary">
                    <tr>
                      <th className="px-3 py-2 font-medium">{t('fijos.producto')}</th>
                      <th className="px-3 py-2 text-right font-medium">{t('fijos.normal')}</th>
                      <th className="px-3 py-2 font-medium">{t('fijos.enLista')}</th>
                      <th className="px-3 py-2 font-medium">{t('fijos.diferencia')}</th>
                      <th className="px-3 py-2 font-medium">{t('fijos.porCantidad')}</th>
                      <th className="w-10 px-3 py-2"><span className="sr-only">{t('fijos.quitar')}</span></th>
                    </tr>
                  </thead>
                  <tbody>
                    {fijosVisibles.map((p) => {
                      const primero = p.escalones[0];
                      const dif = primero ? diferenciaPorcentual(primero.price, p.normal) : null;
                      return (
                        <FilaProductoFijo
                          key={p.product_id}
                          p={p}
                          dif={dif}
                          formatear={formatear}
                          campo={campo}
                          onPrecio={(precio) => cambiarEscalon(p.product_id, 0, { price: precio })}
                          onAlternar={() => cambiarProducto(p.product_id, { abierto: !p.abierto })}
                          onEscalon={(i, cambio) => cambiarEscalon(p.product_id, i, cambio)}
                          onAgregarEscalon={() =>
                            cambiarProducto(p.product_id, {
                              abierto: true,
                              escalones: [...p.escalones, { min_qty: Math.max(...p.escalones.map((e) => e.min_qty), 1) * 2, price: p.escalones[p.escalones.length - 1]?.price ?? p.normal ?? 0 }],
                            })
                          }
                          onQuitarEscalon={(i) => cambiarProducto(p.product_id, { escalones: p.escalones.filter((_, j) => j !== i) })}
                          onQuitar={() => setProductos((ps) => ps.filter((x) => x.product_id !== p.product_id))}
                        />
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
            <div className="flex items-center justify-between gap-2">
              <button type="button" className={clasesBoton({ variante: 'secundario', tamano: 'sm' })} onClick={() => setDlgProductos(true)}>
                <Plus aria-hidden="true" className="size-4" strokeWidth={1.5} /> {t('fijos.agregar')}
              </button>
              <span className="text-xs text-fg-muted">{t('fijos.conteo', { n: productos.length })}</span>
            </div>
          </FormSection>

          <FormSection titulo={t('redondeo.titulo')} descripcion={t('redondeo.descripcion')}>
            <div className="flex flex-wrap items-center gap-3">
              <span className="text-sm text-fg-secondary">{t('redondeo.a')}</span>
              <SegmentedControl<string>
                etiqueta={t('redondeo.a')}
                valor={String(paso)}
                onValorChange={(v) => setPaso(Number(v))}
                opciones={PASOS_REDONDEO.map((n) => ({ valor: String(n), etiqueta: n === 0 ? t('redondeo.no') : formatear(n) }))}
              />
              <span className="text-sm text-fg-secondary">{t('redondeo.hacia')}</span>
              <SegmentedControl<ModoRedondeo>
                etiqueta={t('redondeo.hacia')}
                valor={modo}
                onValorChange={setModo}
                deshabilitado={paso === 0}
                opciones={(['down', 'nearest', 'up'] as const).map((m) => ({ valor: m, etiqueta: t(`redondeo.modos.${m}`) }))}
              />
            </div>
            <p className="text-xs text-fg-muted">{t('redondeo.ejemplo')}</p>
          </FormSection>

          <FormSection titulo={t('aplica.titulo')} descripcion={t('aplica.descripcion')}>
            <div className="grid gap-3 sm:grid-cols-3">
              {([
                { clave: 'pos', icono: Store, valor: pos, set: setPos },
                { clave: 'web', icono: Globe, valor: web, set: setWeb },
                { clave: 'documentos', icono: FileText, valor: documentos, set: setDocumentos },
              ] as const).map((c) => (
                <label key={c.clave} className={`flex flex-col gap-1 rounded-lg border p-3 ${c.valor ? 'border-brand bg-brand-tint' : 'border-line'}`}>
                  <span className="flex items-center justify-between">
                    <c.icono aria-hidden="true" className="size-4 text-fg-secondary" strokeWidth={1.5} />
                    <Switch checked={c.valor} onCheckedChange={c.set} aria-label={t(`aplica.${c.clave}`)} />
                  </span>
                  <span className="text-sm font-medium text-fg">{t(`aplica.${c.clave}`)}</span>
                  <span className="text-xs text-fg-secondary">{t(`aplica.${c.clave}Ayuda`)}</span>
                </label>
              ))}
            </div>
            <FormField etiqueta={t('aplica.sedes')} ayuda={t('aplica.sedesAyuda')}>
              <Select value={sedes && sedes.length === 1 ? String(sedes[0]) : 'todas'} onValueChange={(v) => setSedes(v === 'todas' ? null : [Number(v)])}>
                <SelectTrigger className="h-10"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="todas">{t('aplica.todasSedes')}</SelectItem>
                  {branches.map((b) => (
                    <SelectItem key={b.id} value={String(b.id)}>{b.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FormField>
          </FormSection>

          <FormSection titulo={t('clientes.titulo')} descripcion={t('clientes.descripcion')}>
            {id && detalle ? (
              <div className="flex flex-wrap items-center gap-2">
                {detalle.grupos.map((g) => (
                  <Badge key={g.segment_id} tono="neutro" apariencia="suave" icono={Users}>{t('clientes.grupo', { nombre: g.name, n: g.miembros })}</Badge>
                ))}
                <Badge tono="neutro" apariencia="suave" icono={Users}>{t('clientes.directos', { n: detalle.kpis.clientes_directos })}</Badge>
                <button type="button" className={clasesBoton({ variante: 'secundario', tamano: 'sm', className: 'ml-auto' })} onClick={() => router.push(`${rutaLista(id)}?pestana=clientes`)}>
                  <Users aria-hidden="true" className="size-4" strokeWidth={1.5} /> {t('clientes.asignar')}
                </button>
              </div>
            ) : (
              <p className="text-sm text-fg-secondary">{t('clientes.despues')}</p>
            )}
          </FormSection>
        </div>

        <aside className="flex flex-col gap-3 lg:sticky lg:top-4 lg:self-start">
          <AvisoTonal tono="informacion" titulo={t('palabras.titulo')} descripcion={enPalabras} />
          {masCaros.length > 0 && (
            <AvisoTonal
              tono="advertencia"
              titulo={t('avisoCaro.titulo')}
              descripcion={
                <>
                  {masCaros.slice(0, 5).map((p) => (
                    <span key={p.product_id} className="block">
                      {t('avisoCaro.linea', { nombre: p.name, lista: formatear(Math.max(...p.escalones.map((e) => e.price))), normal: formatear(p.normal ?? 0) })}
                    </span>
                  ))}
                  <span className="block">{t('avisoCaro.pie')}</span>
                </>
              }
            />
          )}
          {detalle && (
            <div className="rounded-xl border border-line p-4 text-sm">
              <p className="font-medium text-fg">{t('ultimoCambio')}</p>
              <p className="text-fg-secondary">{new Date(detalle.lista.updated_at).toLocaleString()}</p>
            </div>
          )}
        </aside>
      </div>

      <div className="fixed inset-x-0 bottom-0 z-20 border-t border-line bg-surface/95 px-4 py-3 backdrop-blur lg:left-[var(--ancho-sidebar,0px)]">
        <div className="mx-auto flex max-w-screen-2xl items-center justify-between gap-3">
          <p className="hidden text-xs text-fg-muted sm:block">{t('pieAviso')}</p>
          <div className="ml-auto flex gap-2">
            <button type="button" className={clasesBoton({ variante: 'fantasma' })} onClick={() => router.push(id ? rutaLista(id) : RUTA_LISTAS)}>
              {t('cancelar')}
            </button>
            <button type="button" className={clasesBoton({ variante: 'primario' })} onClick={() => void guardar()} disabled={guardando}>
              <Check aria-hidden="true" className="size-4" strokeWidth={1.5} /> {t('guardar')}
            </button>
          </div>
        </div>
      </div>

      <AgregarProductosDocumento
        abierto={dlgProductos}
        onAbiertoChange={setDlgProductos}
        variante="venta"
        sucursal={null}
        moneda={moneda}
        impuestos={[]}
        sinCrear
        onAgregar={(p) =>
          setProductos((ps) =>
            ps.some((x) => x.product_id === p.id)
              ? ps
              : [...ps, { product_id: p.id, name: p.nombre, sku: p.sku, normal: p.precioVenta, escalones: [{ min_qty: 1, price: Math.round(p.precioVenta * (1 + pctGeneral / 100)) }] }],
          )
        }
      />
      {id && (
        <ImportarPreciosDialog
          abierto={dlgImportar}
          onAbiertoChange={setDlgImportar}
          listaId={id}
          listaNombre={nombre}
          onImportado={() => void cargarDetalle(id)}
        />
      )}
    </div>
  );
}

function FilaProductoFijo({
  p,
  dif,
  formatear,
  campo,
  onPrecio,
  onAlternar,
  onEscalon,
  onAgregarEscalon,
  onQuitarEscalon,
  onQuitar,
}: {
  p: ProductoFijo;
  dif: number | null;
  formatear: (n: number) => string;
  campo: string;
  onPrecio: (precio: number) => void;
  onAlternar: () => void;
  onEscalon: (i: number, cambio: Partial<{ min_qty: number; price: number }>) => void;
  onAgregarEscalon: () => void;
  onQuitarEscalon: (i: number) => void;
  onQuitar: () => void;
}) {
  const t = useTranslations('listasPrecios.editor.fijos');
  const primero = p.escalones[0];
  const caro = dif !== null && dif > 0;
  return (
    <>
      <tr className="border-t border-line">
        <td className="px-3 py-2">
          <p className="text-fg">{p.name}</p>
          {p.sku && <p className="text-xs text-fg-muted">{p.sku}</p>}
        </td>
        <td className="px-3 py-2 text-right text-fg-secondary">{p.normal !== null ? formatear(p.normal) : '—'}</td>
        <td className="px-3 py-2">
          <input
            type="number"
            min={0}
            className={`${campo} h-9 w-32 ${caro ? 'border-line-warning' : ''}`}
            value={primero?.price ?? 0}
            onChange={(e) => onPrecio(Math.max(0, Number(e.target.value) || 0))}
            aria-label={t('precioDe', { nombre: p.name })}
          />
        </td>
        <td className="px-3 py-2">
          {dif !== null && (
            <Badge tono={caro ? 'advertencia' : 'exito'} apariencia="suave" tamano="sm">{`${dif > 0 ? '+' : ''}${dif.toLocaleString()} %`}</Badge>
          )}
        </td>
        <td className="px-3 py-2">
          {p.escalones.length > 1 ? (
            <button type="button" className="flex items-center gap-1 text-sm text-brand" onClick={onAlternar} aria-expanded={!!p.abierto}>
              {t('escalones', { n: p.escalones.length })}
              {p.abierto ? <ChevronUp aria-hidden="true" className="size-4" /> : <ChevronDown aria-hidden="true" className="size-4" />}
            </button>
          ) : (
            <button type="button" className="text-sm text-brand" onClick={onAgregarEscalon}>{t('agregarEscalon')}</button>
          )}
        </td>
        <td className="px-3 py-2">
          <button type="button" aria-label={t('quitar')} className="text-fg-muted hover:text-danger-text" onClick={onQuitar}>
            <Trash2 aria-hidden="true" className="size-4" strokeWidth={1.5} />
          </button>
        </td>
      </tr>
      {p.abierto && p.escalones.length > 1 && (
        <tr className="bg-brand-tint/40">
          <td colSpan={6} className="px-3 py-2">
            <p className="mb-2 text-xs font-medium text-brand">{t('escalonesAyuda')}</p>
            <div className="flex flex-wrap gap-2">
              {p.escalones.map((e, i) => (
                <div key={i} className="flex items-center gap-1 rounded-lg border border-line bg-surface p-2 text-xs">
                  <span>{t('desde')}</span>
                  <input
                    type="number"
                    min={1}
                    className={`${campo} h-8 w-16`}
                    value={e.min_qty}
                    disabled={i === 0}
                    onChange={(ev) => onEscalon(i, { min_qty: Math.max(1, Number(ev.target.value) || 1) })}
                    aria-label={t('desde')}
                  />
                  <span>{t('unidades')}</span>
                  <input
                    type="number"
                    min={0}
                    className={`${campo} h-8 w-24`}
                    value={e.price}
                    onChange={(ev) => onEscalon(i, { price: Math.max(0, Number(ev.target.value) || 0) })}
                    aria-label={t('precioEscalon')}
                  />
                  {i > 0 && (
                    <button type="button" aria-label={t('quitarEscalon')} className="text-fg-muted hover:text-danger-text" onClick={() => onQuitarEscalon(i)}>
                      <Trash2 aria-hidden="true" className="size-3.5" />
                    </button>
                  )}
                </div>
              ))}
              <button type="button" className="rounded-lg border border-dashed border-line-strong px-3 text-xs text-brand" onClick={onAgregarEscalon}>
                + {t('escalon')}
              </button>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}
