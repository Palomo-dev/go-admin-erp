'use client';

import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { CalendarRange } from 'lucide-react';
import { crearFormateadorMoneda, type ContextoMoneda } from '@/lib/utils/moneda';
import { CampoNumero } from '../CampoNumero';
import { Dialogo } from '../Dialogo';
import { FormField } from '../FormField';
import { SegmentedControl } from '../SegmentedControl';
import { useKitT } from '../useIdiomaKit';
import { totalesPlan, validarPlanCuotas, type CuotaVista, type FormularioPlan } from './carteraLogica';

/**
 * Plan de cuotas de una cuenta por cobrar o por pagar (capturas
 * `26-cartera-09-pagar-detalle.png`, X1 `740:49675`): número de cuotas,
 * primera fecha, interés (opcional) y frecuencia (opcional), con la vista
 * previa del reparto.
 *
 * **El reparto no se calcula aquí**: lo arma `calcular`, la función del
 * dominio que pasa la pantalla (`planCuotas` de compras, `generarPlanCuotas`
 * de cartera), y lo guarda `onConfirmar` (su RPC). El diálogo valida lo
 * escrito, muestra la propuesta y el error que devuelva el servidor.
 */
export interface ParametrosPlan {
  numero: number;
  primera: string;
  interes: number;
  frecuencia: string | null;
}

export interface PlanCuotasDialogProps {
  abierto: boolean;
  onAbiertoChange: (abierto: boolean) => void;
  saldo: number;
  moneda: ContextoMoneda | string;
  /** Día de la organización `YYYY-MM-DD`. */
  hoy: string;
  /** Formatea un día `YYYY-MM-DD` (`useFormatDate().formatPlain`). */
  formatearDia: (dia: string) => string;
  calcular: (p: ParametrosPlan) => readonly CuotaVista[];
  onConfirmar: (plan: readonly CuotaVista[], p: ParametrosPlan) => void | Promise<void>;
  cargando?: boolean;
  error?: string | null;
  /** Muestra el campo de interés por cuota (CxP). */
  conInteres?: boolean;
  /** Frecuencias que admite el dominio (CxC: mensual, quincenal…). */
  frecuencias?: readonly { valor: string; etiqueta: string }[];
  frecuenciaInicial?: string;
  cuotasIniciales?: number;
  maxCuotas?: number;
  titulo?: string;
  descripcion?: ReactNode;
  textoConfirmar?: string;
}

