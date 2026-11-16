'use client';

/**
 * Resumen de la ficha (Figma 95-hrm-03-01): datos clave, alertas y
 * vencimientos, últimos cambios, acceso a la app (estado de la invitación del
 * alta; cada empleado es un usuario, revisión 2026-11-15), expediente y jefe.
 * El Resumen nunca muestra el monto del salario (decisión 14).
 */
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { ChevronRight, History } from 'lucide-react';
import { AvatarIniciales, AvisoTonal, BarraProgreso, StatusBadge, Tarjeta } from '@/components/kit';
import { antiguedad, ordenarAlertas, type AlertaEmpleado } from '@/lib/hrm/personas/logica';
import type { ContextoFicha } from './FichaEmpleado';
import { fechaCorta, useNombreCategoria, useTextoAlerta, useValorCampo } from '../textosPersonas';
import { useFormatDate } from '@/lib/context/OrganizationTimezoneContext';

const TONO_ACCESO = {
  activo: 'exito',
  invitacion_pendiente: 'informacion',
  invitacion_vencida: 'advertencia',
  desactivado: 'neutro',
} as const;

export function PestanaResumen({ ficha, irA, verSolicitud }: ContextoFicha) {
  const t = useTranslations('hrmPersonas.resumen');
  const tc = useTranslations('hrmPersonas.comun');
  const th = useTranslations('hrmPersonas.historial');
  const textoAlerta = useTextoAlerta();
  const { formatDate } = useFormatDate();
  const categoria = useNombreCategoria();
  const valorCampo = useValorCampo();
  const v = ficha.vinculo;
  const ant = antiguedad(v?.ingreso, ficha.hoy);
  const alertas = ordenarAlertas(ficha.alertas);
  const programados = ficha.historial.filter((e) => e.programado || e.estado === 'pendiente');
  const ultimos = ficha.historial.filter((e) => e.estado === 'aprobado').slice(0, 3);
  const exigidos = ficha.expediente?.exigidos ?? [];
  const subidos = ficha.expediente?.subidos ?? [];
  const faltan = exigidos.filter((c) => !subidos.includes(c));
  const porVencer = alertas.filter((a) => a.tipo === 'documento_por_vencer' || a.tipo === 'certificacion_por_vencer');
  const acceso = ficha.persona.acceso;
  const fechas = { creada: formatDate(acceso.creada), vence: formatDate(acceso.vence) };
  const textoAcceso =
    acceso.estado === 'activo'
      ? t('accesoTexto.activo')
      : acceso.estado === 'desactivado'
        ? t('accesoTexto.desactivado')
        : acceso.correo
          ? t(`accesoTexto.${acceso.estado}`, { correo: acceso.correo, ...fechas })
          : t(`accesoTexto.${acceso.estado}SinCorreo`, fechas);

  const datos: [string, string][] = [
    [t('cargo'), v?.cargo ?? tc('sinDato')],
    [t('jefe'), ficha.jefe?.nombre ?? tc('sinDato')],
    [t('area'), v?.area ?? tc('sinDato')],
    [t('sede'), v?.sede ?? tc('sinDato')],
    [t('ingreso'), v ? fechaCorta(v.ingreso) : tc('sinDato')],
    [t('antiguedad'), ant ? t('antiguedadValor', { anios: ant.anios, meses: ant.meses }) : '—'],
    [t('contrato'), v?.tipo_contrato ? tc(`contratos.${v.tipo_contrato}`) : tc('sinDato')],
    [t('jornada'), v?.jornada != null ? valorCampo('jornada_horas_semana', v.jornada, null) : tc('sinDato')],
  ];

  const accionAlerta = (a: AlertaEmpleado) => {
    if (a.tipo === 'documentos_faltan' || a.tipo.startsWith('documento')) return { etiqueta: t('accionSubir'), onClick: () => irA('documentos') };
    if (a.tipo.startsWith('certificacion')) return { etiqueta: t('accionVer'), onClick: () => irA('certificaciones') };
    if (a.tipo === 'sin_salario') return { etiqueta: t('accionVer'), onClick: () => irA('salario') };
    return { etiqueta: t('accionVer'), onClick: () => irA('laboral') };
  };

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_380px]">
      <div className="flex min-w-0 flex-col gap-4">
        <Tarjeta titulo={t('datosClave')}>
          <dl className="grid grid-cols-1 gap-x-6 gap-y-4 sm:grid-cols-2 xl:grid-cols-4">
            {datos.map(([k, valor]) => (
              <div key={k} className="min-w-0">
                <dt className="text-xs text-fg-secondary">{k}</dt>
                <dd className="text-sm text-fg">{valor}</dd>
              </div>
            ))}
          </dl>
        </Tarjeta>

        <Tarjeta
          titulo={t('alertas')}
          accion={alertas.length > 0 ? <StatusBadge estado="n" tono="advertencia" etiqueta={String(alertas.length + programados.length)} /> : undefined}
        >
          {alertas.length === 0 && programados.length === 0 ? (
            <p className="text-sm text-fg-secondary">{t('sinAlertas')}</p>
          ) : (
            <div className="flex flex-col gap-2">
              {alertas.map((a, i) => (
                <AvisoTonal
                  key={`${a.tipo}-${a.id ?? i}`}
                  compacto
                  tono={a.nivel === 'peligro' ? 'peligro' : a.nivel === 'advertencia' ? 'advertencia' : 'informacion'}
                  titulo={textoAlerta(a)}
                  accion={accionAlerta(a)}
                />
              ))}
              {programados.map((e) => (
                <AvisoTonal
                  key={e.id}
                  compacto
                  tono="informacion"
                  titulo={
                    e.estado === 'pendiente'
                      ? t('pendiente', { cambio: th(`titulos.${e.campo}`), fecha: fechaCorta(e.desde) })
                      : e.campo === 'salario'
                        ? t('programadoSalario', { fecha: fechaCorta(e.desde) })
                        : t('programado', { cambio: th(`titulos.${e.campo}`), fecha: fechaCorta(e.desde) })
                  }
                  accion={
                    e.estado === 'pendiente' && e.instancia_id
                      ? { etiqueta: t('verSolicitud'), onClick: () => verSolicitud(e.instancia_id as string) }
                      : { etiqueta: t('verHistorial'), onClick: () => irA('historial') }
                  }
                />
              ))}
            </div>
          )}
        </Tarjeta>

        <Tarjeta
          titulo={t('ultimosCambios')}
          accion={
            <button type="button" onClick={() => irA('historial')} className="inline-flex items-center gap-1.5 text-sm font-medium text-fg hover:underline">
              <History aria-hidden className="size-4" strokeWidth={1.5} />
              {t('verHistorial')}
            </button>
          }
        >
          {ultimos.length === 0 ? (
            <p className="text-sm text-fg-secondary">{t('sinCambios')}</p>
          ) : (
            <ul className="flex flex-col divide-y divide-line">
              {ultimos.map((e) => (
                <li key={e.id} className="flex items-start gap-3 py-3 first:pt-0 last:pb-0">
                  <History aria-hidden className="mt-0.5 size-4 shrink-0 text-fg-secondary" strokeWidth={1.5} />
                  <div className="min-w-0">
                    <p className="text-sm text-fg">
                      {e.campo === 'salario' || e.campo === 'periodo_salario'
                        ? `${th(`titulos.${e.campo}`)}${e.programado ? ` · ${th('estados.programado').toLowerCase()}` : ''}`
                        : `${th(`titulos.${e.campo}`)}: ${valorCampo(e.campo, e.anterior, e.anterior_nombre)} → ${valorCampo(e.campo, e.nuevo, e.nuevo_nombre)}`}
                    </p>
                    <p className="text-xs text-fg-secondary">
                      {[th('efecto', { fecha: fechaCorta(e.desde) }), e.aprobo ? th('aprobo', { nombre: e.aprobo }) : null].filter(Boolean).join(' · ')}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Tarjeta>
      </div>

      <div className="flex min-w-0 flex-col gap-4">
        <Tarjeta
          titulo={t('acceso')}
          accion={<StatusBadge estado={acceso.estado} tono={TONO_ACCESO[acceso.estado]} etiqueta={t(`accesoEstados.${acceso.estado}`)} />}
        >
          <p className="text-sm text-fg-secondary">{textoAcceso}</p>
        </Tarjeta>

        <Tarjeta
          titulo={t('expediente')}
          pie={
            <button type="button" onClick={() => irA('documentos')} className="text-sm font-medium text-fg hover:underline">
              {t('irDocumentos')}
            </button>
          }
        >
          <BarraProgreso
            valor={exigidos.length - faltan.length}
            max={Math.max(exigidos.length, 1)}
            etiqueta={t('exigidos')}
            textoValor={t('deN', { n: exigidos.length - faltan.length, total: exigidos.length })}
            tono={faltan.length === 0 ? 'exito' : 'advertencia'}
          />
          {faltan.length > 0 || porVencer.length > 0 ? (
            <p className="mt-3 text-sm text-fg-secondary">
              {[
                faltan.length > 0 ? t('falta', { lista: faltan.map(categoria).join(', ') }) : null,
                porVencer.length > 0 ? t('porVencer', { lista: porVencer.map((a) => a.nombre ?? categoria(a.categoria ?? '')).join(', ') }) : null,
              ]
                .filter(Boolean)
                .join(' ')}
            </p>
          ) : null}
        </Tarjeta>

        {ficha.jefe ? (
          <Tarjeta titulo={t('jefeInmediato')}>
            {ficha.jefe.persona_id ? (
              <Link href={`/app/hrm/empleados/${ficha.jefe.persona_id}`} className="flex items-center gap-3 rounded-lg p-1 hover:bg-hover">
                <AvatarIniciales nombre={ficha.jefe.nombre ?? '?'} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-fg">{ficha.jefe.nombre}</p>
                  <p className="truncate text-xs text-fg-secondary">{[ficha.jefe.cargo, ficha.jefe.sede].filter(Boolean).join(' · ')}</p>
                </div>
                <ChevronRight aria-hidden className="size-4 text-fg-secondary" strokeWidth={1.5} />
              </Link>
            ) : (
              <p className="text-sm text-fg">{ficha.jefe.nombre}</p>
            )}
          </Tarjeta>
        ) : null}
      </div>
    </div>
  );
}
