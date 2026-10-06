'use client';

/**
 * «Ajustar compromiso de …» (Figma CRM 1434:1185). El ajuste NO cambia las
 * oportunidades: se muestra como «Ajustado +$ …» sobre el compromiso
 * calculado y queda en la auditoría con autor y motivo. También permite
 * revertir el último ajuste. El servidor revalida todo (permiso, monto
 * calculado y foto) antes de guardar.
 */

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { SlidersHorizontal } from 'lucide-react';
import { toast } from '@/components/ui/use-toast';
import { Dialogo } from '@/components/kit/Dialogo';
import { FormField } from '@/components/kit/FormField';
import { CampoNumero } from '@/components/kit/CampoNumero';
import { SelectCrm } from '@/components/crm/kit/SelectCrm';
import { CLASE_AREA } from '@/components/crm/kit/camposCrm';
import { pedirCrm, ErrorApiCrm } from '@/components/crm/acciones/apiCrm';
import { formatMoneda, type ContextoMoneda } from '@/lib/utils/moneda';
import { MOTIVOS_AJUSTE, type FilaPronostico, type MotivoAjuste } from '@/lib/services/crm/forecastLogica';
import { deltaAjuste, montoInicialAjuste, partesTrimestre } from './trimestreLogica';

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
  const opciones = [...MOTIVOS_NUEVOS, ...(fila?.latestAdjustment ? (['reversal'] as const) : [])].map((m) => ({ valor: m, etiqueta: t(`motivos.${m}`) }));

  return (
    <Dialogo
      abierto={fila !== null}
      onAbiertoChange={(a) => !a && onCerrar()}
      titulo={t('titulo', { nombre })}
      descripcion={t('descripcion', { q, anio, calculado: formatMoneda(fila?.calculatedCommit.total ?? 0, moneda) })}
      icono={SlidersHorizontal}
      ancho={520}
      primario={{ etiqueta: revertir ? t('revertir') : t('guardar'), onClick: () => void guardar(), cargando: guardando, deshabilitada: !valido, motivo: valido ? undefined : t('faltaMotivo') }}
    >
      <div className="space-y-4">
        <FormField etiqueta={t('motivo')} obligatorio>
          {(campo) => <SelectCrm id={campo.id} aria-labelledby={campo.idEtiqueta} valor={motivo} onValorChange={(v) => setMotivo(v as MotivoAjuste)} opciones={opciones} />}
        </FormField>
        {!revertir && (
          <FormField etiqueta={t('nuevoCompromiso')} obligatorio ayuda={delta !== null && delta !== 0 ? t('ayudaDelta', { delta: `${delta > 0 ? '+' : '−'}${formatMoneda(Math.abs(delta), moneda)}` }) : t('ayuda')}>
            <CampoNumero valor={monto} onValorChange={setMonto} minimo={0} decimales={moneda.decimals} prefijo={moneda.code} />
          </FormField>
        )}
        <FormField etiqueta={t('detalle')} obligatorio ayuda={t('ayudaDetalle')}>
          <textarea className={CLASE_AREA} value={detalle} maxLength={2000} onChange={(e) => setDetalle(e.target.value)} />
        </FormField>
        {error && <p role="alert" className="rounded-lg bg-danger-subtle px-3 py-2 text-[13px] text-danger-text">{error}</p>}
      </div>
    </Dialogo>
  );
}
