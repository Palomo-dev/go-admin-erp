'use client';

/**
 * «Analítica» del módulo Sitio web (Figma B/09-01 escritorio, B/09-02 móvil,
 * B/09-03 estados). Une el marco del módulo (migas «Sitio web ›», título
 * «Analítica», subtítulo «Sitio web · <host>», «Actualizar» y «Exportar CSV»)
 * con la pantalla de analítica compartida (`components/analiticaWeb`): si se
 * cambia allí, cambia aquí. Los píxeles son de esta área (`usePixeles`).
 */
import { useMemo } from 'react';
import { useTranslations } from 'next-intl';
import { clasesBoton, type AccionFila } from '@/components/kit';
import { useOrganization } from '@/lib/hooks/useOrganization';
import { AnaliticaWeb, EsqueletoAnalitica } from '@/components/analiticaWeb/AnaliticaWeb';
import { useAnaliticaWeb } from '@/components/analiticaWeb/useAnaliticaWeb';
import { MarcoSitioWeb } from '../MarcoSitioWeb';
import { RUTA_ANALITICA_SITIO_WEB } from '../rutasSitioWeb';
import { useUrlSitio } from '../useUrlSitio';
import { TarjetasPixeles } from './TarjetasPixeles';
import { usePixeles } from './usePixeles';
import { useTextosSeoAnalitica } from './textos';
import { ICONO_ACCION_SEO } from './iconosSeoAnalitica';
import { CLASE_TAMANO_ICONO, TRAZO_ICONO } from '../ui/iconosSitio';

export function AnaliticaSitioWeb() {
  const t = useTextosSeoAnalitica();
  const tc = useTranslations('analiticaWeb.csv');
  const { organization } = useOrganization();
  const { host } = useUrlSitio(organization?.id);
  const a = useAnaliticaWeb();
  const conAcceso = a.estado.tipo !== 'sinPermiso';
  const pixeles = usePixeles(conAcceso);
  const puedeExportar = a.estado.tipo === 'listo' && a.estado.puedeExportar;

  const exportar = () =>
    a.exportar({
      fecha: tc('fecha'),
      visitantes: tc('visitantes'),
      pedidos: tc('pedidos'),
      visitantesAnterior: tc('visitantesAnterior'),
      pedidosAnterior: tc('pedidosAnterior'),
      pais: tc('pais'),
      sesiones: tc('sesiones'),
    });

  // Móvil: «Actualizar» y «Exportar CSV» van al «⋮» del MobileHeader (B/09-02).
  const menu = useMemo<AccionFila[]>(
    () => [
      { id: 'actualizar', etiqueta: t('analitica.acciones.actualizar'), icono: ICONO_ACCION_SEO.actualizar, onSelect: a.actualizar },
      ...(puedeExportar ? [{ id: 'exportar', etiqueta: t('analitica.acciones.exportar'), icono: ICONO_ACCION_SEO.exportar, onSelect: exportar }] : []),
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `exportar` depende de `a`
    [t, a, puedeExportar],
  );

  const acciones = conAcceso ? (
    <>
      <button type="button" onClick={a.actualizar} className={clasesBoton({ variante: 'secundario', tamano: 'md' })}>
        <ICONO_ACCION_SEO.actualizar aria-hidden="true" className={CLASE_TAMANO_ICONO.base} strokeWidth={TRAZO_ICONO} />
        {t('analitica.acciones.actualizar')}
      </button>
      {puedeExportar && (
        <button type="button" onClick={exportar} className={clasesBoton({ variante: 'primario', tamano: 'md' })}>
          <ICONO_ACCION_SEO.exportar aria-hidden="true" className={CLASE_TAMANO_ICONO.base} strokeWidth={TRAZO_ICONO} />
          {t('analitica.acciones.exportar')}
        </button>
      )}
    </>
  ) : (
    <></>
  );

  return (
    <MarcoSitioWeb
      href={RUTA_ANALITICA_SITIO_WEB}
      host={host}
      subtitulo={host ? t('analitica.subtitulo', { host }) : t('analitica.subtituloSinHost')}
      acciones={acciones}
      menu={conAcceso ? menu : undefined}
      esqueleto={<EsqueletoAnalitica />}
      nombreContenido={t('analitica.nombreContenido')}
    >
      <AnaliticaWeb a={a} host={host} pixeles={conAcceso ? <TarjetasPixeles pixeles={pixeles} /> : undefined} />
    </MarcoSitioWeb>
  );
}

