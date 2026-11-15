'use client';

/**
 * Nueva área y «Editar área» (Figma `95-hrm-01-11`): datos del área, sedes
 * donde opera (las de la organización: se eligen, no se crean) y, al lado,
 * «Qué afecta» y «Archivar área». Las plazas no se cambian aquí: van por
 * «Plazas» con una solicitud aprobada.
 */
import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { Archive, Network, Info, Save } from 'lucide-react';

import {
  AvisoTonal,
  ConfirmDialog,
  EmptyState,
  FilaDato,
  FormField,
  FormSection,
  ListaDatos,
  PageHeader,
  Tarjeta,
  clasesBoton,
} from '@/components/kit';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { construirOrganigrama, subarbolIds, vacantesDe, type AreaArbol } from '@/lib/hrm/estructura/logica';
import type { DatosArea, RespuestaAreas } from '@/lib/hrm/estructura/tipos';
import { RUTA_AREAS, RUTA_HRM, pedir, useCarga, useMensajeError } from '../comun';

const NINGUNO = '__ninguno__';

export function FormularioArea({ id }: { id: string | null }) {
  const t = useTranslations('hrmEstructura.areas.formulario');
  const ta = useTranslations('hrmEstructura.areas');
  const tc = useTranslations('hrmEstructura.comun');
  const router = useRouter();
  const mensajeError = useMensajeError();
  const { carga, recargar } = useCarga<RespuestaAreas>('/api/hrm/estructura/areas');
  const datos = carga.estado === 'listo' ? carga.datos : null;
  const area = id && datos ? datos.areas.find((a) => a.id === id) ?? null : null;

  const [form, setForm] = useState<DatosArea | null>(null);
  const [errores, setErrores] = useState<{ nombre?: string }>({});
  const [guardando, setGuardando] = useState(false);
  const [archivar, setArchivar] = useState(false);

  useEffect(() => {
    if (!datos || form) return;
    setForm({
      nombre: area?.nombre ?? '',
      parent_id: area?.parent_id ?? null,
      responsable_id: area?.responsable?.id ?? null,
      centro_costo_id: area?.centro_costo?.id ?? null,
      descripcion: area?.descripcion ?? '',
      sedes: area?.sedes ?? [],
    });
  }, [datos, area, form]);

  const nodo = useMemo(() => {
    if (!datos || !id) return null;
    let hallado: AreaArbol | null = null;
    const buscar = (n: AreaArbol) => {
      if (n.area.id === id) hallado = n;
      else n.hijos.forEach(buscar);
    };
    construirOrganigrama(datos.areas).forEach(buscar);
    return hallado as AreaArbol | null;
  }, [datos, id]);
  const excluidas = useMemo(() => (datos && id ? subarbolIds(datos.areas, id) : new Set<string>()), [datos, id]);

  const volver = id ? `${RUTA_AREAS}?area=${encodeURIComponent(id)}` : RUTA_AREAS;
  const titulo = id ? t('tituloEditar', { nombre: area?.nombre ?? '' }) : t('tituloNueva');
  const migas = [
    { etiqueta: tc('rrhh'), href: RUTA_HRM },
    { etiqueta: ta('titulo'), href: RUTA_AREAS },
    { etiqueta: id ? area?.nombre ?? '…' : t('tituloNueva') },
  ];

  if (carga.estado === 'sinPermiso' || (datos && !datos.permisos.gestionar)) {
    return (
      <div className="flex flex-col gap-4 p-4 sm:p-6">
        <PageHeader titulo={titulo} variante="form" volverA={volver} icono={Network} migas={migas} />
        <EmptyState variante="forbidden" titulo={t('sinPermiso.titulo')} descripcion={t('sinPermiso.descripcion')} accion={{ etiqueta: tc('volver'), href: volver }} />
      </div>
    );
  }
  if (carga.estado === 'error' || (datos && id && !area)) {
    return (
      <div className="flex flex-col gap-4 p-4 sm:p-6">
        <PageHeader titulo={titulo} variante="form" volverA={volver} icono={Network} migas={migas} />
        <EmptyState
          variante="error"
          titulo={datos && id && !area ? t('noExiste') : ta('error.titulo')}
          descripcion={ta('error.descripcion')}
          onReintentar={() => void recargar()}
        />
      </div>
    );
  }

  const cambiar = (p: Partial<DatosArea>) => setForm((f) => (f ? { ...f, ...p } : f));
  const cambiaPadre = !!area && form !== null && (form.parent_id ?? null) !== (area.parent_id ?? null);
  const plazasDe = (sede: number) => area?.plazas.find((p) => p.sede_id === sede);
  const tienePlazas = !!area && area.plazas.some((p) => (p.aprobadas ?? 0) > 0);
  const motivoArchivar =
    nodo && nodo.personasTotal > 0
      ? t('archivar.conPersonas')
      : tienePlazas
        ? t('archivar.conPlazas')
        : nodo && nodo.hijos.length > 0
          ? t('archivar.conHijas')
          : null;

  const guardar = async () => {
    if (!form) return;
    if (form.nombre.trim().length < 2) {
      setErrores({ nombre: t('errores.nombre') });
      return;
    }
    setErrores({});
    setGuardando(true);
    try {
      const r = await pedir<{ id: string }>(id ? `/api/hrm/estructura/areas/${id}` : '/api/hrm/estructura/areas', {
        metodo: id ? 'PUT' : 'POST',
        cuerpo: { ...form, nombre: form.nombre.trim() },
      });
      toast.success(id ? t('guardada') : t('creada', { nombre: form.nombre.trim() }));
      router.push(`${RUTA_AREAS}?area=${encodeURIComponent(r.id)}`);
    } catch (e) {
      toast.error(mensajeError(e));
    } finally {
      setGuardando(false);
    }
  };

  const confirmarArchivo = async () => {
    if (!id) return;
    try {
      await pedir(`/api/hrm/estructura/areas/${id}`, { metodo: 'DELETE', cuerpo: {} });
      toast.success(t('archivar.hecho', { nombre: area?.nombre ?? '' }));
      router.push(RUTA_AREAS);
    } catch (e) {
      toast.error(mensajeError(e));
    } finally {
      setArchivar(false);
    }
  };

  const subtitulo =
    area && nodo
      ? [
          area.parent_id ? ta('detalle.areaDe', { area: datos?.areas.find((x) => x.id === area.parent_id)?.nombre ?? '' }) : ta('detalle.areaPrincipal'),
          ta('personas', { n: nodo.personasTotal }),
          t('cargos', { n: area.cargos.length }),
        ].join(' · ')
      : t('subtituloNueva');

  return (
    <div className="flex flex-col gap-4 p-4 sm:p-6 lg:gap-5">
      <PageHeader
        titulo={titulo}
        subtitulo={subtitulo}
        variante="form"
        volverA={volver}
        icono={Network}
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
          <Skeleton className="h-64 rounded-xl" />
          <Skeleton className="h-40 rounded-xl" />
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_340px] lg:gap-5">
          <div className="flex min-w-0 flex-col gap-4 lg:gap-5">
            <FormSection titulo={t('datos')} columnas={2}>
              <FormField etiqueta={t('nombre')} obligatorio error={errores.nombre}>
                <Input value={form.nombre} maxLength={120} onChange={(e) => cambiar({ nombre: e.target.value })} />
              </FormField>
              <FormField etiqueta={t('areaSuperior')} ayuda={t('areaSuperiorAyuda')}>
                {(c) => (
                  <Select value={form.parent_id ?? NINGUNO} onValueChange={(v) => cambiar({ parent_id: v === NINGUNO ? null : v })}>
                    <SelectTrigger id={c.id} aria-labelledby={c.idEtiqueta} aria-describedby={c['aria-describedby']} className="h-10 border-line-strong bg-surface">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={NINGUNO}>{t('sinAreaSuperior')}</SelectItem>
                      {datos.areas
                        .filter((a) => !excluidas.has(a.id))
                        .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'))
                        .map((a) => (
                          <SelectItem key={a.id} value={a.id}>
                            {a.nombre}
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                )}
              </FormField>
              <FormField etiqueta={t('responsable')} ayuda={t('responsableAyuda')}>
                {(c) => (
                  <Select value={form.responsable_id ?? NINGUNO} onValueChange={(v) => cambiar({ responsable_id: v === NINGUNO ? null : v })}>
                    <SelectTrigger id={c.id} aria-labelledby={c.idEtiqueta} aria-describedby={c['aria-describedby']} className="h-10 border-line-strong bg-surface">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={NINGUNO}>{t('sinResponsable')}</SelectItem>
                      {datos.responsables.map((r) => (
                        <SelectItem key={r.id} value={r.id}>
                          {[r.nombre ?? t('sinNombre'), r.cargo].filter(Boolean).join(' · ')}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </FormField>
              <FormField etiqueta={t('centroCostos')}>
                {(c) => (
                  <Select value={form.centro_costo_id ?? NINGUNO} onValueChange={(v) => cambiar({ centro_costo_id: v === NINGUNO ? null : v })}>
                    <SelectTrigger id={c.id} aria-labelledby={c.idEtiqueta} className="h-10 border-line-strong bg-surface">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={NINGUNO}>{t('sinCentroCostos')}</SelectItem>
                      {datos.centros.map((cc) => (
                        <SelectItem key={cc.id} value={cc.id}>
                          {`${cc.codigo} ${cc.nombre}`}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </FormField>
              <div className="sm:col-span-2">
                <FormField etiqueta={t('descripcion')}>
                  <Input value={form.descripcion ?? ''} maxLength={500} onChange={(e) => cambiar({ descripcion: e.target.value })} />
                </FormField>
              </div>
            </FormSection>

            <FormSection titulo={t('sedes')} descripcion={t('sedesAyuda')}>
              {datos.sedes.length === 0 ? (
                <p className="text-sm text-fg-secondary">{t('sinSedes')}</p>
              ) : (
                <ul className="flex flex-col gap-2">
                  {datos.sedes.map((s) => {
                    const p = plazasDe(s.id);
                    const marcada = form.sedes.includes(s.id);
                    return (
                      <li key={s.id}>
                        <label className="flex cursor-pointer items-center gap-3 rounded-lg bg-subtle px-3 py-2.5">
                          <Checkbox
                            checked={marcada}
                            onCheckedChange={(v) =>
                              cambiar({ sedes: v === true ? [...form.sedes, s.id] : form.sedes.filter((x) => x !== s.id) })
                            }
                          />
                          <span className="min-w-0 flex-1 truncate text-sm text-fg">{s.nombre}</span>
                          {p && (
                            <span className="shrink-0 text-xs text-fg-secondary">
                              {t('plazasSede', { aprobadas: p.aprobadas ?? 0, ocupadas: p.ocupadas })}
                            </span>
                          )}
                        </label>
                      </li>
                    );
                  })}
                </ul>
              )}
              <p className="text-xs text-fg-muted">{form.sedes.length === 0 ? t('todasLasSedes') : t('plazasNota')}</p>
            </FormSection>
          </div>

          <div className="flex flex-col gap-4 lg:gap-5">
            {area && nodo && (
              <Tarjeta titulo={t('queAfecta')}>
                <ListaDatos>
                  <FilaDato etiqueta={t('personas')} valor={nodo.personasTotal} />
                  <FilaDato etiqueta={t('cargosEtiqueta')} valor={area.cargos.length} />
                  <FilaDato etiqueta={t('areasHijas')} valor={nodo.hijos.length || t('ninguna')} />
                  <FilaDato etiqueta={t('vacantes')} valor={vacantesDe(area.plazas)} />
                </ListaDatos>
                {cambiaPadre && (
                  <AvisoTonal tono="informacion" icono={Info} titulo={t('cambiaPadre')} compacto className="mt-3" />
                )}
              </Tarjeta>
            )}
            {area && (
              <Tarjeta titulo={t('archivar.titulo')} descripcion={motivoArchivar ?? t('archivar.descripcion')}>
                <button
                  type="button"
                  onClick={() => setArchivar(true)}
                  disabled={!!motivoArchivar}
                  title={motivoArchivar ?? undefined}
                  className={clasesBoton({ variante: 'secundario' })}
                >
                  <Archive aria-hidden className="size-4" strokeWidth={1.5} />
                  {t('archivar.boton')}
                </button>
              </Tarjeta>
            )}
          </div>
        </div>
      )}

      <ConfirmDialog
        abierto={archivar}
        onAbiertoChange={setArchivar}
        titulo={t('archivar.confirmarTitulo', { nombre: area?.nombre ?? '' })}
        descripcion={t('archivar.confirmarDescripcion')}
        textoConfirmar={t('archivar.boton')}
        icono={Archive}
        onConfirmar={confirmarArchivo}
      />
    </div>
  );
}
