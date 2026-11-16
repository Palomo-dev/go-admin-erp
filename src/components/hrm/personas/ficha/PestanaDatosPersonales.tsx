'use client';

/**
 * Datos personales (Figma 95-hrm-03-02 y 03-16): identificación, nacimiento,
 * contacto y beneficiarios. Grupo «identificación»: se pide por
 * `GET /api/hrm/personas/[id]/datos/identificacion` (queda registrado) y se
 * edita directo con auditoría (decisión 6). Cargo, sede, salario y jornada no
 * se editan aquí: van por «Registrar un cambio».
 */
import { useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { Lock, Pencil, Plus, Trash2, Upload } from 'lucide-react';
import {
  AvisoTonal,
  CampoFecha,
  ConfirmDialog,
  Dialogo,
  EmptyState,
  FormField,
  Skeleton,
  StatusBadge,
  Tarjeta,
  clasesBoton,
} from '@/components/kit';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useFormatDate } from '@/lib/context/OrganizationTimezoneContext';
import { PARENTESCOS, TIPOS_DOCUMENTO, formatearNumeroDocumento, normalizarNumeroDocumento } from '@/lib/hrm/personas/catalogo';
import { edad } from '@/lib/hrm/personas/logica';
import { ErrorPersonas, guardarBasico, guardarIdentificacion, subirDocumento, useCarga } from '../apiPersonas';
import { fechaCorta } from '../textosPersonas';
import type { ContextoFicha } from './FichaEmpleado';

interface Identificacion {
  doc_type: string | null;
  doc_number: string | null;
  doc_issue_date: string | null;
  doc_issue_place: string | null;
  birth_date: string | null;
  birth_place: string | null;
  sex: string | null;
  nationality: string | null;
  marital_status: string | null;
  personal_email: string | null;
  personal_phone: string | null;
  address: string | null;
  education_level: string | null;
  updated_at: string | null;
}

export interface Beneficiario {
  id?: string;
  full_name: string;
  relationship: string;
  doc_type: string | null;
  doc_number: string | null;
  birth_date: string | null;
  is_tax_dependent?: boolean;
  is_ccf_beneficiary: boolean;
  is_health_beneficiary: boolean;
}

interface DatosIdentificacion {
  identificacion: Identificacion | null;
  beneficiarios: Beneficiario[];
}

export function SensibleBadge() {
  const t = useTranslations('hrmPersonas.comun');
  return <StatusBadge estado="sensible" tono="advertencia" apariencia="contorno" icono={Lock} etiqueta={t('sensible')} />;
}

