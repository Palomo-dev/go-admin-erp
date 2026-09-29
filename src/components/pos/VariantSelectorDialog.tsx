'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { useMonedaOrganizacion } from '@/lib/hooks/useOrgCurrency';
import { POSService } from '@/lib/services/posService';
import { ProductModifiersService, type ProductModifierGroup } from '@/lib/services/productModifiersService';
import { SelectorVariantes, type GrupoSelector, type StockVarianteSelector } from '@/components/kit/SelectorVariantes';
import { MarcadorSinFoto } from '@/components/kit/ProductCard';
import { acotarCantidad, etiquetaResumenVariante } from '@/components/kit/selectorVariantesLogica';
import { CachedProductImage } from './CachedProductImage';
import { getOrganizationId } from '@/lib/hooks/useOrganization';
import { variantesService } from '@/components/inventario/variantes/variantesService';
import type { CatalogoOrden } from '@/components/inventario/variantes/logicaVariantes';
import {
  agruparAtributos,
  alternarModificador,
  bloqueoVariante,
  estadoAtributos,
  extraDeModificadores,
  faltanteModificadores,
  modificadoresElegidos,
  reglaDeSeleccion,
  varianteAlElegirValor,
  varianteInicial,
  type SeleccionModificadores,
} from '@/lib/pos/venta/modificadores';

/**
 * Selector de variante y modificadores del POS (Figma `VariantModifierDialog`
 * 155:7980; frames `158:27344` escritorio, `159:31608` hoja móvil, `198:14706`
 * validación y `198:14715` lista sin atributos). Carga las variantes (con su
 * precio vigente y, si llega `sucursal`, su stock en la sucursal que vende) y
 * los modificadores, aplica las reglas de `src/lib/pos/venta/modificadores.ts`
 * y dibuja con `SelectorVariantes` del kit.
 *
 * El contrato de siempre se conserva (`onSelectVariant(variante, modificadores)`)
 * para mesas, PMS, envíos y «Agregar productos»; lo nuevo es opcional:
 * `sucursal` (stock y agotado por variante), `conCantidad` + `cantidadInicial`
 * (`− n +`; la cantidad llega como tercer argumento) y `varianteInicialId`
 * (el escáner leyó una variante concreta de un producto con modificadores).
 */

interface Variant {
  id: number;
  sku: string;
  name: string;
  price: number | null;
  variant_data: Record<string, string>;
  image?: string | null;
  track_stock?: boolean;
  stock_quantity?: number;
  is_out_of_stock?: boolean;
}

export interface SelectedModifier {
  groupId: number;
  groupName: string;
  modifierId: number;
  name: string;
  extraPrice: number;
}

interface VariantSelectorDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  product: {
    id: number;
    name: string;
    sku: string;
    price?: number | null;
    image?: string | null;
    track_stock?: boolean;
    stock_quantity?: number;
    is_out_of_stock?: boolean;
  };
  onSelectVariant: (variant: Variant, modifiers: SelectedModifier[], cantidad: number) => void;
  /**
   * Sucursal que vende (el filtro de la grilla: número = sucursal, `null` =
   * todas). Con ella cada variante muestra su stock y se marca agotada con la
   * regla de la tarjeta. `nombre` alimenta «4 disponibles en {sucursal}».
   */
  sucursal?: { filtro: number | null; nombre?: string | null };
  /** Muestra `− n +` en el pie (el POS); sin él se agrega una unidad. */
  conCantidad?: boolean;
  cantidadInicial?: number;
  /** Variante que se abre elegida (código de barras de una variante). */
  varianteInicialId?: number | null;
}

