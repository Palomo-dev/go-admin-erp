'use client';

/**
 * Catálogo común › Nuevo / Editar vehículo como página (Figma «23 Transporte» 2970:20719; nota
 * 2972:21942). Reemplaza a `VehicleDialog` y conserva todos sus campos (placa, tipo, marca,
 * modelo, año, color, VIN, capacidades, las cuatro fechas de vencimiento, transportadora, sede,
 * estado y activo); suma el plano de puestos (`vehicles.seat_map_id`, los planos de Transporte ›
 * Pasajes) y el conductor asignado.
 *
 * Rutas: `/app/transporte/vehiculos/nuevo` (`?duplicar=<id>` copia el modelo) y `/[id]/editar`, con
 * su reexportación en Logística. Escribe con `transportService` (cliente de la sesión, RLS) y la
 * organización de la sesión. Documentos: al crear se registran las fechas; al editar, cada
 * documento se sube o renueva con `DialogoDocumento` de Flota (número, vencimiento y archivo), que
 * además copia la fecha al vehículo.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Box, Check, FileText, FileUp, Plus, Truck, Warehouse } from 'lucide-react';
import { AvisoTonal, CampoFecha, EmptyState, FilaDato, FormField, FormSection, ListaDatos, PageHeader, StatusBadge, Tarjeta, clasesBoton } from '@/components/kit';
import { Input } from '@/components/ui/input';
import { toastError, toastSuccess } from '@/components/ui/use-toast';
import { useBranch } from '@/lib/context/BranchContext';
import { useFormatDate } from '@/lib/context/OrganizationTimezoneContext';
import { getOrganizationId } from '@/lib/hooks/useOrganization';
import { supabase } from '@/lib/supabase/config';
import { transportService, type TransportCarrier, type Vehicle } from '@/lib/services/transportService';
import { listarPersonasCatalogo, type PersonaCatalogo } from '@/lib/services/transporte/catalogoComunService';
import { DocumentoError, guardarDocumento, listarDocumentos, type DatosDocumento } from '@/lib/services/transporte/documentosService';
import { listarPlanosPuestos } from '@/lib/services/transporte/fichaCatalogoService';
import { RUTAS_CATALOGO, TIPOS_VEHICULO, ESTADOS_VEHICULO, TONO_DOCS, moduloDeRuta, rutaFicha } from '@/lib/transporte/catalogoComun';
import { documentosFlota, diasEntre, estadoDocumento, type DocumentoTabla } from '@/lib/transporte/documentosFlota';
import { documentosDeDueno } from '@/lib/transporte/fichaCatalogo';
import {
  DOCUMENTO_DE_FECHA,
  FECHAS_VEHICULO,
  agregarBitacora,
  clavePlaca,
  evaluarConductor,
  formularioAVehiculo,
  validarVehiculo,
  vehiculoAFormulario,
  type ErroresVehiculo,
  type FormVehiculo,
} from '@/lib/transporte/formulariosCatalogo';
import { puestosDe, type PlanoDibujo } from '@/lib/transporte/pasajes';
import { DialogoDocumento, type InicialDocumento } from '@/components/transporte/flota/DialogoDocumento';
import { useCapacidadVehiculo, useTipoDocumento } from '@/components/transporte/fichas/TarjetasFicha';
import { CampoInterruptor, CampoSelect } from '@/components/transporte/fichas/CamposFormulario';

type Plano = { id: string; name: string; kind: string; rows: number | null; cols: number | null; layout: unknown };

export function VehiculoFormulario({ id }: { id?: string }) {
  const t = useTranslations('catalogoComun.formVehiculo');
  const tv = useTranslations('catalogoComun.vehiculos');
  const tc = useTranslations('catalogoComun.comun');
  const tTipos = useTranslations('transporte.tiposVehiculo');
  const tFlota = useTranslations('transporte.flota');
  const router = useRouter();
  const modulo = moduloDeRuta(usePathname());
  const rutas = RUTAS_CATALOGO[modulo];
  const duplicarDe = useSearchParams()?.get('duplicar') ?? null;
  const { getToday, formatPlain } = useFormatDate();
  const hoy = getToday();
  const { selectedBranchId } = useBranch();
  const organizationId = Number(getOrganizationId()) || null;
  const capacidadDe = useCapacidadVehiculo();
  const tipoDocumento = useTipoDocumento();
  const editando = !!id;
  const origenId = id ?? duplicarDe;

  const [original, setOriginal] = useState<Vehicle | null>(null);
  const [form, setForm] = useState<FormVehiculo>(() => vehiculoAFormulario(null, { sede: selectedBranchId ?? null }));
  const [errores, setErrores] = useState<ErroresVehiculo>({});
  const [vehiculos, setVehiculos] = useState<Vehicle[]>([]);
  const [carriers, setCarriers] = useState<TransportCarrier[]>([]);
  const [sedes, setSedes] = useState<{ id: number; name: string }[]>([]);
  const [planos, setPlanos] = useState<Plano[]>([]);
  const [personas, setPersonas] = useState<PersonaCatalogo[]>([]);
  const [tabla, setTabla] = useState<DocumentoTabla[]>([]);
  const [carga, setCarga] = useState<'cargando' | 'listo' | 'noEncontrado' | 'error'>('cargando');
  const [guardando, setGuardando] = useState<false | 'guardar' | 'otro'>(false);
  const [documento, setDocumento] = useState<InicialDocumento | null>(null);
  const [recargaDocs, setRecargaDocs] = useState(0);

  useEffect(() => {
    if (!organizationId) return;
    let cancelado = false;
    (async () => {
      try {
        const [v, c, s, pl, p, d] = await Promise.all([
          transportService.getVehicles(organizationId, null),
          transportService.getCarriers(organizationId).catch(() => [] as TransportCarrier[]),
          transportService.getBranches(organizationId).catch(() => [] as { id: number; name: string }[]),
          listarPlanosPuestos(supabase, organizationId).catch(() => [] as Plano[]),
          listarPersonasCatalogo(supabase, organizationId).catch(() => [] as PersonaCatalogo[]),
          listarDocumentos(supabase, organizationId).catch(() => [] as DocumentoTabla[]),
        ]);
        if (cancelado) return;
        setVehiculos(v);
        setCarriers(c);
        setSedes(s);
        setPlanos(pl);
        setPersonas(p);
        setTabla(d);
        if (origenId) {
          // La organización sale de la sesión: solo se edita o duplica un vehículo de esta organización.
          const base = v.find((x) => x.id === origenId) ?? null;
          if (!base) {
            setCarga('noEncontrado');
            return;
          }
          setOriginal(editando ? base : null);
          setForm(vehiculoAFormulario(base, { sede: selectedBranchId ?? null, duplicar: !editando }));
        }
        setCarga('listo');
      } catch {
        if (!cancelado) setCarga('error');
      }
    })();
    return () => {
      cancelado = true;
    };
    // Se carga una vez por vehículo; la sede activa solo da el valor inicial.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [organizationId, origenId, editando]);

  // Documentos de Flota del vehículo que se edita (se vuelven a leer al subir uno).
  useEffect(() => {
    if (!organizationId || !recargaDocs) return;
    listarDocumentos(supabase, organizationId)
      .then(setTabla)
      .catch(() => undefined);
    if (id) transportService.getVehicleById(id).then((v) => setOriginal(v)).catch(() => undefined);
  }, [organizationId, recargaDocs, id]);

  const poner = <K extends keyof FormVehiculo>(k: K, v: FormVehiculo[K]) => {
    setForm((f) => ({ ...f, [k]: v }));
    if (errores[k]) setErrores((e) => ({ ...e, [k]: undefined }));
  };

  const placas = useMemo(() => new Set(vehiculos.filter((v) => v.id !== id).map((v) => clavePlaca(v.plate))), [vehiculos, id]);
  const anioMaximo = Number(hoy.slice(0, 4)) + 1;
  const tipoTexto = (tipo: string) => (tTipos.has(tipo) ? tTipos(tipo) : tipo);
  const error = (k: keyof FormVehiculo) => (errores[k] ? t(`errores.${k}.${errores[k]}`) : null);

  // ── Documentos (sección 4) ────────────────────────────────────────────────
  const docsEditando = useMemo(() => {
    if (!original) return [];
    const docs = documentosFlota(
      [{ id: original.id, plate: original.plate, vehicle_type: original.vehicle_type, soat_expiry: original.soat_expiry ?? null, techno_expiry: original.techno_expiry ?? null, insurance_expiry: original.insurance_expiry ?? null, operating_card_expiry: original.operating_card_expiry ?? null }],
      [],
      hoy,
      tabla,
    );
    return documentosDeDueno('vehiculo', original.id, docs, tabla);
  }, [original, hoy, tabla]);
  const estadoFecha = (vence: string) => {
    const dias = diasEntre(hoy, vence);
    return Number.isFinite(dias) ? { estado: estadoDocumento(dias), dias } : null;
  };
  const filasDocs = FECHAS_VEHICULO.map((campo) => {
    const tipo = DOCUMENTO_DE_FECHA[campo];
    if (editando) {
      const d = docsEditando.find((x) => x.tipo === tipo);
      return { campo, tipo, vence: d?.vence ?? null, estado: d?.estado ?? ('sin_fecha' as const), dias: d?.dias ?? null, archivo: !!d?.archivo, docId: d?.docId ?? null };
    }
    const e = form[campo] ? estadoFecha(form[campo]) : null;
    return { campo, tipo, vence: form[campo] || null, estado: e?.estado ?? ('sin_fecha' as const), dias: e?.dias ?? null, archivo: false, docId: null };
  });
  const conteoDocs = { vigente: 0, por_vencer: 0, vencido: 0, sin_fecha: 0 };
  for (const f of filasDocs) conteoDocs[f.estado] += 1;
  const proximo = filasDocs.filter((f) => f.estado === 'por_vencer' || f.estado === 'vencido').sort((a, b) => (a.dias ?? 0) - (b.dias ?? 0))[0];

  // ── Opciones ──────────────────────────────────────────────────────────────
  const opcionesConductor = useMemo(() => {
    const lista = personas
      .filter((p) => p.userId)
      .map((p) => ({ p, e: evaluarConductor(p, form.vehicle_type, hoy) }))
      .filter(({ p, e }) => e.apto || p.userId === form.current_driver_id);
    return lista
      .sort((a, b) => a.p.nombre.localeCompare(b.p.nombre, 'es'))
      .map(({ p, e }) => ({
        valor: p.userId as string,
        etiqueta: [p.nombre || '—', p.licenciaCategoria ? t(e.porVencer ? 'licenciaPorVencer' : e.apto ? 'licenciaVigente' : 'licenciaNoSirve', { categoria: p.licenciaCategoria }) : null].filter(Boolean).join(' · '),
      }));
  }, [personas, form.vehicle_type, form.current_driver_id, hoy, t]);
  const conductorElegido = personas.find((p) => p.userId === form.current_driver_id) ?? null;
  const planoElegido = planos.find((p) => p.id === form.seat_map_id) ?? null;
  const puestos = (p: Plano) => {
    try {
      return Array.isArray(p.layout) ? puestosDe({ kind: 'bus', rows: p.rows ?? 0, cols: p.cols ?? 0, layout: p.layout } as PlanoDibujo) : null;
    } catch {
      return null;
    }
  };

  // ── Guardar ───────────────────────────────────────────────────────────────
  const volverA = editando && id ? rutaFicha(modulo, 'vehiculo', id) : rutas.vehiculos;

  const guardar = useCallback(
    async (modo: 'guardar' | 'otro') => {
      if (!organizationId) return;
      const e = validarVehiculo(form, placas, anioMaximo);
      const conError = (Object.keys(e) as (keyof FormVehiculo)[]).filter((k) => e[k]);
      if (conError.length) {
        setErrores(e);
        toastError(t('toast.revisa', { count: conError.length }));
        document.getElementById(`vehiculo-${conError[0]}`)?.focus();
        return;
      }
      setGuardando(modo);
      try {
        const datos = formularioAVehiculo(form);
        if (editando && original) {
          // Al editar, las fechas las mantiene Flota (cada documento las copia al vehículo).
          for (const c of FECHAS_VEHICULO) delete datos[c];
          let metadata: unknown = original.metadata ?? {};
          if (form.status !== original.status) metadata = agregarBitacora(metadata, { tipo: 'estado', de: original.status, a: form.status, motivo: null, at: new Date().toISOString() });
          if ((form.current_driver_id ?? null) !== (original.current_driver_id ?? null)) {
            const nombre = (u: string | null | undefined) => (u ? personas.find((p) => p.userId === u)?.nombre ?? null : null);
            metadata = agregarBitacora(metadata, { tipo: 'conductor', de: nombre(original.current_driver_id), a: nombre(form.current_driver_id), at: new Date().toISOString() });
          }
          await transportService.updateVehicle(original.id, { ...datos, metadata } as Partial<Vehicle>);
          toastSuccess(tv('toast.actualizado'));
          router.push(rutaFicha(modulo, 'vehiculo', original.id));
          return;
        }
        const creado = await transportService.createVehicle({ ...datos, organization_id: organizationId } as Partial<Vehicle>);
        toastSuccess(tv('toast.creado'));
        if (modo === 'otro') {
          setVehiculos((v) => [...v, creado]);
          setForm(vehiculoAFormulario(null, { sede: form.branch_id }));
          setErrores({});
          window.scrollTo({ top: 0 });
        } else {
          router.push(rutaFicha(modulo, 'vehiculo', creado.id));
        }
      } catch (err) {
        const codigo = (err as { code?: string })?.code;
        if (codigo === '23505') setErrores((x) => ({ ...x, plate: 'duplicada' }));
        toastError(codigo === '23505' ? t('errores.plate.duplicada') : tv('toast.errorGuardar'));
      } finally {
        setGuardando(false);
      }
    },
    [organizationId, form, placas, anioMaximo, editando, original, personas, router, modulo, t, tv],
  );

  const guardarDocumentoVehiculo = async (datos: DatosDocumento, archivo: File | null) => {
    if (!organizationId) return false;
    try {
      await guardarDocumento(supabase, organizationId, datos, archivo);
      toastSuccess(tFlota('toast.guardado'));
      setRecargaDocs((n) => n + 1);
      return true;
    } catch (e) {
      toastError(tFlota(`errores.${e instanceof DocumentoError ? e.codigo : 'error'}`));
      return false;
    }
  };

  const titulo = editando ? t('tituloEditar', { placa: original?.plate ?? '' }) : t('tituloNuevo');
  const migas = [{ etiqueta: tc(`migas.${modulo}`), href: rutas.inicio }, { etiqueta: tv('titulo'), href: rutas.vehiculos }, ...(editando && original ? [{ etiqueta: original.plate, href: volverA }] : []), { etiqueta: editando ? t('migaEditar') : t('migaNuevo') }];

  if (carga === 'noEncontrado' || carga === 'error') {
    return (
      <div className="flex flex-col gap-4 p-4 pb-28 sm:p-6 sm:pb-28 lg:gap-5">
        <PageHeader titulo={titulo} migas={migas.slice(0, 2)} variante="form" volverA={rutas.vehiculos} />
        <div className="rounded-xl border border-line bg-surface">
          {carga === 'noEncontrado' ? (
            <EmptyState variante="search" titulo={t('noEncontrado')} accion={{ etiqueta: t('volver'), href: rutas.vehiculos }} />
          ) : (
            <EmptyState variante="error" titulo={tc('ficha.errorCarga')} accion={{ etiqueta: t('volver'), href: rutas.vehiculos }} />
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
        movil={{ titulo, accion: <button type="button" className={clasesBoton({ variante: 'primario', tamano: 'sm' })} disabled={!!guardando || carga !== 'listo'} onClick={() => void guardar('guardar')}>{t('guardarCorto')}</button> }}
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
          <FormSection titulo={t('secciones.identificacion.titulo')} descripcion={t('secciones.identificacion.descripcion')} icono={Truck} columnas={2}>
            <FormField etiqueta={t('campos.plate')} obligatorio ayuda={t('ayudas.plate')} error={error('plate')}>
              <Input id="vehiculo-plate" value={form.plate} onChange={(e) => poner('plate', e.target.value)} maxLength={20} autoComplete="off" />
            </FormField>
            <CampoSelect
              etiqueta={t('campos.vehicle_type')}
              obligatorio
              valor={form.vehicle_type}
              onValor={(v) => poner('vehicle_type', v ?? 'car')}
              opciones={TIPOS_VEHICULO.map((x) => ({ valor: x, etiqueta: tipoTexto(x) }))}
              ayuda={t('ayudas.vehicle_type')}
              error={error('vehicle_type')}
            />
            <FormField etiqueta={t('campos.brand')}>
              <Input id="vehiculo-brand" value={form.brand} onChange={(e) => poner('brand', e.target.value)} maxLength={60} />
            </FormField>
            <FormField etiqueta={t('campos.model')}>
              <Input id="vehiculo-model" value={form.model} onChange={(e) => poner('model', e.target.value)} maxLength={60} />
            </FormField>
            <FormField etiqueta={t('campos.year')} error={error('year')}>
              <Input id="vehiculo-year" inputMode="numeric" value={form.year} onChange={(e) => poner('year', e.target.value)} maxLength={4} />
            </FormField>
            <FormField etiqueta={t('campos.color')}>
              <Input id="vehiculo-color" value={form.color} onChange={(e) => poner('color', e.target.value)} maxLength={40} />
            </FormField>
            <FormField etiqueta={t('campos.vin')} className="sm:col-span-2">
              <Input id="vehiculo-vin" value={form.vin} onChange={(e) => poner('vin', e.target.value)} maxLength={40} autoComplete="off" />
            </FormField>
          </FormSection>

          <FormSection titulo={t('secciones.capacidad.titulo')} descripcion={t('secciones.capacidad.descripcion')} icono={Box} columnas={3}>
            <FormField etiqueta={t('campos.capacity_kg')} error={error('capacity_kg')}>
              <Input id="vehiculo-capacity_kg" inputMode="decimal" value={form.capacity_kg} onChange={(e) => poner('capacity_kg', e.target.value)} />
            </FormField>
            <FormField etiqueta={t('campos.capacity_m3')} error={error('capacity_m3')}>
              <Input id="vehiculo-capacity_m3" inputMode="decimal" value={form.capacity_m3} onChange={(e) => poner('capacity_m3', e.target.value)} />
            </FormField>
            <FormField etiqueta={t('campos.passenger_capacity')} ayuda={t('ayudas.passenger_capacity')} error={error('passenger_capacity')}>
              <Input id="vehiculo-passenger_capacity" inputMode="numeric" value={form.passenger_capacity} onChange={(e) => poner('passenger_capacity', e.target.value)} />
            </FormField>
            <div className="sm:col-span-3">
              <CampoSelect
                etiqueta={t('campos.seat_map_id')}
                valor={form.seat_map_id}
                onValor={(v) => poner('seat_map_id', v)}
                ninguno={t('sinPlano')}
                opciones={planos.map((p) => {
                  const n = puestos(p);
                  return { valor: p.id, etiqueta: n ? t('planoPuestos', { nombre: p.name, count: n }) : p.name };
                })}
                ayuda={planos.length ? t('ayudas.seat_map_id') : t('ayudas.sinPlanos')}
              />
            </div>
          </FormSection>

          <FormSection titulo={t('secciones.operacion.titulo')} descripcion={t('secciones.operacion.descripcion')} icono={Warehouse} columnas={2}>
            <CampoSelect
              etiqueta={t('campos.branch_id')}
              valor={form.branch_id ? String(form.branch_id) : null}
              onValor={(v) => poner('branch_id', v ? Number(v) : null)}
              ninguno={t('todasLasSedes')}
              opciones={sedes.map((s) => ({ valor: String(s.id), etiqueta: s.name }))}
            />
            <CampoSelect
              etiqueta={t('campos.carrier_id')}
              valor={form.carrier_id}
              onValor={(v) => poner('carrier_id', v)}
              ninguno={t('propio')}
              opciones={carriers.map((c) => ({ valor: c.id, etiqueta: c.name }))}
              ayuda={t('ayudas.carrier_id')}
            />
            <CampoSelect
              etiqueta={t('campos.current_driver_id')}
              valor={form.current_driver_id}
              onValor={(v) => poner('current_driver_id', v)}
              ninguno={tv('sinAsignar')}
              opciones={opcionesConductor}
              ayuda={t('ayudas.current_driver_id')}
            />
            <CampoSelect
              etiqueta={t('campos.status')}
              valor={form.status}
              onValor={(v) => poner('status', v ?? 'available')}
              opciones={ESTADOS_VEHICULO.map((e) => ({ valor: e, etiqueta: tv(`estados.${e}`) }))}
              ayuda={t('ayudas.status')}
            />
            <div className="sm:col-span-2">
              <CampoInterruptor id="vehiculo-activo" titulo={t('campos.is_active')} descripcion={t('ayudas.is_active')} valor={form.is_active} onValor={(v) => poner('is_active', v)} />
            </div>
          </FormSection>

          <FormSection titulo={t('secciones.documentos.titulo')} descripcion={t('secciones.documentos.descripcion')} icono={FileText}>
            <ul className="flex flex-col gap-3">
              {filasDocs.map((d) => (
                <li key={d.campo} className="flex flex-col gap-3 rounded-xl border border-line p-3 sm:flex-row sm:items-center">
                  <div className="flex min-w-0 flex-1 flex-col">
                    <span className="text-sm font-medium text-fg">{tipoDocumento(d.tipo)}</span>
                    <span className="text-[13px] text-fg-secondary">
                      {d.vence ? t('venceEl', { fecha: formatPlain(d.vence) }) : t('sinFechaNiArchivo')}
                      {editando && d.vence ? ` · ${d.archivo ? tc('ficha.documentos.conArchivo') : tc('ficha.documentos.sinArchivo')}` : ''}
                    </span>
                  </div>
                  <StatusBadge
                    estado={d.estado}
                    tono={TONO_DOCS[d.estado]}
                    etiqueta={d.estado === 'por_vencer' && d.dias !== null ? t('venceEn', { count: d.dias }) : tc(`docs.${d.estado}`)}
                  />
                  {editando ? (
                    <button type="button" className={clasesBoton({ variante: 'secundario', tamano: 'sm' })} onClick={() => original && setDocumento({ de: 'vehiculo', duenoId: original.id, tipo: d.tipo })}>
                      {d.docId || d.vence ? <FileUp aria-hidden="true" className="size-4" strokeWidth={1.5} /> : <Plus aria-hidden="true" className="size-4" strokeWidth={1.5} />}
                      {d.docId || d.vence ? t('cambiar') : t('agregar')}
                    </button>
                  ) : (
                    <div className="sm:w-48">
                      <FormField etiqueta={t('vence')} etiquetaOculta error={error(d.campo)}>
                        {(cp) => <CampoFecha id={cp.id} valor={form[d.campo]} onValorChange={(v) => poner(d.campo, v)} limpiable hoy={hoy} />}
                      </FormField>
                    </div>
                  )}
                </li>
              ))}
            </ul>
            {!editando && <p className="pt-2 text-xs text-fg-muted">{t('archivoDespues')}</p>}
          </FormSection>
          <div className="flex flex-col gap-2 lg:hidden">{botones(true)}</div>
        </form>

        <aside className="hidden lg:block">
          <Tarjeta titulo={t('resumen.titulo')} className="sticky top-4">
            <div className="flex flex-col gap-4">
              <ListaDatos etiqueta={t('resumen.titulo')}>
                <FilaDato etiqueta={t('campos.plate')} valor={form.plate.trim().toUpperCase() || '—'} />
                <FilaDato
                  etiqueta={t('campos.vehicle_type')}
                  valor={[tipoTexto(form.vehicle_type), capacidadDe({ pasajeros: Number(form.passenger_capacity) || null, kg: Number(form.capacity_kg) || null, m3: Number(form.capacity_m3) || null })].filter(Boolean).join(' · ')}
                />
                <FilaDato etiqueta={t('campos.branch_id')} valor={sedes.find((s) => s.id === form.branch_id)?.name ?? t('todasLasSedes')} />
                <FilaDato etiqueta={t('resumen.conductor')} valor={conductorElegido?.nombre ?? tv('sinAsignar')} />
                {planoElegido && <FilaDato etiqueta={t('campos.seat_map_id')} valor={planoElegido.name} />}
              </ListaDatos>
              <div className="flex flex-wrap gap-2 border-t border-line pt-3">
                {(['vigente', 'por_vencer', 'vencido', 'sin_fecha'] as const)
                  .filter((e) => conteoDocs[e] > 0)
                  .map((e) => (
                    <StatusBadge key={e} estado={e} tono={TONO_DOCS[e]} apariencia="contorno" etiqueta={t(`resumen.docs.${e}`, { count: conteoDocs[e] })} />
                  ))}
              </div>
              {proximo && proximo.vence && (
                <AvisoTonal
                  tono={proximo.estado === 'vencido' ? 'peligro' : 'advertencia'}
                  compacto
                  titulo={proximo.estado === 'vencido' ? t('resumen.vencido', { documento: tipoDocumento(proximo.tipo) }) : t('resumen.porVencer', { documento: tipoDocumento(proximo.tipo), count: proximo.dias ?? 0 })}
                  descripcion={t('resumen.avisoDescripcion')}
                />
              )}
              <div className="flex flex-col gap-2">{botones(true)}</div>
            </div>
          </Tarjeta>
        </aside>
      </div>

      {documento && original && (
        <DialogoDocumento
          vehiculos={[{ id: original.id, nombre: original.plate }]}
          conductores={[]}
          inicial={documento}
          onCerrar={() => setDocumento(null)}
          onGuardar={guardarDocumentoVehiculo}
        />
      )}
    </div>
  );
}
