'use client';

/**
 * «Vista previa · usar plantilla» (Figma A/06c): a la izquierda, la plantilla
 * con tu nombre y tu menú en un marco de 1440 / 1024 / 390 (el selector de
 * ancho va en la cabecera, junto a la «×»; la barra del marco dice «Vista
 * previa con tu contenido», no una dirección); a la derecha, su
 * descripción, lo que incluye y su estilo; debajo, CÓMO aplicarla y su aviso.
 * En móvil es una hoja a pantalla completa (`PanelAdaptable`). Usarla exige
 * `website.sites.edit`.
 *
 * Dos opciones (pedido del dueño, 2026-10-06; el Figma aprobado A/06c tenía una
 * sola acción y aún no hay diseño de esta elección: se hizo con el lenguaje de
 * los diálogos de Sitio web —`TarjetaSeleccionable` horizontal en un
 * `radiogroup`, como «Descartar o conservar» y «Publicar»— y poco color):
 * - «Plantilla completa»: encabezado, pie, páginas, secciones y menús nuevos con
 *   los datos del negocio; lo anterior queda en el historial y se puede deshacer.
 * - «Solo estilo»: colores y fuentes; el contenido se conserva.
 * La opción por defecto la decide quien abre el diálogo (`modoPorDefecto`).
 *
 * Encabezado y pie (Figma «16 Sitio web» › «Plantillas · encabezado y pie en la galería, la
 * vista previa y «Usar»», tarjeta 2): la vista previa pinta los de LA PLANTILLA en grande; a la
 * derecha, lo que traen y que solo se aplican con «Plantilla completa»; y cada opción enseña cómo
 * quedarían: los de la plantilla, o los tuyos de hoy con los colores nuevos («Solo estilo»).
 */
import { useMemo, useState } from 'react';
import { CircleCheck, LayoutTemplate, Loader2, Palette } from 'lucide-react';
import { AvisoTonal, PanelAdaptable, TarjetaSeleccionable, clasesBoton, useEsEscritorio } from '@/components/kit';
import { Badge } from '@/components/ui/badge';
import type { DocumentoSitio } from '@/lib/website/contrato/documentoSitio';
import type { PlantillaCatalogo } from '@/lib/website/contrato/catalogoPlantillas';
import type { ModoPlantilla } from '@/lib/website/v2/plantillaCompleta';
import { valorCampo } from '@/lib/website/v2/valorCampo';
import { PAGINAS_BASE_GIRO } from '../paginas/plantillasPagina';
import { ESCALA_COMPARACION, EsquemaShell } from './EsquemaShell';
import { useShellDePlantilla } from './MiniaturaPlantilla';
import { shellDelDocumentoParaVer, textosRasgos, type ShellParaVer } from './textosShell';
import { DevicePreviewFrame } from '../ui/DevicePreviewFrame';
import { StylePresetCard } from '../ui/StylePresetCard';
import type { DispositivoVista } from '../ui/dispositivos';
import { SelectorAnchoVista } from '../ui/SelectorAnchoVista';
import { CLASE_TAMANO_ICONO, ICONO_GIRO_PLANTILLA, TRAZO_ICONO } from '../ui/iconosSitio';
import { muestraDeEstilo, nombreFuentes, nombreSeccion, nombreVariante } from './catalogo';
import { VistaEsquematicaPlantilla, enlacesDelDocumento } from './VistaEsquematicaPlantilla';
import { useFuentesSitio } from './useFuentesSitio';
import { useTextosDiseno } from './textos';

export interface DialogoVistaPreviaPlantillaProps {
  plantilla: PlantillaCatalogo | null;
  onCerrar: () => void;
  documento: DocumentoSitio | null;
  puedeUsar: boolean;
  usando: boolean;
  modo: ModoPlantilla;
  onModoChange: (modo: ModoPlantilla) => void;
  onUsar: (plantilla: PlantillaCatalogo, modo: ModoPlantilla) => void;
}

/** «Carta destacada · Pestañas» (o solo el nombre si la variante no tiene etiqueta). */
export function nombreSeccionPlantilla(tipo: string, variante: string, respaldo: string): string {
  const nombre = nombreSeccion(tipo) ?? respaldo;
  const v = nombreVariante(tipo, variante);
  return v ? `${nombre} · ${v.toLowerCase()}` : nombre;
}

/** Lista de rasgos de una zona («Encabezado», «Pie de página», «En el celular»). */
function ListaRasgos({ titulo, items }: { titulo: string; items: readonly string[] }) {
  return (
    <div className="flex flex-col gap-1">
      <h4 className="text-xs font-medium leading-4 text-fg-secondary">{titulo}</h4>
      <ul className="flex list-disc flex-col gap-0.5 pl-4 text-xs leading-4 text-fg">
        {items.map((s) => (
          <li key={s}>{s.charAt(0).toLocaleUpperCase() + s.slice(1)}</li>
        ))}
      </ul>
    </div>
  );
}

