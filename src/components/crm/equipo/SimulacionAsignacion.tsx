'use client';

/**
 * «Probar la asignación» (Figma CRM 1412:837868): a quién le llegaría un lead
 * con estos datos, con la estrategia y el equipo configurados (o los que se
 * elijan), sin asignar nada. Lo decide el servidor con el MISMO motor que la
 * asignación real (`POST /api/crm/assignment/simulate`).
 */

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { FlaskConical, Loader2 } from 'lucide-react';
import { Tarjeta } from '@/components/kit/Tarjeta';
import { FormField } from '@/components/kit/FormField';
import { AvisoTonal } from '@/components/kit/AvisoTonal';
import { clasesBoton } from '@/components/kit/botonClases';
import { SelectCrm } from '@/components/crm/kit/SelectCrm';
import { CLASE_CAMPO } from '@/components/crm/kit/camposCrm';
import { pedirCrm, ErrorApiCrm } from '@/components/crm/acciones/apiCrm';
import { cuerpoSimulacion, ESTRATEGIAS, type DatosSimulacion } from './simulacionLogica';

interface Resultado { userId: string; nombre: string | null; motivo: string; strategy: string; activa: boolean }

export function SimulacionAsignacion({ equipos }: { equipos: { id: string; name: string }[] }) {
  const t = useTranslations('crm.equipoAsignacion.simulacion');
  const [datos, setDatos] = useState<DatosSimulacion>({ strategy: '', team_id: '', city: '', company_size: '', branches_count: '', lifecycle_stage: '', current_software: '' });
  const [resultado, setResultado] = useState<Resultado | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [probando, setProbando] = useState(false);
  const cambiar = (k: keyof DatosSimulacion) => (v: string) => setDatos((d) => ({ ...d, [k]: v }));

  const probar = async () => {
    setProbando(true);
    setError(null);
    try {
      setResultado((await pedirCrm<Resultado>('/api/crm/assignment/simulate', { method: 'POST', cuerpo: cuerpoSimulacion(datos) })).data);
    } catch (e) {
      setResultado(null);
      const status = e instanceof ErrorApiCrm ? e.status : 0;
      setError(t(status === 403 ? 'errores.sinPermiso' : status === 409 ? 'errores.sinAsignacion' : status === 400 ? 'errores.datos' : 'errores.generico'));
    } finally {
      setProbando(false);
    }
  };

  return (
    <Tarjeta titulo={t('titulo')} descripcion={t('descripcion')} icono={FlaskConical}>
      <div className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <FormField etiqueta={t('estrategia')}>
            {(c) => <SelectCrm id={c.id} aria-labelledby={c.idEtiqueta} valor={datos.strategy} onValorChange={cambiar('strategy')} opcionVacia={t('laConfigurada')} opciones={ESTRATEGIAS.map((s) => ({ valor: s, etiqueta: t(`estrategias.${s}`) }))} />}
          </FormField>
          <FormField etiqueta={t('equipo')}>
            {(c) => <SelectCrm id={c.id} aria-labelledby={c.idEtiqueta} valor={datos.team_id} onValorChange={cambiar('team_id')} opcionVacia={t('elConfigurado')} opciones={equipos.map((e) => ({ valor: e.id, etiqueta: e.name }))} />}
          </FormField>
          <FormField etiqueta={t('ciudad')}>
            <input className={CLASE_CAMPO} value={datos.city} maxLength={200} onChange={(e) => cambiar('city')(e.target.value)} />
          </FormField>
          <FormField etiqueta={t('tamano')}>
            <input className={CLASE_CAMPO} value={datos.company_size} maxLength={200} onChange={(e) => cambiar('company_size')(e.target.value)} />
          </FormField>
          <FormField etiqueta={t('sucursales')}>
            <input className={CLASE_CAMPO} inputMode="numeric" value={datos.branches_count} onChange={(e) => cambiar('branches_count')(e.target.value.replace(/\D/g, ''))} />
          </FormField>
          <FormField etiqueta={t('etapa')}>
            <input className={CLASE_CAMPO} value={datos.lifecycle_stage} maxLength={200} onChange={(e) => cambiar('lifecycle_stage')(e.target.value)} />
          </FormField>
          <FormField etiqueta={t('software')}>
            <input className={CLASE_CAMPO} value={datos.current_software} maxLength={200} onChange={(e) => cambiar('current_software')(e.target.value)} />
          </FormField>
        </div>
        <button type="button" className={clasesBoton({ variante: 'secundario' })} onClick={() => void probar()} disabled={probando}>
          {probando ? <Loader2 aria-hidden="true" className="size-4 animate-spin" /> : <FlaskConical aria-hidden="true" className="size-4" strokeWidth={1.5} />}
          {t('probar')}
        </button>
        <div aria-live="polite">
          {resultado && (
            <AvisoTonal
              tono="exito"
              compacto
              titulo={t('resultado', { nombre: resultado.nombre ?? t('sinNombre') })}
              descripcion={`${t(`estrategias.${resultado.strategy}`)} · ${resultado.motivo}${resultado.activa ? '' : ` · ${t('apagada')}`}`}
            />
          )}
          {error && <AvisoTonal tono="advertencia" compacto titulo={error} />}
        </div>
      </div>
    </Tarjeta>
  );
}