export function PlanCuotasDialog({
  abierto,
  onAbiertoChange,
  saldo,
  moneda,
  hoy,
  formatearDia,
  calcular,
  onConfirmar,
  cargando,
  error,
  conInteres = false,
  frecuencias,
  frecuenciaInicial,
  cuotasIniciales = 3,
  maxCuotas = 60,
  titulo,
  descripcion,
  textoConfirmar,
}: PlanCuotasDialogProps) {
  const t = useKitT();
  const formatear = useMemo(() => crearFormateadorMoneda(moneda), [moneda]);
  const [form, setForm] = useState<FormularioPlan>({ numero: cuotasIniciales, primera: hoy, interes: 0 });
  const [frecuencia, setFrecuencia] = useState<string | null>(frecuenciaInicial ?? frecuencias?.[0]?.valor ?? null);

  // Cada apertura parte de los valores iniciales.
  useEffect(() => {
    if (!abierto) return;
    setForm({ numero: cuotasIniciales, primera: hoy, interes: 0 });
    setFrecuencia(frecuenciaInicial ?? frecuencias?.[0]?.valor ?? null);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- solo al abrir
  }, [abierto, hoy]);

  const errores = validarPlanCuotas(form, { hoy, maxCuotas, conInteres });
  const valido = Object.keys(errores).length === 0 && saldo > 0;
  const interes = conInteres ? (form.interes ?? 0) : 0;
  const parametros = useMemo<ParametrosPlan | null>(
    () => (valido ? { numero: form.numero as number, primera: form.primera, interes, frecuencia } : null),
    [valido, form.numero, form.primera, interes, frecuencia],
  );
  const plan = useMemo(() => (parametros ? calcular(parametros) : []), [calcular, parametros]);
  const totales = totalesPlan(plan);
  const conColInteres = conInteres || plan.some((c) => (c.interes ?? 0) !== 0);

  return (
    <Dialogo
      abierto={abierto}
      onAbiertoChange={(v) => !cargando && onAbiertoChange(v)}
      titulo={titulo ?? t('documento.planCuotas.titulo')}
      descripcion={descripcion ?? t('documento.planCuotas.descripcion', { saldo: formatear(saldo) })}
      icono={CalendarRange}
      ancho={560}
      primario={{
        etiqueta: textoConfirmar ?? t('documento.planCuotas.crear'),
        onClick: () => parametros && plan.length > 0 && void onConfirmar(plan, parametros),
        cargando,
        deshabilitada: plan.length === 0,
        motivo: t('documento.planCuotas.revisar'),
      }}
    >
      <div className="flex flex-col gap-4">
        <div className={conInteres ? 'grid grid-cols-1 gap-3 sm:grid-cols-3' : 'grid grid-cols-1 gap-3 sm:grid-cols-2'}>
          <FormField etiqueta={t('documento.planCuotas.cuotas')} obligatorio error={errores.cuotas ? t('documento.planCuotas.errores.cuotas', { maximo: maxCuotas }) : undefined}>
            {(c) => (
              <CampoNumero
                id={c.id}
                aria-describedby={c['aria-describedby']}
                aria-invalid={c['aria-invalid']}
                valor={form.numero}
                onValorChange={(v) => setForm((f) => ({ ...f, numero: v }))}
                decimales={0}
                minimo={1}
                maximo={maxCuotas}
              />
            )}
          </FormField>
          <FormField etiqueta={t('documento.planCuotas.primera')} obligatorio error={errores.fecha ? t('documento.planCuotas.errores.fecha') : undefined}>
            {(c) => (
              <input
                id={c.id}
                aria-describedby={c['aria-describedby']}
                aria-invalid={c['aria-invalid']}
                type="date"
                min={hoy}
                value={form.primera}
                onChange={(e) => setForm((f) => ({ ...f, primera: e.target.value }))}
                className="h-10 w-full rounded-md border border-line-strong bg-surface px-3 text-sm text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand aria-[invalid=true]:border-line-danger"
              />
            )}
          </FormField>
          {conInteres && (
            <FormField
              etiqueta={t('documento.planCuotas.interes')}
              ayuda={t('documento.planCuotas.interesAyuda')}
              error={errores.interes ? t('documento.planCuotas.errores.interes') : undefined}
            >
              {(c) => (
                <CampoNumero
                  id={c.id}
                  aria-describedby={c['aria-describedby']}
                  aria-invalid={c['aria-invalid']}
                  valor={form.interes}
                  onValorChange={(v) => setForm((f) => ({ ...f, interes: v }))}
                  decimales={2}
                  minimo={0}
                  maximo={100}
                  sufijo="%"
                />
              )}
            </FormField>
          )}
        </div>

        {frecuencias && frecuencias.length > 1 && (
          <FormField etiqueta={t('documento.planCuotas.frecuencia')}>
            {(c) => (
              <SegmentedControl
                aria-labelledby={c.idEtiqueta}
                anchoCompleto
                valor={frecuencia ?? frecuencias[0].valor}
                onValorChange={setFrecuencia}
                opciones={frecuencias.map((f) => ({ valor: f.valor, etiqueta: f.etiqueta }))}
              />
            )}
          </FormField>
        )}

        {plan.length > 0 && (
          <div className="max-h-[40vh] overflow-auto rounded-lg border border-line">
            <table className="w-full text-sm">
              <caption className="sr-only">{t('documento.planCuotas.vistaPrevia')}</caption>
              <thead className="sticky top-0 bg-subtle text-left text-xs text-fg-secondary">
                <tr>
                  <th scope="col" className="px-3 py-2 font-medium">#</th>
                  <th scope="col" className="px-3 py-2 font-medium">{t('documento.planCuotas.vence')}</th>
                  <th scope="col" className="px-3 py-2 text-right font-medium">{t('documento.planCuotas.capital')}</th>
                  {conColInteres && <th scope="col" className="px-3 py-2 text-right font-medium">{t('documento.planCuotas.interesCol')}</th>}
                  <th scope="col" className="px-3 py-2 text-right font-medium">{t('documento.planCuotas.valor')}</th>
                </tr>
              </thead>
              <tbody>
                {plan.map((c) => (
                  <tr key={c.numero} className="border-t border-line">
                    <td className="px-3 py-2 tabular-nums">{c.numero}</td>
                    <td className="whitespace-nowrap px-3 py-2 tabular-nums">{formatearDia(c.vence)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{formatear(c.capital)}</td>
                    {conColInteres && <td className="px-3 py-2 text-right tabular-nums">{formatear(c.interes ?? 0)}</td>}
                    <td className="px-3 py-2 text-right font-medium tabular-nums">{formatear(c.valor)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="border-t border-line-strong font-medium">
                <tr>
                  <th scope="row" colSpan={conColInteres ? 4 : 3} className="px-3 py-2 text-left">
                    {t('documento.planCuotas.total')}
                  </th>
                  <td className="px-3 py-2 text-right tabular-nums">{formatear(totales.valor)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
        {error && (
          <p role="alert" className="text-sm text-danger-text">
            {error}
          </p>
        )}
      </div>
    </Dialogo>
  );
}
