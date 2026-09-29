'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowLeftRight, CircleAlert, Info, Package, Scale } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ErrorConversion, unitConversionService } from '@/lib/services/unitConversionService';
import { CampoNumero } from '../CampoNumero';
import { Dialogo } from '../Dialogo';
import { FormField } from '../FormField';
import { SegmentedControl } from '../SegmentedControl';
import { SelectorEntidad } from '../SelectorEntidad';
import { unidadLimpia, type UnidadReceta } from './recetaLogica';

/** Producto al que se limita una conversión («Solo este producto»). */
export interface ProductoConversion {
  id: number;
  nombre: string;
  sku?: string | null;
}

/** Conversión existente que se edita (solo cambia el factor). */
export interface ConversionEditable {
  id: number;
  de: string;
  a: string;
  factor: number;
  producto?: ProductoConversion | null;
  inversaId?: number | null;
}

/**
 * «Nueva conversión» (Figma `DialogoConversion` 959-168518 y, en la pantalla de
 * Unidades, `595:345330` / error `595:345423`): de → a con su factor, la
 * inversa opcional y la vista previa «1 PAQ = 6 UN · 1 UN = 0,1667 PAQ».
 * Guarda con `fn_conversion_guardar` (una transacción, permiso de catálogo en
 * el servidor, la inversa incluida).
 *
 * Contrato de siempre (receta y costo de recetas): `de`/`a` fijos desde una
 * fila sin conversión, para toda la organización y con el mismo tipo de unidad.
 *
 * Ampliaciones opcionales (B6a):
 * - `libre`: «De» y «A» se eligen (con ⇆ para intercambiarlas).
 * - `producto`: ofrece «Solo este producto» (por defecto) o «Toda la
 *   organización»; una conversión de UN producto puede pasar entre tipos
 *   (1 BUL de arroz = 25 KG).
 * - `buscarProducto`: «Aplica a · Un producto» con el buscador del kit.
 * - `conversion`: editar el factor de una existente (y el de su inversa).
 */
export interface DialogoConversionProps {
  abierto: boolean;
  onAbiertoChange: (abierto: boolean) => void;
  organizacionId: number;
  de: string;
  a: string;
  unidades: readonly UnidadReceta[];
  /** Nombre del ingrediente para el subtítulo. */
  ingrediente?: string;
  onCreada: () => void;
  libre?: boolean;
  producto?: ProductoConversion | null;
  buscarProducto?: (texto: string, senal: AbortSignal) => Promise<readonly ProductoConversion[]>;
  conversion?: ConversionEditable | null;
  /** Alcance con el que abre en modo libre («Definir por producto…» abre en «Un producto»). */
  alcanceInicial?: 'organizacion' | 'producto';
}

type Alcance = 'organizacion' | 'producto';

const formato = (n: number) => String(Math.round(n * 10000) / 10000);

