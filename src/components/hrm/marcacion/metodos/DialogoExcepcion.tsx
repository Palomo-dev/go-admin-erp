'use client';

/**
 * «Nueva excepción temporal» (Figma 20.27.11): habilita otro método a una
 * persona por unas fechas de la sede (máximo 90 días). Nace pendiente y la
 * aprueba otra persona de RR. HH. en Aprobaciones; nunca uno mismo.
 *
 * La lista de personas sale de `GET /api/hrm/empleados` (el servidor decide si
 * son todas o solo el equipo), filtrada a las vigentes de la sede.
 */
import { useEffect, useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { CalendarCheck } from 'lucide-react';
import { AvisoTonal, CampoFecha, FormField, PanelAdaptable, clasesBoton } from '@/components/kit';
import { Input } from '@/components/ui/input';
import { SearchSelect } from '@/components/ui/search-select';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { addPlainDays } from '@/lib/utils/dateCore';
import { MAX_DIAS_EXCEPCION } from '@/lib/hrm/marcacion/metodos';
import { ErrorEstructura, pedir } from '../../estructura/comun';
import { useEmpleadosVigentes } from '../../ausencias/SelectorPersona';
import { METODOS_EXCEPCION, errorLocalExcepcion, errorServidorExcepcion, type CampoExcepcion } from './metodosVista';

export interface DialogoExcepcionProps {
  abierto: boolean;
  onAbiertoChange: (abierto: boolean) => void;
  /** Sede de la vista: solo se ofrecen sus personas. */
  sedeId: number;
  /** Hoy en la zona de la organización (`YYYY-MM-DD`). */
  hoy: string;
  onEnviada?: () => void;
}

export function DialogoExcepcion({ abierto, onAbiertoChange, sedeId, hoy, onEnviada }: DialogoExcepcionProps) {
  const t = useTranslations('hrmMarcacionMetodos.excepcion');
  const tm = useTranslations('hrmMarcacionMetodos.metodos');
  const empleados = useEmpleadosVigentes(abierto);
  const [vinculo, setVinculo] = useState('');
  const [metodo, setMetodo] = useState('');
  const [desde, setDesde] = useState(hoy);
  const [hasta, setHasta] = useState('');
  const [motivo, setMotivo] = useState('');
  const [errores, setErrores] = useState<Partial<Record<CampoExcepcion, string>>>({});
  const [enviando, setEnviando] = useState(false);

  useEffect(() => {
    if (!abierto) return;
    setVinculo('');
    setMetodo('');
    setDesde(hoy);
    setHasta('');
    setMotivo('');
    setErrores({});
  }, [abierto, hoy]);

  const opciones = useMemo(
    () =>
      (empleados ?? [])
        .filter((e) => e.sede_id === sedeId)
        .map((e) => ({
          value: e.vinculo_id,
          label: e.nombre ?? '—',
          sublabel: [e.cargo, e.area].filter(Boolean).join(' · ') || undefined,
        })),
    [empleados, sedeId]
  );

  const maxHasta = desde ? addPlainDays(desde, MAX_DIAS_EXCEPCION) : null;

  const enviar = async () => {
    const datos = { vinculoId: vinculo, metodo, desde, hasta, motivo };
    const local = errorLocalExcepcion(datos, hoy);
    if (local) {
      setErrores({ [local.campo]: t(`errores.${local.clave}`) });
      return;
    }
    setErrores({});
    setEnviando(true);
    try {
      await pedir('/api/hrm/marcacion/excepciones', {
        metodo: 'POST',
        cuerpo: { vinculo_id: vinculo, metodo, desde, hasta, motivo: motivo.trim() },
      });
      toast.success(t('enviada'), { description: t('enviadaDetalle') });
      onAbiertoChange(false);
      onEnviada?.();
    } catch (err) {
      const r = errorServidorExcepcion(err instanceof ErrorEstructura ? err.codigo : 'error_hrm');
      if (r.campo) setErrores({ [r.campo]: t(`errores.${r.clave}`) });
      else toast.error(t(`errores.${r.clave}`));
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
      icono={CalendarCheck}
      titulo={t('titulo')}
      descripcion={t('descripcion')}
      pie={
        <div className="flex w-full flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button type="button" className={clasesBoton({ variante: 'secundario' })} onClick={() => onAbiertoChange(false)} disabled={enviando}>
            {t('cancelar')}
          </button>
          <button
            type="button"
            className={clasesBoton({ variante: 'primario' })}
            onClick={() => void enviar()}
            disabled={enviando}
            aria-busy={enviando || undefined}
          >
            {t('enviar')}
          </button>
        </div>
      }
    >
      <div className="flex flex-col gap-4">
        <FormField etiqueta={t('persona')} obligatorio error={errores.persona}>
          {(c) => (
            <SearchSelect
              id={c.id}
              options={opciones}
              value={vinculo}
              onValueChange={setVinculo}
              placeholder={empleados === null ? t('cargandoPersonas') : t('elegirPersona')}
              searchPlaceholder={t('buscarPersona')}
              emptyText={t('sinPersonas')}
              disabled={empleados === null}
              aria-invalid={!!errores.persona}
              aria-describedby={c['aria-describedby']}
            />
          )}
        </FormField>
        <FormField etiqueta={t('metodo')} obligatorio error={errores.metodo}>
          {(c) => (
            <Select value={metodo} onValueChange={setMetodo}>
              <SelectTrigger id={c.id} aria-labelledby={c.idEtiqueta} aria-invalid={!!errores.metodo} className="h-10 border-line-strong bg-surface">
                <SelectValue placeholder={t('elegirMetodo')} />
              </SelectTrigger>
              <SelectContent>
                {METODOS_EXCEPCION.map((m) => (
                  <SelectItem key={m.metodo} value={m.metodo} disabled={!m.disponible}>
                    {m.disponible ? tm(`${m.metodo}.corto`) : t('metodoNoDisponible', { metodo: tm(`${m.metodo}.corto`) })}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </FormField>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <FormField etiqueta={t('desde')} obligatorio error={errores.desde}>
            {(c) => (
              <CampoFecha
                id={c.id}
                aria-labelledby={c.idEtiqueta}
                valor={desde}
                hoy={hoy}
                min={hoy}
                onValorChange={(d) => {
                  setDesde(d);
                  if (hasta && (hasta < d || hasta > addPlainDays(d, MAX_DIAS_EXCEPCION))) setHasta('');
                }}
                required
              />
            )}
          </FormField>
          <FormField etiqueta={t('hasta')} obligatorio ayuda={t('maximo', { dias: MAX_DIAS_EXCEPCION })} error={errores.hasta}>
            {(c) => (
              <CampoFecha
                id={c.id}
                aria-labelledby={c.idEtiqueta}
                aria-invalid={!!errores.hasta}
                valor={hasta}
                hoy={hoy}
                min={desde || hoy}
                max={maxHasta}
                onValorChange={setHasta}
                placeholder={t('elegirFecha')}
                required
              />
            )}
          </FormField>
        </div>
        <FormField etiqueta={t('motivo')} obligatorio error={errores.motivo}>
          {(c) => (
            <Input
              id={c.id}
              aria-describedby={c['aria-describedby']}
              aria-invalid={!!errores.motivo}
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              maxLength={500}
              placeholder={t('motivoEjemplo')}
              className="h-10 border-line-strong"
            />
          )}
        </FormField>
        <AvisoTonal tono="informacion" titulo={t('avisoTitulo')} descripcion={t('avisoDetalle')} />
      </div>
    </PanelAdaptable>
  );
}