/** Descripción de una opción de «Cómo aplicarla» con el encabezado y el pie que quedarían. */
function DescripcionConResultado({ texto, rotulo, shell, marca }: { texto: string; rotulo: string; shell: ShellParaVer | null; marca: string }) {
  return (
    <span className="flex flex-col gap-2">
      <span>{texto}</span>
      {shell && (
        <span className="flex flex-col gap-1.5" data-resultado-shell>
          <span className="text-xs font-medium leading-4 text-fg-secondary">{rotulo}</span>
          {/* El rótulo dice qué es; el dibujo no se lee dentro del radio (nombre accesible corto). */}
          <span aria-hidden="true" className="block overflow-hidden rounded-md border border-line">
            <EsquemaShell dibujo={shell.dibujo} enlaces={shell.enlaces} menusPie={shell.menusPie} escala={ESCALA_COMPARACION} altoContenido={22} marca={marca} />
          </span>
        </span>
      )}
    </span>
  );
}

export function DialogoVistaPreviaPlantilla({
  plantilla,
  onCerrar,
  documento,
  puedeUsar,
  usando,
  modo,
  onModoChange,
  onUsar,
}: DialogoVistaPreviaPlantillaProps) {
  const [dispositivo, setDispositivo] = useState<DispositivoVista>('escritorio');
  useFuentesSitio(plantilla ? [plantilla.estilo.fuenteTitulos, plantilla.estilo.fuenteCuerpo] : []);
  if (!plantilla) return null;
  return (
    <DialogoAbierto
      plantilla={plantilla}
      onCerrar={onCerrar}
      documento={documento}
      puedeUsar={puedeUsar}
      usando={usando}
      modo={modo}
      onModoChange={onModoChange}
      onUsar={onUsar}
      dispositivo={dispositivo}
      setDispositivo={setDispositivo}
    />
  );
}

