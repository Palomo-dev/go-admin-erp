'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Building2,
  CalendarDays,
  FileText,
  Landmark,
  Loader2,
  MapPin,
  Phone,
  Save,
  Search,
  Sparkles,
  User,
  Wand2,
} from 'lucide-react';
import { FormField, FormSection, PageHeader, SegmentedControl } from '@/components/kit';
import ImageUploader from '@/components/common/ImageUploader';
import { HabeasDataCheckbox } from '@/components/shared/DianLookupButton';
import { RichTextEditor } from '@/components/shared/RichTextEditor';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { PhoneInput } from '@/components/ui/phone-input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/components/ui/use-toast';
import { getOrganizationId, getOrganizationName, useOrganization } from '@/lib/hooks/useOrganization';
import type { DianNormalizedData } from '@/lib/services/dianLookupService';
import { supplierService, type Supplier, type SupplierInput } from '@/lib/services/supplierService';
import { supabase } from '@/lib/supabase/config';
import { calcularDv, mapearTipoDocADian } from '@/lib/utils/nitDv';
import { mensajeErrorTelefono } from '@/lib/utils/telefono';
import { cn } from '@/utils/Utils';
import {
  CONDICIONES_PAGO,
  REGIMENES_TRIBUTARIOS,
  RESPONSABILIDADES_FISCALES,
  TIPOS_CUENTA,
  TIPOS_DOCUMENTO_DIAN,
} from './formato';
import { RUTA_PROVEEDORES } from './useAccionesProveedor';

type TipoProveedor = 'person' | 'company';

export interface ProveedorFormProps {
  modo: 'nuevo' | 'editar';
  /** Solo en `editar`. */
  supplierUuid?: string;
  /** Tras crear, en lugar de navegar (uso en diálogos). */
  onSuccess?: (supplier: Supplier) => void;
  onCancel?: () => void;
  /** Dentro de un diálogo: sin cabecera de página, botones al pie. */
  embedded?: boolean;
}

interface TipoDocumento {
  value: string;
  label: string;
  forCompany: boolean;
  forPerson: boolean;
}

const TIPOS_DOC_RESPALDO: TipoDocumento[] = [
  { value: 'tax_id', label: 'ID tributario / fiscal', forCompany: true, forPerson: true },
  { value: 'national_id', label: 'Documento nacional', forCompany: false, forPerson: true },
  { value: 'passport', label: 'Pasaporte', forCompany: false, forPerson: true },
  { value: 'other', label: 'Otro', forCompany: true, forPerson: true },
];

const FORM_VACIO: SupplierInput = {
  name: '',
  nit: '',
  doc_type: '',
  contact: '',
  phone: '',
  email: '',
  notes: '',
  description: '',
  logo_url: '',
  address: '',
  city: '',
  state: '',
  country: 'Colombia',
  postal_code: '',
  tax_id: '',
  tax_regime: '',
  fiscal_responsibilities: [],
  payment_terms: '',
  credit_days: undefined,
  website: '',
  bank_name: '',
  bank_account: '',
  account_type: '',
  dv: '',
  municipality_code: '',
  identification_document_code: '31',
  country_code: 'CO',
  legal_organization_code: '1',
  trade_name: '',
  is_active: true,
};

/** De la fila guardada al formulario, sin inventar valores (auditoría §J). */
function desdeProveedor(s: Supplier): SupplierInput {
  return {
    name: s.name ?? '',
    nit: s.nit ?? '',
    doc_type: s.doc_type ?? '',
    contact: s.contact ?? '',
    phone: s.phone ?? '',
    email: s.email ?? '',
    notes: s.notes ?? '',
    description: s.description ?? '',
    logo_url: s.logo_url ?? '',
    address: s.address ?? '',
    city: s.city ?? '',
    state: s.state ?? '',
    country: s.country ?? 'Colombia',
    postal_code: s.postal_code ?? '',
    tax_id: s.tax_id ?? '',
    tax_regime: s.tax_regime ?? '',
    fiscal_responsibilities: s.fiscal_responsibilities ?? [],
    payment_terms: s.payment_terms ?? '',
    credit_days: s.credit_days ?? undefined,
    website: s.website ?? '',
    bank_name: s.bank_name ?? '',
    bank_account: s.bank_account ?? '',
    account_type: s.account_type ?? '',
    dv: s.dv ?? '',
    municipality_code: s.municipality_code ?? '',
    // Editar ya no fuerza «31» y «1» cuando vienen vacíos: una persona natural
    // quedaba con el código DIAN de empresa.
    identification_document_code: s.identification_document_code ?? '',
    country_code: s.country_code ?? 'CO',
    legal_organization_code: s.legal_organization_code ?? '',
    trade_name: s.trade_name ?? '',
    is_active: s.is_active ?? true,
  };
}

