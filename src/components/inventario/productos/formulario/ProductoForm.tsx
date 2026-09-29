'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { FileText, History, Lock, Split } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { EmptyState, FormSection, PageHeader, Stepper, useEsEscritorio, type Miga } from '@/components/kit';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/components/ui/use-toast';
import { useFormatDate } from '@/lib/context/OrganizationTimezoneContext';
import { useMonedaOrganizacion } from '@/lib/hooks/useOrgCurrency';
import { useOrganization } from '@/lib/hooks/useOrganization';
import type { ModoFormularioProducto } from '@/lib/services/productoService';
import { apiMembresias } from '@/lib/services/membresias/clienteMembresias';
import { cn } from '@/utils/Utils';
import { simboloMoneda, useMensajeErrorProducto } from '../detalle/ContextoProducto';
import { useRevisionCodigos } from '../codigos/useRevisionCodigos';
import {
  erroresPorSeccion,
  esMembresia,
  primeraSeccionConError,
  type ErroresFormulario,
  type SeccionFormulario,
} from '../logica/formularioProducto';
import { BarraAcciones, CLASE_PRIMARIO, CLASE_SECUNDARIO } from './BarraAcciones';
import { DialogoDuplicar } from './DialogoDuplicar';
import { guardarProducto } from './guardarProducto';
import { IndiceFormulario } from './IndiceFormulario';
import {
  ICONO_SECCION,
  PASOS_MOVIL,
  SECCIONES_PASO_DETALLES,
  primerPasoConError,
  seccionesVisibles,
  type PasoMovil,
} from './mapaSecciones';
import { MarcoInventario } from './MarcoInventario';
import { SeccionAvanzado } from './secciones/SeccionAvanzado';
import { SeccionCodigos } from './secciones/SeccionCodigos';
import { SeccionImagenes } from './secciones/SeccionImagenes';
import { SeccionImpuestos } from './secciones/SeccionImpuestos';
import { SeccionInformacion } from './secciones/SeccionInformacion';
import { SeccionMembresia } from './secciones/SeccionMembresia';
import { SeccionModificadores } from './secciones/SeccionModificadores';
import { SeccionOrganizacion } from './secciones/SeccionOrganizacion';
import { SeccionPrecios } from './secciones/SeccionPrecios';
import { SeccionVariantes } from './secciones/SeccionVariantes';
import type { MonedaFormulario, PropsSeccionFormulario } from './tipos';
import { useProductoForm } from './useProductoForm';
import { desplazarA } from '@/lib/utils/desplazamiento';

/**
 * Formulario único de producto: nuevo · editar · duplicar, en página o en
 * diálogo (facturas). Una sola implementación de estado, validación y
 * guardado (`fn_producto_guardar`, una transacción).
 *
 * - Escritorio: índice lateral con scroll-spy y marcas de error + secciones
 *   plegables + barra de acciones fija abajo.
 * - Móvil (< lg) al crear o duplicar: stepper de 3 pasos (Lo esencial ·
 *   Inventario y costos · Más detalles) con «Guardar» desde el paso 1.
 * - Móvil al editar: acordeón de secciones y «Guardar cambios» fijo.
 *
 * Diseño: Figma «Nuevo producto» (docs/design/figma/09-nuevo-producto*.png) y
 * docs/design/INVENTARIO-PRODUCTOS-Y-POS.md §3.5.
 */
export interface ProductoGuardadoResumen {
  id: number;
  uuid: string;
  name: string;
  sku: string;
  price: number;
  cost: number;
}

export interface ProductoFormProps {
  modo: ModoFormularioProducto;
  productUuid?: string;
  layout?: 'page' | 'dialog';
  onSuccess?: (p: ProductoGuardadoResumen) => void;
  onCancel?: () => void;
}

const BASE_PRODUCTOS = '/app/inventario/productos';

