'use client';

/**
 * Revisar una novedad (Figma 20.12.3; móvil: hoja). Datos con `FilaDato`; el
 * recargo se muestra en %, nunca en pesos (sin salario para el jefe). Pie:
 * «Rechazar» en rojo y «Aprobar». Rechazar pide motivo: es lo que la persona
 * recibe (20.12.4).
 */
import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { NotebookPen } from 'lucide-react';
import { AvisoTonal, FilaDato, FormField, ListaDatos, PanelAdaptable, clasesBoton } from '@/components/kit';
import { Input } from '@/components/ui/input';
import { useDias, useHora } from '../asistencia/comunAsistencia';
import { alertaTope, origenNovedad, textoDuracion, textoPct, type FilaNovedad } from '../asistencia/asistenciaLogica';
import { useTextosNovedad } from './textosNovedad';

export function DialogoRevisarNovedad({
  novedad,
  zona,
  onCerrar,
  onAprobar,
  onRechazar,
  ocupado,
}: {
  novedad: FilaNovedad | null;
  zona: string;
  onCerrar: () => void;
  onAprobar: (n: FilaNovedad, comentario: string) => void;
  onRechazar: (n: FilaNovedad, comentario: string) => void;
  ocupado: boolean;
}) {
  const t = useTranslations('hrmAsistencia');
  const dias = useDias();
  const hora = useHora(zona);
  const tx = useTextosNovedad(zona);
  const [comentario, setComentario] = useState('');
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    setComentario('');
    setError(null);
  }, [novedad?.id]);

  if (!novedad) return null;
  const tope = alertaTope(novedad);
  const decidible = novedad.puede_decidir;
  const rechazar = () => {
    if (comentario.trim().length < 3) {
      setError(t('novedades.revisar.errorMotivo'));
      return;
    }
    onRechazar(novedad, comentario.trim());
  };

  return (
    <PanelAdaptable
      abierto
      onAbiertoChange={(a) => !a && onCerrar()}
      ocupado={ocupado}
      ancho={560}
      icono={NotebookPen}
      titulo={`${t(`novedades.tipos.${novedad.tipo}`)} · ${novedad.nombre}`}
      descripcion={`${dias.largo(novedad.fecha)} · ${t(`novedades.revisar.nacio.${origenNovedad(novedad)}`)}`}
      pie={
        decidible ? (
          <div className="flex w-full flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <button type="button" className={clasesBoton({ variante: 'destructivo' })} onClick={rechazar} disabled={ocupado}>
              {t('acciones.rechazar')}
            </button>
            <button
              type="button"
              className={clasesBoton({ variante: 'primario' })}
              onClick={() => onAprobar(novedad, comentario.trim())}
              disabled={ocupado}
            >
              {t('acciones.aprobar')}
            </button>
          </div>
        ) : (
          <div className="flex w-full justify-end">
            <button type="button" className={clasesBoton({ variante: 'secundario' })} onClick={onCerrar}>
              {t('comun.cerrar')}
            </button>
          </div>
        )
      }
    >
      <div className="flex flex-col gap-4">
        {tope && (
          <AvisoTonal
            tono="advertencia"
            titulo={t(`novedades.revisar.tope.${tope.codigo}`, {
              tope: textoDuracion(tope.tope_minutos ?? 0),
            })}
            descripcion={t('novedades.revisar.topeDetalle')}
          />
        )}
        {novedad.sin_aprobador && (
          <AvisoTonal tono="advertencia" titulo={t('novedades.sinAprobador')} descripcion={t('novedades.sinAprobadorDetalle')} />
        )}
        {!decidible && !novedad.sin_aprobador && novedad.estado === 'pendiente' && (
          <AvisoTonal tono="informacion" titulo={t('novedades.revisar.noTeToca')} />
        )}
        <ListaDatos>
          {novedad.minutos !== null && novedad.minutos > 0 && (
            <FilaDato etiqueta={t('novedades.revisar.horas')} valor={textoDuracion(novedad.minutos)} tono="fuerte" />
          )}
          {novedad.extra && (
            <FilaDato
              etiqueta={t('novedades.revisar.tipo')}
              valor={`${t(`categorias.${novedad.extra.categoria}`)} · ${textoPct(novedad.extra.recargo)}`}
            />
          )}
          {novedad.tipo === 'ajuste_marca' && (
            <FilaDato etiqueta={t('novedades.revisar.marca')} valor={`${t(`marcas.${novedad.evento ?? 'check_in'}`)} ${hora(novedad.hora)}`} />
          )}
          {novedad.cambio && <FilaDato etiqueta={t('novedades.revisar.cambio')} valor={tx.detalle(novedad)} />}
          {novedad.turno && (
            <FilaDato
              etiqueta={t('novedades.revisar.turno')}
              valor={`${novedad.turno.nombre ? `${novedad.turno.nombre} ` : ''}${hora(novedad.turno.inicio)} – ${hora(novedad.turno.fin)}`}
            />
          )}
          <FilaDato etiqueta={t('novedades.revisar.motivo')} valor={novedad.justificacion ?? t('novedades.sinMotivo')} />
          <FilaDato etiqueta={t('novedades.revisar.pidio')} valor={novedad.solicito ?? '—'} />
        </ListaDatos>
        {decidible && (
          <FormField etiqueta={t('novedades.revisar.comentario')} error={error ?? undefined} ayuda={t('novedades.revisar.comentarioAyuda')}>
            <Input value={comentario} onChange={(e) => setComentario(e.target.value)} maxLength={2000} className="h-10 border-line-strong" />
          </FormField>
        )}
      </div>
    </PanelAdaptable>
  );
}
