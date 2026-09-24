'use client';

import { useEffect, useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { GitBranch, Pencil, Plus, Sparkles, Trash2 } from 'lucide-react';
import { CampoNumero } from '@/components/kit/CampoNumero';
import { FormField } from '@/components/kit/FormField';
import { MultiSelect } from '@/components/kit/MultiSelect';
import { PanelAdaptable } from '@/components/kit/PanelAdaptable';
import { useFormatoEntero } from '@/components/kit/useIdiomaKit';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { cn } from '@/utils/Utils';
import { CampoCodigoBarras } from '../../codigos/CampoCodigoBarras';
import { EditorAtributos } from '../../detalle/variantes/EditorAtributos';
import { mismoTexto, unirTipos, valoresDeTipo, type TipoCatalogo } from '../../detalle/variantes/catalogoAtributos';
import { nuevaClave, type StockVarianteForm, type VarianteForm } from '../../logica/formularioProducto';
import {
  combinacionesNuevas,
  combinarAtributos,
  nombreVariante,
  resumenAtributos,
  skuVariante,
  type Atributos,
  type TipoAtributo,
} from '../../logica/variantes';
import type { PropsSeccionFormulario } from '../tipos';

/**
 * Sección «Variantes» del formulario único (Figma 09 «Nuevo producto», bloque
 * Variantes): switch «Tiene variantes», atributos (MultiSelect sobre el
 * catálogo + tipos nuevos), valores por tipo como chips, generador de
 * combinaciones y tabla editable (tarjetas en móvil) con un panel por
 * variante para atributos, código de barras, comparación y mínimos.
 *
 * No escribe en la base: los tipos y valores nuevos los crea la RPC al
 * guardar (`fn_producto_int_asegurar_atributos`). En editar, la existencia de
 * una variante que ya existe es de solo lectura (se cambia con un ajuste) y
 * quitarla la da de baja lógica al guardar.
 */
const ESTADOS: VarianteForm['status'][] = ['active', 'inactive', 'discontinued'];

const soloConValor = (attrs: Atributos): Atributos => Object.fromEntries(Object.entries(attrs).filter(([, val]) => val.trim()));

export function SeccionVariantes({ estado, cambiar, actualizar, errores, modo, catalogos, moneda }: PropsSeccionFormulario) {
  const t = useTranslations('productoForm.variantes');
  const te = useTranslations('productoForm.errores');
  const formatoEntero = useFormatoEntero();
  const variantes = estado.variantes;
  const rastrea = estado.track_stock && estado.product_type !== 'service';
  // En editar, si el producto ya tenía variantes guardadas no se puede apagar (la RPC
  // respondería «variantes_activas»): se retiran una a una o desde el detalle.
  const [habiaVariantes] = useState(() => modo === 'editar' && estado.variantes.some((v) => v.id));
  const conExistentes = modo === 'editar' && (habiaVariantes || variantes.some((v) => v.id));

  const [tiposSel, setTiposSel] = useState<string[]>([]);
  const [valoresSel, setValoresSel] = useState<Record<string, string[]>>({});
  const [locales, setLocales] = useState<TipoCatalogo[]>([]);
  const [nuevoValor, setNuevoValor] = useState<Record<string, string>>({});
  const [enPanel, setEnPanel] = useState<string | null>(null);
  const [aQuitar, setAQuitar] = useState<VarianteForm | null>(null);

  // Tipos y valores que ya usan las variantes (editar, duplicar o al generar).
  const usados = useMemo(() => resumenAtributos(variantes.map((v) => ({ attributes: v.attributes }))), [variantes]);
  useEffect(() => {
    if (usados.length === 0) return;
    setTiposSel((prev) => {
      const faltan = usados.map((u) => u.nombre).filter((n) => !prev.some((p) => mismoTexto(p, n)));
      return faltan.length ? [...prev, ...faltan] : prev;
    });
    setValoresSel((prev) => {
      let cambio = false;
      const sig = { ...prev };
      for (const u of usados) {
        const clave = Object.keys(sig).find((k) => mismoTexto(k, u.nombre)) ?? u.nombre;
        const actual = sig[clave] ?? [];
        const faltan = u.valores.filter((v) => !actual.some((a) => mismoTexto(a, v)));
        if (faltan.length) {
          sig[clave] = [...actual, ...faltan];
          cambio = true;
        }
      }
      return cambio ? sig : prev;
    });
  }, [usados]);

  const tipos = useMemo(
    () =>
      unirTipos(
        catalogos.tiposVariante.map((tp) => ({ id: tp.id, nombre: tp.name, valores: tp.valores.map((v) => v.value), guardados: tp.valores.map((v) => v.value) })),
        usados.map((u) => ({ id: null, nombre: u.nombre, valores: u.valores })),
        locales,
      ),
    [catalogos.tiposVariante, usados, locales],
  );

  const matriz: TipoAtributo[] = tiposSel.map((nombre) => ({ nombre, valores: valoresSel[nombre] ?? [] }));
  const total = combinarAtributos(matriz).length;
  const nuevas = combinacionesNuevas(
    matriz,
    variantes.map((v) => v.attributes),
  );

  const fijar = (lista: VarianteForm[]) => cambiar('variantes', lista);
  const actualizarVariante = (clave: string, fn: (v: VarianteForm) => VarianteForm) => fijar(variantes.map((v) => (v.clave === clave ? fn(v) : v)));

  const skusUsados = (excepto?: string): Set<string> => {
    const set = new Set<string>();
    if (estado.sku.trim()) set.add(estado.sku.trim().toUpperCase());
    for (const v of variantes) if (v.clave !== excepto && v.sku.trim()) set.add(v.sku.trim().toUpperCase());
    return set;
  };

  const stockInicial = (): StockVarianteForm[] =>
    catalogos.sucursales.map((s) => ({ branch_id: s.branch_id, qty: null, min_level: null, qty_actual: 0 }));

  const generar = () => {
    if (nuevas.length === 0) return;
    const usadosSku = skusUsados();
    const creadas: VarianteForm[] = nuevas.map((combo) => {
      const sku = skuVariante(estado.sku, combo, usadosSku);
      usadosSku.add(sku.toUpperCase());
      return {
        clave: nuevaClave('v'),
        sku,
        barcode: '',
        name: nombreVariante(estado.name, combo),
        attributes: combo,
        price: estado.price,
        compare_price: null,
        cost: estado.cost,
        status: 'active',
        stock: stockInicial(),
      };
    });
    actualizar({ tiene_variantes: true, variantes: [...variantes, ...creadas] });
  };

  const agregarManual = () => {
    const attrs: Atributos = Object.fromEntries(tiposSel.map((tp) => [tp, '']));
    const nueva: VarianteForm = {
      clave: nuevaClave('v'),
      sku: skuVariante(estado.sku, {}, skusUsados()),
      barcode: '',
      name: estado.name,
      attributes: attrs,
      price: estado.price,
      compare_price: null,
      cost: estado.cost,
      status: 'active',
      stock: stockInicial(),
    };
    fijar([...variantes, nueva]);
    setEnPanel(nueva.clave);
  };

  const cambiarTipos = (lista: string[]) => {
    const quitados = tiposSel.filter((x) => !lista.includes(x));
    setTiposSel(lista);
    if (quitados.length === 0) return;
    setValoresSel((prev) => {
      const sig = { ...prev };
      for (const q of quitados) delete sig[q];
      return sig;
    });
    // Las variantes nuevas pierden el atributo (y su nombre automático se recalcula);
    // las que ya existen en la base no se tocan.
    if (!variantes.some((v) => !v.id && quitados.some((q) => q in v.attributes))) return;
    fijar(
      variantes.map((v) => {
        if (v.id || !quitados.some((q) => q in v.attributes)) return v;
        const attrs = { ...v.attributes };
        for (const q of quitados) delete attrs[q];
        const automatico = v.name === nombreVariante(estado.name, soloConValor(v.attributes));
        return { ...v, attributes: attrs, name: automatico ? nombreVariante(estado.name, soloConValor(attrs)) : v.name };
      }),
    );
  };

  const alternarValor = (tipo: string, valor: string) =>
    setValoresSel((prev) => {
      const actual = prev[tipo] ?? [];
      const ya = actual.some((v) => mismoTexto(v, valor));
      return { ...prev, [tipo]: ya ? actual.filter((v) => !mismoTexto(v, valor)) : [...actual, valor] };
    });

  const agregarValor = (tipo: string) => {
    const valor = (nuevoValor[tipo] ?? '').trim();
    if (!valor) return;
    setLocales((prev) => [...prev, { id: null, nombre: tipo, valores: [valor] }]);
    setValoresSel((prev) => {
      const actual = prev[tipo] ?? [];
      return actual.some((v) => mismoTexto(v, valor)) ? prev : { ...prev, [tipo]: [...actual, valor] };
    });
    setNuevoValor((prev) => ({ ...prev, [tipo]: '' }));
  };

  const cambiarStock = (v: VarianteForm, branchId: number, parcial: Partial<StockVarianteForm>) => {
    const existe = v.stock.some((s) => s.branch_id === branchId);
    const stock = existe
      ? v.stock.map((s) => (s.branch_id === branchId ? { ...s, ...parcial } : s))
      : [...v.stock, { branch_id: branchId, qty: null, min_level: null, qty_actual: 0, ...parcial }];
    actualizarVariante(v.clave, (x) => ({ ...x, stock }));
  };
  const filaStock = (v: VarianteForm, branchId: number): StockVarianteForm =>
    v.stock.find((s) => s.branch_id === branchId) ?? { branch_id: branchId, qty: null, min_level: null, qty_actual: 0 };

  const quitar = (v: VarianteForm) => {
    if (modo === 'editar' && v.id) {
      setAQuitar(v);
      return;
    }
    fijar(variantes.filter((x) => x.clave !== v.clave));
  };

  const esExistente = (v: VarianteForm) => modo === 'editar' && !!v.id;
  const variantePanel = variantes.find((v) => v.clave === enPanel) ?? null;
  const totalInicial = variantes.reduce((a, v) => a + (esExistente(v) ? 0 : v.stock.reduce((b, s) => b + (s.qty ?? 0), 0)), 0);

  const chipsAtributos = (v: VarianteForm) => {
    const pares = Object.entries(v.attributes).filter(([, val]) => val.trim());
    if (pares.length === 0) return <span className="text-xs text-fg-muted">{t('sinAtributos')}</span>;
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

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-start justify-between gap-3">
        <label className="flex items-start gap-3">
          <Switch
            checked={estado.tiene_variantes}
            onCheckedChange={(v) => cambiar('tiene_variantes', v)}
            disabled={conExistentes && estado.tiene_variantes}
            aria-describedby="sv-switch-ayuda"
          />
          <span className="flex flex-col">
            <span className="text-sm font-medium text-fg">{t('tieneVariantes')}</span>
            <span id="sv-switch-ayuda" className="text-xs text-fg-muted">
              {conExistentes && estado.tiene_variantes ? t('switchBloqueado') : t('tieneVariantesAyuda')}
            </span>
          </span>
        </label>
      </div>

      {!estado.tiene_variantes ? (
        <p className="rounded-lg border border-line bg-subtle px-4 py-6 text-center text-sm text-fg-muted">{t('apagado')}</p>
      ) : (
        <>
          {errores.variantes && (
            <p role="alert" className="rounded-lg border border-danger bg-danger-subtle px-3 py-2 text-sm text-danger-text">
              {te(errores.variantes, { detalle: '' })}
            </p>
          )}

          {/* Atributos */}
          <div className="flex flex-col gap-1.5">
            <span id="sv-atributos" className="text-sm font-medium text-fg">
              {t('atributos')}
            </span>
            <MultiSelect
              aria-labelledby="sv-atributos"
              opciones={tipos.map((tp) => ({ valor: tp.nombre, etiqueta: tp.nombre }))}
              valores={tiposSel}
              onValoresChange={cambiarTipos}
              onCrear={(texto) => {
                const limpio = texto.trim();
                if (!limpio) return;
                const ya = tipos.find((tp) => mismoTexto(tp.nombre, limpio))?.nombre;
                if (!ya) setLocales((prev) => [...prev, { id: null, nombre: limpio, valores: [] }]);
                const nombre = ya ?? limpio;
                setTiposSel((prev) => (prev.some((x) => mismoTexto(x, nombre)) ? prev : [...prev, nombre]));
              }}
              textoCrear={(texto) => t('crearTipo', { tipo: texto })}
              placeholder={t('atributosPlaceholder')}
              placeholderBusqueda={t('buscar')}
              textoVacio={t('sinTipos')}
              etiquetaQuitar={(e) => t('quitarTipo', { tipo: e })}
            />
            <span className="text-xs text-fg-muted">{t('atributosAyuda')}</span>
          </div>

          {/* Valores por tipo + generador */}
          {tiposSel.length > 0 && (
            <div className="flex flex-col gap-3 rounded-lg border border-line bg-subtle p-3">
              {tiposSel.map((tipo) => {
                const valores = valoresDeTipo(tipos, tipo);
                const sel = valoresSel[tipo] ?? [];
                return (
                  <div key={tipo} className="flex flex-col gap-2 lg:flex-row lg:items-center">
                    <span className="w-24 shrink-0 text-sm font-medium text-fg">{tipo}</span>
                    <div className="flex flex-1 flex-wrap items-center gap-1.5">
                      {valores.map((v) => {
                        const activo = sel.some((x) => mismoTexto(x, v));
                        return (
                          <button
                            key={v}
                            type="button"
                            aria-pressed={activo}
                            onClick={() => alternarValor(tipo, v)}
                            className={cn(
                              'rounded-full border px-2.5 py-1 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand',
                              activo ? 'border-brand bg-brand-tint text-brand-deep' : 'border-line bg-surface text-fg-secondary hover:bg-hover',
                            )}
                          >
                            {v}
                          </button>
                        );
                      })}
                      <span className="inline-flex items-center gap-1">
                        <Input
                          value={nuevoValor[tipo] ?? ''}
                          onChange={(e) => setNuevoValor((prev) => ({ ...prev, [tipo]: e.target.value }))}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              e.preventDefault();
                              agregarValor(tipo);
                            }
                          }}
                          placeholder={t('nuevoValor')}
                          aria-label={t('nuevoValorDe', { tipo })}
                          className="h-8 w-32 text-xs"
                        />
                        <button
                          type="button"
                          onClick={() => agregarValor(tipo)}
                          disabled={!(nuevoValor[tipo] ?? '').trim()}
                          aria-label={t('agregarValorDe', { tipo })}
                          className="flex size-8 items-center justify-center rounded-lg border border-line-strong bg-surface text-fg-secondary hover:bg-hover disabled:opacity-50"
                        >
                          <Plus aria-hidden="true" className="size-4" />
                        </button>
                      </span>
                    </div>
                  </div>
                );
              })}
              <div className="flex flex-col gap-2 border-t border-line pt-3 sm:flex-row sm:items-center sm:justify-between">
                <span className="text-xs text-fg-secondary" aria-live="polite">
                  {total === 0
                    ? t('elegirValores')
                    : t('seGeneraran', { count: nuevas.length, total: formatoEntero(total), existentes: formatoEntero(total - nuevas.length) })}
                </span>
                <Button type="button" size="sm" onClick={generar} disabled={nuevas.length === 0}>
                  <Sparkles aria-hidden="true" className="mr-2 size-4" /> {t('generar', { count: nuevas.length })}
                </Button>
              </div>
            </div>
          )}

          {/* Lista de variantes */}
          {variantes.length === 0 ? (
            <div className="flex flex-col items-center gap-3 rounded-lg border border-line px-4 py-6 text-center">
              <GitBranch aria-hidden="true" className="size-8 text-fg-muted" />
              <p className="text-sm text-fg-muted">{t('sinVariantes')}</p>
              <Button type="button" variant="outline" size="sm" onClick={agregarManual}>
                <Plus aria-hidden="true" className="mr-2 size-4" /> {t('crearPrimera')}
              </Button>
            </div>
          ) : (
            <>
              {/* Escritorio: tabla editable */}
              <div className="hidden overflow-x-auto rounded-lg border border-line lg:block">
                <table className="w-full min-w-[880px] text-sm">
                  <caption className="sr-only">{t('tabla')}</caption>
                  <thead className="bg-subtle text-xs text-fg-secondary">
                    <tr>
                      <th scope="col" className="px-3 py-2 text-left font-medium">{t('columnas.sku')}</th>
                      <th scope="col" className="px-3 py-2 text-left font-medium">{t('columnas.codigo')}</th>
                      <th scope="col" className="px-3 py-2 text-left font-medium">{t('columnas.nombre')}</th>
                      <th scope="col" className="w-32 px-3 py-2 text-right font-medium">{t('columnas.precio')}</th>
                      <th scope="col" className="w-32 px-3 py-2 text-right font-medium">{t('columnas.costo')}</th>
                      {rastrea &&
                        catalogos.sucursales.map((s) => (
                          <th key={s.branch_id} scope="col" className="w-24 px-3 py-2 text-right font-medium">
                            {s.nombre}
                          </th>
                        ))}
                      <th scope="col" className="w-36 px-3 py-2 text-left font-medium">{t('columnas.estado')}</th>
                      <th scope="col" className="w-20 px-3 py-2">
                        <span className="sr-only">{t('columnas.acciones')}</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {variantes.map((v) => (
                      <tr key={v.clave} className="align-top">
                        <td className="px-3 py-2">
                          <Input
                            value={v.sku}
                            onChange={(e) => actualizarVariante(v.clave, (x) => ({ ...x, sku: e.target.value }))}
                            aria-label={t('skuDe', { nombre: v.name })}
                            className="h-9 min-w-[140px] font-mono text-xs"
                          />
                        </td>
                        <td className="px-3 py-2 align-middle">
                          <button
                            type="button"
                            onClick={() => setEnPanel(v.clave)}
                            className="max-w-[140px] truncate text-left font-mono text-xs text-link hover:underline"
                            title={t('editarCodigo')}
                          >
                            {v.barcode || t('sinCodigo')}
                          </button>
                        </td>
                        <td className="px-3 py-2">
                          <Input
                            value={v.name}
                            onChange={(e) => actualizarVariante(v.clave, (x) => ({ ...x, name: e.target.value }))}
                            aria-label={t('nombreDe', { sku: v.sku })}
                            className="h-9 min-w-[180px]"
                          />
                          <div className="mt-1">{chipsAtributos(v)}</div>
                        </td>
                        <td className="px-3 py-2">
                          <CampoNumero
                            tamano="sm"
                            valor={v.price}
                            onValorChange={(n) => actualizarVariante(v.clave, (x) => ({ ...x, price: n }))}
                            prefijo={moneda.simbolo}
                            decimales={moneda.decimales}
                            minimo={0}
                            aria-label={t('precioDe', { nombre: v.name })}
                          />
                        </td>
                        <td className="px-3 py-2">
                          <CampoNumero
                            tamano="sm"
                            valor={v.cost}
                            onValorChange={(n) => actualizarVariante(v.clave, (x) => ({ ...x, cost: n }))}
                            prefijo={moneda.simbolo}
                            decimales={moneda.decimales}
                            minimo={0}
                            aria-label={t('costoDe', { nombre: v.name })}
                          />
                        </td>
                        {rastrea &&
                          catalogos.sucursales.map((s) => {
                            const f = filaStock(v, s.branch_id);
                            return (
                              <td key={s.branch_id} className="px-3 py-2 text-right">
                                {esExistente(v) ? (
                                  <span className="inline-block pt-2 tabular-nums text-fg-secondary" title={t('existenciaSoloLectura')}>
                                    {formatoEntero(f.qty_actual)}
                                  </span>
                                ) : (
                                  <CampoNumero
                                    tamano="sm"
                                    valor={f.qty}
                                    onValorChange={(n) => cambiarStock(v, s.branch_id, { qty: n })}
                                    decimales={3}
                                    minimo={0}
                                    placeholder="0"
                                    aria-label={t('cantidadDe', { nombre: v.name, sucursal: s.nombre })}
                                  />
                                )}
                              </td>
                            );
                          })}
                        <td className="px-3 py-2">
                          <SelectorEstado valor={v.status} onChange={(status) => actualizarVariante(v.clave, (x) => ({ ...x, status }))} etiqueta={t('estadoDe', { nombre: v.name })} />
                        </td>
                        <td className="px-3 py-2">
                          <div className="flex justify-end gap-1">
                            <button
                              type="button"
                              onClick={() => setEnPanel(v.clave)}
                              aria-label={t('editarDe', { nombre: v.name })}
                              title={t('editarDetalle')}
                              className="flex size-8 items-center justify-center rounded-lg text-fg-secondary hover:bg-hover hover:text-fg"
                            >
                              <Pencil aria-hidden="true" className="size-4" />
                            </button>
                            <button
                              type="button"
                              onClick={() => quitar(v)}
                              aria-label={t('quitarDe', { nombre: v.name })}
                              title={t('quitar')}
                              className="flex size-8 items-center justify-center rounded-lg text-danger-text hover:bg-danger-subtle"
                            >
                              <Trash2 aria-hidden="true" className="size-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Móvil: tarjetas */}
              <ul className="flex flex-col gap-2 lg:hidden">
                {variantes.map((v) => {
                  const stockTexto = esExistente(v)
                    ? formatoEntero(v.stock.reduce((a, s) => a + s.qty_actual, 0))
                    : formatoEntero(v.stock.reduce((a, s) => a + (s.qty ?? 0), 0));
                  return (
                    <li key={v.clave} className="flex flex-col gap-2 rounded-xl border border-line bg-surface p-3">
                      <div className="flex items-start gap-2">
                        <button type="button" onClick={() => setEnPanel(v.clave)} className="flex min-w-0 flex-1 flex-col text-left">
                          <span className="truncate text-sm font-medium text-fg">{v.name || t('sinNombre')}</span>
                          <span className="truncate font-mono text-xs text-fg-secondary">{v.sku || '—'}</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => setEnPanel(v.clave)}
                          aria-label={t('editarDe', { nombre: v.name })}
                          className="flex size-9 shrink-0 items-center justify-center rounded-lg text-fg-secondary hover:bg-hover"
                        >
                          <Pencil aria-hidden="true" className="size-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => quitar(v)}
                          aria-label={t('quitarDe', { nombre: v.name })}
                          className="flex size-9 shrink-0 items-center justify-center rounded-lg text-danger-text hover:bg-danger-subtle"
                        >
                          <Trash2 aria-hidden="true" className="size-4" />
                        </button>
                      </div>
                      {chipsAtributos(v)}
                      <p className="text-xs text-fg-secondary">
                        <span className="font-semibold text-fg">{v.price === null ? '—' : moneda.formatear(v.price)}</span>
                        {' · '}
                        {t('movilCosto', { costo: v.cost === null ? '—' : moneda.formatear(v.cost) })}
                        {rastrea && <>{' · '}{esExistente(v) ? t('movilExistencia', { stock: stockTexto }) : t('movilInicial', { stock: stockTexto })}</>}
                      </p>
                    </li>
                  );
                })}
              </ul>

              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <span className="text-xs text-fg-muted">
                  {t('resumen', { count: variantes.length })}
                  {rastrea && totalInicial > 0 && ` · ${t('totalInicial', { total: formatoEntero(totalInicial) })}`}
                </span>
                <Button type="button" variant="outline" size="sm" onClick={agregarManual}>
                  <Plus aria-hidden="true" className="mr-2 size-4" /> {t('agregarManual')}
                </Button>
              </div>
            </>
          )}
        </>
      )}

      {/* Panel de una variante (diálogo en escritorio, hoja en móvil) */}
      <PanelAdaptable
        abierto={variantePanel !== null}
        onAbiertoChange={(abierto) => !abierto && setEnPanel(null)}
        titulo={t('panel.titulo')}
        descripcion={variantePanel?.name}
        icono={GitBranch}
        ancho={560}
        pie={
          <Button type="button" onClick={() => setEnPanel(null)}>
            {t('panel.listo')}
          </Button>
        }
      >
        {variantePanel && (
          <PanelVariante
            v={variantePanel}
            tipos={tipos}
            existente={esExistente(variantePanel)}
            rastrea={rastrea}
            sucursales={catalogos.sucursales}
            moneda={moneda}
            nombrePadre={estado.name}
            filaStock={(b) => filaStock(variantePanel, b)}
            onCambiar={(fn) => actualizarVariante(variantePanel.clave, fn)}
            onCambiarStock={(b, p) => cambiarStock(variantePanel, b, p)}
          />
        )}
      </PanelAdaptable>

      <ConfirmDialog
        open={aQuitar !== null}
        onOpenChange={(abierto) => !abierto && setAQuitar(null)}
        title={t('quitarTitulo', { nombre: aQuitar?.name ?? '' })}
        description={t('quitarDescripcion')}
        confirmLabel={t('quitar')}
        cancelLabel={t('cancelar')}
        variant="destructive"
        onConfirm={() => {
          if (aQuitar) fijar(variantes.filter((x) => x.clave !== aQuitar.clave));
        }}
      />
    </div>
  );
}

