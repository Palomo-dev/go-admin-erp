'use client';

import { useCallback, useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { AvisoTonal, Dialogo, FormField, Skeleton } from '@/components/kit';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { agregarMonedaOrganizacion, listarMonedasDisponibles, type MonedaCatalogo } from '@/lib/services/monedasTasasService';
import { mensajeErrorMoneda } from './erroresMonedas';

export interface DialogoAgregarMonedaProps {
  abierto: boolean;
  onAbiertoChange: (abierto: boolean) => void;
  organizationId: number;
  /** Moneda base de la organización (no cambia al agregar). */
  base: string;
  onAgregada: (codigo: string) => void;
}

type ModoTasa = 'automatica' | 'manual';

/**
 * M3 · «Agregar moneda» (captura 82-finanzas-r2-15). Reemplaza el buscador +
 * select de «Agregar Nueva Moneda»: las mismas RPC (`get_currency_templates`
 * para las que la organización aún no tiene, `add_organization_currency` con
 * permiso resuelto en la base). «Tasa» es `auto_update` de la moneda en la
 * organización.
 */
export default function DialogoAgregarMoneda({ abierto, onAbiertoChange, organizationId, base, onAgregada }: DialogoAgregarMonedaProps) {
  const t = useTranslations('finanzasMonedasR2.agregar');
  const tSeg = useTranslations('monedasSeguridad');
  const [disponibles, setDisponibles] = useState<MonedaCatalogo[]>([]);
  const [estado, setEstado] = useState<'cargando' | 'listo' | 'error'>('cargando');
  const [moneda, setMoneda] = useState<string | null>(null);
  const [modo, setModo] = useState<ModoTasa>('automatica');
  const [intento, setIntento] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [errorServidor, setErrorServidor] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    setEstado('cargando');
    try {
      setDisponibles(await listarMonedasDisponibles(organizationId));
      setEstado('listo');
    } catch (error) {
      console.error('Agregar moneda: no se pudo leer el catálogo', error);
      setEstado('error');
    }
  }, [organizationId]);

  useEffect(() => {
    if (!abierto) return;
    setMoneda(null);
    setModo('automatica');
    setIntento(false);
    setErrorServidor(null);
    cargar();
  }, [abierto, cargar]);

  async function agregar() {
    setIntento(true);
    setErrorServidor(null);
    if (!moneda) return;
    setGuardando(true);
    try {
      await agregarMonedaOrganizacion(organizationId, moneda, modo === 'automatica');
      toast.success(t('agregada', { moneda }));
      onAgregada(moneda);
      onAbiertoChange(false);
    } catch (error) {
      setErrorServidor(mensajeErrorMoneda(error, tSeg));
    } finally {
      setGuardando(false);
    }
  }

  const sinOpciones = estado === 'listo' && disponibles.length === 0;

  return (
    <Dialogo
      abierto={abierto}
      onAbiertoChange={onAbiertoChange}
      titulo={t('titulo')}
      descripcion={t('subtitulo')}
      ancho={520}
      primario={{
        etiqueta: t('confirmar'),
        onClick: agregar,
        cargando: guardando,
        deshabilitada: estado !== 'listo' || sinOpciones,
        motivo: sinOpciones ? t('todas') : undefined,
      }}
    >
      {estado === 'cargando' && (
        <div className="flex flex-col gap-3" aria-busy="true">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
        </div>
      )}
      {estado === 'error' && (
        <AvisoTonal tono="peligro" rol="alert" titulo={t('errorCarga')} accion={{ etiqueta: t('reintentar'), onClick: cargar }} />
      )}
      {sinOpciones && <AvisoTonal tono="informacion" titulo={t('todas')} />}
      {estado === 'listo' && !sinOpciones && (
        <>
          <FormField etiqueta={t('moneda')} obligatorio error={intento && !moneda ? t('monedaRequerida') : null}>
            {(campo) => (
              <Select value={moneda ?? ''} onValueChange={setMoneda}>
                <SelectTrigger id={campo.id} aria-describedby={campo['aria-describedby']} aria-invalid={campo['aria-invalid']}>
                  <SelectValue placeholder={t('monedaPlaceholder')} />
                </SelectTrigger>
                <SelectContent>
                  {disponibles.map((m) => (
                    <SelectItem key={m.code} value={m.code}>
                      {t('opcion', { codigo: m.code, nombre: m.name })}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </FormField>
          <FormField etiqueta={t('tasa')} obligatorio ayuda={t('tasaAyuda')}>
            {(campo) => (
              <Select value={modo} onValueChange={(v) => setModo(v as ModoTasa)}>
                <SelectTrigger id={campo.id} aria-describedby={campo['aria-describedby']}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="automatica">{t('tasaAutomatica')}</SelectItem>
                  <SelectItem value="manual">{t('tasaManual')}</SelectItem>
                </SelectContent>
              </Select>
            )}
          </FormField>
          <AvisoTonal
            tono="informacion"
            titulo={t('baseTitulo', { base })}
            descripcion={moneda ? t('baseDescripcion', { moneda, base }) : t('baseDescripcionSinMoneda', { base })}
          />
        </>
      )}
      {errorServidor && <AvisoTonal tono="peligro" rol="alert" titulo={errorServidor} />}
    </Dialogo>
  );
}
