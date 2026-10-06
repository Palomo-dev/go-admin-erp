'use client';

/**
 * /app/sitio-web/plantillas — «Plantillas» (Figma A/06b galería, A/06c diálogo,
 * A/06d cargando, A/06e error). Galería por giro con contador (la pestaña
 * inicial es el giro de la organización), TemplateCard con «En uso» y el diálogo
 * de vista previa con sus dos modos: «Plantilla completa» (el sitio entero con
 * los datos del negocio; lo anterior queda en el historial, con «Deshacer») y
 * «Solo estilo» (colores y fuentes, conserva el contenido). Sin permiso de
 * edición, la galería se ve y el botón queda deshabilitado con su motivo.
 */
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { EmptyState, Skeleton, TabBar, idPanel, idPestana, useOpcionUrl } from '@/components/kit';
import { MarcoSitioWeb } from '../MarcoSitioWeb';
import { RAIZ_SITIO_WEB } from '../rutasSitioWeb';
import { TemplateCard } from '../ui/TemplateCard';
import { DialogoConflicto } from '../paginas/DialogoConflicto';
import type { PlantillaCatalogo } from '@/lib/website/contrato/catalogoPlantillas';
import { modoPorDefecto, type ModoPlantilla } from '@/lib/website/v2/plantillaCompleta';
import { MiniaturaPlantilla } from './MiniaturaPlantilla';
import { DialogoVistaPreviaPlantilla } from './DialogoVistaPreviaPlantilla';
import { useContextoDiseno } from './useContextoDiseno';
import { pestanasGiro, usePlantillas, type PestanaGiro } from './usePlantillas';
import { useFuentesSitio } from './useFuentesSitio';
import { ICONO_GIRO_PLANTILLA, ICONO_SUBTITULO_SITIO } from '../ui/iconosSitio';
import { SubtituloConIcono } from '../ui/SubtituloConIcono';
import { useTextosDiseno } from './textos';

export const RUTA_PLANTILLAS = `${RAIZ_SITIO_WEB}/plantillas`;
const ID_PESTANAS = 'plantillas-giro';

/** A/06d: ocho tarjetas en esqueleto, en la misma grilla. */
function EsqueletoPlantillas() {
  return (
    <div className="flex flex-col gap-4 lg:gap-6" aria-busy="true">
      <Skeleton className="h-9 w-full max-w-xl rounded-lg" />
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4 lg:gap-6">
        {Array.from({ length: 8 }, (_, i) => (
          <div key={i} className="flex flex-col gap-3 rounded-xl border border-line bg-surface p-3">
            <Skeleton className="aspect-[16/10] w-full rounded-lg" />
            <Skeleton className="h-4 w-2/3" />
            <Skeleton className="h-3 w-full" />
            <Skeleton className="h-5 w-1/2 rounded-full" />
          </div>
        ))}
      </div>
    </div>
  );
}

