'use client';

import { Plus } from 'lucide-react';
import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { Input } from '@/components/ui/input';
import { crearFormateadorMoneda, type ContextoMoneda } from '@/lib/utils/moneda';
import { CampoNumero } from '../CampoNumero';
import { Dialogo } from '../Dialogo';
import { FormField } from '../FormField';
import { formatearTarifa } from '../resumenTotalesLogica';
import { useKitT, useLocaleIntl } from '../useIdiomaKit';
import { ImpuestosLinea } from './ImpuestosLinea';
import { simboloMoneda } from './documentoLineasLogica';
import {
  impuestosElegidos,
  seleccionInicial,
  validarItemManual,
  type ItemManual,
  type OpcionImpuesto,
  type VarianteDocumento,
} from './edicionDocumentoLogica';

/**
 * «Agregar ítem manual» (Figma `Diálogo · Agregar ítem manual` 1042:134761,
 * Documento=Compra `1042:134690` · Venta `1042:134760`): lo que no está en el
 * catálogo (servicios, cargos, fletes). Venta pide precio y la nota sale en el
 * PDF; compra pide costo.
 *
 * Alt+M lo abre (lo registra la pantalla) con el foco en «Descripción»; Tab
 * recorre; Enter en la nota agrega; Esc cierra. La vista previa muestra el
 * total de la línea con la función del dominio que pasa la pantalla
 * (`calcularTotal`): el kit no calcula impuestos.
 */
export interface DialogoItemManualProps {
  abierto: boolean;
  onAbiertoChange: (abierto: boolean) => void;
  variante: VarianteDocumento;
  moneda: ContextoMoneda | string;
  /** Impuestos de la organización (sin retenciones). */
  impuestos: readonly OpcionImpuesto[];
  /** Venta: varios impuestos; compra: uno. */
  impuestosMultiples?: boolean;
  /** El documento decide «incluido» en la cabecera (compra): no se pregunta por línea. */
  sinIncluido?: boolean;
  /** Valor inicial de «Incluido en el precio». */
  incluidoInicial?: boolean;
  /** Total de la línea para la vista previa (servicio del documento). */
  calcularTotal: (item: ItemManual) => number;
  onAgregar: (item: ItemManual) => void;
}

