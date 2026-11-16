'use client';

/**
 * Detalle de una incapacidad, licencia o permiso (Figma 20.14.3 y 20.14.4,
 * `96-hrm-f2-14-03-*` y `14-04-*`). Cabecera de «Editar rol»: migas, «←» y acciones.
 *
 * Decisión 2: con el permiso de salud se ven el diagnóstico, quién expidió, el soporte
 * y los tramos de pago, y cada lectura del diagnóstico queda registrada (la pide
 * `/api/hrm/ausencias/[id]/salud`). Sin él, RR. HH. ve el estado y el tipo; el jefe,
 * «ausencia justificada». Lo decide la base (`nivel`).
 */
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { Download, FileText, Lock, Plus, Upload } from 'lucide-react';
import {
  AvisoTonal,
  DataTable,
  EmptyState,
  FilaDato,
  ListaDatos,
  PageHeader,
  RowActionsMenu,
  Skeleton,
  StatusBadge,
  Tarjeta,
  clasesBoton,
  type ColumnaTabla,
} from '@/components/kit';
import { Badge } from '@/components/ui/badge';
import { useFormatDate } from '@/lib/context/OrganizationTimezoneContext';
import { addPlainDays } from '@/lib/utils/dateCore';
import { TIPOS_DOCUMENTO_PERMITIDOS } from '@/lib/services/hrm/tipos';
import { ErrorPersonas, urlDocumento, useCarga } from '../personas/apiPersonas';
import { leerSalud, subirSoporte, type DetalleSalud } from './apiAusencias';
import { diasDelTramo, esPagador, estadoVisible, porcentaje, type DetalleAusencia as Detalle, type TramoPago } from './ausenciasLogica';
import { DialogoRegistrarAusencia, type PrellenadoRegistro } from './DialogoRegistrarAusencia';
import { useTipoAusencia } from './IncapacidadesVista';
import { EstadoAusencia, RUTA_AUSENCIAS, useFechas } from './piezasAusencias';
import { claveError } from './useSimulacion';

