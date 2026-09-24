'use client';

/**
 * Plan de cuotas de una cuenta por pagar (plan F9). El reparto sale de
 * `planCuotas` (centavos, última cuota absorbe la diferencia, meses
 * calendario recortados al fin de mes) y la base lo vuelve a validar
 * (`fn_cxp_crear_plan_cuotas`: suma = saldo, sin abonos previos).
 */
import { useEffect, useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { CalendarRange } from 'lucide-react';
import { Dialogo, FormField } from '@/components/kit';
// El índice del kit aún no reexporta CampoNumero (pedido al agente del kit).
import { CampoNumero } from '@/components/kit/CampoNumero';
import { Input } from '@/components/ui/input';
import { toastSuccess } from '@/components/ui/use-toast';
import { useFormatDate } from '@/lib/context/OrganizationTimezoneContext';
import { crearFormateadorMoneda, type ContextoMoneda } from '@/lib/utils/moneda';
import { planCuotas } from '@/lib/services/compras/logica';
import { clienteCompras, ErrorPeticionCompra } from '@/lib/services/compras/clienteCompras';

const DIA_RE = /^\d{4}-\d{2}-\d{2}$/;

export interface PlanCuotasDialogProps {
  abierto: boolean;
  onAbiertoChange: (abierto: boolean) => void;
  cuentaId: string;
  saldo: number;
  moneda: ContextoMoneda;
  hoy: string;
  onCreado: () => void;
}

export function PlanCuotasDialog({ abierto, onAbiertoChange, cuentaId, saldo, moneda, hoy, onCreado }: PlanCuotasDialogProps) {
  const t = useTranslations('cuentasPorPagar.plan');
  const te = useTranslations('cuentasPorPagar.errores');
  const { formatPlain } = useFormatDate();
  const formatear = useMemo(() => crearFormateadorMoneda(moneda), [moneda]);
  const [n, setN] = useState<number | null>(3);
  const [primera, setPrimera] = useState(hoy);
  const [interes, setInteres] = useState<number | null>(0);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!abierto) return;
    setN(3);
    setPrimera(hoy);
    setInteres(0);
    setError(null);
  }, [abierto, hoy]);

  const nValido = n !== null && Number.isInteger(n) && n >= 1 && n <= 60;
  const fechaValida = DIA_RE.test(primera) && primera >= hoy;
  const interesValido = interes !== null && interes >= 0 && interes <= 100;
  const plan = useMemo(
    () => (nValido && fechaValida && interesValido && saldo > 0 ? planCuotas(saldo, n as number, primera, interes as number) : []),
    [nValido, fechaValida, interesValido, saldo, n, primera, interes],
  );

  const crear = async () => {
    if (plan.length === 0) return;
    setEnviando(true);
    setError(null);
    try {
      await clienteCompras.crearPlanCuotas(
        cuentaId,
        plan.map((c) => ({ vence: c.vence, capital: c.capital, interes: c.interes, valor: c.valor })),
      );
      toastSuccess(t('creado', { n: plan.length }));
      onAbiertoChange(false);
      onCreado();
    } catch (e) {
      const codigo = e instanceof ErrorPeticionCompra ? e.codigo : 'error_desconocido';
      setError(te.has(codigo) ? te(codigo as never) : te('error_desconocido'));
    } finally {
      setEnviando(false);
    }
  };

  const total = plan.reduce((s, c) => s + c.valor, 0);

  return (
    <Dialogo
      abierto={abierto}
      onAbiertoChange={(v) => !enviando && onAbiertoChange(v)}
      titulo={t('titulo')}
      descripcion={t('descripcion', { saldo: formatear(saldo) })}
      icono={CalendarRange}
      ancho={560}
      primario={{ etiqueta: t('crear'), onClick: () => void crear(), cargando: enviando, deshabilitada: plan.length === 0, motivo: t('revisar') }}
    >
      <div className="flex flex-col gap-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <FormField etiqueta={t('cuotas')} obligatorio error={nValido ? undefined : t('errores.cuotas')}>
            {(c) => (
              <CampoNumero
                id={c.id}
                aria-describedby={c['aria-describedby']}
                aria-invalid={c['aria-invalid']}
                valor={n}
                onValorChange={setN}
                decimales={0}
                minimo={1}
                maximo={60}
              />
            )}
          </FormField>
          <FormField etiqueta={t('primera')} obligatorio error={fechaValida ? undefined : t('errores.fecha')}>
            {(c) => (
              <Input
                id={c.id}
                aria-describedby={c['aria-describedby']}
                aria-invalid={c['aria-invalid']}
                type="date"
                min={hoy}
                value={primera}
                onChange={(e) => setPrimera(e.target.value)}
                className="h-10"
              />
            )}
          </FormField>
          <FormField etiqueta={t('interes')} ayuda={t('interesAyuda')} error={interesValido ? undefined : t('errores.interes')}>
            {(c) => (
              <CampoNumero
                id={c.id}
                aria-describedby={c['aria-describedby']}
                aria-invalid={c['aria-invalid']}
                valor={interes}
                onValorChange={setInteres}
                decimales={2}
                minimo={0}
                maximo={100}
                sufijo="%"
              />
            )}
          </FormField>
        </div>

        {plan.length > 0 && (
          <div className="max-h-[40vh] overflow-auto rounded-lg border border-line">
            <table className="w-full text-sm">
              <caption className="sr-only">{t('vistaPrevia')}</caption>
              <thead className="sticky top-0 bg-subtle text-left text-xs text-fg-secondary">
                <tr>
                  <th scope="col" className="px-3 py-2 font-medium">#</th>
                  <th scope="col" className="px-3 py-2 font-medium">{t('vence')}</th>
                  <th scope="col" className="px-3 py-2 text-right font-medium">{t('capital')}</th>
                  <th scope="col" className="px-3 py-2 text-right font-medium">{t('interesCol')}</th>
                  <th scope="col" className="px-3 py-2 text-right font-medium">{t('valor')}</th>
                </tr>
              </thead>
              <tbody>
                {plan.map((c) => (
                  <tr key={c.numero} className="border-t border-line">
                    <td className="px-3 py-2 tabular-nums">{c.numero}</td>
                    <td className="whitespace-nowrap px-3 py-2 tabular-nums">{formatPlain(c.vence)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{formatear(c.capital)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{formatear(c.interes)}</td>
                    <td className="px-3 py-2 text-right font-medium tabular-nums">{formatear(c.valor)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="border-t border-line-strong font-medium">
                <tr>
                  <th scope="row" colSpan={4} className="px-3 py-2 text-left">
                    {t('total')}
                  </th>
                  <td className="px-3 py-2 text-right tabular-nums">{formatear(total)}</td>
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
