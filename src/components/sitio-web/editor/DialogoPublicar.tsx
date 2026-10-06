'use client';

/**
 * «Publicar cambios» (Figma A/05g) y «Publicar Sede Norte» (D/05-24):
 * - lista de cambios desde la última publicación (con «Ver», que selecciona la sección);
 * - ¿Cuándo? «Publicar ahora · Tus clientes lo ven en menos de un minuto» o «Programar» con
 *   fecha y hora en la zona horaria de la organización;
 * - nota de la versión (aparece en el historial);
 * - «Se guarda una versión · Si algo no queda bien, la restauras desde el historial en un clic.»;
 * - en una sede: aviso de los cambios del principal que la sede hereda y la casilla «Publicar
 *   también el sitio principal».
 * - si la web aún no muestra este sitio y el lector está listo, una línea avisa que publicar
 *   también la activa (y cómo volver: ⋯ › Desactivar).
 *
 * Programar se apaga con su motivo mientras su migración no esté aplicada (503 de la API).
 */
import { useEffect, useMemo, useState } from 'react';
import { Info } from 'lucide-react';
import {
  AvisoTonal,
  CampoFecha,
  Dialogo,
  FormField,
  Skeleton,
  TarjetaSeleccionable,
} from '@/components/kit';
import { CampoHora } from '@/components/kit/CampoHora';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { useFormatDate } from '@/lib/context/OrganizationTimezoneContext';
import { nextPlainDay } from '@/lib/utils/dateDisplay';
import type { CambioPublicacion } from '@/lib/website/v2/cambiosPublicacion';
import { LIMITES_PROGRAMACION, validarFechaProgramacion } from '@/lib/website/v2/tiposEditor';
import { describirCambio } from './describirCambio';
import { useTextosEditor } from './textos';

export interface DialogoPublicarProps {
  abierto: boolean;
  onAbiertoChange: (abierto: boolean) => void;
  nombreSitio: string;
  esSede: boolean;
  /** Dirección de la sede («tumarca.goadmin.io/sede-norte»), si se sabe. */
  direccion?: string | null;
  cambios: CambioPublicacion[] | null;
  ultimaPublicacion: { en: string; autor: string | null } | null;
  principalConCambios?: boolean;
  v2Adoptado: boolean;
  /** Publicar ahora también activará la web (primera vez con el lector listo): se avisa en una línea. */
  activaraWeb?: boolean;
  programarDisponible: boolean | null;
  publicando: boolean;
  onVer: (destino: { paginaId: string; seccionId?: string }) => void;
  onPublicar: (opciones: { nota: string | null; tambienPrincipal: boolean }) => void;
  onProgramar: (ejecutarEn: string, nota: string | null) => void;
}