function SelectorEstado({ valor, onChange, etiqueta }: { valor: VarianteForm['status']; onChange: (v: VarianteForm['status']) => void; etiqueta: string }) {
  const t = useTranslations('productoForm.variantes');
  return (
    <Select value={valor} onValueChange={(v) => onChange(v as VarianteForm['status'])}>
      <SelectTrigger className="h-9 w-full" aria-label={etiqueta}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {ESTADOS.map((e) => (
          <SelectItem key={e} value={e}>
            {t(`estados.${e}`)}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

interface PanelVarianteProps {
  v: VarianteForm;
  tipos: readonly TipoCatalogo[];
  existente: boolean;
  rastrea: boolean;
  sucursales: PropsSeccionFormulario['catalogos']['sucursales'];
  moneda: PropsSeccionFormulario['moneda'];
  nombrePadre: string;
  filaStock: (branchId: number) => StockVarianteForm;
  onCambiar: (fn: (v: VarianteForm) => VarianteForm) => void;
  onCambiarStock: (branchId: number, parcial: Partial<StockVarianteForm>) => void;
}

function PanelVariante({ v, tipos, existente, rastrea, sucursales, moneda, nombrePadre, filaStock, onCambiar, onCambiarStock }: PanelVarianteProps) {
  const tpv = useTranslations('productoForm.variantes.panel');
  const formatoEntero = useFormatoEntero();

  const cambiarAtributos = (attrs: Atributos) =>
    onCambiar((x) => {
      const automatico = x.name === nombreVariante(nombrePadre, soloConValor(x.attributes)) || !x.name.trim();
      return { ...x, attributes: attrs, name: automatico ? nombreVariante(nombrePadre, soloConValor(attrs)) : x.name };
    });

  return (
    <>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <FormField etiqueta={tpv('sku')} obligatorio>
          <Input value={v.sku} onChange={(e) => onCambiar((x) => ({ ...x, sku: e.target.value }))} className="h-10 font-mono" autoComplete="off" />
        </FormField>
        <FormField etiqueta={tpv('estado')}>
          <SelectorEstado valor={v.status} onChange={(status) => onCambiar((x) => ({ ...x, status }))} etiqueta={tpv('estado')} />
        </FormField>
      </div>
      <FormField etiqueta={tpv('nombre')} obligatorio>
        <Input value={v.name} onChange={(e) => onCambiar((x) => ({ ...x, name: e.target.value }))} className="h-10" />
      </FormField>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <FormField etiqueta={tpv('precio')}>
          <CampoNumero valor={v.price} onValorChange={(n) => onCambiar((x) => ({ ...x, price: n }))} prefijo={moneda.simbolo} decimales={moneda.decimales} minimo={0} />
        </FormField>
        <FormField etiqueta={tpv('comparacion')}>
          <CampoNumero valor={v.compare_price} onValorChange={(n) => onCambiar((x) => ({ ...x, compare_price: n }))} prefijo={moneda.simbolo} decimales={moneda.decimales} minimo={0} />
        </FormField>
        <FormField etiqueta={tpv('costo')}>
          <CampoNumero valor={v.cost} onValorChange={(n) => onCambiar((x) => ({ ...x, cost: n }))} prefijo={moneda.simbolo} decimales={moneda.decimales} minimo={0} />
        </FormField>
      </div>

      <section className="flex flex-col gap-2" aria-labelledby="pv-atributos">
        <h3 id="pv-atributos" className="text-sm font-medium text-fg">
          {tpv('atributos')}
        </h3>
        <EditorAtributos idBase={`pv-${v.clave}`} atributos={v.attributes} onChange={cambiarAtributos} tipos={tipos} />
      </section>

      {rastrea && (
        <section className="flex flex-col gap-2" aria-labelledby="pv-stock">
          <h3 id="pv-stock" className="text-sm font-medium text-fg">
            {tpv('stock')}
          </h3>
          <p className="text-xs text-fg-muted">{existente ? tpv('stockAyudaExistente') : tpv('stockAyudaNueva')}</p>
          {sucursales.length === 0 ? (
            <p className="text-sm text-fg-muted">{tpv('sinSucursales')}</p>
          ) : (
            <div className="flex flex-col divide-y divide-line rounded-lg border border-line">
              {sucursales.map((s) => {
                const f = filaStock(s.branch_id);
                return (
                  <div key={s.branch_id} className="grid grid-cols-2 items-center gap-x-3 gap-y-2 px-3 py-2 sm:grid-cols-[1fr_112px_96px]">
                    <span className="col-span-2 truncate text-sm text-fg sm:col-span-1">{s.nombre}</span>
                    {existente ? (
                      <span className="text-right text-sm tabular-nums text-fg-secondary" title={tpv('existenciaSoloLectura')}>
                        {formatoEntero(f.qty_actual)}
                      </span>
                    ) : (
                      <CampoNumero
                        tamano="sm"
                        valor={f.qty}
                        onValorChange={(n) => onCambiarStock(s.branch_id, { qty: n })}
                        decimales={3}
                        minimo={0}
                        placeholder="0"
                        aria-label={tpv('cantidadDe', { sucursal: s.nombre })}
                      />
                    )}
                    <CampoNumero
                      tamano="sm"
                      valor={f.min_level}
                      onValorChange={(n) => onCambiarStock(s.branch_id, { min_level: n })}
                      decimales={3}
                      minimo={0}
                      placeholder="0"
                      aria-label={tpv('minimoDe', { sucursal: s.nombre })}
                    />
                  </div>
                );
              })}
            </div>
          )}
        </section>
      )}

      <CampoCodigoBarras
        id={`pv-codigo-${v.clave}`}
        value={v.barcode}
        onChange={(barcode) => onCambiar((x) => ({ ...x, barcode }))}
        excluirIds={v.id ? [v.id] : []}
        variante
      />
    </>
  );
}
