'use client';

/**
 * Decisión sustentada para un período con varias vigencias (P8 del Contador,
 * ronda 2): muestra las vigencias que tocan el período y la historia de
 * decisiones (quién, cuándo, fundamento, alcance, y si sigue aplicando o se
 * reabrió porque cambiaron las vigencias), y permite registrar una nueva a quien
 * tiene `finance.approve`. Nada se edita ni se borra: una decisión nueva queda
 * encima de la anterior.
 */
import { useEffect, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { Dialogo, FormField, StatusBadge } from '@/components/kit';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { SelectNativo } from '@/components/finanzas/tesoreria/compartido/TesoreriaComun';
import { useFormatDate } from '@/lib/context/OrganizationTimezoneContext';
import { etiquetaPeriodo } from '@/lib/finanzas/tributario/periodos';
import { tributarioCliente, type CentroCliente } from '../tributarioCliente';
import { codigoDe } from '../piezas';

type Fila = CentroCliente['filas'][number];

export function DecisionPeriodoDialogo({
  fila,
  nombre,
  puedeDecidir,
  onAbiertoChange,
  onRegistrada,
}: {
  fila: Fila | null;
  nombre: string;
  puedeDecidir: boolean;
  onAbiertoChange: (abierto: boolean) => void;
  onRegistrada: () => void;
}) {
  const t = useTranslations('finanzasTributarioR4.centro.decision');
  const tp = useTranslations('finanzasTributarioR4.perfil');
  const tc = useTranslations('finanzasTributarioR4.comun');
  const locale = useLocale();
  const { formatPlain, formatDateTime } = useFormatDate();
  const [decision, setDecision] = useState('');
  const [fundamento, setFundamento] = useState('');
  const [alcance, setAlcance] = useState('');
  const [vigenciaId, setVigenciaId] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);

  useEffect(() => {
    if (fila) {
      setDecision('');
      setFundamento('');
      setAlcance('');
      setVigenciaId('');
      setError(null);
    }
  }, [fila]);

  if (!fila) return null;
  const vigencias = fila.vigenciasPeriodo ?? [];
  const historia = fila.decisiones ?? [];
  const completo = decision.trim().length >= 3 && fundamento.trim().length >= 3 && alcance.trim().length >= 3;

  const rango = (desde: string, hasta: string | null) => (hasta ? tp('vigencia.rango', { desde: formatPlain(desde), hasta: formatPlain(hasta) }) : tp('vigencia.desde', { desde: formatPlain(desde) }));

  const registrar = async () => {
    if (!completo) return;
    setGuardando(true);
    setError(null);
    try {
      await tributarioCliente.registrarDecision({
        obligacion: fila.obligacion.id,
        desde: fila.obligacion.periodo.desde,
        hasta: fila.obligacion.periodo.hasta,
        decision: decision.trim(),
        fundamento: fundamento.trim(),
        alcance: alcance.trim(),
        vigenciaAplicadaId: vigenciaId || null,
      });
      onRegistrada();
      onAbiertoChange(false);
    } catch (err) {
      const codigo = codigoDe(err);
      setError(t.has(`errores.${codigo}`) ? t(`errores.${codigo}`) : t('errores.desconocido'));
    } finally {
      setGuardando(false);
    }
  };

  return (
    <Dialogo
      abierto={!!fila}
      onAbiertoChange={onAbiertoChange}
      titulo={t('titulo')}
      descripcion={`${nombre} · ${etiquetaPeriodo(fila.obligacion.periodo, locale)}`}
      ancho={672}
      primario={
        puedeDecidir
          ? { etiqueta: t('registrar'), onClick: () => void registrar(), cargando: guardando, deshabilitada: !completo, motivo: completo ? undefined : t('faltanCampos') }
          : { etiqueta: tc('cerrar'), onClick: () => onAbiertoChange(false) }
      }
      textoCancelar={tc('cancelar')}
    >
      <div className="space-y-5">
        <section className="space-y-1">
          <h3 className="text-sm font-medium text-fg">{t('vigencias')}</h3>
          <ul className="list-disc space-y-0.5 pl-4 text-sm text-fg-secondary">
            {vigencias.map((v) => (
              <li key={v.id}>
                {rango(v.vigenteDesde, v.vigenteHasta)}: {v.regimenRenta ? tp(`regimenRenta.${v.regimenRenta}`) : tp('campos.sinDefinir')} ·{' '}
                {v.condicionIva ? tp(`condicionIva.${v.condicionIva}`) : tp('campos.sinDefinir')} · {tp(`periodicidadIva.${v.periodicidadIva}`)}
              </li>
            ))}
          </ul>
        </section>

        <section className="space-y-2">
          <h3 className="text-sm font-medium text-fg">{t('historia')}</h3>
          {historia.length === 0 ? (
            <p className="text-sm text-fg-secondary">{t('sinHistoria')}</p>
          ) : (
            <ol className="space-y-2">
              {historia.map((d, i) => (
                <li key={d.id} className="rounded-lg border border-line p-3 text-sm">
                  <div className="flex flex-wrap items-center gap-2">
                    <StatusBadge
                      estado={d.aplica ? 'aplica' : 'reabierta'}
                      etiqueta={i > 0 ? t('reemplazada') : d.aplica ? t('aplica') : t('reabierta')}
                      tono={i > 0 ? 'neutro' : d.aplica ? 'exito' : 'advertencia'}
                    />
                    <span className="text-xs text-fg-secondary">{t('quienCuando', { quien: d.decididoPorNombre ?? t('usuario'), cuando: formatDateTime(d.decididoEn) })}</span>
                  </div>
                  <p className="mt-2 text-fg">{d.decision}</p>
                  <p className="mt-1 text-xs text-fg-secondary">
                    {t('fundamento')}: {d.fundamento}
                  </p>
                  <p className="text-xs text-fg-secondary">
                    {t('alcance')}: {d.alcance}
                  </p>
                </li>
              ))}
            </ol>
          )}
        </section>

        {puedeDecidir && (
          <section className="space-y-3">
            <h3 className="text-sm font-medium text-fg">{t('nueva')}</h3>
            <FormField etiqueta={t('vigenciaAplicada')} ayuda={t('vigenciaAplicadaAyuda')}>
              {(c) => (
                <SelectNativo
                  id={c.id}
                  valor={vigenciaId}
                  vacio={t('sinVigencia')}
                  onCambiar={setVigenciaId}
                  opciones={vigencias.map((v) => ({ valor: v.id, etiqueta: rango(v.vigenteDesde, v.vigenteHasta) }))}
                />
              )}
            </FormField>
            <FormField etiqueta={t('decision')} obligatorio>
              {(c) => <Textarea id={c.id} value={decision} onChange={(e) => setDecision(e.target.value)} rows={2} maxLength={2000} />}
            </FormField>
            <FormField etiqueta={t('fundamento')} obligatorio ayuda={t('fundamentoAyuda')}>
              {(c) => <Textarea id={c.id} value={fundamento} onChange={(e) => setFundamento(e.target.value)} rows={2} maxLength={2000} />}
            </FormField>
            <FormField etiqueta={t('alcance')} obligatorio ayuda={t('alcanceAyuda')}>
              {(c) => <Input id={c.id} value={alcance} onChange={(e) => setAlcance(e.target.value)} maxLength={1000} />}
            </FormField>
            <p className="text-xs text-fg-secondary">{t('reabre')}</p>
          </section>
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
