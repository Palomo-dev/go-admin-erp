'use client';

/**
 * Tarifa de un procesador (encargo «Recaudo por medio de pago», aprobado el 2026-11-25): plan,
 * porcentaje y valor fijo por transacción, IVA de la comisión, % adicional de tarjeta
 * internacional y % de ReteFuente, ReteICA y ReteIVA. Con ella «Cobros» ESTIMA; lo real sale del
 * abono. Para Bold ofrece sus dos planes en línea (bold.co/tarifas) como punto de partida.
 * Guarda por `POST /api/finanzas/procesadores-pago/tarifa` (la base exige finance.create).
 */
import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { BadgePercent } from 'lucide-react';
import { AvisoTonal, CampoNumero, Dialogo, FormField } from '@/components/kit';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toastError, toastSuccess } from '@/components/ui/use-toast';
import { getOrganizationId } from '@/lib/hooks/useOrganization';
import { useMonedaOrganizacion } from '@/lib/hooks/useOrgCurrency';
import { simboloMoneda } from '@/components/kit/documento/documentoLineasLogica';
import { PLANES_BOLD, erroresTarifa, type PlanTarifa, type TarifaProcesador, type TramoTarifa } from '@/lib/finanzas/procesadoresPago/tarifaProcesador';
import type { CodigoProcesador } from '@/lib/finanzas/procesadoresPago/procesadoresLogica';

const VACIA: TarifaProcesador = { ...PLANES_BOLD.abonoInmediato, plan: 'personalizado', base: { porcentaje: 0, fijo: 0 }, internacionalPct: 0 };

export interface TarifaProcesadorDialogProps {
  abierto: boolean;
  onAbiertoChange: (abierto: boolean) => void;
  procesador: CodigoProcesador;
  nombre: string;
  tarifa: TarifaProcesador | null;
  puedeEditar: boolean;
  onGuardada: () => void;
}

