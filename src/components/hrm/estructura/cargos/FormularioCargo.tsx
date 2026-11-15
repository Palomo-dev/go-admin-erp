'use client';

/**
 * «Nuevo cargo» y «Editar cargo» (Figma `95-hrm-01-12`): datos del cargo,
 * funciones, competencias con nivel 1-4, escala salarial por sede con
 * vigencia y motivo (solo con el permiso de salario; guardarla queda en el
 * registro de accesos), documentos que exige y, al lado, «Cambios sin
 * guardar». Las funciones se reordenan con «Subir» y «Bajar» (teclado).
 */
import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { AlertTriangle, ArrowDown, ArrowUp, IdCard, Lock, Plus, Save, Trash2 } from 'lucide-react';
import {
  AvisoTonal,
  CampoFecha,
  CampoNumero,
  EmptyState,
  FormField,
  FormSection,
  PageHeader,
  ChipsOpcion,
  Tarjeta,
  clasesBoton,
} from '@/components/kit';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { formatPlainDate } from '@/lib/utils/dateDisplay';
import {
  CLASES_ARL,
  DOCUMENTOS_CARGO,
  NIVELES_CARGO,
  NIVELES_COMPETENCIA,
  cambiosCargo,
  claveSede,
  cuentaErroresCargo,
  datosCargoIniciales,
  medioSugerido,
  payloadCargo,
  romano,
  validarCargo,
  type ErroresCargo,
} from '@/lib/hrm/estructura/logica';
import type { DatosCargo, FilaEscalaForm, RespuestaCargo, TipoCompetencia } from '@/lib/hrm/estructura/tipos';
import { RUTA_CARGOS, RUTA_HRM, pedir, useCarga, useMensajeError, useNivel } from '../comun';

const NINGUNO = '__ninguno__';
const MOTIVOS = ['ajusteAnual', 'mercado', 'nuevoCargo', 'reestructuracion', 'correccion'] as const;
const FECHA: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short', year: 'numeric' };

