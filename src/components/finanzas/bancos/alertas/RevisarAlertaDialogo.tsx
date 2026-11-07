'use client';

import { useEffect, useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { ShieldAlert } from 'lucide-react';
import { AvisoTonal, Dialogo, DialogoMotivo, FilaDato, FormField, ListaDatos, PanelAdaptable, validarMotivo } from '@/components/kit';
import { useFormatDate } from '@/lib/context/OrganizationTimezoneContext';
import { useMonedaOrganizacion } from '@/lib/hooks/useOrgCurrency';
import { movimientosService } from '@/lib/services/movimientosService';
import {
  movimientoSugeridoParaAnular,
  puedeAnularDuplicado,
  type FilaAlerta,
} from '@/lib/services/integrations/openFinance/alertasBancarias';
import type { PeticionRevision, ResultadoGuardar } from './useAlertasBancarias';
import { cn } from '@/utils/Utils';

/**
 * Revisar alerta (Figma «Diálogo · Marcar alerta como revisada», captura
 * 82-finanzas-r2-02). «Marcar como revisada» guarda autor, fecha y motivo.
 * «Es un duplicado: anular uno» abre el anular movimiento de siempre
 * (`DialogoMotivo` + `movimientosService.cancelMovement`, que registra el
 * movimiento contrario): nunca borra. Con una alerta ya revisada, solo lectura.
 */
export interface RevisarAlertaDialogoProps {
  fila: FilaAlerta | null;
  onCerrar: () => void;
  /** `false` mientras la migración de revisiones no esté aplicada. */
  revisionesDisponibles: boolean;
  guardar: (fila: FilaAlerta, peticion: PeticionRevision) => Promise<ResultadoGuardar>;
  /** Tras anular un movimiento: las alertas y los saldos cambian. */
  onMovimientoAnulado?: () => void;
  /** Etiqueta del tipo y de la cuenta, armadas por la tabla. */
  etiquetaTipo: (fila: FilaAlerta) => string;
  etiquetaCuenta: (fila: FilaAlerta) => string;
}

export function RevisarAlertaDialogo({
  fila,
  onCerrar,
  revisionesDisponibles,
  guardar,
  onMovimientoAnulado,
  etiquetaTipo,
  etiquetaCuenta,
}: RevisarAlertaDialogoProps) {
  const t = useTranslations('finanzasBancosR2');
  const tTes = useTranslations('tesoreria');
  const { formatear } = useMonedaOrganizacion();
  const { formatDateTime, formatPlain, formatDate } = useFormatDate();

  const [texto, setTexto] = useState('');
  const [tocado, setTocado] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [anulando, setAnulando] = useState(false);
  const [anulandoOcupado, setAnulandoOcupado] = useState(false);
  const [errorAnular, setErrorAnular] = useState<string | null>(null);
  const [aAnular, setAAnular] = useState<number | null>(null);

  const clave = fila?.clave ?? null;
  useEffect(() => {
    setTexto('');
    setTocado(false);
    setError(null);
    setAnulando(false);
    setErrorAnular(null);
  }, [clave]);

  const validacion = validarMotivo(texto);
  const errorCampo =
    tocado && !validacion.valido
      ? validacion.error === 'vacio'
        ? t('revisar.errores.motivo_vacio')
        : validacion.error === 'corto'
          ? t('revisar.errores.motivo_corto')
          : t('revisar.errores.motivo_largo')
      : null;

  const textoError = (codigo: string) =>
    t.has(`revisar.errores.${codigo}`) ? t(`revisar.errores.${codigo}`) : t('revisar.errores.desconocido');

  const marcar = async () => {
    if (!fila) return;
    setTocado(true);
    if (!validacion.valido || !revisionesDisponibles) return;
    setGuardando(true);
    setError(null);
    const r = await guardar(fila, { motivo: validacion.limpio, resultado: 'revisada' });
    setGuardando(false);
    if (r.ok) onCerrar();
    else setError(textoError(r.codigo));
  };

  const abrirAnular = () => {
    if (!fila) return;
    setAAnular(movimientoSugeridoParaAnular(fila.movimientos));
    setErrorAnular(null);
    setAnulando(true);
  };

  const confirmarAnular = async (motivo: string) => {
    if (!fila || aAnular === null) return;
    setAnulandoOcupado(true);
    setErrorAnular(null);
    // El anular de siempre: movimiento contrario en la misma cuenta (fn_movimiento_banco_anular).
    const resultado = await movimientosService.cancelMovement({ id: aAnular, source: 'bank' }, motivo);
    if (!resultado.success) {
      setAnulandoOcupado(false);
      const codigo = resultado.codigo ?? 'desconocido';
      setErrorAnular(tTes.has(`errores.${codigo}`) ? tTes(`errores.${codigo}`) : tTes('errores.desconocido'));
      return;
    }
    onMovimientoAnulado?.();
    const r = revisionesDisponibles
      ? await guardar(fila, { motivo, resultado: 'duplicado_anulado', movimientoAnuladoId: aAnular })
      : ({ ok: false, codigo: 'revision_no_disponible' } as const);
    setAnulandoOcupado(false);
    setAnulando(false);
    if (r.ok) {
      onCerrar();
    } else {
      // El movimiento ya quedó anulado: se dice, aunque la revisión no se haya guardado.
      setError(t('anular.anuladoSinRevision', { error: textoError(r.codigo) }));
    }
  };

  const datosAlerta = useMemo(() => {
    if (!fila) return null;
    const d = fila.datos;
    if (fila.tipo === 'balance_discrepancy') {
      return (
        <ListaDatos etiqueta={t('revisar.datos.etiqueta')} divisores>
          <FilaDato etiqueta={t('revisar.datos.saldoGo')} valor={formatear(d.saldoLocal ?? 0)} />
          <FilaDato etiqueta={t('revisar.datos.saldoMovimientos')} valor={formatear(d.saldoCalculado ?? 0)} />
          {d.saldoReal !== null && d.saldoReal !== undefined && (
            <FilaDato etiqueta={t('revisar.datos.saldoBanco')} valor={formatear(d.saldoReal)} />
          )}
          <FilaDato etiqueta={t('revisar.datos.diferencia')} valor={formatear(fila.monto ?? 0)} tono="peligro" separadorAntes />
        </ListaDatos>
      );
    }
    if (fila.tipo === 'duplicate' && fila.movimientos.length > 0) return null;
    return (
      <ListaDatos etiqueta={t('revisar.datos.etiqueta')} divisores>
        {fila.monto !== null && <FilaDato etiqueta={t('revisar.datos.monto')} valor={formatear(fila.monto)} />}
        {d.esperado !== undefined && <FilaDato etiqueta={t('revisar.datos.promedio')} valor={formatear(d.esperado)} />}
        {fila.fecha && (
          <FilaDato
            etiqueta={t('revisar.datos.fecha')}
            valor={fila.fecha.tipo === 'dia' ? formatPlain(fila.fecha.valor) : formatDateTime(fila.fecha.valor)}
          />
        )}
        {fila.transaccionIds.length > 0 && (
          <FilaDato etiqueta={t('revisar.datos.movimiento')} valor={fila.transaccionIds.map((id) => `#${id}`).join(', ')} />
        )}
        {d.descripcion && <FilaDato etiqueta={t('revisar.datos.descripcion')} valor={d.descripcion} />}
      </ListaDatos>
    );
  }, [fila, formatear, formatDateTime, formatPlain, t]);

  const tablaMovimientos =
    fila && fila.movimientos.length > 0 ? (
      <div className="overflow-hidden rounded-lg border border-line">
        <table className="w-full text-sm" aria-label={t('revisar.movimientos.etiqueta')}>
          <thead className="bg-subtle text-left text-[13px] text-fg-secondary">
            <tr>
              <th scope="col" className="px-3 py-2 font-medium">{t('revisar.movimientos.movimiento')}</th>
              <th scope="col" className="px-3 py-2 font-medium">{t('revisar.movimientos.fecha')}</th>
              <th scope="col" className="px-3 py-2 text-right font-medium">{t('revisar.movimientos.monto')}</th>
            </tr>
          </thead>
          <tbody>
            {fila.movimientos.map((m) => (
              <tr key={m.id} className="border-t border-line">
                <td className="px-3 py-2 text-fg">
                  {[m.descripcion?.trim() || t('revisar.movimientos.sinDescripcion', { id: m.id }), m.referencia ? t('revisar.movimientos.referencia', { referencia: m.referencia }) : null]
                    .filter(Boolean)
                    .join(' · ')}
                </td>
                <td className="px-3 py-2 text-fg-secondary">{m.fecha ? formatDateTime(m.fecha) : '—'}</td>
                <td className="px-3 py-2 text-right tabular-nums text-fg">{formatear(m.monto)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    ) : null;

  if (!fila) return null;

  const subtitulo = t('revisar.descripcion', { tipo: etiquetaTipo(fila), cuenta: etiquetaCuenta(fila) });

  // Ya revisada: solo lectura, sin pie de acciones.
  if (fila.revision) {
    const r = fila.revision;
    return (
      <PanelAdaptable abierto onAbiertoChange={(v) => !v && onCerrar()} titulo={t('revisar.ver.titulo')} descripcion={subtitulo} ancho={520}>
        <div className="flex flex-col gap-3">
          {tablaMovimientos}
          {datosAlerta}
          <ListaDatos etiqueta={t('revisar.ver.titulo')} divisores>
            <FilaDato etiqueta={t('revisar.ver.revisadaPor')} valor={r.revisadoPorNombre ?? '—'} />
            <FilaDato etiqueta={t('revisar.ver.fecha')} valor={formatDate(r.revisadoEn)} />
            <FilaDato
              etiqueta={t('revisar.ver.resultado')}
              valor={
                r.resultado === 'duplicado_anulado'
                  ? t('revisar.ver.resultados.duplicado_anulado', { id: r.movimientoAnuladoId ?? '—' })
                  : t('revisar.ver.resultados.revisada')
              }
            />
          </ListaDatos>
          <div className="rounded-lg border border-line bg-subtle px-3 py-2.5">
            <p className="text-[13px] font-medium text-fg">{t('revisar.ver.motivo')}</p>
            <p className="mt-1 whitespace-pre-line text-sm text-fg-secondary">{r.motivo}</p>
          </div>
        </div>
      </PanelAdaptable>
    );
  }

  const anulable = puedeAnularDuplicado(fila);

  return (
    <>
      <Dialogo
        abierto={!anulando}
        onAbiertoChange={(v) => !v && !guardando && onCerrar()}
        titulo={t('revisar.titulo')}
        descripcion={subtitulo}
        ancho={520}
        primario={{
          etiqueta: t('revisar.marcar'),
          onClick: () => void marcar(),
          cargando: guardando,
          deshabilitada: !revisionesDisponibles,
          motivo: revisionesDisponibles ? undefined : t('revisar.sinHistorial'),
        }}
        secundarios={
          anulable
            ? [{ etiqueta: t('revisar.duplicado'), onClick: abrirAnular, deshabilitada: guardando }]
            : undefined
        }
      >
        {!revisionesDisponibles && (
          <AvisoTonal tono="advertencia" compacto titulo={t('alertas.avisoSinHistorial.titulo')} descripcion={t('alertas.avisoSinHistorial.descripcion')} />
        )}
        {tablaMovimientos}
        {datosAlerta}
        <FormField
          etiqueta={t('revisar.campo.etiqueta')}
          obligatorio
          ayuda={t('revisar.campo.ayuda')}
          error={errorCampo}
        >
          <textarea
            rows={2}
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            onBlur={() => setTocado(true)}
            placeholder={t('revisar.campo.placeholder')}
            className="w-full resize-y rounded-lg border border-line-strong bg-surface px-3 py-2 text-sm text-fg placeholder:text-fg-muted focus-visible:border-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/20 aria-[invalid=true]:border-line-danger"
          />
        </FormField>
        {error && (
          <p role="alert" className="text-sm text-danger-text">
            {error}
          </p>
        )}
      </Dialogo>

      <DialogoMotivo
        abierto={anulando}
        onAbiertoChange={(v) => {
          if (!v && !anulandoOcupado) setAnulando(false);
        }}
        titulo={t('anular.titulo')}
        descripcion={t('anular.descripcion')}
        textoConfirmar={t('anular.boton')}
        icono={ShieldAlert}
        cargando={anulandoOcupado}
        error={errorAnular}
        bloqueo={aAnular === null ? t('anular.sinMovimiento') : null}
        onConfirmar={(motivo) => void confirmarAnular(motivo)}
      >
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1 text-[13px] font-medium text-fg">{t('anular.elegir')}</legend>
          {fila.movimientos.map((m) => {
            const activo = aAnular === m.id;
            return (
              <label
                key={m.id}
                className={cn(
                  'flex cursor-pointer items-center gap-3 rounded-lg border px-3 py-2 text-sm',
                  activo ? 'border-line-brand bg-brand-tint' : 'border-line bg-surface hover:bg-hover',
                )}
              >
                <input
                  type="radio"
                  name="movimiento-a-anular"
                  checked={activo}
                  onChange={() => setAAnular(m.id)}
                  className="size-4 accent-brand-action"
                />
                <span className="min-w-0 flex-1 truncate text-fg">
                  {m.descripcion?.trim() || t('revisar.movimientos.sinDescripcion', { id: m.id })}
                  {m.referencia ? ` · ${t('revisar.movimientos.referencia', { referencia: m.referencia })}` : ''}
                </span>
                <span className="shrink-0 text-fg-secondary">{m.fecha ? formatDateTime(m.fecha) : '—'}</span>
                <span className="shrink-0 tabular-nums text-fg">{formatear(m.monto)}</span>
              </label>
            );
          })}
        </fieldset>
      </DialogoMotivo>
    </>
  );
}