export function VariantSelectorDialog({
  open,
  onOpenChange,
  product,
  onSelectVariant,
  sucursal,
  conCantidad = false,
  cantidadInicial = 1,
  varianteInicialId = null,
}: VariantSelectorDialogProps) {
  const moneda = useMonedaOrganizacion();
  const t = useTranslations('posVenta.variantes');
  const tKit = useTranslations('kit.selectorVariantes');
  const [variants, setVariants] = useState<Variant[]>([]);
  const [cargando, setCargando] = useState(false);
  const [errorCarga, setErrorCarga] = useState(false);
  const [selectedVariant, setSelectedVariant] = useState<Variant | null>(null);
  const [selectedAttributes, setSelectedAttributes] = useState<Record<string, string>>({});
  const [modifierGroups, setModifierGroups] = useState<ProductModifierGroup[]>([]);
  const [selectedModifierIds, setSelectedModifierIds] = useState<SeleccionModificadores>({});
  const [errorGrupo, setErrorGrupo] = useState<{ grupoId: number; mensaje: string } | null>(null);
  const [cantidad, setCantidad] = useState(acotarCantidad(cantidadInicial));
  // Solo la última carga escribe el estado (cambiar de producto con una carga en vuelo).
  const cargaActual = useRef(0);

  const filtroSucursal = sucursal?.filtro;
  const conStock = sucursal !== undefined;

  const cargar = useCallback(async () => {
    const turno = ++cargaActual.current;
    setCargando(true);
    setErrorCarga(false);
    setSelectedModifierIds({});
    setErrorGrupo(null);
    try {
      const [data, groups] = await Promise.all([
        POSService.getProductVariants(product.id, conStock ? { branchFilter: filtroSucursal ?? null } : undefined) as Promise<Variant[]>,
        ProductModifiersService.getGroupsByProduct(product.id).catch((error) => {
          console.error('Error cargando modificadores:', error);
          return [] as ProductModifierGroup[];
        }),
      ]);
      if (turno !== cargaActual.current) return;
      setVariants(data);
      setModifierGroups(groups);
      const inicial = varianteInicial(data, varianteInicialId);
      if (inicial) {
        setSelectedVariant(inicial);
        setSelectedAttributes(inicial.variant_data || {});
      } else {
        // Producto simple sin variantes: se usa a sí mismo como «variante» para
        // elegir solo sus modificadores (salsas, extras). Se preservan todos los
        // campos originales del producto (station, categories, stock…).
        setSelectedVariant({ ...product, variant_data: {} } as Variant);
        setSelectedAttributes({});
      }
    } catch (error) {
      if (turno !== cargaActual.current) return;
      console.error('Error cargando variantes:', error);
      setVariants([]);
      setModifierGroups([]);
      setSelectedVariant(null);
      setErrorCarga(true);
    } finally {
      if (turno === cargaActual.current) setCargando(false);
    }
    // `product` completo entra en la variante sintética; la carga se dispara por id.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [product.id, conStock, filtroSucursal, varianteInicialId]);

  useEffect(() => {
    if (!open || !product?.id) return;
    setCantidad(acotarCantidad(cantidadInicial));
    void cargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, cargar]);

  // Orden del catálogo de variantes (tallas «XS, S, M, L, XL», colores en su orden), no alfabético.
  // Se lee una vez por organización; si falla, se queda el orden alfabético de antes.
  const [catalogo, setCatalogo] = useState<CatalogoOrden | null>(null);
  useEffect(() => {
    if (!open) return;
    const org = getOrganizationId();
    if (!org) return;
    let vivo = true;
    variantesService
      .catalogoOrden(Number(org))
      .then((c) => vivo && setCatalogo(c))
      .catch((error) => console.warn('No se pudo leer el orden del catálogo de variantes:', error));
    return () => {
      vivo = false;
    };
  }, [open]);

  const hayAtributos = useMemo(() => Object.keys(agruparAtributos(variants)).length > 0, [variants]);
  const atributos = useMemo(
    () => (hayAtributos ? estadoAtributos(variants, selectedAttributes, catalogo) : []),
    [hayAtributos, variants, selectedAttributes, catalogo],
  );

  const selectedModifiers: SelectedModifier[] = modificadoresElegidos(modifierGroups, selectedModifierIds);
  const extras = extraDeModificadores(selectedModifiers);
  const bloqueo = cargando || errorCarga ? null : bloqueoVariante(selectedVariant);
  const precioUnitario = selectedVariant?.price ? selectedVariant.price + extras : null;

  const grupos: GrupoSelector[] = modifierGroups.map((g) => {
    const elegidas = selectedModifierIds[g.id] || new Set<number>();
    return {
      id: g.id,
      nombre: g.name,
      regla: reglaDeSeleccion(g),
      obligatorio: !!g.required,
      minimo: g.min_selections,
      opciones: (g.product_modifiers || []).map((m) => ({ id: m.id, nombre: m.name, extra: m.extra_price, elegida: elegidas.has(m.id) })),
    };
  });

  const stockDe = (v: Variant | null): StockVarianteSelector | null => {
    if (!conStock || !v) return null;
    if (v.track_stock !== true) return { tipo: 'sinControl' };
    // `null` = todas las sucursales; `undefined` = sucursal sin nombre conocido.
    const nombre = filtroSucursal === null ? null : sucursal?.nombre ?? undefined;
    if (v.is_out_of_stock) return { tipo: 'agotado', sucursal: nombre };
    return { tipo: 'disponible', cantidad: Number(v.stock_quantity ?? 0), sucursal: nombre };
  };

  const resumen =
    selectedVariant && (variants.length > 0 || conStock)
      ? {
          etiqueta:
            variants.length > 0
              ? etiquetaResumenVariante(Object.values(selectedVariant.variant_data || {}), selectedVariant.sku)
              : tKit('sku', { sku: selectedVariant.sku }),
          precio: selectedVariant.price,
          stock: stockDe(selectedVariant),
        }
      : null;

  const handleAttributeSelect = (nombre: string, valor: string) => {
    const siguiente = varianteAlElegirValor(variants, selectedAttributes, nombre, valor);
    if (!siguiente) return;
    setSelectedVariant(siguiente);
    setSelectedAttributes(siguiente.variant_data || { ...selectedAttributes, [nombre]: valor });
  };

  const toggleModifier = (grupoId: number, modifierId: number) => {
    const group = modifierGroups.find((g) => g.id === grupoId);
    if (!group) return;
    setErrorGrupo(null);
    // Reglas de selección (única/múltiple, obligatoria, máximo): L20.
    setSelectedModifierIds((prev) => alternarModificador(prev, group, modifierId));
  };

  const cerrar = () => {
    cargaActual.current++;
    setSelectedVariant(null);
    setSelectedAttributes({});
    setSelectedModifierIds({});
    setErrorGrupo(null);
    onOpenChange(false);
  };

  const handleConfirm = () => {
    if (!selectedVariant || bloqueoVariante(selectedVariant) !== null) return;
    // Misma regla que validarModificadores (L20), con el texto en el idioma activo.
    const falta = faltanteModificadores(modifierGroups, selectedModifierIds);
    if (falta) {
      const grupo = modifierGroups.find((g) => g.name === falta.grupo);
      setErrorGrupo({
        grupoId: grupo?.id ?? -1,
        mensaje: falta.minimo > 1 ? t('faltanVarias', { n: falta.minimo, grupo: falta.grupo }) : t('faltaUna', { grupo: falta.grupo }),
      });
      return;
    }
    onSelectVariant(selectedVariant, selectedModifiers, conCantidad ? cantidad : 1);
    onOpenChange(false);
  };

  const imagen = selectedVariant?.image ?? product.image ?? null;

  return (
    <SelectorVariantes
      abierto={open}
      onAbiertoChange={(v) => (v ? onOpenChange(true) : cerrar())}
      producto={{
        nombre: product.name,
        imagen: (
          <CachedProductImage
            src={imagen}
            alt=""
            mode="thumb"
            className="size-full object-cover"
            fallback={<MarcadorSinFoto conInicial={false} />}
          />
        ),
      }}
      cargando={cargando}
      errorCarga={errorCarga ? { mensaje: tKit('errorCarga'), onReintentar: () => void cargar() } : null}
      totalVariantes={variants.length}
      atributos={atributos}
      onAtributo={handleAttributeSelect}
      lista={
        !hayAtributos && variants.length > 0
          ? variants.map((v) => ({
              id: v.id,
              nombre: v.name,
              sku: v.sku,
              precio: v.price,
              agotado: conStock && !!v.is_out_of_stock,
              elegida: selectedVariant?.id === v.id,
            }))
          : undefined
      }
      onElegirVariante={(id) => {
        const v = variants.find((x) => x.id === id);
        if (v) setSelectedVariant(v);
      }}
      resumen={resumen}
      grupos={grupos}
      onOpcion={toggleModifier}
      errorGrupo={errorGrupo}
      cantidad={cantidad}
      onCantidad={conCantidad ? setCantidad : undefined}
      precioUnitario={precioUnitario}
      bloqueo={bloqueo}
      onAgregar={handleConfirm}
      moneda={moneda}
    />
  );
}