export function DetalleAusencia({ id }: { id: string }) {
  const t = useTranslations('hrmAusencias.detalle');
  const ta = useTranslations('hrmAusencias');
  const tc = useTranslations('hrmPersonas.comun');
  const te = useTranslations('hrmAusencias');
  const router = useRouter();
  const f = useFechas();
  const tipoDe = useTipoAusencia();
  const { formatDateTime, getToday } = useFormatDate();
  const { carga, recargar } = useCarga<Detalle>(`/api/hrm/ausencias/${encodeURIComponent(id)}`);
  const [salud, setSalud] = useState<DetalleSalud | null | 'error'>(null);
  const [prorroga, setProrroga] = useState<PrellenadoRegistro | null>(null);
  const entrada = useRef<HTMLInputElement>(null);
  const hoy = getToday();

  const d = carga.estado === 'listo' ? carga.datos : null;
  const conSalud = !!d?.permisos.salud;
  useEffect(() => {
    if (!conSalud) return;
    let vigente = true;
    leerSalud(id)
      .then((s) => vigente && setSalud(s))
      .catch(() => vigente && setSalud('error'));
    return () => {
      vigente = false;
    };
  }, [conSalud, id]);

  const volver = `${RUTA_AUSENCIAS}?seccion=${d?.seccion ?? 'incapacidades'}`;
  const migas = [
    { etiqueta: tc('migas.rrhh'), href: '/app/hrm/empleados' },
    { etiqueta: ta('titulo'), href: volver },
    ...(d ? [{ etiqueta: d.nombre ?? '—' }] : []),
  ];

  if (!d) {
    const variante = carga.estado === 'sinPermiso' ? 'forbidden' : carga.estado === 'cargando' ? null : 'error';
    return (
      <div className="flex flex-col gap-4 p-4 sm:p-6 lg:gap-5">
        <PageHeader variante="form" titulo={ta('titulo')} volverA={volver} migas={migas} cargando={carga.estado === 'cargando'} />
        {variante === null ? (
          <div className="grid gap-4 lg:grid-cols-[2fr_1fr]">
            <Skeleton className="h-56 w-full rounded-xl" />
            <Skeleton className="h-40 w-full rounded-xl" />
          </div>
        ) : (
          <EmptyState
            variante={variante}
            titulo={carga.estado === 'noExiste' ? t('noExiste') : variante === 'forbidden' ? t('sinPermiso') : t('error')}
            accion={variante === 'forbidden' || carga.estado === 'noExiste' ? { etiqueta: t('volver'), href: volver } : undefined}
            onReintentar={variante === 'error' && carga.estado !== 'noExiste' ? () => void recargar() : undefined}
          />
        )}
      </div>
    );
  }

  const tipo = tipoDe(d);
  const e = estadoVisible({ ...d, aprobacion: d.aprobacion }, hoy);
  const sensible = d.sensible;
  const incapacidad = d.clase === 'incapacidad_comun' || d.clase === 'incapacidad_laboral';
  const viva = d.estado === 'requested' || d.estado === 'approved' || d.estado === 'taken';
  const corto = d.nivel === 'justificada' ? t('justificadaCorto') : incapacidad ? t('incapacidadCorto') : (tipo.titulo ?? '').toLowerCase();
  const estadoTexto =
    e === 'en_curso'
      ? t('ausenteRegresa', { clase: corto, dia: f.diaSemana(d.regresa) })
      : e === 'terminada' || e === 'disfrutada'
        ? t('regreso', { dia: f.diaSemana(d.regresa) })
        : e === 'aprobada'
          ? t('empieza', { dia: f.diaSemana(d.desde) })
          : ta(`estados.${e}`);
  const subtitulo = [
    f.rango(d.desde, d.hasta),
    d.cuenta === 'habiles' ? t('nHabiles', { n: f.dias(d.dias_habiles) }) : t('nDias', { n: f.dias(d.dias_calendario) }),
    d.clase === 'incapacidad_comun' ? t('origenComun') : d.clase === 'incapacidad_laboral' ? t('origenLaboral') : null,
    d.cargo,
    d.area,
  ]
    .filter(Boolean)
    .join(' · ');
  const oculto = t('oculto');
  const diag = d.nivel !== 'completo' || !sensible ? null : salud === null ? '…' : salud === 'error' ? t('noSePudoLeer') : [salud.diagnostico_codigo, salud.diagnostico].filter(Boolean).join(' · ') || t('sinDiagnostico');
  const entidad = d.nivel !== 'completo' || !sensible ? null : salud && salud !== 'error' ? salud.entidad || '—' : '…';

  const subir = async (archivo: File | null) => {
    if (entrada.current) entrada.current.value = '';
    if (!archivo || !d.persona_id) return;
    try {
      await subirSoporte(d.id, d.persona_id, d.vinculo_id, archivo);
      toast.success(t('soporteSubido'));
      void recargar();
    } catch (err) {
      toast.error(err instanceof ErrorPersonas && err.status === 403 ? t('soporteSinPermiso') : te(`errores.${claveError(err instanceof ErrorPersonas ? err.codigo : null)}`));
    }
  };
  const abrirSoporte = async () => {
    if (!d.soporte?.id) return;
    try {
      const { url } = await urlDocumento(d.soporte.id);
      window.open(url, '_blank', 'noopener,noreferrer');
    } catch {
      toast.error(t('noSePudoAbrir'));
    }
  };

  const pago = (paga: string | null) => (esPagador(paga) ? ta(`pagadores.nombres.${paga}`) : paga ?? ta('pagadores.nombres.ninguno'));
  const columnasTramos: ColumnaTabla<TramoPago>[] = [
    {
      id: 'dias',
      encabezado: t('tramos.dias'),
      celda: (x) => {
        const r = diasDelTramo(x);
        return <span className="tabular-nums">{r ? (r.hasta === r.desde + 1 ? t('tramos.diasY', { a: r.desde, b: r.hasta }) : r.hasta === r.desde ? String(r.desde) : t('tramos.diasA', { a: r.desde, b: r.hasta })) : f.dias(x.dias)}</span>;
      },
    },
    { id: 'paga', encabezado: t('tramos.paga'), celda: (x) => pago(x.paga) },
    { id: 'porcentaje', encabezado: t('tramos.porcentaje'), alinear: 'derecha', celda: (x) => <span className="tabular-nums">{porcentaje(x.fraccion, f.locale)}</span> },
    { id: 'fechas', encabezado: t('tramos.fechas'), celda: (x) => f.rangoCorto(x.desde, x.hasta) },
  ];

  const acciones = (
    <>
      {incapacidad && viva && d.permisos.gestionar ? (
        <button
          type="button"
          className={clasesBoton({ variante: 'secundario', tamano: 'md' })}
          onClick={() =>
            setProrroga({
              vinculo_id: d.vinculo_id,
              persona_id: d.persona_id,
              nombre: d.nombre,
              origen: d.clase === 'incapacidad_laboral' ? 'laboral' : 'comun',
              prorroga_de: d.id,
              desde: addPlainDays(d.hasta, 1),
            })
          }
        >
          <Plus aria-hidden className="size-4" strokeWidth={1.5} />
          {t('agregarProrroga')}
        </button>
      ) : null}
      {viva && d.permisos.gestionar && d.nivel === 'completo' && d.persona_id ? (
        <button type="button" className={clasesBoton({ variante: d.soporte_estado === 'falta' ? 'primario' : 'secundario', tamano: 'md' })} onClick={() => entrada.current?.click()}>
          <Upload aria-hidden className="size-4" strokeWidth={1.5} />
          {d.soporte ? t('reemplazarSoporte') : t('subirSoporte')}
        </button>
      ) : null}
    </>
  );

  return (
    <div className="flex flex-col gap-4 p-4 sm:p-6 lg:gap-5">
      <PageHeader
        variante="form"
        titulo={`${tipo.titulo} · ${d.nombre ?? '—'}`}
        subtitulo={subtitulo}
        volverA={volver}
        migas={migas}
        badge={
          <span className="inline-flex items-center gap-2">
            <EstadoAusencia fila={d} hoy={hoy} />
            {sensible && d.nivel === 'completo' ? (
              <Badge tono="neutro" apariencia="contorno" tamano="sm" icono={Lock}>
                {ta('sensible')}
              </Badge>
            ) : null}
          </span>
        }
        acciones={acciones}
        movil={{ titulo: tipo.titulo, subtitulo: `${d.nombre ?? '—'} · ${f.rangoCorto(d.desde, d.hasta)}` }}
      />
      <input ref={entrada} type="file" accept={TIPOS_DOCUMENTO_PERMITIDOS.join(',')} className="sr-only" tabIndex={-1} aria-hidden onChange={(ev) => void subir(ev.target.files?.[0] ?? null)} />

      {sensible ? (
        d.nivel === 'completo' && !d.propio ? (
          <AvisoTonal tono="informacion" icono={Lock} titulo={t('avisoSalud.titulo')} descripcion={t('avisoSalud.descripcion')} />
        ) : d.nivel === 'tipo' ? (
          <AvisoTonal tono="informacion" icono={Lock} titulo={t('avisoSinSalud.titulo')} descripcion={t('avisoSinSalud.descripcion')} />
        ) : d.nivel === 'justificada' ? (
          <AvisoTonal tono="informacion" icono={Lock} titulo={t('avisoJefe.titulo')} descripcion={t('avisoJefe.descripcion')} />
        ) : null
      ) : null}

      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <div className="flex min-w-0 flex-col gap-4">
          <Tarjeta titulo={t('datos')}>
            <ListaDatos>
              <FilaDato etiqueta={t('estado')} tono="fuerte" valor={estadoTexto} />
              <FilaDato etiqueta={t('tipo')} valor={[tipo.titulo, tipo.detalle].filter(Boolean).join(' · ')} />
              {sensible && d.nivel !== 'justificada' ? (
                <>
                  <FilaDato etiqueta={t('diagnostico')} valor={diag ?? oculto} />
                  <FilaDato etiqueta={t('expidio')} valor={entidad ?? oculto} />
                </>
              ) : null}
              {d.motivo ? <FilaDato etiqueta={t('motivo')} valor={d.motivo} /> : null}
              {d.fecha_parto ? <FilaDato etiqueta={t('fechaParto')} valor={f.corta(d.fecha_parto)} /> : null}
              {d.prorroga_de ? <FilaDato etiqueta={t('prorrogaDe')} valor={t('esProrroga')} href={`${RUTA_AUSENCIAS}/${d.prorroga_de}`} tono="enlace" /> : null}
              <FilaDato etiqueta={t('turnos')} valor={d.turnos_afectados ? t('turnosJustificados', { n: d.turnos_afectados }) : t('sinTurnos')} />
              <FilaDato etiqueta={t('registro')} valor={`${d.registro.por ?? '—'} · ${formatDateTime(d.registro.en)}`} />
            </ListaDatos>
          </Tarjeta>

          {d.tramos && d.tramos.length > 0 ? (
            <section className="flex flex-col gap-2" aria-labelledby="tramos-pago">
              <h2 id="tramos-pago" className="text-base font-semibold text-fg">
                {t('tramos.titulo')}
              </h2>
              <DataTable etiqueta={t('tramos.titulo')} columnas={columnasTramos} filas={d.tramos} obtenerId={(x) => `${x.desde}-${x.paga}`} estado="listo" densidad="compacta" />
            </section>
          ) : null}
        </div>

        {d.nivel !== 'justificada' ? (
          <Tarjeta titulo={t('soporte.titulo')}>
            {d.soporte && !d.soporte.restringido ? (
              <article className="flex flex-col gap-3 rounded-xl border border-line p-4">
                <div className="flex items-start gap-3">
                  <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-brand-tint text-brand">
                    <FileText aria-hidden className="size-4" strokeWidth={1.5} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-fg">{d.soporte.nombre}</p>
                    <p className="text-xs text-fg-secondary">{t('soporte.detalle', { kb: Math.max(1, Math.round((d.soporte.tamano ?? 0) / 1024)) })}</p>
                  </div>
                  <RowActionsMenu titulo={d.soporte.nombre} acciones={[{ id: 'ver', etiqueta: t('soporte.ver'), icono: Download, onSelect: () => void abrirSoporte() }]} />
                </div>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm text-fg-secondary">{t('soporte.salud')}</span>
                  <StatusBadge estado="sin_vencimiento" tono="neutro" etiqueta={d.soporte.vence ? t('soporte.vence', { fecha: f.corta(d.soporte.vence) }) : t('soporte.sinVencimiento')} />
                </div>
                {d.soporte.creado ? <p className="text-xs text-fg-muted">{t('soporte.subido', { fecha: formatDateTime(d.soporte.creado), nombre: d.soporte.subio ?? '—' })}</p> : null}
              </article>
            ) : d.soporte?.restringido ? (
              <article className="flex flex-col gap-3 rounded-xl border border-line p-4">
                <div className="flex items-start gap-3">
                  <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-warning-subtle text-warning-text">
                    <Lock aria-hidden className="size-4" strokeWidth={1.5} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-fg">{t('soporte.restringidoTitulo')}</p>
                    <p className="text-xs text-fg-secondary">{t('soporte.soloConPermiso')}</p>
                  </div>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm text-fg-secondary">{t('soporte.salud')}</span>
                  <StatusBadge estado="restringido" tono="neutro" etiqueta={t('soporte.restringido')} />
                </div>
                <p className="text-xs text-warning-text">{t('soporte.sinPermisoSalud')}</p>
              </article>
            ) : (
              <p className="text-sm text-fg-secondary">{d.soporte_estado === 'falta' ? t('soporte.falta') : t('soporte.noRequiere')}</p>
            )}
          </Tarjeta>
        ) : null}
      </div>

      <DialogoRegistrarAusencia abierto={!!prorroga} onAbiertoChange={(a) => !a && setProrroga(null)} hoy={hoy} datos={null} prellenado={prorroga} onHecho={() => router.push(volver)} />
    </div>
  );
}
