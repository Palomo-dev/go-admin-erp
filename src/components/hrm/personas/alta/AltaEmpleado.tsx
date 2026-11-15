'use client';

/**
 * Nuevo empleado (Figma 20.5, `docs/design/figma/95-hrm-05-*`). Una persona
 * puede ser empleada sin usuario de la app.
 *
 * - Documento duplicado (decisión 11): activa → se bloquea con «Ver su ficha»;
 *   retirada → «Registrar reingreso» en la misma ficha (conserva su historial).
 * - Sin permiso de salario (decisión 12): se crea igual y queda una tarea a
 *   quien lo tiene.
 * - Todo en una transacción del servidor (`POST /api/hrm/empleados/alta`).
 * - Formulario largo: las acciones viven en la barra del pie (PATRONES §4.1).
 * - Plazas y escalas salariales: del frente «Estructura»; mientras no existan,
 *   no se muestra el aviso de plaza ni el rango de la escala.
 */
import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Check, CheckCircle2, History, Landmark, Lock, ShieldCheck, Sparkles, UserPlus, UserRound } from 'lucide-react';
import {
  AvatarIniciales,
  AvisoTonal,
  CampoFecha,
  CampoNumero,
  EmptyState,
  FormField,
  FormSection,
  PageHeader,
  StatusBadge,
  clasesBoton,
  simboloMoneda,
} from '@/components/kit';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useFormatDate } from '@/lib/context/OrganizationTimezoneContext';
import { useBranchOpcional } from '@/lib/context/BranchContext';
import { useMonedaOrganizacion } from '@/lib/hooks/useOrgCurrency';
import { SUBSISTEMAS, TIPOS_CONTRATO, TIPOS_DOCUMENTO, normalizarNumeroDocumento } from '@/lib/hrm/personas/catalogo';
import { ErrorPersonas, pedir, useCarga, type Catalogos } from '../apiPersonas';
import { fechaCorta } from '../textosPersonas';

const LISTA = '/app/hrm/empleados';
const CON_FIN = ['fixed_term', 'project', 'apprenticeship'];

interface Duplicado {
  existe: boolean;
  persona_id?: string;
  nombre?: string;
  estado?: string;
  cargo?: string | null;
  area?: string | null;
  sede?: string | null;
  retiro?: string | null;
}
interface PermisosHrm {
  empleados: { crear: boolean };
  grupos: Record<string, { editar: boolean }>;
}
interface Creado {
  persona_id: string;
  vinculo_id: string;
  reingreso: boolean;
  por_ingresar: boolean;
  tareas: number;
  salario: boolean;
  invitacion: string | null;
}

function partir(texto: string): [string, string] {
  const p = texto.trim().split(/\s+/).filter(Boolean);
  return [p[0] ?? '', p.slice(1).join(' ')];
}

