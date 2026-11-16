'use client';

/**
 * Salario y pago (Figma 95-hrm-03-05, 05b y 14). Grupo protegido: sin permiso,
 * `EmptyState` forbidden. Con permiso, cada lectura (salario, cuenta y el
 * número completo) queda registrada y se ve en «Últimas consultas» (decisión 8).
 * El cambio de cuenta pasa por aprobación (decisión 7). La posición en la
 * escala salarial la pone el frente «Estructura» cuando existan las escalas.
 */
import { useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { Eye, History, Landmark, Lock, XCircle } from 'lucide-react';
import {
  AvisoTonal,
  ConfirmDialog,
  Dialogo,
  EmptyState,
  FilaDato,
  FormField,
  ListaDatos,
  Skeleton,
  StatusBadge,
  Tarjeta,
  clasesBoton,
  type ColumnaTabla,
} from '@/components/kit';
import { TablaSubseccion } from '@/components/kit/TablaSubseccion';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useFormatDate } from '@/lib/context/OrganizationTimezoneContext';
import { ErrorPersonas, decidirAprobacion, pedir, useCarga } from '../apiPersonas';
import { fechaCorta, useValorCampo } from '../textosPersonas';
import type { ContextoFicha } from './FichaEmpleado';

interface EventoSalario {
  id: string;
  employment_id: string;
  campo: string;
  desde: string;
  anterior: unknown;
  nuevo: unknown;
  motivo: string;
  estado: 'pendiente' | 'aprobado' | 'rechazado' | 'anulado';
}
interface DatosSalario {
  historial: EventoSalario[];
  vigente: { employment_id: string; salario: unknown; periodo: unknown }[];
}
interface Cuenta {
  id: string;
  banco: string;
  tipo: string;
  numero: string;
  titular: string | null;
  principal: boolean;
}
interface DatosBanco {
  cuentas: Cuenta[];
  solicitud_pendiente: { id: string; banco: string; numero: string; instancia_id: string | null; creado: string; solicito: string | null } | null;
  editar: boolean;
  completo: boolean;
}
interface Consulta {
  id: number;
  actor: string | null;
  cargo: string | null;
  en: string;
  grupo: string;
  numero_completo: boolean;
}

