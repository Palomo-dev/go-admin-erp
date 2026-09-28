'use client';

import { useCallback, useMemo, useRef, useState, type ReactNode } from 'react';
import { ChefHat, Plus } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { recipeService, type IngredienteOpcion } from '@/lib/services/recipeService';
import { cn } from '@/utils/Utils';
import { CampoNumero } from '../CampoNumero';
import { FormField } from '../FormField';
import { SelectorEntidad } from '../SelectorEntidad';
import { useEsEscritorio } from '../useEsEscritorio';
import { localeIntl } from '../idioma';
import { DialogoConversion } from './DialogoConversion';
import { FilaIngrediente } from './FilaIngrediente';
import {
  duplicados,
  fusionarDuplicado,
  ingredienteDesdeOpcion,
  lineaDeFila,
  unidadLimpia,
  validarReceta,
  type IngredienteBorrador,
  type RecetaBorrador,
  type UnidadReceta,
} from './recetaLogica';
import { ResumenCostoReceta } from './ResumenCostoReceta';
import { useCostoReceta } from './useCostoReceta';

/**
 * Editor de receta (Figma `EditorReceta` 957-584183): rinde y su unidad,
 * nombre, ingredientes (`FilaIngrediente`), agregar o crear ingrediente y el
 * costo en vivo (`ResumenCostoReceta`, calculado por el servidor). Es el mismo
 * en el formulario de producto («Avanzado › Receta») y, más adelante, en el
 * detalle y en la pantalla Recetas. Estados: vacío · con ingredientes · con
 * errores · solo lectura. Layout: filas en escritorio, tarjetas en móvil.
 */
export interface EditorRecetaProps {
  valor: RecetaBorrador;
  onCambio: (b: RecetaBorrador) => void;
  organizacionId: number;
  sucursal: { id: number | null; nombre: string | null };
  unidades: readonly UnidadReceta[];
  /** El producto y sus variantes: no pueden ser ingredientes de sí mismos. */
  excluirIds?: readonly number[];
  /** Precio de venta para el margen. */
  precioVenta?: number | null;
  formatearMoneda: (n: number) => string;
  /** «Ingredientes de «Doble»» cuando es la receta de una variante. */
  tituloIngredientes?: string;
  /** Alta rápida: abre el formulario de producto y llama a `agregar` con lo creado. */
  onCrearIngrediente?: (texto: string, agregar: (opcion: IngredienteOpcion) => void) => void;
  /** Contenido a la derecha del costo («Cómo se guarda»). */
  lateral?: ReactNode;
  soloLectura?: boolean;
  idBase: string;
}

const SIN_EXCLUIR: readonly number[] = [];

