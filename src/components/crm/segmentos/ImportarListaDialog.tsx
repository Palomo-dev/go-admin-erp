'use client';

/**
 * «Importar lista» del listado de Segmentos (Figma CRM 1384:17): crea un
 * segmento ESTÁTICO con los clientes de una lista de correos, teléfonos o
 * documentos (pegada o desde un .csv/.txt). El cruce y el guardado los hace el
 * servidor (`POST /api/crm/segments/import`).
 */

import { useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Download, Upload } from 'lucide-react';
import { toast } from '@/components/ui/use-toast';
import { Dialogo, FormField, clasesBoton } from '@/components/kit';
import { useFormatoEntero } from '@/components/kit/useIdiomaKit';
import { CLASE_AREA, CLASE_CAMPO } from '@/components/crm/kit/camposCrm';
import { ErrorApiCrm } from '@/components/crm/acciones/apiCrm';
import { useFormatDate } from '@/lib/context/OrganizationTimezoneContext';
import { MAX_VALORES_IMPORTACION, valoresDeLista } from '@/lib/services/crm/segmentosImportacionLogica';
import { SegmentosService } from './SegmentosService';

interface Props {
  abierto: boolean;
  onAbiertoChange: (abierto: boolean) => void;
  onImportado: (segmentoId: string) => void;
}

const TOPE_ARCHIVO = 2 * 1024 * 1024;

export function ImportarListaDialog({ abierto, onAbiertoChange, onImportado }: Props) {
  const t = useTranslations('crm.segmentos.importar');
  const entero = useFormatoEntero();
  const { formatDate } = useFormatDate();
  const archivo = useRef<HTMLInputElement>(null);
  const [nombre, setNombre] = useState('');
  const [texto, setTexto] = useState('');
  const [deArchivo, setDeArchivo] = useState(false);
  const [intentado, setIntentado] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const valores = valoresDeLista(texto);
  const errorNombre = intentado && !nombre.trim() ? t('nombreObligatorio') : null;
  const errorLista = intentado && valores.length === 0 ? t('listaObligatoria') : null;

  const cerrar = (a: boolean) => {
    if (guardando) return;
    onAbiertoChange(a);
    if (!a) {
      setNombre('');
      setTexto('');
      setDeArchivo(false);
      setIntentado(false);
      setError(null);
    }
  };

  const leerArchivo = async (f: File | undefined) => {
    if (!f) return;
    if (f.size > TOPE_ARCHIVO) {
      setError(t('errores.archivoGrande'));
      return;
    }
    setError(null);
    setTexto(await f.text());
    setDeArchivo(true);
    if (!nombre.trim()) setNombre(f.name.replace(/\.[^.]+$/, ''));
  };

  const importar = async () => {
    setIntentado(true);
    if (!nombre.trim() || valores.length === 0 || guardando) return;
    setGuardando(true);
    setError(null);
    try {
      const fecha = formatDate(new Date().toISOString());
      const r = await SegmentosService.importarLista({
        nombre: nombre.trim(),
        descripcion: deArchivo ? t('descripcionArchivo', { fecha }) : t('descripcionPegada', { fecha }),
        valores,
      });
      toast({
        title: t('ok.titulo', { n: r.encontrados, valor: entero(r.encontrados) }),
        description: r.no_encontrados > 0 ? t('ok.sinCoincidencia', { n: r.no_encontrados, valor: entero(r.no_encontrados) }) : undefined,
      });
      setGuardando(false);
      cerrar(false);
      onImportado(r.segmento_id);
    } catch (e) {
      const code = e instanceof ErrorApiCrm ? e.codigo ?? String(e.cuerpo?.code ?? '') : '';
      setError(
        code === 'sin_coincidencias' ? t('errores.sinCoincidencias') : e instanceof ErrorApiCrm && e.status === 403 ? t('errores.sinPermiso') : t('errores.generico'),
      );
      setGuardando(false);
    }
  };

  return (
    <Dialogo
      abierto={abierto}
      onAbiertoChange={cerrar}
      titulo={t('titulo')}
      descripcion={t('descripcion')}
      icono={Download}
      ancho={560}
      primario={{ etiqueta: guardando ? t('importando') : t('importar'), onClick: () => void importar(), cargando: guardando }}
      textoCancelar={t('cancelar')}
    >
      <div className="space-y-4">
        <FormField etiqueta={t('nombre')} obligatorio error={errorNombre}>
          <input className={CLASE_CAMPO} value={nombre} maxLength={120} onChange={(e) => setNombre(e.target.value)} placeholder={t('nombrePlaceholder')} />
        </FormField>
        <FormField
          etiqueta={t('lista')}
          obligatorio
          error={errorLista}
          ayuda={t('ayuda', { n: valores.length, valor: entero(valores.length), max: entero(MAX_VALORES_IMPORTACION) })}
          extra={
            <button type="button" className={clasesBoton({ variante: 'fantasma', tamano: 'sm' })} onClick={() => archivo.current?.click()}>
              <Upload aria-hidden="true" className="size-4" strokeWidth={1.5} />
              {t('subirArchivo')}
            </button>
          }
        >
          <textarea
            className={CLASE_AREA}
            rows={8}
            value={texto}
            onChange={(e) => {
              setTexto(e.target.value);
              setDeArchivo(false);
            }}
            placeholder={t('listaPlaceholder')}
          />
        </FormField>
        <input
          ref={archivo}
          type="file"
          accept=".csv,.txt,text/csv,text/plain"
          className="hidden"
          aria-label={t('subirArchivo')}
          onChange={(e) => {
            void leerArchivo(e.target.files?.[0]);
            e.target.value = '';
          }}
        />
        {error && (
          <p role="alert" className="text-[13px] text-danger-text">
            {error}
          </p>
        )}
      </div>
    </Dialogo>
  );
}
