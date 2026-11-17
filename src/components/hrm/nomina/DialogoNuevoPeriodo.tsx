'use client';

/**
 * Nuevo período (Figma 20.16.2): tipo (ordinaria, prima o cesantías — la prima va
 * en su propio período, decisión 6), periodicidad, fechas y fecha de pago. Lo crea
 * `fn_hr_nomina_periodo_crear` (`hr.payroll.process`), que valida cruces y estado.
 */
import { useEffect, useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { CalendarPlus } from 'lucide-react';
import { AvisoTonal, CampoFecha, Dialogo, FormField, SegmentedControl } from '@/components/kit';
import { Input } from '@/components/ui/input';
import { useFormatDate } from '@/lib/context/OrganizationTimezoneContext';
import { codigoDeError, crearPeriodo, rutaPeriodo } from './apiNomina';
import { siguientePeriodo, type FilaPeriodo, type Frecuencia, type TipoPeriodo } from './nominaLogica';
import { useErrorNomina, useNombrePeriodo } from './piezasNomina';

export function DialogoNuevoPeriodo({
  abierto,
  onAbiertoChange,
  periodos,
  tipoInicial = 'ordinaria',
}: {
  abierto: boolean;
  onAbiertoChange: (v: boolean) => void;
  periodos: readonly FilaPeriodo[];
  tipoInicial?: TipoPeriodo;
}) {
  const t = useTranslations('hrmNomina.nuevo');
  const router = useRouter();
  const { getToday } = useFormatDate();
  const nombrar = useNombrePeriodo();
  const mensajeError = useErrorNomina();
  const hoy = getToday();
  const ultimaOrdinaria = useMemo(() => periodos.find((p) => p.tipo === 'ordinaria') ?? null, [periodos]);
  const [tipo, setTipo] = useState<TipoPeriodo>(tipoInicial);
  const [frecuencia, setFrecuencia] = useState<Frecuencia>('biweekly');
  const [desde, setDesde] = useState('');
  const [hasta, setHasta] = useState('');
  const [pago, setPago] = useState('');
  const [nombre, setNombre] = useState('');
  const [nombreTocado, setNombreTocado] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Al abrir: el período siguiente al último de la misma periodicidad.
  useEffect(() => {
    if (!abierto) return;
    const f = ((['weekly', 'biweekly', 'monthly'] as const).find((x) => x === ultimaOrdinaria?.frecuencia) ?? 'biweekly') as Frecuencia;
    setTipo(tipoInicial);
    setFrecuencia(f);
    const s = siguientePeriodo(ultimaOrdinaria, f, hoy);
    setDesde(s.desde);
    setHasta(s.hasta);
    setPago(s.hasta);
    setNombreTocado(false);
    setError(null);
  }, [abierto, tipoInicial, ultimaOrdinaria, hoy]);

  const cambiarFrecuencia = (f: Frecuencia) => {
    setFrecuencia(f);
    const s = siguientePeriodo(ultimaOrdinaria, f, hoy);
    setDesde(s.desde);
    setHasta(s.hasta);
    setPago(s.hasta);
  };

  const sugerido = desde && hasta ? nombrar({ tipo, desde, hasta }) : '';
  useEffect(() => {
    if (!nombreTocado) setNombre(sugerido);
  }, [sugerido, nombreTocado]);

  const fechasMal = !!desde && !!hasta && hasta < desde;
  const valido = !!desde && !!hasta && !fechasMal;

  const guardar = async () => {
    if (!valido) return;
    setGuardando(true);
    setError(null);
    try {
      const r = await crearPeriodo({ tipo, frecuencia, desde, hasta, fecha_pago: pago || null, nombre: nombre.trim() || null });
      toast.success(t('creado'));
      onAbiertoChange(false);
      router.push(rutaPeriodo(r.id));
    } catch (e) {
      setError(mensajeError(codigoDeError(e)));
    } finally {
      setGuardando(false);
    }
  };

  return (
    <Dialogo
      abierto={abierto}
      onAbiertoChange={onAbiertoChange}
      titulo={t('titulo')}
      descripcion={t('descripcion')}
      icono={CalendarPlus}
      ancho={560}
      primario={{ etiqueta: t('crear'), onClick: () => void guardar(), cargando: guardando, deshabilitada: !valido, motivo: fechasMal ? t('fechasMal') : undefined }}
    >
      <div className="flex flex-col gap-4">
        <FormField etiqueta={t('tipo')} obligatorio>
          {(c) => (
            <SegmentedControl
              id={c.id}
              aria-labelledby={c.idEtiqueta}
              anchoCompleto
              valor={tipo}
              onValorChange={setTipo}
              opciones={[
                { valor: 'ordinaria', etiqueta: t('tipos.ordinaria') },
                { valor: 'prima', etiqueta: t('tipos.prima') },
                { valor: 'cesantias', etiqueta: t('tipos.cesantias') },
              ]}
            />
          )}
        </FormField>
        {tipo === 'ordinaria' ? (
          <FormField etiqueta={t('frecuencia')} obligatorio ayuda={t('frecuenciaAyuda')}>
            {(c) => (
              <SegmentedControl
                id={c.id}
                aria-labelledby={c.idEtiqueta}
                anchoCompleto
                valor={frecuencia}
                onValorChange={cambiarFrecuencia}
                opciones={[
                  { valor: 'biweekly', etiqueta: t('frecuencias.biweekly') },
                  { valor: 'monthly', etiqueta: t('frecuencias.monthly') },
                  { valor: 'weekly', etiqueta: t('frecuencias.weekly') },
                ]}
              />
            )}
          </FormField>
        ) : (
          <AvisoTonal tono="informacion" compacto titulo={t(tipo === 'prima' ? 'avisoPrima' : 'avisoCesantias')} />
        )}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <FormField etiqueta={t('desde')} obligatorio>
            {(c) => <CampoFecha id={c.id} aria-labelledby={c.idEtiqueta} valor={desde} onValorChange={setDesde} hoy={hoy} required />}
          </FormField>
          <FormField etiqueta={t('hasta')} obligatorio error={fechasMal ? t('fechasMal') : null}>
            {(c) => <CampoFecha id={c.id} aria-labelledby={c.idEtiqueta} valor={hasta} onValorChange={setHasta} min={desde || undefined} hoy={hoy} required />}
          </FormField>
        </div>
        <FormField etiqueta={t('fechaPago')} ayuda={t('fechaPagoAyuda')}>
          {(c) => <CampoFecha id={c.id} aria-labelledby={c.idEtiqueta} valor={pago} onValorChange={setPago} hoy={hoy} />}
        </FormField>
        <FormField etiqueta={t('nombre')} ayuda={t('nombreAyuda')}>
          {(c) => (
            <Input
              id={c.id}
              value={nombre}
              maxLength={120}
              onChange={(e) => {
                setNombre(e.target.value);
                setNombreTocado(true);
              }}
              className="h-10 border-line-strong bg-surface"
            />
          )}
        </FormField>
        {error ? <AvisoTonal tono="peligro" compacto rol="alert" titulo={error} /> : null}
      </div>
    </Dialogo>
  );
}
