'use client';

/**
 * Revisar una solicitud de RR. HH. (Figma 95-hrm-04-05 y 07-02). Lo usan la
 * bandeja «Mis aprobaciones» y «Ver solicitud» de la ficha. El detalle sale de
 * `GET /api/hrm/aprobaciones/[id]/detalle` (el monto solo a quien tiene el
 * permiso de salario de esa persona; la consulta queda registrada) y la
 * decisión va por `POST /api/hrm/aprobaciones/[id]` (RPC transaccional: nadie
 * aprueba lo propio). Rechazar exige comentario. Los cambios enlazados se
 * aprueban o se rechazan juntos.
 */
import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { ArrowRight, Check, FileText, Lock, XCircle } from 'lucide-react';
import { AvatarIniciales, AvisoTonal, ConfirmDialog, Dialogo, FilaDato, FormField, ListaDatos, Skeleton } from '@/components/kit';
import { Input } from '@/components/ui/input';
import { useFormatDate } from '@/lib/context/OrganizationTimezoneContext';
import { formatNumeroMoneda } from '@/lib/utils/moneda';
import { useMonedaOrganizacion } from '@/lib/hooks/useOrgCurrency';
import { ErrorPersonas, decidirAprobacion, pedir, urlDocumento } from '../personas/apiPersonas';
import { fechaCorta, useValorCampo } from '../personas/textosPersonas';
import { METODOS_SEDE } from '@/lib/hrm/marcacion/metodos';
import { claveTitulo, diferencia, excepcionMarcacion, type Solicitud } from './bandejaLogica';

export interface DialogoRevisarAprobacionProps {
  instanciaId: string | null;
  abierto: boolean;
  onAbiertoChange: (a: boolean) => void;
  onResuelta?: (r: { status: string }) => void;
}

