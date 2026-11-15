'use client';

/**
 * Seguridad social (Figma 95-hrm-03-06): afiliaciones vigentes por subsistema.
 * Un traslado es un evento con fecha de efecto y aprobación (decisión 6), con
 * su certificado de afiliación como soporte. La clase de riesgo ARL sale de la
 * configuración (cargo en sede › cargo › sede › por defecto).
 */
import { useTranslations } from 'next-intl';
import { FileText, History } from 'lucide-react';
import { AvisoTonal, StatusBadge, clasesBoton, type ColumnaTabla } from '@/components/kit';
import { TablaSubseccion } from '@/components/kit/TablaSubseccion';
import { categoriaAfiliacion, type Subsistema } from '@/lib/hrm/personas/catalogo';
import { useCarga, urlDocumento, type DocumentoPersona } from '../apiPersonas';
import { fechaCorta } from '../textosPersonas';
import type { ContextoFicha } from './FichaEmpleado';

type Afiliacion = ContextoFicha['ficha']['afiliaciones'][number];

export function PestanaSeguridadSocial({ ficha, registrarCambio }: ContextoFicha) {
  const t = useTranslations('hrmPersonas.seguridad');
  const tc = useTranslations('hrmPersonas.comun');
  const docs = useCarga<{ documentos: DocumentoPersona[] }>(`/api/hrm/personas/${ficha.persona.id}/documentos`);
  const lista = docs.carga.estado === 'listo' ? docs.carga.datos.documentos : [];
  const soporte = (s: string) => lista.find((d) => d.categoria === categoriaAfiliacion(s as Subsistema) && !d.restringido);

  const abrir = async (id: string) => {
    try {
      const { url } = await urlDocumento(id);
      window.open(url, '_blank', 'noopener,noreferrer');
    } catch {
      /* el registro de accesos ya dejó el intento */
    }
  };

  const columnas: ColumnaTabla<Afiliacion>[] = [
    { id: 'subsistema', encabezado: t('columnas.subsistema'), celda: (a) => <span className="font-medium text-fg">{tc(`subsistemas.${a.subsistema}`)}</span> },
    {
      id: 'entidad',
      encabezado: t('columnas.entidad'),
      celda: (a) =>
        a.entidad
          ? a.subsistema === 'arl' && ficha.vinculo?.clase_arl
            ? t('arlClase', { entidad: a.entidad, clase: ficha.vinculo.clase_arl })
            : a.entidad
          : '—',
    },
    { id: 'desde', encabezado: t('columnas.desde'), ocultarDebajo: 'md', celda: (a) => <span className="tabular-nums">{a.desde ? fechaCorta(a.desde) : '—'}</span> },
    {
      id: 'estado',
      encabezado: t('columnas.estado'),
      celda: (a) =>
        a.pendiente ? (
          <StatusBadge estado="pendiente" tono="advertencia" etiqueta={t('estados.pendiente')} />
        ) : a.entidad ? (
          <StatusBadge estado="afiliado" tono="exito" etiqueta={t('estados.afiliado')} />
        ) : (
          <StatusBadge estado="sin" tono="neutro" etiqueta={t('estados.sinRegistrar')} />
        ),
    },
    {
      id: 'soporte',
      encabezado: t('columnas.soporte'),
      ocultarDebajo: 'lg',
      celda: (a) => {
        const d = soporte(a.subsistema);
        return d ? (
          <button type="button" onClick={() => void abrir(d.id)} className="inline-flex items-center gap-1.5 text-sm text-fg hover:underline">
            <FileText aria-hidden className="size-4" strokeWidth={1.5} />
            {t('certificado')}
          </button>
        ) : (
          <span className="text-fg-muted">—</span>
        );
      },
    },
  ];

  return (
    <div className="flex flex-col gap-4">
      <TablaSubseccion
        titulo={t('titulo')}
        columnas={columnas}
        filas={ficha.afiliaciones}
        obtenerId={(a) => a.subsistema}
        densidad="compacta"
        encabezadoExtra={
          ficha.permisos.registrar_cambio && ficha.vinculo?.estado !== 'retirado' ? (
            <button type="button" onClick={() => registrarCambio('seguridad_social')} className={clasesBoton({ variante: 'secundario', tamano: 'sm' })}>
              <History aria-hidden className="size-4" strokeWidth={1.5} />
              {t('registrarCambio')}
            </button>
          ) : undefined
        }
      />
      <AvisoTonal tono="informacion" titulo={t('nota')} />
    </div>
  );
}
