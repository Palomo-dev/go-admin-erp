'use client';

import { useMemo } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { ArrowRight, Plus, X } from 'lucide-react';
import { SegmentedControl } from '@/components/kit/SegmentedControl';
import { ChipsOpcion } from '@/components/kit/ChipsOpcion';
import { CampoHora } from '@/components/kit/CampoHora';
import { AvisoTonal } from '@/components/kit/AvisoTonal';
import { clasesBoton } from '@/components/kit/botonClases';
import { localeIntl } from '@/components/kit/idioma';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn } from '@/utils/Utils';
import { useMediaQuery } from '@/hooks/useMediaQuery';
import {
  FRANJA_VACIA,
  MAX_FRANJAS,
  columnasDeHorario,
  duracionBorradorMinutos,
  duracionDiariaMinutos,
  proximasActivaciones,
  terminaAlDiaSiguiente,
  validarHorario,
  type FranjaBorrador,
  type HorarioFormulario,
  type ModoHorario,
} from '@/lib/promotions/horarioPromocion';
import { diasDelIdioma, type DiaPromocion } from '../diasPromocion';
import type { WeekDay } from '../types';
import { textoDesfase, textoDuracion } from './textoHorario';
import { VistaSemanaPromocion } from './VistaSemanaPromocion';

/**
 * «Cuándo está activa» (Figma 2693:189260, capturas 97-pos-promociones-01..03).
 * Un solo control para el asistente (paso 3) y la edición masiva de horario.
 * Todo lo que dibuja (vista previa, próximas activaciones) sale del mismo
 * criterio con el que el motor decide si la promoción aplica.
 */
export interface SelectorHorarioPromocionProps {
  valor: HorarioFormulario;
  onValorChange: (valor: HorarioFormulario) => void;
  /** Zona horaria de la organización (las horas son de pared en esa zona). */
  zona: string;
  /** Vigencia en días de la organización, para las próximas activaciones. Sin ella no se listan. */
  vigencia?: { desde?: string | null; hasta?: string | null } | null;
  /** Muestra los errores de validación (tras intentar avanzar o guardar). */
  mostrarErrores?: boolean;
  /** Instante de referencia (pruebas). */
  ahora?: Date;
  idBase?: string;
}

