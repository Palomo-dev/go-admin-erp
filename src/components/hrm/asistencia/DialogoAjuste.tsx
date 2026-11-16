'use client';

/**
 * «Agregar ajuste» / «Registrar marca manual» (Figma 20.10.6; móvil: hoja con pie).
 * Toda corrección de una marca lleva motivo y pasa por aprobación (tipo
 * `novedad_asistencia`): nada se corrige en silencio. La hora se elige en la
 * zona de la sede y viaja como instante; la marca se agrega cuando se aprueba.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { CalendarCheck } from 'lucide-react';
import { AvisoTonal, CampoFecha, FormField, PanelAdaptable, SegmentedControl, clasesBoton } from '@/components/kit';
import { CampoHora } from '@/components/kit/CampoHora';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { addPlainDays, wallTimeToInstant } from '@/lib/utils/dateCore';
import { ErrorPersonas, pedir } from '../personas/apiPersonas';
import { horaDePared, useDias, useHora } from './comunAsistencia';

export interface PersonaAjuste {
  employment_id: string;
  nombre: string;
  entrada?: string | null;
  salida?: string | null;
  turno?: { inicio: string | null; fin?: string | null } | null;
}

type Marca = 'check_in' | 'check_out' | 'descanso';
type Descanso = 'break_start' | 'break_end';
const MOTIVOS = ['olvidoEntrada', 'olvidoSalida', 'fallaDispositivo', 'sinSenal', 'fueraDeSede', 'otro'] as const;

interface Aprobador {
  tipo: string | null;
  nombres: string[];
}

export function DialogoAjuste({
  abierto,
  onAbiertoChange,
  zona,
  fecha: fechaInicial,
  personas,
  marcaInicial = 'check_out',
  editarFecha = false,
  hoy,
  onEnviado,
}: {
  abierto: boolean;
  onAbiertoChange: (abierto: boolean) => void;
  zona: string;
  fecha: string;
  personas: readonly PersonaAjuste[];
  marcaInicial?: Marca;
  /** Permite elegir el día (desde la cabecera de Hoy, un olvido de ayer). */
  editarFecha?: boolean;
  hoy?: string;
  onEnviado?: () => void;
}) {
  const t = useTranslations('hrmAsistencia.ajuste');
  const te = useTranslations('hrmAsistencia.errores');
  const dias = useDias();
  const hora = useHora(zona);
  const [vinculo, setVinculo] = useState<string>('');
  const [fecha, setFecha] = useState(fechaInicial);
  const [marca, setMarca] = useState<Marca>(marcaInicial);
  const [descanso, setDescanso] = useState<Descanso>('break_start');
  const [valor, setValor] = useState('');
  const [motivo, setMotivo] = useState<(typeof MOTIVOS)[number] | ''>('');
  const [nota, setNota] = useState('');
  const [errores, setErrores] = useState<Record<string, string>>({});
  const [enviando, setEnviando] = useState(false);
  const [aprobador, setAprobador] = useState<Aprobador | null>(null);

  // Se reinicia al abrir (o si cambian la persona o el día), no en cada render del padre.
  const personasRef = useRef(personas);
  personasRef.current = personas;
  const clavePersonas = personas.map((p) => p.employment_id).join(',');
  useEffect(() => {
    if (!abierto) return;
    const lista = personasRef.current;
    setVinculo(lista.length === 1 ? lista[0].employment_id : '');
    setFecha(fechaInicial);
    setMarca(marcaInicial);
    setDescanso('break_start');
    setValor('');
    setMotivo('');
    setNota('');
    setErrores({});
  }, [abierto, clavePersonas, fechaInicial, marcaInicial]);

  const persona = useMemo(() => personas.find((p) => p.employment_id === vinculo) ?? null, [personas, vinculo]);
  const tipo = marca === 'descanso' ? descanso : marca;
  const marcoAntes = marca === 'check_in' ? persona?.entrada : marca === 'check_out' ? persona?.salida : null;
  const valorHora = valor || (marcoAntes ? horaDePared(marcoAntes, zona) : '');

  useEffect(() => {
    if (!abierto || !vinculo) {
      setAprobador(null);
      return;
    }
    let vigente = true;
    pedir<Aprobador>(`/api/hrm/asistencia/ajustes?vinculo=${vinculo}`)
      .then((a) => vigente && setAprobador(a))
      .catch(() => vigente && setAprobador(null));
    return () => {
      vigente = false;
    };
  }, [abierto, vinculo]);

  const textoAprobador = !aprobador
    ? null
    : aprobador.nombres.length === 0
      ? null
      : aprobador.tipo === 'jefe_directo'
        ? t('apruebaJefe', { nombre: aprobador.nombres.join(', ') })
        : t('apruebaOtro', { nombre: aprobador.nombres.join(', ') });

  /** Instante de la marca: una salida antes de la entrada (turno nocturno) es del día siguiente. */
  const instante = (): string | null => {
    if (!valorHora) return null;
    let d = wallTimeToInstant(fecha, valorHora, zona);
    const referencia = persona?.entrada ?? persona?.turno?.inicio ?? null;
    if (tipo !== 'check_in' && referencia && d.getTime() < new Date(referencia).getTime()) {
      d = wallTimeToInstant(addPlainDays(fecha, 1), valorHora, zona);
    }
    return d.toISOString();
  };

  const enviar = async () => {
    const e: Record<string, string> = {};
    if (!vinculo) e.persona = t('errorPersona');
    if (!valorHora) e.hora = t('errorHora');
    if (!motivo) e.motivo = t('errorMotivo');
    setErrores(e);
    if (Object.keys(e).length > 0) return;
    const iso = instante();
    if (!iso) return;
    setEnviando(true);
    try {
      await pedir('/api/hrm/asistencia/ajustes', {
        metodo: 'POST',
        cuerpo: {
          vinculo_id: vinculo,
          fecha,
          tipo,
          hora: iso,
          motivo: t(`motivos.${motivo}`),
          nota: nota.trim() || undefined,
        },
      });
      toast.success(t('enviado'), {
        description: textoAprobador ?? t('enviadoSinAprobador'),
      });
      onAbiertoChange(false);
      onEnviado?.();
    } catch (err) {
      const c = err instanceof ErrorPersonas ? err.codigo : 'error_hrm';
      if (c === 'hora_invalida') setErrores({ hora: t('errorHoraFuera') });
      else
        toast.error(
          c === 'duplicado'
            ? te('ajusteYaPendiente')
            : c === 'jornada_cerrada'
              ? te('jornadaCerrada')
              : c === 'sin_permiso'
                ? te('sinPermiso')
                : te('guardar')
        );
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
      titulo={personas.length === 1 ? t('titulo') : t('tituloRegistrar')}
      descripcion={persona ? `${persona.nombre} · ${dias.largo(fecha)}` : dias.largo(fecha)}
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
        {personas.length !== 1 && (
          <FormField etiqueta={t('persona')} obligatorio error={errores.persona}>
            {(c) => (
              <Select value={vinculo} onValueChange={setVinculo}>
                <SelectTrigger id={c.id} aria-labelledby={c.idEtiqueta} className="h-10 border-line-strong bg-surface">
                  <SelectValue placeholder={t('elegirPersona')} />
                </SelectTrigger>
                <SelectContent>
                  {personas.map((p) => (
                    <SelectItem key={p.employment_id} value={p.employment_id}>
                      {p.nombre}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </FormField>
        )}
        {editarFecha && (
          <FormField etiqueta={t('dia')} obligatorio>
            <CampoFecha valor={fecha} onValorChange={(d) => d && setFecha(d)} max={hoy ?? fechaInicial} required />
          </FormField>
        )}
        <SegmentedControl
          etiqueta={t('marca')}
          valor={marca}
          onValorChange={setMarca}
          opciones={[
            { valor: 'check_in', etiqueta: t('marcas.entrada') },
            { valor: 'check_out', etiqueta: t('marcas.salida') },
            { valor: 'descanso', etiqueta: t('marcas.descanso') },
          ]}
        />
        {marca === 'descanso' && (
          <SegmentedControl
            etiqueta={t('marcas.descanso')}
            tamano="sm"
            valor={descanso}
            onValorChange={setDescanso}
            opciones={[
              { valor: 'break_start', etiqueta: t('marcas.inicioDescanso') },
              { valor: 'break_end', etiqueta: t('marcas.finDescanso') },
            ]}
          />
        )}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <FormField etiqueta={t('marco')}>
            <Input
              readOnly
              value={marcoAntes ? hora(marcoAntes) : marca === 'check_in' ? t('sinEntrada') : marca === 'check_out' ? t('sinSalida') : '—'}
              className="h-10 border-line-strong bg-subtle"
            />
          </FormField>
          <FormField etiqueta={t('queda')} obligatorio error={errores.hora}>
            {(c) => (
              <CampoHora id={c.id} aria-labelledby={c.idEtiqueta} aria-invalid={!!errores.hora} valor={valorHora} onValorChange={setValor} paso={5} />
            )}
          </FormField>
        </div>
        <FormField etiqueta={t('motivo')} obligatorio error={errores.motivo}>
          {(c) => (
            <Select value={motivo} onValueChange={(v) => setMotivo(v as (typeof MOTIVOS)[number])}>
              <SelectTrigger id={c.id} aria-labelledby={c.idEtiqueta} aria-invalid={!!errores.motivo} className="h-10 border-line-strong bg-surface">
                <SelectValue placeholder={t('elegirMotivo')} />
              </SelectTrigger>
              <SelectContent>
                {MOTIVOS.map((m) => (
                  <SelectItem key={m} value={m}>
                    {t(`motivos.${m}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </FormField>
        <FormField etiqueta={t('comentario')}>
          <Input value={nota} onChange={(e) => setNota(e.target.value)} maxLength={500} className="h-10 border-line-strong" />
        </FormField>
        {vinculo && (
          <AvisoTonal
            tono={textoAprobador ? 'informacion' : 'advertencia'}
            titulo={textoAprobador ?? t('sinAprobador')}
            descripcion={textoAprobador ? t('apruebaDetalle') : t('sinAprobadorDetalle')}
          />
        )}
      </div>
    </PanelAdaptable>
  );
}
