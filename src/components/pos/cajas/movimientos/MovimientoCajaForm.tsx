'use client';

/**
 * Formulario ÚNICO de ingreso / egreso de efectivo de una caja (Figma
 * `359:59059` página, `360:145278` diálogo; paso 9 de
 * docs/implementacion/CAJAS-VENTAS-PLAN.md). La página «Nuevo movimiento» y el
 * diálogo de «Mi caja» y del POS son dos envolturas de esta misma pieza: antes
 * cada una tenía su catálogo de conceptos y guardaba el texto de forma distinta.
 *
 * - Concepto del catálogo único (`src/lib/pos/cajas/conceptos.ts`): se guarda la
 *   clave y el texto canónico; «Otro…» pide el texto.
 * - Monto con el símbolo de la moneda de la organización (no un «$» fijo).
 * - Número de soporte opcional (`cash_movements.reference`, D13).
 * - `EfectoEnCaja`: esperado ahora → este movimiento → esperado después
 *   (solo si el servidor mandó el esperado: con cierre ciego no).
 */
import { useId, useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { ArrowDownCircle, ArrowUpCircle, Scale } from 'lucide-react';
import { FilaDato, FormField, ListaDatos, Tarjeta } from '@/components/kit';
import { CampoNumero } from '@/components/kit/CampoNumero';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn } from '@/utils/Utils';
import {
  conceptoParaGuardar,
  conceptosDe,
  efectoEnCaja,
  esConceptoLibre,
  validarMovimiento,
  type ClaveConcepto,
  type ErrorMovimiento,
  type TipoMovimiento,
} from '@/lib/pos/cajas/conceptos';
import type { CreateCashMovementData } from '../types';

export interface DatosMovimientoForm {
  tipo: TipoMovimiento;
  clave: ClaveConcepto | null;
  textoLibre: string;
  monto: number | null;
  referencia: string;
  notas: string;
}

export const DATOS_MOVIMIENTO_VACIOS: DatosMovimientoForm = {
  tipo: 'in',
  clave: null,
  textoLibre: '',
  monto: null,
  referencia: '',
  notas: '',
};

/** Estado y validación del formulario (la envoltura pone los botones). */
export function useMovimientoCajaForm(inicial: Partial<DatosMovimientoForm> = {}) {
  const [datos, setDatos] = useState<DatosMovimientoForm>({ ...DATOS_MOVIMIENTO_VACIOS, ...inicial });
  const [intento, setIntento] = useState(false);
  const error = validarMovimiento({ tipo: datos.tipo, clave: datos.clave, textoLibre: datos.textoLibre, monto: datos.monto });
  return {
    datos,
    cambiar: (parcial: Partial<DatosMovimientoForm>) => setDatos((d) => ({ ...d, ...parcial })),
    reiniciar: () => {
      setDatos({ ...DATOS_MOVIMIENTO_VACIOS, ...inicial });
      setIntento(false);
    },
    /** Error visible (solo tras intentar guardar). */
    errorVisible: intento ? error : null,
    /** Marca el intento y dice si se puede guardar. */
    validar: () => {
      setIntento(true);
      return error === null;
    },
  };
}

/** Lo que se manda a `CajasService` (clave del concepto + texto canónico o libre). */
export function datosParaGuardar(d: DatosMovimientoForm): CreateCashMovementData {
  if (!d.clave || d.monto === null) throw new Error('movimiento incompleto');
  const { concept, concept_code } = conceptoParaGuardar(d.clave, d.textoLibre);
  return {
    type: d.tipo,
    concept,
    concept_code,
    reference: d.referencia.trim() || null,
    amount: Math.round(d.monto * 100) / 100,
    notes: d.notas.trim() || undefined,
  };
}

export interface MovimientoCajaFormProps {
  datos: DatosMovimientoForm;
  onCambiar: (parcial: Partial<DatosMovimientoForm>) => void;
  errorVisible: ErrorMovimiento | null;
  simbolo: string;
  deshabilitado?: boolean;
  /** `dialogo` = sin tarjetas (va dentro de `Dialogo`). */
  variante?: 'pagina' | 'dialogo';
}

function SelectorTipo({ valor, onCambiar, deshabilitado }: { valor: TipoMovimiento; onCambiar: (t: TipoMovimiento) => void; deshabilitado?: boolean }) {
  const t = useTranslations('cajas.mov');
  const opciones: Array<{ valor: TipoMovimiento; titulo: string; ayuda: string; icono: typeof ArrowUpCircle }> = [
    { valor: 'in', titulo: t('ingreso'), ayuda: t('ingresoAyuda'), icono: ArrowUpCircle },
    { valor: 'out', titulo: t('egreso'), ayuda: t('egresoAyuda'), icono: ArrowDownCircle },
  ];
  return (
    <div role="radiogroup" aria-label={t('tipo')} className="grid grid-cols-2 gap-3">
      {opciones.map((o) => {
        const activo = o.valor === valor;
        const Icono = o.icono;
        return (
          <button
            key={o.valor}
            type="button"
            role="radio"
            aria-checked={activo}
            disabled={deshabilitado}
            onClick={() => onCambiar(o.valor)}
            onKeyDown={(e) => {
              if (e.key === 'ArrowRight' || e.key === 'ArrowLeft' || e.key === 'ArrowDown' || e.key === 'ArrowUp') {
                e.preventDefault();
                onCambiar(o.valor === 'in' ? 'out' : 'in');
              }
            }}
            tabIndex={activo ? 0 : -1}
            className={cn(
              'flex flex-col items-center gap-1 rounded-lg border px-3 py-3 text-center transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand disabled:opacity-60',
              activo
                ? o.valor === 'in'
                  ? 'border-line-success bg-success-subtle text-success-text'
                  : 'border-line-danger bg-danger-subtle text-danger-text'
                : 'border-line bg-surface text-fg hover:bg-hover',
            )}
          >
            <span className="flex items-center gap-1.5 text-sm font-semibold">
              <Icono aria-hidden="true" className="size-4" strokeWidth={1.5} />
              {o.titulo}
            </span>
            <span className={cn('text-xs', activo ? '' : 'text-fg-muted')}>{o.ayuda}</span>
          </button>
        );
      })}
    </div>
  );
}

