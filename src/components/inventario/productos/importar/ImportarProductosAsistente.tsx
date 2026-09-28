'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { ArrowLeft, ArrowRight, Download, FileSpreadsheet, Loader2, Play, Upload, Square, RotateCcw, Package } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from '@/components/ui/use-toast';
import { PageHeader, RowActionsMenu, Stepper, type AccionFila } from '@/components/kit';
import { useOrganization } from '@/lib/hooks/useOrganization';
import { useBranch } from '@/lib/context/BranchContext';
import { useOrgCurrency } from '@/lib/hooks/useOrgCurrency';
import { plantillaCsv } from '@/lib/inventario/importacion/reporte';
import { useAsistenteImportacion, type Paso } from './useAsistenteImportacion';
import { PasoOrigen } from './PasoOrigen';
import { PasoMapeo } from './PasoMapeo';
import { PasoSeleccionWeb } from './PasoSeleccionWeb';
import { PasoValidacion } from './PasoValidacion';
import { PasoVistaPrevia } from './PasoVistaPrevia';
import { PasoResultado } from './PasoResultado';
import { descargarTexto, exportarCatalogoCsv, textosExportacion } from './exportarCatalogoCsv';

const RUTA_PRODUCTOS = '/app/inventario/productos';

/**
 * Asistente de importación de productos (Figma «Importar productos»):
 * Origen → Mapeo (archivo) / Selección (web) → Validación → Previsualización → Resultado.
 * La importación corre en el servidor por lotes (RPC transaccional).
 */