export function PestanaDatosPersonales({ ficha, recargar: recargarFicha }: ContextoFicha) {
  const t = useTranslations('hrmPersonas.datos');
  const tc = useTranslations('hrmPersonas.comun');
  const { formatDate } = useFormatDate();
  const permiso = ficha.permisos.grupos.identificacion;
  const { carga, recargar } = useCarga<DatosIdentificacion>(permiso.ver ? `/api/hrm/personas/${ficha.persona.id}/datos/identificacion` : null);
  const [editar, setEditar] = useState(false);
  const [beneficiario, setBeneficiario] = useState<Beneficiario | null>(null);

  if (!permiso.ver || carga.estado === 'sinPermiso') {
    return (
      <EmptyState
        variante="forbidden"
        titulo={t('sinPermiso.titulo')}
        descripcion={t('sinPermiso.descripcion')}
        accion={{ etiqueta: t('sinPermiso.accion'), onClick: () => window.history.back() }}
      />
    );
  }
  if (carga.estado === 'error' || carga.estado === 'noExiste') {
    return <EmptyState variante="error" titulo={tc('errorCarga')} onReintentar={() => void recargar()} />;
  }
  if (carga.estado === 'cargando') return <Skeleton className="h-64 w-full" />;

  const i = carga.datos.identificacion;
  const hoy = ficha.hoy;
  const campo = (etiqueta: string, valor: string | null | undefined) => (
    <div className="min-w-0">
      <dt className="text-xs text-fg-secondary">{etiqueta}</dt>
      <dd className="text-sm text-fg">{valor || '—'}</dd>
    </div>
  );

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,560px)]">
      <div className="flex min-w-0 flex-col gap-4">
        <Tarjeta titulo={t('identificacion')} accion={<SensibleBadge />}>
          <dl className="grid gap-4 sm:grid-cols-2">
            {campo(t('tipoDocumento'), i?.doc_type ? tc(`documentos.${i.doc_type}`) : null)}
            {campo(t('numero'), formatearNumeroDocumento(i?.doc_number))}
            {campo(t('fechaExpedicion'), fechaCorta(i?.doc_issue_date))}
            {campo(t('lugarExpedicion'), i?.doc_issue_place)}
          </dl>
        </Tarjeta>
        <Tarjeta titulo={t('nacimiento')}>
          <dl className="grid gap-4 sm:grid-cols-2">
            {campo(t('fechaNacimiento'), i?.birth_date ? `${fechaCorta(i.birth_date)} · ${t('anios', { n: edad(i.birth_date, hoy) ?? 0 })}` : null)}
            {campo(t('lugarNacimiento'), i?.birth_place)}
            {campo(t('sexo'), i?.sex ? t(`sexos.${i.sex}`) : null)}
            {campo(t('estadoCivil'), i?.marital_status ? t(`estadosCiviles.${i.marital_status}`) : null)}
            {campo(t('nivelEducativo'), i?.education_level ? t(`niveles.${i.education_level}`) : null)}
          </dl>
        </Tarjeta>
        <Tarjeta titulo={t('contacto')}>
          <dl className="grid gap-4 sm:grid-cols-2">
            {campo(t('celular'), i?.personal_phone)}
            {campo(t('correoPersonal'), i?.personal_email)}
            {campo(t('direccion'), i?.address)}
            {campo(t('correoLaboral'), ficha.persona.work_email)}
          </dl>
        </Tarjeta>
      </div>

      <div className="flex min-w-0 flex-col gap-4">
        <Tarjeta
          titulo={t('beneficiarios')}
          accion={
            permiso.editar ? (
              <button
                type="button"
                onClick={() =>
                  setBeneficiario({ full_name: '', relationship: '', doc_type: 'RC', doc_number: '', birth_date: null, is_ccf_beneficiary: true, is_health_beneficiary: true })
                }
                className={clasesBoton({ variante: 'secundario', tamano: 'sm' })}
              >
                <Plus aria-hidden className="size-4" strokeWidth={1.5} />
                {t('agregar')}
              </button>
            ) : undefined
          }
          pie={<p className="text-xs text-fg-secondary">{t('beneficiariosNota')}</p>}
        >
          {carga.datos.beneficiarios.length === 0 ? (
            <p className="text-sm text-fg-secondary">{t('sinBeneficiarios')}</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {carga.datos.beneficiarios.map((b) => (
                <li key={b.id}>
                  <button
                    type="button"
                    disabled={!permiso.editar}
                    onClick={() => setBeneficiario(b)}
                    className="flex w-full flex-col gap-1 rounded-lg bg-subtle p-3 text-left hover:bg-hover disabled:cursor-default"
                  >
                    <span className="flex items-center justify-between gap-2">
                      <span className="text-sm font-medium text-fg">{b.full_name}</span>
                      <StatusBadge estado="parentesco" tono="neutro" etiqueta={tc(`parentescos.${b.relationship}`)} />
                    </span>
                    <span className="text-xs text-fg-secondary">
                      {[b.doc_number ? `${b.doc_type ?? ''} ${formatearNumeroDocumento(b.doc_number)}` : null, b.birth_date ? t('nacio', { fecha: fechaCorta(b.birth_date) }) : null]
                        .filter(Boolean)
                        .join(' · ')}
                    </span>
                    <span className="text-xs text-fg-muted">
                      {t('cubre', {
                        lista: [b.is_health_beneficiary ? t('eps') : null, b.is_ccf_beneficiary ? t('ccf') : null].filter(Boolean).join(' · ') || '—',
                      })}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Tarjeta>
        <AvisoTonal
          tono="informacion"
          titulo={t('auditoria', {
            fecha: i?.updated_at ? formatDate(i.updated_at) : '—',
            nombre: ficha.persona.actualizado_por ?? '—',
          })}
        />
        {permiso.editar && (
          <button type="button" onClick={() => setEditar(true)} className={clasesBoton({ variante: 'secundario', className: 'w-full' })}>
            <Pencil aria-hidden className="size-4" strokeWidth={1.5} />
            {t('editar')}
          </button>
        )}
      </div>

      {editar && (
        <DialogoDatosPersonales
          ficha={ficha}
          identificacion={i}
          onCerrar={() => setEditar(false)}
          onGuardado={() => {
            setEditar(false);
            void recargar();
            void recargarFicha();
          }}
        />
      )}
      {beneficiario && (
        <DialogoBeneficiario
          personaId={ficha.persona.id}
          nombrePersona={ficha.persona.nombre}
          hoy={hoy}
          valor={beneficiario}
          onCerrar={() => setBeneficiario(null)}
          onGuardado={() => {
            setBeneficiario(null);
            void recargar();
          }}
        />
      )}
    </div>
  );
}

function DialogoDatosPersonales({
  ficha,
  identificacion,
  onCerrar,
  onGuardado,
}: {
  ficha: ContextoFicha['ficha'];
  identificacion: Identificacion | null;
  onCerrar: () => void;
  onGuardado: () => void;
}) {
  const t = useTranslations('hrmPersonas.datos');
  const tc = useTranslations('hrmPersonas.comun');
  const [f, setF] = useState({
    first_name: ficha.persona.first_name ?? '',
    second_name: ficha.persona.second_name ?? '',
    last_name: ficha.persona.last_name ?? '',
    second_last_name: ficha.persona.second_last_name ?? '',
    work_email: ficha.persona.work_email ?? '',
    doc_type: identificacion?.doc_type ?? 'CC',
    doc_number: identificacion?.doc_number ?? '',
    doc_issue_date: identificacion?.doc_issue_date ?? '',
    doc_issue_place: identificacion?.doc_issue_place ?? '',
    birth_date: identificacion?.birth_date ?? '',
    birth_place: identificacion?.birth_place ?? '',
    sex: identificacion?.sex ?? '',
    marital_status: identificacion?.marital_status ?? '',
    education_level: identificacion?.education_level ?? '',
    personal_phone: identificacion?.personal_phone ?? '',
    personal_email: identificacion?.personal_email ?? '',
    address: identificacion?.address ?? '',
  });
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = (k: keyof typeof f) => (v: string) => setF((x) => ({ ...x, [k]: v }));
  const nulo = (v: string) => (v.trim() === '' ? null : v.trim());

  const guardar = async () => {
    setGuardando(true);
    setError(null);
    try {
      if (ficha.permisos.editar_basico) {
        await guardarBasico(ficha.persona.id, {
          first_name: f.first_name,
          second_name: f.second_name,
          last_name: f.last_name,
          second_last_name: f.second_last_name,
          work_email: f.work_email,
        });
      }
      await guardarIdentificacion(ficha.persona.id, {
        identificacion: {
          doc_type: f.doc_type,
          doc_number: normalizarNumeroDocumento(f.doc_number),
          doc_issue_date: nulo(f.doc_issue_date),
          doc_issue_place: nulo(f.doc_issue_place),
          birth_date: nulo(f.birth_date),
          birth_place: nulo(f.birth_place),
          sex: nulo(f.sex),
          marital_status: nulo(f.marital_status),
          education_level: nulo(f.education_level),
          personal_phone: nulo(f.personal_phone),
          personal_email: nulo(f.personal_email),
          address: nulo(f.address),
        },
      });
      toast.success(t('guardado'));
      onGuardado();
    } catch (e) {
      setError(e instanceof ErrorPersonas && e.codigo === 'documento_duplicado' ? t('errorDuplicado') : tc('errorGuardar'));
    } finally {
      setGuardando(false);
    }
  };

  const opciones = (k: 'sexos' | 'estadosCiviles' | 'niveles', valores: string[], valor: string, onChange: (v: string) => void, id: string, idEtiqueta: string) => (
    <Select value={valor || undefined} onValueChange={onChange}>
      <SelectTrigger id={id} aria-labelledby={idEtiqueta} className="h-10 border-line-strong bg-surface">
        <SelectValue placeholder={tc('elegir')} />
      </SelectTrigger>
      <SelectContent>
        {valores.map((v) => (
          <SelectItem key={v} value={v}>
            {t(`${k}.${v}`)}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );

  return (
    <Dialogo
      abierto
      onAbiertoChange={(a) => !a && onCerrar()}
      titulo={t('editar')}
      descripcion={ficha.persona.nombre}
      ancho={672}
      primario={{ etiqueta: tc('guardar'), onClick: () => void guardar(), cargando: guardando, deshabilitada: !f.first_name.trim() || !f.doc_number.trim() }}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField etiqueta={t('nombres')} obligatorio>
          <Input value={f.first_name} onChange={(e) => set('first_name')(e.target.value)} className="h-10" />
        </FormField>
        <FormField etiqueta={t('segundoNombre')}>
          <Input value={f.second_name} onChange={(e) => set('second_name')(e.target.value)} className="h-10" />
        </FormField>
        <FormField etiqueta={t('apellidos')} obligatorio>
          <Input value={f.last_name} onChange={(e) => set('last_name')(e.target.value)} className="h-10" />
        </FormField>
        <FormField etiqueta={t('segundoApellido')}>
          <Input value={f.second_last_name} onChange={(e) => set('second_last_name')(e.target.value)} className="h-10" />
        </FormField>
        <FormField etiqueta={t('tipoDocumento')} obligatorio>
          {(c) => (
            <Select value={f.doc_type} onValueChange={set('doc_type')}>
              <SelectTrigger id={c.id} aria-labelledby={c.idEtiqueta} className="h-10 border-line-strong bg-surface">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TIPOS_DOCUMENTO.map((d) => (
                  <SelectItem key={d} value={d}>
                    {tc(`documentos.${d}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </FormField>
        <FormField etiqueta={t('numero')} obligatorio>
          <Input value={f.doc_number} onChange={(e) => set('doc_number')(e.target.value)} className="h-10" />
        </FormField>
        <FormField etiqueta={t('fechaExpedicion')}>
          <CampoFecha valor={f.doc_issue_date} onValorChange={set('doc_issue_date')} limpiable />
        </FormField>
        <FormField etiqueta={t('lugarExpedicion')}>
          <Input value={f.doc_issue_place} onChange={(e) => set('doc_issue_place')(e.target.value)} className="h-10" />
        </FormField>
        <FormField etiqueta={t('fechaNacimiento')}>
          <CampoFecha valor={f.birth_date} onValorChange={set('birth_date')} limpiable />
        </FormField>
        <FormField etiqueta={t('lugarNacimiento')}>
          <Input value={f.birth_place} onChange={(e) => set('birth_place')(e.target.value)} className="h-10" />
        </FormField>
        <FormField etiqueta={t('sexo')}>{(c) => opciones('sexos', ['M', 'F', 'X'], f.sex, set('sex'), c.id, c.idEtiqueta)}</FormField>
        <FormField etiqueta={t('estadoCivil')}>
          {(c) => opciones('estadosCiviles', ['soltero', 'casado', 'union_libre', 'separado', 'viudo'], f.marital_status, set('marital_status'), c.id, c.idEtiqueta)}
        </FormField>
        <FormField etiqueta={t('nivelEducativo')}>
          {(c) =>
            opciones('niveles', ['primaria', 'bachiller', 'tecnico', 'tecnologo', 'profesional', 'posgrado'], f.education_level, set('education_level'), c.id, c.idEtiqueta)
          }
        </FormField>
        <FormField etiqueta={t('celular')}>
          <Input value={f.personal_phone} onChange={(e) => set('personal_phone')(e.target.value)} className="h-10" inputMode="tel" />
        </FormField>
        <FormField etiqueta={t('correoPersonal')}>
          <Input value={f.personal_email} onChange={(e) => set('personal_email')(e.target.value)} className="h-10" type="email" />
        </FormField>
        <FormField etiqueta={t('correoLaboral')}>
          <Input value={f.work_email} onChange={(e) => set('work_email')(e.target.value)} className="h-10" type="email" />
        </FormField>
        <FormField etiqueta={t('direccion')} className="sm:col-span-2">
          <Input value={f.address} onChange={(e) => set('address')(e.target.value)} className="h-10" />
        </FormField>
      </div>
      <AvisoTonal className="mt-4" tono="informacion" compacto titulo={t('editarNota')} />
      {error && <AvisoTonal className="mt-3" tono="peligro" rol="alert" titulo={error} />}
    </Dialogo>
  );
}

function DialogoBeneficiario({
  personaId,
  nombrePersona,
  hoy,
  valor,
  onCerrar,
  onGuardado,
}: {
  personaId: string;
  nombrePersona: string;
  hoy: string;
  valor: Beneficiario;
  onCerrar: () => void;
  onGuardado: () => void;
}) {
  const t = useTranslations('hrmPersonas.datos');
  const tc = useTranslations('hrmPersonas.comun');
  const partes = valor.full_name.split(' ');
  const [nombres, setNombres] = useState(partes.slice(0, Math.max(1, partes.length - 2)).join(' '));
  const [apellidos, setApellidos] = useState(partes.length > 1 ? partes.slice(Math.max(1, partes.length - 2)).join(' ') : '');
  const [b, setB] = useState<Beneficiario>(valor);
  const [archivo, setArchivo] = useState<File | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [quitar, setQuitar] = useState(false);
  const menor = useMemo(() => (b.birth_date ? (edad(b.birth_date, hoy) ?? 99) < 18 : false), [b.birth_date, hoy]);

  const guardar = async (activo = true) => {
    setGuardando(true);
    try {
      await guardarIdentificacion(personaId, {
        beneficiarios: [
          {
            ...(b.id ? { id: b.id } : {}),
            full_name: `${nombres.trim()} ${apellidos.trim()}`.trim(),
            relationship: b.relationship,
            doc_type: b.doc_type,
            doc_number: b.doc_number ? normalizarNumeroDocumento(b.doc_number) : null,
            birth_date: b.birth_date,
            is_ccf_beneficiary: b.is_ccf_beneficiary,
            is_health_beneficiary: b.is_health_beneficiary,
            is_active: activo,
          },
        ],
      });
      if (archivo && activo) await subirDocumento(personaId, archivo, 'registro_civil_beneficiario');
      toast.success(activo ? t('beneficiarioGuardado') : t('beneficiarioQuitado'));
      onGuardado();
    } catch {
      toast.error(tc('errorGuardar'));
    } finally {
      setGuardando(false);
    }
  };

  return (
    <>
      <Dialogo
        abierto
        onAbiertoChange={(a) => !a && onCerrar()}
        titulo={b.id ? t('editarBeneficiario') : t('nuevoBeneficiario')}
        descripcion={nombrePersona}
        ancho={520}
        primario={{
          etiqueta: tc('guardar'),
          onClick: () => void guardar(true),
          cargando: guardando,
          deshabilitada: !nombres.trim() || !apellidos.trim() || !b.relationship || !b.doc_number || !b.birth_date,
        }}
        secundarios={b.id ? [{ etiqueta: t('quitarBeneficiario'), onClick: () => setQuitar(true), destructiva: true }] : undefined}
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField etiqueta={t('nombres')} obligatorio>
            <Input value={nombres} onChange={(e) => setNombres(e.target.value)} className="h-10" />
          </FormField>
          <FormField etiqueta={t('apellidos')} obligatorio>
            <Input value={apellidos} onChange={(e) => setApellidos(e.target.value)} className="h-10" />
          </FormField>
          <FormField etiqueta={t('tipoDocumento')} obligatorio>
            {(c) => (
              <Select value={b.doc_type ?? undefined} onValueChange={(v) => setB((x) => ({ ...x, doc_type: v }))}>
                <SelectTrigger id={c.id} aria-labelledby={c.idEtiqueta} className="h-10 border-line-strong bg-surface">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TIPOS_DOCUMENTO.map((d) => (
                    <SelectItem key={d} value={d}>
                      {tc(`documentos.${d}`)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </FormField>
          <FormField etiqueta={t('numero')} obligatorio>
            <Input value={b.doc_number ?? ''} onChange={(e) => setB((x) => ({ ...x, doc_number: e.target.value }))} className="h-10" />
          </FormField>
          <FormField etiqueta={t('parentesco')} obligatorio>
            {(c) => (
              <Select value={b.relationship || undefined} onValueChange={(v) => setB((x) => ({ ...x, relationship: v }))}>
                <SelectTrigger id={c.id} aria-labelledby={c.idEtiqueta} className="h-10 border-line-strong bg-surface">
                  <SelectValue placeholder={tc('elegir')} />
                </SelectTrigger>
                <SelectContent>
                  {PARENTESCOS.map((p) => (
                    <SelectItem key={p} value={p}>
                      {tc(`parentescos.${p}`)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </FormField>
          <FormField etiqueta={t('fechaNacimiento')} obligatorio>
            <CampoFecha valor={b.birth_date} onValorChange={(v) => setB((x) => ({ ...x, birth_date: v || null }))} max={hoy} />
          </FormField>
        </div>
        <fieldset className="mt-4">
          <legend className="mb-2 text-sm font-medium text-fg">{t('loCubre')}</legend>
          <div className="flex flex-wrap gap-4">
            <label className="flex items-center gap-2 text-sm text-fg">
              <Checkbox checked={b.is_health_beneficiary} onCheckedChange={(v) => setB((x) => ({ ...x, is_health_beneficiary: v === true }))} />
              {t('eps')}
            </label>
            <label className="flex items-center gap-2 text-sm text-fg">
              <Checkbox checked={b.is_ccf_beneficiary} onCheckedChange={(v) => setB((x) => ({ ...x, is_ccf_beneficiary: v === true }))} />
              {t('ccf')}
            </label>
          </div>
        </fieldset>
        <div className="mt-4 flex flex-wrap items-center gap-3 rounded-lg bg-subtle p-3">
          <Upload aria-hidden className="size-5 text-fg-secondary" strokeWidth={1.5} />
          <p className="min-w-0 flex-1 text-sm text-fg">
            {t('soporteBeneficiario')}
            {archivo ? <span className="block truncate text-xs text-fg-secondary">{archivo.name}</span> : null}
          </p>
          <label className={clasesBoton({ variante: 'secundario', tamano: 'sm' })}>
            {tc('subir')}
            <input type="file" className="sr-only" accept="application/pdf,image/jpeg,image/png,image/webp,image/heic" onChange={(e) => setArchivo(e.target.files?.[0] ?? null)} />
          </label>
        </div>
        {menor && <AvisoTonal className="mt-4" tono="neutro" icono={Lock} compacto titulo={t('menor')} />}
      </Dialogo>
      <ConfirmDialog
        abierto={quitar}
        onAbiertoChange={setQuitar}
        titulo={t('quitarTitulo')}
        descripcion={t('quitarDescripcion', { nombre: `${nombres} ${apellidos}`.trim() })}
        textoConfirmar={t('quitarBeneficiario')}
        tono="peligro"
        icono={Trash2}
        cargando={guardando}
        onConfirmar={() => guardar(false)}
      />
    </>
  );
}
