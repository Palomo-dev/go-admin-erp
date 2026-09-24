'use client';

/**
 * Crear (o reemplazar) el plan de cuotas de una cuenta por cobrar: número de
 * cuotas, primera fecha y frecuencia; la propuesta la arma `generarPlanCuotas`
 * y la guarda `POST /api/cartera/[id]/cuotas` (`fn_cxc_crear_plan_cuotas`).
 */
import { useEffect, useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { CalendarClock } from 'lucide-react';
import { Dialogo, FormField, SegmentedControl } from '@/components/kit';
import { toastSuccess } from '@/components/ui/use-toast';
import { generarPlanCuotas, type FrecuenciaCuotas } from '@/lib/finanzas/cartera/cuotas';
import { getOrganizationId } from '@/lib/hooks/useOrganization';

export interface CrearPlanCuotasDialogProps {
  abierto: boolean;
  onAbiertoChange: (abierto: boolean) => void;
  cuentaId: string;
  saldo: number;
  decimales: number;
  hoy: string;
  formatear: (v: number) => string;
  formatearDia: (dia: string) => string;
  onCreado?: () => void;
}

const CLASES_CAMPO =
  'h-10 w-full rounded-md border border-line-strong bg-surface px-3 text-sm text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand';

export function CrearPlanCuotasDialog({ abierto, onAbiertoChange, cuentaId, saldo, decimales, hoy, formatear, formatearDia, onCreado }: CrearPlanCuotasDialogProps) {
  const t = useTranslations('cartera.cuotas');
  const [numero, setNumero] = useState(3);
  const [primera, setPrimera] = useState(hoy);
  const [frecuencia, setFrecuencia] = useState<FrecuenciaCuotas>('mensual');
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!abierto) return;
    setNumero(3);
    setPrimera(hoy);
    setFrecuencia('mensual');
    setError(null);
  }, [abierto, hoy]);

  const propuesta = useMemo(() => generarPlanCuotas(saldo, numero, primera, frecuencia, decimales), [saldo, numero, primera, frecuencia, decimales]);

  const guardar = async () => {
    setGuardando(true);
    setError(null);
    try {
      const org = getOrganizationId();
      const r = await fetch(`/api/cartera/${encodeURIComponent(cuentaId)}/cuotas`, {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json', ...(org > 0 ? { 'x-organization-id': String(org) } : {}) },
        body: JSON.stringify({ cuotas: propuesta.map((c) => ({ vence: c.vence, capital: c.capital, valor: c.valor })) }),
      });
      if (!r.ok) {
        const c = (await r.json().catch(() => ({}))) as { codigo?: string };
        const clave = `errores.${c.codigo ?? 'error_desconocido'}`;
        setError(t.has(clave) ? t(clave as never) : t('errores.error_desconocido'));
        return;
      }
      toastSuccess(t('creado'), t('creadoDescripcion', { count: propuesta.length }));
      onCreado?.();
      onAbiertoChange(false);
    } finally {
      setGuardando(false);
    }
  };

  return (
    <Dialogo
      abierto={abierto}
      onAbiertoChange={(v) => !guardando && onAbiertoChange(v)}
      titulo={t('crearTitulo')}
      descripcion={t('crearDescripcion', { saldo: formatear(saldo) })}
      icono={CalendarClock}
      ancho={560}
      primario={{ etiqueta: t('crear'), onClick: () => void guardar(), cargando: guardando, deshabilitada: propuesta.length === 0, motivo: t('sinPropuesta') }}
    >
      <div className="flex flex-col gap-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <FormField etiqueta={t('numero')}>
            {(c) => (
              <input
                id={c.id}
                type="number"
                min={1}
                max={120}
                value={numero}
                onChange={(e) => setNumero(Math.max(1, Math.min(120, Math.floor(Number(e.target.value) || 1))))}
                className={CLASES_CAMPO}
              />
            )}
          </FormField>
          <FormField etiqueta={t('primera')}>
            {(c) => <input id={c.id} type="date" min={hoy} value={primera} onChange={(e) => setPrimera(e.target.value)} className={CLASES_CAMPO} />}
          </FormField>
        </div>
        <FormField etiqueta={t('frecuencia')}>
          {(c) => (
            <SegmentedControl
              aria-labelledby={c.idEtiqueta}
              anchoCompleto
              valor={frecuencia}
              onValorChange={(v) => setFrecuencia(v as FrecuenciaCuotas)}
              opciones={[
                { valor: 'mensual', etiqueta: t('frecuencias.mensual') },
                { valor: 'quincenal', etiqueta: t('frecuencias.quincenal') },
                { valor: 'semanal', etiqueta: t('frecuencias.semanal') },
              ]}
            />
          )}
        </FormField>
        <ol aria-label={t('propuesta')} className="max-h-56 overflow-y-auto rounded-lg border border-line text-sm">
          {propuesta.map((c) => (
            <li key={c.numero} className="flex items-center justify-between border-b border-line px-3 py-2 last:border-b-0">
              <span className="text-fg-secondary">{t('cuotaN', { numero: c.numero, fecha: formatearDia(c.vence) })}</span>
              <span className="font-medium tabular-nums text-fg">{formatear(c.valor)}</span>
            </li>
          ))}
        </ol>
        {error && (
          <p role="alert" className="text-sm text-danger-text">
            {error}
          </p>
        )}
      </div>
    </Dialogo>
  );
}
