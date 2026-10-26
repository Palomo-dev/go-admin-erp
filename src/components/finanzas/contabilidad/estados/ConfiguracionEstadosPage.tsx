'use client';

import { useEffect, useMemo, useState } from 'react';
import { Landmark, Trash2 } from 'lucide-react';
import {
  AvisoTonal,
  DataTable,
  Dialogo,
  EmptyState,
  FormField,
  FormSection,
  PageHeader,
  SearchInput,
  SegmentedControl,
  Tarjeta,
  clasesBoton,
} from '@/components/kit';
import { useFormatDate, useOrgTimezone } from '@/lib/context/OrganizationTimezoneContext';
import { POLITICAS_DEFECTO } from '@/lib/finanzas/estados/textos';
import { useOrganization } from '@/lib/hooks/useOrganization';
import { supabase } from '@/lib/supabase/config';

const CAMPO =
  'h-10 w-full rounded-lg border border-line-strong bg-surface px-3 text-sm text-fg outline-none focus-visible:ring-2 focus-visible:ring-brand';
const AREA =
  'min-h-24 w-full rounded-lg border border-line-strong bg-surface px-3 py-2 text-sm text-fg outline-none focus-visible:ring-2 focus-visible:ring-brand';
const FORMATOS = ['1001', '1005', '1006', '1007', '1008', '1009'] as const;

type Presentacion = '' | 'corriente' | 'no_corriente' | 'segun_plazo';
type Comportamiento = '' | 'fijo' | 'variable';

interface PerfilForm {
  grupo: 2 | 3;
  cambiosPatrimonio: boolean;
  periodoIva: 'bimestral' | 'cuatrimestral';
  responsableIva: boolean;
  actividad: string;
  municipioIca: string;
  tarifaPorcentaje: string;
  exclusionesIca: string;
  exclusionesIcaValor: string;
  representanteNombre: string;
  representanteDocumento: string;
  contadorNombre: string;
  contadorCedula: string;
  contadorTarjeta: string;
  revisorNombre: string;
  revisorTarjeta: string;
  incluirDictamen: boolean;
  notas: Record<string, string>;
  informeGestion: string;
  digitosNota: 4 | 6;
}

interface Marca {
  codigo: string;
  nombre: string;
  presentacion: Presentacion;
  comportamiento: Comportamiento;
  esOri: boolean;
  equivalente: boolean;
  plazo: string;
}

interface Tope {
  anio: number;
  formato: string;
  tope: number;
}

interface AccionistaFila {
  id: string;
  nombre: string;
  documento: string;
  acciones: number;
  porcentaje: number;
}

interface AjusteFila {
  id: string;
  anio: number;
  concepto: string;
  tipo: string;
  valor: number;
  formulario: string;
}

type Pendiente =
  | { tipo: 'accionista'; id: string; nombre: string }
  | { tipo: 'tope'; anio: number; formato: string }
  | { tipo: 'ajuste'; id: string; concepto: string };

function texto(valor: unknown): string {
  return valor == null ? '' : String(valor);
}

function numero(valor: unknown): number {
  const n = typeof valor === 'number' ? valor : Number(valor);
  return Number.isFinite(n) ? n : 0;
}

function numeroLocal(valor: string): number {
  const limpio = valor.trim();
  const normal = limpio.includes(',') ? limpio.replace(/\./g, '').replace(',', '.') : limpio;
  const n = Number(normal);
  return Number.isFinite(n) ? n : 0;
}

function registros(data: unknown): Record<string, unknown>[] {
  if (!Array.isArray(data)) return [];
  return data.filter((fila): fila is Record<string, unknown> => !!fila && typeof fila === 'object');
}

function perfilVacio(): PerfilForm {
  return {
    grupo: 2,
    cambiosPatrimonio: true,
    periodoIva: 'bimestral',
    responsableIva: true,
    actividad: '',
    municipioIca: '',
    tarifaPorcentaje: '0',
    exclusionesIca: '',
    exclusionesIcaValor: '0',
    representanteNombre: '',
    representanteDocumento: '',
    contadorNombre: '',
    contadorCedula: '',
    contadorTarjeta: '',
    revisorNombre: '',
    revisorTarjeta: '',
    incluirDictamen: false,
    notas: Object.fromEntries(POLITICAS_DEFECTO.map((p) => [p.id, ''])),
    informeGestion: '',
    digitosNota: 4,
  };
}

