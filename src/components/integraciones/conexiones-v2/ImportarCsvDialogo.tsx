'use client';

/**
 * «Importar CSV» de Conexiones (Frente INT): crea conexiones en BORRADOR, sin credenciales, por
 * `POST /api/integrations/conexiones/importar`. Las llaves se completan después con el asistente
 * de cada conexión (nunca por CSV: un archivo con secretos sería una fuga).
 */
import { useMemo, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Upload } from 'lucide-react';
import { AvisoTonal, Dialogo, FormField } from '@/components/kit';
import { apiConexiones } from '@/lib/services/integrations/conexiones/clienteConexiones';
import { parsearCsvConexiones, PLANTILLA_CSV, type FilaCsvConexion } from './importarCsvLogica';

const CLASES_SELECT =
  'h-10 w-full rounded-lg border border-line-strong bg-surface px-3 text-sm text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand';

export interface ImportarCsvDialogoProps {
  abierto: boolean;
  onAbiertoChange: (v: boolean) => void;
  conectores: { id: string; nombre: string }[];
  onImportado: () => void;
}

export function ImportarCsvDialogo({ abierto, onAbiertoChange, conectores, onImportado }: ImportarCsvDialogoProps) {
  const t = useTranslations('integracionesConexiones');
  const archivo = useRef<HTMLInputElement>(null);
  const [conector, setConector] = useState('');
  const [filas, setFilas] = useState<FilaCsvConexion[]>([]);
  const [errorArchivo, setErrorArchivo] = useState<string | null>(null);
  const [importando, setImportando] = useState(false);
  const [resultado, setResultado] = useState<{ creadas: number; fallidas: number; errores: string[] } | null>(null);
  const [errorServidor, setErrorServidor] = useState<string | null>(null);

  const plantilla = useMemo(() => `data:text/csv;charset=utf-8,${encodeURIComponent(PLANTILLA_CSV)}`, []);

  const reiniciar = () => {
    setConector('');
    setFilas([]);
    setErrorArchivo(null);
    setResultado(null);
    setErrorServidor(null);
    if (archivo.current) archivo.current.value = '';
  };

  const leer = async (f: File | undefined) => {
    setResultado(null);
    setErrorArchivo(null);
    if (!f) return setFilas([]);
    const r = parsearCsvConexiones(await f.text());
    if ('error' in r) {
      setFilas([]);
      setErrorArchivo(t(`importar.error.${r.error}`));
      return;
    }
    setFilas(r.filas);
  };

  const importar = async () => {
    setImportando(true);
    setErrorServidor(null);
    try {
      const r = await apiConexiones.importar({ conector, filas });
      setResultado(r);
      if (r.creadas > 0) onImportado();
    } catch (e) {
      setErrorServidor(e instanceof Error ? e.message : t('importar.error.servidor'));
    } finally {
      setImportando(false);
    }
  };

  return (
    <Dialogo
      abierto={abierto}
      onAbiertoChange={(v) => {
        if (!v) reiniciar();
        onAbiertoChange(v);
      }}
      titulo={t('importar.titulo')}
      descripcion={t('importar.descripcion')}
      icono={Upload}
      ancho={560}
      textoCancelar={resultado ? t('comun.cerrar') : undefined}
      primario={{
        etiqueta: t('importar.boton', { n: filas.length }),
        onClick: () => void importar(),
        cargando: importando,
        deshabilitada: !conector || filas.length === 0 || !!resultado,
        motivo: !conector ? t('importar.faltaConector') : t('importar.faltaArchivo'),
      }}
    >
      <div className="flex flex-col gap-4">
        <FormField etiqueta={t('importar.conector')} obligatorio>
          {(campo) => (
            <select {...campo} className={CLASES_SELECT} value={conector} onChange={(e) => setConector(e.target.value)}>
              <option value="">{t('importar.elegirConector')}</option>
              {conectores.map((c) => (
                <option key={c.id} value={c.id}>{c.nombre}</option>
              ))}
            </select>
          )}
        </FormField>
        <FormField
          etiqueta={t('importar.archivo')}
          obligatorio
          error={errorArchivo}
          ayuda={
            <a href={plantilla} download="conexiones.csv" className="text-brand-text underline-offset-2 hover:underline">
              {t('importar.plantilla')}
            </a>
          }
        >
          <input ref={archivo} type="file" accept=".csv,text/csv" className="text-sm text-fg" onChange={(e) => void leer(e.target.files?.[0])} />
        </FormField>
        {filas.length > 0 && !resultado && (
          <AvisoTonal tono="informacion" titulo={t('importar.vistaPrevia', { n: filas.length })} descripcion={filas.slice(0, 5).map((f) => f.nombre || '—').join(' · ')} />
        )}
        <AvisoTonal tono="advertencia" titulo={t('importar.sinLlaves.titulo')} descripcion={t('importar.sinLlaves.descripcion')} />
        {errorServidor && <AvisoTonal tono="peligro" rol="alert" titulo={errorServidor} />}
        {resultado && (
          <AvisoTonal
            tono={resultado.fallidas > 0 ? 'advertencia' : 'exito'}
            rol="status"
            titulo={t('importar.resultado', { creadas: resultado.creadas, fallidas: resultado.fallidas })}
            descripcion={resultado.errores.slice(0, 5).join(' · ') || undefined}
          />
        )}
      </div>
    </Dialogo>
  );
}
