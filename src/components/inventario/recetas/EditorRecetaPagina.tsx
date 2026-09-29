'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { AlertTriangle, Calculator, ChefHat, Factory, History, Save, Scale } from 'lucide-react';
import {
  EmptyState,
  FormField,
  PageHeader,
  RelatedLinkCard,
  SegmentedControl,
  SelectorEntidad,
  Tarjeta,
} from '@/components/kit';
import { EditorReceta, recetaAPayload, recetaValida, validarReceta, type RecetaBorrador } from '@/components/kit/receta';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/use-toast';
import { useBranch } from '@/lib/context/BranchContext';
import { useFormatDate } from '@/lib/context/OrganizationTimezoneContext';
import { useMonedaOrganizacion } from '@/lib/hooks/useOrgCurrency';
import { getOrganizationId } from '@/lib/hooks/useOrganization';
import { usePermisosInventario } from '@/lib/inventario/usePermisosInventario';
import { puede } from '@/lib/inventario/permisos';
import { supabase } from '@/lib/supabase/config';
import { recipeService, limpiarBusqueda, type VersionReceta } from '@/lib/services/recipeService';
import { cargarEditorReceta, type DatosEditorReceta } from './datosEditor';
import { HojaVersiones } from './HojaVersiones';
import { rutaEditarReceta, rutaRecetas, useMensajeErrorReceta } from './piezas';

/**
 * Crear o editar la receta de un producto (Figma «Recetas — editar versión»
 * 599:147018 y D2 968:176149). Es el MISMO `EditorReceta` del formulario de
 * producto (no un segundo editor): producto final, rinde, ingredientes con
 * unidad, conversión y merma, y el costo en vivo por `fn_receta_costo` en la
 * sucursal del encabezado. Guardar crea la versión N+1 (`fn_receta_guardar`);
 * las órdenes abiertas siguen con su versión.
 */