function perfilDe(fila: Record<string, unknown> | null): PerfilForm {
  const base = perfilVacio();
  if (!fila) return base;
  const notas = fila.notas && typeof fila.notas === 'object' ? (fila.notas as Record<string, unknown>) : {};
  return {
    ...base,
    grupo: numero(fila.grupo_niif) === 3 ? 3 : 2,
    cambiosPatrimonio: fila.cambios_patrimonio !== false,
    periodoIva: texto(fila.periodo_iva) === 'cuatrimestral' ? 'cuatrimestral' : 'bimestral',
    responsableIva: fila.responsable_iva !== false,
    actividad: texto(fila.actividad),
    municipioIca: texto(fila.municipio_ica),
    tarifaPorcentaje: String(Math.round(numero(fila.tarifa_ica) * 100000) / 1000),
    exclusionesIca: texto(fila.exclusiones_ica),
    exclusionesIcaValor: String(numero(fila.exclusiones_ica_valor)),
    representanteNombre: texto(fila.representante_nombre),
    representanteDocumento: texto(fila.representante_documento),
    contadorNombre: texto(fila.contador_nombre),
    contadorCedula: texto(fila.contador_cedula),
    contadorTarjeta: texto(fila.contador_tarjeta),
    revisorNombre: texto(fila.revisor_nombre),
    revisorTarjeta: texto(fila.revisor_tarjeta),
    incluirDictamen: fila.incluir_dictamen === true,
    notas: Object.fromEntries(POLITICAS_DEFECTO.map((p) => [p.id, texto(notas[p.id])])),
    informeGestion: texto(fila.informe_gestion),
    digitosNota: numero(fila.digitos_nota) === 6 ? 6 : 4,
  };
}

async function paginar(
  pedir: (desde: number, hasta: number) => PromiseLike<{ data: unknown; error: { message: string } | null }>,
): Promise<Record<string, unknown>[]> {
  const filas: Record<string, unknown>[] = [];
  let desde = 0;
  for (;;) {
    const { data, error } = await pedir(desde, desde + 999);
    if (error) throw new Error(error.message);
    const pagina = registros(data);
    filas.push(...pagina);
    if (pagina.length < 1000) return filas;
    desde += 1000;
  }
}