export function DialogoItemManual({
  abierto,
  onAbiertoChange,
  variante,
  moneda,
  impuestos,
  impuestosMultiples = variante === 'venta',
  sinIncluido,
  incluidoInicial = false,
  calcularTotal,
  onAgregar,
}: DialogoItemManualProps) {
  const t = useKitT();
  const locale = useLocaleIntl();
  const formatear = useMemo(() => crearFormateadorMoneda(moneda), [moneda]);
  const decimales = typeof moneda === 'string' ? 2 : moneda.decimals;
  const [descripcion, setDescripcion] = useState('');
  const [cantidad, setCantidad] = useState<number | null>(1);
  const [precio, setPrecio] = useState<number | null>(null);
  const [seleccion, setSeleccion] = useState<{ ids: readonly string[]; incluido: boolean }>({ ids: [], incluido: incluidoInicial });
  const [nota, setNota] = useState('');
  const [intentado, setIntentado] = useState(false);
  const refDescripcion = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!abierto) return;
    setDescripcion('');
    setCantidad(1);
    setPrecio(null);
    setSeleccion({ ids: seleccionInicial(impuestos), incluido: incluidoInicial });
    setNota('');
    setIntentado(false);
    // Primero en «Descripción del ítem» (Radix enfoca la «×» por defecto).
    const id = window.setTimeout(() => refDescripcion.current?.focus(), 0);
    return () => window.clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- solo al abrir
  }, [abierto]);

  const item: ItemManual = {
    descripcion: descripcion.trim(),
    cantidad: cantidad ?? 0,
    precio: precio ?? 0,
    impuestos: [...seleccion.ids],
    incluido: seleccion.incluido,
    nota: nota.trim() || null,
  };
  const errores = validarItemManual({ descripcion, cantidad: cantidad ?? 0, precio: precio ?? -1 });
  const valido = Object.keys(errores).length === 0;
  const textoError = (campo: keyof typeof errores) =>
    intentado && errores[campo] ? t(`documentoEdicion.manual.errores.${errores[campo]}` as never) : null;

  const agregar = () => {
    setIntentado(true);
    if (!valido) return;
    onAgregar(item);
    onAbiertoChange(false);
  };
  const enterAgrega = (e: KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      agregar();
    }
  };

  const elegidos = impuestosElegidos(seleccion.ids, impuestos);
  const total = valido ? calcularTotal(item) : 0;

  return (
    <Dialogo
      abierto={abierto}
      onAbiertoChange={onAbiertoChange}
      titulo={t('documentoEdicion.manual.titulo')}
      descripcion={t('documentoEdicion.manual.descripcion')}
      icono={Plus}
      ancho={560}
      primario={{ etiqueta: t('documentoEdicion.manual.agregar'), onClick: agregar }}
    >
      <FormField etiqueta={t('documentoEdicion.manual.concepto')} obligatorio error={textoError('descripcion')}>
        {(c) => (
          <Input
            ref={refDescripcion}
            id={c.id}
            aria-describedby={c['aria-describedby']}
            aria-invalid={c['aria-invalid']}
            aria-required={c['aria-required']}
            value={descripcion}
            maxLength={1000}
            onChange={(e) => setDescripcion(e.target.value)}
            className="h-10"
          />
        )}
      </FormField>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-[96px_1fr_1fr]">
        <FormField etiqueta={t('documentoEdicion.manual.cantidad')} error={textoError('cantidad')}>
          {(c) => (
            <CampoNumero
              id={c.id}
              aria-describedby={c['aria-describedby']}
              aria-invalid={c['aria-invalid']}
              valor={cantidad}
              decimales={3}
              minimo={0}
              onValorChange={setCantidad}
            />
          )}
        </FormField>
        <FormField
          etiqueta={variante === 'venta' ? t('documentoEdicion.manual.precio') : t('documentoEdicion.manual.costo')}
          obligatorio
          error={textoError('precio')}
        >
          {(c) => (
            <CampoNumero
              id={c.id}
              aria-describedby={c['aria-describedby']}
              aria-invalid={c['aria-invalid']}
              aria-required={c['aria-required']}
              valor={precio}
              prefijo={simboloMoneda(moneda)}
              decimales={decimales}
              minimo={0}
              onValorChange={setPrecio}
            />
          )}
        </FormField>
        <FormField etiqueta={t('documentoEdicion.manual.impuesto')}>
          {() => (
            <ImpuestosLinea
              opciones={impuestos}
              valor={seleccion}
              onValorChange={setSeleccion}
              multiple={impuestosMultiples}
              sinIncluido={sinIncluido}
              etiqueta={t('documentoEdicion.manual.impuesto')}
            />
          )}
        </FormField>
      </div>
      <FormField
        etiqueta={t('documentoEdicion.manual.nota')}
        ayuda={variante === 'venta' ? t('documentoEdicion.manual.notaVenta') : t('documentoEdicion.manual.notaCompra')}
      >
        <Input value={nota} maxLength={500} onChange={(e) => setNota(e.target.value)} onKeyDown={enterAgrega} className="h-10" />
      </FormField>
      <div className="flex flex-col gap-2 rounded-lg bg-subtle px-4 py-3" aria-live="polite">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-fg-muted">{t('documentoEdicion.manual.vistaPrevia')}</span>
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 flex-col gap-1">
            <span className="truncate text-sm font-medium text-fg">{descripcion.trim() || t('documentoEdicion.lineas.itemSinNombre')}</span>
            <span className="flex flex-wrap gap-1">
              <span className="inline-flex h-5 items-center rounded-full border border-line bg-surface px-2 text-[11px] font-medium text-fg-secondary">
                {t('documentoEdicion.lineas.itemManual')}
              </span>
              {elegidos.map((o) => (
                <span key={o.id} className="inline-flex h-5 items-center rounded-full border border-line-brand bg-brand-tint px-2 text-[11px] font-medium text-brand-deep">
                  {o.nombre}
                  {!/\d/.test(o.nombre) && formatearTarifa(o.tarifa, locale) ? ` ${formatearTarifa(o.tarifa, locale)}` : ''}
                </span>
              ))}
            </span>
          </div>
          <span className="shrink-0 text-sm font-semibold tabular-nums text-fg">{formatear(total)}</span>
        </div>
      </div>
    </Dialogo>
  );
}
