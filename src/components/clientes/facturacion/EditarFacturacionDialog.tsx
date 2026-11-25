'use client';

/**
 * «Editar datos de facturación» (Figma «06 Clientes» 3194-21046, con errores 3194-21191; celular
 * 3196-21339): diálogo en escritorio y hoja inferior en el celular (`PanelAdaptable`). Lo abre el
 * lápiz de la tarjeta «Facturación electrónica» de la ficha.
 *
 * - DV automático (`dvAutomatico`, módulo 11 DIAN): nunca se escribe a mano.
 * - Correo de factura con la única validación (`validarCorreoFactura`); vacío = correo de contacto.
 * - «¿Es responsable de IVA?» Sí · 48 / No · 49, sin opción marcada de entrada (decisión 3).
 * - Documento repetido: «Guardar» queda bloqueado con «Unificar fichas», «Ligar como contacto» y
 *   «Ver la otra ficha» (decisión 5).
 * - Modo «Agregar empresa con NIT» (`nuevaEmpresaDe`, Figma 3207-27029, «Facturar a» 2026-11-25): crea
 *   una empresa nueva y deja a la persona como su contacto; con el NIT ya en otra empresa, «Ligar como
 *   contacto» liga la persona a esa empresa.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Building2, ExternalLink, Link2, Loader2, User, Users } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabase/config';
import { PanelAdaptable } from '@/components/kit/PanelAdaptable';
import { FormField } from '@/components/kit/FormField';
import { SegmentedControl } from '@/components/kit/SegmentedControl';
import { MultiSelect } from '@/components/kit/MultiSelect';
import { clasesBoton } from '@/components/kit/botonClases';
import { Input } from '@/components/ui/input';
import { SearchSelect } from '@/components/ui/search-select';
import { useEtiquetasCatalogo } from '@/components/clientes/new/useEtiquetasCatalogo';
import { cn } from '@/utils/Utils';
import {
  claveDocumento,
  dvAutomatico,
  erroresFacturacion,
  esTipoNit,
  etiquetaDocumento,
  responsabilidadIvaDe,
  tributoDianCliente,
  urlUnificarFichas,
  validarCorreoFactura,
  type CampoFacturacion,
  type CodigoIva,
} from '@/lib/clientes/facturacionElectronica';
import {
  catalogoResponsabilidades,
  crearEmpresaFacturacion,
  empresasDeLaOrganizacion,
  esDocumentoRepetido,
  fichaConDocumento,
  guardarFacturacionCliente,
  ligarComoContacto,
  municipiosDian,
  type DatosFacturacionCliente,
  type DatosFacturacionFormulario,
  type FichaConDocumento,
  type MunicipioDian,
} from '@/lib/clientes/facturacionClienteDatos';

const CODIGOS_IVA = new Set(['O-48', 'O-49']);
const CLASE_SELECT =
  'h-10 w-full rounded-lg border border-line-strong bg-surface px-3 text-sm text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/30 aria-[invalid=true]:border-danger';

interface TipoDocumentoOpcion {
  codigo: string;
  nombre: string;
  empresa: boolean;
  persona: boolean;
}

export interface EditarFacturacionDialogProps {
  abierto: boolean;
  onAbiertoChange: (abierto: boolean) => void;
  organizationId: number;
  datos: DatosFacturacionCliente;
  onGuardado: () => void;
  /**
   * «Agregar empresa con NIT» desde «Facturar a»: `datos` es una empresa en blanco
   * (`datosEmpresaNueva`) y al guardar se crea y se liga a esta persona como contacto.
   */
  nuevaEmpresaDe?: { personaId: string; personaNombre: string } | null;
  /** Empresa creada o ligada en el modo `nuevaEmpresaDe` (el selector la deja escogida). */
  onEmpresaLista?: (empresaId: string) => void;
}