export function DialogoRevisarAprobacion({ instanciaId, abierto, onAbiertoChange, onResuelta }: DialogoRevisarAprobacionProps) {
  const t = useTranslations('hrmPersonas.aprobaciones');
  const th = useTranslations('hrmPersonas.historial');
  const tc = useTranslations('hrmPersonas.comun');
  const { formatDateTime } = useFormatDate();
  const moneda = useMonedaOrganizacion();
  const valorCampo = useValorCampo();
  const [s, setS] = useState<Solicitud | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [comentario, setComentario] = useState('');
  const [enviando, setEnviando] = useState<null | 'aprobar' | 'rechazar' | 'cancelar'>(null);
  const [retirar, setRetirar] = useState(false);

  useEffect(() => {
    if (!abierto || !instanciaId) return;
    setS(null);
    setError(null);
    setComentario('');
    pedir<Solicitud>(`/api/hrm/aprobaciones/${encodeURIComponent(instanciaId)}/detalle`)
      .then(setS)
      .catch((e) => setError(e instanceof ErrorPersonas && e.status === 403 ? t('errores.sin_permiso') : tc('errorCarga')));
  }, [abierto, instanciaId, t, tc]);

  const decidir = async (accion: 'aprobar' | 'rechazar' | 'cancelar') => {
    if (!s) return;
    setEnviando(accion);
    try {
      const r = await decidirAprobacion(s.id, accion, comentario.trim() || null);
      const efecto = s.efecto ? fechaCorta(s.efecto) : '';
      toast.success(
        accion === 'aprobar'
          ? r.status === 'aprobada'
            ? t('resultado.aprobada', { fecha: efecto })
            : t('resultado.siguientePaso')
          : accion === 'rechazar'
            ? t('resultado.rechazada')
            : t('resultado.retirada')
      );
      setRetirar(false);
      onResuelta?.({ status: r.status });
      onAbiertoChange(false);
    } catch (e) {
      const c = e instanceof ErrorPersonas ? e.codigo : '';
      toast.error(['no_puede_aprobar_lo_propio', 'no_eres_aprobador', 'sin_permiso'].includes(c) ? t(`errores.${c}`) : e instanceof ErrorPersonas && e.status === 409 ? t('errores.resuelta') : tc('errorGuardar'));
    } finally {
      setEnviando(null);
    }
  };

  const abrirSoporte = async (id: string) => {
    try {
      const { url } = await urlDocumento(id);
      window.open(url, '_blank', 'noopener,noreferrer');
    } catch {
      toast.error(tc('errorCarga'));
    }
  };

  const titulo = s ? t(`titulos.${claveTitulo(s)}`) : t('revisar');
  const dif = s ? diferencia(s) : null;
  const sensible = !!s?.eventos.some((e) => (e.campo === 'salario' || e.campo === 'periodo_salario') && !e.oculto) || !!s?.cuenta;
  const puedeDecidir = !!s?.puede_decidir;
  // Excepción temporal de marcación (Marcación M0): método, vigencia y motivo, del contexto.
  const excepcion = s ? excepcionMarcacion(s) : null;
  const metodoExcepcion = (m: string) => ((METODOS_SEDE as readonly string[]).includes(m) ? t(`excepcion.metodos.${m}`) : m);

  return (
    <>
      <Dialogo
        abierto={abierto}
        onAbiertoChange={onAbiertoChange}
        titulo={titulo}
        descripcion={
          s
            ? [t('pidio', { nombre: s.solicito ?? '—', fecha: formatDateTime(s.creado) }), s.regla ? t('regla', { nombre: s.regla }) : t('sinRegla')].join(' · ')
            : undefined
        }
        ancho={520}
        primario={
          puedeDecidir
            ? { etiqueta: t('aprobar'), onClick: () => void decidir('aprobar'), cargando: enviando === 'aprobar', deshabilitada: enviando !== null }
            : s?.puede_retirar
              ? { etiqueta: t('retirar'), onClick: () => setRetirar(true), destructiva: true }
              : { etiqueta: tc('cerrar'), onClick: () => onAbiertoChange(false) }
        }
        secundarios={
          puedeDecidir
            ? [
                {
                  etiqueta: t('rechazar'),
                  onClick: () => void decidir('rechazar'),
                  destructiva: true,
                  cargando: enviando === 'rechazar',
                  deshabilitada: !comentario.trim() || enviando !== null,
                  motivo: t('comentarioObligatorio'),
                },
              ]
            : undefined
        }
      >
        {error ? (
          <AvisoTonal tono="peligro" rol="alert" titulo={error} />
        ) : !s ? (
          <div className="flex flex-col gap-3" aria-busy="true">
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-24 w-full" />
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            {sensible && <AvisoTonal tono="advertencia" icono={Lock} compacto titulo={t('sensible')} descripcion={t('registrada')} />}
            {s.persona ? (
              <div className="flex items-center gap-3">
                <AvatarIniciales nombre={s.persona.nombre ?? '?'} />
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-fg">{s.persona.nombre}</p>
                  <p className="truncate text-xs text-fg-secondary">{[s.persona.cargo, s.persona.area, s.persona.sede].filter(Boolean).join(' · ')}</p>
                </div>
              </div>
            ) : null}

            {s.eventos.map((e) => (
              <div key={e.id} className="flex flex-col gap-1.5">
                {s.eventos.length > 1 && <p className="text-xs font-medium text-fg-secondary">{th(`titulos.${e.campo}`)}</p>}
                {e.oculto ? (
                  <p className="flex items-center gap-2 rounded-lg bg-subtle px-3 py-2 text-sm text-fg-secondary">
                    <Lock aria-hidden className="size-4" strokeWidth={1.5} />
                    {th('valorOculto')}
                  </p>
                ) : (
                  <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
                    <div className="rounded-lg bg-subtle px-3 py-2">
                      <p className="text-xs text-fg-secondary">{th('antes')}</p>
                      <p className="text-sm text-fg">{valorCampo(e.campo, e.anterior, e.anterior_nombre)}</p>
                    </div>
                    <ArrowRight aria-hidden className="size-4 text-fg-secondary" strokeWidth={1.5} />
                    <div className="rounded-lg bg-brand-tint px-3 py-2">
                      <p className="text-xs text-brand-deep">{th('ahora')}</p>
                      <p className="text-sm font-medium text-fg">{valorCampo(e.campo, e.nuevo, e.nuevo_nombre)}</p>
                    </div>
                  </div>
                )}
              </div>
            ))}

            {s.cuenta ? (
              <ListaDatos>
                <FilaDato etiqueta={t('banco')} valor={s.cuenta.banco} />
                <FilaDato etiqueta={t('numero')} valor={<span className="tabular-nums">{s.cuenta.numero}</span>} />
              </ListaDatos>
            ) : null}

            <ListaDatos>
              {dif ? (
                <FilaDato
                  etiqueta={t('diferencia')}
                  tono="fuerte"
                  valor={t('diferenciaValor', {
                    monto: `${dif.diferencia >= 0 ? '+ ' : '− '}${formatNumeroMoneda(Math.abs(dif.diferencia), moneda.code)}`,
                    pct: dif.pct != null ? ` (${dif.pct >= 0 ? '+' : ''}${dif.pct.toLocaleString('es-CO')} %)` : '',
                  })}
                />
              ) : null}
              {s.efecto ? <FilaDato etiqueta={t('efecto')} valor={fechaCorta(s.efecto)} /> : null}
              {excepcion?.metodo ? <FilaDato etiqueta={t('excepcion.metodo')} valor={metodoExcepcion(excepcion.metodo)} /> : null}
              {excepcion?.desde && excepcion.hasta ? (
                <FilaDato etiqueta={t('excepcion.vigencia')} valor={t('excepcion.vigenciaValor', { desde: fechaCorta(excepcion.desde), hasta: fechaCorta(excepcion.hasta) })} />
              ) : null}
              {excepcion?.motivo ? <FilaDato etiqueta={t('motivo')} valor={excepcion.motivo} /> : null}
              {s.eventos[0]?.motivo || s.cuenta?.motivo ? <FilaDato etiqueta={t('motivo')} valor={s.eventos[0]?.motivo ?? s.cuenta?.motivo} /> : null}
              {s.en_nombre_de ? <FilaDato etiqueta={t('enNombreDe')} valor={s.en_nombre_de} /> : null}
              {s.estado !== 'pendiente' && s.decision ? (
                <FilaDato etiqueta={t('decision')} valor={t(`decisiones.${s.decision.decision}`, { nombre: s.decision.por ?? '—' })} />
              ) : s.espera && s.espera.length > 0 ? (
                <FilaDato etiqueta={t('espera')} valor={s.espera.join(', ')} />
              ) : null}
            </ListaDatos>
            {s.eventos.length > 1 && <AvisoTonal tono="informacion" compacto titulo={t('enlazados', { n: s.eventos.length })} />}

            {s.nota || s.soporte_documento_id ? (
              <div className="rounded-lg bg-subtle p-3">
                <p className="text-xs text-fg-secondary">{t('notaDe')}</p>
                {s.nota ? <p className="text-sm text-fg">«{s.nota}»</p> : null}
                {s.soporte_documento_id ? (
                  <button type="button" onClick={() => void abrirSoporte(s.soporte_documento_id as string)} className="mt-2 inline-flex items-center gap-1.5 text-sm font-medium text-fg hover:underline">
                    <FileText aria-hidden className="size-4" strokeWidth={1.5} />
                    {t('verSoporte')}
                  </button>
                ) : null}
              </div>
            ) : null}

            {puedeDecidir && (
              <FormField etiqueta={t('comentario')}>
                <Input value={comentario} onChange={(e) => setComentario(e.target.value)} placeholder={t('comentarioObligatorio')} maxLength={2000} className="h-10" />
              </FormField>
            )}
            {s.es_propia && s.estado === 'pendiente' && !puedeDecidir ? <AvisoTonal tono="neutro" compacto icono={Check} titulo={t('propia')} /> : null}
          </div>
        )}
      </Dialogo>
      <ConfirmDialog
        abierto={retirar}
        onAbiertoChange={setRetirar}
        titulo={t('retirarTitulo')}
        descripcion={t('retirarDescripcion')}
        textoConfirmar={t('retirar')}
        tono="peligro"
        icono={XCircle}
        cargando={enviando === 'cancelar'}
        onConfirmar={() => decidir('cancelar')}
      />
    </>
  );
}