export function PestanaSalario({ ficha, registrarCambio, verSolicitud, recargar: recargarFicha }: ContextoFicha) {
  const t = useTranslations('hrmPersonas.salario');
  const tc = useTranslations('hrmPersonas.comun');
  const th = useTranslations('hrmPersonas.historial');
  const valorCampo = useValorCampo();
  const { formatDateTime } = useFormatDate();
  const g = ficha.permisos.grupos;
  const base = `/api/hrm/personas/${ficha.persona.id}`;
  const salario = useCarga<DatosSalario>(g.salario_pago.ver ? `${base}/datos/salario_pago` : null);
  const banco = useCarga<DatosBanco>(g.banco.ver ? `${base}/banco` : null);
  const consultas = useCarga<{ consultas: Consulta[] }>(g.salario_pago.ver ? `${base}/consultas` : null);
  const [completo, setCompleto] = useState<DatosBanco | null>(null);
  const [retirar, setRetirar] = useState<string | null>(null);
  const [retirando, setRetirando] = useState(false);
  const [cuentaNueva, setCuentaNueva] = useState(false);

  const vinculo = ficha.vinculo?.id;
  const eventos = useMemo(
    () => (salario.carga.estado === 'listo' ? salario.carga.datos.historial.filter((e) => e.campo === 'salario' && e.employment_id === vinculo) : []),
    [salario.carga, vinculo]
  );

  if (!g.salario_pago.ver || salario.carga.estado === 'sinPermiso') {
    return (
      <EmptyState
        variante="forbidden"
        titulo={t('sinPermiso.titulo')}
        descripcion={t('sinPermiso.descripcion')}
      />
    );
  }
  if (salario.carga.estado === 'error' || salario.carga.estado === 'noExiste') {
    return <EmptyState variante="error" titulo={tc('errorCarga')} onReintentar={() => void salario.recargar()} />;
  }
  if (salario.carga.estado === 'cargando') return <Skeleton className="h-64 w-full" />;

  const vigente = salario.carga.datos.vigente.find((x) => x.employment_id === vinculo);
  const monto = vigente?.salario != null ? Number(vigente.salario) : null;
  const vigenteEv = eventos.filter((e) => e.estado === 'aprobado' && e.desde <= ficha.hoy).sort((a, b) => b.desde.localeCompare(a.desde))[0];
  const pendiente = eventos.find((e) => e.estado === 'pendiente');
  const programado = eventos.filter((e) => e.estado === 'aprobado' && e.desde > ficha.hoy).sort((a, b) => a.desde.localeCompare(b.desde))[0];
  const eventoFicha = (id?: string) => ficha.historial.find((h) => h.id === id);
  const estadoFila = (e: EventoSalario): string =>
    e.estado === 'aprobado' ? (e.desde > ficha.hoy ? 'programado' : e.id === vigenteEv?.id ? 'vigente' : 'reemplazado') : e.estado === 'anulado' ? 'anulado' : e.estado;
  const tonoFila = (s: string) =>
    s === 'vigente' ? 'exito' : s === 'programado' ? 'informacion' : s === 'pendiente' ? 'advertencia' : s === 'rechazado' ? 'peligro' : 'neutro';

  const columnas: ColumnaTabla<EventoSalario>[] = [
    { id: 'efecto', encabezado: t('columnas.efecto'), celda: (e) => <span className="whitespace-nowrap tabular-nums">{fechaCorta(e.desde)}</span> },
    { id: 'salario', encabezado: t('columnas.salario'), variante: 'importe', celda: (e) => valorCampo('salario', e.nuevo, null) },
    { id: 'motivo', encabezado: t('columnas.motivo'), ocultarDebajo: 'md', celda: (e) => <span className="truncate">{e.motivo}</span> },
    {
      id: 'estado',
      encabezado: t('columnas.estado'),
      celda: (e) => {
        const s = estadoFila(e);
        return <StatusBadge estado={s} tono={tonoFila(s)} etiqueta={th(`estados.${s}`)} />;
      },
    },
  ];

  const retirarSolicitud = async () => {
    if (!retirar) return;
    setRetirando(true);
    try {
      await decidirAprobacion(retirar, 'cancelar', null);
      toast.success(t('solicitudRetirada'));
      setRetirar(null);
      void salario.recargar();
      void recargarFicha();
    } catch {
      toast.error(tc('errorGuardar'));
    } finally {
      setRetirando(false);
    }
  };

  const mostrarCompleto = async () => {
    try {
      setCompleto(await pedir<DatosBanco>(`${base}/banco?mostrar=1`));
      void consultas.recargar();
    } catch {
      toast.error(tc('errorCarga'));
    }
  };

  const datosBanco = completo ?? (banco.carga.estado === 'listo' ? banco.carga.datos : null);
  const cuenta = datosBanco?.cuentas.find((c) => c.principal) ?? datosBanco?.cuentas[0] ?? null;
  const fPendiente = eventoFicha(pendiente?.id);

  return (
    <div className="flex flex-col gap-4">
      <AvisoTonal tono="advertencia" icono={Lock} titulo={t('sensible')} descripcion={t('registrada')} />
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_400px]">
        <div className="flex min-w-0 flex-col gap-4">
          <Tarjeta
            titulo={t('vigente')}
            accion={
              g.salario_pago.editar && ficha.vinculo?.estado !== 'retirado' ? (
                <button
                  type="button"
                  disabled={!!pendiente}
                  title={pendiente ? t('yaPendiente') : undefined}
                  onClick={() => registrarCambio('salario')}
                  className={clasesBoton({ variante: 'secundario', tamano: 'sm' })}
                >
                  <History aria-hidden className="size-4" strokeWidth={1.5} />
                  {t('registrarCambio')}
                </button>
              ) : undefined
            }
          >
            {monto != null ? (
              <>
                <p className="flex flex-wrap items-baseline gap-2">
                  <span className="text-3xl font-semibold tabular-nums text-fg">{valorCampo('salario', monto, null)}</span>
                  <span className="text-sm text-fg-secondary">
                    {[tc(`periodos.${String(vigente?.periodo ?? ficha.vinculo?.periodo_salario ?? 'monthly')}`).toLowerCase(), vigenteEv ? t('desde', { fecha: fechaCorta(vigenteEv.desde) }) : null]
                      .filter(Boolean)
                      .join(' · ')}
                  </span>
                </p>
                <dl className="mt-4 grid gap-4 sm:grid-cols-2">
                  <div>
                    <dt className="text-xs text-fg-secondary">{t('periodicidad')}</dt>
                    <dd className="text-sm text-fg">{tc(`periodos.${String(vigente?.periodo ?? ficha.vinculo?.periodo_salario ?? 'monthly')}`)}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-fg-secondary">{t('auxilio')}</dt>
                    <dd className="text-sm text-fg">{t('auxilioValor')}</dd>
                  </div>
                </dl>
              </>
            ) : (
              <AvisoTonal tono="advertencia" compacto titulo={t('sinSalario')} />
            )}
          </Tarjeta>

          {pendiente || programado ? (
            <Tarjeta
              titulo={pendiente ? t('pendienteTitulo') : t('programadoTitulo')}
              accion={<StatusBadge estado="x" tono={pendiente ? 'advertencia' : 'exito'} etiqueta={pendiente ? th('estados.pendiente') : t('aprobado')} />}
            >
              {(() => {
                const e = (pendiente ?? programado) as EventoSalario;
                const f = eventoFicha(e.id);
                return (
                  <>
                    <AvisoTonal
                      tono={pendiente ? 'advertencia' : 'informacion'}
                      titulo={t('cambioDesde', { monto: valorCampo('salario', e.nuevo, null), fecha: fechaCorta(e.desde) })}
                      descripcion={
                        pendiente
                          ? t('pidio', { nombre: f?.registro ?? '—', fecha: f ? formatDateTime(f.creado) : '—', espera: (f?.espera ?? []).join(', ') || '—' })
                          : t('aprobo', { motivo: e.motivo, nombre: f?.aprobo ?? '—' })
                      }
                    />
                    <p className="mt-3 text-sm text-fg-secondary">
                      {pendiente
                        ? t('mientras', { monto: valorCampo('salario', monto, null) })
                        : t('comoLiquida', { antes: valorCampo('salario', monto, null), despues: valorCampo('salario', e.nuevo, null), fecha: fechaCorta(e.desde) })}
                    </p>
                    {pendiente && fPendiente?.instancia_id ? (
                      <div className="mt-3 flex flex-wrap gap-2">
                        <button type="button" onClick={() => verSolicitud(fPendiente.instancia_id as string)} className={clasesBoton({ variante: 'secundario', tamano: 'sm' })}>
                          <Eye aria-hidden className="size-4" strokeWidth={1.5} />
                          {t('verSolicitud')}
                        </button>
                        <button type="button" onClick={() => setRetirar(fPendiente.instancia_id)} className={clasesBoton({ variante: 'fantasma', tamano: 'sm' })}>
                          <XCircle aria-hidden className="size-4" strokeWidth={1.5} />
                          {t('retirar')}
                        </button>
                      </div>
                    ) : null}
                  </>
                );
              })()}
            </Tarjeta>
          ) : null}

          <TablaSubseccion titulo={t('historial')} columnas={columnas} filas={eventos} obtenerId={(e) => e.id} densidad="compacta" vacio={{ titulo: t('sinHistorial') }} />
        </div>

        <div className="flex min-w-0 flex-col gap-4">
          <Tarjeta titulo={t('pago')} accion={g.banco.ver ? <StatusBadge estado="sensible" tono="advertencia" apariencia="contorno" icono={Lock} etiqueta={tc('sensible')} /> : undefined}>
            {!g.banco.ver || banco.carga.estado === 'sinPermiso' ? (
              <EmptyState variante="forbidden" compacto titulo={t('bancoSinPermiso')} />
            ) : banco.carga.estado === 'cargando' ? (
              <Skeleton className="h-32 w-full" />
            ) : !datosBanco ? (
              <EmptyState variante="error" compacto titulo={tc('errorCarga')} onReintentar={() => void banco.recargar()} />
            ) : (
              <div className="flex flex-col gap-3">
                {cuenta ? (
                  <ListaDatos>
                    <FilaDato etiqueta={t('banco')} valor={cuenta.banco} />
                    <FilaDato etiqueta={t('tipoCuenta')} valor={t(`tiposCuenta.${cuenta.tipo}`)} />
                    <FilaDato etiqueta={t('titular')} valor={cuenta.titular ?? t('mismoEmpleado')} />
                    <FilaDato
                      etiqueta={t('numero')}
                      valor={<span className="tabular-nums">{cuenta.numero}</span>}
                      accesorio={
                        datosBanco.completo ? undefined : (
                          <button type="button" onClick={() => void mostrarCompleto()} className={clasesBoton({ variante: 'secundario', tamano: 'sm' })}>
                            <Eye aria-hidden className="size-4" strokeWidth={1.5} />
                            {t('mostrar')}
                          </button>
                        )
                      }
                    />
                  </ListaDatos>
                ) : (
                  <p className="text-sm text-fg-secondary">{t('sinCuenta')}</p>
                )}
                {cuenta && !datosBanco.completo ? <p className="text-xs text-warning-text">{t('mostrarRegistra')}</p> : null}
                {datosBanco.solicitud_pendiente ? (
                  <AvisoTonal
                    tono="advertencia"
                    compacto
                    titulo={t('cuentaPendiente', { banco: datosBanco.solicitud_pendiente.banco, numero: datosBanco.solicitud_pendiente.numero })}
                    accion={
                      datosBanco.solicitud_pendiente.instancia_id
                        ? { etiqueta: t('verSolicitud'), onClick: () => verSolicitud(datosBanco.solicitud_pendiente?.instancia_id as string) }
                        : undefined
                    }
                  />
                ) : datosBanco.editar ? (
                  <button type="button" onClick={() => setCuentaNueva(true)} className={clasesBoton({ variante: 'secundario', className: 'w-full' })}>
                    <Landmark aria-hidden className="size-4" strokeWidth={1.5} />
                    {t('cambiarCuenta')}
                  </button>
                ) : null}
              </div>
            )}
          </Tarjeta>

          <Tarjeta titulo={t('ultimasConsultas')}>
            {consultas.carga.estado === 'cargando' ? (
              <Skeleton className="h-24 w-full" />
            ) : consultas.carga.estado !== 'listo' || consultas.carga.datos.consultas.length === 0 ? (
              <p className="text-sm text-fg-secondary">{t('sinConsultas')}</p>
            ) : (
              <ul className="flex flex-col divide-y divide-line">
                {consultas.carga.datos.consultas.map((c) => (
                  <li key={c.id} className="py-2.5 first:pt-0 last:pb-0">
                    <p className="text-sm text-fg">
                      {[c.actor, c.numero_completo ? t('vioNumero') : c.cargo].filter(Boolean).join(' · ')}
                    </p>
                    <p className="text-xs text-fg-muted">{formatDateTime(c.en)}</p>
                  </li>
                ))}
              </ul>
            )}
          </Tarjeta>
        </div>
      </div>

      <ConfirmDialog
        abierto={retirar !== null}
        onAbiertoChange={(a) => !a && setRetirar(null)}
        titulo={t('retirarTitulo')}
        descripcion={t('retirarDescripcion')}
        textoConfirmar={t('retirar')}
        tono="peligro"
        icono={XCircle}
        cargando={retirando}
        onConfirmar={retirarSolicitud}
      />
      {cuentaNueva && (
        <DialogoCuenta
          personaId={ficha.persona.id}
          nombre={ficha.persona.nombre}
          onCerrar={() => setCuentaNueva(false)}
          onEnviada={() => {
            setCuentaNueva(false);
            setCompleto(null);
            void banco.recargar();
          }}
        />
      )}
    </div>
  );
}

