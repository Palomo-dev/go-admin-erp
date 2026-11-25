'use client';

/**
 * «Autorización requerida» (Logística 1b, Figma «21 Logística» 3159-11672 y 3159-11815).
 *
 * Mismo motor que la excepción de despacho de Transporte: se elige al supervisor (permiso
 * «Autorizar excepción de asignación»), él escribe SU PIN de Recursos humanos (el del kiosco) y se
 * deja el motivo. Todo se valida en la base (`logistica_asignar_domiciliario`): el PIN nunca se
 * compara ni se guarda aquí. Tras 5 PIN fallidos en 15 minutos sobre el PIN de ESE supervisor la
 * base lo bloquea y aquí se muestra hasta qué hora (zona de la organización).
 */
import * as React from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { Lock, ShieldCheck } from 'lucide-react';
import { AvisoTonal, ChipsOpcion, Dialogo } from '@/components/kit';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useFormatDate } from '@/lib/context/OrganizationTimezoneContext';
import { RUTA_ASIGNAR_PIN } from '@/lib/transporte/despachos';
import { MOTIVO_MAX, MOTIVO_MIN, excepcionCompleta, type ResultadoAsignacionRpc } from '@/lib/logistica/vehiculoAsignacion';

export interface AutorizadorAsignacion {
  userId: string;
  nombre: string;
  tienePin: boolean;
}

const MOTIVOS = ['soat_renovado', 'urgente', 'reemplazo', 'otro'] as const;
type Motivo = (typeof MOTIVOS)[number];

export interface DialogoExcepcionAsignacionProps {
  abierto: boolean;
  onCerrar: () => void;
  /** «Asignar con SOAT vencido». */
  accion: string;
  /** «XYZ 34H · SOAT venció el 20 nov 2026». */
  detalle: string;
  /** «2 · WO-000418 y WO-000421». */
  envios: string;
  autorizadores: readonly AutorizadorAsignacion[] | null;
  /** Asigna con la excepción; devuelve el resultado de la base si NO pasó (null si pasó). */
  onAutorizar: (excepcion: { motivo: string; supervisorId: string; pin: string }) => Promise<ResultadoAsignacionRpc | null>;
}

