'use client';

/**
 * Importar fragmentos (Figma 91-chat-33): 1. archivo CSV o texto pegado,
 * 2. vista previa con el estado de cada fila (las filas con error no se
 * cargan), 3. opciones (fuente, etiquetas para todos, dejarlos listos para la
 * IA). El análisis y la carga son los de `knowledgeService`.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Upload } from 'lucide-react';
import { AvisoTonal, DataTable, FormField, TabBar, Tarjeta, clasesBoton, idPanel, type ColumnaTabla } from '@/components/kit';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/components/ui/use-toast';
import { useOrganization } from '@/lib/hooks/useOrganization';
import KnowledgeService, { type ImportFragmentData, type ImportResult, type KnowledgeSource } from '@/lib/services/knowledgeService';
import { CabeceraDetalleChat } from '@/components/chat/CabeceraDetalleChat';
import { FileUploadZone, TextInputZone } from '@/components/chat/conocimiento/importar';
import { useMiembroActual } from '@/components/chat/conocimiento/useMiembroActual';
import { revisarFilasImportacion, type FilaImportacion } from '@/components/chat/conocimiento/conocimientoLogica';

type Modo = 'csv' | 'texto';
const SIN_FUENTE = '__ninguna__';
const VISTA = 20;

export default function ImportPage() {
  const t = useTranslations('chatModulo.conocimiento.importar');
  const tc = useTranslations('chatModulo.conocimiento');
  const router = useRouter();
  const { toast } = useToast();
  const { organization } = useOrganization();
  const organizationId = organization?.id;
  const memberId = useMiembroActual(organizationId);

  const [fuentes, setFuentes] = useState<KnowledgeSource[]>([]);
  const [modo, setModo] = useState<Modo>('csv');
  const [archivo, setArchivo] = useState<{ name: string; type: 'csv' | 'text' } | null>(null);
  const [contenidoArchivo, setContenidoArchivo] = useState('');
  const [texto, setTexto] = useState('');
  const [separador, setSeparador] = useState('---');
  const [fuenteId, setFuenteId] = useState(SIN_FUENTE);
  const [etiquetasTexto, setEtiquetasTexto] = useState('');
  const [indexar, setIndexar] = useState(true);
  const [importando, setImportando] = useState(false);
  const [resultado, setResultado] = useState<ImportResult | null>(null);
  const [errorAnalisis, setErrorAnalisis] = useState<string | null>(null);
  const [filas, setFilas] = useState<ImportFragmentData[]>([]);

  useEffect(() => {
    if (!organizationId) return;
    new KnowledgeService(organizationId)
      .getSources()
      .then((fs) => setFuentes(fs.filter((f) => f.is_active)))
      .catch((e) => console.error('Error cargando fuentes:', e));
  }, [organizationId]);

  const etiquetas = useMemo(
    () =>
      etiquetasTexto
        .split(',')
        .map((e) => e.trim())
        .filter(Boolean),
    [etiquetasTexto],
  );

  const analizar = useCallback(() => {
    if (!organizationId) return;
    setErrorAnalisis(null);
    try {
      const s = new KnowledgeService(organizationId);
      const crudas = modo === 'csv' ? (contenidoArchivo ? s.parseCSV(contenidoArchivo) : []) : texto ? s.parseTextBlocks(texto, separador) : [];
      setFilas(etiquetas.length ? crudas.map((f) => ({ ...f, tags: Array.from(new Set([...(f.tags ?? []), ...etiquetas])) })) : crudas);
    } catch (e) {
      setErrorAnalisis(e instanceof Error ? e.message : t('errorAnalisis'));
      setFilas([]);
    }
  }, [organizationId, modo, contenidoArchivo, texto, separador, etiquetas, t]);

  useEffect(() => {
    analizar();
  }, [analizar]);

  const revisadas = useMemo(() => revisarFilasImportacion(filas), [filas]);
  const validas = revisadas.filter((r) => r.estado === 'lista');
  const conError = revisadas.length - validas.length;

  const importar = async () => {
    if (!organizationId || !memberId || validas.length === 0) return;
    setImportando(true);
    try {
      const r = await new KnowledgeService(organizationId).importFragments(
        validas.map((v) => v.fragmento),
        fuenteId === SIN_FUENTE ? null : fuenteId,
        memberId,
        indexar,
      );
      setResultado(r);
      toast({ title: r.success ? t('toasts.listo', { n: r.successCount }) : t('toasts.parcial'), variant: r.success ? 'default' : 'destructive' });
    } catch (e) {
      console.error('Error importando fragmentos:', e);
      toast({ title: t('toasts.error'), variant: 'destructive' });
    } finally {
      setImportando(false);
    }
  };

  const columnas: ColumnaTabla<FilaImportacion>[] = [
    { id: 'n', encabezado: '#', ancho: 48, celda: (r) => <span className="text-fg-muted">{r.fila}</span> },
    { id: 'titulo', encabezado: t('vista.titulo'), ancho: 220, celda: (r) => (r.fragmento.title?.trim() ? r.fragmento.title : <span className="text-fg-muted">{t('vista.sinTitulo')}</span>) },
    { id: 'contenido', encabezado: t('vista.contenido'), celda: (r) => <span className="line-clamp-1 text-fg-secondary">{r.fragmento.content}</span> },
    {
      id: 'estado',
      encabezado: t('vista.estado'),
      ancho: 150,
      celda: (r) => (
        <Badge tono={r.estado === 'lista' ? 'exito' : 'peligro'} tamano="sm">
          {t(`vista.estados.${r.estado}`)}
        </Badge>
      ),
    },
  ];

  return (
    <div className="flex min-w-0 flex-col gap-4 p-4 pb-28 lg:gap-6 lg:p-6 lg:pb-24">
      <CabeceraDetalleChat titulo={t('titulo')} volverA="/app/chat/conocimiento" migas={[tc('migas.chat'), tc('migas.conocimiento')]} subtitulo={t('subtitulo')} />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(300px,380px)] lg:gap-6">
        <div className="flex min-w-0 flex-col gap-4 lg:gap-6">
          <Tarjeta titulo={t('paso1')}>
            <div className="flex flex-col gap-4">
              <TabBar<Modo>
                id="importar"
                etiqueta={t('paso1')}
                valor={modo}
                onValorChange={(m) => {
                  setModo(m);
                  setResultado(null);
                }}
                pestanas={[
                  { valor: 'csv', etiqueta: t('modos.csv') },
                  { valor: 'texto', etiqueta: t('modos.texto') },
                ]}
              />
              <div role="tabpanel" id={idPanel('importar', modo)}>
                {modo === 'csv' ? (
                  <FileUploadZone
                    selectedFile={archivo}
                    onFileSelect={(contenido, nombre, tipo) => {
                      setContenidoArchivo(contenido);
                      setArchivo({ name: nombre, type: tipo });
                      if (tipo === 'text') {
                        setTexto(contenido);
                        setModo('texto');
                      }
                      setResultado(null);
                    }}
                    onClear={() => {
                      setContenidoArchivo('');
                      setArchivo(null);
                      setResultado(null);
                    }}
                  />
                ) : (
                  <TextInputZone
                    textContent={texto}
                    separator={separador}
                    onTextChange={(v) => {
                      setTexto(v);
                      setResultado(null);
                    }}
                    onSeparatorChange={setSeparador}
                  />
                )}
              </div>
              {errorAnalisis && <AvisoTonal tono="peligro" compacto titulo={errorAnalisis} />}
            </div>
          </Tarjeta>

          <Tarjeta titulo={t('paso2')} descripcion={t('paso2Descripcion')} sinRelleno={revisadas.length > 0}>
            {revisadas.length === 0 ? (
              <p className="text-[13px] text-fg-muted">{t('vista.vacia')}</p>
            ) : (
              <div className="flex flex-col gap-3 px-4 pb-4 sm:px-5">
                <DataTable<FilaImportacion>
                  etiqueta={t('paso2')}
                  densidad="compacta"
                  columnas={columnas}
                  filas={revisadas.slice(0, VISTA)}
                  obtenerId={(r) => String(r.fila)}
                  tonoFila={(r) => (r.estado === 'lista' ? undefined : 'peligro')}
                />
                <p className="text-xs text-fg-muted">
                  {t('vista.resumen', { mostradas: Math.min(VISTA, revisadas.length), total: revisadas.length, listas: validas.length, errores: conError })}
                </p>
              </div>
            )}
          </Tarjeta>
        </div>

        <div className="flex min-w-0 flex-col gap-4 lg:gap-6">
          <Tarjeta titulo={t('paso3')}>
            <div className="flex flex-col gap-4">
              <FormField etiqueta={t('opciones.fuente')}>
                {(campo) => (
                  <Select value={fuenteId} onValueChange={setFuenteId}>
                    <SelectTrigger id={campo.id}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={SIN_FUENTE}>{t('opciones.sinFuente')}</SelectItem>
                      {fuentes.map((f) => (
                        <SelectItem key={f.id} value={f.id}>
                          {f.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </FormField>
              <FormField etiqueta={t('opciones.etiquetas')} ayuda={t('opciones.etiquetasAyuda')}>
                <Input value={etiquetasTexto} onChange={(e) => setEtiquetasTexto(e.target.value)} placeholder="faq, envíos" />
              </FormField>
              <label className="flex cursor-pointer items-center gap-2 text-sm text-fg">
                <Checkbox checked={indexar} onCheckedChange={(v) => setIndexar(v === true)} />
                {t('opciones.indexar')}
              </label>
              <button type="button" onClick={importar} disabled={importando || validas.length === 0 || !memberId} className={clasesBoton({ anchoCompleto: true })}>
                <Upload aria-hidden="true" className="size-4" strokeWidth={1.5} />
                {t('opciones.importar', { n: validas.length })}
              </button>
              {indexar && <p className="text-xs text-fg-muted">{t('opciones.creditos')}</p>}
            </div>
          </Tarjeta>
          {resultado && (
            <AvisoTonal
              tono={resultado.errorCount === 0 ? 'exito' : 'advertencia'}
              titulo={t('resultado.titulo', { ok: resultado.successCount, total: resultado.totalProcessed })}
              descripcion={resultado.errorCount > 0 ? t('resultado.errores', { n: resultado.errorCount }) : undefined}
              accion={{ etiqueta: t('resultado.ver'), onClick: () => router.push(fuenteId === SIN_FUENTE ? '/app/chat/conocimiento' : `/app/chat/conocimiento/fuentes/${fuenteId}`) }}
            />
          )}
        </div>
      </div>
    </div>
  );
}
