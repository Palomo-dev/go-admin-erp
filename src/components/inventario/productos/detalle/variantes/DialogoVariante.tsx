'use client';

import { useEffect, useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { GitBranch, Loader2, Save } from 'lucide-react';
import { CampoNumero } from '@/components/kit/CampoNumero';
import { FormField } from '@/components/kit/FormField';
import { PanelAdaptable } from '@/components/kit/PanelAdaptable';
import { useFormatoEntero, useLocaleIntl } from '@/components/kit/useIdiomaKit';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/components/ui/use-toast';
import { ErrorProducto, productoService, type VarianteEntrada } from '@/lib/services/productoService';
import { CampoCodigoBarras, type EstadoCodigo } from '../../codigos/CampoCodigoBarras';
import { useRevisionCodigos } from '../../codigos/useRevisionCodigos';
import { calcularMargen } from '../../logica/margen';
import { nombreVariante, resumenAtributos, skuVariante, type Atributos } from '../../logica/variantes';
import { useProductoDetalle } from '../ContextoProducto';
import { EditorAtributos } from './EditorAtributos';
import type { useCatalogoAtributos } from './catalogoAtributos';
import type { VarianteDetalle } from './modeloVariantes';

/**
 * Crear o editar una variante desde el detalle (Figma «Crear nueva variante»
 * / «Editar variante»; en móvil, hoja inferior). Guarda con
 * `productoService.guardarVariante` (una RPC: fila hija + precio + costo +
 * impuestos del padre + stock inicial por kardex; al editar, precio y costo
 * con vigencia y la cantidad como ajuste de kardex por la diferencia).
 */
interface FilaStockDialogo {
  branch_id: number;
  nombre: string;
  /** Nueva: cantidad inicial. Existente: cantidad deseada (ajuste por la diferencia). */
  qty: number | null;
  qty_actual: number;
  min_level: number | null;
}

type ErroresDialogo = Partial<Record<'sku' | 'name' | 'price' | 'compare_price' | 'cost' | 'stock' | 'barcode', string>>;

export interface DialogoVarianteProps {
  abierto: boolean;
  onAbiertoChange: (abierto: boolean) => void;
  /** null = nueva variante. */
  variante: VarianteDetalle | null;
  variantes: readonly VarianteDetalle[];
  catalogo: ReturnType<typeof useCatalogoAtributos>;
  onGuardada: () => void;
}

const soloConValor = (attrs: Atributos): Atributos =>
  Object.fromEntries(
    Object.entries(attrs)
      .map(([k, v]) => [k.trim(), (v ?? '').trim()] as const)
      .filter(([k, v]) => k !== '' && v !== ''),
  );

export function DialogoVariante({ abierto, onAbiertoChange, variante, variantes, catalogo, onGuardada }: DialogoVarianteProps) {
  const t = useTranslations('productoDetalle.variantes.dialogo');
  const tc = useTranslations('productoDetalle.comun');
  const { producto, organizacionId, resumen, permisos, moneda, mensajeError } = useProductoDetalle();
  const { toast } = useToast();
  const { revisar } = useRevisionCodigos();
  const formatoEntero = useFormatoEntero();
  const localeIntl = useLocaleIntl();
  const nueva = variante === null;

  const [sku, setSku] = useState('');
  const [skuTocado, setSkuTocado] = useState(false);
  const [nombre, setNombre] = useState('');
  const [nombreTocado, setNombreTocado] = useState(false);
  const [precio, setPrecio] = useState<number | null>(null);
  const [comparacion, setComparacion] = useState<number | null>(null);
  const [costo, setCosto] = useState<number | null>(null);
  const [atributos, setAtributos] = useState<Atributos>({});
  const [stock, setStock] = useState<FilaStockDialogo[]>([]);
  const [codigo, setCodigo] = useState('');
  const [estadoCodigo, setEstadoCodigo] = useState<EstadoCodigo>('vacio');
  const [errores, setErrores] = useState<ErroresDialogo>({});
  const [guardando, setGuardando] = useState(false);

  const sucursales = useMemo(
    () => (resumen?.sucursales ?? []).filter((s) => s.activa || s.con_registro),
    [resumen?.sucursales],
  );

  /** SKU ocupados (el padre, sus variantes, también las dadas de baja) salvo el de la propia variante. */
  const skusUsados = useMemo(() => {
    const set = new Set<string>([producto.sku.toUpperCase()]);
    for (const c of producto.children ?? []) if (c.id !== variante?.id) set.add(c.sku.toUpperCase());
    for (const v of variantes) if (v.id !== variante?.id) set.add(v.sku.toUpperCase());
    return set;
  }, [producto.sku, producto.children, variantes, variante?.id]);

  // Estado inicial cada vez que se abre.
  useEffect(() => {
    if (!abierto) return;
    setErrores({});
    setGuardando(false);
    if (variante) {
      setSku(variante.sku);
      setNombre(variante.name);
      setSkuTocado(true);
      setNombreTocado(true);
      setPrecio(variante.price);
      setComparacion(variante.compare_price);
      setCosto(variante.cost);
      setAtributos({ ...variante.attributes });
      setCodigo(variante.barcode ?? '');
      setStock(
        sucursales.map((s) => {
          const fila = variante.stock.find((x) => x.branch_id === s.branch_id);
          return {
            branch_id: s.branch_id,
            nombre: s.nombre,
            qty: fila ? fila.qty_on_hand : 0,
            qty_actual: fila ? fila.qty_on_hand : 0,
            min_level: fila ? fila.min_level : null,
          };
        }),
      );
    } else {
      // Los atributos que ya usan las demás variantes, vacíos para llenarlos.
      const base: Atributos = Object.fromEntries(resumenAtributos(variantes.map((v) => ({ attributes: v.attributes }))).map((tp) => [tp.nombre, '']));
      setAtributos(base);
      setSku(skuVariante(producto.sku, {}, skusUsados));
      setNombre(nombreVariante(producto.name, {}));
      setSkuTocado(false);
      setNombreTocado(false);
      setPrecio(resumen?.precio ?? null);
      setComparacion(null);
      setCosto(resumen?.costo ?? null);
      setCodigo('');
      setStock(sucursales.map((s) => ({ branch_id: s.branch_id, nombre: s.nombre, qty: null, qty_actual: 0, min_level: null })));
    }
    // Solo al abrir: después manda lo que escribe el usuario.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [abierto, variante?.id]);

  const cambiarAtributos = (nuevos: Atributos) => {
    setAtributos(nuevos);
    const conValor = soloConValor(nuevos);
    if (!skuTocado) setSku(skuVariante(producto.sku, conValor, skusUsados));
    if (!nombreTocado) setNombre(nombreVariante(producto.name, conValor));
  };

  const cambiarStock = (branchId: number, parcial: Partial<FilaStockDialogo>) =>
    setStock((filas) => filas.map((f) => (f.branch_id === branchId ? { ...f, ...parcial } : f)));

  const validar = (): ErroresDialogo => {
    const e: ErroresDialogo = {};
    const s = sku.trim().toUpperCase();
    if (!s) e.sku = t('errores.skuRequerido');
    else if (skusUsados.has(s)) e.sku = t('errores.skuRepetido');
    if (!nombre.trim()) e.name = t('errores.nombreRequerido');
    if (precio !== null && precio < 0) e.price = t('errores.precioNegativo');
    if (comparacion !== null && comparacion > 0 && precio !== null && comparacion <= precio) e.compare_price = t('errores.comparacionMenor');
    if (costo !== null && costo < 0) e.cost = t('errores.costoNegativo');
    if (producto.track_stock && nueva && stock.some((f) => (f.qty ?? 0) > 0) && !((costo ?? 0) > 0)) e.stock = t('errores.stockSinCosto');
    if (estadoCodigo === 'invalido' || estadoCodigo === 'duplicado') e.barcode = t('errores.codigo');
    return e;
  };

  const guardar = async () => {
    const e = validar();
    setErrores(e);
    if (Object.keys(e).length > 0) return;
    setGuardando(true);
    try {
      if (codigo.trim()) {
        const problema = await revisar(organizacionId, [codigo], variante ? [variante.id] : []);
        if (problema) {
          toast({ variant: 'destructive', title: problema.titulo, description: problema.mensaje });
          return;
        }
      }
      const entrada: VarianteEntrada = {
        ...(variante ? { id: variante.id } : {}),
        sku: sku.trim(),
        name: nombre.trim(),
        // La variante no hereda el código del padre: vacío = sin código propio.
        barcode: codigo.trim() || null,
        attributes: soloConValor(atributos),
        price: precio,
        compare_price: comparacion !== null && comparacion > 0 ? comparacion : null,
        cost: costo,
        status: variante ? estadoEntrada(variante.status) : 'active',
      };
      if (producto.track_stock) {
        entrada.stock = stock.map((f) => {
          const cambioCantidad = nueva ? (f.qty ?? 0) > 0 : permisos.ajustar && f.qty !== null && f.qty !== f.qty_actual;
          return {
            branch_id: f.branch_id,
            ...(cambioCantidad ? { qty: f.qty ?? 0 } : {}),
            min_level: f.min_level ?? 0,
          };
        });
      }
      await productoService.guardarVariante(organizacionId, producto.id, entrada);
      toast({ title: nueva ? t('toasts.creada') : t('toasts.actualizada'), description: entrada.name });
      onAbiertoChange(false);
      onGuardada();
    } catch (err) {
      const msg = mensajeError(err);
      if (err instanceof ErrorProducto && (err.codigo === 'sku_duplicado' || err.codigo === 'sku_requerido')) {
        setErrores((prev) => ({ ...prev, sku: msg }));
      } else if (err instanceof ErrorProducto && (err.codigo === 'stock_sin_costo' || err.codigo === 'cantidad_negativa')) {
        setErrores((prev) => ({ ...prev, stock: msg }));
      }
      toast({ variant: 'destructive', title: t('toasts.error'), description: msg });
    } finally {
      setGuardando(false);
    }
  };

  const guardarValorCatalogo = async (tipo: string, valor: string) => {
    try {
      await catalogo.guardarValor(tipo, valor);
      await catalogo.recargar();
      toast({ title: t('toasts.valorGuardado'), description: t('toasts.valorGuardadoDetalle', { valor: valor.trim(), tipo }) });
    } catch (err) {
      toast({ variant: 'destructive', title: t('toasts.errorCatalogo'), description: mensajeError(err) });
      throw err;
    }
  };
  const crearTipoCatalogo = async (nombreTipo: string) => {
    try {
      await catalogo.guardarTipo(nombreTipo);
      await catalogo.recargar();
    } catch (err) {
      toast({ variant: 'destructive', title: t('toasts.errorCatalogo'), description: mensajeError(err) });
      throw err;
    }
  };

  const margen = calcularMargen(precio, costo);
  const puedeAjustar = permisos.ajustar;

  return (
    <PanelAdaptable
      abierto={abierto}
      onAbiertoChange={onAbiertoChange}
      titulo={nueva ? t('tituloCrear') : t('tituloEditar')}
      descripcion={nueva ? t('descripcionCrear') : t('descripcionEditar')}
      icono={GitBranch}
      ancho={560}
      ocupado={guardando}
      pie={
        <>
          <Button type="button" variant="outline" onClick={() => onAbiertoChange(false)} disabled={guardando}>
            {tc('cancelar')}
          </Button>
          <Button type="button" onClick={() => void guardar()} disabled={guardando}>
            {guardando ? <Loader2 aria-hidden="true" className="mr-2 size-4 animate-spin" /> : <Save aria-hidden="true" className="mr-2 size-4" />}
            {guardando ? tc('guardando') : nueva ? t('crear') : tc('guardarCambios')}
          </Button>
        </>
      }
    >
      <FormField etiqueta={t('sku')} error={errores.sku} obligatorio ayuda={nueva && !skuTocado ? t('skuSugerido') : undefined}>
        <Input
            value={sku}
            onChange={(e) => {
              setSku(e.target.value);
              setSkuTocado(true);
            }}
            placeholder={t('skuPlaceholder')}
            autoComplete="off"
            className="h-10 font-mono"
          />
      </FormField>

      <FormField etiqueta={t('nombre')} error={errores.name} obligatorio>
        <Input
            value={nombre}
            onChange={(e) => {
              setNombre(e.target.value);
              setNombreTocado(true);
            }}
            placeholder={t('nombrePlaceholder')}
            className="h-10"
          />
      </FormField>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <FormField etiqueta={t('precio')} error={errores.price}>
          <CampoNumero valor={precio} onValorChange={setPrecio} prefijo={moneda.simbolo} decimales={moneda.decimales} minimo={0} />
        </FormField>
        <FormField etiqueta={t('comparacion')} error={errores.compare_price} ayuda={t('comparacionAyuda')}>
          <CampoNumero valor={comparacion} onValorChange={setComparacion} prefijo={moneda.simbolo} decimales={moneda.decimales} minimo={0} />
        </FormField>
        <FormField
          etiqueta={t('costo')}
          error={errores.cost}
          ayuda={margen !== null ? t('margen', { margen: margen.toLocaleString(localeIntl, { maximumFractionDigits: 1 }) }) : undefined}
        >
          <CampoNumero valor={costo} onValorChange={setCosto} prefijo={moneda.simbolo} decimales={moneda.decimales} minimo={0} />
        </FormField>
      </div>

      <section className="flex flex-col gap-2" aria-labelledby="dv-atributos">
        <h3 id="dv-atributos" className="text-sm font-medium text-fg">
          {t('atributos')}
        </h3>
        <EditorAtributos
          idBase="dv"
          atributos={atributos}
          onChange={cambiarAtributos}
          tipos={catalogo.tipos}
          onGuardarValor={guardarValorCatalogo}
          onCrearTipo={crearTipoCatalogo}
          deshabilitado={guardando}
        />
      </section>

      <section className="flex flex-col gap-2" aria-labelledby="dv-stock">
        <h3 id="dv-stock" className="text-sm font-medium text-fg">
          {t('stockSucursal')}
        </h3>
        {!producto.track_stock ? (
          <p className="text-sm text-fg-muted">{t('sinSeguimiento')}</p>
        ) : sucursales.length === 0 ? (
          <p className="text-sm text-fg-muted">{t('sinSucursales')}</p>
        ) : (
          <>
            <p className="text-xs text-fg-muted">
              {nueva ? t('stockAyudaNueva') : puedeAjustar ? t('stockAyudaAjuste') : t('stockAyudaSinPermiso')}
            </p>
            <div className="flex flex-col divide-y divide-line rounded-lg border border-line">
              <div className="hidden grid-cols-[1fr_112px_96px] gap-3 px-3 py-2 text-xs font-medium text-fg-secondary sm:grid">
                <span>{t('sucursal')}</span>
                <span className="text-right">{nueva ? t('cantidadInicial') : t('cantidad')}</span>
                <span className="text-right">{t('minimo')}</span>
              </div>
              {stock.map((f) => {
                const delta = !nueva && f.qty !== null ? f.qty - f.qty_actual : 0;
                return (
                  <div key={f.branch_id} className="grid grid-cols-2 items-center gap-x-3 gap-y-2 px-3 py-2 sm:grid-cols-[1fr_112px_96px]">
                    <span className="col-span-2 min-w-0 truncate text-sm text-fg sm:col-span-1">
                      {f.nombre}
                      {delta !== 0 && (
                        <span className={delta > 0 ? 'ml-2 text-xs text-success-text' : 'ml-2 text-xs text-danger-text'}>
                          {t('ajusteDelta', { delta: `${delta > 0 ? '+' : '−'}${formatoEntero(Math.abs(delta))}` })}
                        </span>
                      )}
                    </span>
                    <CampoNumero
                      aria-label={t('cantidadDe', { sucursal: f.nombre })}
                      valor={f.qty}
                      onValorChange={(v) => cambiarStock(f.branch_id, { qty: v })}
                      decimales={3}
                      minimo={0}
                      placeholder="0"
                      disabled={guardando || (!nueva && !puedeAjustar)}
                      title={!nueva && !puedeAjustar ? tc('sinPermiso') : undefined}
                      tamano="sm"
                    />
                    <CampoNumero
                      aria-label={t('minimoDe', { sucursal: f.nombre })}
                      valor={f.min_level}
                      onValorChange={(v) => cambiarStock(f.branch_id, { min_level: v })}
                      decimales={3}
                      minimo={0}
                      placeholder="0"
                      disabled={guardando}
                      tamano="sm"
                    />
                  </div>
                );
              })}
            </div>
            {errores.stock && (
              <p role="alert" className="text-xs text-danger-text">
                {errores.stock}
              </p>
            )}
          </>
        )}
      </section>

      <CampoCodigoBarras
        id="dv-codigo"
        value={codigo}
        onChange={setCodigo}
        onEstadoChange={setEstadoCodigo}
        excluirIds={variante ? [variante.id] : []}
        variante
        etiqueta={t('codigo')}
        disabled={guardando}
      />
      {errores.barcode && (
        <p role="alert" className="-mt-2 text-xs text-danger-text">
          {errores.barcode}
        </p>
      )}
    </PanelAdaptable>
  );
}

function estadoEntrada(estado: string): NonNullable<VarianteEntrada['status']> {
  return estado === 'inactive' || estado === 'discontinued' || estado === 'deleted' ? estado : 'active';
}