/** `desde`: «Duplicar cargo» parte del perfil de otro cargo (sin su escala). */
export function FormularioCargo({ id, desde = null }: { id: string | null; desde?: string | null }) {
  const t = useTranslations('hrmEstructura.cargos.formulario');
  const tcg = useTranslations('hrmEstructura.cargos');
  const tc = useTranslations('hrmEstructura.comun');
  const td = useTranslations('hrmEstructura.documentos');
  const tdet = useTranslations('hrmEstructura.cargos.detalle');
  const router = useRouter();
  const nivel = useNivel();
  const mensajeError = useMensajeError();
  const fuente = id ?? desde;
  const { carga, recargar } = useCarga<RespuestaCargo>(fuente ? `/api/hrm/estructura/cargos/${encodeURIComponent(fuente)}` : '/api/hrm/estructura/cargos/opciones');
  const datos = carga.estado === 'listo' ? carga.datos : null;
  const original = id ? datos?.cargo ?? null : null;

  const [form, setForm] = useState<DatosCargo | null>(null);
  const [motivoEscala, setMotivoEscala] = useState<string>('');
  const [intento, setIntento] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [impacto, setImpacto] = useState<{ sede_id: number | null; debajo: number; encima: number }[]>([]);

  const vigentes = useMemo(() => (id ? datos?.escalas?.vigentes ?? [] : []), [datos, id]);
  const ultimaVigencia = useMemo(() => {
    if (!id) return null;
    const fechas = [...(datos?.escalas?.vigentes ?? []), ...(datos?.escalas?.programadas ?? [])].map((e) => e.desde).sort();
    return fechas.length ? fechas[fechas.length - 1] : null;
  }, [datos, id]);
  const puedeEscala = !!datos?.permisos.salario && !!datos?.permisos.salario_editar;

  useEffect(() => {
    if (!datos || form) return;
    const base = datosCargoIniciales(datos.cargo);
    if (!id && desde && datos.cargo) base.nombre = t('copiaDe', { nombre: datos.cargo.nombre });
    if (datos.permisos.salario && datos.permisos.salario_editar) {
      const filas: FilaEscalaForm[] = [null, ...datos.sedes.map((s) => s.id)].map((sede) => {
        const v = id ? datos.escalas?.vigentes.find((e) => e.sede_id === sede) : undefined;
        return { sede_id: sede, minimo: v?.minimo ?? null, medio: v?.medio ?? null, maximo: v?.maximo ?? null };
      });
      base.escala = { desde: '', motivo: '', filas };
    }
    setForm(base);
  }, [datos, form, id, desde, t]);

  const volver = id ? `${RUTA_CARGOS}/${id}` : RUTA_CARGOS;
  const titulo = id ? t('tituloEditar', { nombre: original?.nombre ?? '' }) : t('tituloNuevo');
  const migas = [
    { etiqueta: tc('rrhh'), href: RUTA_HRM },
    { etiqueta: tcg('titulo'), href: RUTA_CARGOS },
    { etiqueta: id ? original?.nombre ?? '…' : t('tituloNuevo') },
  ];
  const sinPermiso = carga.estado === 'sinPermiso' || (datos && !(id ? datos.permisos.editar : datos.permisos.crear));

  const cambiar = (p: Partial<DatosCargo>) => setForm((f) => (f ? { ...f, ...p } : f));
  const formEnvio: DatosCargo | null = form
    ? { ...form, escala: form.escala ? { ...form.escala, motivo: motivoEscala ? t(`motivos.${motivoEscala}`) : '' } : undefined }
    : null;
  const escalaTocada = !!formEnvio?.escala && formEnvio.escala.filas.some((f) => {
    const v = vigentes.find((x) => x.sede_id === f.sede_id);
    return (f.minimo ?? null) !== (v?.minimo ?? null) || (f.medio ?? null) !== (v?.medio ?? null) || (f.maximo ?? null) !== (v?.maximo ?? null);
  });
  // La escala solo se valida (y se envía) si se tocó.
  const paraValidar = formEnvio ? { ...formEnvio, escala: escalaTocada ? formEnvio.escala : undefined } : null;
  const errores: ErroresCargo = paraValidar ? validarCargo(paraValidar, ultimaVigencia) : { escala: {} };
  const nErrores = cuentaErroresCargo(errores);
  const cambios = paraValidar ? cambiosCargo(original, paraValidar, vigentes) : [];
  const mostrar = (campo: keyof ErroresCargo) => (intento ? errores[campo] : undefined);
  const errorEscala = (sede: number | null, campo: 'minimo' | 'medio' | 'maximo') => {
    const e = errores.escala[claveSede(sede)]?.[campo];
    return e && (intento || campo !== 'minimo') ? t(`errores.escala.${e}`) : undefined;
  };
  const nombreSede = (s: number | null) => (s === null ? tdet('todasLasSedes') : datos?.sedes.find((x) => x.id === s)?.nombre ?? '');

  const filasEscalaClave = escalaTocada && id ? JSON.stringify(formEnvio?.escala?.filas ?? []) : '';
  useEffect(() => {
    setImpacto([]);
    if (!filasEscalaClave || !id) return;
    let vigente = true;
    const h = setTimeout(() => {
      pedir<{ sede_id: number | null; debajo: number; encima: number }[]>(`/api/hrm/estructura/cargos/${id}/impacto`, {
        metodo: 'POST',
        cuerpo: { filas: JSON.parse(filasEscalaClave) },
      })
        .then((r) => vigente && setImpacto(r))
        .catch(() => undefined);
    }, 600);
    return () => {
      vigente = false;
      clearTimeout(h);
    };
  }, [filasEscalaClave, id]);

  if (sinPermiso || carga.estado === 'error' || carga.estado === 'noExiste') {
    return (
      <div className="flex flex-col gap-4 p-4 sm:p-6">
        <PageHeader titulo={titulo} variante="form" volverA={volver} icono={IdCard} migas={migas} />
        {sinPermiso ? (
          <EmptyState variante="forbidden" titulo={t('sinPermiso.titulo')} descripcion={t('sinPermiso.descripcion')} accion={{ etiqueta: tc('volver'), href: volver }} />
        ) : carga.estado === 'noExiste' ? (
          <EmptyState variante="empty" icono={IdCard} titulo={tdet('noExiste')} accion={{ etiqueta: tc('volver'), href: RUTA_CARGOS }} />
        ) : (
          <EmptyState variante="error" titulo={tcg('error.titulo')} descripcion={tcg('error.descripcion')} onReintentar={() => void recargar()} />
        )}
      </div>
    );
  }

  const guardar = async () => {
    setIntento(true);
    if (!paraValidar || nErrores > 0) return;
    setGuardando(true);
    try {
      const cuerpo = payloadCargo(paraValidar, vigentes, !!datos?.permisos.arl);
      const r = await pedir<{ id: string }>(id ? `/api/hrm/estructura/cargos/${id}` : '/api/hrm/estructura/cargos', {
        metodo: id ? 'PUT' : 'POST',
        cuerpo,
      });
      toast.success(id ? t('guardado') : t('creado', { nombre: paraValidar.nombre.trim() }));
      router.push(`${RUTA_CARGOS}/${r.id}`);
    } catch (e) {
      toast.error(mensajeError(e));
    } finally {
      setGuardando(false);
    }
  };

  const filaEscala = (f: FilaEscalaForm, i: number) => {
    const set = (campo: 'minimo' | 'medio' | 'maximo', v: number | null) => {
      if (!form?.escala) return;
      const filas = form.escala.filas.map((x, j) => {
        if (j !== i) return x;
        const nueva = { ...x, [campo]: v };
        if (campo !== 'medio' && x.medio === null) nueva.medio = medioSugerido(nueva.minimo, nueva.maximo);
        return nueva;
      });
      cambiar({ escala: { ...form.escala, filas } });
    };
    return (
      <div key={claveSede(f.sede_id)} className="grid gap-3 border-t border-line px-3 py-3 first:border-t-0 sm:grid-cols-[160px_repeat(3,minmax(0,1fr))] sm:items-start">
        <p className="pt-2 text-sm font-medium text-fg">{nombreSede(f.sede_id)}</p>
        {(['minimo', 'medio', 'maximo'] as const).map((campo) => (
          <FormField key={campo} etiqueta={`${t(`escala.${campo}`)} · ${nombreSede(f.sede_id)}`} etiquetaOculta error={errorEscala(f.sede_id, campo)}>
            <CampoNumero valor={f[campo]} onValorChange={(v) => set(campo, v)} decimales={0} minimo={0} prefijo="$" />
          </FormField>
        ))}
      </div>
    );
  };

  return (
    <div className="flex flex-col gap-4 p-4 sm:p-6 lg:gap-5">
      <PageHeader
        titulo={titulo}
        subtitulo={original ? [original.area, tdet('personasEnCargo', { n: original.personas })].filter(Boolean).join(' · ') : t('subtituloNuevo')}
        variante="form"
        volverA={volver}
        icono={IdCard}
        migas={migas}
        cargando={carga.estado === 'cargando'}
        acciones={
          <>
            <button type="button" onClick={() => router.push(volver)} className={clasesBoton({ variante: 'secundario' })}>
              {tc('cancelar')}
            </button>
            <button type="button" onClick={() => void guardar()} disabled={!form || guardando} className={clasesBoton({ variante: 'primario' })}>
              <Save aria-hidden className="size-4" strokeWidth={1.5} />
              {id ? tc('guardarCambios') : t('crear')}
            </button>
          </>
        }
        movil={{
          accion: (
            <button
              type="button"
              onClick={() => void guardar()}
              disabled={!form || guardando}
              className="rounded-lg px-3 py-2 text-sm font-medium text-link hover:bg-hover disabled:opacity-50"
            >
              {tc('guardar')}
            </button>
          ),
        }}
      />

      {!form || !datos ? (
        <div className="flex flex-col gap-4" aria-busy="true">
          <Skeleton className="h-72 rounded-xl" />
          <Skeleton className="h-48 rounded-xl" />
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px] lg:gap-5">
          <div className="flex min-w-0 flex-col gap-4 lg:gap-5">
            <FormSection titulo={t('datos')} columnas={3}>
              <FormField etiqueta={t('nombre')} obligatorio error={mostrar('nombre') ? t('errores.nombre') : undefined}>
                <Input value={form.nombre} maxLength={120} onChange={(e) => cambiar({ nombre: e.target.value })} />
              </FormField>
              <FormField etiqueta={t('area')} obligatorio error={mostrar('area_id') ? t('errores.area') : undefined}>
                {(c) => (
                  <Select value={form.area_id ?? ''} onValueChange={(v) => cambiar({ area_id: v })}>
                    <SelectTrigger id={c.id} aria-labelledby={c.idEtiqueta} aria-invalid={c['aria-invalid']} className="h-10 border-line-strong bg-surface">
                      <SelectValue placeholder={t('elegir')} />
                    </SelectTrigger>
                    <SelectContent>
                      {datos.areas.map((a) => (
                        <SelectItem key={a.id} value={a.id}>
                          {a.nombre}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </FormField>
              <FormField etiqueta={t('nivel')} obligatorio error={mostrar('nivel') ? t('errores.nivel') : undefined}>
                {(c) => (
                  <Select value={form.nivel ? String(form.nivel) : ''} onValueChange={(v) => cambiar({ nivel: Number(v) })}>
                    <SelectTrigger id={c.id} aria-labelledby={c.idEtiqueta} aria-invalid={c['aria-invalid']} className="h-10 border-line-strong bg-surface">
                      <SelectValue placeholder={t('elegir')} />
                    </SelectTrigger>
                    <SelectContent>
                      {NIVELES_CARGO.map((n) => (
                        <SelectItem key={n} value={String(n)}>
                          {nivel(n)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </FormField>
              <div className="grid gap-4 sm:col-span-3 sm:grid-cols-2">
                <FormField etiqueta={t('reportaA')}>
                  {(c) => (
                    <Select value={form.reporta_a_id ?? NINGUNO} onValueChange={(v) => cambiar({ reporta_a_id: v === NINGUNO ? null : v })}>
                      <SelectTrigger id={c.id} aria-labelledby={c.idEtiqueta} className="h-10 border-line-strong bg-surface">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={NINGUNO}>{t('nadie')}</SelectItem>
                        {datos.cargos.map((x) => (
                          <SelectItem key={x.id} value={x.id}>
                            {x.nombre}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                </FormField>
                <FormField etiqueta={t('claseArl')} ayuda={datos.permisos.arl ? t('claseArlAyuda') : t('claseArlSinPermiso')}>
                  {(c) => (
                    <Select
                      value={form.clase_arl ? String(form.clase_arl) : NINGUNO}
                      onValueChange={(v) => cambiar({ clase_arl: v === NINGUNO ? null : Number(v) })}
                      disabled={!datos.permisos.arl}
                    >
                      <SelectTrigger id={c.id} aria-labelledby={c.idEtiqueta} aria-describedby={c['aria-describedby']} className="h-10 border-line-strong bg-surface">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={NINGUNO}>{t('arlPorDefecto')}</SelectItem>
                        {CLASES_ARL.map((n) => (
                          <SelectItem key={n} value={String(n)}>
                            {`${romano(n)} · ${t(`arl.${n}`)}`}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                </FormField>
              </div>
              <div className="sm:col-span-3">
                <FormField etiqueta={t('proposito')}>
                  <Input value={form.proposito ?? ''} maxLength={1000} onChange={(e) => cambiar({ proposito: e.target.value })} />
                </FormField>
              </div>
              <div className="flex flex-col gap-2 sm:col-span-3">
                <p className="text-sm font-medium text-fg">{t('funciones')}</p>
                {form.funciones.map((f, i) => (
                  <div key={i} className="flex items-center gap-2 rounded-lg border border-line px-2 py-1.5">
                    <Input
                      value={f}
                      maxLength={300}
                      aria-label={t('funcionN', { n: i + 1 })}
                      onChange={(e) => cambiar({ funciones: form.funciones.map((x, j) => (j === i ? e.target.value : x)) })}
                      className="border-0 shadow-none focus-visible:ring-1"
                    />
                    <BotonIcono etiqueta={t('subir')} icono={ArrowUp} deshabilitado={i === 0} onClick={() => cambiar({ funciones: mover(form.funciones, i, -1) })} />
                    <BotonIcono etiqueta={t('bajar')} icono={ArrowDown} deshabilitado={i === form.funciones.length - 1} onClick={() => cambiar({ funciones: mover(form.funciones, i, 1) })} />
                    <BotonIcono etiqueta={t('quitarFuncion')} icono={Trash2} onClick={() => cambiar({ funciones: form.funciones.filter((_, j) => j !== i) })} />
                  </div>
                ))}
                {form.funciones.length < 20 && (
                  <button type="button" onClick={() => cambiar({ funciones: [...form.funciones, ''] })} className={clasesBoton({ variante: 'fantasma', tamano: 'sm', className: 'self-start' })}>
                    <Plus aria-hidden className="size-4" strokeWidth={1.5} />
                    {t('agregarFuncion')}
                  </button>
                )}
              </div>
              <div className="grid gap-4 sm:col-span-3 sm:grid-cols-2">
                <FormField etiqueta={t('educacion')}>
                  <Input value={form.educacion ?? ''} maxLength={300} onChange={(e) => cambiar({ educacion: e.target.value })} />
                </FormField>
                <FormField etiqueta={t('experiencia')}>
                  <Input value={form.experiencia ?? ''} maxLength={300} onChange={(e) => cambiar({ experiencia: e.target.value })} />
                </FormField>
              </div>
            </FormSection>

            <FormSection titulo={t('competencias')} descripcion={t('competenciasAyuda')}>
              {form.competencias.length === 0 && <p className="text-sm text-fg-secondary">{t('sinCompetencias')}</p>}
              <ul className="flex flex-col divide-y divide-line">
                {form.competencias.map((k, i) => {
                  const set = (p: Partial<typeof k>) => cambiar({ competencias: form.competencias.map((x, j) => (j === i ? { ...x, ...p } : x)) });
                  return (
                    <li key={i} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center">
                      <Input
                        value={k.nombre}
                        maxLength={120}
                        placeholder={t('competenciaNombre')}
                        aria-label={t('competenciaN', { n: i + 1 })}
                        aria-invalid={intento && k.nombre.trim().length < 2}
                        onChange={(e) => set({ nombre: e.target.value })}
                        className="sm:flex-1"
                      />
                      <div className="flex items-center gap-2">
                        <Select value={k.tipo} onValueChange={(v) => set({ tipo: v as TipoCompetencia })}>
                          <SelectTrigger aria-label={t('competenciaTipo')} className="h-10 w-40 border-line-strong bg-surface">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="tecnica">{tdet('tipos.tecnica')}</SelectItem>
                            <SelectItem value="comportamental">{tdet('tipos.comportamental')}</SelectItem>
                          </SelectContent>
                        </Select>
                        <ChipsOpcion<string>
                          etiqueta={t('competenciaNivel', { nombre: k.nombre || String(i + 1) })}
                          valor={String(k.nivel)}
                          onValorChange={(v) => set({ nivel: Number(v) })}
                          opciones={NIVELES_COMPETENCIA.map((n) => ({ valor: String(n), etiqueta: String(n) }))}
                        />
                        <BotonIcono
                          etiqueta={t('quitarCompetencia')}
                          icono={Trash2}
                          onClick={() => cambiar({ competencias: form.competencias.filter((_, j) => j !== i) })}
                        />
                      </div>
                    </li>
                  );
                })}
              </ul>
              {mostrar('competencias') && <p role="alert" className="text-xs text-danger-text">{t('errores.competencia')}</p>}
              {form.competencias.length < 30 && (
                <button
                  type="button"
                  onClick={() => cambiar({ competencias: [...form.competencias, { nombre: '', tipo: 'tecnica', nivel: 3 }] })}
                  className={clasesBoton({ variante: 'fantasma', tamano: 'sm', className: 'self-start' })}
                >
                  <Plus aria-hidden className="size-4" strokeWidth={1.5} />
                  {t('agregarCompetencia')}
                </button>
              )}
            </FormSection>

            {datos.permisos.salario && (
              <section id="escala" className="scroll-mt-24">
                <FormSection
                  titulo={tdet('escala.titulo')}
                  descripcion={t('escala.ayuda')}
                  accion={
                    <Badge tono="neutro" apariencia="contorno" tamano="sm">
                      {tdet('escala.sensible')}
                    </Badge>
                  }
                >
                  {!puedeEscala || !form.escala ? (
                    <AvisoTonal tono="neutro" icono={Lock} titulo={t('escala.soloLectura')} compacto />
                  ) : (
                    <div className="flex flex-col gap-3">
                      <div className="grid gap-4 sm:grid-cols-2">
                        <FormField
                          etiqueta={t('escala.desde')}
                          obligatorio={escalaTocada}
                          ayuda={ultimaVigencia ? t('escala.desdeAyuda', { fecha: formatPlainDate(ultimaVigencia, FECHA) }) : t('escala.desdeAyudaNueva')}
                          error={escalaTocada && mostrar('escalaFecha') ? t(`errores.escalaFecha.${errores.escalaFecha}`) : undefined}
                        >
                          <CampoFecha
                            valor={form.escala.desde}
                            onValorChange={(d) => form.escala && cambiar({ escala: { ...form.escala, desde: d } })}
                            min={ultimaVigencia ?? undefined}
                          />
                        </FormField>
                        <FormField
                          etiqueta={t('escala.motivo')}
                          obligatorio={escalaTocada}
                          error={escalaTocada && mostrar('escalaMotivo') ? t('errores.escalaMotivo') : undefined}
                        >
                          {(c) => (
                            <Select value={motivoEscala} onValueChange={setMotivoEscala}>
                              <SelectTrigger id={c.id} aria-labelledby={c.idEtiqueta} aria-invalid={c['aria-invalid']} className="h-10 border-line-strong bg-surface">
                                <SelectValue placeholder={t('elegir')} />
                              </SelectTrigger>
                              <SelectContent>
                                {MOTIVOS.map((m) => (
                                  <SelectItem key={m} value={m}>
                                    {t(`motivos.${m}`)}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          )}
                        </FormField>
                      </div>
                      <div className="overflow-hidden rounded-lg border border-line">
                        <div className="hidden bg-subtle px-3 py-2 text-xs font-medium text-fg-secondary sm:grid sm:grid-cols-[160px_repeat(3,minmax(0,1fr))] sm:gap-3">
                          <span>{tdet('escala.sede')}</span>
                          <span>{tdet('escala.minimo')}</span>
                          <span>{tdet('escala.medio')}</span>
                          <span>{tdet('escala.maximo')}</span>
                        </div>
                        {form.escala.filas.map(filaEscala)}
                      </div>
                      <p className="text-xs text-fg-muted">{t('escala.nota')}</p>
                      {impacto.length > 0 && (
                        <AvisoTonal
                          tono="advertencia"
                          icono={AlertTriangle}
                          titulo={impacto
                            .map((x) =>
                              [
                                x.debajo ? t('escala.impactoDebajo', { n: x.debajo, sede: nombreSede(x.sede_id) }) : null,
                                x.encima ? t('escala.impactoEncima', { n: x.encima, sede: nombreSede(x.sede_id) }) : null,
                              ]
                                .filter(Boolean)
                                .join(' ')
                            )
                            .join(' ')}
                          descripcion={t('escala.impactoNota')}
                        />
                      )}
                    </div>
                  )}
                </FormSection>
              </section>
            )}

            <FormSection titulo={t('documentos')} descripcion={t('documentosAyuda')}>
              <ul className="grid gap-2 sm:grid-cols-2">
                {DOCUMENTOS_CARGO.map((d) => (
                  <li key={d}>
                    <label className="flex cursor-pointer items-center gap-3 text-sm text-fg">
                      <Checkbox
                        checked={form.documentos.includes(d)}
                        onCheckedChange={(v) => cambiar({ documentos: v === true ? [...form.documentos, d] : form.documentos.filter((x) => x !== d) })}
                      />
                      {td(d)}
                    </label>
                  </li>
                ))}
              </ul>
            </FormSection>
          </div>

          <div className="lg:sticky lg:top-4 lg:self-start">
            <Tarjeta titulo={t('cambiosTitulo', { n: cambios.length })}>
              <div className="flex flex-col gap-3">
                {cambios.length === 0 ? (
                  <p className="text-sm text-fg-secondary">{t('sinCambios')}</p>
                ) : (
                  <ul className="flex list-disc flex-col gap-1.5 pl-4 text-sm text-fg-secondary">
                    {cambios.map((c, i) => (
                      <li key={i}>
                        {c.tipo === 'escala'
                          ? t('cambio.escala', {
                              sedes: c.sedes.map(nombreSede).join(', '),
                              fecha: c.desde ? formatPlainDate(c.desde, FECHA) : '…',
                            })
                          : c.tipo === 'funcionesNuevas' || c.tipo === 'funcionesQuitadas'
                            ? t(`cambio.${c.tipo}`, { n: c.n })
                            : c.tipo === 'documentoNuevo' || c.tipo === 'documentoQuitado'
                              ? t(`cambio.${c.tipo}`, { documento: td(c.categoria) })
                              : t(`cambio.${c.tipo}`)}
                      </li>
                    ))}
                  </ul>
                )}
                {cambios.some((c) => c.tipo === 'escala') && <AvisoTonal tono="advertencia" icono={Lock} titulo={t('escala.auditoria')} compacto />}
                <button
                  type="button"
                  onClick={() => void guardar()}
                  disabled={guardando || (intento && nErrores > 0)}
                  className={clasesBoton({ variante: 'primario', anchoCompleto: true })}
                >
                  <Save aria-hidden className="size-4" strokeWidth={1.5} />
                  {id ? tc('guardarCambios') : t('crear')}
                </button>
                {intento && nErrores > 0 && (
                  <p role="alert" className="text-xs text-danger-text">
                    {t('corrige', { n: nErrores })}
                  </p>
                )}
              </div>
            </Tarjeta>
          </div>
        </div>
      )}
    </div>
  );
}

function mover<T>(lista: readonly T[], i: number, d: -1 | 1): T[] {
  const j = i + d;
  if (j < 0 || j >= lista.length) return [...lista];
  const copia = [...lista];
  [copia[i], copia[j]] = [copia[j], copia[i]];
  return copia;
}

function BotonIcono({ etiqueta, icono: Icono, onClick, deshabilitado }: { etiqueta: string; icono: typeof Plus; onClick: () => void; deshabilitado?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={deshabilitado}
      aria-label={etiqueta}
      title={etiqueta}
      className="flex size-8 shrink-0 items-center justify-center rounded-md text-fg-secondary hover:bg-hover hover:text-fg disabled:opacity-30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
    >
      <Icono aria-hidden className="size-4" strokeWidth={1.5} />
    </button>
  );
}