export function DialogoExcepcionAsignacion({ abierto, onCerrar, accion, detalle, envios, autorizadores, onAutorizar }: DialogoExcepcionAsignacionProps) {
  const t = useTranslations('logisticaVehiculo.excepcion');
  const { formatTime } = useFormatDate();
  const [supervisorId, setSupervisorId] = React.useState('');
  const [pin, setPin] = React.useState('');
  const [motivo, setMotivo] = React.useState<Motivo | null>(null);
  const [detalleMotivo, setDetalleMotivo] = React.useState('');
  const [ocupado, setOcupado] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [bloqueadoHasta, setBloqueadoHasta] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!abierto) return;
    setPin('');
    setMotivo(null);
    setDetalleMotivo('');
    setError(null);
    setBloqueadoHasta(null);
    setSupervisorId(autorizadores && autorizadores.length === 1 ? autorizadores[0].userId : '');
  }, [abierto, autorizadores]);

  const supervisor = autorizadores?.find((a) => a.userId === supervisorId) ?? null;
  // Lo que se guarda: la opción elegida y el detalle («Entrega urgente: renovó el SOAT hoy…»).
  const textoMotivo = [motivo ? t(`motivos.${motivo}`) : '', detalleMotivo.trim()].filter(Boolean).join(': ').slice(0, MOTIVO_MAX);
  const completo = !bloqueadoHasta && excepcionCompleta(textoMotivo, pin, true, supervisor);

  const autorizar = async () => {
    if (!supervisor || !completo) return;
    setOcupado(true);
    setError(null);
    try {
      const r = await onAutorizar({ motivo: textoMotivo, supervisorId: supervisor.userId, pin });
      if (!r) return;
      setPin('');
      if (r.estado === 'pin_bloqueado') {
        setBloqueadoHasta(r.hasta ?? '');
        return;
      }
      if (r.estado === 'pin_rechazado') {
        setError(t('errores.pin_rechazado', { n: r.intentosRestantes ?? 0 }));
        if ((r.intentosRestantes ?? 1) <= 0) setBloqueadoHasta('');
        return;
      }
      setError(t.has(`errores.${r.estado}`) ? t(`errores.${r.estado}`) : t('errores.ERROR'));
    } catch {
      setError(t('errores.ERROR'));
    } finally {
      setOcupado(false);
    }
  };

  return (
    <Dialogo
      abierto={abierto}
      onAbiertoChange={(a) => !a && !ocupado && onCerrar()}
      titulo={t('titulo')}
      descripcion={t('subtitulo')}
      icono={ShieldCheck}
      ancho={520}
      primario={{
        etiqueta: t('autorizar'),
        onClick: () => void autorizar(),
        cargando: ocupado,
        deshabilitada: !completo || ocupado,
        motivo: !completo ? t('faltaCompletar', { n: MOTIVO_MIN }) : undefined,
      }}
    >
      <div className="flex flex-col gap-4">
        <dl className="grid grid-cols-[72px_1fr] gap-x-3 gap-y-1 rounded-lg border border-line bg-subtle p-3 text-sm">
          <dt className="text-fg-muted">{t('accion')}</dt>
          <dd className="text-fg">{accion}</dd>
          <dt className="text-fg-muted">{t('detalle')}</dt>
          <dd className="text-fg">{detalle}</dd>
          <dt className="text-fg-muted">{t('envios')}</dt>
          <dd className="text-fg">{envios}</dd>
        </dl>

        <label className="flex flex-col gap-1 text-xs font-semibold uppercase tracking-wide text-fg-muted">
          {t('supervisor')}
          <Select
            value={supervisorId}
            onValueChange={(v) => {
              setSupervisorId(v);
              setPin('');
              setError(null);
              setBloqueadoHasta(null);
            }}
          >
            <SelectTrigger className="h-10 border-line-strong bg-surface text-sm font-normal normal-case tracking-normal text-fg">
              <SelectValue placeholder={autorizadores === null ? t('cargando') : autorizadores.length ? t('eligeSupervisor') : t('sinAutorizadores')} />
            </SelectTrigger>
            <SelectContent>
              {(autorizadores ?? []).map((a) => (
                <SelectItem key={a.userId} value={a.userId}>
                  {a.tienePin ? a.nombre : t('sinPinOpcion', { nombre: a.nombre })}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </label>

        {supervisor && !supervisor.tienePin && (
          <AvisoTonal
            tono="advertencia"
            compacto
            titulo={t('sinPin', { nombre: supervisor.nombre })}
            descripcion={
              <Link href={RUTA_ASIGNAR_PIN} className="font-medium text-brand underline-offset-2 hover:underline">
                {t('irAsignarPin')}
              </Link>
            }
          />
        )}

        {(!supervisor || supervisor.tienePin) && (
          <label className="flex flex-col gap-1 text-xs font-semibold uppercase tracking-wide text-fg-muted">
            {t('pin')}
            <Input
              type="password"
              inputMode="numeric"
              autoComplete="off"
              maxLength={6}
              value={pin}
              disabled={bloqueadoHasta !== null}
              onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
              className="w-48 bg-surface text-base tracking-[0.6em] text-fg"
              aria-describedby="excepcion-pin-ayuda"
            />
            <span id="excepcion-pin-ayuda" className="text-xs font-normal normal-case tracking-normal text-fg-muted">
              {t('pinAyuda', { nombre: supervisor?.nombre ?? t('elSupervisor') })}
            </span>
          </label>
        )}

        {bloqueadoHasta !== null && (
          <div role="alert" className="flex gap-2 rounded-lg border border-line-danger bg-danger-subtle p-3 text-sm text-danger-text">
            <Lock aria-hidden="true" className="mt-0.5 size-4 shrink-0" strokeWidth={1.5} />
            <span>{t('errores.pin_bloqueado', { hora: bloqueadoHasta ? formatTime(bloqueadoHasta) : '—', nombre: supervisor?.nombre ?? '' })}</span>
          </div>
        )}
        {error && bloqueadoHasta === null && <AvisoTonal tono="peligro" rol="alert" compacto titulo={error} />}

        <div className="flex flex-col gap-2">
          <span id="excepcion-motivo" className="text-xs font-semibold uppercase tracking-wide text-fg-muted">
            {t('motivo')} *
          </span>
          <ChipsOpcion<Motivo>
            aria-labelledby="excepcion-motivo"
            opciones={MOTIVOS.map((m) => ({ valor: m, etiqueta: t(`motivos.${m}`) }))}
            valor={motivo}
            onValorChange={setMotivo}
          />
          <label className="flex flex-col gap-1 text-sm text-fg">
            {t('detalleMotivo')}
            <Input value={detalleMotivo} onChange={(e) => setDetalleMotivo(e.target.value.slice(0, 400))} className="bg-surface" />
          </label>
          <span className="text-xs text-fg-muted">{t('motivoMin', { n: MOTIVO_MIN })}</span>
        </div>

        <AvisoTonal tono="informacion" compacto titulo={t('registro')} />
      </div>
    </Dialogo>
  );
}