export function TarifaProcesadorDialog({ abierto, onAbiertoChange, procesador, nombre, tarifa, puedeEditar, onGuardada }: TarifaProcesadorDialogProps) {
  const tx = useTranslations('recaudoMedio.tarifa');
  const moneda = useMonedaOrganizacion();
  const simbolo = simboloMoneda(moneda);
  const [valor, setValor] = useState<TarifaProcesador>(tarifa ?? (procesador === 'bold' ? PLANES_BOLD.abonoInmediato : VACIA));
  const [guardando, setGuardando] = useState(false);

  useEffect(() => {
    if (abierto) setValor(tarifa ?? (procesador === 'bold' ? PLANES_BOLD.abonoInmediato : VACIA));
  }, [abierto, tarifa, procesador]);

  const errores = erroresTarifa(valor);
  const planes: PlanTarifa[] = procesador === 'bold' ? ['abonoInmediato', 'diaSiguiente', 'personalizado'] : ['personalizado'];

  const elegirPlan = (plan: PlanTarifa) => {
    if (plan !== 'personalizado' && procesador === 'bold') {
      // Conserva las retenciones que la organización ya escribió.
      setValor((v) => ({ ...PLANES_BOLD[plan], reteFuentePct: v.reteFuentePct, reteIcaPct: v.reteIcaPct, reteIvaPct: v.reteIvaPct, retencionesConfiguradas: v.retencionesConfiguradas }));
    } else {
      setValor((v) => ({ ...v, plan }));
    }
  };

  const cambiar = <K extends keyof TarifaProcesador>(k: K, v: TarifaProcesador[K]) => setValor((x) => ({ ...x, [k]: v, plan: k.startsWith('rete') || k === 'retencionesConfiguradas' ? x.plan : 'personalizado' }));
  const cambiarTramo = (k: 'base' | 'tarjeta' | 'tarjetaOtras' | 'pseBilleteras', campo: keyof TramoTarifa, n: number | null) =>
    setValor((x) => {
      const actual = x[k] ?? x.base;
      return { ...x, plan: 'personalizado', [k]: { ...actual, [campo]: n ?? 0 } };
    });

  const guardar = async () => {
    setGuardando(true);
    try {
      const org = getOrganizationId();
      const r = await fetch('/api/finanzas/procesadores-pago/tarifa', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json', ...(org > 0 ? { 'x-organization-id': String(org) } : {}) },
        body: JSON.stringify({ procesador, tarifa: valor }),
      });
      if (!r.ok) {
        toastError(r.status === 403 ? tx('errorPermiso') : tx('errorGuardar'));
        return;
      }
      toastSuccess(tx('guardada', { procesador: nombre }));
      onGuardada();
      onAbiertoChange(false);
    } catch {
      toastError(tx('errorGuardar'));
    } finally {
      setGuardando(false);
    }
  };

  const campoPct = (etiqueta: string, n: number, onCambio: (n: number) => void) => (
    <FormField etiqueta={etiqueta}>
      {(c) => (
        <CampoNumero id={c.id} aria-describedby={c['aria-describedby']} valor={n} onValorChange={(v) => onCambio(v ?? 0)} decimales={3} minimo={0} maximo={100} sufijo="%" disabled={!puedeEditar} />
      )}
    </FormField>
  );
  const filaTramo = (k: 'base' | 'tarjeta' | 'tarjetaOtras' | 'pseBilleteras', titulo: string) => {
    const x = valor[k] ?? valor.base;
    return (
      <div className="grid grid-cols-[1fr_7rem_7rem] items-end gap-2">
        <span className="pb-2 text-sm text-fg">{titulo}</span>
        <CampoNumero aria-label={tx('porcentajeDe', { tramo: titulo })} valor={x.porcentaje} onValorChange={(v) => cambiarTramo(k, 'porcentaje', v)} decimales={3} minimo={0} maximo={100} sufijo="%" disabled={!puedeEditar} />
        <CampoNumero aria-label={tx('fijoDe', { tramo: titulo })} valor={x.fijo} onValorChange={(v) => cambiarTramo(k, 'fijo', v)} decimales={2} minimo={0} prefijo={simbolo} disabled={!puedeEditar} />
      </div>
    );
  };

  return (
    <Dialogo
      abierto={abierto}
      onAbiertoChange={onAbiertoChange}
      titulo={tx('titulo', { procesador: nombre })}
      descripcion={tx('descripcion')}
      icono={BadgePercent}
      ancho={560}
      primario={{ etiqueta: tx('guardar'), onClick: () => void guardar(), cargando: guardando, deshabilitada: !puedeEditar || errores.length > 0, motivo: !puedeEditar ? tx('soloLectura') : undefined }}
    >
      <div className="flex flex-col gap-4">
        <FormField etiqueta={tx('plan')}>
          {(c) => (
            <Select value={valor.plan} onValueChange={(v) => elegirPlan(v as PlanTarifa)} disabled={!puedeEditar}>
              <SelectTrigger id={c.id} aria-labelledby={c.idEtiqueta} className="h-10 border-line-strong bg-surface">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {planes.map((p) => (
                  <SelectItem key={p} value={p}>
                    {tx(`planes.${p}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </FormField>

        <div className="flex flex-col gap-2">
          <div className="grid grid-cols-[1fr_7rem_7rem] gap-2 text-xs font-medium text-fg-secondary">
            <span>{tx('medio')}</span>
            <span>{tx('porcentaje')}</span>
            <span>{tx('fijo')}</span>
          </div>
          {filaTramo('base', tx('tramos.base'))}
          {(valor.tarjeta || valor.plan === 'diaSiguiente') && filaTramo('tarjeta', tx('tramos.tarjeta'))}
          {(valor.tarjetaOtras || valor.plan === 'diaSiguiente') && filaTramo('tarjetaOtras', tx('tramos.tarjetaOtras'))}
          {(valor.pseBilleteras || valor.plan === 'diaSiguiente') && filaTramo('pseBilleteras', tx('tramos.pseBilleteras'))}
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {campoPct(tx('internacional'), valor.internacionalPct, (n) => cambiar('internacionalPct', n))}
          {campoPct(tx('ivaComision'), valor.ivaComisionPct, (n) => cambiar('ivaComisionPct', n))}
        </div>

        <fieldset className="flex flex-col gap-3 border-t border-line pt-3">
          <legend className="text-sm font-semibold text-fg">{tx('retenciones')}</legend>
          {!valor.retencionesConfiguradas && <AvisoTonal tono="advertencia" titulo={tx('configuraRetenciones', { procesador: nombre })} />}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            {campoPct(tx('reteFuente'), valor.reteFuentePct, (n) => cambiar('reteFuentePct', n))}
            {campoPct(tx('reteIca'), valor.reteIcaPct, (n) => cambiar('reteIcaPct', n))}
            {campoPct(tx('reteIva'), valor.reteIvaPct, (n) => cambiar('reteIvaPct', n))}
          </div>
          <label className="flex cursor-pointer items-center gap-2 text-sm text-fg">
            <Checkbox checked={valor.retencionesConfiguradas} disabled={!puedeEditar} onCheckedChange={(v) => cambiar('retencionesConfiguradas', v === true)} />
            {tx('retencionesRevisadas')}
          </label>
          <label className="flex cursor-pointer items-center gap-2 text-sm text-fg">
            <Checkbox checked={valor.pseSinRetenciones} disabled={!puedeEditar} onCheckedChange={(v) => cambiar('pseSinRetenciones', v === true)} />
            {tx('pseSinRetenciones')}
          </label>
        </fieldset>
        <p className="text-xs text-fg-muted">{tx('nota')}</p>
      </div>
    </Dialogo>
  );
}