export function AltaEmpleado() {
  const t = useTranslations('hrmPersonas.alta');
  const tc = useTranslations('hrmPersonas.comun');
  const router = useRouter();
  const { getToday } = useFormatDate();
  const branch = useBranchOpcional();
  const moneda = useMonedaOrganizacion();
  const simbolo = simboloMoneda(moneda);
  const permisos = useCarga<PermisosHrm>('/api/hrm/permisos');
  const catalogos = useCarga<Catalogos>('/api/hrm/catalogos');
  const cat = catalogos.carga.estado === 'listo' ? catalogos.carga.datos : null;
  const puedeSalario = permisos.carga.estado === 'listo' && !!permisos.carga.datos.grupos.salario_pago?.editar;

  const [f, setF] = useState({
    doc_type: 'CC',
    doc_number: '',
    nombres: '',
    apellidos: '',
    birth_date: '',
    personal_phone: '',
    personal_email: '',
    branch_id: '',
    department_id: '',
    position_id: '',
    manager_id: '',
    contract_type: 'indefinite',
    hire_date: '',
    contract_end_date: '',
    work_hours_per_week: 42 as number | null,
    cost_center_id: '',
    salary_period: 'monthly',
    salario: null as number | null,
    eps: '',
    afp: '',
    arl: '',
    ccf: '',
    cesantias: '',
  });
  const [invitar, setInvitar] = useState(true);
  const [duplicado, setDuplicado] = useState<Duplicado | null>(null);
  const [reingreso, setReingreso] = useState<string | null>(null);
  const [creando, setCreando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [creado, setCreado] = useState<Creado | null>(null);
  const set = <K extends keyof typeof f>(k: K) => (v: (typeof f)[K]) => setF((x) => ({ ...x, [k]: v }));

  useEffect(() => {
    setF((x) => ({ ...x, hire_date: x.hire_date || getToday() }));
  }, [getToday]);
  useEffect(() => {
    if (!cat || f.branch_id) return;
    const activa = branch?.selectedBranchId ?? cat.sedes.find((s) => s.is_main)?.id ?? cat.sedes[0]?.id;
    if (activa) setF((x) => ({ ...x, branch_id: String(activa) }));
  }, [cat, branch, f.branch_id]);

  // Al elegir el área, el jefe sugerido es quien la dirige.
  const area = cat?.areas.find((a) => a.id === f.department_id) ?? null;
  useEffect(() => {
    if (area?.manager_employment_id) setF((x) => (x.manager_id ? x : { ...x, manager_id: area.manager_employment_id as string }));
  }, [area]);

  const verificarDocumento = async () => {
    const numero = normalizarNumeroDocumento(f.doc_number);
    if (numero.length < 3) return setDuplicado(null);
    try {
      setDuplicado(await pedir<Duplicado>('/api/hrm/empleados/buscar-documento', { metodo: 'POST', cuerpo: { tipo: f.doc_type, numero } }));
      setReingreso(null);
    } catch {
      setDuplicado(null);
    }
  };

  const bloqueado = !!duplicado?.existe && duplicado.estado !== 'retirado';
  const retiradoSinReingreso = !!duplicado?.existe && duplicado.estado === 'retirado' && !reingreso;
  const cargos = useMemo(() => (cat?.cargos ?? []).filter((c) => !f.department_id || !c.department_id || c.department_id === f.department_id), [cat, f.department_id]);
  const centros = useMemo(() => (cat?.centros_costo ?? []).filter((c) => !c.branch_id || String(c.branch_id) === f.branch_id), [cat, f.branch_id]);
  const completos =
    !!f.doc_number.trim() &&
    !!f.nombres.trim() &&
    !!f.apellidos.trim() &&
    !!f.birth_date &&
    !!f.personal_phone.trim() &&
    !!f.branch_id &&
    !!f.department_id &&
    !!f.position_id &&
    !!f.hire_date &&
    !!f.contract_type &&
    f.work_hours_per_week != null &&
    (!CON_FIN.includes(f.contract_type) || !!f.contract_end_date) &&
    (!puedeSalario || f.salario != null);

  const crear = async () => {
    setCreando(true);
    setError(null);
    const [first_name, second_name] = partir(f.nombres);
    const [last_name, second_last_name] = partir(f.apellidos);
    try {
      const r = await pedir<Creado>('/api/hrm/empleados/alta', {
        metodo: 'POST',
        cuerpo: {
          persona_id: reingreso ?? undefined,
          first_name,
          second_name,
          last_name,
          second_last_name,
          doc_type: f.doc_type,
          doc_number: normalizarNumeroDocumento(f.doc_number),
          birth_date: f.birth_date,
          personal_phone: f.personal_phone,
          personal_email: f.personal_email,
          branch_id: f.branch_id,
          department_id: f.department_id,
          position_id: f.position_id,
          manager_id: f.manager_id || undefined,
          contract_type: f.contract_type,
          contract_end_date: CON_FIN.includes(f.contract_type) ? f.contract_end_date : undefined,
          hire_date: f.hire_date,
          work_hours_per_week: f.work_hours_per_week ?? undefined,
          cost_center_id: f.cost_center_id || undefined,
          salary_period: f.salary_period,
          salario: puedeSalario && f.salario != null ? f.salario : undefined,
          eps: f.eps || undefined,
          afp: f.afp || undefined,
          arl: f.arl || undefined,
          ccf: f.ccf || undefined,
          cesantias: f.cesantias || undefined,
          invitar: invitar && !!f.personal_email.trim(),
          origin: window.location.origin,
        },
      });
      setCreado(r);
      window.scrollTo({ top: 0 });
    } catch (e) {
      const c = e instanceof ErrorPersonas ? e.codigo : '';
      setError(['documento_duplicado', 'documento_retirado', 'sin_permiso', 'sede_invalida'].includes(c) ? t(`errores.${c}`) : t('errores.generico'));
    } finally {
      setCreando(false);
    }
  };

  if (permisos.carga.estado === 'listo' && !permisos.carga.datos.empleados.crear) {
    return (
      <div className="p-4 sm:p-6">
        <PageHeader variante="form" titulo={t('titulo')} volverA={LISTA} migas={[{ etiqueta: tc('migas.rrhh'), href: LISTA }, { etiqueta: tc('migas.empleados'), href: LISTA }, { etiqueta: t('titulo') }]} />
        <EmptyState variante="forbidden" titulo={t('sinPermiso.titulo')} descripcion={t('sinPermiso.descripcion')} accion={{ etiqueta: t('sinPermiso.accion'), href: LISTA }} />
      </div>
    );
  }

  if (creado) {
    const nombre = `${f.nombres} ${f.apellidos}`.trim();
    const segSocial = [f.eps, f.afp, f.arl, f.ccf, f.cesantias].filter(Boolean).length;
    const ficha = `${LISTA}/${creado.persona_id}`;
    return (
      <div className="flex flex-col gap-6 p-4 sm:p-6">
        <PageHeader
          variante="form"
          titulo={t('creado.titulo')}
          subtitulo={[nombre, creado.por_ingresar ? t('creado.porIngresar', { fecha: fechaCorta(f.hire_date) }) : null].filter(Boolean).join(' · ')}
          volverA={LISTA}
          migas={[{ etiqueta: tc('migas.rrhh'), href: LISTA }, { etiqueta: tc('migas.empleados'), href: LISTA }, { etiqueta: nombre }]}
        />
        <div className="mx-auto w-full max-w-[720px] rounded-2xl border border-line bg-surface p-6 sm:p-8">
          <div className="flex flex-col items-center gap-3 text-center">
            <span className="flex size-14 items-center justify-center rounded-full bg-success-subtle text-success-text">
              <CheckCircle2 aria-hidden className="size-7" strokeWidth={1.5} />
            </span>
            <h2 className="text-xl font-semibold text-fg">{creado.reingreso ? t('creado.reingreso', { nombre }) : t('creado.registrado', { nombre })}</h2>
            <div className="flex flex-wrap justify-center gap-1.5">
              {creado.por_ingresar ? <StatusBadge estado="por_ingresar" tono="marca" etiqueta={t('creado.porIngresar', { fecha: fechaCorta(f.hire_date) })} /> : null}
              <StatusBadge estado="sin_usuario" tono="neutro" apariencia="contorno" etiqueta={t('creado.sinUsuario')} />
              {creado.invitacion === 'enviada' ? <StatusBadge estado="invitado" tono="informacion" etiqueta={t('creado.invitacion')} /> : null}
            </div>
          </div>
          {!creado.salario && creado.tareas > 0 ? <AvisoTonal className="mt-5" tono="advertencia" compacto titulo={t('creado.tareaSalario')} /> : null}
          <p className="mb-2 mt-6 text-xs text-fg-secondary">{t('creado.falta')}</p>
          <ul className="flex flex-col gap-2">
            {[
              { icono: Sparkles, titulo: t('creado.documentos'), detalle: t('creado.documentosDetalle'), accion: t('creado.leerIa'), href: `${ficha}?pestana=documentos` },
              { icono: ShieldCheck, titulo: t('creado.seguridad'), detalle: t('creado.deCinco', { n: segSocial }), accion: t('creado.completar'), href: `${ficha}?pestana=seguridad` },
              { icono: Landmark, titulo: t('creado.cuenta'), detalle: t('creado.sinRegistrar'), accion: t('creado.registrar'), href: `${ficha}?pestana=salario` },
            ].map((x) => (
              <li key={x.titulo} className="flex items-center gap-3 rounded-lg bg-subtle p-3">
                <x.icono aria-hidden className="size-5 shrink-0 text-brand" strokeWidth={1.5} />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-fg">{x.titulo}</p>
                  <p className="text-xs text-warning-text">{x.detalle}</p>
                </div>
                <button type="button" onClick={() => router.push(x.href)} className={clasesBoton({ variante: 'secundario', tamano: 'sm' })}>
                  {x.accion}
                </button>
              </li>
            ))}
          </ul>
          <div className="mt-6 flex flex-wrap justify-center gap-2">
            <button type="button" onClick={() => window.location.reload()} className={clasesBoton({ variante: 'secundario' })}>
              {t('creado.otro')}
            </button>
            <button type="button" onClick={() => router.push(ficha)} className={clasesBoton({ variante: 'primario' })}>
              <UserRound aria-hidden className="size-4" strokeWidth={1.5} />
              {t('creado.irFicha')}
            </button>
          </div>
        </div>
      </div>
    );
  }

  const select = (valor: string, onChange: (v: string) => void, opciones: { v: string; e: string }[], id: string, idEtiqueta: string, placeholder = tc('elegir'), disabled = false) => (
    <Select value={valor || undefined} onValueChange={onChange} disabled={disabled}>
      <SelectTrigger id={id} aria-labelledby={idEtiqueta} className="h-10 border-line-strong bg-surface">
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        {opciones.map((o) => (
          <SelectItem key={o.v} value={o.v}>
            {o.e}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
  const atenuado = bloqueado || retiradoSinReingreso ? 'pointer-events-none opacity-50' : '';

  return (
    <div className="flex flex-col gap-4 p-4 pb-0 sm:p-6 sm:pb-0">
      <PageHeader
        variante="form"
        titulo={t('titulo')}
        subtitulo={t('subtitulo')}
        volverA={LISTA}
        migas={[{ etiqueta: tc('migas.rrhh'), href: LISTA }, { etiqueta: tc('migas.empleados'), href: LISTA }, { etiqueta: t('titulo') }]}
        movil={{ titulo: t('titulo') }}
      />

      <div className="mx-auto flex w-full max-w-[1080px] flex-col gap-4">
        <FormSection titulo={t('secciones.identificacion')} accion={<SensibleBadgeAlta />}>
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField etiqueta={t('campos.tipoDocumento')} obligatorio>
              {(c) =>
                select(f.doc_type, (v) => { set('doc_type')(v); setDuplicado(null); }, TIPOS_DOCUMENTO.map((d) => ({ v: d, e: tc(`documentos.${d}`) })), c.id, c.idEtiqueta)
              }
            </FormField>
            <FormField
              etiqueta={t('campos.numeroDocumento')}
              obligatorio
              error={bloqueado ? t('duplicado.error') : null}
              ayuda={duplicado && !duplicado.existe ? <span className="text-success-text">{t('duplicado.disponible')}</span> : undefined}
            >
              <Input value={f.doc_number} onChange={(e) => set('doc_number')(e.target.value)} onBlur={() => void verificarDocumento()} inputMode="numeric" className="h-10" />
            </FormField>
            {duplicado?.existe ? (
              <div className="sm:col-span-2">
                <AvisoTonal
                  tono={bloqueado ? 'peligro' : 'advertencia'}
                  icono={bloqueado ? undefined : History}
                  titulo={bloqueado ? t('duplicado.titulo', { tipo: tc(`documentos.${f.doc_type}`), numero: f.doc_number }) : t('duplicado.reingresoTitulo')}
                  descripcion={
                    <div className="mt-2 flex flex-col gap-2">
                      <div className="flex items-center gap-3 rounded-lg bg-surface p-3">
                        <AvatarIniciales nombre={duplicado.nombre ?? '?'} />
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium text-fg">{duplicado.nombre}</p>
                          <p className="text-xs text-fg-secondary">
                            {bloqueado
                              ? [duplicado.cargo, duplicado.area, duplicado.sede].filter(Boolean).join(' · ')
                              : [duplicado.cargo, duplicado.retiro ? t('duplicado.retiradaEl', { fecha: fechaCorta(duplicado.retiro) }) : null].filter(Boolean).join(' · ')}
                          </p>
                        </div>
                        <StatusBadge estado={duplicado.estado ?? ''} tono={bloqueado ? 'exito' : 'neutro'} etiqueta={tc(`estados.${duplicado.estado ?? 'activo'}`)} />
                      </div>
                      <p className="text-sm">{bloqueado ? t('duplicado.activa') : t('duplicado.reingreso')}</p>
                      <div className="flex flex-wrap gap-2">
                        {!bloqueado && !reingreso ? (
                          <button
                            type="button"
                            onClick={() => {
                              setReingreso(duplicado.persona_id ?? null);
                              const partes = (duplicado.nombre ?? '').split(' ');
                              setF((x) => ({ ...x, nombres: x.nombres || partes.slice(0, 2).join(' '), apellidos: x.apellidos || partes.slice(2).join(' ') }));
                            }}
                            className={clasesBoton({ variante: 'primario', tamano: 'sm' })}
                          >
                            <UserPlus aria-hidden className="size-4" strokeWidth={1.5} />
                            {t('duplicado.registrarReingreso')}
                          </button>
                        ) : null}
                        {reingreso ? <StatusBadge estado="reingreso" tono="informacion" icono={Check} etiqueta={t('duplicado.enReingreso')} /> : null}
                        <button type="button" onClick={() => router.push(`${LISTA}/${duplicado.persona_id}`)} className={clasesBoton({ variante: 'secundario', tamano: 'sm' })}>
                          <UserRound aria-hidden className="size-4" strokeWidth={1.5} />
                          {t('duplicado.verFicha')}
                        </button>
                      </div>
                    </div>
                  }
                />
              </div>
            ) : null}
            <FormField etiqueta={t('campos.nombres')} obligatorio>
              <Input value={f.nombres} onChange={(e) => set('nombres')(e.target.value)} className="h-10" disabled={bloqueado} />
            </FormField>
            <FormField etiqueta={t('campos.apellidos')} obligatorio>
              <Input value={f.apellidos} onChange={(e) => set('apellidos')(e.target.value)} className="h-10" disabled={bloqueado} />
            </FormField>
          </div>
        </FormSection>

        <div className={atenuado}>
          <FormSection titulo={t('secciones.personales')} descripcion={t('secciones.personalesNota')}>
            <div className="grid gap-4 sm:grid-cols-3">
              <FormField etiqueta={t('campos.nacimiento')} obligatorio>
                <CampoFecha valor={f.birth_date} onValorChange={set('birth_date')} max={getToday()} />
              </FormField>
              <FormField etiqueta={t('campos.celular')} obligatorio>
                <Input value={f.personal_phone} onChange={(e) => set('personal_phone')(e.target.value)} inputMode="tel" className="h-10" />
              </FormField>
              <FormField etiqueta={t('campos.correo')}>
                <Input value={f.personal_email} onChange={(e) => set('personal_email')(e.target.value)} type="email" className="h-10" />
              </FormField>
            </div>
          </FormSection>
        </div>

        <div className={atenuado}>
          <FormSection titulo={t('secciones.laboral')}>
            <div className="grid gap-4 sm:grid-cols-3">
              <FormField etiqueta={t('campos.sede')} obligatorio ayuda={t('campos.sedeAyuda')}>
                {(c) => select(f.branch_id, set('branch_id'), (cat?.sedes ?? []).map((s) => ({ v: String(s.id), e: s.name })), c.id, c.idEtiqueta)}
              </FormField>
              <FormField etiqueta={t('campos.area')} obligatorio>
                {(c) => select(f.department_id, (v) => setF((x) => ({ ...x, department_id: v, position_id: '', manager_id: '' })), (cat?.areas ?? []).map((a) => ({ v: a.id, e: a.name })), c.id, c.idEtiqueta)}
              </FormField>
              <FormField etiqueta={t('campos.cargo')} obligatorio>
                {(c) => select(f.position_id, set('position_id'), cargos.map((x) => ({ v: x.id, e: x.name })), c.id, c.idEtiqueta)}
              </FormField>
              <FormField etiqueta={t('campos.jefe')} ayuda={area?.manager_employment_id ? t('campos.jefeAyuda') : undefined}>
                {(c) => select(f.manager_id, set('manager_id'), (cat?.jefes ?? []).map((j) => ({ v: j.id, e: j.nombre })), c.id, c.idEtiqueta)}
              </FormField>
              <FormField etiqueta={t('campos.contrato')} obligatorio>
                {(c) => select(f.contract_type, set('contract_type'), TIPOS_CONTRATO.map((x) => ({ v: x, e: tc(`contratos.${x}`) })), c.id, c.idEtiqueta)}
              </FormField>
              <FormField etiqueta={t('campos.ingreso')} obligatorio>
                <CampoFecha valor={f.hire_date} onValorChange={set('hire_date')} />
              </FormField>
              {CON_FIN.includes(f.contract_type) && (
                <FormField etiqueta={t('campos.finContrato')} obligatorio>
                  <CampoFecha valor={f.contract_end_date} onValorChange={set('contract_end_date')} min={f.hire_date || undefined} />
                </FormField>
              )}
              <FormField etiqueta={t('campos.jornada')} obligatorio ayuda={t('campos.jornadaAyuda')}>
                <CampoNumero valor={f.work_hours_per_week} onValorChange={set('work_hours_per_week')} sufijo={t('campos.horas')} decimales={1} minimo={1} maximo={48} />
              </FormField>
              <FormField etiqueta={t('campos.centroCosto')} ayuda={t('campos.centroCostoAyuda')}>
                {(c) => select(f.cost_center_id, set('cost_center_id'), centros.map((x) => ({ v: x.id, e: `${x.code} ${x.name}` })), c.id, c.idEtiqueta)}
              </FormField>
            </div>
          </FormSection>
        </div>

        <div className={atenuado}>
          <FormSection
            titulo={t('secciones.salario')}
            descripcion={puedeSalario ? t('secciones.salarioNota') : t('secciones.salarioSinPermiso')}
            accion={<SensibleBadgeAlta />}
          >
            {puedeSalario ? (
              <div className="grid gap-4 sm:grid-cols-3">
                <FormField etiqueta={t('campos.salario')} obligatorio>
                  <CampoNumero valor={f.salario} onValorChange={set('salario')} prefijo={simbolo} decimales={0} minimo={1} />
                </FormField>
                <FormField etiqueta={t('campos.periodicidad')} obligatorio>
                  {(c) => select(f.salary_period, set('salary_period'), ['monthly', 'biweekly'].map((x) => ({ v: x, e: tc(`periodos.${x}`) })), c.id, c.idEtiqueta)}
                </FormField>
                <div className="sm:col-span-3">
                  <AvisoTonal tono="neutro" icono={Landmark} compacto titulo={t('campos.cuentaDespues')} />
                </div>
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                <StatusBadge estado="bloqueado" tono="neutro" icono={Lock} etiqueta={t('campos.salarioSinPermiso')} />
                <AvisoTonal tono="advertencia" compacto titulo={t('campos.tareaSalario')} />
              </div>
            )}
          </FormSection>
        </div>

        <div className={atenuado}>
          <FormSection titulo={t('secciones.seguridad')} descripcion={t('secciones.seguridadNota')}>
            <div className="grid gap-4 sm:grid-cols-3">
              {SUBSISTEMAS.map((s) => (
                <FormField key={s} etiqueta={tc(`subsistemas.${s}`)}>
                  {(c) =>
                    select(
                      f[s],
                      set(s),
                      (cat?.entidades ?? []).filter((x) => x.subsystem === s).map((x) => ({ v: x.id, e: x.name })),
                      c.id,
                      c.idEtiqueta
                    )
                  }
                </FormField>
              ))}
            </div>
          </FormSection>
        </div>

        <div className={atenuado}>
          <FormSection titulo={t('secciones.portal')}>
            <label className="flex items-start gap-3">
              <Switch checked={invitar && !!f.personal_email.trim()} disabled={!f.personal_email.trim()} onCheckedChange={setInvitar} />
              <span className="min-w-0">
                <span className="block text-sm font-medium text-fg">{t('campos.invitar')}</span>
                <span className="block text-sm text-fg-secondary">
                  {f.personal_email.trim() ? t('campos.invitarDetalle', { correo: f.personal_email.trim() }) : t('campos.invitarSinCorreo')}
                </span>
              </span>
            </label>
            <AvisoTonal className="mt-3" tono="informacion" compacto titulo={t('campos.sinUsuario')} />
          </FormSection>
        </div>

        {error && <AvisoTonal tono="peligro" rol="alert" titulo={error} accion={{ etiqueta: t('reintentar'), onClick: () => void crear() }} />}
      </div>

      <div className="sticky bottom-0 z-20 -mx-4 border-t border-line bg-surface px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:-mx-6 sm:px-6">
        <div className="mx-auto flex max-w-[1080px] flex-wrap items-center justify-between gap-3">
          <p className={bloqueado ? 'text-sm text-danger-text' : 'text-sm text-fg-secondary'}>
            {bloqueado
              ? t('pie.corrige')
              : f.hire_date && f.hire_date > getToday()
                ? t('pie.porIngresar', { fecha: fechaCorta(f.hire_date) })
                : t('pie.activo')}
          </p>
          <div className="flex gap-2">
            <button type="button" onClick={() => router.push(LISTA)} className={clasesBoton({ variante: 'secundario' })}>
              {tc('cancelar')}
            </button>
            <button
              type="button"
              onClick={() => void crear()}
              disabled={!completos || bloqueado || retiradoSinReingreso || creando}
              title={!completos ? t('pie.completa') : undefined}
              className={clasesBoton({ variante: 'primario' })}
            >
              <UserPlus aria-hidden className="size-4" strokeWidth={1.5} />
              {reingreso ? t('crearReingreso') : t('crear')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function SensibleBadgeAlta() {
  const tc = useTranslations('hrmPersonas.comun');
  return <StatusBadge estado="sensible" tono="advertencia" apariencia="contorno" icono={Lock} etiqueta={tc('sensible')} />;
}