/** Ficha en blanco de una empresa nueva (modo «Agregar empresa con NIT»). */
export function datosEmpresaNueva(organizationId: number): DatosFacturacionCliente {
  const id = typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : '10000000-1000-4000-8000-100000000000'.replace(/[018]/g, (c) => (Number(c) ^ (Math.random() * 16) >> (Number(c) / 4)).toString(16));
  return {
    ficha: { id, organization_id: organizationId, customer_type: 'company', identification_type: 'nit', identification_number: '', dv: null, first_name: '', last_name: '', company_name: '', billing_email: null, fiscal_municipality_id: null, fiscal_responsibilities: [] },
    municipio: null,
    empresas: [],
    personasLigadas: 0,
  };
}

function formularioDe(datos: DatosFacturacionCliente): DatosFacturacionFormulario {
  const f = datos.ficha;
  const empresa = f.customer_type === 'company';
  return {
    tipoPersona: empresa ? 'company' : 'person',
    tipoDocumento: f.identification_type ?? '',
    numero: f.identification_number ?? '',
    razonSocial: empresa ? f.company_name || f.first_name || '' : f.company_name || '',
    nombreComercial: f.trade_name ?? '',
    nombres: empresa ? '' : f.first_name ?? '',
    apellidos: empresa ? '' : f.last_name ?? '',
    correoFactura: f.billing_email ?? '',
    municipioId: f.fiscal_municipality_id ?? '',
    iva: responsabilidadIvaDe(f.fiscal_responsibilities),
    responsabilidades: (f.fiscal_responsibilities ?? []).filter((r) => !CODIGOS_IVA.has(r)),
    empresaLigadaId: datos.empresas.find((e) => e.principal)?.id ?? f.parent_customer_id ?? '',
  };
}