export function ConfiguracionEstadosPage() {
  const { getToday } = useFormatDate();
  const { isLoading: tzLoading } = useOrgTimezone();
  const { organization, isLoading: orgLoading } = useOrganization();
  const orgId = organization?.id ?? 0;
  const [entidad, setEntidad] = useState('');
  const [nit, setNit] = useState('');
  const [perfil, setPerfil] = useState<PerfilForm>(perfilVacio);
  const [marcas, setMarcas] = useState<Marca[]>([]);
  const [busqueda, setBusqueda] = useState('');
  const [topes, setTopes] = useState<Tope[]>([]);
  const [accionistas, setAccionistas] = useState<AccionistaFila[]>([]);
  const [ajustes, setAjustes] = useState<AjusteFila[]>([]);
  const [anioTope, setAnioTope] = useState('');
  const [formatoTope, setFormatoTope] = useState<(typeof FORMATOS)[number]>('1001');
  const [valorTope, setValorTope] = useState('');
  const [nuevoAccionista, setNuevoAccionista] = useState({ nombre: '', documento: '', acciones: '', porcentaje: '', fecha: '' });
  const [nuevoAjuste, setNuevoAjuste] = useState({ anio: '', concepto: '', tipo: 'adicion' as 'adicion' | 'deduccion', valor: '', formulario: '2516' as '2516' | '2517' });
  const [pendiente, setPendiente] = useState<Pendiente | null>(null);
  const [cargando, setCargando] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [reintento, setReintento] = useState(0);

  useEffect(() => {
    if (tzLoading) return;
    const anio = getToday().slice(0, 4);
    setAnioTope((prev) => prev || anio);
    setNuevoAjuste((prev) => ({ ...prev, anio: prev.anio || anio }));
  }, [tzLoading, getToday]);

  useEffect(() => {
    if (orgId <= 0) return;
    let vivo = true;
    setCargando(true);
    setError(null);
    void (async () => {
      try {
        const [orgRes, perfilRes, cuentas, meta, topesFilas, accionistasFilas, ajustesFilas] = await Promise.all([
          supabase.from('organizations').select('legal_name, name, nit, dv').eq('id', orgId).maybeSingle(),
          supabase.from('perfil_estados_financieros').select('*').eq('organization_id', orgId).maybeSingle(),
          paginar((desde, hasta) =>
            supabase.from('chart_of_accounts').select('account_code, name, presentacion_niif').eq('organization_id', orgId).eq('is_active', true).order('account_code').range(desde, hasta),
          ),
          paginar((desde, hasta) =>
            supabase.from('financial_report_account_metadata').select('account_code, costo_comportamiento, es_ori, equivalente_efectivo, plazo_meses').eq('organization_id', orgId).range(desde, hasta),
          ),
          paginar((desde, hasta) => supabase.from('topes_exogena').select('anio, formato, tope').eq('organization_id', orgId).order('anio', { ascending: false }).range(desde, hasta)),
          paginar((desde, hasta) =>
            supabase.from('accionistas_org').select('id, nombre, documento, acciones, porcentaje').eq('organization_id', orgId).order('nombre').range(desde, hasta),
          ),
          paginar((desde, hasta) =>
            supabase.from('ajustes_conciliacion_fiscal').select('id, anio, concepto, tipo, valor, formulario').eq('organization_id', orgId).order('anio', { ascending: false }).range(desde, hasta),
          ),
        ]);
        if (!vivo) return;
        if (orgRes.error) throw new Error(orgRes.error.message);
        if (perfilRes.error) throw new Error(perfilRes.error.message);
        const org = (orgRes.data ?? {}) as Record<string, unknown>;
        const nitBase = texto(org.nit);
        setEntidad(texto(org.legal_name) || texto(org.name));
        setNit(org.dv != null && nitBase ? `${nitBase}-${texto(org.dv)}` : nitBase);
        setPerfil(perfilDe(perfilRes.data ? (perfilRes.data as Record<string, unknown>) : null));
        const porCuenta = new Map(meta.map((fila) => [texto(fila.account_code), fila]));
        setMarcas(
          cuentas.map((cuenta) => {
            const codigo = texto(cuenta.account_code);
            const marca = porCuenta.get(codigo);
            const presentacion = texto(cuenta.presentacion_niif);
            const comportamiento = texto(marca?.costo_comportamiento);
            return {
              codigo,
              nombre: texto(cuenta.name),
              presentacion: presentacion === 'corriente' || presentacion === 'no_corriente' || presentacion === 'segun_plazo' ? presentacion : '',
              comportamiento: comportamiento === 'fijo' || comportamiento === 'variable' ? comportamiento : '',
              esOri: marca?.es_ori === true,
              equivalente: marca?.equivalente_efectivo === true,
              plazo: marca?.plazo_meses == null ? '' : String(numero(marca.plazo_meses)),
            };
          }),
        );
        setTopes(topesFilas.map((fila) => ({ anio: numero(fila.anio), formato: texto(fila.formato), tope: numero(fila.tope) })));
        setAccionistas(
          accionistasFilas.map((fila) => ({
            id: texto(fila.id),
            nombre: texto(fila.nombre),
            documento: texto(fila.documento),
            acciones: numero(fila.acciones),
            porcentaje: numero(fila.porcentaje),
          })),
        );
        setAjustes(
          ajustesFilas.map((fila) => ({
            id: texto(fila.id),
            anio: numero(fila.anio),
            concepto: texto(fila.concepto),
            tipo: texto(fila.tipo),
            valor: numero(fila.valor),
            formulario: texto(fila.formulario),
          })),
        );
      } catch (fallo: unknown) {
        if (vivo) setError(fallo instanceof Error ? fallo.message : 'No se pudo cargar la configuración.');
      } finally {
        if (vivo) setCargando(false);
      }
    })();
    return () => {
      vivo = false;
    };
  }, [orgId, reintento]);

  const visibles = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    const lista = q ? marcas.filter((m) => m.codigo.toLowerCase().includes(q) || m.nombre.toLowerCase().includes(q)) : marcas;
    return lista.slice(0, 40);
  }, [marcas, busqueda]);

  function patchPerfil(parcial: Partial<PerfilForm>) {
    setPerfil((prev) => ({ ...prev, ...parcial }));
  }

  function patchMarca(codigo: string, parcial: Partial<Marca>) {
    setMarcas((prev) => prev.map((marca) => (marca.codigo === codigo ? { ...marca, ...parcial } : marca)));
  }

  async function guardarPerfil() {
    if (orgId <= 0) return;
    const tarifa = numeroLocal(perfil.tarifaPorcentaje) / 100;
    if (tarifa < 0 || tarifa > 1) {
      setError('La tarifa de ICA es un porcentaje entre 0 y 100.');
      return;
    }
    setGuardando(true);
    setError(null);
    const { error: fallo } = await supabase.from('perfil_estados_financieros').upsert(
      {
        organization_id: orgId,
        grupo_niif: perfil.grupo,
        cambios_patrimonio: perfil.cambiosPatrimonio,
        periodo_iva: perfil.periodoIva,
        responsable_iva: perfil.responsableIva,
        actividad: perfil.actividad,
        municipio_ica: perfil.municipioIca,
        tarifa_ica: tarifa,
        exclusiones_ica: perfil.exclusionesIca,
        exclusiones_ica_valor: Math.max(0, Math.round(numeroLocal(perfil.exclusionesIcaValor))),
        representante_nombre: perfil.representanteNombre,
        representante_documento: perfil.representanteDocumento,
        contador_nombre: perfil.contadorNombre,
        contador_cedula: perfil.contadorCedula,
        contador_tarjeta: perfil.contadorTarjeta,
        revisor_nombre: perfil.revisorNombre,
        revisor_tarjeta: perfil.revisorTarjeta,
        incluir_dictamen: perfil.incluirDictamen,
        notas: perfil.notas,
        informe_gestion: perfil.informeGestion,
        digitos_nota: perfil.digitosNota,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'organization_id' },
    );
    setGuardando(false);
    if (fallo) setError(fallo.message);
    else setAviso('Configuración guardada.');
  }

  async function guardarMarca(marca: Marca) {
    if (orgId <= 0) return;
    const codigo = marca.codigo.replace(/-/g, '');
    const plazo = marca.plazo.trim() === '' ? null : numeroLocal(marca.plazo);
    if (marca.esOri && !codigo.startsWith('38')) {
      setError('Solo un auxiliar de la 38 puede marcarse como ORI.');
      return;
    }
    if (marca.equivalente && (!codigo.startsWith('12') || plazo == null || plazo > 3)) {
      setError('Un equivalente de efectivo es una inversión de la 12 a 3 meses o menos.');
      return;
    }
    setGuardando(true);
    setError(null);
    const { error: fallo } = await supabase.rpc('fn_guardar_marca_informe', {
      p_organization_id: orgId,
      p_account_code: marca.codigo,
      p_presentacion: marca.presentacion,
      p_comportamiento: marca.comportamiento,
      p_es_ori: marca.esOri,
      p_equivalente: marca.equivalente,
      p_plazo: plazo,
    });
    setGuardando(false);
    if (fallo) setError(fallo.message);
    else setAviso(`Marca de ${marca.codigo} guardada.`);
  }

  async function agregarTope() {
    if (orgId <= 0) return;
    const anio = Number(anioTope);
    if (anio < 2000 || anio > 2100) {
      setError('El año del tope no es válido.');
      return;
    }
    const { error: fallo } = await supabase.from('topes_exogena').upsert(
      { organization_id: orgId, anio, formato: formatoTope, tope: Math.max(0, Math.round(numeroLocal(valorTope))) },
      { onConflict: 'organization_id,anio,formato' },
    );
    if (fallo) setError(fallo.message);
    else {
      setValorTope('');
      setReintento((n) => n + 1);
    }
  }

  async function agregarAccionista() {
    if (orgId <= 0 || !nuevoAccionista.nombre.trim()) return;
    const { error: fallo } = await supabase.from('accionistas_org').insert({
      organization_id: orgId,
      nombre: nuevoAccionista.nombre.trim(),
      documento: nuevoAccionista.documento.trim(),
      acciones: Math.max(0, numeroLocal(nuevoAccionista.acciones)),
      porcentaje: Math.min(100, Math.max(0, numeroLocal(nuevoAccionista.porcentaje))),
      fecha_ingreso: nuevoAccionista.fecha || null,
    });
    if (fallo) setError(fallo.message);
    else {
      setNuevoAccionista({ nombre: '', documento: '', acciones: '', porcentaje: '', fecha: '' });
      setReintento((n) => n + 1);
    }
  }

  async function agregarAjuste() {
    if (orgId <= 0 || !nuevoAjuste.concepto.trim()) return;
    const anio = Number(nuevoAjuste.anio);
    if (anio < 2000 || anio > 2100) {
      setError('El año del ajuste no es válido.');
      return;
    }
    const { error: fallo } = await supabase.from('ajustes_conciliacion_fiscal').insert({
      organization_id: orgId,
      anio,
      concepto: nuevoAjuste.concepto.trim(),
      tipo: nuevoAjuste.tipo,
      valor: numeroLocal(nuevoAjuste.valor),
      formulario: nuevoAjuste.formulario,
    });
    if (fallo) setError(fallo.message);
    else {
      setNuevoAjuste((prev) => ({ ...prev, concepto: '', valor: '' }));
      setReintento((n) => n + 1);
    }
  }

  async function confirmarBorrado() {
    if (!pendiente || orgId <= 0) return;
    setGuardando(true);
    const consulta =
      pendiente.tipo === 'accionista'
        ? supabase.from('accionistas_org').delete().eq('id', pendiente.id).eq('organization_id', orgId)
        : pendiente.tipo === 'ajuste'
          ? supabase.from('ajustes_conciliacion_fiscal').delete().eq('id', pendiente.id).eq('organization_id', orgId)
          : supabase.from('topes_exogena').delete().eq('organization_id', orgId).eq('anio', pendiente.anio).eq('formato', pendiente.formato);
    const { error: fallo } = await consulta;
    setGuardando(false);
    setPendiente(null);
    if (fallo) setError(fallo.message);
    else setReintento((n) => n + 1);
  }

  if (!orgLoading && orgId <= 0) {
    return <EmptyState variante="forbidden" titulo="No hay una organización activa" descripcion="Entra de nuevo para configurar los estados." />;
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        titulo="Configuración de estados financieros"
        subtitulo="Grupo NIIF, firmas, políticas, marcas de cuentas y topes. La organización sale de la sesión."
        icono={Landmark}
        acciones={
          <button type="button" className={clasesBoton({ variante: 'primario' })} disabled={guardando || cargando} onClick={() => void guardarPerfil()}>
            Guardar
          </button>
        }
      />
      {error && <AvisoTonal tono="peligro" titulo="No se pudo guardar" descripcion={error} />}
      {aviso && <AvisoTonal tono="exito" titulo={aviso} />}
      {cargando ? (
        <EmptyState variante="empty" titulo="Cargando la configuración" descripcion="Leyendo el perfil de la organización." />
      ) : (
        <>
          <Tarjeta titulo="Entidad">
            <p className="text-sm text-fg">{entidad || 'Sin razón social en la organización'}</p>
            <p className="text-sm text-fg-secondary">{nit || 'Sin NIT'}</p>
          </Tarjeta>

          <FormSection titulo="Marco de información" descripcion="El grupo 3 presenta situación financiera, resultados y notas. El ORI no se muestra. El cambio en el patrimonio es opcional." columnas={2} icono={Landmark}>
            <FormField etiqueta="Grupo NIIF">
              {(campo) => (
                <SegmentedControl
                  aria-labelledby={campo.idEtiqueta}
                  opciones={[
                    { valor: '2', etiqueta: 'Grupo 2' },
                    { valor: '3', etiqueta: 'Grupo 3' },
                  ]}
                  valor={String(perfil.grupo)}
                  onValorChange={(valor) => patchPerfil({ grupo: valor === '3' ? 3 : 2 })}
                />
              )}
            </FormField>
            <FormField etiqueta="Periodo de IVA">
              {(campo) => (
                <SegmentedControl
                  aria-labelledby={campo.idEtiqueta}
                  opciones={[
                    { valor: 'bimestral', etiqueta: 'Bimestral' },
                    { valor: 'cuatrimestral', etiqueta: 'Cuatrimestral' },
                  ]}
                  valor={perfil.periodoIva}
                  onValorChange={(valor) => patchPerfil({ periodoIva: valor === 'cuatrimestral' ? 'cuatrimestral' : 'bimestral' })}
                />
              )}
            </FormField>
            <label className="flex items-center gap-2 text-sm text-fg">
              <input type="checkbox" className="size-4" checked={perfil.cambiosPatrimonio} onChange={(e) => patchPerfil({ cambiosPatrimonio: e.target.checked })} />
              Presentar cambios en el patrimonio (grupo 3)
            </label>
            <label className="flex items-center gap-2 text-sm text-fg">
              <input type="checkbox" className="size-4" checked={perfil.responsableIva} onChange={(e) => patchPerfil({ responsableIva: e.target.checked })} />
              Responsable de IVA (formatos 1005 y 1006)
            </label>
            <FormField etiqueta="Dígitos de la nota por rubro">
              {(campo) => (
                <SegmentedControl
                  aria-labelledby={campo.idEtiqueta}
                  opciones={[
                    { valor: '4', etiqueta: '4 dígitos' },
                    { valor: '6', etiqueta: '6 dígitos' },
                  ]}
                  valor={String(perfil.digitosNota)}
                  onValorChange={(valor) => patchPerfil({ digitosNota: valor === '6' ? 6 : 4 })}
                />
              )}
            </FormField>
          </FormSection>

          <FormSection titulo="ICA municipal" descripcion="La tarifa y el municipio salen de aquí. 0,7 % es siete por mil." columnas={2}>
            <FormField etiqueta="Municipio">
              <input className={CAMPO} value={perfil.municipioIca} onChange={(e) => patchPerfil({ municipioIca: e.target.value })} />
            </FormField>
            <FormField etiqueta="Actividad">
              <input className={CAMPO} value={perfil.actividad} onChange={(e) => patchPerfil({ actividad: e.target.value })} />
            </FormField>
            <FormField etiqueta="Tarifa (%)">
              <input className={CAMPO} inputMode="decimal" value={perfil.tarifaPorcentaje} onChange={(e) => patchPerfil({ tarifaPorcentaje: e.target.value })} />
            </FormField>
            <FormField etiqueta="Exclusiones en pesos">
              <input className={CAMPO} inputMode="decimal" value={perfil.exclusionesIcaValor} onChange={(e) => patchPerfil({ exclusionesIcaValor: e.target.value })} />
            </FormField>
            <FormField etiqueta="Detalle de exclusiones" className="md:col-span-2">
              <textarea className={AREA} value={perfil.exclusionesIca} onChange={(e) => patchPerfil({ exclusionesIca: e.target.value })} />
            </FormField>
          </FormSection>

          <FormSection titulo="Firmas" descripcion="Certificación del artículo 37 de la Ley 222 de 1995. El dictamen del revisor es el artículo 38 y es opcional." columnas={2}>
            <FormField etiqueta="Representante legal">
              <input className={CAMPO} value={perfil.representanteNombre} onChange={(e) => patchPerfil({ representanteNombre: e.target.value })} />
            </FormField>
            <FormField etiqueta="Documento del representante">
              <input className={CAMPO} value={perfil.representanteDocumento} onChange={(e) => patchPerfil({ representanteDocumento: e.target.value })} />
            </FormField>
            <FormField etiqueta="Contador">
              <input className={CAMPO} value={perfil.contadorNombre} onChange={(e) => patchPerfil({ contadorNombre: e.target.value })} />
            </FormField>
            <FormField etiqueta="Cédula del contador">
              <input className={CAMPO} value={perfil.contadorCedula} onChange={(e) => patchPerfil({ contadorCedula: e.target.value })} />
            </FormField>
            <FormField etiqueta="Tarjeta profesional">
              <input className={CAMPO} value={perfil.contadorTarjeta} onChange={(e) => patchPerfil({ contadorTarjeta: e.target.value })} />
            </FormField>
            <FormField etiqueta="Revisor fiscal">
              <input className={CAMPO} value={perfil.revisorNombre} onChange={(e) => patchPerfil({ revisorNombre: e.target.value })} />
            </FormField>
            <FormField etiqueta="Tarjeta del revisor">
              <input className={CAMPO} value={perfil.revisorTarjeta} onChange={(e) => patchPerfil({ revisorTarjeta: e.target.value })} />
            </FormField>
            <label className="flex items-center gap-2 text-sm text-fg">
              <input type="checkbox" className="size-4" checked={perfil.incluirDictamen} onChange={(e) => patchPerfil({ incluirDictamen: e.target.checked })} />
              Incluir espacio para el dictamen
            </label>
          </FormSection>

          <FormSection titulo="Políticas" descripcion="Si dejas un texto vacío, el informe usa el texto por defecto." columnas={1}>
            {POLITICAS_DEFECTO.map((politica) => (
              <FormField key={politica.id} etiqueta={politica.titulo} ayuda={politica.texto}>
                <textarea
                  className={AREA}
                  value={perfil.notas[politica.id] ?? ''}
                  onChange={(e) => patchPerfil({ notas: { ...perfil.notas, [politica.id]: e.target.value } })}
                />
              </FormField>
            ))}
          </FormSection>

          <FormSection titulo="Informe de gestión" columnas={1}>
            <FormField etiqueta="Texto">
              <textarea className={AREA} value={perfil.informeGestion} onChange={(e) => patchPerfil({ informeGestion: e.target.value })} />
            </FormField>
          </FormSection>

          <FormSection
            titulo="Marcas por cuenta"
            descripcion="Corriente o no corriente, costo fijo o variable, ORI en la 38 y equivalentes de la 12 a tres meses o menos. Sin marca, el motor usa el defecto del grupo PUC."
            columnas={1}
          >
            <SearchInput value={busqueda} onChange={setBusqueda} onValueChange={setBusqueda} placeholder="Buscar cuenta" etiqueta="Buscar cuenta" atajo={false} />
            <p className="text-sm text-fg-secondary">
              {visibles.length} de {marcas.length} cuentas
            </p>
            <div className="flex flex-col gap-4">
              {visibles.map((marca) => {
                const codigo = marca.codigo.replace(/-/g, '');
                return (
                  <div key={marca.codigo} className="grid gap-3 rounded-xl border border-line bg-surface p-4 md:grid-cols-6">
                    <p className="text-sm font-medium text-fg md:col-span-6">
                      {marca.codigo} {marca.nombre}
                    </p>
                    <FormField etiqueta="Presentación">
                      <select className={CAMPO} value={marca.presentacion} onChange={(e) => patchMarca(marca.codigo, { presentacion: e.target.value as Presentacion })}>
                        <option value="">Según el grupo</option>
                        <option value="corriente">Corriente</option>
                        <option value="no_corriente">No corriente</option>
                        <option value="segun_plazo">Según plazo</option>
                      </select>
                    </FormField>
                    <FormField etiqueta="Costo">
                      <select className={CAMPO} value={marca.comportamiento} onChange={(e) => patchMarca(marca.codigo, { comportamiento: e.target.value as Comportamiento })}>
                        <option value="">Según el grupo</option>
                        <option value="fijo">Fijo</option>
                        <option value="variable">Variable</option>
                      </select>
                    </FormField>
                    <FormField etiqueta="Plazo en meses">
                      <input className={CAMPO} inputMode="decimal" value={marca.plazo} onChange={(e) => patchMarca(marca.codigo, { plazo: e.target.value })} />
                    </FormField>
                    <label className="flex items-center gap-2 text-sm text-fg">
                      <input type="checkbox" className="size-4" disabled={!codigo.startsWith('38')} checked={marca.esOri} onChange={(e) => patchMarca(marca.codigo, { esOri: e.target.checked })} />
                      ORI
                    </label>
                    <label className="flex items-center gap-2 text-sm text-fg">
                      <input
                        type="checkbox"
                        className="size-4"
                        disabled={!codigo.startsWith('12')}
                        checked={marca.equivalente}
                        onChange={(e) => patchMarca(marca.codigo, { equivalente: e.target.checked })}
                      />
                      Equivalente
                    </label>
                    <button type="button" className={clasesBoton({ variante: 'secundario', tamano: 'sm' })} disabled={guardando} onClick={() => void guardarMarca(marca)}>
                      Guardar marca
                    </button>
                  </div>
                );
              })}
            </div>
          </FormSection>

          <FormSection titulo="Topes de exógena" descripcion="Por año y formato. Si un año no tiene tope, el informe lo dice y no usa una cuantía fija." columnas={2}>
            <FormField etiqueta="Año">
              <input className={CAMPO} inputMode="numeric" value={anioTope} onChange={(e) => setAnioTope(e.target.value)} />
            </FormField>
            <FormField etiqueta="Formato">
              <select className={CAMPO} value={formatoTope} onChange={(e) => setFormatoTope(e.target.value as (typeof FORMATOS)[number])}>
                {FORMATOS.map((formato) => (
                  <option key={formato} value={formato}>
                    {formato}
                  </option>
                ))}
              </select>
            </FormField>
            <FormField etiqueta="Tope en pesos">
              <input className={CAMPO} inputMode="decimal" value={valorTope} onChange={(e) => setValorTope(e.target.value)} />
            </FormField>
            <button type="button" className={clasesBoton({ variante: 'secundario' })} onClick={() => void agregarTope()}>
              Guardar tope
            </button>
            <div className="md:col-span-2">
              <DataTable
                etiqueta="Topes de exógena"
                filas={topes}
                obtenerId={(fila) => `${fila.anio}-${fila.formato}`}
                columnas={[
                  { id: 'anio', encabezado: 'Año', celda: (fila) => fila.anio },
                  { id: 'formato', encabezado: 'Formato', variante: 'mono', celda: (fila) => fila.formato },
                  { id: 'tope', encabezado: 'Tope', variante: 'importe', celda: (fila) => fila.tope },
                ]}
                acciones={(fila) => [{ id: 'quitar', etiqueta: 'Quitar', icono: Trash2, destructiva: true, onSelect: () => setPendiente({ tipo: 'tope', anio: fila.anio, formato: fila.formato }) }]}
              />
            </div>
          </FormSection>

          <FormSection titulo="Accionistas" columnas={2}>
            <FormField etiqueta="Nombre">
              <input className={CAMPO} value={nuevoAccionista.nombre} onChange={(e) => setNuevoAccionista((prev) => ({ ...prev, nombre: e.target.value }))} />
            </FormField>
            <FormField etiqueta="Documento">
              <input className={CAMPO} value={nuevoAccionista.documento} onChange={(e) => setNuevoAccionista((prev) => ({ ...prev, documento: e.target.value }))} />
            </FormField>
            <FormField etiqueta="Acciones">
              <input className={CAMPO} inputMode="decimal" value={nuevoAccionista.acciones} onChange={(e) => setNuevoAccionista((prev) => ({ ...prev, acciones: e.target.value }))} />
            </FormField>
            <FormField etiqueta="Porcentaje">
              <input className={CAMPO} inputMode="decimal" value={nuevoAccionista.porcentaje} onChange={(e) => setNuevoAccionista((prev) => ({ ...prev, porcentaje: e.target.value }))} />
            </FormField>
            <button type="button" className={clasesBoton({ variante: 'secundario' })} onClick={() => void agregarAccionista()}>
              Agregar accionista
            </button>
            <div className="md:col-span-2">
              <DataTable
                etiqueta="Accionistas"
                filas={accionistas}
                obtenerId={(fila) => fila.id}
                columnas={[
                  { id: 'nombre', encabezado: 'Nombre', celda: (fila) => fila.nombre },
                  { id: 'documento', encabezado: 'Documento', variante: 'mono', celda: (fila) => fila.documento },
                  { id: 'acciones', encabezado: 'Acciones', variante: 'importe', celda: (fila) => fila.acciones },
                  { id: 'porcentaje', encabezado: '%', variante: 'importe', celda: (fila) => fila.porcentaje },
                ]}
                acciones={(fila) => [{ id: 'quitar', etiqueta: 'Quitar', icono: Trash2, destructiva: true, onSelect: () => setPendiente({ tipo: 'accionista', id: fila.id, nombre: fila.nombre }) }]}
              />
            </div>
          </FormSection>

          <FormSection titulo="Ajustes de conciliación fiscal" descripcion="Adiciones y deducciones de los formularios 2516 y 2517. El contador los revisa antes de presentar." columnas={2}>
            <FormField etiqueta="Año">
              <input className={CAMPO} inputMode="numeric" value={nuevoAjuste.anio} onChange={(e) => setNuevoAjuste((prev) => ({ ...prev, anio: e.target.value }))} />
            </FormField>
            <FormField etiqueta="Formulario">
              <select className={CAMPO} value={nuevoAjuste.formulario} onChange={(e) => setNuevoAjuste((prev) => ({ ...prev, formulario: e.target.value === '2517' ? '2517' : '2516' }))}>
                <option value="2516">2516</option>
                <option value="2517">2517</option>
              </select>
            </FormField>
            <FormField etiqueta="Tipo">
              <select className={CAMPO} value={nuevoAjuste.tipo} onChange={(e) => setNuevoAjuste((prev) => ({ ...prev, tipo: e.target.value === 'deduccion' ? 'deduccion' : 'adicion' }))}>
                <option value="adicion">Adición</option>
                <option value="deduccion">Deducción</option>
              </select>
            </FormField>
            <FormField etiqueta="Valor">
              <input className={CAMPO} inputMode="decimal" value={nuevoAjuste.valor} onChange={(e) => setNuevoAjuste((prev) => ({ ...prev, valor: e.target.value }))} />
            </FormField>
            <FormField etiqueta="Concepto" className="md:col-span-2">
              <input className={CAMPO} value={nuevoAjuste.concepto} onChange={(e) => setNuevoAjuste((prev) => ({ ...prev, concepto: e.target.value }))} />
            </FormField>
            <button type="button" className={clasesBoton({ variante: 'secundario' })} onClick={() => void agregarAjuste()}>
              Agregar ajuste
            </button>
            <div className="md:col-span-2">
              <DataTable
                etiqueta="Ajustes fiscales"
                filas={ajustes}
                obtenerId={(fila) => fila.id}
                columnas={[
                  { id: 'anio', encabezado: 'Año', celda: (fila) => fila.anio },
                  { id: 'formulario', encabezado: 'Formulario', celda: (fila) => fila.formulario },
                  { id: 'tipo', encabezado: 'Tipo', celda: (fila) => fila.tipo },
                  { id: 'concepto', encabezado: 'Concepto', celda: (fila) => fila.concepto },
                  { id: 'valor', encabezado: 'Valor', variante: 'importe', celda: (fila) => fila.valor },
                ]}
                acciones={(fila) => [{ id: 'quitar', etiqueta: 'Quitar', icono: Trash2, destructiva: true, onSelect: () => setPendiente({ tipo: 'ajuste', id: fila.id, concepto: fila.concepto }) }]}
              />
            </div>
          </FormSection>
        </>
      )}

      <Dialogo
        abierto={pendiente != null}
        onAbiertoChange={(abierto) => {
          if (!abierto) setPendiente(null);
        }}
        titulo="¿Quitar este registro?"
        descripcion={pendiente?.tipo === 'accionista' ? pendiente.nombre : pendiente?.tipo === 'ajuste' ? pendiente.concepto : pendiente ? `Tope ${pendiente.formato} de ${pendiente.anio}` : ''}
        primario={{ etiqueta: 'Quitar', destructiva: true, cargando: guardando, onClick: () => void confirmarBorrado() }}
      />
    </div>
  );
}