export function EditorReceta({
  valor,
  onCambio,
  organizacionId,
  sucursal,
  unidades,
  excluirIds = SIN_EXCLUIR,
  precioVenta,
  formatearMoneda,
  tituloIngredientes,
  onCrearIngrediente,
  lateral,
  soloLectura,
  idBase,
}: EditorRecetaProps) {
  const t = useTranslations('receta.editor');
  const te = useTranslations('receta.errores');
  const locale = useLocale();
  const esEscritorio = useEsEscritorio();
  const { costo, cargando, error, recalcular } = useCostoReceta(organizacionId, sucursal.id, valor);
  const [conversion, setConversion] = useState<{ de: string; a: string; ingrediente: string } | null>(null);
  const arrastrando = useRef<string | null>(null);

  const formatearCantidad = useCallback(
    (n: number) => new Intl.NumberFormat(localeIntl(locale), { maximumFractionDigits: 3 }).format(n),
    [locale],
  );

  const validacion = useMemo(() => validarReceta(valor, { excluirIds }), [valor, excluirIds]);
  const repetidos = useMemo(() => duplicados(valor), [valor]);
  const permitido = costo?.permitido !== false;

  const cambiarFila = (clave: string, nueva: IngredienteBorrador) =>
    onCambio({ ...valor, ingredientes: valor.ingredientes.map((i) => (i.clave === clave ? nueva : i)) });

  const quitar = (clave: string) => onCambio({ ...valor, ingredientes: valor.ingredientes.filter((i) => i.clave !== clave) });

  const mover = (desde: number, hasta: number) => {
    if (hasta < 0 || hasta >= valor.ingredientes.length || desde === hasta) return;
    const lista = [...valor.ingredientes];
    const [fila] = lista.splice(desde, 1);
    lista.splice(hasta, 0, fila);
    onCambio({ ...valor, ingredientes: lista });
  };

  const agregar = useCallback(
    (op: IngredienteOpcion) => onCambio({ ...valor, ingredientes: [...valor.ingredientes, ingredienteDesdeOpcion(op)] }),
    [onCambio, valor],
  );

  const buscar = useCallback(
    (texto: string, senal: AbortSignal) => recipeService.buscarIngredientes(organizacionId, texto, excluirIds, senal),
    [organizacionId, excluirIds],
  );

  const opcionesRinde = useMemo(() => {
    const u = unidadLimpia(valor.unidadRinde);
    const lista = unidades.map((x) => ({ code: unidadLimpia(x.code), name: x.name }));
    return lista.some((x) => x.code === u) || !u ? lista : [...lista, { code: u, name: u }];
  }, [unidades, valor.unidadRinde]);

  const tanda = permitido && costo?.costo_tanda !== null && costo?.costo_tanda !== undefined ? formatearMoneda(costo.costo_tanda) : null;

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-[140px_200px_minmax(0,1fr)]">
        <FormField
          etiqueta={t('rinde')}
          id={`${idBase}-rinde`}
          error={validacion.general === 'rinde_invalido' ? te('rinde_invalido') : null}
        >
          <CampoNumero valor={valor.rinde} onValorChange={(v) => onCambio({ ...valor, rinde: v })} decimales={3} minimo={0} disabled={soloLectura} />
        </FormField>
        <FormField etiqueta={t('unidadRinde')} id={`${idBase}-unidad-rinde`}>
          {(campo) => (
            <Select value={unidadLimpia(valor.unidadRinde)} onValueChange={(v) => onCambio({ ...valor, unidadRinde: v })} disabled={soloLectura}>
              <SelectTrigger id={campo.id} aria-labelledby={campo.idEtiqueta} className="h-10">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {opcionesRinde.map((u) => (
                  <SelectItem key={u.code} value={u.code}>
                    {u.code} · {u.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </FormField>
        <FormField etiqueta={t('nombre')} id={`${idBase}-nombre`}>
          <Input
            value={valor.nombre}
            onChange={(e) => onCambio({ ...valor, nombre: e.target.value })}
            placeholder={t('nombrePlaceholder')}
            maxLength={120}
            disabled={soloLectura}
          />
        </FormField>
      </div>

      <div className="flex items-baseline justify-between gap-3">
        <h4 className="text-sm font-semibold text-fg">
          {tituloIngredientes ?? t('ingredientes', { count: valor.ingredientes.length })}
        </h4>
        <span className="text-xs tabular-nums text-fg-secondary" aria-live="polite">
          {tanda ? t('tanda', { costo: tanda }) : valor.ingredientes.length === 0 ? t('sinCosto') : ''}
        </span>
      </div>

      {valor.ingredientes.length === 0 ? (
        <div className="flex flex-col items-center gap-1 rounded-xl border border-dashed border-line-strong px-4 py-6 text-center">
          <ChefHat aria-hidden className="size-6 text-fg-muted" strokeWidth={1.5} />
          <p className="text-sm font-medium text-fg">{t('vacioTitulo')}</p>
          <p className="max-w-sm text-xs text-fg-muted">{t('vacioDescripcion')}</p>
          {validacion.general === 'sin_ingredientes' && <span className="sr-only">{te('sin_ingredientes')}</span>}
        </div>
      ) : (
        <div className="flex flex-col">
          {esEscritorio && (
            <div
              aria-hidden
              className="grid grid-cols-[24px_minmax(0,1fr)_88px_104px_84px_104px_auto_32px] gap-2 px-1 pb-1 text-[11px] font-medium text-fg-muted"
            >
              <span />
              <span>{t('colIngrediente')}</span>
              <span className="text-right">{t('colCantidad')}</span>
              <span>{t('colUnidad')}</span>
              <span>{t('colMerma')}</span>
              <span className="text-right">{t('colCosto')}</span>
              <span className="w-[92px]" />
              <span />
            </div>
          )}
          <ul className={cn('flex flex-col', !esEscritorio && 'gap-2', esEscritorio && 'border-t border-line')}>
            {valor.ingredientes.map((ing, indice) => (
              <FilaIngrediente
                key={ing.clave}
                idBase={`${idBase}-${ing.clave}`}
                ingrediente={ing}
                linea={lineaDeFila(costo?.lineas, indice)}
                error={validacion.lineas[ing.clave] ?? (repetidos.has(ing.clave) ? 'repetido' : undefined)}
                unidades={unidades}
                sucursalNombre={sucursal.nombre}
                permitidoCostos={permitido}
                formatearMoneda={formatearMoneda}
                formatearCantidad={formatearCantidad}
                layout={esEscritorio ? 'fila' : 'tarjeta'}
                soloLectura={soloLectura}
                onCambio={(n) => cambiarFila(ing.clave, n)}
                onQuitar={() => quitar(ing.clave)}
                onFusionar={() => onCambio(fusionarDuplicado(valor, ing.clave))}
                onCrearConversion={(de, a) => setConversion({ de, a, ingrediente: ing.nombre })}
                onMover={(delta) => mover(indice, indice + delta)}
                arrastre={{
                  onDragStart: (e) => {
                    arrastrando.current = ing.clave;
                    e.dataTransfer.effectAllowed = 'move';
                  },
                  onDragOver: (e) => {
                    if (arrastrando.current) e.preventDefault();
                  },
                  onDrop: (e) => {
                    e.preventDefault();
                    const desde = valor.ingredientes.findIndex((x) => x.clave === arrastrando.current);
                    arrastrando.current = null;
                    if (desde >= 0) mover(desde, indice);
                  },
                  onDragEnd: () => {
                    arrastrando.current = null;
                  },
                }}
              />
            ))}
          </ul>
        </div>
      )}

      {!soloLectura && (
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <SelectorEntidad<IngredienteOpcion>
            layout="campo"
            valor={null}
            etiqueta={t('agregar')}
            icono={Plus}
            aOpcion={(o) => ({
              id: String(o.id),
              titulo: o.nombre,
              subtitulo: [o.sku, t('seLlevaEn', { unidad: o.unidad })].filter(Boolean).join(' · '),
            })}
            buscar={buscar}
            onCambiar={agregar}
            onCrear={onCrearIngrediente ? (texto) => onCrearIngrediente(texto, agregar) : undefined}
            textos={{
              placeholder: t('agregar'),
              buscar: t('buscar'),
              titulo: t('agregar'),
              vacio: t('buscarVacio'),
              sinResultados: t('sinResultados'),
              crear: (texto) => t('crearCon', { texto }),
            }}
            className="sm:w-72"
          />
          {onCrearIngrediente && (
            <button
              type="button"
              onClick={() => onCrearIngrediente('', agregar)}
              className="inline-flex h-10 items-center justify-center gap-2 rounded-lg px-3 text-sm font-medium text-fg hover:bg-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
            >
              {t('crearIngrediente')}
            </button>
          )}
        </div>
      )}

      <div className={cn('grid gap-4', lateral && 'lg:grid-cols-[minmax(0,320px)_minmax(0,1fr)]')}>
        <ResumenCostoReceta
          costo={costo}
          cargando={cargando}
          error={error}
          sucursalNombre={sucursal.nombre}
          unidadRinde={unidadLimpia(valor.unidadRinde)}
          precioVenta={precioVenta}
          formatearMoneda={formatearMoneda}
          formatearCantidad={formatearCantidad}
        />
        {lateral}
      </div>

      {conversion && (
        <DialogoConversion
          abierto
          onAbiertoChange={(a) => !a && setConversion(null)}
          organizacionId={organizacionId}
          de={conversion.de}
          a={conversion.a}
          ingrediente={conversion.ingrediente}
          unidades={unidades}
          onCreada={recalcular}
        />
      )}
    </div>
  );
}