export function MovimientoCajaForm({ datos, onCambiar, errorVisible, simbolo, deshabilitado, variante = 'pagina' }: MovimientoCajaFormProps) {
  const t = useTranslations('cajas.mov');
  const tConceptos = useTranslations('cajas.conceptos');
  const idLibre = useId();
  const conceptos = conceptosDe(datos.tipo);
  const errorConcepto = errorVisible === 'concepto_requerido' || errorVisible === 'concepto_no_corresponde' ? t('errores.concepto') : null;
  const errorMonto = errorVisible === 'monto_invalido' ? t('errores.monto') : null;

  const tipo = <SelectorTipo valor={datos.tipo} deshabilitado={deshabilitado} onCambiar={(tipoNuevo) => onCambiar({ tipo: tipoNuevo, clave: null, textoLibre: '' })} />;

  const detalles = (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      <FormField etiqueta={t('concepto')} obligatorio error={!esConceptoLibre(datos.clave) ? errorConcepto : null} className="sm:col-span-2">
        {(campo) => (
          <Select value={datos.clave ?? ''} onValueChange={(v) => onCambiar({ clave: v as ClaveConcepto })} disabled={deshabilitado}>
            <SelectTrigger id={campo.id} aria-labelledby={campo.idEtiqueta} aria-invalid={!!errorConcepto && !esConceptoLibre(datos.clave)} className="h-10">
              <SelectValue placeholder={t('conceptoPlaceholder')} />
            </SelectTrigger>
            <SelectContent>
              {conceptos.map((c) => (
                <SelectItem key={c} value={c}>
                  {tConceptos(c)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </FormField>
      {esConceptoLibre(datos.clave) && (
        <FormField etiqueta={t('conceptoLibre')} obligatorio error={errorConcepto} id={idLibre} className="sm:col-span-2">
          <Input value={datos.textoLibre} maxLength={200} onChange={(e) => onCambiar({ textoLibre: e.target.value })} disabled={deshabilitado} placeholder={t('conceptoLibrePlaceholder')} />
        </FormField>
      )}
      <FormField etiqueta={t('monto')} obligatorio error={errorMonto}>
        <CampoNumero valor={datos.monto} onValorChange={(v) => onCambiar({ monto: v })} prefijo={simbolo} minimo={0} alinear="derecha" disabled={deshabilitado} />
      </FormField>
      <FormField etiqueta={t('soporte')} ayuda={t('soporteAyuda')}>
        <Input value={datos.referencia} maxLength={80} onChange={(e) => onCambiar({ referencia: e.target.value })} disabled={deshabilitado} placeholder={t('soportePlaceholder')} />
      </FormField>
      <FormField etiqueta={t('notas')} className="sm:col-span-2">
        <Textarea value={datos.notas} maxLength={500} rows={2} onChange={(e) => onCambiar({ notas: e.target.value })} disabled={deshabilitado} placeholder={t('notasPlaceholder')} />
      </FormField>
    </div>
  );

  if (variante === 'dialogo') {
    return (
      <div className="flex flex-col gap-4">
        {tipo}
        {detalles}
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-4">
      <Tarjeta titulo={t('tipo')}>{tipo}</Tarjeta>
      <Tarjeta titulo={t('detalles')}>{detalles}</Tarjeta>
    </div>
  );
}

/** «Efecto en la caja»: esperado ahora → este movimiento → esperado después. */
export function EfectoEnCaja({
  esperado,
  tipo,
  monto,
  formatear,
  compacto,
}: {
  /** `null` = cierre ciego: solo se muestra el movimiento. */
  esperado: number | null;
  tipo: TipoMovimiento;
  monto: number | null;
  formatear: (v: number) => string;
  compacto?: boolean;
}) {
  const t = useTranslations('cajas.mov');
  const m = monto ?? 0;
  const despues = useMemo(() => (esperado === null ? null : efectoEnCaja(esperado, tipo, m)), [esperado, tipo, m]);
  const lista = (
    <ListaDatos etiqueta={t('efecto')}>
      <FilaDato etiqueta={t('esperadoAhora')} valor={esperado === null ? null : formatear(esperado)} oculto={esperado === null} />
      <FilaDato etiqueta={t('esteMovimiento')} valor={`${tipo === 'in' ? '+' : '−'}${formatear(m)}`} tono={tipo === 'in' ? 'exito' : 'peligro'} />
      <FilaDato etiqueta={t('esperadoDespues')} valor={despues === null ? null : formatear(despues)} oculto={despues === null} tamano="lg" separadorAntes />
    </ListaDatos>
  );
  if (compacto) return <div className="rounded-lg border border-line bg-subtle px-3 py-2">{lista}</div>;
  return (
    <Tarjeta titulo={t('efecto')} icono={Scale}>
      {lista}
    </Tarjeta>
  );
}