export function DialogoPublicar(p: DialogoPublicarProps) {
  const t = useTextosEditor();
  const { formatDateTime, getToday, toInstant } = useFormatDate(null);
  const [cuando, setCuando] = useState<'ahora' | 'programar'>('ahora');
  const [nota, setNota] = useState('');
  const [fecha, setFecha] = useState('');
  const [hora, setHora] = useState('08:00');
  const [tambienPrincipal, setTambienPrincipal] = useState(false);

  useEffect(() => {
    if (!p.abierto) return;
    setCuando('ahora');
    setNota('');
    setFecha(nextPlainDay(getToday()));
    setHora('08:00');
    setTambienPrincipal(false);
  }, [p.abierto, getToday]);

  const descritos = useMemo(() => (p.cambios ?? []).map((c) => describirCambio(c, t)), [p.cambios, t]);
  const instante = fecha && hora ? toInstant(fecha, hora) : null;
  const validez = instante ? validarFechaProgramacion(new Date(instante)) : 'invalida';
  const errorFecha = cuando === 'programar' && validez !== 'ok' ? t(`publicar.fecha.${validez}`) : null;

  const descripcion = p.esSede
    ? t('publicar.descripcionSede', { direccion: p.direccion ?? p.nombreSitio })
    : p.cambios === null
      ? t('publicar.calculando')
      : p.ultimaPublicacion
        ? t(descritos.length === 1 ? 'publicar.descripcionUno' : 'publicar.descripcion', {
            n: descritos.length,
            fecha: formatDateTime(p.ultimaPublicacion.en),
            autor: p.ultimaPublicacion.autor ? `, ${p.ultimaPublicacion.autor}` : '',
          })
        : t('publicar.primeraVez');

  const textoPrimario =
    cuando === 'programar' ? t('publicar.programarAccion') : p.esSede ? t('publicar.publicarSede', { sede: p.nombreSitio }) : t('publicar.ahoraAccion');

  const confirmar = () => {
    const n = nota.trim() ? nota.trim().slice(0, LIMITES_PROGRAMACION.nota) : null;
    if (cuando === 'programar') {
      if (instante && validez === 'ok') p.onProgramar(new Date(instante).toISOString(), n);
      return;
    }
    p.onPublicar({ nota: n, tambienPrincipal });
  };

  return (
    <Dialogo
      abierto={p.abierto}
      onAbiertoChange={p.onAbiertoChange}
      titulo={p.esSede ? t('publicar.tituloSede', { sede: p.nombreSitio }) : t('publicar.titulo')}
      descripcion={descripcion}
      ancho={560}
      primario={{
        etiqueta: textoPrimario,
        onClick: confirmar,
        cargando: p.publicando,
        deshabilitada: p.publicando || (cuando === 'programar' && validez !== 'ok'),
        motivo: errorFecha ?? undefined,
      }}
    >
      <div className="flex flex-col gap-4">
        {p.cambios === null ? (
          <div className="flex flex-col gap-2 rounded-xl bg-subtle p-3" aria-busy="true">
            <Skeleton className="h-10 w-full rounded-lg" />
            <Skeleton className="h-10 w-full rounded-lg" />
          </div>
        ) : descritos.length > 0 ? (
          <ul aria-label={t('publicar.listaCambios')} className="flex max-h-56 flex-col gap-1 overflow-y-auto rounded-xl bg-subtle p-2">
            {descritos.map((c) => {
              const Icono = c.icono;
              return (
                <li key={c.clave} className="flex items-start gap-3 rounded-lg px-2 py-1.5">
                  <Icono aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-fg-secondary" strokeWidth={1.5} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium leading-5 text-fg">{c.titulo}</p>
                    {c.detalle && <p className="text-[13px] leading-[18px] text-fg-secondary">{c.detalle}</p>}
                  </div>
                  {c.ver && (
                    <button
                      type="button"
                      onClick={() => {
                        if (!c.ver) return;
                        p.onVer(c.ver);
                        p.onAbiertoChange(false);
                      }}
                      className="shrink-0 rounded-md px-2 py-1 text-[13px] font-medium text-fg hover:bg-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
                    >
                      {t('publicar.ver')}
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="rounded-xl bg-subtle p-3 text-[13px] leading-[18px] text-fg-secondary">{t('publicar.sinCambios')}</p>
        )}

        <fieldset className="flex flex-col gap-2">
          <legend className="mb-2 text-[13px] font-semibold leading-[18px] text-fg">{t('publicar.cuando')}</legend>
          <div role="radiogroup" className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <TarjetaSeleccionable
              titulo={t('publicar.ahora')}
              descripcion={t('publicar.ahoraAyuda')}
              seleccionada={cuando === 'ahora'}
              onSeleccionar={() => setCuando('ahora')}
            />
            <TarjetaSeleccionable
              titulo={t('publicar.programar')}
              descripcion={p.programarDisponible === false ? t('publicar.programarNoDisponible') : t('publicar.programarAyuda')}
              seleccionada={cuando === 'programar'}
              onSeleccionar={() => setCuando('programar')}
              deshabilitada={p.programarDisponible === false}
            />
          </div>
        </fieldset>

        {cuando === 'programar' && (
          <div className="grid grid-cols-2 gap-3">
            <FormField etiqueta={t('publicar.fecha.etiqueta')} obligatorio error={errorFecha}>
              {(c) => (
                <CampoFecha
                  id={c.id}
                  aria-labelledby={c.idEtiqueta}
                  aria-describedby={c['aria-describedby']}
                  valor={fecha}
                  onValorChange={setFecha}
                  min={getToday()}
                  hoy={getToday()}
                  required
                />
              )}
            </FormField>
            <FormField etiqueta={t('publicar.hora')} obligatorio>
              {(c) => <CampoHora id={c.id} aria-labelledby={c.idEtiqueta} valor={hora} onValorChange={setHora} paso={15} required />}
            </FormField>
          </div>
        )}

        <FormField etiqueta={t('publicar.nota')} ayuda={t('publicar.notaAyuda')}>
          <Input value={nota} maxLength={LIMITES_PROGRAMACION.nota} onChange={(e) => setNota(e.target.value)} placeholder={t('publicar.notaEjemplo')} className="h-10 rounded-lg" />
        </FormField>

        {p.esSede && p.principalConCambios && (
          <>
            <AvisoTonal tono="advertencia" titulo={t('publicar.principalTitulo', { sede: p.nombreSitio })} descripcion={t('publicar.principalDescripcion', { sede: p.nombreSitio })} />
            <label className="flex items-center gap-2 text-sm text-fg">
              <Checkbox checked={tambienPrincipal} onCheckedChange={(v) => setTambienPrincipal(v === true)} />
              {t('publicar.tambienPrincipal')}
            </label>
          </>
        )}

        <AvisoTonal tono="informacion" icono={Info} titulo={t('publicar.versionTitulo')} descripcion={t('publicar.versionDescripcion')} />
        {cuando === 'ahora' && p.activaraWeb ? (
          <AvisoTonal tono="informacion" compacto titulo={t('publicar.activaraWeb')} />
        ) : (
          !p.v2Adoptado && <AvisoTonal tono="advertencia" compacto titulo={t('publicar.sinAdoptarTitulo')} descripcion={t('publicar.sinAdoptarDescripcion')} />
        )}
      </div>
    </Dialogo>
  );
}