export function ProductoForm({ modo, productUuid, layout = 'page', onSuccess, onCancel }: ProductoFormProps) {
  const t = useTranslations('productoForm.general');
  const ts = useTranslations('productoForm.secciones');
  const tp = useTranslations('productoForm.pasos');
  const tb = useTranslations('productoForm.barra');
  const td = useTranslations('productoForm.duplicar');
  const router = useRouter();
  const locale = useLocale();
  const { toast } = useToast();
  const { organization } = useOrganization();
  const organizacionId = organization?.id ?? null;
  const fechas = useFormatDate();
  const monedaOrg = useMonedaOrganizacion();
  const esEscritorio = useEsEscritorio();
  const { revisar } = useRevisionCodigos();
  const mensajeError = useMensajeErrorProducto();

  const moneda = useMemo<MonedaFormulario>(
    () => ({
      codigo: monedaOrg.code,
      simbolo: simboloMoneda(monedaOrg.code, monedaOrg.locale || locale),
      decimales: monedaOrg.decimals,
      formatear: monedaOrg.formatear,
    }),
    [monedaOrg, locale],
  );

  const form = useProductoForm({
    modo,
    productUuid,
    organizacionId,
    sufijos: { sku: td('sufijoSku'), nombre: td('sufijoNombre') },
    conBorrador: layout === 'page',
    leerPreseleccionUrl: layout === 'page' && modo === 'crear',
  });
  const { estado } = form;
  const conMembresia = !!estado && esMembresia(estado);

  // memberships.plans.manage (resuelto en el servidor): solo se consulta si el producto es membresía.
  const [puedeMembresia, setPuedeMembresia] = useState<boolean | null>(null);
  const permisoMembresia = useRef<Promise<boolean> | null>(null);
  const resolverPermisoMembresia = useCallback((): Promise<boolean> => {
    permisoMembresia.current ??= apiMembresias
      .permisos()
      .then((p) => p.planes === true)
      .catch(() => false)
      .then((v) => {
        setPuedeMembresia(v);
        return v;
      });
    return permisoMembresia.current;
  }, []);
  useEffect(() => {
    if (conMembresia) void resolverPermisoMembresia();
  }, [conMembresia, resolverPermisoMembresia]);

  const [guardando, setGuardando] = useState<false | 'guardar' | 'otro'>(false);
  const [paso, setPaso] = useState<PasoMovil>('esencial');
  const [forzadas, setForzadas] = useState<ReadonlySet<SeccionFormulario>>(() => new Set());
  const [confirmarSalir, setConfirmarSalir] = useState(false);
  const saliendo = useRef(false);

  const enDialogo = layout === 'dialog';
  const conStepper = !esEscritorio && modo !== 'editar';
  const crearOtro = modo !== 'editar' && !enDialogo;
  const volverA = modo === 'crear' || !productUuid ? BASE_PRODUCTOS : `${BASE_PRODUCTOS}/${productUuid}`;
  const visibles = useMemo(() => seccionesVisibles(estado), [estado]);
  const erroresSeccion = useMemo(() => erroresPorSeccion(form.errores), [form.errores]);
  const seccionesConError = visibles.filter((s) => (erroresSeccion[s] ?? 0) > 0);
  const totalErrores = Object.keys(form.errores).length;
  const permitido = form.permisos === null ? true : modo === 'editar' ? form.permisos.editar : form.permisos.crear;
  const motivoBloqueo = permitido ? null : t('sinPermiso');
  const obligatorioValido = !!estado && estado.sku.trim() !== '' && estado.name.trim().length >= 2;
  const textoGuardar = modo === 'editar' ? tb('guardarCambios') : tb('guardar');

  // Aviso del navegador al cerrar o recargar con cambios sin guardar.
  useEffect(() => {
    if (!form.sucio) return;
    const alSalir = (e: BeforeUnloadEvent) => {
      if (saliendo.current) return;
      e.preventDefault();
      // Navegadores antiguos: sin esto no muestran el aviso.
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', alSalir);
    return () => window.removeEventListener('beforeunload', alSalir);
  }, [form.sucio]);

  const salir = useCallback(() => {
    saliendo.current = true;
    if (onCancel) onCancel();
    else router.push(volverA);
  }, [onCancel, router, volverA]);

  const descartar = () => (form.sucio ? setConfirmarSalir(true) : salir());

  const alInicio = () => {
    desplazarA(document.getElementById('producto-form-inicio'));
  };

  const irASeccion = useCallback((s: SeccionFormulario) => {
    desplazarA(document.getElementById(s));
  }, []);

  /** Abre las secciones con error, lleva al paso y a la sección, y enfoca el primer campo marcado. */
  const irAError = useCallback(
    (err: ErroresFormulario) => {
      const conError = Object.keys(erroresPorSeccion(err)) as SeccionFormulario[];
      setForzadas((prev) => new Set([...prev, ...conError]));
      const pasoError = conStepper ? primerPasoConError(err) : null;
      if (pasoError) setPaso(pasoError);
      const seccion = primeraSeccionConError(err);
      window.setTimeout(() => {
        const contenedor = pasoError ? document.getElementById(`paso-${pasoError}`) : seccion ? document.getElementById(seccion) : null;
        if (!contenedor) return;
        const campo = contenedor.querySelector<HTMLElement>('[aria-invalid="true"]');
        desplazarA(campo ?? contenedor, { block: campo ? 'center' : 'start' });
        campo?.focus({ preventScroll: true });
      }, 80);
    },
    [conStepper],
  );

  const guardar = async (otro: boolean) => {
    if (!estado || !organizacionId || guardando) return;
    if (!permitido) {
      toast({ title: t('sinPermiso'), variant: 'destructive' });
      return;
    }
    const err = form.validar();
    const n = Object.keys(err).length;
    if (n > 0) {
      toast({ title: t('revisaCampos', { count: n }), variant: 'destructive' });
      irAError(err);
      return;
    }
    setGuardando(otro ? 'otro' : 'guardar');
    try {
      const enviarMembresia = esMembresia(estado) ? await resolverPermisoMembresia() : false;
      const r = await guardarProducto({
        organizacionId,
        estado,
        modo,
        productId: form.productId,
        revisarCodigos: revisar,
        claveIdempotencia: form.claveGuardado(),
        conMembresia: enviarMembresia,
      });
      if (!r.ok) {
        if (r.tipo === 'codigos') {
          toast({ title: r.titulo, description: r.mensaje, variant: 'destructive' });
          setForzadas((prev) => new Set([...prev, 'codigos', 'variantes']));
          if (conStepper) setPaso('detalles');
          window.setTimeout(() => irASeccion('codigos'), 80);
        } else if (r.tipo === 'subida') {
          toast({ title: t('errorSubida'), description: r.detalle, variant: 'destructive' });
        } else {
          const campo = form.marcarErrorServidor(r.error.codigo);
          // Con la configuración de membresía, «sin permiso» casi siempre es memberships.plans.manage.
          const descripcion =
            r.error.codigo === 'sin_permiso' && enviarMembresia ? ts('membresia.errorSinPermiso') : mensajeError(r.error);
          toast({ title: t('errorGuardar'), description: descripcion, variant: 'destructive' });
          // Solo cuenta el campo (para abrir su sección y enfocarlo); el texto ya lo marca el hook.
          if (campo) irAError({ [campo]: r.error.codigo } as ErroresFormulario);
        }
        return;
      }
      const { resultado } = r;
      toast({
        title: modo === 'editar' ? t('actualizado') : modo === 'duplicar' ? t('duplicado') : t('creado'),
        description: t('guardadoDescripcion', { nombre: resultado.name }),
      });
      if (r.avisoCodigos) toast({ title: t('avisoCodigos') });

      if (otro) {
        if (modo === 'duplicar') {
          saliendo.current = true;
          router.push(`${BASE_PRODUCTOS}/nuevo`);
          return;
        }
        await form.reiniciar();
        setPaso('esencial');
        setForzadas(new Set());
        alInicio();
        return;
      }
      saliendo.current = true;
      form.marcarGuardado();
      if (onSuccess) {
        onSuccess({
          id: resultado.id,
          uuid: resultado.uuid,
          name: resultado.name,
          sku: resultado.sku,
          price: resultado.price,
          cost: resultado.cost,
        });
        return;
      }
      router.push(`${BASE_PRODUCTOS}/${resultado.uuid}`);
    } catch (e) {
      toast({ title: t('errorGuardar'), description: mensajeError(e), variant: 'destructive' });
    } finally {
      setGuardando(false);
    }
  };

  // ── Cabecera ────────────────────────────────────────────────────────────
  const nombreOriginal = form.datos ? String(form.datos.producto.name) : '';
  const titulo = modo === 'editar' ? t('tituloEditar') : modo === 'duplicar' ? t('tituloDuplicar') : t('tituloCrear');
  const migas: Miga[] = [
    { etiqueta: t('migaInventario'), href: '/app/inventario' },
    { etiqueta: t('migaProductos'), href: BASE_PRODUCTOS },
    ...(modo === 'crear'
      ? [{ etiqueta: t('tituloCrear') }]
      : [
          { etiqueta: nombreOriginal || t('migaProducto'), href: `${BASE_PRODUCTOS}/${productUuid ?? ''}` },
          { etiqueta: modo === 'editar' ? t('migaEditar') : t('migaDuplicar') },
        ]),
  ];
  const indicePaso = PASOS_MOVIL.indexOf(paso) + 1;
  const subtitulo =
    form.fase !== 'listo'
      ? undefined
      : modo === 'editar'
        ? estado?.sku
        : modo === 'duplicar'
          ? t('subtituloDuplicar', { nombre: nombreOriginal })
          : t('subtituloCrear');
  const listo = form.fase === 'listo' && !!estado;
  const botonGuardarMovil = (
    <button
      type="button"
      onClick={() => void guardar(false)}
      disabled={!listo || guardando !== false || !permitido || !obligatorioValido}
      className="h-9 rounded-lg px-2 text-sm font-semibold text-link disabled:opacity-40"
    >
      {guardando ? tb('guardando') : tb('guardarCorto')}
    </button>
  );

  const cabecera = !enDialogo && (
    <PageHeader
      variante="form"
      titulo={titulo}
      subtitulo={subtitulo}
      migas={migas}
      volverA={volverA}
      cargando={form.fase === 'cargando'}
      acciones={
        listo ? (
          <BarraAcciones
            variante="cabecera"
            crearOtro={crearOtro}
            guardando={guardando}
            onDescartar={descartar}
            onGuardar={() => void guardar(false)}
            onGuardarYOtro={() => void guardar(true)}
            motivoBloqueo={motivoBloqueo}
            textoGuardar={textoGuardar}
          />
        ) : undefined
      }
      movil={{
        titulo,
        subtitulo: conStepper && listo ? tp('pasoDe', { n: indicePaso, total: PASOS_MOVIL.length }) : subtitulo,
        accion: listo ? botonGuardarMovil : undefined,
        ocultarBarra: true,
      }}
    />
  );

  const contenedor = (hijos: ReactNode) => (
    <div className={cn('flex min-w-0 flex-col gap-4', !enDialogo && 'p-4 sm:p-6', enDialogo && 'p-4')}>
      {cabecera}
      {hijos}
    </div>
  );

  // ── Estados de carga ───────────────────────────────────────────────────
  if (form.fase === 'cargando' || (form.fase === 'listo' && !estado)) {
    return contenedor(
      <div className="flex flex-col gap-4" aria-busy="true" aria-label={t('cargando')}>
        {[0, 1, 2].map((i) => (
          <div key={i} className="rounded-xl border border-line bg-surface p-4 sm:p-6">
            <Skeleton className="mb-4 h-5 w-48" />
            <div className="grid gap-4 md:grid-cols-2">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          </div>
        ))}
      </div>,
    );
  }
  if (form.fase === 'error') {
    return contenedor(
      <EmptyState variante="error" descripcion={mensajeError(form.errorCarga)} onReintentar={form.reintentar} />,
    );
  }
  if (form.fase === 'noEncontrado') {
    return contenedor(
      <EmptyState
        variante="empty"
        titulo={t('noEncontrado')}
        descripcion={t('noEncontradoDescripcion')}
        accion={{ etiqueta: t('volverCatalogo'), onClick: () => router.push(BASE_PRODUCTOS) }}
      />,
    );
  }
  if (form.fase === 'elegirCopia' && form.datos) {
    return contenedor(
      <DialogoDuplicar abierto datos={form.datos} onConfirmar={form.aplicarDuplicar} onCancelar={salir} />,
    );
  }
  if (!estado || !organizacionId) return null;

  // ── Formulario ─────────────────────────────────────────────────────────
  const props: PropsSeccionFormulario = {
    estado,
    cambiar: form.cambiar,
    actualizar: form.actualizar,
    errores: form.errores,
    modo,
    catalogos: form.catalogos,
    agregarACatalogo: form.agregarACatalogo,
    organizacionId,
    productId: form.productId,
    productUuid,
    moneda,
    hoy: fechas.getToday(),
    ordenesAbiertasReceta: form.ordenesAbiertasReceta,
    puedeConfigurarMembresia: puedeMembresia,
    membresiasVivas: modo === 'editar' ? Number(form.datos?.membresia?.membresias_vivas ?? 0) || 0 : 0,
  };

  // Una membresía no lleva variantes: cada plan es un producto (la base también lo rechaza).
  const avisoSinVariantes = (
    <div role="note" className="flex items-start gap-2 rounded-lg bg-subtle p-3 text-sm text-fg-secondary">
      <Split aria-hidden className="mt-0.5 size-4 shrink-0" strokeWidth={1.5} />
      {ts('membresia.sinVariantes')}
    </div>
  );

  const contenido = (s: SeccionFormulario): ReactNode => {
    switch (s) {
      case 'informacion':
        return <SeccionInformacion {...props} />;
      case 'precios':
        return <SeccionPrecios {...props} />;
      case 'impuestos':
        return <SeccionImpuestos {...props} />;
      case 'membresia':
        return <SeccionMembresia {...props} />;
      case 'inventario':
        return <MarcoInventario {...props} />;
      case 'variantes':
        if (esMembresia(estado)) {
          // Si ya tenía variantes se deja la sección para quitarlas (el error lo marca «Tipo de servicio»).
          return estado.tiene_variantes ? (
            <div className="flex flex-col gap-4">
              {avisoSinVariantes}
              <SeccionVariantes {...props} />
            </div>
          ) : (
            avisoSinVariantes
          );
        }
        return <SeccionVariantes {...props} />;
      case 'modificadores':
        return <SeccionModificadores {...props} />;
      case 'imagenes':
        return <SeccionImagenes {...props} />;
      case 'codigos':
        return <SeccionCodigos {...props} />;
      case 'organizacion':
        return <SeccionOrganizacion {...props} />;
      case 'avanzado':
        return <SeccionAvanzado {...props} />;
    }
  };

  const insigniaErrores = (s: SeccionFormulario) => {
    const n = erroresSeccion[s] ?? 0;
    return n > 0 ? (
      <span className="rounded-full bg-danger-subtle px-2 py-0.5 text-xs font-medium text-danger-text">
        {t('erroresEnSeccion', { count: n })}
      </span>
    ) : undefined;
  };

  /** Marco de una sección: FormSection con icono, ancla (= id de sección) y acordeón. */
  const marco = (s: SeccionFormulario, hijos: ReactNode, opciones: { colapsable: boolean; abierta: boolean }) => {
    const forzada = forzadas.has(s);
    return (
      <FormSection
        // Al forzarla (error) se vuelve a montar abierta: FormSection no es controlado.
        key={`${s}-${forzada ? 'f' : 'n'}`}
        id={s}
        titulo={ts(`${s}.titulo`)}
        descripcion={ts(`${s}.descripcion`)}
        icono={ICONO_SECCION[s]}
        colapsable={opciones.colapsable}
        abiertaPorDefecto={opciones.abierta || forzada}
        accion={insigniaErrores(s)}
        className="scroll-mt-24"
      >
        {hijos}
      </FormSection>
    );
  };

  const avisoPermiso = motivoBloqueo && (
    <div role="status" className="flex items-start gap-2 rounded-lg bg-warning-subtle p-3 text-sm text-warning-text">
      <Lock aria-hidden className="mt-0.5 size-4 shrink-0" strokeWidth={1.5} />
      {motivoBloqueo}
    </div>
  );

  // Borrador recuperado de sessionStorage (decisión 5): se avisa y se puede descartar.
  const avisoBorrador = form.borradorRecuperado && (
    <div role="status" className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg bg-info-subtle p-3 text-sm text-info-text">
      <History aria-hidden className="size-4 shrink-0" strokeWidth={1.5} />
      <span className="min-w-0 flex-1">{t('borradorRecuperado')}</span>
      <button type="button" onClick={form.descartarBorrador} className="font-medium text-link hover:underline">
        {t('descartarBorrador')}
      </button>
    </div>
  );

  // Móvil, crear o duplicar: stepper de 3 pasos.
  if (conStepper) {
    const siguiente = PASOS_MOVIL[indicePaso] as PasoMovil | undefined;
    const anterior = PASOS_MOVIL[indicePaso - 2] as PasoMovil | undefined;
    const cambiarPaso = (p: PasoMovil) => {
      setPaso(p);
      alInicio();
    };
    return contenedor(
      <>
        <span id="producto-form-inicio" className="scroll-mt-24" />
        {avisoPermiso}
        {avisoBorrador}
        <Stepper
          pasos={PASOS_MOVIL.map((p) => ({ valor: p, etiqueta: tp(p) }))}
          actual={paso}
          onPasoClick={cambiarPaso}
          resumenMovil={(n, total, etiqueta) => tp('resumen', { n, total, etiqueta })}
          etiqueta={tp('etiqueta')}
        />
        <div className="flex flex-col gap-4 pb-2" onBlurCapture={form.revalidarSiIntentado}>
          <div id="paso-esencial" className={paso === 'esencial' ? 'flex flex-col gap-4' : 'hidden'}>
            <FormSection id="informacion" titulo={tp('esencial')} icono={ICONO_SECCION.informacion} accion={insigniaErrores('informacion')}>
              <SeccionInformacion {...props} partes="esencial" />
              <SeccionPrecios {...props} partes="venta" />
            </FormSection>
            {marco('imagenes', <SeccionImagenes {...props} />, { colapsable: false, abierta: true })}
          </div>

          <div id="paso-inventario" className={paso === 'inventario' ? 'flex flex-col gap-4' : 'hidden'}>
            {visibles.includes('membresia') && marco('membresia', <SeccionMembresia {...props} />, { colapsable: false, abierta: true })}
            {visibles.includes('inventario') && marco('inventario', <MarcoInventario {...props} />, { colapsable: false, abierta: true })}
            <FormSection id="precios" titulo={ts('precios.titulo')} descripcion={ts('precios.descripcion')} icono={ICONO_SECCION.precios} accion={insigniaErrores('precios')}>
              <SeccionPrecios {...props} partes="costos" />
            </FormSection>
            {marco('impuestos', <SeccionImpuestos {...props} />, { colapsable: false, abierta: true })}
          </div>

          <div id="paso-detalles" className={paso === 'detalles' ? 'flex flex-col gap-3' : 'hidden'}>
            <p className="text-sm text-fg-secondary">{tp('opcional')}</p>
            <FormSection
              id="informacion-extra"
              titulo={tp('masInformacion')}
              descripcion={tp('masInformacionDescripcion')}
              icono={FileText}
              colapsable
              abiertaPorDefecto={false}
            >
              <SeccionInformacion {...props} partes="extra" />
            </FormSection>
            {SECCIONES_PASO_DETALLES.map((s) => marco(s, contenido(s), { colapsable: true, abierta: false }))}
          </div>
        </div>

        <div className="sticky bottom-0 z-20 -mx-4 flex gap-2 border-t border-line bg-surface px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          {anterior && (
            <button type="button" onClick={() => cambiarPaso(anterior)} disabled={guardando !== false} className={cn(CLASE_SECUNDARIO, 'flex-1')}>
              {tp('atras')}
            </button>
          )}
          {enDialogo && siguiente && (
            <button
              type="button"
              onClick={() => void guardar(false)}
              disabled={guardando !== false || !permitido || !obligatorioValido}
              className={cn(CLASE_SECUNDARIO, 'flex-1')}
            >
              {tb('guardarCorto')}
            </button>
          )}
          {siguiente ? (
            <button type="button" onClick={() => cambiarPaso(siguiente)} className={cn(CLASE_PRIMARIO, 'flex-1')}>
              {tp('continuar')}
            </button>
          ) : (
            <button
              type="button"
              onClick={() => void guardar(false)}
              disabled={guardando !== false || !permitido}
              title={motivoBloqueo ?? undefined}
              className={cn(CLASE_PRIMARIO, 'flex-1')}
            >
              {guardando ? tb('guardando') : tp('guardarProducto')}
            </button>
          )}
        </div>

        <ConfirmDialog
          open={confirmarSalir}
          onOpenChange={setConfirmarSalir}
          title={tb('descartarTitulo')}
          description={tb('descartarDescripcion')}
          confirmLabel={tb('descartarConfirmar')}
          cancelLabel={tb('seguirEditando')}
          variant="destructive"
          onConfirm={salir}
        />
      </>,
    );
  }

  // Escritorio (y móvil al editar): lista de secciones plegables.
  const lista = (
    <div className="flex min-w-0 flex-col gap-4" onBlurCapture={form.revalidarSiIntentado}>
      {visibles.map((s) =>
        marco(s, contenido(s), {
          colapsable: true,
          abierta: esEscritorio ? s !== 'avanzado' : s === 'informacion',
        }),
      )}
    </div>
  );

  return contenedor(
    <>
      <span id="producto-form-inicio" className="scroll-mt-24" />
      {avisoPermiso}
      {avisoBorrador}
      {!enDialogo && esEscritorio ? (
        <div className="grid gap-6 lg:grid-cols-[200px_minmax(0,1fr)]">
          <aside>
            <IndiceFormulario secciones={visibles} errores={erroresSeccion} onIr={irASeccion} />
          </aside>
          {lista}
        </div>
      ) : (
        lista
      )}

      {esEscritorio ? (
        <BarraAcciones
          variante="pie"
          className={enDialogo ? '-mx-4' : '-mx-4 sm:-mx-6'}
          crearOtro={crearOtro}
          guardando={guardando}
          onDescartar={descartar}
          onGuardar={() => void guardar(false)}
          onGuardarYOtro={() => void guardar(true)}
          motivoBloqueo={motivoBloqueo}
          seccionesConError={seccionesConError}
          totalErrores={totalErrores}
          sucio={form.sucio}
          textoGuardar={textoGuardar}
        />
      ) : (
        <div className="sticky bottom-0 z-20 -mx-4 flex gap-2 border-t border-line bg-surface px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          {enDialogo && (
            <button type="button" onClick={descartar} disabled={guardando !== false} className={cn(CLASE_SECUNDARIO, 'flex-1')}>
              {tb('descartar')}
            </button>
          )}
          <button
            type="button"
            onClick={() => void guardar(false)}
            disabled={guardando !== false || !permitido}
            title={motivoBloqueo ?? undefined}
            className={cn(CLASE_PRIMARIO, 'flex-1')}
          >
            {guardando ? tb('guardando') : textoGuardar}
          </button>
        </div>
      )}

      <ConfirmDialog
        open={confirmarSalir}
        onOpenChange={setConfirmarSalir}
        title={tb('descartarTitulo')}
        description={tb('descartarDescripcion')}
        confirmLabel={tb('descartarConfirmar')}
        cancelLabel={tb('seguirEditando')}
        variant="destructive"
        onConfirm={salir}
      />
    </>,
  );
}

export default ProductoForm;