export function DialogoConversion({
  abierto,
  onAbiertoChange,
  organizacionId,
  de,
  a,
  unidades,
  ingrediente,
  onCreada,
  libre = false,
  producto: productoInicial = null,
  buscarProducto,
  conversion = null,
  alcanceInicial = 'organizacion',
}: DialogoConversionProps) {
  const t = useTranslations('receta.conversion');
  const tu = useTranslations('inventarioUnidades.dialogoConversion');
  const [unidadDe, setUnidadDe] = useState(unidadLimpia(de));
  const [unidadA, setUnidadA] = useState(unidadLimpia(a));
  const [factor, setFactor] = useState<number | null>(null);
  const [inversa, setInversa] = useState(true);
  const [alcance, setAlcance] = useState<Alcance>('organizacion');
  const [producto, setProducto] = useState<ProductoConversion | null>(productoInicial);
  const [guardando, setGuardando] = useState(false);
  const [errorServidor, setErrorServidor] = useState<string | null>(null);

  const ofreceProducto = !conversion && (!!productoInicial || !!buscarProducto);

  useEffect(() => {
    if (!abierto) return;
    setUnidadDe(unidadLimpia(conversion?.de ?? de));
    setUnidadA(unidadLimpia(conversion?.a ?? a));
    setFactor(conversion ? conversion.factor : null);
    setInversa(conversion ? !!conversion.inversaId : true);
    setProducto(conversion?.producto ?? productoInicial);
    setAlcance(conversion?.producto || productoInicial || alcanceInicial === 'producto' ? 'producto' : 'organizacion');
    setErrorServidor(null);
  }, [abierto, de, a, conversion, productoInicial, alcanceInicial]);

  const tipoDe = unidades.find((u) => unidadLimpia(u.code) === unidadDe)?.unit_type ?? null;
  const tipoA = unidades.find((u) => unidadLimpia(u.code) === unidadA)?.unit_type ?? null;
  const esDeProducto = alcance === 'producto';
  const tiposDistintos = !esDeProducto && !!tipoDe && !!tipoA && tipoDe !== tipoA;
  const factorValido = factor !== null && factor > 0;
  const unidadesValidas = !!unidadDe && !!unidadA && unidadDe !== unidadA;
  const faltaProducto = esDeProducto && !producto;
  const puedeGuardar = factorValido && unidadesValidas && !tiposDistintos && !faltaProducto && !guardando;

  const opcionesUnidad = useMemo(
    () =>
      unidades.map((u) => ({
        codigo: unidadLimpia(u.code),
        texto: `${unidadLimpia(u.code)} · ${u.name}${u.unit_type ? ` (${tu(`tipos.${u.unit_type}`)})` : ''}`,
      })),
    [unidades, tu],
  );

  const mensajeError = useCallback(
    (e: unknown) => {
      if (e instanceof ErrorConversion) {
        const conocidos = ['conversion_repetida', 'tipos_distintos', 'sin_permiso', 'misma_unidad', 'factor_invalido', 'producto_ajeno', 'conversion_del_sistema'];
        if (conocidos.includes(e.codigo)) return tu(`errores.${e.codigo}`);
        if (e.sqlstate === '42501') return tu('errores.sin_permiso');
      }
      return t('error', { detalle: e instanceof Error ? e.message : String(e) });
    },
    [t, tu],
  );

  const guardar = async () => {
    if (!puedeGuardar || factor === null) return;
    setGuardando(true);
    setErrorServidor(null);
    try {
      await unitConversionService.guardar(conversion?.id ?? null, {
        from_unit_code: unidadDe,
        to_unit_code: unidadA,
        factor,
        organization_id: organizacionId,
        product_id: esDeProducto ? (producto?.id ?? null) : null,
        inversa,
      });
      onCreada();
      onAbiertoChange(false);
    } catch (e) {
      setErrorServidor(mensajeError(e));
    } finally {
      setGuardando(false);
    }
  };

  const titulo = conversion ? tu('tituloEditar', { de: unidadDe, a: unidadA }) : t('titulo');
  const descripcion = ingrediente
    ? t('descripcion', { ingrediente, unidad: unidadA })
    : libre || conversion
      ? tu('descripcion')
      : undefined;

  const selectorUnidad = (valor: string, onCambio: (v: string) => void, etiqueta: string) => (
    <FormField etiqueta={etiqueta}>
      {(c) => (
        <Select value={valor || undefined} onValueChange={onCambio}>
          <SelectTrigger id={c.id} aria-labelledby={c.idEtiqueta} className="h-10">
            <SelectValue placeholder={tu('elegirUnidad')} />
          </SelectTrigger>
          <SelectContent>
            {opcionesUnidad.map((o) => (
              <SelectItem key={o.codigo} value={o.codigo}>
                {o.texto}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
    </FormField>
  );

  return (
    <Dialogo
      abierto={abierto}
      onAbiertoChange={onAbiertoChange}
      titulo={titulo}
      descripcion={descripcion}
      icono={libre || conversion ? Scale : undefined}
      ancho={libre ? 560 : 440}
      primario={{
        etiqueta: conversion ? tu('guardarCambios') : libre ? tu('crear') : t('guardar'),
        onClick: () => void guardar(),
        cargando: guardando,
        deshabilitada: !puedeGuardar,
        motivo: faltaProducto ? tu('eligeProducto') : undefined,
      }}
    >
      <div className="flex flex-col gap-4">
        {libre && !conversion ? (
          <>
            <div className="grid grid-cols-1 items-end gap-2 sm:grid-cols-[1fr_auto_1fr]">
              {selectorUnidad(unidadDe, setUnidadDe, t('de'))}
              <button
                type="button"
                onClick={() => {
                  setUnidadDe(unidadA);
                  setUnidadA(unidadDe);
                }}
                aria-label={tu('intercambiar')}
                className="mx-auto flex size-10 items-center justify-center rounded-lg text-fg-secondary hover:bg-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
              >
                <ArrowLeftRight aria-hidden className="size-4" strokeWidth={1.5} />
              </button>
              {selectorUnidad(unidadA, setUnidadA, tu('a'))}
            </div>
            <FormField etiqueta={tu('equivale', { unidad: unidadDe || '…' })} error={factor !== null && !factorValido ? t('factorInvalido') : null}>
              <CampoNumero valor={factor} onValorChange={setFactor} decimales={6} minimo={0} sufijo={unidadA || undefined} className="sm:max-w-[220px]" />
            </FormField>
          </>
        ) : (
          <div className="grid grid-cols-[1fr_auto_1fr] items-end gap-2">
            <FormField etiqueta={t('de')}>
              <p className="flex h-10 items-center rounded-lg border border-line bg-subtle px-3 text-sm text-fg">1 {unidadDe}</p>
            </FormField>
            <span className="pb-2.5 text-sm text-fg-muted">=</span>
            <FormField etiqueta={t('factor', { unidad: unidadA })} error={factor !== null && !factorValido ? t('factorInvalido') : null}>
              <CampoNumero valor={factor} onValorChange={setFactor} decimales={6} minimo={0} sufijo={unidadA} autoFocus />
            </FormField>
          </div>
        )}

        {ofreceProducto && (
          <FormField etiqueta={tu('aplicaA')}>
            {(c) => (
              <SegmentedControl<Alcance>
                aria-labelledby={c.idEtiqueta}
                valor={alcance}
                onValorChange={setAlcance}
                opciones={[
                  { valor: 'organizacion', etiqueta: tu('toda') },
                  { valor: 'producto', etiqueta: productoInicial && !buscarProducto ? tu('soloEste') : tu('unProducto') },
                ]}
              />
            )}
          </FormField>
        )}
        {conversion?.producto && <p className="text-sm text-fg-secondary">{tu('soloDe', { producto: conversion.producto.nombre })}</p>}

        {esDeProducto && buscarProducto && !conversion && (
          <SelectorEntidad<ProductoConversion>
            layout="campo"
            valor={producto}
            icono={Package}
            etiqueta={tu('producto')}
            buscar={(texto, senal) => buscarProducto(texto, senal)}
            aOpcion={(p) => ({ id: String(p.id), titulo: p.nombre, subtitulo: p.sku ?? null })}
            onCambiar={setProducto}
            onQuitar={() => setProducto(null)}
            textos={{
              placeholder: tu('buscarProducto'),
              buscar: tu('buscarProducto'),
              vacio: tu('productoVacio'),
              sinResultados: tu('productoSinResultados'),
              error: tu('productoError'),
            }}
          />
        )}

        <label className="flex cursor-pointer items-center gap-2 text-sm text-fg">
          <Checkbox checked={inversa} onCheckedChange={(v) => setInversa(v === true)} className="size-[18px] rounded" />
          {factorValido && unidadesValidas
            ? t('inversaCon', { vista: `1 ${unidadA} = ${formato(1 / (factor as number))} ${unidadDe}` })
            : t('inversa')}
        </label>

        {tiposDistintos ? (
          <p role="alert" className="flex items-start gap-2 rounded-lg bg-danger-subtle p-3 text-xs text-danger-text">
            <CircleAlert aria-hidden className="mt-0.5 size-3.5 shrink-0" strokeWidth={1.5} />
            {libre || ofreceProducto ? tu('tiposDistintos', { de: unidadDe, a: unidadA }) : t('tiposDistintos', { de: unidadDe, a: unidadA })}
          </p>
        ) : factorValido && unidadesValidas ? (
          <p className="flex items-start gap-2 rounded-lg bg-info-subtle p-3 text-xs text-info-text">
            <Info aria-hidden className="mt-0.5 size-3.5 shrink-0" strokeWidth={1.5} />
            <span>
              {t('vistaPrevia', {
                ida: `1 ${unidadDe} = ${formato(factor as number)} ${unidadA}`,
                vuelta: `1 ${unidadA} = ${formato(1 / (factor as number))} ${unidadDe}`,
              })}
              {(libre || conversion) && ` ${tu('ejemplo', { de: unidadDe, a: unidadA, total: formato((factor as number) * 2) })}`}
            </span>
          </p>
        ) : null}
        {!ofreceProducto && !conversion && <p className="text-xs text-fg-muted">{libre ? tu('alcanceOrganizacion') : t('alcanceOrganizacion')}</p>}
        {errorServidor && (
          <p role="alert" className="text-xs text-danger-text">
            {errorServidor}
          </p>
        )}
      </div>
    </Dialogo>
  );
}
