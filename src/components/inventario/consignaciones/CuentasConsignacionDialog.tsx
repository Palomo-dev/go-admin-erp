'use client';

/**
 * Cuentas y retenciones de consignación de la organización.
 * - Ronda 2 del Contador, punto 1: la subcuenta 911520 (o su auxiliar), la
 *   contrapartida DEFINIDA del grupo 94 (nunca 9905; sin ella no se recibe nada) y
 *   el auxiliar de 8 dígitos bajo 413512 para la remuneración. Cada una debe existir
 *   en el plan de cuentas y ser de movimiento (`fn_consignacion_configurar_cuentas`).
 * - Ronda 3, punto 2: qué regla de retención CONFIGURADA (la misma de compras) aplica
 *   a la OPERACIÓN y a la REMUNERACIÓN, por clase. Sin regla elegida, la liquidación
 *   deja esa retención pendiente, nunca en 0 (`fn_consignacion_configurar_retenciones`).
 */
import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Settings2 } from 'lucide-react';
import { Dialogo, FormField } from '@/components/kit';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toastSuccess } from '@/components/ui/use-toast';
import { textoErrorSaldo } from '@/components/finanzas/saldos-a-favor/textosSaldo';
import { ORDEN_CLASES, type AmbitoRetencion, type ClaseRetencion, type ReglasRetencionConsignacion } from '@/lib/inventario/consignaciones/recibidas';
import { consignacionesRecibidasService } from './consignacionesRecibidasService';

const NS = 'consignacionesR4';
const SIN_REGLA = '__sin_regla__';
const AMBITOS: readonly AmbitoRetencion[] = ['operacion', 'remuneracion'];

export interface CuentasConsignacion {
  orden: string | null;
  contra: string | null;
  remuneracion: string | null;
}

interface Props {
  abierto: boolean;
  onAbiertoChange: (v: boolean) => void;
  actuales: CuentasConsignacion | null;
  onGuardadas: () => void;
}

type Disponible = { id: string; nombre: string; tarifa: number; clase: ClaseRetencion | null };

export function CuentasConsignacionDialog({ abierto, onAbiertoChange, actuales, onGuardadas }: Props) {
  const t = useTranslations(NS);
  const [orden, setOrden] = useState('');
  const [contra, setContra] = useState('');
  const [remuneracion, setRemuneracion] = useState('');
  const [reglas, setReglas] = useState<ReglasRetencionConsignacion>({ operacion: {}, remuneracion: {} });
  const [disponibles, setDisponibles] = useState<Disponible[]>([]);
  const [reglasIniciales, setReglasIniciales] = useState('');
  const [tocado, setTocado] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!abierto) return;
    setOrden(actuales?.orden ?? '');
    setContra(actuales?.contra ?? '');
    setRemuneracion(actuales?.remuneracion ?? '');
    setTocado(false);
    setError(null);
    let vigente = true;
    consignacionesRecibidasService
      .retenciones()
      .then((r) => {
        if (!vigente || r.pendiente) return;
        setReglas(r.reglas);
        setReglasIniciales(JSON.stringify(r.reglas));
        setDisponibles(r.disponibles);
      })
      .catch(() => undefined);
    return () => {
      vigente = false;
    };
  }, [abierto, actuales]);

  const errores = {
    orden: orden.trim() !== '' && !/^911520(\d{2})?$/.test(orden.trim()) ? t('cuentas.validacion.orden') : null,
    contra: !/^94\d{2,6}$/.test(contra.trim()) ? t('cuentas.validacion.contra') : null,
    remuneracion: remuneracion.trim() !== '' && !/^413512\d{2}$/.test(remuneracion.trim()) ? t('cuentas.validacion.remuneracion') : null,
  };
  const hayErrores = Object.values(errores).some(Boolean);
  const fijarRegla = (ambito: AmbitoRetencion, clase: ClaseRetencion, id: string) =>
    setReglas((r) => ({ ...r, [ambito]: { ...r[ambito], [clase]: id === SIN_REGLA ? null : id } }));

  const guardar = async () => {
    setTocado(true);
    if (hayErrores) return;
    setEnviando(true);
    setError(null);
    try {
      await consignacionesRecibidasService.configurarCuentas({
        orden: orden.trim() || null,
        contra: contra.trim(),
        remuneracion: remuneracion.trim() || null,
      });
      if (JSON.stringify(reglas) !== reglasIniciales) await consignacionesRecibidasService.configurarRetenciones(reglas);
      toastSuccess(t('cuentas.exito'));
      onAbiertoChange(false);
      onGuardadas();
    } catch (e) {
      setError(textoErrorSaldo(t, e));
    } finally {
      setEnviando(false);
    }
  };

  return (
    <Dialogo
      abierto={abierto}
      onAbiertoChange={(v) => !enviando && onAbiertoChange(v)}
      titulo={t('cuentas.titulo')}
      descripcion={t('cuentas.descripcion')}
      icono={Settings2}
      ancho={672}
      primario={{ etiqueta: t('cuentas.guardar'), onClick: () => void guardar(), cargando: enviando }}
    >
      <div className="flex flex-col gap-4">
        <FormField etiqueta={t('cuentas.contra')} obligatorio ayuda={t('cuentas.contraAyuda')} error={tocado ? errores.contra : null}>
          <Input value={contra} inputMode="numeric" maxLength={8} placeholder="94______" onChange={(e) => setContra(e.target.value)} />
        </FormField>
        <FormField etiqueta={t('cuentas.orden')} ayuda={t('cuentas.ordenAyuda')} error={tocado ? errores.orden : null}>
          <Input value={orden} inputMode="numeric" maxLength={8} placeholder="911520" onChange={(e) => setOrden(e.target.value)} />
        </FormField>
        <FormField etiqueta={t('cuentas.remuneracion')} ayuda={t('cuentas.remuneracionAyuda')} error={tocado ? errores.remuneracion : null}>
          <Input value={remuneracion} inputMode="numeric" maxLength={8} placeholder="413512__" onChange={(e) => setRemuneracion(e.target.value)} />
        </FormField>

        <fieldset className="flex flex-col gap-3 rounded-lg border border-line p-3 sm:p-4">
          <legend className="px-1 text-sm font-medium text-fg">{t('retenciones.configTitulo')}</legend>
          <p className="text-xs text-fg-muted">{t('retenciones.configDescripcion')}</p>
          {AMBITOS.map((ambito) => (
            <div key={ambito} className="flex flex-col gap-2">
              <p className="text-sm font-medium text-fg">{t(`retenciones.ambitos.${ambito}.titulo`)}</p>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                {ORDEN_CLASES.map((clase) => (
                  <FormField key={clase} etiqueta={t(`retenciones.clases.${clase}`)}>
                    {(c) => (
                      <Select value={reglas[ambito]?.[clase] ?? SIN_REGLA} onValueChange={(v) => fijarRegla(ambito, clase, v)}>
                        <SelectTrigger id={c.id} aria-labelledby={c.idEtiqueta} className="h-10 border-line-strong bg-surface">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value={SIN_REGLA}>{t('retenciones.sinRegla')}</SelectItem>
                          {disponibles
                            .filter((d) => d.clase === clase)
                            .map((d) => (
                              <SelectItem key={d.id} value={d.id}>
                                {d.nombre} · {d.tarifa} %
                              </SelectItem>
                            ))}
                        </SelectContent>
                      </Select>
                    )}
                  </FormField>
                ))}
              </div>
            </div>
          ))}
        </fieldset>

        {error && (
          <p role="alert" className="text-sm text-danger-text">
            {error}
          </p>
        )}
      </div>
    </Dialogo>
  );
}