export function GaleriaPlantillas() {
  const t = useTextosDiseno();
  const router = useRouter();
  const ctx = useContextoDiseno({ leerBorradorSinPermiso: true });
  const plantillas = usePlantillas(ctx);
  const pestanas = pestanasGiro(ctx.giro);
  const [giro, setGiro] = useOpcionUrl<PestanaGiro>('giro', pestanas, ctx.giro ?? 'todas', 'replace');
  const [abierta, setAbierta] = useState<PlantillaCatalogo | null>(null);
  const [modo, setModo] = useState<ModoPlantilla>('completa');
  const abrir = (p: PlantillaCatalogo) => {
    setModo(modoPorDefecto(ctx.sitio.sitio));
    setAbierta(p);
  };
  const lista = plantillas.delGiro(giro);
  useFuentesSitio(lista.map((p) => p.estilo.fuenteTitulos));

  const errorSitio = ctx.sitio.error && !ctx.sitio.error.esConflicto ? ctx.sitio.error.message : null;
  useEffect(() => {
    if (errorSitio && ctx.sitio.borrador) toast.error(t('dialogo.error', { mensaje: errorSitio }));
  }, [errorSitio, ctx.sitio.borrador, t]);

  const verDiseno = { label: t('dialogo.verDiseno'), onClick: () => router.push(`${RAIZ_SITIO_WEB}/diseno`) };

  const usarEstilo = async (plantilla: PlantillaCatalogo) => {
    const r = await plantillas.usar(plantilla);
    if (!r.ok) return;
    setAbierta(null);
    toast.success(t('dialogo.listo', { nombre: plantilla.nombre }), { action: verDiseno });
  };

  const usarCompleta = async (plantilla: PlantillaCatalogo) => {
    const r = await plantillas.usarCompleta(plantilla);
    if (!r.ok) {
      toast.error(r.conflicto ? t('dialogo.conflicto') : t('dialogo.error', { mensaje: r.mensaje }));
      return;
    }
    setAbierta(null);
    const ocultas = r.resumen.ocultas.length;
    toast.success(t('dialogo.listoCompleta', { nombre: plantilla.nombre }), {
      description: ocultas === 0 ? undefined : ocultas === 1 ? t('dialogo.ocultasUna') : t('dialogo.ocultas', { n: ocultas }),
      duration: 10000,
      action: {
        label: t('dialogo.deshacer'),
        onClick: () =>
          void plantillas
            .deshacer({ sitioId: r.sitioId, instantaneaId: r.instantaneaId, version: r.version })
            .then((ok) => (ok ? toast.success(t('dialogo.deshecho')) : toast.error(t('dialogo.noDeshecho')))),
      },
    });
  };

  const usar = (plantilla: PlantillaCatalogo, m: ModoPlantilla) => void (m === 'completa' ? usarCompleta(plantilla) : usarEstilo(plantilla));

  // A/06e: el error de esta página tiene su propio texto («Tu sitio no cambió…»).
  if (ctx.estado === 'error') {
    return (
      <MarcoSitioWeb href={RUTA_PLANTILLAS} subtitulo="" acciones={false}>
        <EmptyState
          variante="error"
          titulo={t('plantillas.errorTitulo')}
          descripcion={t('plantillas.errorDescripcion')}
          onReintentar={ctx.reintentar}
        />
      </MarcoSitioWeb>
    );
  }

  return (
    <MarcoSitioWeb
      href={RUTA_PLANTILLAS}
      estado={ctx.estado}
      onReintentar={ctx.reintentar}
      nombreContenido={t('plantillas.nombreContenido')}
      esqueleto={<EsqueletoPlantillas />}
      // A/06b: el subtítulo lleva su icono de 14 px, como el de Diseño lleva el del estado.
      subtitulo={<SubtituloConIcono icono={ICONO_SUBTITULO_SITIO.plantillas} texto={t('plantillas.subtitulo')} />}
      host={ctx.host}
      acciones={false}
    >
      {ctx.estado === 'listo' && (
        <div className="flex flex-col gap-4 lg:gap-6">
          <TabBar
            id={ID_PESTANAS}
            etiqueta={t('plantillas.pestanas')}
            pestanas={pestanas.map((g) => ({
              valor: g,
              etiqueta: t(`plantillas.giro.${g}`),
              contador: plantillas.contadores[g],
              icono: ICONO_GIRO_PLANTILLA[g],
            }))}
            valor={giro}
            onValorChange={setGiro}
          />
          <div role="tabpanel" id={idPanel(ID_PESTANAS, giro)} aria-labelledby={idPestana(ID_PESTANAS, giro)}>
            {lista.length === 0 ? (
              <EmptyState
                variante="empty"
                titulo={t('plantillas.vacio')}
                accion={{ etiqueta: t('plantillas.verTodas'), onClick: () => setGiro('todas') }}
              />
            ) : (
              <ul className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4 lg:gap-6">
                {lista.map((p) => (
                  <li key={p.id} className="flex">
                    <TemplateCard
                      nombre={p.nombre}
                      descripcion={p.descripcion}
                      miniatura={<MiniaturaPlantilla estilo={p.estilo} />}
                      giro={t(`plantillas.giro.${p.giro}`)}
                      iconoGiro={ICONO_GIRO_PLANTILLA[p.giro]}
                      secciones={p.inicio.length}
                      enUso={plantillas.enUso?.id === p.id}
                      onSeleccionar={() => abrir(p)}
                      // A/06b: la plantilla en uso lleva el borde de marca además de la insignia.
                      className={plantillas.enUso?.id === p.id ? 'h-full border-brand ring-1 ring-brand' : 'h-full'}
                    />
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}

      <DialogoVistaPreviaPlantilla
        plantilla={abierta}
        onCerrar={() => setAbierta(null)}
        documento={ctx.sitio.documento}
        puedeUsar={ctx.permisos.editar}
        usando={plantillas.usando !== null}
        modo={modo}
        onModoChange={setModo}
        onUsar={usar}
      />
      <DialogoConflicto abierto={ctx.sitio.conflicto} onCerrar={() => void ctx.sitio.recargar()} onRecargar={() => ctx.sitio.recargar()} />
    </MarcoSitioWeb>
  );
}
