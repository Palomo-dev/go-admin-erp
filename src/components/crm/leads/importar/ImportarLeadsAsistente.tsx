'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeft, ArrowRight, FileSpreadsheet, Play, RotateCcw, Square, Upload, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from '@/components/ui/use-toast';
import { PageHeader, RowActionsMenu, Stepper, type AccionFila } from '@/components/kit';
import { useOrganization } from '@/lib/hooks/useOrganization';
import { descargarTexto } from '@/components/inventario/productos/importar/exportarCatalogoCsv';
import { CAMPOS_PLANTILLA, plantillaLeadsCsv } from '@/lib/crm/importacionLeads/plantilla';
import { MAX_FILAS_POR_ARCHIVO } from '@/lib/crm/importacionLeads/validacion';
import { useImportarLeads, type PasoLeads } from './useImportarLeads';
import { useTextosLeads } from './useTextosLeads';
import { PasoOrigenLeads } from './PasoOrigenLeads';
import { PasoMapeoLeads } from './PasoMapeoLeads';
import { PasoValidacionLeads } from './PasoValidacionLeads';
import { PasoVistaPreviaLeads } from './PasoVistaPreviaLeads';
import { PasoResultadoLeads } from './PasoResultadoLeads';

const RUTA_LEADS = '/app/crm/leads';

/**
 * Asistente «Importar leads» (CRM › Leads › Importar):
 * Archivo → Columnas → Validación → Vista previa → Resultado.
 * Mismos pasos y piezas del kit que el importador de productos. La validación
 * y el alta corren en el servidor (`POST /api/crm/leads/importar`).
 */
export function ImportarLeadsAsistente() {
  const { t } = useTextosLeads();
  const router = useRouter();
  const { organization } = useOrganization();
  const orgId = organization?.id;
  const a = useImportarLeads(orgId);

  // Al entrar en Validación sin resultado, se valida contra los clientes de la organización.
  useEffect(() => {
    if (a.paso === 'validacion' && !a.validacion && !a.validando && !a.errorValidacion && a.opciones.lote.trim()) void a.validar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [a.paso, a.validacion, a.validando, a.errorValidacion]);

  const error = (m: string) => toast({ variant: 'destructive', title: t('toast.error'), description: m });

  const descargarPlantilla = () => {
    const cabeceras = Object.fromEntries(CAMPOS_PLANTILLA.map((c) => [c, t(`cabeceras.${c}`)]));
    descargarTexto(plantillaLeadsCsv(cabeceras), `${t('plantillaArchivo')}.csv`);
    toast({ title: t('toast.plantilla') });
  };

  const corriendo = a.ejecucion?.estado === 'corriendo';
  const indice = a.pasos.indexOf(a.paso);
  const anterior = indice > 0 && a.paso !== 'resultado' ? a.pasos[indice - 1] : null;
  const irA = (p: PasoLeads) => a.setPaso(p);

  let principal: { etiqueta: string; onClick: () => void; deshabilitado?: boolean; icono: typeof ArrowRight } | null = null;
  if (a.paso === 'origen') {
    principal = { etiqueta: t('acciones.continuar'), icono: ArrowRight, deshabilitado: !a.archivo || a.filas.length === 0 || a.filas.length > MAX_FILAS_POR_ARCHIVO, onClick: () => irA('mapeo') };
  } else if (a.paso === 'mapeo') {
    principal = { etiqueta: t('acciones.continuar'), icono: ArrowRight, deshabilitado: a.faltantes.length > 0 || a.filas.length === 0, onClick: () => irA('validacion') };
  } else if (a.paso === 'validacion') {
    principal = { etiqueta: t('acciones.revisar'), icono: ArrowRight, deshabilitado: !a.validacion || a.validando, onClick: () => irA('vista') };
  } else if (a.paso === 'vista') {
    principal = { etiqueta: t('acciones.importar', { n: a.aImportar.length }), icono: Play, deshabilitado: a.aImportar.length === 0, onClick: () => void a.importar() };
  }

  const masAcciones: AccionFila[] = [{ id: 'plantilla', etiqueta: t('acciones.plantilla'), icono: FileSpreadsheet, onSelect: descargarPlantilla }];

  return (
    <div className="flex flex-col gap-4 pb-24 lg:pb-0">
      <PageHeader
        variante="form"
        volverA={RUTA_LEADS}
        titulo={t('titulo')}
        subtitulo={a.archivo ? t('subtituloArchivo', { nombre: a.archivo.nombre, hoja: a.archivo.hoja }) : t('subtitulo')}
        icono={Upload}
        migas={[
          { etiqueta: t('migas.crm'), href: '/app/crm' },
          { etiqueta: t('migas.leads'), href: RUTA_LEADS },
          { etiqueta: t('migas.importar') },
        ]}
        acciones={
          <>
            <Button variant="outline" onClick={descargarPlantilla}>
              <FileSpreadsheet className="size-4" aria-hidden="true" /> {t('acciones.plantilla')}
            </Button>
            <Button variant="ghost" asChild disabled={corriendo}>
              <Link href={RUTA_LEADS}>{t('acciones.cancelar')}</Link>
            </Button>
          </>
        }
        movil={{ accion: <RowActionsMenu orientacion="horizontal" tamano="md" acciones={masAcciones} titulo={t('titulo')} /> }}
      />

      <Stepper
        etiqueta={t('pasos.etiqueta')}
        pasos={a.pasos.map((p) => ({ valor: p, etiqueta: t(`pasos.${p}`) }))}
        actual={a.paso}
        onPasoClick={corriendo || a.paso === 'resultado' || !a.archivo ? undefined : (p) => p !== 'resultado' && a.setPaso(p)}
        resumenMovil={(n, total, paso) => t('pasos.resumenMovil', { n, total, paso })}
        extra={a.opciones.lote ? t('extra', { lote: a.opciones.lote }) : undefined}
      />

      <section className="min-w-0" aria-live="polite">
        {a.paso === 'origen' && <PasoOrigenLeads a={a} onError={error} />}
        {a.paso === 'mapeo' && <PasoMapeoLeads a={a} />}
        {a.paso === 'validacion' && <PasoValidacionLeads a={a} />}
        {a.paso === 'vista' && <PasoVistaPreviaLeads a={a} />}
        {a.paso === 'resultado' && <PasoResultadoLeads a={a} />}
      </section>

      <div className="fixed inset-x-0 bottom-0 z-30 flex flex-col-reverse gap-2 border-t border-line bg-surface/95 px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur lg:static lg:flex-row lg:items-center lg:justify-between lg:border-0 lg:bg-transparent lg:p-0 lg:backdrop-blur-none">
        <p className="hidden text-xs text-fg-secondary lg:block">
          {a.paso === 'vista' && a.validacion ? t('vista.pie', { importar: a.aImportar.length, resto: a.validacion.resultados.length - a.aImportar.length }) : ''}
        </p>
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          {a.paso === 'resultado' ? (
            corriendo ? (
              <Button variant="outline" onClick={a.detener}>
                <Square className="size-4" aria-hidden="true" /> {t('acciones.detener')}
              </Button>
            ) : (
              <>
                <Button variant="outline" onClick={a.reiniciar}>
                  <RotateCcw className="size-4" aria-hidden="true" /> {t('acciones.importarOtro')}
                </Button>
                <Button onClick={() => router.push(RUTA_LEADS)}>
                  <Users className="size-4" aria-hidden="true" /> {t('acciones.verLeads')}
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
