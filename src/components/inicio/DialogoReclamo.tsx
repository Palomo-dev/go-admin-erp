'use client';

/**
 * «Reclamar esta marca» de Mi asistencia (Figma 20.31.6; móvil: hoja 20.31.7) y
 * «Ver detalle de la marca» (20.31.5). El empleado reclama una marca suya: nace
 * un ajuste pendiente que revisa su jefe. La marca original nunca cambia (R1) y
 * su foto queda retenida mientras el caso está abierto (R2). Lo valida y lo
 * guarda `POST /api/hrm/marcacion/reclamos` (`fn_hr_ajuste_solicitar`).
 *
 * La «hora correcta» se elige como hora de pared de la sede, sobre el día de
 * pared de la marca original, y viaja como instante con zona (los mismos
 * helpers que «Agregar ajuste» de Asistencia).
 */
import { useEffect, useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { Fingerprint, Info, KeyRound, Laptop, LocateFixed, MessageSquare, Nfc, PenLine, ScanFace, ScanQrCode, type LucideIcon } from 'lucide-react';
import { AvisoTonal, FilaDato, FormField, PanelAdaptable, clasesBoton } from '@/components/kit';
import { CampoHora } from '@/components/kit/CampoHora';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ErrorEstructura, pedir } from '@/components/hrm/estructura/comun';
import { useFormatoHora } from '@/components/hrm/turnos/formatoHora';
import { toPlainDate, wallTimeToInstant } from '@/lib/utils/dateCore';
import { cuerpoReclamo, ICONO_METODO, QUE_ESTA_MAL, type MetodoMarca, type QueEstaMal } from '@/lib/hrm/marcacion/metodos';
import { claveErrorReclamo, marcaPorDefecto, normalizarMetodo, ordenarMarcas, puedeReclamar, type DiaAsistencia, type MarcaMia } from './miAsistenciaLogica';

/** Componente lucide de cada icono de `ICONO_METODO` (CATALOGO-ICONOS, adenda 2026-11-16). */
const ICONOS: Record<string, LucideIcon> = { LocateFixed, ScanQrCode, Nfc, KeyRound, ScanFace, Fingerprint, Laptop, PenLine };

export function iconoMetodo(m: MetodoMarca): LucideIcon {
  return ICONOS[ICONO_METODO[m]] ?? LocateFixed;
}

/** «Cómo» con su icono (20.31.4): «Celular con ubicación», «QR de la sede», «Etiqueta NFC»… */
export function CeldaMetodo({ metodo }: { metodo: MetodoMarca | null }) {
  const t = useTranslations('hrmMarcacion.miAsistencia');
  if (!metodo) return <>—</>;
  const Icono = iconoMetodo(metodo);
  return (
    <span className="inline-flex items-center gap-2">
      <Icono aria-hidden className="size-4 shrink-0 text-fg-secondary" strokeWidth={1.5} />
      {t(`metodos.${metodo}`)}
    </span>
  );
}

function useTextoMarca() {
  const t = useTranslations('hrmMarcacion');
  const f = useFormatoHora();
  return {
    marca: (m: MarcaMia, zona: string) => `${t(`tipo.${m.tipo}`)} · ${f.hora(m.hora, zona)}`,
    metodo: (m: MarcaMia) => {
      const metodo = normalizarMetodo(m.metodo);
      return [metodo ? t(`miAsistencia.metodos.${metodo}`) : null, m.punto].filter(Boolean).join(' · ') || '—';
    },
  };
}