export function EditorRecetaPagina({ productoId }: { productoId: number | null }) {
  const router = useRouter();
  const { toast } = useToast();
  const t = useTranslations('inventarioRecetas.editor');
  const tc = useTranslations('inventarioRecetas');
  const mensajeError = useMensajeErrorReceta();
  const { formatear: moneda } = useMonedaOrganizacion();
  const { formatDate } = useFormatDate();
  const { branchFilter, branches } = useBranch();
  const permisos = usePermisosInventario();
  const [datos, setDatos] = useState<DatosEditorReceta | null>(null);
  const [borrador, setBorrador] = useState<RecetaBorrador | null>(null);
  const [modo, setModo] = useState<'al_producir' | 'al_vender'>('al_vender');
  const [estado, setEstado] = useState<'elegir' | 'cargando' | 'listo' | 'noEncontrado' | 'error'>(productoId ? 'cargando' : 'elegir');
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [versiones, setVersiones] = useState<VersionReceta[] | null>(null);
  const [verVersiones, setVerVersiones] = useState(false);
  const [recarga, setRecarga] = useState(0);

  const sucursalId = branchFilter ?? branches[0]?.id ?? null;
  const sucursal = useMemo(() => ({ id: sucursalId, nombre: branches.find((b) => b.id === sucursalId)?.name ?? null }), [branches, sucursalId]);

  useEffect(() => {
    if (!productoId) {
      setEstado('elegir');
      return;
    }
    let vivo = true;
    setEstado('cargando');
    cargarEditorReceta(getOrganizationId(), productoId)
      .then((d) => {
        if (!vivo) return;
        if (!d) {
          setEstado('noEncontrado');
          return;
        }
        setDatos(d);
        setBorrador(d.receta);
        setModo(d.producto.modo);
        setEstado('listo');
      })
      .catch((e) => {
        console.error('Error cargando la receta:', e);
        if (vivo) setEstado('error');
      });
    return () => {
      vivo = false;
    };
  }, [productoId, recarga]);

  useEffect(() => {
    if (!productoId) return;
    recipeService
      .versiones(getOrganizationId(), productoId, sucursalId)
      .then(setVersiones)
      .catch(() => setVersiones([]));
  }, [productoId, sucursalId, recarga]);

  const puedeEditar = puede(permisos, 'editar_catalogo');
  const validacion = useMemo(() => (borrador && datos ? validarReceta(borrador, { excluirIds: datos.producto.excluirIds }) : null), [borrador, datos]);
  const valida = !!validacion && recetaValida(validacion);
  const cambio =
    !!datos &&
    !!borrador &&
    (JSON.stringify(recetaAPayload(borrador)) !== JSON.stringify(datos.activa ? recetaAPayload(datos.activa) : null) || modo !== datos.producto.modo);
  const alProducirSinInventario = modo === 'al_producir' && datos?.producto.trackStock === false;
  const version = datos?.activa?.version ?? 0;

  const guardar = async () => {
    if (!datos || !borrador || !valida || alProducirSinInventario) return;
    setGuardando(true);
    setError(null);
    try {
      const r = await recipeService.guardarReceta(getOrganizationId(), datos.producto.id, { ...recetaAPayload(borrador), modo });
      toast({ title: r.cambio ? t('guardada', { version: r.version }) : t('sinCambios') });
      setRecarga((n) => n + 1);
    } catch (e) {
      setError(mensajeError(e));
    } finally {
      setGuardando(false);
    }
  };

  const buscarProducto = useCallback(async (texto: string, senal: AbortSignal) => {
    const limpio = limpiarBusqueda(texto);
    let q = supabase
      .from('products')
      .select('id, name, sku, unit_code')
      .eq('organization_id', getOrganizationId())
      .neq('status', 'deleted')
      .neq('product_type', 'service')
      .eq('is_parent', false)
      .order('name')
      .limit(20)
      .abortSignal(senal);
    if (limpio) q = q.or(`name.ilike.%${limpio}%,sku.ilike.%${limpio}%`);
    const { data, error: e } = await q;
    if (e) throw e;
    return (data ?? []) as { id: number; name: string; sku: string | null; unit_code: string | null }[];
  }, []);

  const migas = [
    { etiqueta: tc('inventario'), href: '/app/inventario' },
    { etiqueta: tc('listado.titulo'), href: rutaRecetas() },
    { etiqueta: datos?.producto.nombre ?? t('nueva') },
  ];

  if (estado === 'elegir') {
    return (
      <div className="flex flex-col gap-4 lg:gap-5">
        <PageHeader titulo={t('nueva')} subtitulo={t('eligeSubtitulo')} icono={ChefHat} variante="form" volverA={rutaRecetas()} migas={migas} />
        <Tarjeta titulo={t('productoFinal')} descripcion={t('productoFinalAyuda')} icono={ChefHat}>
          <FormField etiqueta={t('productoFinal')} obligatorio>
            <SelectorEntidad<{ id: number; name: string; sku: string | null; unit_code: string | null }>
              layout="campo"
              etiqueta={t('productoFinal')}
              icono={ChefHat}
              valor={null}
              aOpcion={(p) => ({ id: String(p.id), titulo: p.name, subtitulo: [p.sku, p.unit_code?.trim()].filter(Boolean).join(' · ') })}
              buscar={buscarProducto}
              onCambiar={(p) => router.replace(rutaEditarReceta(p.id))}
              textos={{ placeholder: t('buscarProducto'), buscar: t('buscarProducto'), titulo: t('productoFinal'), vacio: t('buscarVacio'), sinResultados: t('sinProductos') }}
            />
          </FormField>
        </Tarjeta>
      </div>
    );
  }

  if (estado === 'noEncontrado' || estado === 'error') {
    return (
      <div className="flex flex-col gap-4">
        <PageHeader titulo={t('titulo')} icono={ChefHat} variante="form" volverA={rutaRecetas()} migas={migas} />
        <EmptyState
          variante={estado === 'error' ? 'error' : 'empty'}
          icono={ChefHat}
          titulo={t(`estados.${estado}.titulo`)}
          descripcion={t(`estados.${estado}.descripcion`)}
          accion={estado === 'error' ? { etiqueta: t('reintentar'), onClick: () => setRecarga((n) => n + 1) } : { etiqueta: t('volver'), onClick: () => router.push(rutaRecetas()) }}
        />
      </div>
    );
  }

  const subtitulo = datos
    ? version
      ? t('subtituloEditar', { producto: datos.producto.nombre, siguiente: version + 1, version, count: datos.ordenesAbiertas })
      : t('subtituloNueva', { producto: datos.producto.nombre })
    : undefined;

  const lateral = datos && (
    <div className="flex flex-col gap-4">
      {versiones && versiones.length > 0 && (
        <Tarjeta
          titulo={t('versiones')}
          accion={
            <Button variant="ghost" className="h-8 px-2 text-sm" onClick={() => setVerVersiones(true)}>
              {t('verTodas')}
            </Button>
          }
        >
          <ul className="flex flex-col gap-1.5 text-[13px]">
            {cambio && (
              <li className="flex justify-between gap-2 text-fg-secondary">
                <span>{t('borradorVersion', { version: version + 1 })}</span>
                <span>{t('sinGuardar')}</span>
              </li>
            )}
            {versiones.slice(0, 4).map((v) => (
              <li key={v.recipe_id} className="flex justify-between gap-2">
                <span className="text-fg">
                  v{v.version} · {v.creada_en ? formatDate(v.creada_en) : '—'}
                  {v.activa ? ` · ${t('activa')}` : ''}
                </span>
                <span className="text-fg-secondary">{t('nOrdenes', { count: v.ordenes })}</span>
              </li>
            ))}
          </ul>
        </Tarjeta>
      )}
      <Tarjeta titulo={t('conecta')}>
        <div className="flex flex-col gap-2">
          <RelatedLinkCard icono={Factory} etiqueta={t('ordenes')} valor={t('nAbiertas', { count: datos.ordenesAbiertas })} href={`/app/inventario/produccion?producto=${datos.producto.id}`} textoAccion={t('ver')} />
          <RelatedLinkCard icono={Calculator} etiqueta={t('costoDetallado')} valor={t('verReporte')} href={`/app/inventario/reportes/costo-recetas?busqueda=${encodeURIComponent(datos.producto.nombre)}`} textoAccion={t('ver')} />
          <RelatedLinkCard icono={Scale} etiqueta={t('conversiones')} valor={t('unidades')} href="/app/inventario/conversiones" textoAccion={t('ver')} />
          <RelatedLinkCard icono={History} etiqueta={t('kardex')} valor={t('movimientosProduccion')} href={`/app/inventario/kardex?producto=${datos.producto.id}&origen=production`} textoAccion={t('ver')} />
        </div>
      </Tarjeta>
    </div>
  );

  return (
    <div className="flex flex-col gap-4 lg:gap-5">
      <PageHeader
        titulo={version ? t('titulo') : t('nueva')}
        subtitulo={subtitulo}
        icono={ChefHat}
        variante="form"
        volverA={rutaRecetas()}
        cargando={estado === 'cargando'}
        migas={migas}
        acciones={
          datos && puedeEditar ? (
            <>
              <Button variant="ghost" className="h-10" onClick={() => datos && (setBorrador(datos.receta), setModo(datos.producto.modo))} disabled={!cambio || guardando}>
                {t('descartar')}
              </Button>
              <Button className="h-10 gap-2" onClick={guardar} disabled={!cambio || !valida || alProducirSinInventario || guardando}>
                <Save aria-hidden="true" className="size-4" strokeWidth={1.75} />
                {version ? t('guardarVersion', { version: version + 1 }) : t('crear')}
              </Button>
            </>
          ) : undefined
        }
      />

      {!puedeEditar && estado === 'listo' && (
        <p role="status" className="rounded-xl border border-line bg-subtle px-4 py-3 text-sm text-fg-secondary">
          {t('soloLectura')}
        </p>
      )}

      {datos && borrador && (
        <>
          <Tarjeta titulo={t('productoYRendimiento')} descripcion={t('productoYRendimientoAyuda')} icono={ChefHat}>
            <div className="flex flex-col gap-3">
              <p className="text-sm text-fg">
                <span className="font-medium">{datos.producto.nombre}</span>
                {datos.producto.sku && <span className="text-fg-secondary"> · {datos.producto.sku}</span>}
              </p>
              <div className="flex flex-col gap-2">
                <p id="modo-receta" className="text-sm font-medium text-fg">
                  {t('comoDescuenta')}
                </p>
                <SegmentedControl<'al_producir' | 'al_vender'>
                  aria-labelledby="modo-receta"
                  opciones={[
                    { valor: 'al_producir', etiqueta: t('alProducir') },
                    { valor: 'al_vender', etiqueta: t('alVender') },
                  ]}
                  valor={modo}
                  onValorChange={setModo}
                  deshabilitado={!puedeEditar}
                  className="self-start"
                />
                <p className="rounded-lg bg-brand-tint px-3 py-2 text-[13px] text-brand-deep">{t('explicacionModo')}</p>
                {alProducirSinInventario && (
                  <p role="alert" className="flex items-start gap-2 text-[13px] text-danger-text">
                    <AlertTriangle aria-hidden="true" className="mt-0.5 size-4 shrink-0" strokeWidth={1.75} />
                    {t('alProducirSinInventario')}
                  </p>
                )}
              </div>
            </div>
          </Tarjeta>

          <Tarjeta titulo={t('ingredientesTitulo', { count: borrador.ingredientes.length })} descripcion={t('ingredientesAyuda', { rinde: borrador.rinde ?? 1, unidad: borrador.unidadRinde })} icono={ChefHat}>
            <EditorReceta
              idBase="pagina-receta"
              valor={borrador}
              onCambio={setBorrador}
              organizacionId={getOrganizationId()}
              sucursal={sucursal}
              unidades={datos.unidades}
              excluirIds={datos.producto.excluirIds}
              precioVenta={datos.producto.precio}
              formatearMoneda={(n) => moneda(n)}
              soloLectura={!puedeEditar}
              lateral={lateral}
            />
          </Tarjeta>

          {error && (
            <p role="alert" className="flex items-start gap-2 rounded-lg border border-line-danger bg-danger-subtle px-3 py-2 text-[13px] text-danger-text">
              <AlertTriangle aria-hidden="true" className="mt-0.5 size-4 shrink-0" strokeWidth={1.75} />
              <span>{error}</span>
            </p>
          )}
        </>
      )}

      {datos && (
        <HojaVersiones
          abierto={verVersiones}
          onAbiertoChange={setVerVersiones}
          producto={{ id: datos.producto.id, nombre: datos.producto.nombre }}
          sucursalId={sucursalId}
          puedeEditar={puedeEditar}
          onReactivada={() => setRecarga((n) => n + 1)}
        />
      )}
    </div>
  );
}
