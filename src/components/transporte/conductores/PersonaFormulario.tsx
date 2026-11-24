'use client';

/**
 * Catálogo común › Nuevo / Editar conductor o domiciliario como página (Figma «23 Transporte»
 * 2971:21208; nota 2972:21942). Reemplaza a `DriverDialog` y conserva sus campos (empleado,
 * licencia, categoría, vencimiento, examen médico, certificaciones, sede y activo); suma lo que la
 * base ya guardaba y el formulario viejo no dejaba llenar: externo sin contrato, restricciones,
 * tipo de sangre, certificados para pasajeros y mercancías peligrosas, contacto de emergencia,
 * tipo de vehículo y vehículo asignado.
 *
 * - Cargo de Recursos humanos (`job_positions`), NUNCA un rol: se asigna al empleo con
 *   `JobPositionsService.assignEmployee` (RLS `hr.employees.edit`). No se crea ni cambia ningún rol.
 * - El alta del EXTERNO va por la ruta de Logística › Domiciliarios (`POST /api/logistica/domiciliarios`:
 *   organización de la sesión y permiso en el servidor); el resto de sus datos se guarda después
 *   con `transportService.updateDriver`, igual que al editar.
 * - Acceso a la app: el empleado entra con su usuario; al externo se le puede vincular un miembro
 *   que ya tenga cuenta (lo mismo que el alta de Domiciliarios). Invitar a alguien nuevo desde aquí
 *   no existe: la invitación de Organización no vincula la credencial al aceptarse.
 * - Foto de la licencia: es el documento «licencia» de Flota (`DialogoDocumento`, con archivo); se
 *   sube al editar, cuando la persona ya existe.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Check, FileText, Paperclip, Phone, ShieldCheck, UserRound } from 'lucide-react';
import {
  AvisoTonal,
  CampoFecha,
  EmptyState,
  FilaDato,
  FormField,
  FormSection,
  ListaDatos,
  PageHeader,
  StatusBadge,
  Tarjeta,
  TarjetaSeleccionable,
  clasesBoton,
} from '@/components/kit';
import { Input } from '@/components/ui/input';
import { PhoneInput } from '@/components/kit/PhoneInput';
import { toastError, toastSuccess } from '@/components/ui/use-toast';
import { useBranch } from '@/lib/context/BranchContext';
import { useFormatDate } from '@/lib/context/OrganizationTimezoneContext';
import { getOrganizationId } from '@/lib/hooks/useOrganization';
import { supabase } from '@/lib/supabase/config';
import JobPositionsService from '@/lib/services/jobPositionsService';
import { transportService, type DriverCredential, type Vehicle } from '@/lib/services/transportService';
import { listarPersonasCatalogo, type PersonaCatalogo } from '@/lib/services/transporte/catalogoComunService';
import { DocumentoError, guardarDocumento, type DatosDocumento } from '@/lib/services/transporte/documentosService';
import { asignarConductorVehiculo } from '@/lib/services/transporte/vehiculoAccionesService';
import { candidatosAlta, type CandidatosAlta } from '@/lib/services/logistica/domiciliariosService';
import { listarEmpleosCatalogo, type EmpleoCatalogo } from '@/lib/services/transporte/fichaCatalogoService';
import { CATEGORIAS_LICENCIA, RUTAS_CATALOGO, TONO_DOCS, moduloDeRuta, rutaFicha } from '@/lib/transporte/catalogoComun';
import { diasEntre, estadoDocumento } from '@/lib/transporte/documentosFlota';
import {
  SIN_LICENCIA,
  TIPOS_DOCUMENTO_PERSONA,
  TIPOS_SANGRE,
  TIPOS_VEHICULO_PERSONA,
  altaExterno,
  formularioAPersona,
  personaAFormulario,
  validarPersona,
  type ErroresPersona,
  type FormPersona,
} from '@/lib/transporte/formulariosCatalogo';
import { DialogoDocumento } from '@/components/transporte/flota/DialogoDocumento';
import { CampoInterruptor, CampoSelect } from '@/components/transporte/fichas/CamposFormulario';

type Empleo = EmpleoCatalogo;
type Cargo = { id: string; name: string };

export function PersonaFormulario({ id }: { id?: string }) {
  const t = useTranslations('catalogoComun.formPersona');
  const tp = useTranslations('catalogoComun.conductores');
  const tc = useTranslations('catalogoComun.comun');
  const tTipos = useTranslations('transporte.tiposVehiculo');
  const tDomi = useTranslations('catalogoComun.formPersona.tiposVehiculo');
  const tFlota = useTranslations('transporte.flota');
  const router = useRouter();
  const modulo = moduloDeRuta(usePathname());
  const rutas = RUTAS_CATALOGO[modulo];
  const duplicarDe = useSearchParams()?.get('duplicar') ?? null;
  const { getToday } = useFormatDate();
  const hoy = getToday();
  const { selectedBranchId } = useBranch();
  const organizationId = Number(getOrganizationId()) || null;
  const editando = !!id;
  const origenId = id ?? duplicarDe;

  const [original, setOriginal] = useState<PersonaCatalogo | null>(null);
  const [form, setForm] = useState<FormPersona>(() => personaAFormulario(null, { sede: selectedBranchId ?? null }));
  const [inicial, setInicial] = useState<{ positionId: string | null; vehiculoId: string | null }>({ positionId: null, vehiculoId: null });
  const [errores, setErrores] = useState<ErroresPersona>({});
  const [personas, setPersonas] = useState<PersonaCatalogo[]>([]);
  const [empleos, setEmpleos] = useState<Empleo[]>([]);
  const [cargos, setCargos] = useState<Cargo[]>([]);
  const [vehiculos, setVehiculos] = useState<Vehicle[]>([]);
  const [sedes, setSedes] = useState<{ id: number; name: string }[]>([]);
  const [miembros, setMiembros] = useState<CandidatosAlta['miembros']>([]);
  const [carga, setCarga] = useState<'cargando' | 'listo' | 'noEncontrado' | 'error'>('cargando');
  const [guardando, setGuardando] = useState<false | 'guardar' | 'otro'>(false);
  const [fotoLicencia, setFotoLicencia] = useState(false);

  useEffect(() => {
    if (!organizationId) return;
    let cancelado = false;
    (async () => {
      try {
        const [p, e, c, v, s, m] = await Promise.all([
          listarPersonasCatalogo(supabase, organizationId),
          listarEmpleosCatalogo(supabase, organizationId).catch(() => [] as Empleo[]),
          new JobPositionsService(organizationId).getAll({ isActive: true }).catch(() => [] as Cargo[]),
          transportService.getVehicles(organizationId, null),
          transportService.getBranches(organizationId).catch(() => [] as { id: number; name: string }[]),
          candidatosAlta(supabase, organizationId).catch(() => ({ empleados: [], miembros: [] }) as CandidatosAlta),
        ]);
        if (cancelado) return;
        const listaEmpleos = e;
        setPersonas(p);
        setEmpleos(listaEmpleos);
        setCargos((c as Cargo[]).map((x) => ({ id: x.id, name: x.name })));
        setVehiculos(v);
        setSedes(s);
        setMiembros(m.miembros);
        if (origenId) {
          // La organización sale de la sesión: la lista solo trae personas de esta organización.
          const base = p.find((x) => x.id === origenId) ?? null;
          if (!base) {
            setCarga('noEncontrado');
            return;
          }
          const positionId = listaEmpleos.find((x) => x.id === base.employmentId)?.positionId ?? null;
          const vehiculoId = base.userId ? v.find((x) => x.current_driver_id === base.userId && x.is_active !== false)?.id ?? null : null;
          setOriginal(editando ? base : null);
          setInicial(editando ? { positionId, vehiculoId } : { positionId: null, vehiculoId: null });
          setForm(personaAFormulario(credencialDe(base), { positionId, vehiculoId, sede: selectedBranchId ?? null, duplicar: !editando }));
        }
        setCarga('listo');
      } catch {
        if (!cancelado) setCarga('error');
      }
    })();
    return () => {
      cancelado = true;
    };
    // Se carga una vez por persona; la sede activa solo da el valor inicial.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [organizationId, origenId, editando]);

  const poner = <K extends keyof FormPersona>(k: K, v: FormPersona[K]) => {
    setForm((f) => ({ ...f, [k]: v }));
    if (errores[k]) setErrores((e) => ({ ...e, [k]: undefined }));
  };
  const error = (k: keyof FormPersona) => (errores[k] ? t(`errores.${errores[k]}`) : null);

  // Empleos sin credencial (el índice único de `employment_id`), más el de la persona que se edita.
  const empleosLibres = useMemo(() => {
    const usados = new Set(personas.filter((p) => p.id !== original?.id && p.employmentId).map((p) => p.employmentId));
    return empleos.filter((e) => !usados.has(e.id) && e.nombre);
  }, [empleos, personas, original]);
  const miembrosLibres = useMemo(() => {
    const base = miembros.slice();
    if (original?.userId && original.externo && !base.some((m) => m.userId === original.userId)) base.unshift({ userId: original.userId, nombre: original.nombre, telefono: original.telefono });
    return base;
  }, [miembros, original]);
  const usuario = form.modo === 'empleado' ? original?.userId ?? null : form.user_id;
  const nombre = form.modo === 'empleado' ? empleos.find((e) => e.id === form.employment_id)?.nombre ?? original?.nombre ?? '' : form.full_name.trim();
  const cargoNombre = form.modo === 'empleado' ? cargos.find((c) => c.id === form.position_id)?.name ?? null : tc('externo');
  const vehiculoElegido = vehiculos.find((v) => v.id === form.vehiculo_id) ?? null;
  const estadoFecha = (vence: string) => {
    const d = diasEntre(hoy, vence);
    return Number.isFinite(d) ? estadoDocumento(d) : null;
  };
  const licenciaEstado = form.license_expiry ? estadoFecha(form.license_expiry) : null;
  const examenEstado = form.medical_certificate_expiry ? estadoFecha(form.medical_certificate_expiry) : null;
  const tipoPersonaTexto = (x: string) => (tDomi.has(x) ? tDomi(x) : tTipos.has(x) ? tTipos(x) : x);

  const elegirEmpleo = (empleoId: string | null) => {
    const e = empleos.find((x) => x.id === empleoId);
    setForm((f) => ({ ...f, employment_id: empleoId, position_id: e?.positionId ?? f.position_id, branch_id: f.branch_id ?? e?.branchId ?? null }));
    if (errores.employment_id) setErrores((x) => ({ ...x, employment_id: undefined }));
  };

  // ── Guardar ───────────────────────────────────────────────────────────────
  const volverA = editando && id ? rutaFicha(modulo, 'persona', id) : rutas.conductores;

  const asignarVehiculo = async (usuarioId: string | null, nombrePersona: string) => {
    if (form.vehiculo_id === inicial.vehiculoId || !usuarioId) return;
    const anterior = vehiculos.find((v) => v.id === inicial.vehiculoId);
    if (anterior) await asignarConductorVehiculo(anterior, null, { antes: nombrePersona, ahora: null });
    const nuevo = vehiculos.find((v) => v.id === form.vehiculo_id);
    if (nuevo) {
      const antes = nuevo.current_driver_id ? personas.find((p) => p.userId === nuevo.current_driver_id)?.nombre ?? null : null;
      await asignarConductorVehiculo(nuevo, usuarioId, { antes, ahora: nombrePersona });
    }
  };

  const guardar = useCallback(
    async (modo: 'guardar' | 'otro') => {
      if (!organizationId) return;
      const e = validarPersona(form);
      const conError = (Object.keys(e) as (keyof FormPersona)[]).filter((k) => e[k]);
      if (conError.length) {
        setErrores(e);
        toastError(t('toast.revisa', { count: conError.length }));
        document.getElementById(`persona-${conError[0]}`)?.focus();
        return;
      }
      setGuardando(modo);
      try {
        let credencialId: string;
        let usuarioId: string | null;
        if (editando && original) {
          const actualizado = (await transportService.updateDriver(original.id, formularioAPersona(form, original.credencial.metadata ?? null) as Partial<DriverCredential>)) as DriverCredential & { user_id?: string | null };
          credencialId = original.id;
          usuarioId = actualizado?.user_id ?? original.userId;
        } else if (form.modo === 'externo') {
          // Alta del externo por la ruta de Domiciliarios (organización y permiso del servidor).
          const res = await fetch('/api/logistica/domiciliarios', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(altaExterno(form)) });
          const json = (await res.json().catch(() => ({}))) as { domiciliario?: { id: string; user_id: string | null }; code?: string };
          if (!res.ok || !json.domiciliario) throw Object.assign(new Error(json.code ?? 'ERROR'), { codigoApi: json.code ?? 'ERROR' });
          credencialId = json.domiciliario.id;
          usuarioId = json.domiciliario.user_id;
          await transportService.updateDriver(credencialId, formularioAPersona(form, { cobra_contraentrega: form.cobra_contraentrega, origen_alta: 'logistica' }) as Partial<DriverCredential>);
        } else {
          const creado = (await transportService.createDriver({ ...formularioAPersona(form, null), organization_id: organizationId } as Partial<DriverCredential>)) as DriverCredential & { user_id?: string | null };
          credencialId = creado.id;
          usuarioId = creado.user_id ?? null;
        }
        // El cargo es del empleo en Recursos humanos; nunca se toca un rol.
        if (form.modo === 'empleado' && form.employment_id && form.position_id && form.position_id !== inicial.positionId) {
          await new JobPositionsService(organizationId).assignEmployee(form.employment_id, form.position_id);
        }
        await asignarVehiculo(usuarioId, nombre);
        toastSuccess(editando ? tp('toast.actualizado') : tp('toast.creado'));
        if (!editando && modo === 'otro') {
          setPersonas(await listarPersonasCatalogo(supabase, organizationId).catch(() => personas));
          setForm(personaAFormulario(null, { sede: form.branch_id }));
          setErrores({});
          window.scrollTo({ top: 0 });
        } else {
          router.push(rutaFicha(modulo, 'persona', credencialId));
        }
      } catch (err) {
        const api = (err as { codigoApi?: string })?.codigoApi;
        const codigo = (err as { code?: string })?.code;
        toastError(api === 'DUPLICADO' || codigo === '23505' ? t('toast.duplicado') : api === 'SIN_PERMISO' || codigo === '42501' ? t('toast.sinPermiso') : tp('toast.errorGuardar'));
      } finally {
        setGuardando(false);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [organizationId, form, editando, original, inicial, nombre, personas, vehiculos, modulo, router, t, tp],
  );

  const guardarFoto = async (datos: DatosDocumento, archivo: File | null) => {
    if (!organizationId) return false;
    try {
      await guardarDocumento(supabase, organizationId, datos, archivo);
      toastSuccess(tFlota('toast.guardado'));
      return true;
    } catch (e) {
      toastError(tFlota(`errores.${e instanceof DocumentoError ? e.codigo : 'error'}`));
      return false;
    }
  };

  const titulo = editando ? t('tituloEditar', { nombre: original?.nombre ?? '' }) : t('tituloNuevo');
  const migas = [
    { etiqueta: tc(`migas.${modulo}`), href: rutas.inicio },
    { etiqueta: tp('titulo'), href: rutas.conductores },
    ...(editando && original ? [{ etiqueta: original.nombre || '—', href: volverA }] : []),
    { etiqueta: editando ? t('migaEditar') : t('migaNuevo') },
  ];

  if (carga === 'noEncontrado' || carga === 'error') {
    return (
      <div className="flex flex-col gap-4 p-4 pb-28 sm:p-6 sm:pb-28 lg:gap-5">
        <PageHeader titulo={titulo} migas={migas.slice(0, 2)} variante="form" volverA={rutas.conductores} />
        <div className="rounded-xl border border-line bg-surface">
          {carga === 'noEncontrado' ? (
            <EmptyState variante="search" titulo={t('noEncontrado')} accion={{ etiqueta: t('volver'), href: rutas.conductores }} />
          ) : (
            <EmptyState variante="error" titulo={tc('ficha.errorCarga')} accion={{ etiqueta: t('volver'), href: rutas.conductores }} />
          )}
        </div>
      </div>
    );
  }

  const botones = (columna: boolean) => (
    <>
      {!editando && (
        <button type="button" className={clasesBoton({ variante: 'secundario', anchoCompleto: columna })} disabled={!!guardando || carga !== 'listo'} onClick={() => void guardar('otro')}>
          {t('guardarYOtro')}
        </button>
      )}
      <button type="button" className={clasesBoton({ variante: 'primario', anchoCompleto: columna, className: columna ? 'order-first' : undefined })} disabled={!!guardando || carga !== 'listo'} onClick={() => void guardar('guardar')}>
        <Check aria-hidden="true" className="size-4" strokeWidth={1.5} />
        {t('guardar')}
      </button>
    </>
  );
  const pideLicencia = form.modo === 'empleado' && !SIN_LICENCIA.includes(form.vehicle_type ?? '');

  return (
    <div className="flex flex-col gap-4 p-4 pb-28 sm:p-6 sm:pb-28 lg:gap-5">
      <PageHeader
        titulo={titulo}
        subtitulo={t('subtitulo')}
        migas={migas}
        variante="form"
        volverA={volverA}
        cargando={carga === 'cargando'}
        acciones={
          <>
            <button type="button" className={clasesBoton({ variante: 'fantasma' })} onClick={() => router.push(volverA)} disabled={!!guardando}>
              {tc('cancelar')}
            </button>
            {botones(false)}
          </>
        }
        movil={{ titulo, accion: <button type="button" className={clasesBoton({ variante: 'primario', tamano: 'sm' })} disabled={!!guardando || carga !== 'listo'} onClick={() => void guardar('guardar')}>{t('guardar')}</button> }}
      />

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_340px] lg:gap-5">
        <form
          className="flex min-w-0 flex-col gap-4 lg:gap-5"
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            void guardar('guardar');
          }}
        >
          <FormSection titulo={t('secciones.persona.titulo')} descripcion={t('secciones.persona.descripcion')} icono={UserRound} columnas={2}>
            {!editando && (
              <div role="radiogroup" aria-label={t('secciones.persona.titulo')} className="grid gap-3 sm:col-span-2 sm:grid-cols-2">
                <TarjetaSeleccionable titulo={t('modo.empleado')} descripcion={t('modo.empleadoDescripcion')} seleccionada={form.modo === 'empleado'} onSeleccionar={() => poner('modo', 'empleado')} />
                <TarjetaSeleccionable titulo={t('modo.externo')} descripcion={t('modo.externoDescripcion')} seleccionada={form.modo === 'externo'} onSeleccionar={() => poner('modo', 'externo')} />
              </div>
            )}
            {form.modo === 'empleado' ? (
              <>
                <div className="sm:col-span-2">
                  <CampoSelect
                    etiqueta={t('campos.employment_id')}
                    obligatorio
                    valor={form.employment_id}
                    onValor={elegirEmpleo}
                    opciones={empleosLibres.map((e) => ({ valor: e.id, etiqueta: [e.nombre, sedes.find((s) => s.id === e.branchId)?.name].filter(Boolean).join(' · ') }))}
                    placeholder={t('elegirEmpleado')}
                    ayuda={empleosLibres.length ? t('ayudas.employment_id') : t('ayudas.sinEmpleados')}
                    error={error('employment_id')}
                  />
                </div>
                <CampoSelect
                  etiqueta={t('campos.position_id')}
                  valor={form.position_id}
                  onValor={(v) => poner('position_id', v)}
                  opciones={cargos.map((c) => ({ valor: c.id, etiqueta: c.name }))}
                  placeholder={t('sinCargo')}
                  ayuda={t('ayudas.position_id')}
                />
              </>
            ) : (
              <>
                <FormField etiqueta={t('campos.full_name')} obligatorio error={error('full_name')} className="sm:col-span-2">
                  <Input id="persona-full_name" value={form.full_name} onChange={(e) => poner('full_name', e.target.value)} maxLength={120} autoComplete="off" />
                </FormField>
                <CampoSelect
                  etiqueta={t('campos.document_type')}
                  valor={form.document_type}
                  onValor={(v) => poner('document_type', v ?? 'CC')}
                  opciones={TIPOS_DOCUMENTO_PERSONA.map((x) => ({ valor: x, etiqueta: x }))}
                />
                <FormField etiqueta={t('campos.document_number')} obligatorio error={error('document_number')}>
                  <Input id="persona-document_number" value={form.document_number} onChange={(e) => poner('document_number', e.target.value)} maxLength={30} autoComplete="off" />
                </FormField>
                <FormField etiqueta={t('campos.phone')} obligatorio error={error('phone')}>
                  <PhoneInput id="persona-phone" tamano="md" value={form.phone} onChange={(v) => poner('phone', v)} />
                </FormField>
              </>
            )}
            <CampoSelect
              etiqueta={t('campos.branch_id')}
              obligatorio={form.modo === 'externo'}
              valor={form.branch_id ? String(form.branch_id) : null}
              onValor={(v) => poner('branch_id', v ? Number(v) : null)}
              ninguno={form.modo === 'empleado' ? t('todasLasSedes') : undefined}
              opciones={sedes.map((s) => ({ valor: String(s.id), etiqueta: s.name }))}
              placeholder={t('elegirSede')}
              error={error('branch_id')}
            />
            <div className="sm:col-span-2">
              {form.modo === 'empleado' ? (
                <p className="text-[13px] text-fg-secondary">{t('accesoEmpleado')}</p>
              ) : (
                <CampoSelect
                  etiqueta={t('campos.user_id')}
                  valor={form.user_id}
                  onValor={(v) => poner('user_id', v)}
                  ninguno={t('sinAcceso')}
                  opciones={miembrosLibres.map((m) => ({ valor: m.userId, etiqueta: m.nombre }))}
                  ayuda={t('ayudas.user_id')}
                />
              )}
            </div>
            {form.modo === 'externo' && (
              <div className="sm:col-span-2">
                <CampoInterruptor id="persona-cobra" titulo={t('campos.cobra_contraentrega')} descripcion={t('ayudas.cobra_contraentrega')} valor={form.cobra_contraentrega} onValor={(v) => poner('cobra_contraentrega', v)} />
              </div>
            )}
          </FormSection>

          <FormSection titulo={t('secciones.licencia.titulo')} descripcion={pideLicencia ? t('secciones.licencia.descripcion') : t('secciones.licencia.descripcionOpcional')} icono={FileText} columnas={2}>
            <FormField etiqueta={t('campos.license_number')} obligatorio={pideLicencia} error={error('license_number')}>
              <Input id="persona-license_number" value={form.license_number} onChange={(e) => poner('license_number', e.target.value)} maxLength={30} autoComplete="off" />
            </FormField>
            <CampoSelect
              etiqueta={t('campos.license_category')}
              obligatorio={pideLicencia}
              valor={form.license_category}
              onValor={(v) => poner('license_category', v)}
              ninguno={pideLicencia ? undefined : t('sinLicencia')}
              opciones={CATEGORIAS_LICENCIA.map((c) => ({ valor: c, etiqueta: `${c} · ${tp(`categorias.${c}`)}` }))}
              placeholder={t('elegirCategoria')}
              ayuda={t('ayudas.license_category')}
              error={error('license_category')}
            />
            <FormField etiqueta={t('campos.license_expiry')} obligatorio={pideLicencia} error={error('license_expiry')}>
              {(cp) => <CampoFecha id={cp.id} valor={form.license_expiry} onValorChange={(v) => poner('license_expiry', v)} limpiable hoy={hoy} />}
            </FormField>
            <FormField etiqueta={t('campos.license_restrictions')}>
              <Input id="persona-license_restrictions" value={form.license_restrictions} onChange={(e) => poner('license_restrictions', e.target.value)} maxLength={200} />
            </FormField>
            <div className="flex flex-col gap-2 rounded-xl border border-line p-3 sm:col-span-2 sm:flex-row sm:items-center">
              <span className="flex min-w-0 flex-1 items-center gap-2 text-sm text-fg">
                <Paperclip aria-hidden="true" className="size-4 shrink-0 text-fg-secondary" strokeWidth={1.5} />
                {t('fotoLicencia')}
              </span>
              {editando && original ? (
                <button type="button" className={clasesBoton({ variante: 'secundario', tamano: 'sm' })} onClick={() => setFotoLicencia(true)}>
                  {t('subir')}
                </button>
              ) : (
                <span className="text-xs text-fg-muted">{t('fotoDespues')}</span>
              )}
            </div>
          </FormSection>

          <FormSection titulo={t('secciones.salud.titulo')} descripcion={t('secciones.salud.descripcion')} icono={ShieldCheck} columnas={2}>
            <FormField etiqueta={t('campos.medical_certificate_expiry')} error={error('medical_certificate_expiry')}>
              {(cp) => <CampoFecha id={cp.id} valor={form.medical_certificate_expiry} onValorChange={(v) => poner('medical_certificate_expiry', v)} limpiable hoy={hoy} />}
            </FormField>
            <CampoSelect
              etiqueta={t('campos.blood_type')}
              valor={form.blood_type}
              onValor={(v) => poner('blood_type', v)}
              ninguno={t('sinDato')}
              opciones={TIPOS_SANGRE.map((x) => ({ valor: x, etiqueta: x }))}
            />
            <CampoInterruptor id="persona-pasajeros" titulo={t('campos.passenger_certified')} valor={form.passenger_certified} onValor={(v) => poner('passenger_certified', v)} />
            <CampoInterruptor id="persona-peligrosas" titulo={t('campos.hazmat_certified')} valor={form.hazmat_certified} onValor={(v) => poner('hazmat_certified', v)} />
            <FormField etiqueta={t('campos.certificaciones')} ayuda={t('ayudas.certificaciones')} className="sm:col-span-2">
              <Input id="persona-certificaciones" value={form.certificaciones} onChange={(e) => poner('certificaciones', e.target.value)} maxLength={300} />
            </FormField>
          </FormSection>

          <FormSection titulo={t('secciones.contacto.titulo')} descripcion={t('secciones.contacto.descripcion')} icono={Phone} columnas={2}>
            <FormField etiqueta={t('campos.emergency_contact_name')}>
              <Input id="persona-emergency_contact_name" value={form.emergency_contact_name} onChange={(e) => poner('emergency_contact_name', e.target.value)} maxLength={120} />
            </FormField>
            <FormField etiqueta={t('campos.emergency_contact_phone')}>
              <PhoneInput id="persona-emergency_contact_phone" tamano="md" value={form.emergency_contact_phone} onChange={(v) => poner('emergency_contact_phone', v)} />
            </FormField>
            <CampoSelect
              etiqueta={t('campos.vehicle_type')}
              valor={form.vehicle_type}
              onValor={(v) => poner('vehicle_type', v)}
              ninguno={t('sinDato')}
              opciones={TIPOS_VEHICULO_PERSONA.map((x) => ({ valor: x, etiqueta: tipoPersonaTexto(x) }))}
              ayuda={t('ayudas.vehicle_type')}
              error={error('vehicle_type')}
            />
            <CampoSelect
              etiqueta={t('campos.vehiculo_id')}
              valor={form.vehiculo_id}
              onValor={(v) => poner('vehiculo_id', v)}
              ninguno={tp('sinVehiculo')}
              opciones={vehiculos.filter((v) => v.is_active !== false).map((v) => ({ valor: v.id, etiqueta: `${v.plate} · ${tTipos.has(v.vehicle_type) ? tTipos(v.vehicle_type) : v.vehicle_type}` }))}
              ayuda={usuario || form.modo === 'empleado' ? t('ayudas.vehiculo_id') : t('ayudas.vehiculoSinUsuario')}
              deshabilitado={form.modo === 'externo' && !usuario}
            />
            <div className="sm:col-span-2">
              <CampoInterruptor id="persona-activo" titulo={t('campos.is_active')} descripcion={t('ayudas.is_active')} valor={form.is_active} onValor={(v) => poner('is_active', v)} />
            </div>
          </FormSection>
          <div className="flex flex-col gap-2 lg:hidden">{botones(true)}</div>
        </form>

        <aside className="hidden lg:block">
          <Tarjeta titulo={t('resumen.titulo')} className="sticky top-4">
            <div className="flex flex-col gap-4">
              <ListaDatos etiqueta={t('resumen.titulo')}>
                <FilaDato etiqueta={t('resumen.persona')} valor={nombre ? `${nombre} · ${form.modo === 'empleado' ? t('resumen.empleado') : t('resumen.externo')}` : '—'} />
                <FilaDato etiqueta={t('resumen.cargo')} valor={cargoNombre ?? tp('sinCargo')} />
                <FilaDato etiqueta={t('resumen.vehiculo')} valor={vehiculoElegido?.plate ?? tp('sinVehiculo')} />
              </ListaDatos>
              <div className="flex flex-wrap gap-2 border-t border-line pt-3">
                <StatusBadge
                  estado={licenciaEstado ?? 'sin_fecha'}
                  tono={TONO_DOCS[licenciaEstado ?? 'sin_fecha']}
                  apariencia="contorno"
                  etiqueta={t('resumen.licencia', { estado: tc(`docs.${licenciaEstado ?? 'sin_fecha'}`) })}
                />
                <StatusBadge
                  estado={examenEstado ?? 'sin_fecha'}
                  tono={TONO_DOCS[examenEstado ?? 'sin_fecha']}
                  apariencia="contorno"
                  etiqueta={t('resumen.examen', { estado: tc(`docs.${examenEstado ?? 'sin_fecha'}`) })}
                />
              </div>
              <AvisoTonal tono="informacion" compacto titulo={t('resumen.sinRol')} />
              <div className="flex flex-col gap-2">{botones(true)}</div>
            </div>
          </Tarjeta>
        </aside>
      </div>

      {fotoLicencia && original && (
        <DialogoDocumento
          vehiculos={[]}
          conductores={[{ id: original.id, nombre: original.nombre || '—' }]}
          inicial={{ de: 'conductor', duenoId: original.id, tipo: 'licencia' }}
          onCerrar={() => setFotoLicencia(false)}
          onGuardar={guardarFoto}
        />
      )}
    </div>
  );
}

/** La persona del catálogo con la forma que lee `personaAFormulario`. */
function credencialDe(p: PersonaCatalogo) {
  return {
    employment_id: p.employmentId,
    user_id: p.userId,
    full_name: p.credencial.full_name,
    phone: p.telefono,
    document_type: p.documentoTipo,
    document_number: p.documento,
    is_external: p.externo,
    vehicle_type: p.tipoVehiculo,
    license_number: p.licenciaNumero,
    license_category: p.licenciaCategoria,
    license_expiry: p.licenciaVence,
    license_restrictions: p.restricciones,
    medical_certificate_expiry: p.examenVence,
    blood_type: p.sangre,
    passenger_certified: p.certificadoPasajeros,
    hazmat_certified: p.mercanciasPeligrosas,
    emergency_contact_name: p.emergenciaNombre,
    emergency_contact_phone: p.emergenciaTelefono,
    is_active: p.activo,
    branch_id: p.sedeId,
    metadata: p.credencial.metadata ?? null,
  };
}