export function DialogoReclamo({
  abierto,
  onAbiertoChange,
  dia,
  zona,
  onEnviado,
}: {
  abierto: boolean;
  onAbiertoChange: (abierto: boolean) => void;
  dia: DiaAsistencia | null;
  zona: string;
  onEnviado?: () => void;
}) {
  const t = useTranslations('hrmMarcacion.reclamo');
  const f = useFormatoHora();
  const texto = useTextoMarca();
  const marcas = useMemo(() => ordenarMarcas(dia?.marcas), [dia]);
  const [marcaId, setMarcaId] = useState('');
  const [que, setQue] = useState<QueEstaMal | ''>('');
  const [motivo, setMotivo] = useState('');
  const [hora, setHora] = useState('');
  const [errores, setErrores] = useState<{ que?: string; motivo?: string; hora?: string }>({});
  const [enviando, setEnviando] = useState(false);

  // Se reinicia al abrir: por defecto la entrada (o la primera sin reclamo en revisión).
  useEffect(() => {
    if (!abierto) return;
    setMarcaId(marcaPorDefecto(dia?.marcas)?.id ?? '');
    setQue('');
    setMotivo('');
    setHora('');
    setErrores({});
  }, [abierto, dia]);

  const marca = marcas.find((m) => m.id === marcaId) ?? null;

  /** Hora de pared de la sede sobre el día de pared de la marca original → instante con zona. */
  const instante = (): string | null => {
    if (!hora || !marca) return null;
    return wallTimeToInstant(toPlainDate(new Date(marca.hora), zona), hora, zona).toISOString();
  };

  const enviar = async () => {
    if (!marca) return;
    const r = cuerpoReclamo({ eventoId: marca.id, que, motivo, hora: que === 'no_es_mia' ? null : instante() });
    if (!r.ok) {
      setErrores({ [r.error]: t(`errores.reclamo_${r.error}`) });
      return;
    }
    setErrores({});
    setEnviando(true);
    try {
      await pedir('/api/hrm/marcacion/reclamos', { metodo: 'POST', cuerpo: r.cuerpo });
      // 20.31.8
      toast.success(t('enviado'), { description: t('enviadoDetalle') });
      onAbiertoChange(false);
      onEnviado?.();
    } catch (e) {
      const clave = claveErrorReclamo(e instanceof ErrorEstructura ? e.codigo : 'error_hrm');
      if (clave === 'reclamo_hora') setErrores({ hora: t('errores.reclamo_hora') });
      else if (clave === 'reclamo_motivo') setErrores({ motivo: t('errores.reclamo_motivo') });
      else toast.error(t(`errores.${clave}`));
    } finally {
      setEnviando(false);
    }
  };

  return (
    <PanelAdaptable
      abierto={abierto}
      onAbiertoChange={onAbiertoChange}
      ocupado={enviando}
      ancho={520}
      icono={MessageSquare}
      titulo={dia ? t('titulo', { dia: f.diaCorto(dia.fecha).toLowerCase() }) : t('tituloSinDia')}
      pie={
        <div className="flex w-full flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button type="button" className={clasesBoton({ variante: 'secundario' })} onClick={() => onAbiertoChange(false)} disabled={enviando}>
            {t('cancelar')}
          </button>
          <button type="button" className={clasesBoton({ variante: 'primario' })} onClick={() => void enviar()} disabled={enviando || !marca} aria-busy={enviando || undefined}>
            {t('enviar')}
          </button>
        </div>
      }
    >
      <div className="flex flex-col gap-4">
        {marcas.length > 1 ? (
          <FormField etiqueta={t('marca')} obligatorio>
            {(c) => (
              <Select value={marcaId} onValueChange={setMarcaId}>
                <SelectTrigger id={c.id} aria-labelledby={c.idEtiqueta} className="h-10 border-line-strong bg-surface">
                  <SelectValue placeholder={t('elegirMarca')} />
                </SelectTrigger>
                <SelectContent>
                  {marcas.map((m) => (
                    <SelectItem key={m.id} value={m.id}>
                      {texto.marca(m, zona)}
                      {m.reclamo === 'pending' ? ` · ${t('enRevision')}` : ''}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </FormField>
        ) : (
          marca && <FilaDato etiqueta={t('marca')} valor={texto.marca(marca, zona)} />
        )}
        {marca && <FilaDato etiqueta={t('metodo')} valor={texto.metodo(marca)} />}
        <FormField etiqueta={t('que')} obligatorio error={errores.que}>
          {(c) => (
            <Select value={que} onValueChange={(v) => setQue(v as QueEstaMal)}>
              <SelectTrigger id={c.id} aria-labelledby={c.idEtiqueta} aria-invalid={!!errores.que} className="h-10 border-line-strong bg-surface">
                <SelectValue placeholder={t('elegir')} />
              </SelectTrigger>
              <SelectContent>
                {QUE_ESTA_MAL.map((q) => (
                  <SelectItem key={q} value={q}>
                    {t(`opciones.${q}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </FormField>
        <FormField etiqueta={t('quePaso')} obligatorio error={errores.motivo}>
          <Textarea value={motivo} onChange={(e) => setMotivo(e.target.value)} maxLength={500} rows={2} placeholder={t('quePasoEjemplo')} className="border-line-strong" />
        </FormField>
        {que !== 'no_es_mia' && (
          <FormField etiqueta={t('hora')} ayuda={t('horaAyuda')} error={errores.hora}>
            {(c) => <CampoHora id={c.id} aria-labelledby={c.idEtiqueta} aria-invalid={!!errores.hora} valor={hora} onValorChange={setHora} paso={5} limpiable />}
          </FormField>
        )}
        <AvisoTonal tono="informacion" icono={Info} titulo={t('aviso.titulo')} descripcion={t('aviso.descripcion')} />
      </div>
    </PanelAdaptable>
  );
}

const TONO_RECLAMO = { pending: 'informacion', approved: 'exito', rejected: 'neutro' } as const;

/** «Ver detalle de la marca» (20.31.5): las marcas del día, su método, su punto y su reclamo. */
export function DialogoDetalleMarcas({
  abierto,
  onAbiertoChange,
  dia,
  zona,
  onReclamar,
}: {
  abierto: boolean;
  onAbiertoChange: (abierto: boolean) => void;
  dia: DiaAsistencia | null;
  zona: string;
  onReclamar: (dia: DiaAsistencia) => void;
}) {
  const t = useTranslations('hrmMarcacion.reclamo');
  const f = useFormatoHora();
  const texto = useTextoMarca();
  const marcas = ordenarMarcas(dia?.marcas);
  return (
    <PanelAdaptable
      abierto={abierto}
      onAbiertoChange={onAbiertoChange}
      ancho={520}
      icono={LocateFixed}
      titulo={dia ? t('detalle.titulo', { dia: f.diaCorto(dia.fecha).toLowerCase() }) : t('tituloSinDia')}
      pie={
        <div className="flex w-full flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button type="button" className={clasesBoton({ variante: 'secundario' })} onClick={() => onAbiertoChange(false)}>
            {t('detalle.cerrar')}
          </button>
          {dia && puedeReclamar(dia) && (
            <button type="button" className={clasesBoton({ variante: 'primario' })} onClick={() => onReclamar(dia)}>
              <MessageSquare aria-hidden className="size-4" strokeWidth={1.5} />
              {t('reclamar')}
            </button>
          )}
        </div>
      }
    >
      {marcas.length === 0 ? (
        <p className="text-sm text-fg-secondary">{t('detalle.sinMarcas')}</p>
      ) : (
        <ul className="flex flex-col divide-y divide-line">
          {marcas.map((m) => {
            const metodo = normalizarMetodo(m.metodo);
            const Icono = metodo ? iconoMetodo(metodo) : LocateFixed;
            return (
              <li key={m.id} className="flex items-start gap-3 py-3 first:pt-0 last:pb-0">
                <Icono aria-hidden className="mt-0.5 size-4 shrink-0 text-fg-secondary" strokeWidth={1.5} />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-fg">{texto.marca(m, zona)}</p>
                  <p className="text-sm text-fg-secondary">{texto.metodo(m)}</p>
                </div>
                {m.reclamo && (
                  <Badge tono={TONO_RECLAMO[m.reclamo]} apariencia="contorno" tamano="sm">
                    {t(`detalle.reclamo.${m.reclamo}`)}
                  </Badge>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </PanelAdaptable>
  );
}