export function ImportarProductosAsistente() {
  const t = useTranslations('productosImportar');
  const router = useRouter();
  const params = useSearchParams();
  const { organization } = useOrganization();
  const { branches, selectedBranchId } = useBranch();
  const moneda = useOrgCurrency();
  const orgId = organization?.id;
  const a = useAsistenteImportacion(orgId);
  const [exportando, setExportando] = useState(false);

  // `?origen=web` abre directamente la importación desde una web (menú «Importar ▾»).
  useEffect(() => {
    if (params?.get('origen') === 'web') a.setOrigen('web');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!a.branchId && selectedBranchId) a.setBranchId(selectedBranchId);
    else if (!a.branchId && branches.length === 1 && branches[0].id) a.setBranchId(branches[0].id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedBranchId, branches]);

  // Volver a Validación o Previsualización desde los pasos: si cambió la lectura, se revalida.
  useEffect(() => {
    if ((a.paso === 'validacion' || a.paso === 'vista') && !a.contexto && !a.cargandoContexto && !a.errorContexto) void a.validarContraCatalogo();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [a.paso, a.contexto, a.cargandoContexto, a.errorContexto]);

  const error = (m: string) => toast({ variant: 'destructive', title: t('toast.error'), description: m });
  const info = (m: string) => toast({ title: m });

  const descargarPlantilla = () => {
    descargarTexto(plantillaCsv(textosExportacion(t).cabeceras), 'plantilla_productos.csv');
    info(t('toast.plantilla'));
  };

  const exportar = async () => {
    if (!orgId) return;
    setExportando(true);
    try {
      const { csv, total } = await exportarCatalogoCsv(orgId, textosExportacion(t));
      if (total === 0) return info(t('toast.sinProductos'));
      descargarTexto(csv, `productos_${new Date().getTime()}.csv`);
      info(t('toast.exportado', { n: total }));
    } catch (e) {
      error(t('toast.errorExportar', { mensaje: e instanceof Error ? e.message : String(e) }));
    } finally {
      setExportando(false);
    }
  };

  // Al entrar en Validación, el efecto de arriba valida contra el catálogo.
  const irA = (paso: Paso) => a.setPaso(paso);

  const indice = a.pasos.indexOf(a.paso);
  const anterior = indice > 0 ? a.pasos[indice - 1] : null;
  const corriendo = a.ejecucion?.estado === 'corriendo';

  // ── Botón principal según el paso ─────────────────────────────────────
  let principal: { etiqueta: string; onClick: () => void; deshabilitado?: boolean; icono: typeof ArrowRight } | null = null;
  if (a.paso === 'origen') {
    const listo = a.origen === 'archivo' ? !!a.archivo : !!a.web;
    if (listo) principal = { etiqueta: t('acciones.continuar'), icono: ArrowRight, onClick: () => irA(a.origen === 'archivo' ? 'mapeo' : 'seleccion') };
  } else if (a.paso === 'mapeo') {
    principal = { etiqueta: t('acciones.continuar'), icono: ArrowRight, deshabilitado: a.faltantes.includes('name') || a.filasLeidas.length === 0, onClick: () => irA('validacion') };
  } else if (a.paso === 'seleccion') {
    principal = { etiqueta: t('acciones.continuar'), icono: ArrowRight, deshabilitado: !a.web?.seleccion.size, onClick: () => irA('validacion') };
  } else if (a.paso === 'validacion') {
    principal = { etiqueta: t('acciones.revisar'), icono: ArrowRight, deshabilitado: !a.contexto || !a.branchId || a.cargandoContexto, onClick: () => a.setPaso('vista') };
  } else if (a.paso === 'vista') {
    principal = { etiqueta: t('acciones.importar', { n: a.resumen.aImportar }), icono: Play, deshabilitado: a.resumen.aImportar === 0 || !a.branchId, onClick: () => void a.importar() };
  }

  const masAcciones: AccionFila[] = [
    { id: 'plantilla', etiqueta: t('acciones.plantilla'), icono: FileSpreadsheet, onSelect: descargarPlantilla },
    { id: 'exportar', etiqueta: exportando ? t('acciones.exportando') : t('acciones.exportar'), icono: Download, onSelect: () => void exportar(), deshabilitada: exportando, motivo: t('acciones.exportando') },
  ];

  const host = (() => {
    try {
      return a.web ? new URL(a.web.url).host : '';
    } catch {
      return '';
    }
  })();
  const subtitulo =
    a.origen === 'archivo'
      ? a.archivo
        ? t('subtituloArchivo', { nombre: a.archivo.nombre })
        : t('subtituloArchivoVacio')
      : a.web
        ? t('subtituloWeb', { host })
        : t('subtituloWebVacio');
  const sucursal = branches.find((b) => b.id === a.branchId)?.name;

  return (
    <div className="flex flex-col gap-4 pb-24 lg:pb-0">
      <PageHeader
        variante="form"
        volverA={RUTA_PRODUCTOS}
        titulo={t('titulo')}
        subtitulo={subtitulo}
        icono={Upload}
        migas={[
          { etiqueta: t('migas.inventario'), href: '/app/inventario' },
          { etiqueta: t('migas.productos'), href: RUTA_PRODUCTOS },
          { etiqueta: t('migas.importar') },
        ]}
        acciones={
          <>
            <Button variant="outline" onClick={descargarPlantilla}>
              <FileSpreadsheet className="size-4" aria-hidden="true" /> {t('acciones.plantilla')}
            </Button>
            <Button variant="outline" onClick={() => void exportar()} disabled={exportando}>
              {exportando ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <Download className="size-4" aria-hidden="true" />} {exportando ? t('acciones.exportando') : t('acciones.exportar')}
            </Button>
            <Button variant="ghost" asChild disabled={corriendo}>
              <Link href={RUTA_PRODUCTOS}>{t('acciones.cancelarImportacion')}</Link>
            </Button>
          </>
        }
        movil={{ accion: <RowActionsMenu orientacion="horizontal" tamano="md" acciones={masAcciones} titulo={t('titulo')} />, ocultarBarra: true }}
      />

      <Stepper
        etiqueta={t('pasos.etiqueta')}
        pasos={a.pasos.map((p) => ({ valor: p, etiqueta: t(`pasos.${p}`) }))}
        actual={a.paso}
        onPasoClick={corriendo || a.paso === 'resultado' ? undefined : (p) => a.setPaso(p)}
        resumenMovil={(n, total, paso) => t('pasos.resumenMovil', { n, total, paso })}
        extra={t('extra', { origen: t(`origenes.${a.origen}`), sucursal: sucursal ?? '—' })}
      />

      <section className="min-w-0" aria-live="polite">
        {a.paso === 'origen' && <PasoOrigen a={a} orgId={orgId} onError={error} onInfo={info} />}
        {a.paso === 'mapeo' && <PasoMapeo a={a} />}
        {a.paso === 'seleccion' && <PasoSeleccionWeb a={a} orgId={orgId} onError={error} onInfo={info} />}
        {a.paso === 'validacion' && <PasoValidacion a={a} sucursales={branches.flatMap((b) => (b.id ? [{ id: b.id, name: b.name }] : []))} />}
        {a.paso === 'vista' && <PasoVistaPrevia a={a} moneda={moneda} />}
        {a.paso === 'resultado' && <PasoResultado a={a} />}
      </section>

      {/* Barra de acciones: fija abajo en móvil, al pie en escritorio. */}
      <div className="fixed inset-x-0 bottom-0 z-30 flex flex-col-reverse gap-2 border-t border-line bg-surface/95 px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur lg:static lg:flex-row lg:items-center lg:justify-between lg:border-0 lg:bg-transparent lg:p-0 lg:backdrop-blur-none">
        <p className="hidden text-xs text-fg-secondary lg:block">
          {a.paso === 'vista' ? t('vista.pie', { importar: a.resumen.aImportar, excluidas: a.resumen.total - a.resumen.aImportar }) : ''}
        </p>
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          {a.paso === 'resultado' ? (
            corriendo ? (
              <Button variant="outline" onClick={a.detener}>
                <Square className="size-4" aria-hidden="true" /> {t('resultado.detener')}
              </Button>
            ) : (
              <>
                <Button variant="outline" onClick={a.reiniciar}>
                  <RotateCcw className="size-4" aria-hidden="true" /> {t('acciones.importarOtro')}
                </Button>
                <Button onClick={() => router.push(RUTA_PRODUCTOS)}>
                  <Package className="size-4" aria-hidden="true" /> {t('acciones.verProductos')}
                </Button>
              </>
            )
          ) : (
            <>
              {anterior && (
                <Button variant="outline" onClick={() => a.setPaso(anterior)}>
                  <ArrowLeft className="size-4" aria-hidden="true" /> {t('acciones.volver')}
                </Button>
              )}
              {principal && (
                <Button onClick={principal.onClick} disabled={principal.deshabilitado}>
                  <principal.icono className="size-4" aria-hidden="true" /> {principal.etiqueta}
                </Button>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