const CLASE_TRIGGER = 'h-10 border-line-strong bg-surface text-fg';

/**
 * Un solo formulario para crear y editar proveedores (Figma «Nuevo proveedor
 * — el mismo formulario sirve para editar»). Editar ya no pierde el tipo, el
 * proveedor padre, el tipo de documento ni las responsabilidades fiscales, y
 * la descripción y las notas se editan con el mismo editor enriquecido con el
 * que se crean.
 */
export function ProveedorForm({ modo, supplierUuid, onSuccess, onCancel, embedded = false }: ProveedorFormProps) {
  const router = useRouter();
  const { toast } = useToast();
  const { organization } = useOrganization();
  const editando = modo === 'editar';

  const [form, setForm] = useState<SupplierInput>(FORM_VACIO);
  const [tipo, setTipo] = useState<TipoProveedor>('company');
  const [padreId, setPadreId] = useState<string>('');
  const [supplierId, setSupplierId] = useState<number | null>(null);
  const [errores, setErrores] = useState<Record<string, string>>({});
  const [cargando, setCargando] = useState(editando);
  const [guardando, setGuardando] = useState<null | 'guardar' | 'otro'>(null);
  const [generandoDesc, setGenerandoDesc] = useState(false);
  const [generandoLogo, setGenerandoLogo] = useState(false);
  const [habeasData, setHabeasData] = useState(false);
  const [consultandoDian, setConsultandoDian] = useState(false);
  const [tiposDocumento, setTiposDocumento] = useState<TipoDocumento[]>(TIPOS_DOC_RESPALDO);
  const [empresas, setEmpresas] = useState<{ id: number; name: string }[]>([]);
  const [claveUploader, setClaveUploader] = useState(0);

  const volverA = editando && supplierUuid ? `${RUTA_PROVEEDORES}/${supplierUuid}` : RUTA_PROVEEDORES;

  const cambiar = useCallback(<K extends keyof SupplierInput>(campo: K, valor: SupplierInput[K]) => {
    setForm((prev) => ({ ...prev, [campo]: valor }));
    setErrores((prev) => (prev[campo as string] ? { ...prev, [campo as string]: '' } : prev));
  }, []);

  // ── Carga del proveedor (editar) ────────────────────────────────────────
  useEffect(() => {
    if (!editando || !supplierUuid) return;
    let cancelado = false;
    (async () => {
      setCargando(true);
      const { data, error } = await supplierService.getSupplierByUuid(supplierUuid, getOrganizationId());
      if (cancelado) return;
      if (error || !data) {
        toast({ variant: 'destructive', title: 'Error', description: error?.message || 'Proveedor no encontrado' });
        router.push(RUTA_PROVEEDORES);
        return;
      }
      setForm(desdeProveedor(data));
      setTipo(data.supplier_type === 'person' ? 'person' : 'company');
      setPadreId(data.parent_supplier_id ? String(data.parent_supplier_id) : '');
      setSupplierId(data.id);
      setCargando(false);
    })();
    return () => {
      cancelado = true;
    };
  }, [editando, supplierUuid, router, toast]);

  // ── Tipos de documento del país de la organización ──────────────────────
  useEffect(() => {
    if (!organization?.id) return;
    let cancelado = false;
    (async () => {
      try {
        const { data: org } = await supabase.from('organizations').select('country_code').eq('id', organization.id).single();
        const pais = org?.country_code || 'GEN';
        const consultar = (codigo: string) =>
          supabase
            .from('country_identification_types')
            .select('code, name, for_company, for_person')
            .eq('country_code', codigo)
            .eq('is_active', true)
            .order('sort_order');
        let { data: tipos } = await consultar(pais);
        if (!tipos || tipos.length === 0) ({ data: tipos } = await consultar('GEN'));
        if (!cancelado && tipos && tipos.length > 0) {
          setTiposDocumento(tipos.map((t) => ({ value: t.code, label: t.name, forCompany: t.for_company, forPerson: t.for_person })));
        }
      } catch (err) {
        console.error('Error cargando tipos de documento:', err);
      }
    })();
    return () => {
      cancelado = true;
    };
  }, [organization?.id]);

  // ── Empresas proveedoras (posibles padres de una persona natural) ───────
  useEffect(() => {
    let cancelado = false;
    (async () => {
      const orgId = getOrganizationId();
      if (!orgId) return;
      const { data } = await supabase
        .from('suppliers')
        .select('id, name')
        .eq('organization_id', orgId)
        .eq('supplier_type', 'company')
        .order('name');
      if (!cancelado && data) setEmpresas(data);
    })();
    return () => {
      cancelado = true;
    };
  }, [organization?.id]);

  const tiposVisibles = useMemo(
    () => tiposDocumento.filter((t) => (tipo === 'company' ? t.forCompany : t.forPerson)),
    [tiposDocumento, tipo],
  );

  // En el alta, el tipo de documento por defecto es el primero válido para el
  // tipo de proveedor. Al editar se respeta lo guardado.
  useEffect(() => {
    if (editando || tiposVisibles.length === 0) return;
    setForm((prev) =>
      tiposVisibles.some((t) => t.value === prev.doc_type)
        ? prev
        : {
            ...prev,
            doc_type: tiposVisibles[0].value,
            identification_document_code: mapearTipoDocADian(tiposVisibles[0].value) || prev.identification_document_code,
          },
    );
  }, [editando, tiposVisibles]);

  // El código DIAN y el tipo de organización se derivan de lo que el usuario
  // elige, no de un efecto que pise lo guardado al abrir «Editar».
  const elegirTipo = (t: TipoProveedor) => {
    setTipo(t);
    setForm((prev) => ({ ...prev, legal_organization_code: t === 'company' ? '1' : '2' }));
    if (t === 'company') setPadreId('');
  };
  const elegirTipoDocumento = (v: string) => {
    setForm((prev) => ({ ...prev, doc_type: v, identification_document_code: mapearTipoDocADian(v) || prev.identification_document_code }));
  };

  // ── DIAN / RUES ─────────────────────────────────────────────────────────
  const aplicarDian = (d: DianNormalizedData) => {
    const cambios: Partial<SupplierInput> = {};
    if (d.name) cambios.name = d.name;
    if (d.email) cambios.email = d.email;
    if (d.phone) cambios.phone = d.phone;
    if (d.address) cambios.address = d.address;
    if (d.city) cambios.city = d.city;
    if (d.state) cambios.state = d.state;
    if (d.taxRegime) cambios.tax_regime = d.taxRegime;
    if (d.fiscalResponsibilities && d.fiscalResponsibilities.length > 0) cambios.fiscal_responsibilities = d.fiscalResponsibilities;
    if (Object.keys(cambios).length > 0) setForm((prev) => ({ ...prev, ...cambios }));
  };

  const consultarDocumento = async () => {
    const numero = form.nit ?? '';
    if (numero.length < 4 || !habeasData) return;
    setConsultandoDian(true);
    try {
      const res = await fetch('/api/dian/lookup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ documentType: form.doc_type || 'tax_id', documentNumber: numero, organizationId: organization?.id }),
      });
      const json = await res.json();
      if (json.success && json.data) aplicarDian(json.data);
    } catch (err) {
      console.error('Error consulta DIAN:', err);
    } finally {
      setConsultandoDian(false);
    }
  };

  const calcularDigito = () => {
    const nitLimpio = (form.nit || '').replace(/[^0-9]/g, '');
    if (!nitLimpio) {
      toast({ title: 'Ingresa el NIT primero', variant: 'destructive' });
      return;
    }
    const dv = calcularDv(nitLimpio);
    if (dv !== null) {
      cambiar('dv', String(dv));
      toast({ title: 'DV calculado', description: `Dígito de verificación: ${dv}` });
    }
  };

  // ── IA ──────────────────────────────────────────────────────────────────
  const generarDescripcion = async () => {
    if (!form.name.trim()) {
      toast({ title: 'Escribe el nombre primero', variant: 'destructive' });
      return;
    }
    setGenerandoDesc(true);
    try {
      const res = await fetch('/api/ai-assistant/improve-text', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ productName: form.name, currentDescription: form.description || '', type: 'supplier_description' }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.improvedText) cambiar('description', data.improvedText);
        toast({ title: 'Descripción generada con IA' });
      }
    } catch {
      toast({ title: 'Error', description: 'No se pudo generar la descripción.', variant: 'destructive' });
    } finally {
      setGenerandoDesc(false);
    }
  };

  const generarLogo = async () => {
    if (!form.name.trim()) {
      toast({ title: 'Escribe el nombre primero', variant: 'destructive' });
      return;
    }
    setGenerandoLogo(true);
    try {
      const res = await fetch('/api/ai-assistant/generate-image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          productName: form.name,
          description: `Logo profesional para proveedor: ${form.name}`,
          organizationId: organization?.id || 0,
        }),
      });
      if (!res.ok) throw new Error('Error generando logo');
      const data = await res.json();
      if (data.imageUrl) {
        cambiar('logo_url', data.imageUrl);
        toast({ title: 'Logo generado con IA' });
      }
    } catch {
      toast({ title: 'Error', description: 'No se pudo generar el logo.', variant: 'destructive' });
    } finally {
      setGenerandoLogo(false);
    }
  };

  // ── Guardar ─────────────────────────────────────────────────────────────
  const validar = (): boolean => {
    const nuevos: Record<string, string> = {};
    if (!form.name.trim()) nuevos.name = tipo === 'company' ? 'Escribe la razón social' : 'Escribe el nombre completo';
    if (form.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) nuevos.email = 'Correo inválido';
    const errorTelefono = mensajeErrorTelefono(form.phone);
    if (errorTelefono) nuevos.phone = errorTelefono;
    setErrores(nuevos);
    return Object.keys(nuevos).length === 0;
  };

  const guardar = async (crearOtro: boolean) => {
    if (!validar()) return;
    setGuardando(crearOtro ? 'otro' : 'guardar');
    try {
      const orgId = getOrganizationId();
      const payload: SupplierInput = {
        ...form,
        supplier_type: tipo,
        parent_supplier_id: tipo === 'person' && padreId ? parseInt(padreId, 10) : null,
      };
      if (editando && supplierUuid) {
        const { error } = await supplierService.updateSupplier(supplierUuid, orgId, payload);
        if (error) throw error;
        toast({ title: 'Proveedor actualizado', description: 'Los cambios han sido guardados correctamente' });
        router.push(`${RUTA_PROVEEDORES}/${supplierUuid}`);
        return;
      }
      const { data, error } = await supplierService.createSupplier(orgId, payload);
      if (error) throw error;
      toast({ title: 'Proveedor creado', description: 'El proveedor ha sido creado correctamente' });
      if (crearOtro) {
        setForm({ ...FORM_VACIO, doc_type: tiposVisibles[0]?.value ?? '' });
        setTipo('company');
        setPadreId('');
        setHabeasData(false);
        setClaveUploader((n) => n + 1);
        if (typeof window !== 'undefined') window.scrollTo({ top: 0, behavior: 'smooth' });
        return;
      }
      if (onSuccess && data) onSuccess(data);
      else router.push(data?.uuid ? `${RUTA_PROVEEDORES}/${data.uuid}` : RUTA_PROVEEDORES);
    } catch (error: unknown) {
      console.error('Error guardando proveedor:', error);
      toast({
        variant: 'destructive',
        title: 'Error',
        description:
          (error instanceof Error && error.message) || (editando ? 'No se pudo actualizar el proveedor' : 'No se pudo crear el proveedor'),
      });
    } finally {
      setGuardando(null);
    }
  };

  const descartar = () => {
    if (onCancel) onCancel();
    else router.push(volverA);
  };

  const idFormulario = embedded ? 'proveedor-form-embebido' : 'proveedor-form';

  const botonGuardar = (
    <button
      type="submit"
      form={idFormulario}
      disabled={!!guardando || cargando}
      className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-brand-action px-4 text-sm font-medium text-fg-on-brand hover:bg-brand-action-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 disabled:opacity-60"
    >
      {guardando === 'guardar' ? (
        <Loader2 aria-hidden="true" className="size-4 animate-spin" />
      ) : (
        <Save aria-hidden="true" className="size-4" strokeWidth={1.5} />
      )}
      {editando ? 'Guardar cambios' : 'Guardar proveedor'}
    </button>
  );

  const botonesSecundarios = (
    <>
      <button
        type="button"
        onClick={descartar}
        disabled={!!guardando}
        className="inline-flex h-10 items-center justify-center rounded-lg px-4 text-sm font-medium text-fg hover:bg-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand disabled:opacity-60"
      >
        {embedded ? 'Cancelar' : 'Descartar'}
      </button>
      {!editando && !embedded && (
        <button
          type="button"
          onClick={() => guardar(true)}
          disabled={!!guardando}
          className="inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-line-strong bg-surface px-4 text-sm font-medium text-fg hover:bg-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand disabled:opacity-60"
        >
          {guardando === 'otro' && <Loader2 aria-hidden="true" className="size-4 animate-spin" />}
          Guardar y crear otro
        </button>
      )}
    </>
  );

  const cabecera = !embedded && (
    <PageHeader
      variante="form"
      volverA={volverA}
      titulo={editando ? 'Editar proveedor' : 'Nuevo proveedor'}
      subtitulo={
        editando
          ? form.name || 'Modifica la información del proveedor'
          : [getOrganizationName(), 'Registra a quién le compras'].filter(Boolean).join(' · ')
      }
      cargando={cargando}
      migas={[
        { etiqueta: 'Inventario', href: '/app/inventario' },
        { etiqueta: 'Proveedores', href: RUTA_PROVEEDORES },
        ...(editando && supplierUuid ? [{ etiqueta: form.name || 'Proveedor', href: `${RUTA_PROVEEDORES}/${supplierUuid}` }] : []),
        { etiqueta: editando ? 'Editar' : 'Nuevo proveedor' },
      ]}
      acciones={
        <>
          {botonesSecundarios}
          {botonGuardar}
        </>
      }
      movil={{
        ocultarBarra: true,
        accion: (
          <button
            type="submit"
            form={idFormulario}
            disabled={!!guardando || cargando}
            className="inline-flex h-9 items-center rounded-lg px-3 text-sm font-semibold text-link hover:bg-hover disabled:opacity-60"
          >
            {guardando ? <Loader2 aria-hidden="true" className="size-4 animate-spin" /> : 'Guardar'}
          </button>
        ),
      }}
    />
  );

  if (cargando) {
    return (
      <div className="flex flex-col gap-4">
        {cabecera}
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <div className="flex flex-col gap-4 lg:col-span-2">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-56 w-full rounded-xl" />
            ))}
          </div>
          <Skeleton className="h-40 w-full rounded-xl" />
        </div>
      </div>
    );
  }

  const esEmpresa = tipo === 'company';
  const opcionesRegimen = REGIMENES_TRIBUTARIOS.some((r) => r.valor === form.tax_regime) || !form.tax_regime
    ? REGIMENES_TRIBUTARIOS
    : [...REGIMENES_TRIBUTARIOS, { valor: form.tax_regime, etiqueta: form.tax_regime }];
  const responsabilidades = form.fiscal_responsibilities ?? [];
  const otrasResponsabilidades = responsabilidades.filter((r) => !RESPONSABILIDADES_FISCALES.some((c) => c.valor === r));
  const alternarResponsabilidad = (codigo: string, marcada: boolean) =>
    cambiar('fiscal_responsibilities', marcada ? [...responsabilidades, codigo] : responsabilidades.filter((r) => r !== codigo));
  const empresasPadre = empresas.filter((e) => e.id !== supplierId);

  return (
    <div className="flex flex-col gap-4">
      {cabecera}

      <form
        id={idFormulario}
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          guardar(false);
        }}
        className={cn('grid grid-cols-1 gap-4 lg:grid-cols-3', embedded && 'p-4 sm:p-6')}
      >
        <div className="flex min-w-0 flex-col gap-4 lg:col-span-2">
          {/* ── Identificación ── */}
          <FormSection
            titulo="Identificación"
            descripcion="Tipo, documento y nombre. Consulta la DIAN para completar."
            icono={Building2}
            colapsable
          >
            <SegmentedControl
              etiqueta="Tipo de proveedor"
              valor={tipo}
              onValorChange={elegirTipo}
              className="w-fit"
              opciones={[
                { valor: 'company', etiqueta: 'Empresa', icono: Building2 },
                { valor: 'person', etiqueta: 'Persona natural', icono: User },
              ]}
            />
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_88px]">
              <FormField etiqueta="Tipo de documento">
                {(c) => (
                  <Select value={form.doc_type || undefined} onValueChange={elegirTipoDocumento}>
                    <SelectTrigger id={c.id} aria-labelledby={c.idEtiqueta} className={CLASE_TRIGGER}>
                      <SelectValue placeholder="Seleccionar" />
                    </SelectTrigger>
                    <SelectContent>
                      {tiposVisibles.map((t) => (
                        <SelectItem key={t.value} value={t.value}>
                          {t.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </FormField>
              <FormField etiqueta="Número" ayuda={!form.nit ? 'Sin documento no se le puede registrar factura.' : undefined}>
                <Input
                  value={form.nit ?? ''}
                  onChange={(e) => cambiar('nit', e.target.value)}
                  onBlur={() => consultarDocumento()}
                  placeholder="900123456"
                  inputMode="text"
                  autoComplete="off"
                />
              </FormField>
              <FormField
                etiqueta="DV"
                extra={
                  <button
                    type="button"
                    onClick={calcularDigito}
                    disabled={!form.nit}
                    className="text-xs font-medium text-link hover:underline disabled:opacity-50"
                  >
                    Calcular
                  </button>
                }
              >
                <Input value={form.dv ?? ''} onChange={(e) => cambiar('dv', e.target.value.slice(0, 1))} maxLength={1} placeholder="0-9" />
              </FormField>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <HabeasDataCheckbox checked={habeasData} onChange={setHabeasData} className="text-fg-secondary" />
              <button
                type="button"
                onClick={consultarDocumento}
                disabled={!habeasData || consultandoDian || (form.nit ?? '').length < 4}
                title={!habeasData ? 'Marca la autorización para consultar' : undefined}
                className="inline-flex h-9 shrink-0 items-center gap-2 rounded-lg border border-line-strong bg-surface px-3 text-[13px] font-medium text-fg hover:bg-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand disabled:opacity-50"
              >
                {consultandoDian ? (
                  <Loader2 aria-hidden="true" className="size-4 animate-spin" />
                ) : (
                  <Search aria-hidden="true" className="size-4" strokeWidth={1.5} />
                )}
                Consultar DIAN / RUES
              </button>
            </div>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <FormField etiqueta={esEmpresa ? 'Razón social' : 'Nombre completo'} obligatorio error={errores.name}>
                <Input
                  value={form.name}
                  onChange={(e) => cambiar('name', e.target.value)}
                  placeholder={esEmpresa ? 'Empresa S.A.S.' : 'Nombre y apellidos'}
                />
              </FormField>
              <FormField etiqueta="Nombre comercial">
                <Input value={form.trade_name ?? ''} onChange={(e) => cambiar('trade_name', e.target.value)} placeholder="Opcional" />
              </FormField>
            </div>
            {!esEmpresa && empresasPadre.length > 0 && (
              <FormField etiqueta="Empresa proveedora asociada" ayuda="Vincula esta persona como contacto o proveedor hijo de una empresa.">
                {(c) => (
                  <Select value={padreId || 'ninguna'} onValueChange={(v) => setPadreId(v === 'ninguna' ? '' : v)}>
                    <SelectTrigger id={c.id} aria-labelledby={c.idEtiqueta} aria-describedby={c['aria-describedby']} className={CLASE_TRIGGER}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ninguna">Sin empresa asociada</SelectItem>
                      {empresasPadre.map((e) => (
                        <SelectItem key={e.id} value={String(e.id)}>
                          {e.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </FormField>
            )}
          </FormSection>

          {/* ── Contacto ── */}
          <FormSection titulo="Contacto" icono={Phone} colapsable columnas={2}>
            <FormField etiqueta="Persona de contacto">
              <Input value={form.contact ?? ''} onChange={(e) => cambiar('contact', e.target.value)} placeholder="Nombre del contacto" />
            </FormField>
            <FormField etiqueta="Teléfono" error={errores.phone} id="proveedor-telefono">
              {(c) => (
                <PhoneInput
                  id={c.id}
                  value={form.phone}
                  onChange={(v) => cambiar('phone', v)}
                  error={!!errores.phone}
                />
              )}
            </FormField>
            <FormField etiqueta="Correo" error={errores.email}>
              <Input type="email" value={form.email ?? ''} onChange={(e) => cambiar('email', e.target.value)} placeholder="compras@proveedor.com" />
            </FormField>
            <FormField etiqueta="Sitio web">
              <Input value={form.website ?? ''} onChange={(e) => cambiar('website', e.target.value)} placeholder="https://www.proveedor.com" />
            </FormField>
          </FormSection>

          {/* ── Dirección ── */}
          <FormSection titulo="Dirección" icono={MapPin} colapsable columnas={2}>
            <FormField etiqueta="Dirección" className="md:col-span-2">
              <Input value={form.address ?? ''} onChange={(e) => cambiar('address', e.target.value)} placeholder="Calle, número, oficina…" />
            </FormField>
            <FormField etiqueta="Ciudad">
              <Input value={form.city ?? ''} onChange={(e) => cambiar('city', e.target.value)} />
            </FormField>
            <FormField etiqueta="Departamento / estado">
              <Input value={form.state ?? ''} onChange={(e) => cambiar('state', e.target.value)} />
            </FormField>
            <FormField etiqueta="País">
              <Input value={form.country ?? ''} onChange={(e) => cambiar('country', e.target.value)} placeholder="Colombia" />
            </FormField>
            <FormField etiqueta="Código postal">
              <Input value={form.postal_code ?? ''} onChange={(e) => cambiar('postal_code', e.target.value)} placeholder="110111" />
            </FormField>
            <FormField etiqueta="Municipio (código DIAN)" ayuda="5 dígitos, por ejemplo 05001 = Medellín.">
              <Input
                value={form.municipality_code ?? ''}
                onChange={(e) => cambiar('municipality_code', e.target.value.slice(0, 5))}
                maxLength={5}
                inputMode="numeric"
                placeholder="05001"
              />
            </FormField>
          </FormSection>

          {/* ── Condiciones de compra ── */}
          <FormSection
            titulo="Condiciones de compra"
            descripcion="Se usan al crear órdenes y facturas de compra."
            icono={CalendarDays}
            colapsable
            columnas={2}
          >
            <FormField etiqueta="Condición de pago" ayuda="Al elegirla se llenan los días de crédito.">
              {(c) => (
                <Select
                  value={form.payment_terms || undefined}
                  onValueChange={(v) => {
                    cambiar('payment_terms', v);
                    const dias = CONDICIONES_PAGO.find((x) => x.valor === v)?.dias;
                    if (dias !== undefined) cambiar('credit_days', dias);
                  }}
                >
                  <SelectTrigger id={c.id} aria-labelledby={c.idEtiqueta} aria-describedby={c['aria-describedby']} className={CLASE_TRIGGER}>
                    <SelectValue placeholder="Seleccionar" />
                  </SelectTrigger>
                  <SelectContent>
                    {CONDICIONES_PAGO.map((x) => (
                      <SelectItem key={x.valor} value={x.valor}>
                        {x.etiqueta}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </FormField>
            <FormField etiqueta="Días de crédito" ayuda="0 = contado.">
              <Input
                type="number"
                min={0}
                inputMode="numeric"
                value={form.credit_days ?? ''}
                onChange={(e) => cambiar('credit_days', e.target.value === '' ? undefined : Math.max(0, parseInt(e.target.value, 10) || 0))}
                placeholder="30"
              />
            </FormField>
            <FormField etiqueta="Régimen tributario">
              {(c) => (
                <Select value={form.tax_regime || undefined} onValueChange={(v) => cambiar('tax_regime', v)}>
                  <SelectTrigger id={c.id} aria-labelledby={c.idEtiqueta} className={CLASE_TRIGGER}>
                    <SelectValue placeholder="Seleccionar régimen" />
                  </SelectTrigger>
                  <SelectContent>
                    {opcionesRegimen.map((r) => (
                      <SelectItem key={r.valor} value={r.valor}>
                        {r.etiqueta}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </FormField>
            <FormField etiqueta="Responsabilidades fiscales" ayuda="También se llenan al consultar la DIAN.">
              {(c) => (
                <div role="group" aria-labelledby={c.idEtiqueta} aria-describedby={c['aria-describedby']} className="flex flex-col gap-2 pt-1">
                  {RESPONSABILIDADES_FISCALES.map((r) => (
                    <label key={r.valor} className="flex items-center gap-2 text-sm text-fg">
                      <Checkbox
                        checked={responsabilidades.includes(r.valor)}
                        onCheckedChange={(v) => alternarResponsabilidad(r.valor, v === true)}
                        className="size-[18px] rounded"
                      />
                      {r.etiqueta}
                    </label>
                  ))}
                  {otrasResponsabilidades.map((r) => (
                    <label key={r} className="flex items-center gap-2 text-sm text-fg">
                      <Checkbox checked onCheckedChange={(v) => alternarResponsabilidad(r, v === true)} className="size-[18px] rounded" />
                      {r}
                    </label>
                  ))}
                </div>
              )}
            </FormField>
          </FormSection>

          {/* ── Datos bancarios ── */}
          <FormSection
            titulo="Datos bancarios"
            descripcion="Para programar pagos."
            icono={Landmark}
            colapsable
            columnas={2}
          >
            <FormField etiqueta="Banco">
              <Input value={form.bank_name ?? ''} onChange={(e) => cambiar('bank_name', e.target.value)} placeholder="Nombre del banco" />
            </FormField>
            <FormField etiqueta="Tipo de cuenta">
              {(c) => (
                <Select value={form.account_type || undefined} onValueChange={(v) => cambiar('account_type', v)}>
                  <SelectTrigger id={c.id} aria-labelledby={c.idEtiqueta} className={CLASE_TRIGGER}>
                    <SelectValue placeholder="Seleccionar" />
                  </SelectTrigger>
                  <SelectContent>
                    {TIPOS_CUENTA.map((t) => (
                      <SelectItem key={t.valor} value={t.valor}>
                        {t.etiqueta}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </FormField>
            <FormField etiqueta="Número de cuenta">
              <Input
                value={form.bank_account ?? ''}
                onChange={(e) => cambiar('bank_account', e.target.value)}
                placeholder="Número de cuenta"
                inputMode="numeric"
                autoComplete="off"
              />
            </FormField>
          </FormSection>

          {/* ── Facturación electrónica (códigos DIAN) ── */}
          <FormSection
            titulo="Facturación electrónica"
            descripcion="Códigos DIAN. Se llenan solos con el tipo de proveedor y de documento."
            icono={FileText}
            colapsable
            abiertaPorDefecto={false}
            columnas={2}
          >
            <FormField etiqueta="Tipo de documento DIAN">
              {(c) => (
                <Select value={form.identification_document_code || undefined} onValueChange={(v) => cambiar('identification_document_code', v)}>
                  <SelectTrigger id={c.id} aria-labelledby={c.idEtiqueta} className={CLASE_TRIGGER}>
                    <SelectValue placeholder="Seleccionar" />
                  </SelectTrigger>
                  <SelectContent>
                    {TIPOS_DOCUMENTO_DIAN.map((t) => (
                      <SelectItem key={t.valor} value={t.valor}>
                        {t.etiqueta}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </FormField>
            <FormField etiqueta="Tipo de organización DIAN">
              {(c) => (
                <Select value={form.legal_organization_code || undefined} onValueChange={(v) => cambiar('legal_organization_code', v)}>
                  <SelectTrigger id={c.id} aria-labelledby={c.idEtiqueta} className={CLASE_TRIGGER}>
                    <SelectValue placeholder="Seleccionar" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="1">1 · Empresa</SelectItem>
                    <SelectItem value="2">2 · Persona natural</SelectItem>
                  </SelectContent>
                </Select>
              )}
            </FormField>
            <FormField etiqueta="Código de país">
              <Input
                value={form.country_code ?? ''}
                onChange={(e) => cambiar('country_code', e.target.value.toUpperCase().slice(0, 2))}
                maxLength={2}
                placeholder="CO"
              />
            </FormField>
          </FormSection>

          {/* ── Descripción y notas ── */}
          <FormSection titulo="Descripción y notas" icono={FileText} colapsable>
            <FormField
              etiqueta="Descripción"
              extra={
                <button
                  type="button"
                  onClick={generarDescripcion}
                  disabled={generandoDesc || !form.name.trim()}
                  className="inline-flex items-center gap-1 text-xs font-medium text-link hover:underline disabled:opacity-50"
                >
                  {generandoDesc ? <Loader2 aria-hidden="true" className="size-3 animate-spin" /> : <Sparkles aria-hidden="true" className="size-3" />}
                  {generandoDesc ? 'Generando…' : 'Generar con IA'}
                </button>
              }
            >
              {(c) => (
                <div id={c.id} aria-labelledby={c.idEtiqueta}>
                  <RichTextEditor
                    value={form.description || ''}
                    onChange={(html) => cambiar('description', html)}
                    placeholder="Qué vende, marcas que maneja, tiempos de entrega…"
                  />
                </div>
              )}
            </FormField>
            <FormField etiqueta="Notas internas">
              {(c) => (
                <div id={c.id} aria-labelledby={c.idEtiqueta}>
                  <RichTextEditor
                    value={form.notes || ''}
                    onChange={(html) => cambiar('notes', html)}
                    placeholder="Información adicional sobre el proveedor…"
                  />
                </div>
              )}
            </FormField>
          </FormSection>
        </div>

        {/* ── Lateral: estado y logo ── */}
        <div className="flex min-w-0 flex-col gap-4">
          <section aria-labelledby="proveedor-estado" className="rounded-xl border border-line bg-surface p-4 sm:p-6">
            <h2 id="proveedor-estado" className="mb-3 text-base font-semibold text-fg">
              Estado
            </h2>
            <label className="flex items-center gap-3 text-sm text-fg-secondary">
              <Switch checked={form.is_active !== false} onCheckedChange={(v) => cambiar('is_active', v)} />
              {form.is_active !== false ? 'Activo · aparece al comprar' : 'Inactivo · no aparece al comprar'}
            </label>
          </section>

          <section aria-labelledby="proveedor-logo" className="rounded-xl border border-line bg-surface p-4 sm:p-6">
            <div className="mb-3 flex items-center justify-between gap-2">
              <h2 id="proveedor-logo" className="text-base font-semibold text-fg">
                Logo
              </h2>
              <button
                type="button"
                onClick={generarLogo}
                disabled={generandoLogo || !form.name.trim()}
                className="inline-flex items-center gap-1 text-xs font-medium text-link hover:underline disabled:opacity-50"
              >
                {generandoLogo ? <Loader2 aria-hidden="true" className="size-3 animate-spin" /> : <Wand2 aria-hidden="true" className="size-3" />}
                {generandoLogo ? 'Generando…' : 'Generar con IA'}
              </button>
            </div>
            <ImageUploader
              key={claveUploader}
              currentImageUrl={form.logo_url || null}
              onImageUploaded={(url) => cambiar('logo_url', url)}
              onImageRemoved={() => cambiar('logo_url', '')}
              bucket="supplier-logos"
              folder="logos"
              label=""
            />
          </section>
        </div>

        {embedded && (
          <div className="flex flex-wrap items-center justify-end gap-2 border-t border-line pt-4 lg:col-span-3">
            {botonesSecundarios}
            {botonGuardar}
          </div>
        )}
      </form>
    </div>
  );
}

export default ProveedorForm;
