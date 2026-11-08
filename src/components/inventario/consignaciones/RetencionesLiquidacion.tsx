'use client';

/**
 * Retenciones de una liquidación al consignante (Ronda 3 del Contador, punto 2), por
 * separado:
 * - de la OPERACIÓN: la venta por cuenta del mandante; la practica el comprador
 *   agente, con la calidad tributaria del mandante;
 * - de la REMUNERACIÓN: sobre la comisión; la practica el dueño (pagador) agente,
 *   con la calidad del intermediario.
 * Tarifa y base mínima son las de la regla configurada. Lo pendiente (falta regla,
 * calidad, UVT o norma municipal) muestra su motivo y NUNCA un valor; lo
 * determinado y lo pendiente se concilian con el certificado («Conciliar»).
 */
import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { FileCheck2 } from 'lucide-react';
import { CampoNumero, Dialogo, FormField, StatusBadge } from '@/components/kit';
import { Textarea } from '@/components/ui/textarea';
import { toastSuccess } from '@/components/ui/use-toast';
import { useMonedaOrganizacion } from '@/lib/hooks/useOrgCurrency';
import { textoErrorSaldo } from '@/components/finanzas/saldos-a-favor/textosSaldo';
import { retencionesPorAmbito, type AmbitoRetencion, type RetencionLiquidacion } from '@/lib/inventario/consignaciones/recibidas';
import { consignacionesRecibidasService } from './consignacionesRecibidasService';

const NS = 'consignacionesR4';
const BADGE = { determinada: 'completado', pendiente: 'pendiente', no_aplica: 'inactivo' } as const;

function ConciliarDialog({ retencion, onCerrar, onHecho }: { retencion: RetencionLiquidacion | null; onCerrar: () => void; onHecho: () => void }) {
  const t = useTranslations(NS);
  const [valor, setValor] = useState<number | null>(null);
  const [soporte, setSoporte] = useState('');
  const [tocado, setTocado] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    setValor(null);
    setSoporte('');
    setTocado(false);
    setError(null);
  }, [retencion]);
  const errValor = valor === null || valor < 0 ? t('retenciones.validacion.valor') : null;
  const errSoporte = soporte.trim().length < 5 ? t('errores.soporte_obligatorio') : null;
  const confirmar = async () => {
    setTocado(true);
    if (!retencion || errValor || errSoporte || valor === null) return;
    setEnviando(true);
    setError(null);
    try {
      await consignacionesRecibidasService.conciliarRetencion(retencion.id, { valor, soporte: soporte.trim() });
      toastSuccess(t('retenciones.conciliada'));
      onHecho();
    } catch (e) {
      setError(textoErrorSaldo(t, e));
    } finally {
      setEnviando(false);
    }
  };
  return (
    <Dialogo
      abierto={retencion !== null}
      onAbiertoChange={(v) => !v && !enviando && onCerrar()}
      titulo={t('retenciones.conciliarTitulo')}
      descripcion={retencion ? t('retenciones.conciliarDescripcion', { clase: t(`retenciones.clases.${retencion.clase}`) }) : undefined}
      icono={FileCheck2}
      ancho={520}
      primario={{ etiqueta: t('retenciones.conciliar'), onClick: () => void confirmar(), cargando: enviando }}
    >
      <div className="flex flex-col gap-4">
        <FormField etiqueta={t('retenciones.valorCertificado')} obligatorio ayuda={t('retenciones.valorCertificadoAyuda')} error={tocado ? errValor : null}>
          {(c) => <CampoNumero id={c.id} valor={valor} onValorChange={setValor} minimo={0} decimales={2} alinear="derecha" />}
        </FormField>
        <FormField etiqueta={t('retenciones.soporte')} obligatorio ayuda={t('retenciones.soporteAyuda')} error={tocado ? errSoporte : null}>
          {(c) => <Textarea id={c.id} aria-labelledby={c.idEtiqueta} value={soporte} maxLength={1000} rows={2} onChange={(e) => setSoporte(e.target.value)} />}
        </FormField>
        {error && (
          <p role="alert" className="text-sm text-danger-text">
            {error}
          </p>
        )}
      </div>
    </Dialogo>
  );
}

export function RetencionesLiquidacion({ retenciones, puedeConciliar, onConciliada }: { retenciones: readonly RetencionLiquidacion[]; puedeConciliar: boolean; onConciliada: () => void }) {
  const t = useTranslations(NS);
  const fmt = useMonedaOrganizacion().formatear;
  const [conciliar, setConciliar] = useState<RetencionLiquidacion | null>(null);
  if (retenciones.length === 0) return null;
  const grupos = retencionesPorAmbito(retenciones);
  const seccion = (ambito: AmbitoRetencion) => (
    <div key={ambito} className="flex flex-col gap-2">
      <div>
        <h4 className="text-sm font-medium text-fg">{t(`retenciones.ambitos.${ambito}.titulo`)}</h4>
        <p className="text-xs text-fg-muted">{t(`retenciones.ambitos.${ambito}.descripcion`)}</p>
      </div>
      <ul className="flex flex-col divide-y divide-line rounded-md border border-line">
        {grupos[ambito].map((r) => (
          <li key={r.id} className="flex flex-col gap-1 px-3 py-2 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <p className="text-sm text-fg">
                {t(`retenciones.clases.${r.clase}`)} · {t(`retenciones.grupos.${r.grupo}`)}
              </p>
              <p className="text-xs text-fg-muted">
                {r.base != null ? t('retenciones.base', { base: fmt(r.base) }) : t('retenciones.sinBase')}
                {r.tarifa != null ? ` · ${t('retenciones.tarifa', { tarifa: r.tarifa })}` : ''}
                {r.motivo ? ` · ${t.has(`retenciones.motivos.${r.motivo}`) ? t(`retenciones.motivos.${r.motivo}`) : r.motivo}` : ''}
              </p>
              {r.conciliado && <p className="text-xs text-fg-muted">{t('retenciones.conciliadoCon', { valor: fmt(r.conciliado.valor), soporte: r.conciliado.soporte })}</p>}
            </div>
            <div className="flex shrink-0 items-center gap-2">
              {r.valor != null && <span className="text-sm font-medium tabular-nums text-fg">{fmt(r.valor)}</span>}
              <StatusBadge estado={r.conciliado ? 'completado' : BADGE[r.estado]} etiqueta={r.conciliado ? t('retenciones.estados.conciliada') : t(`retenciones.estados.${r.estado}`)} />
              {puedeConciliar && r.estado !== 'no_aplica' && !r.conciliado && (
                <button type="button" onClick={() => setConciliar(r)} className="text-xs font-medium text-brand hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand">
                  {t('retenciones.conciliar')}
                </button>
              )}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
  return (
    <div className="flex flex-col gap-4">
      {seccion('operacion')}
      {seccion('remuneracion')}
      <ConciliarDialog retencion={conciliar} onCerrar={() => setConciliar(null)} onHecho={() => (setConciliar(null), onConciliada())} />
    </div>
  );
}
