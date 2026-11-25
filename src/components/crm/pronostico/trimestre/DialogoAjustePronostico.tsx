'use client';

/**
 * «Ajustar compromiso de …» (Figma CRM 1434:1185). Orden del diseño: nuevo
 * compromiso, motivo, detalle obligatorio y la nota de que el ajuste NO
 * cambia las oportunidades (se muestra como «Ajustado +$ …» sobre el
 * compromiso calculado). Un ajuste se revierte con otro, nunca se borra. El
 * servidor revalida todo (permiso, monto calculado y foto) antes de guardar.
 */

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { toast } from '@/components/ui/use-toast';
import { Dialogo } from '@/components/kit/Dialogo';
import { FormField } from '@/components/kit/FormField';
import { CampoNumero } from '@/components/kit/CampoNumero';
import { SelectCrm } from '@/components/crm/kit/SelectCrm';
import { CLASE_AREA } from '@/components/crm/kit/camposCrm';
import { pedirCrm, ErrorApiCrm } from '@/components/crm/acciones/apiCrm';
import { formatMoneda, type ContextoMoneda } from '@/lib/utils/moneda';
import { MOTIVOS_AJUSTE, type FilaPronostico, type MotivoAjuste } from '@/lib/services/crm/forecastLogica';
import { deltaAjuste, montoInicialAjuste, partesTrimestre, simboloMoneda } from './trimestreLogica';

interface Props {
  fila: FilaPronostico | null;
  nombre: string;
  periodo: string;
  moneda: ContextoMoneda;
  onCerrar: () => void;
  onGuardado: () => void;
}

const MOTIVOS_NUEVOS = MOTIVOS_AJUSTE.filter((m) => m !== 'reversal');

export function DialogoAjustePronostico({ fila, nombre, periodo, moneda, onCerrar, onGuardado }: Props) {
  const t = useTranslations('crm.pronosticoTrimestre.ajuste');
  const [monto, setMonto] = useState<number | null>(null);
  const [motivo, setMotivo] = useState<MotivoAjuste>('verbal_agreement');
  const [detalle, setDetalle] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const actual = fila ? montoInicialAjuste(fila.commit.total, moneda.decimals) : 0;

  useEffect(() => {
    if (!fila) return;
    setMonto(montoInicialAjuste(fila.commit.total, moneda.decimals));
    setMotivo('verbal_agreement');
    setDetalle('');
    setError(null);
  }, [fila, moneda.decimals]);

  const delta = deltaAjuste(monto, actual);
  const revertir = motivo === 'reversal';
  const valido = detalle.trim().length >= 3 && (revertir || (monto !== null && monto >= 0 && delta !== 0));
  const m = (n: number) => formatMoneda(n, moneda);

  const guardar = async () => {
    if (!fila?.userId || !valido) return;
    setGuardando(true);
    setError(null);
    try {
      await pedirCrm('/api/crm/forecast/adjustments', {
        method: 'POST',
        cuerpo: {
          period: periodo,
          user_id: fila.userId,
          expected_before: actual,
          expected_adjustment_id: fila.latestAdjustment?.id ?? null,
          reason_code: motivo,
          reason_text: detalle.trim(),
          ...(revertir ? { reverses_id: fila.latestAdjustment?.id } : { amount_after: monto }),
        },
      });
      toast({ title: t(revertir ? 'okRevertido' : 'ok') });
      onGuardado();
    } catch (e) {
      const codigo = e instanceof ErrorApiCrm ? e.codigo : null;
      setError(t(`errores.${codigo === 'registro_modificado' || codigo === 'sin_tasa' || codigo === 'ajuste_no_vigente' ? codigo : 'generico'}`));
    } finally {
      setGuardando(false);
    }
  };

  const { anio, q } = partesTrimestre(periodo);
  const opciones = [...MOTIVOS_NUEVOS, ...(fila?.latestAdjustment ? (['reversal'] as const) : [])].map((v) => ({ valor: v, etiqueta: t('motivoOpcion', { motivo: t(`motivosFrase.${v}`) }) }));
  const nota = revertir
    ? t('notaRevertir')
    : t('nota', { delta: delta !== null && delta !== 0 ? `${delta > 0 ? '+' : '−'}${m(Math.abs(delta))}` : `+${m(0)}` });

  return (
    <Dialogo
      abierto={fila !== null}
      onAbiertoChange={(a) => !a && onCerrar()}
      titulo={t('titulo', { nombre })}
      descripcion={t('descripcion', { q, anio, calculado: m(fila?.calculatedCommit.total ?? 0) })}
      ancho={520}
      primario={{ etiqueta: revertir ? t('revertir') : t('guardar'), onClick: () => void guardar(), cargando: guardando, deshabilitada: !valido, motivo: valido ? undefined : t('faltaMotivo') }}
    >
      <div className="space-y-4">
        {!revertir && (
          <FormField etiqueta={t('nuevoCompromiso')} etiquetaOculta obligatorio>
            <CampoNumero valor={monto} onValorChange={setMonto} minimo={0} decimales={moneda.decimals} prefijo={simboloMoneda(moneda.code, moneda.locale)} alinear="derecha" />
          </FormField>
        )}
        <FormField etiqueta={t('motivo')} etiquetaOculta obligatorio>
          {(campo) => <SelectCrm id={campo.id} aria-labelledby={campo.idEtiqueta} valor={motivo} onValorChange={(v) => setMotivo(v as MotivoAjuste)} opciones={opciones} />}
        </FormField>
        <FormField etiqueta={t('detalle')} obligatorio ayuda={t('ayudaDetalle')}>
          <textarea className={CLASE_AREA} rows={2} value={detalle} maxLength={2000} onChange={(e) => setDetalle(e.target.value)} />
        </FormField>
        <p className="rounded-lg bg-subtle px-3 py-3 text-xs text-fg-secondary">{nota}</p>
        {error && <p role="alert" className="rounded-lg bg-danger-subtle px-3 py-2 text-[13px] text-danger-text">{error}</p>}
      </div>
    </Dialogo>
  );
}