function formatoActivacion(locale: string, zona: string, conAnio: boolean) {
  const opciones: Intl.DateTimeFormatOptions = {
    timeZone: zona,
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    ...(conAnio ? { year: 'numeric' } : {}),
  };
  const fecha = new Intl.DateTimeFormat(localeIntl(locale), opciones);
  const hora = new Intl.DateTimeFormat('en-GB', { timeZone: zona, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
  // «sáb 21 nov 2026»: las partes del idioma, sin comas ni «de».
  return (d: Date) => ({
    fecha: fecha.formatToParts(d).filter((p) => p.type !== 'literal').map((p) => p.value).join(' '),
    hora: hora.format(d),
  });
}

/** Un minuto antes de `HH:mm` (para «a las 13:59 sí; a las 14:00 ya no»). */
function minutoAntes(hora: string): string {
  const total = (Number(hora.slice(0, 2)) * 60 + Number(hora.slice(3, 5)) + 24 * 60 - 1) % (24 * 60);
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

export function SelectorHorarioPromocion({
  valor,
  onValorChange,
  zona,
  vigencia,
  mostrarErrores = false,
  ahora,
  idBase = 'promo-horario',
}: SelectorHorarioPromocionProps) {
  const t = useTranslations('posPromociones');
  const locale = useLocale();
  const dias = useMemo(() => diasDelIdioma(locale), [locale]);
  const nombre = (dia: WeekDay | '', forma: keyof Pick<DiaPromocion, 'corto' | 'largo'> = 'largo') =>
    dias.find((d) => d.value === dia)?.[forma] ?? '';
  const minuscula = (texto: string) => texto.toLocaleLowerCase(localeIntl(locale));
  const columnas = columnasDeHorario(valor);
  const error = mostrarErrores ? validarHorario(valor) : null;
  const desfase = textoDesfase(zona, ahora);

  const cambiar = (parcial: Partial<HorarioFormulario>) => onValorChange({ ...valor, ...parcial });
  const cambiarFranja = (i: number, parcial: Partial<FranjaBorrador>) =>
    cambiar({ franjas: valor.franjas.map((f, j) => (j === i ? { ...f, ...parcial } : f)) });

  const textoError = (): string | null => {
    if (!error) return null;
    const n = (error.franja ?? 0) + 1;
    switch (error.error) {
      case 'horasFaltantes': return t('horario.errorHorasFaltantes');
      case 'horasIguales': return t('horario.errorHorasIguales');
      case 'franjaIncompleta': return t('horario.errorFranjaIncompleta', { n });
      case 'franjaSinDuracion': return t('horario.errorFranjaSinDuracion', { n });
      case 'sinFranjas': return t('horario.errorSinFranjas');
      case 'demasiadasFranjas': return t('horario.errorDemasiadasFranjas', { max: MAX_FRANJAS });
      default: return null;
    }
  };

  // ── Resumen en palabras ──
  const listaDias = (seleccion: WeekDay[]): string => {
    if (seleccion.length === 0 || seleccion.length === 7) return t('horario.todosLosDias');
    const nombres = dias.filter((d) => seleccion.includes(d.value)).map((d) => minuscula(d.largo));
    try {
      return new Intl.ListFormat(localeIntl(locale), { style: 'long', type: 'conjunction' }).format(nombres);
    } catch {
      return nombres.join(', ');
    }
  };

  const resumen = (): string | null => {
    if (valor.modo === 'cadaDia') {
      if (!valor.inicio || !valor.fin || valor.inicio === valor.fin) return null;
      const datos = { dias: listaDias(valor.dias), inicio: valor.inicio, fin: valor.fin };
      return terminaAlDiaSiguiente(valor.inicio, valor.fin) ? t('horario.resumenCadaDiaCruza', datos) : t('horario.resumenCadaDia', datos);
    }
    if (valor.modo === 'cruza') {
      const frases: string[] = [];
      valor.franjas.forEach((f, i) => {
        const minutos = duracionBorradorMinutos(f);
        if (minutos == null || minutos === 0) return;
        frases.push(t('horario.resumenFranja', {
          desdeDia: minuscula(nombre(f.desde_dia)),
          desdeHora: f.desde_hora,
          hastaDia: minuscula(nombre(f.hasta_dia)),
          hastaHora: f.hasta_hora,
          duracion: textoDuracion(minutos, t),
        }));
        if (i === 0) {
          frases.push(t('horario.resumenEjemplo', { hastaDia: minuscula(nombre(f.hasta_dia)), antes: minutoAntes(f.hasta_hora), hastaHora: f.hasta_hora }));
        }
      });
      return frases.length > 0 ? frases.join(' ') : null;
    }
    return null;
  };

  // ── Próximas activaciones ──
  const proximas = useMemo(() => {
    if (!vigencia || valor.modo === 'todo' || validarHorario(valor)) return null;
    try {
      return proximasActivaciones(columnas, { ahora: ahora ?? new Date(), zona, desde: vigencia.desde, hasta: vigencia.hasta, limite: 3 });
    } catch {
      return null;
    }
    // `columnas` se deriva de `valor`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [valor, zona, vigencia?.desde, vigencia?.hasta, ahora]);

  const textoResumen = resumen();
  const mensajeError = textoError();
  const conAnio = formatoActivacion(locale, zona, true);
  const sinAnio = formatoActivacion(locale, zona, false);
  const lineaActivacion = (a: { inicio: Date; fin: Date }, i: number) => {
    const ini = (i === 0 ? conAnio : sinAnio)(a.inicio);
    const fin = sinAnio(a.fin);
    return `${ini.fecha} · ${ini.hora} → ${fin.fecha} · ${fin.hora}`;
  };

  const chip = (texto: string) => (
    <span className="inline-flex h-7 items-center whitespace-nowrap rounded-full border border-line-brand bg-brand-tint px-2.5 text-xs font-medium text-brand-deep">
      {texto}
    </span>
  );

  // En el celular los rótulos son cortos («Cada día», «Cruza días»), como en el Figma.
  const ancho = useMediaQuery('(min-width: 640px)');
  const modos: Array<{ valor: ModoHorario; etiqueta: string }> = [
    { valor: 'todo', etiqueta: t('horario.modoTodo') },
    { valor: 'cadaDia', etiqueta: ancho ? t('horario.modoCadaDia') : t('horario.modoCadaDiaCorto') },
    { valor: 'cruza', etiqueta: ancho ? t('horario.modoCruza') : t('horario.modoCruzaCorto') },
  ];

  return (
    <div className="flex flex-col gap-4">
      <p className="text-[13px] leading-[18px] text-fg-secondary">
        <span className="hidden sm:inline">{t('horario.descripcion', { zona, desfase })}</span>
        <span className="sm:hidden">{t('horario.descripcionCorta', { zona, desfase })}</span>
      </p>

      <SegmentedControl<ModoHorario>
        etiqueta={t('horario.titulo')}
        opciones={modos}
        valor={valor.modo}
        onValorChange={(modo) => cambiar({ modo })}
        anchoCompleto={!ancho}
      />

      {valor.modo === 'todo' && (
        <p className="text-[13px] leading-[18px] text-fg-secondary">{t('horario.todoAyuda')}</p>
      )}

      {valor.modo === 'cadaDia' && (
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <p id={`${idBase}-dias`} className="text-sm font-medium text-fg">{t('horario.dias')}</p>
            <ChipsOpcion<WeekDay>
              multiple
              aria-labelledby={`${idBase}-dias`}
              opciones={dias.map((d) => ({ valor: d.value, etiqueta: d.largo }))}
              valor={valor.dias}
              onValorChange={(seleccion) => cambiar({ dias: seleccion })}
            />
            <p className="text-[13px] leading-[18px] text-fg-secondary">{t('horario.diasAyuda')}</p>
          </div>
          <div className="flex flex-wrap items-end gap-3">
            <div className="flex w-[calc(50%-0.375rem)] flex-col gap-1.5 sm:w-40">
              <Label id={`${idBase}-inicio`} className="text-fg">
                {t('horario.horaInicio')} <span className="text-danger-text" aria-hidden="true">*</span>
              </Label>
              <CampoHora
                aria-labelledby={`${idBase}-inicio`}
                aria-invalid={Boolean(error && !valor.inicio) || undefined}
                valor={valor.inicio}
                onValorChange={(hora) => cambiar({ inicio: hora })}
                paso={15}
                formato24h
                required
              />
            </div>
            <div className="flex w-[calc(50%-0.375rem)] flex-col gap-1.5 sm:w-40">
              <Label id={`${idBase}-fin`} className="text-fg">
                {t('horario.horaFin')} <span className="text-danger-text" aria-hidden="true">*</span>
              </Label>
              <CampoHora
                aria-labelledby={`${idBase}-fin`}
                aria-invalid={Boolean(error && (!valor.fin || valor.fin === valor.inicio)) || undefined}
                valor={valor.fin}
                onValorChange={(hora) => cambiar({ fin: hora })}
                paso={15}
                formato24h
                required
              />
            </div>
            {(() => {
              const minutos = duracionDiariaMinutos(valor.inicio, valor.fin);
              if (minutos == null) return null;
              const duracion = textoDuracion(minutos, t);
              return (
                <div className="pb-1.5">
                  {chip(terminaAlDiaSiguiente(valor.inicio, valor.fin) ? t('horario.terminaDiaSiguiente', { duracion }) : t('horario.dura', { duracion }))}
                </div>
              );
            })()}
          </div>
        </div>
      )}

      {valor.modo === 'cruza' && (
        <div className="flex flex-col gap-4">
          {valor.franjas.map((f, i) => {
            const minutos = duracionBorradorMinutos(f);
            const invalida = Boolean(error && error.franja === i);
            const cruzaMedianoche = minutos != null && minutos > 0 && f.desde_dia !== f.hasta_dia;
            const id = `${idBase}-franja-${i}`;
            return (
              <fieldset key={i} className="flex flex-col gap-2" aria-describedby={invalida ? `${idBase}-error` : undefined}>
                <div className="flex items-center justify-between gap-2">
                  <legend className="text-[13px] font-medium leading-[18px] text-fg">{t('horario.franjaN', { n: i + 1 })}</legend>
                  {valor.franjas.length > 1 && (
                    <button
                      type="button"
                      onClick={() => cambiar({ franjas: valor.franjas.filter((_, j) => j !== i) })}
                      className={clasesBoton({ variante: 'fantasma', tamano: 'sm' })}
                      aria-label={t('horario.quitarFranja', { n: i + 1 })}
                    >
                      <X className="size-4" aria-hidden="true" />
                    </button>
                  )}
                </div>
                <div className="grid grid-cols-[1fr_6.5rem] gap-3 md:flex md:flex-wrap md:items-end">
                  <div className="flex flex-col gap-1.5 md:w-52">
                    <Label id={`${id}-desde-dia`} className="text-fg">
                      {t('horario.desdeDia')} <span className="text-danger-text" aria-hidden="true">*</span>
                    </Label>
                    <SelectorDia
                      etiquetaId={`${id}-desde-dia`}
                      valor={f.desde_dia}
                      dias={dias}
                      invalido={invalida && !f.desde_dia}
                      placeholder={t('horario.elegirDia')}
                      onValorChange={(dia) => cambiarFranja(i, { desde_dia: dia })}
                    />
                  </div>
                  <div className="flex flex-col gap-1.5 md:w-28">
                    <Label id={`${id}-desde-hora`} className="text-fg">
                      {t('horario.hora')} <span className="text-danger-text" aria-hidden="true">*</span>
                    </Label>
                    <CampoHora
                      aria-labelledby={`${id}-desde-hora`}
                      aria-invalid={(invalida && !f.desde_hora) || undefined}
                      valor={f.desde_hora}
                      onValorChange={(hora) => cambiarFranja(i, { desde_hora: hora })}
                      paso={15}
                      formato24h
                      required
                    />
                  </div>
                  <ArrowRight className="mb-3 hidden size-4 shrink-0 text-fg-secondary md:block" aria-hidden="true" />
                  <div className="flex flex-col gap-1.5 md:w-52">
                    <Label id={`${id}-hasta-dia`} className="text-fg">
                      {t('horario.hastaDia')} <span className="text-danger-text" aria-hidden="true">*</span>
                    </Label>
                    <SelectorDia
                      etiquetaId={`${id}-hasta-dia`}
                      valor={f.hasta_dia}
                      dias={dias}
                      invalido={invalida && !f.hasta_dia}
                      placeholder={t('horario.elegirDia')}
                      onValorChange={(dia) => cambiarFranja(i, { hasta_dia: dia })}
                    />
                  </div>
                  <div className="flex flex-col gap-1.5 md:w-28">
                    <Label id={`${id}-hasta-hora`} className="text-fg">
                      {t('horario.hora')} <span className="text-danger-text" aria-hidden="true">*</span>
                    </Label>
                    <CampoHora
                      aria-labelledby={`${id}-hasta-hora`}
                      aria-invalid={(invalida && !f.hasta_hora) || undefined}
                      valor={f.hasta_hora}
                      onValorChange={(hora) => cambiarFranja(i, { hasta_hora: hora })}
                      paso={15}
                      formato24h
                      required
                    />
                  </div>
                  {minutos != null && minutos > 0 && (
                    <div className="col-span-2 md:col-span-1 md:pb-1.5">
                      {chip(cruzaMedianoche
                        ? t('horario.duraCruza', { duracion: textoDuracion(minutos, t) })
                        : t('horario.dura', { duracion: textoDuracion(minutos, t) }))}
                    </div>
                  )}
                </div>
              </fieldset>
            );
          })}
          {valor.franjas.length < MAX_FRANJAS && (
            <div>
              <button
                type="button"
                onClick={() => cambiar({ franjas: [...valor.franjas, { ...FRANJA_VACIA }] })}
                className={clasesBoton({ variante: 'fantasma', tamano: 'sm' })}
              >
                <Plus className="size-4" aria-hidden="true" />
                {t('horario.agregarFranja')}
              </button>
            </div>
          )}
        </div>
      )}

      {mensajeError && (
        <p id={`${idBase}-error`} role="alert" className="text-[13px] leading-[18px] text-danger-text">{mensajeError}</p>
      )}

      {textoResumen && <AvisoTonal tono="informacion" titulo={textoResumen} compacto />}

      {valor.modo !== 'todo' && (
        <VistaSemanaPromocion horario={columnas} madrugadaAparte={valor.modo === 'cadaDia'} />
      )}

      {proximas && (
        <div className="flex flex-col gap-1">
          <p className="text-[13px] font-medium leading-[18px] text-fg">{t('horario.proximas')}</p>
          {proximas.primeras.length === 0 ? (
            <p className="text-[13px] leading-[18px] text-fg-secondary">{t('horario.ninguna')}</p>
          ) : (
            <ul className="flex flex-col gap-1 text-[13px] tabular-nums leading-[18px] text-fg">
              {proximas.primeras.map((a, i) => (
                <li key={a.inicio.toISOString()} className={cn(i > 0 && 'hidden sm:block')}>
                  {lineaActivacion(a, i)}
                </li>
              ))}
            </ul>
          )}
          {proximas.total == null ? (
            proximas.primeras.length > 0 && <p className="hidden text-[13px] leading-[18px] text-fg-secondary sm:block">{t('horario.sinFin')}</p>
          ) : proximas.total > proximas.primeras.length && proximas.ultima ? (
            <p className="hidden text-[13px] leading-[18px] text-fg-secondary sm:block">
              {t('horario.masUltima', {
                n: proximas.total - proximas.primeras.length,
                fecha: sinAnio(proximas.ultima.fin).fecha,
                hora: sinAnio(proximas.ultima.fin).hora,
              })}
            </p>
          ) : null}
        </div>
      )}
    </div>
  );
}

function SelectorDia({
  etiquetaId,
  valor,
  dias,
  invalido,
  placeholder,
  onValorChange,
}: {
  etiquetaId: string;
  valor: WeekDay | '';
  dias: readonly DiaPromocion[];
  invalido: boolean;
  placeholder: string;
  onValorChange: (dia: WeekDay) => void;
}) {
  return (
    <Select value={valor || undefined} onValueChange={(v) => onValorChange(v as WeekDay)}>
      <SelectTrigger aria-labelledby={etiquetaId} aria-invalid={invalido || undefined} className={cn(invalido && 'border-danger')}>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        {dias.map((d) => (
          <SelectItem key={d.value} value={d.value}>{d.largo}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