function DialogoCuenta({ personaId, nombre, onCerrar, onEnviada }: { personaId: string; nombre: string; onCerrar: () => void; onEnviada: () => void }) {
  const t = useTranslations('hrmPersonas.salario');
  const tc = useTranslations('hrmPersonas.comun');
  const [f, setF] = useState({ bank_name: '', account_type: 'savings', account_number: '', holder_name: '', nota: '' });
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const enviar = async () => {
    setEnviando(true);
    setError(null);
    try {
      const r = await pedir<{ status: string }>(`/api/hrm/personas/${personaId}/banco`, { metodo: 'POST', cuerpo: { ...f, motivo: t('motivoCuenta') } });
      toast.success(r.status === 'pendiente' ? t('cuentaEnviada') : t('cuentaGuardada'));
      onEnviada();
    } catch (e) {
      setError(e instanceof ErrorPersonas && e.codigo === 'cambio_pendiente' ? t('cuentaYaPendiente') : tc('errorGuardar'));
    } finally {
      setEnviando(false);
    }
  };
  return (
    <Dialogo
      abierto
      onAbiertoChange={(a) => !a && onCerrar()}
      titulo={t('cambiarCuentaTitulo')}
      descripcion={nombre}
      ancho={520}
      icono={Landmark}
      primario={{
        etiqueta: t('enviarAprobacion'),
        onClick: () => void enviar(),
        cargando: enviando,
        deshabilitada: !f.bank_name.trim() || !/^[0-9 -]{4,30}$/.test(f.account_number.trim()),
      }}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField etiqueta={t('banco')} obligatorio>
          <Input value={f.bank_name} onChange={(e) => setF({ ...f, bank_name: e.target.value })} className="h-10" />
        </FormField>
        <FormField etiqueta={t('tipoCuenta')} obligatorio>
          {(c) => (
            <Select value={f.account_type} onValueChange={(v) => setF({ ...f, account_type: v })}>
              <SelectTrigger id={c.id} aria-labelledby={c.idEtiqueta} className="h-10 border-line-strong bg-surface">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {['savings', 'checking', 'deposito_electronico'].map((x) => (
                  <SelectItem key={x} value={x}>
                    {t(`tiposCuenta.${x}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </FormField>
        <FormField etiqueta={t('numero')} obligatorio>
          <Input value={f.account_number} onChange={(e) => setF({ ...f, account_number: e.target.value })} inputMode="numeric" className="h-10" />
        </FormField>
        <FormField etiqueta={t('titular')} ayuda={t('titularAyuda')}>
          <Input value={f.holder_name} onChange={(e) => setF({ ...f, holder_name: e.target.value })} className="h-10" />
        </FormField>
        <FormField etiqueta={t('notaAprobador')} className="sm:col-span-2">
          <Input value={f.nota} onChange={(e) => setF({ ...f, nota: e.target.value })} className="h-10" />
        </FormField>
      </div>
      <AvisoTonal className="mt-4" tono="informacion" compacto titulo={t('cuentaAprobacion')} />
      {error && <AvisoTonal className="mt-3" tono="peligro" rol="alert" titulo={error} />}
    </Dialogo>
  );
}