/** El diálogo con una plantilla elegida (los hooks del encabezado y el pie necesitan una). */
function DialogoAbierto({
  plantilla,
  onCerrar,
  documento,
  puedeUsar,
  usando,
  modo,
  onModoChange,
  onUsar,
  dispositivo,
  setDispositivo,
}: DialogoVistaPreviaPlantillaProps & {
  plantilla: PlantillaCatalogo;
  dispositivo: DispositivoVista;
  setDispositivo: (d: DispositivoVista) => void;
}) {
  const t = useTextosDiseno();
  const esEscritorio = useEsEscritorio();
  const shell = useShellDePlantilla(plantilla);
  const rasgos = useMemo(() => textosRasgos(t, shell.dibujo), [t, shell]);
  const tuyo = useMemo(
    () => (documento ? shellDelDocumentoParaVer(t, documento, plantilla.estilo, plantilla.giro, enlacesDelDocumento(documento).map((e) => e.etiqueta)) : null),
    [t, documento, plantilla],
  );
  const marca = valorCampo(documento?.identidad.nombre) || t('dialogo.tuMarca');
  const celular = dispositivo === 'celular';
  const IconoGiro = ICONO_GIRO_PLANTILLA[plantilla.giro];
  const completa = modo === 'completa';
  const paginas = PAGINAS_BASE_GIRO[plantilla.giro].map((p) => p.titulo).join(' · ');

  return (
    <PanelAdaptable
      abierto
      onAbiertoChange={(v) => !v && onCerrar()}
      titulo={plantilla.nombre}
      ancho={1120}
      ocupado={usando}
      // A/06c: el selector de ancho va en la cabecera, a la derecha junto a la «×».
      // En móvil, solo iconos (con nombre accesible «1440 px»): el texto no cabe a 390 junto al título.
      accionesCabecera={
        <SelectorAnchoVista
          etiqueta={t('vista.anchos')}
          valor={dispositivo}
          onValorChange={setDispositivo}
          variante={esEscritorio ? 'texto' : 'icono'}
        />
      }
      descripcion={
        <span className="flex flex-wrap items-center gap-2">
          <Badge tono="neutro" apariencia="suave" tamano="sm">
            <IconoGiro aria-hidden="true" className="size-3 shrink-0" strokeWidth={2} />
            {t(`plantillas.giro.${plantilla.giro}`)}
          </Badge>
          {plantilla.subgiro && (
            <Badge tono="neutro" apariencia="suave" tamano="sm">
              {plantilla.subgiro}
            </Badge>
          )}
        </span>
      }
      pie={
        <div className="flex w-full flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button type="button" onClick={onCerrar} disabled={usando} className={clasesBoton({ variante: 'secundario', tamano: 'md' })}>
            {t('acciones.cancelar')}
          </button>
          <button
            type="button"
            onClick={() => onUsar(plantilla, modo)}
            disabled={!puedeUsar || usando}
            title={puedeUsar ? undefined : t('dialogo.sinPermiso')}
            aria-busy={usando || undefined}
            className={clasesBoton({ variante: 'primario', tamano: 'md' })}
          >
            {usando && <Loader2 aria-hidden="true" className={`${CLASE_TAMANO_ICONO.base} animate-spin motion-reduce:animate-none`} strokeWidth={TRAZO_ICONO} />}
            {completa ? t('dialogo.usarCompleta') : t('dialogo.usarEstilo')}
          </button>
        </div>
      }
    >
      <div className="flex flex-col gap-4">
        <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-[minmax(0,1fr)_260px] lg:gap-6">
          <div className="flex min-w-0 flex-col gap-2">
            <DevicePreviewFrame dispositivo={dispositivo} etiquetaBarra={t('dialogo.vistaPrevia')}>
              <div className={celular ? 'max-h-[520px] overflow-y-auto' : 'max-h-[560px] overflow-y-auto'}>
                <VistaEsquematicaPlantilla plantilla={plantilla} documento={documento} celular={celular} />
              </div>
            </DevicePreviewFrame>
            <p className="text-xs leading-4 text-fg-secondary">{t('dialogo.esquema')}</p>
          </div>
          <div className="flex flex-col gap-4">
            <p className="text-[13px] leading-[18px] text-fg-secondary">{t('dialogo.descripcion', { descripcion: plantilla.descripcion })}</p>
            <div className="flex flex-col gap-2">
              <h3 className="text-[13px] font-semibold leading-[18px] text-fg">{t('dialogo.incluye')}</h3>
              <ul className="flex flex-col gap-1.5">
                {plantilla.inicio.map(([tipo, variante], i) => (
                  <li key={`${tipo}-${i}`} className="flex items-start gap-2 text-[13px] leading-[18px] text-fg">
                    <CircleCheck aria-hidden="true" className={`mt-px ${CLASE_TAMANO_ICONO.base} shrink-0 text-success-text`} strokeWidth={TRAZO_ICONO} />
                    {nombreSeccionPlantilla(tipo, variante, t('dialogo.seccionDesconocida'))}
                  </li>
                ))}
              </ul>
              {completa && <p className="text-xs leading-4 text-fg-secondary">{t('dialogo.paginas', { lista: paginas })}</p>}
            </div>
            <div className="flex flex-col gap-2" data-rasgos-shell>
              <h3 className="text-[13px] font-semibold leading-[18px] text-fg">{t('dialogo.encabezadoPie')}</h3>
              <ListaRasgos titulo={t('shell.titulos.encabezado')} items={rasgos.encabezado} />
              <ListaRasgos titulo={t('shell.titulos.pie')} items={rasgos.pie} />
              {rasgos.celular && <ListaRasgos titulo={t('shell.titulos.celular')} items={[rasgos.celular]} />}
              <p className="rounded-md bg-info-subtle px-2.5 py-1.5 text-xs leading-4 text-info-text">{t('dialogo.soloCompleta')}</p>
            </div>
            <div className="flex flex-col gap-2">
              <h3 className="text-[13px] font-semibold leading-[18px] text-fg">{t('dialogo.estilo')}</h3>
              <StylePresetCard
                nombre={plantilla.estilo.nombre}
                fuentes={nombreFuentes(plantilla.estilo)}
                muestra={muestraDeEstilo(plantilla.estilo)}
                seleccionado
                onSeleccionar={() => undefined}
                textoMuestra={t(`muestra.${plantilla.giro}.texto`)}
                textoBoton={t(`muestra.${plantilla.giro}.boton`)}
              />
            </div>
          </div>
        </div>
        <div className="flex flex-col gap-2">
          <h3 id="plantilla-modo" className="text-[13px] font-semibold leading-[18px] text-fg">
            {t('dialogo.modo')}
          </h3>
          <p className="text-xs leading-4 text-fg-secondary">{t('dialogo.quedan')}</p>
          <div role="radiogroup" aria-labelledby="plantilla-modo" className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <TarjetaSeleccionable
              orientacion="horizontal"
              icono={LayoutTemplate}
              titulo={t('dialogo.completaTitulo')}
              descripcion={<DescripcionConResultado texto={t('dialogo.completaDescripcion')} rotulo={t('dialogo.quedanCompleta', { nombre: plantilla.nombre })} shell={shell} marca={marca} />}
              seleccionada={completa}
              onSeleccionar={() => onModoChange('completa')}
              deshabilitada={usando}
            />
            <TarjetaSeleccionable
              orientacion="horizontal"
              icono={Palette}
              titulo={t('dialogo.estiloTitulo')}
              descripcion={<DescripcionConResultado texto={t('dialogo.estiloDescripcion')} rotulo={t('dialogo.quedanEstilo')} shell={tuyo} marca={marca} />}
              seleccionada={!completa}
              onSeleccionar={() => onModoChange('estilo')}
              deshabilitada={usando}
            />
          </div>
        </div>
        <AvisoTonal
          tono={completa ? 'advertencia' : 'informacion'}
          titulo={completa ? t('dialogo.avisoCompletaTitulo') : t('dialogo.avisoEstiloTitulo')}
          descripcion={completa ? t('dialogo.avisoCompletaDescripcion') : t('dialogo.avisoEstiloDescripcion')}
        />
      </div>
    </PanelAdaptable>
  );
}
