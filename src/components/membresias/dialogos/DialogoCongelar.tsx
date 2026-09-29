'use client';

/**
 * Congelar membresía (Figma C3 985:617462). «Desde» es un día calendario de la organización
 * (hoy = `todayInTz(zona)`), los días se cuentan incluyendo el primero y el vencimiento se corre
 * esos días. Los topes del plan se validan antes de enviar (el botón dice por qué no deja);
 * `fn_membresia_congelar` los valida igual.
 */
import { useEffect, useId, useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Info, Pause } from 'lucide-react';
import { toast } from 'sonner';
import { CampoFecha, CampoNumero, Dialogo, FilaDato, FormField, ListaDatos } from '@/components/kit';
import { Input } from '@/components/ui/input';
import { apiMembresias } from '@/lib/services/membresias/clienteMembresias';
import type { DetalleMembresia } from '@/lib/services/membresias/tipos';
import { todayInTz } from '@/lib/utils/dateCore';
import { useFormatoMembresias } from '../comun/useFormatoMembresias';
import { useMensajeError } from '../comun/useMensajeError';
import { calcularCongelamiento, type BloqueoCongelar } from '../logica';

export interface DialogoCongelarProps {
  abierto: boolean;
  onAbiertoChange: (abierto: boolean) => void;
  detalle: DetalleMembresia;
  onHecho: () => void;
}

const DIAS_POR_DEFECTO = 7;

export function DialogoCongelar({ abierto, onAbiertoChange, detalle, onHecho }: DialogoCongelarProps) {
  const t = useTranslations('membresias.congelar');
  const mensajeError = useMensajeError();
  const { membresia: m, zona, congelamientoUsado } = detalle;
  const f = useFormatoMembresias(zona);
  const idMotivo = useId();
  const idAviso = useId();

  const hoy = todayInTz(zona);
  const topeDias = m.reglas.freezeMaxDays;
  const disponibles = topeDias === null ? null : Math.max(topeDias - congelamientoUsado.dias, 0);

  const [desde, setDesde] = useState(hoy);
  const [dias, setDias] = useState<number | null>(DIAS_POR_DEFECTO);
  const [motivo, setMotivo] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Cada apertura parte de hoy y de lo que el plan deja.
  useEffect(() => {
    if (!abierto) return;
    setDesde(todayInTz(zona));
    setDias(disponibles === null ? DIAS_POR_DEFECTO : Math.max(Math.min(DIAS_POR_DEFECTO, disponibles), 1));
    setMotivo('');
    setError(null);
  }, [abierto, zona, disponibles]);

  const r = useMemo(
    () =>
      calcularCongelamiento({
        desde,
        dias,
        hoy,
        vence: m.hasta,
        zona,
        reglas: m.reglas,
        usado: congelamientoUsado,
      }),
    [desde, dias, hoy, m.hasta, zona, m.reglas, congelamientoUsado],
  );

  const motivoBloqueo = (b: BloqueoCongelar | null): string | undefined => {
    switch (b) {
      case null:
        return undefined;
      case 'congelamiento_tope_dias':
        return t('bloqueo.topeDias', { tope: topeDias ?? 0, quedan: r.disponiblesDias ?? 0 });
      case 'congelamiento_tope_veces':
        return t('bloqueo.topeVeces', { tope: m.reglas.freezeMaxTimes ?? 0 });
      case 'congelamiento_despues_del_vencimiento':
        return t('bloqueo.despuesDelVencimiento', { fecha: f.dia(r.venceActual) });
      case 'congelamiento_en_el_pasado':
        return t('bloqueo.pasado');
      default:
        return t('bloqueo.fechas');
    }
  };
  const bloqueo = motivoBloqueo(r.bloqueo);

  const quedanTexto = [
    r.quedanVeces === null ? t('quedan.vecesSinTope') : t('quedan.veces', { count: r.quedanVeces }),
    r.quedanDias === null ? t('quedan.diasSinTope') : t('quedan.dias', { count: r.quedanDias, tope: topeDias ?? 0 }),
  ].join(' · ');

  const confirmar = async () => {
    if (r.bloqueo || !r.hasta) return;
    setEnviando(true);
    setError(null);
    try {
      await apiMembresias.congelar(m.id, { desde, hasta: r.hasta, motivo: motivo.trim() || null });
      toast.success(desde > hoy ? t('toast.programada', { fecha: f.dia(desde) }) : t('toast.congelada'));
      onAbiertoChange(false);
      onHecho();
    } catch (e) {
      setError(mensajeError(e));
    } finally {
      setEnviando(false);
    }
  };

  return (
    <Dialogo
      abierto={abierto}
      onAbiertoChange={onAbiertoChange}
      titulo={t('titulo', { codigo: m.codigo ?? `#${m.id}` })}
      descripcion={t('descripcion', { cliente: m.cliente.nombre, plan: m.plan.nombre })}
      icono={Pause}
      ancho={520}
      primario={{
        etiqueta: t('confirmar', { count: dias ?? 0 }),
        onClick: confirmar,
        cargando: enviando,
        deshabilitada: !!r.bloqueo,
        motivo: bloqueo,
      }}
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <FormField etiqueta={t('desde')} obligatorio>
          <CampoFecha valor={desde} onValorChange={(d) => setDesde(d)} min={hoy} max={r.venceActual} hoy={hoy} limpiable={false} />
        </FormField>
        <FormField etiqueta={t('dias')} obligatorio>
          <CampoNumero
            valor={dias}
            onValorChange={setDias}
            decimales={0}
            minimo={1}
            maximo={disponibles ?? 365}
            alinear="derecha"
            sufijo={t('sufijoDias')}
            aria-describedby={bloqueo ? idAviso : undefined}
          />
        </FormField>
      </div>

      <ListaDatos etiqueta={t('resumen')}>
        <FilaDato etiqueta={t('vuelve')} valor={r.vuelve ? f.dia(r.vuelve) : '—'} />
        <FilaDato
          etiqueta={t('nuevoVencimiento')}
          tono="fuerte"
          valor={r.nuevoVence ? t('nuevoVencimientoValor', { nuevo: f.dia(r.nuevoVence), antes: f.diaCorto(r.venceActual) }) : '—'}
        />
        <FilaDato etiqueta={t('lesQuedan')} valor={quedanTexto} />
      </ListaDatos>

      <div className="flex flex-col gap-1.5">
        <label htmlFor={idMotivo} className="text-sm font-medium text-fg">
          {t('motivo')}
        </label>
        <Input
          id={idMotivo}
          value={motivo}
          maxLength={500}
          onChange={(e) => setMotivo(e.target.value)}
          placeholder={t('motivoPlaceholder')}
          className="h-10 border-line-strong bg-surface"
        />
      </div>

      {bloqueo ? (
        <p id={idAviso} role="alert" className="flex items-start gap-2 rounded-lg border border-line-warning bg-warning-subtle px-3 py-2 text-sm text-warning-text">
          <Info aria-hidden="true" className="mt-0.5 size-4 shrink-0" strokeWidth={1.5} />
          {bloqueo}
        </p>
      ) : (
        <p className="flex items-start gap-2 rounded-lg border border-line-info bg-info-subtle px-3 py-2 text-sm text-info-text">
          <Info aria-hidden="true" className="mt-0.5 size-4 shrink-0" strokeWidth={1.5} />
          {t('aviso')}
        </p>
      )}

      {error && (
        <p role="alert" className="rounded-lg border border-line-danger bg-danger-subtle px-3 py-2 text-sm text-danger-text">
          {error}
        </p>
      )}
    </Dialogo>
  );
}