export function EditarFacturacionDialog({ abierto, onAbiertoChange, organizationId, datos, onGuardado, nuevaEmpresaDe = null, onEmpresaLista }: EditarFacturacionDialogProps) {
  const t = useTranslations('clientesFacturacion');
  const tf = useTranslations('clientesFacturarA');
  const nueva = nuevaEmpresaDe !== null;
  const etiquetas = useEtiquetasCatalogo();
  const ficha = datos.ficha;
  const [form, setForm] = useState<DatosFacturacionFormulario>(() => formularioDe(datos));
  const [intento, setIntento] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [tipos, setTipos] = useState<TipoDocumentoOpcion[]>([]);
  const [municipios, setMunicipios] = useState<MunicipioDian[]>([]);
  const [catalogo, setCatalogo] = useState<Array<{ code: string; description: string }>>([]);
  const [empresas, setEmpresas] = useState<Array<{ id: string; nombre: string }>>([]);
  const [otraFicha, setOtraFicha] = useState<FichaConDocumento | null>(null);
  const [ligando, setLigando] = useState(false);
  const consulta = useRef(0);

  // Al abrir, el formulario vuelve a la ficha tal como está.
  useEffect(() => {
    if (!abierto) return;
    setForm(formularioDe(datos));
    setIntento(false);
    setOtraFicha(null);
  }, [abierto, datos]);

  // Catálogos: tipos de documento del país de la organización, municipios DIAN y responsabilidades.
  useEffect(() => {
    if (!abierto) return;
    let vivo = true;
    void (async () => {
      const { data: org } = await supabase.from('organizations').select('country_code').eq('id', organizationId).maybeSingle();
      const pais = (org as { country_code?: string | null } | null)?.country_code || 'COL';
      const { data: filas } = await supabase
        .from('country_identification_types')
        .select('code, name, for_company, for_person')
        .eq('country_code', pais)
        .eq('is_active', true)
        .order('sort_order');
      const [munis, resps] = await Promise.all([municipiosDian(), catalogoResponsabilidades()]);
      if (!vivo) return;
      setTipos(((filas ?? []) as Array<{ code: string; name: string; for_company: boolean; for_person: boolean }>).map((f) => ({ codigo: f.code, nombre: f.name, empresa: f.for_company, persona: f.for_person })));
      setMunicipios(munis);
      setCatalogo(resps);
    })();
    return () => {
      vivo = false;
    };
  }, [abierto, organizationId]);

  useEffect(() => {
    if (!abierto || form.tipoPersona !== 'person') return;
    let vivo = true;
    void empresasDeLaOrganizacion(organizationId, ficha.id).then((lista) => {
      if (vivo) setEmpresas(lista);
    });
    return () => {
      vivo = false;
    };
  }, [abierto, form.tipoPersona, organizationId, ficha.id]);

  // Documento repetido: se busca otra ficha con el mismo número mientras se escribe.
  useEffect(() => {
    if (!abierto) return;
    const n = ++consulta.current;
    const clave = claveDocumento(form.numero);
    if (clave.length < 3) {
      setOtraFicha(null);
      return;
    }
    const temporizador = setTimeout(() => {
      void fichaConDocumento(organizationId, form.numero, form.tipoDocumento, ficha.id).then((otra) => {
        if (n === consulta.current) setOtraFicha(otra);
      });
    }, 350);
    return () => clearTimeout(temporizador);
  }, [abierto, form.numero, form.tipoDocumento, organizationId, ficha.id]);

  const tiposVisibles = useMemo(() => tipos.filter((o) => (form.tipoPersona === 'company' ? o.empresa : o.persona)), [tipos, form.tipoPersona]);
  // El tipo guardado sigue en la lista aunque el catálogo ya no lo ofrezca para ese tipo de persona.
  const opcionesTipo = useMemo(() => {
    if (!form.tipoDocumento || tiposVisibles.some((o) => o.codigo === form.tipoDocumento)) return tiposVisibles;
    return [...tiposVisibles, { codigo: form.tipoDocumento, nombre: form.tipoDocumento.toUpperCase(), empresa: true, persona: true }];
  }, [tiposVisibles, form.tipoDocumento]);

  const nit = esTipoNit(form.tipoDocumento);
  const dv = dvAutomatico(form.tipoDocumento, form.numero);
  const correo = validarCorreoFactura(form.correoFactura);
  const errores = new Set<CampoFacturacion>(erroresFacturacion(form));
  const mostrar = (campo: CampoFacturacion) => (intento || campo === 'correo') && errores.has(campo);
  const bloqueado = otraFicha !== null || correo === 'invalido';
  const tributo = form.iva ? tributoDianCliente([form.iva === '48' ? 'O-48' : 'O-49']) : null;

  const cambiar = <K extends keyof DatosFacturacionFormulario>(campo: K, valor: DatosFacturacionFormulario[K]) => setForm((f) => ({ ...f, [campo]: valor }));

  const cambiarTipoPersona = (tipo: 'person' | 'company') => {
    setForm((f) => {
      const siguientes = tipos.filter((o) => (tipo === 'company' ? o.empresa : o.persona));
      const tipoDocumento = siguientes.some((o) => o.codigo === f.tipoDocumento) ? f.tipoDocumento : siguientes[0]?.codigo ?? f.tipoDocumento;
      const razonSocial = tipo === 'company' && !f.razonSocial ? `${f.nombres} ${f.apellidos}`.trim() : f.razonSocial;
      return { ...f, tipoPersona: tipo, tipoDocumento, razonSocial };
    });
  };

  const guardar = async () => {
    setIntento(true);
    if (errores.size > 0 || bloqueado) return;
    setGuardando(true);
    try {
      if (nuevaEmpresaDe) {
        await crearEmpresaFacturacion(organizationId, nuevaEmpresaDe.personaId, ficha.id, form);
        toast.success(tf('agregar.creada', { empresa: form.razonSocial.trim() }));
        onEmpresaLista?.(ficha.id);
      } else {
        await guardarFacturacionCliente(organizationId, ficha.id, form);
        toast.success(t('editar.guardado'));
      }
      onGuardado();
      onAbiertoChange(false);
    } catch (err) {
      if (esDocumentoRepetido(err)) {
        setOtraFicha(await fichaConDocumento(organizationId, form.numero, form.tipoDocumento, ficha.id));
        toast.error(t('editar.documentoRepetido'));
      } else {
        toast.error(t('editar.errorGuardar'));
      }
    } finally {
      setGuardando(false);
    }
  };

  const ligar = async () => {
    if (!otraFicha) return;
    setLigando(true);
    try {
      if (nuevaEmpresaDe) {
        // Agregar empresa: el NIT ya es de otra empresa → la persona queda como su contacto.
        await ligarComoContacto(organizationId, nuevaEmpresaDe.personaId, otraFicha.id);
        toast.success(t('editar.ligado', { empresa: otraFicha.nombre }));
        onEmpresaLista?.(otraFicha.id);
        onGuardado();
        onAbiertoChange(false);
        return;
      }
      await ligarComoContacto(organizationId, ficha.id, otraFicha.id);
      toast.success(t('editar.ligado', { empresa: otraFicha.nombre }));
      // La persona conserva su propio documento; la empresa factura con su NIT.
      setForm((f) => ({ ...f, tipoDocumento: ficha.identification_type ?? f.tipoDocumento, numero: ficha.identification_number ?? '', empresaLigadaId: otraFicha.id }));
      onGuardado();
    } catch {
      toast.error(t('editar.errorLigar'));
    } finally {
      setLigando(false);
    }
  };

  const opcionesResp = catalogo
    .filter((r) => !CODIGOS_IVA.has(r.code))
    .map((r) => ({ valor: r.code, etiqueta: `${r.code} ${etiquetas.fiscal(r.code, r.description)}` }));
  const opcionesMunicipio = municipios.map((m) => ({ value: m.id, label: `${m.nombre} · ${m.codigo}`, sublabel: m.departamento ?? undefined }));
  const nombreFicha = ficha.full_name || ficha.company_name || `${ficha.first_name ?? ''} ${ficha.last_name ?? ''}`.trim();
  const etiquetaNumero = nit ? t('editar.numeroNit') : t('editar.numero');

  return (
    <PanelAdaptable
      abierto={abierto}
      onAbiertoChange={onAbiertoChange}
      titulo={nuevaEmpresaDe ? tf('agregar.titulo') : t('editar.titulo')}
      descripcion={
        nuevaEmpresaDe
          ? tf('agregar.descripcion', { persona: nuevaEmpresaDe.personaNombre || t('sinNombre') })
          : nombreFicha ? t('editar.descripcion', { nombre: nombreFicha }) : t('editar.descripcionSinNombre')
      }
      ancho={560}
      ocupado={guardando}
      pie={
        <>
          <button type="button" className={clasesBoton({ variante: 'secundario' })} onClick={() => onAbiertoChange(false)} disabled={guardando}>
            {t('editar.cancelar')}
          </button>
          <button
            type="button"
            className={clasesBoton({ variante: 'primario' })}
            onClick={() => void guardar()}
            disabled={guardando || bloqueado}
            aria-disabled={guardando || bloqueado}
            title={bloqueado ? (otraFicha ? t('editar.bloqueadoDuplicado') : t('editar.bloqueadoCorreo')) : undefined}
          >
            {guardando && <Loader2 className="size-4 animate-spin" aria-hidden="true" />}
            {t('editar.guardar')}
          </button>
        </>
      }
    >
      {!nueva && (
      <FormField etiqueta={t('editar.tipoPersona')}>
        {(campo) => (
          <SegmentedControl
            aria-labelledby={campo.idEtiqueta}
            anchoCompleto
            tonoActivo="marca"
            opciones={[
              { valor: 'person', etiqueta: t('editar.personaNatural'), icono: User },
              { valor: 'company', etiqueta: t('editar.empresa'), icono: Building2 },
            ]}
            valor={form.tipoPersona}
            onValorChange={(v) => cambiarTipoPersona(v)}
          />
        )}
      </FormField>
      )}

      <div className="grid grid-cols-[minmax(0,2fr)_minmax(0,3fr)_72px] gap-3 max-sm:grid-cols-[minmax(0,1fr)_minmax(0,2fr)] ">
        <FormField etiqueta={t('editar.tipoDocumento')} obligatorio error={mostrar('tipoDocumento') ? t('editar.errores.tipoDocumento') : null}>
          {(campo) => (
            <select {...campo} value={form.tipoDocumento} onChange={(e) => cambiar('tipoDocumento', e.target.value)} className={CLASE_SELECT}>
              <option value="">{t('editar.escoger')}</option>
              {opcionesTipo.map((o) => (
                <option key={o.codigo} value={o.codigo}>
                  {etiquetas.tipoDocumento(o.codigo, o.nombre)}
                </option>
              ))}
            </select>
          )}
        </FormField>
        <FormField
          etiqueta={etiquetaNumero}
          obligatorio
          error={otraFicha ? t('editar.errores.enOtraFicha', { tipo: nit ? 'NIT' : t('editar.documento') }) : mostrar('numero') ? t('editar.errores.numero') : null}
        >
          {(campo) => (
            <Input {...campo} inputMode={nit ? 'numeric' : 'text'} autoComplete="off" value={form.numero} onChange={(e) => cambiar('numero', e.target.value)} />
          )}
        </FormField>
        {nit && (
          <FormField etiqueta={t('editar.dv')} ayuda={t('editar.automatico')} className="max-sm:col-span-2">
            {(campo) => <Input {...campo} value={dv ?? ''} readOnly tabIndex={-1} aria-readonly="true" className="bg-subtle" />}
          </FormField>
        )}
      </div>

      {otraFicha && (
        <div role="alert" className="flex flex-col gap-2 rounded-lg border border-line-warning bg-warning-subtle p-3 text-warning-text">
          <p className="text-[13px] font-semibold">{t('editar.duplicado.titulo', { documento: etiquetaDocumento(otraFicha) || form.numero, nombre: otraFicha.nombre || t('sinNombre') })}</p>
          <p className="text-xs">{t('editar.duplicado.texto')}</p>
          <div className="flex flex-wrap gap-2">
            {!nueva && (
              <a href={urlUnificarFichas(ficha.id, otraFicha.id)} className={clasesBoton({ variante: 'secundario', tamano: 'sm' })}>
                <Users className="size-4" aria-hidden="true" />
                {t('editar.duplicado.unificar')}
              </a>
            )}
            {(form.tipoPersona === 'person' || nueva) && otraFicha.customer_type === 'company' && (
              <button type="button" className={clasesBoton({ variante: 'secundario', tamano: 'sm' })} onClick={() => void ligar()} disabled={ligando}>
                {ligando ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <Link2 className="size-4" aria-hidden="true" />}
                {t('editar.duplicado.ligar')}
              </button>
            )}
            <a href={`/app/clientes/${encodeURIComponent(otraFicha.id)}`} target="_blank" rel="noreferrer" className={clasesBoton({ variante: 'fantasma', tamano: 'sm' })}>
              <ExternalLink className="size-4" aria-hidden="true" />
              {t('editar.duplicado.verOtra')}
            </a>
          </div>
        </div>
      )}

      {form.tipoPersona === 'company' ? (
        <>
          <FormField etiqueta={t('editar.razonSocial')} obligatorio ayuda={t('editar.razonSocialAyuda')} error={mostrar('razonSocial') ? t('editar.errores.obligatorio') : null}>
            {(campo) => <Input {...campo} value={form.razonSocial} onChange={(e) => cambiar('razonSocial', e.target.value)} />}
          </FormField>
          <FormField etiqueta={t('editar.nombreComercial')}>
            {(campo) => <Input {...campo} value={form.nombreComercial} onChange={(e) => cambiar('nombreComercial', e.target.value)} />}
          </FormField>
        </>
      ) : (
        <div className="grid grid-cols-2 gap-3">
          <FormField etiqueta={t('editar.nombres')} obligatorio error={mostrar('nombres') ? t('editar.errores.obligatorio') : null}>
            {(campo) => <Input {...campo} value={form.nombres} onChange={(e) => cambiar('nombres', e.target.value)} />}
          </FormField>
          <FormField etiqueta={t('editar.apellidos')} obligatorio error={mostrar('apellidos') ? t('editar.errores.obligatorio') : null}>
            {(campo) => <Input {...campo} value={form.apellidos} onChange={(e) => cambiar('apellidos', e.target.value)} />}
          </FormField>
        </div>
      )}

      <FormField
        etiqueta={t('editar.correoFactura')}
        error={mostrar('correo') ? t('editar.errores.correo') : null}
        ayuda={ficha.email ? t('editar.correoAyuda', { correo: ficha.email }) : t('editar.correoAyudaSinContacto')}
      >
        {(campo) => <Input {...campo} type="email" inputMode="email" autoComplete="off" value={form.correoFactura} onChange={(e) => cambiar('correoFactura', e.target.value)} />}
      </FormField>

      <FormField
        etiqueta={t('iva.pregunta')}
        obligatorio
        ayuda={t('iva.ayuda')}
        error={mostrar('iva') ? t('editar.errores.iva') : null}
        extra={tributo ? <span className="text-xs text-fg-secondary">{t('iva.tributo', { codigo: tributo })}</span> : undefined}
      >
        {(campo) => (
          <div role="radiogroup" aria-labelledby={campo.idEtiqueta} aria-describedby={campo['aria-describedby']} className="grid grid-cols-2 gap-2">
            {(['48', '49'] as CodigoIva[]).map((codigo) => {
              const marcado = form.iva === codigo;
              return (
                <button
                  key={codigo}
                  type="button"
                  role="radio"
                  aria-checked={marcado}
                  onClick={() => cambiar('iva', codigo)}
                  className={cn(
                    'flex h-10 items-center justify-between gap-2 rounded-lg border px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand',
                    marcado ? 'border-brand-action bg-brand-tint font-medium text-brand-deep' : 'border-line-strong bg-surface text-fg hover:bg-hover',
                  )}
                >
                  <span>{codigo === '48' ? t('iva.si') : t('iva.no')}</span>
                  <span className={cn('rounded-md px-1.5 py-0.5 font-mono text-xs', marcado ? 'bg-surface text-brand-deep' : 'bg-subtle text-fg-secondary')}>{codigo}</span>
                </button>
              );
            })}
          </div>
        )}
      </FormField>

      <FormField etiqueta={t('editar.municipio')} obligatorio error={mostrar('municipio') ? t('editar.errores.municipio') : null}>
        {(campo) => (
          <SearchSelect
            id={campo.id}
            options={opcionesMunicipio}
            value={form.municipioId}
            onValueChange={(v) => cambiar('municipioId', v)}
            placeholder={t('editar.municipioPlaceholder')}
            searchPlaceholder={t('editar.municipioBuscar')}
            emptyText={t('editar.municipioVacio')}
          />
        )}
      </FormField>

      <FormField etiqueta={t('editar.responsabilidades')} ayuda={t('editar.responsabilidadesAyuda')}>
        {(campo) => (
          <MultiSelect
            id={campo.id}
            opciones={opcionesResp}
            valores={form.responsabilidades}
            onValoresChange={(v) => cambiar('responsabilidades', v)}
            placeholder={t('editar.agregar')}
          />
        )}
      </FormField>

      {form.tipoPersona === 'person' && (
        <FormField etiqueta={t('editar.empresaLigada')} ayuda={t('editar.empresaLigadaAyuda')}>
          {(campo) => (
            <select {...campo} value={form.empresaLigadaId} onChange={(e) => cambiar('empresaLigadaId', e.target.value)} className={CLASE_SELECT}>
              <option value="">{t('editar.sinEmpresa')}</option>
              {empresas.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.nombre || t('sinNombre')}
                </option>
              ))}
            </select>
          )}
        </FormField>
      )}
    </PanelAdaptable>
  );
}
