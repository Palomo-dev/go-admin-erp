'use client';

/**
 * «Nueva propina», «Reasignar persona» y «Corregir importe» (menú ⋯ de una
 * propina, Figma `1087:716181`). Escriben con `PropinasService` (RLS:
 * `pos.create`); la guarda de la tabla rechaza tocar una propina liquidada o
 * anulada, y cambiar el importe de una que ya tiene asiento (se anula y se
 * registra otra). Corregir el importe exige motivo, que queda en las notas.
 */
import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { HandCoins, Pencil, UserCheck } from 'lucide-react';
import { CampoNumero, Dialogo, FormField } from '@/components/kit';
import { simboloMoneda } from '@/components/kit/documento/documentoLineasLogica';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';
import { useMonedaOrganizacion } from '@/lib/hooks/useOrgCurrency';
import { codigoErrorPropina } from '@/lib/pos/propinas/errores';
import type { FilaPropina } from '@/lib/pos/propinas/tiposPropinas';
import { PropinasService } from './propinasService';
import { TIP_TYPES_FORMULARIO, type Mesero, type TipType } from './types';

export type ModoFormularioPropina = 'nueva' | 'reasignar' | 'corregir';

export interface PropinaFormDialogProps {
  modo: ModoFormularioPropina | null;
  propina?: FilaPropina | null;
  meseros: readonly Mesero[];
  sucursalId: number | null;
  onAbiertoChange: (abierto: boolean) => void;
  onGuardada: () => void;
}

export function PropinaFormDialog({ modo, propina, meseros, sucursalId, onAbiertoChange, onGuardada }: PropinaFormDialogProps) {
  const t = useTranslations('posPropinas');
  const moneda = useMonedaOrganizacion();
  const [persona, setPersona] = useState('');
  const [monto, setMonto] = useState<number | null>(null);
  const [tipo, setTipo] = useState<TipType>('cash');
  const [notas, setNotas] = useState('');
  const [motivo, setMotivo] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [intentado, setIntentado] = useState(false);

  useEffect(() => {
    if (!modo) return;
    // Sin persona preseleccionada: elegirla es parte del registro.
    setPersona(modo === 'nueva' ? '' : (propina?.persona.id ?? ''));
    setMonto(modo === 'nueva' ? null : (propina?.monto ?? null));
    setTipo('cash');
    setNotas('');
    setMotivo('');
    setIntentado(false);
  }, [modo, propina]);

  const errores = {
    persona: (modo === 'nueva' || modo === 'reasignar') && !persona ? t('formulario.errores.mesero') : null,
    monto: (modo === 'nueva' || modo === 'corregir') && !(monto && monto > 0) ? t('formulario.errores.monto') : null,
    motivo: modo === 'corregir' && motivo.trim().length < 3 ? t('formularioV2.motivoRequerido') : null,
  };
  const valido = !errores.persona && !errores.monto && !errores.motivo;

  const guardar = async () => {
    setIntentado(true);
    if (!valido || !modo) return;
    setGuardando(true);
    try {
      if (modo === 'nueva') {
        await PropinasService.create({
          server_id: persona,
          amount: monto ?? 0,
          tip_type: tipo,
          notes: notas.trim() || undefined,
          branch_id: sucursalId ?? undefined,
        });
        toast.success(t('toast.registrada'));
      } else if (propina && modo === 'reasignar') {
        await PropinasService.update(propina.id, { server_id: persona });
        toast.success(t('toast.reasignada'));
      } else if (propina && modo === 'corregir') {
        const nota = t('formularioV2.notaCorreccion', { antes: moneda.formatear(propina.monto), motivo: motivo.trim() });
        await PropinasService.update(propina.id, { amount: monto ?? 0, notes: [propina.notas, nota].filter(Boolean).join('\n') });
        toast.success(t('toast.actualizada'));
      }
      onGuardada();
      onAbiertoChange(false);
    } catch (e) {
      toast.error(t(`errores.${codigoErrorPropina(e)}`));
    } finally {
      setGuardando(false);
    }
  };

  const titulo =
    modo === 'reasignar' ? t('formularioV2.tituloReasignar') : modo === 'corregir' ? t('formularioV2.tituloCorregir') : t('formularioV2.tituloNueva');
  const icono = modo === 'reasignar' ? UserCheck : modo === 'corregir' ? Pencil : HandCoins;

  return (
    <Dialogo
      abierto={modo !== null}
      onAbiertoChange={onAbiertoChange}
      titulo={titulo}
      icono={icono}
      descripcion={propina && modo !== 'nueva' ? t('formularioV2.descripcion', { monto: moneda.formatear(propina.monto), persona: propina.persona.nombre ?? t('sinNombre') }) : undefined}
      ancho={520}
      primario={{
        etiqueta: modo === 'nueva' ? t('formulario.registrar') : t('formularioV2.guardar'),
        onClick: () => void guardar(),
        cargando: guardando,
      }}
    >
      <div className="flex flex-col gap-4">
        {(modo === 'nueva' || modo === 'reasignar') && (
          <FormField etiqueta={t('formularioV2.persona')} obligatorio error={intentado ? errores.persona : null}>
            {(c) => (
              <Select value={persona} onValueChange={setPersona}>
                <SelectTrigger id={c.id} aria-labelledby={c.idEtiqueta} aria-describedby={c['aria-describedby']} className="h-10 border-line-strong bg-surface">
                  <SelectValue placeholder={t('formulario.seleccionarMesero')} />
                </SelectTrigger>
                <SelectContent>
                  {meseros.map((m) => (
                    <SelectItem key={m.id} value={m.id}>
                      {m.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </FormField>
        )}
        {(modo === 'nueva' || modo === 'corregir') && (
          <FormField etiqueta={t('formulario.monto')} obligatorio error={intentado ? errores.monto : null}>
            {(c) => (
              <CampoNumero
                id={c.id}
                aria-describedby={c['aria-describedby']}
                valor={monto}
                onValorChange={setMonto}
                minimo={0}
                decimales={2}
                prefijo={simboloMoneda(moneda)}
              />
            )}
          </FormField>
        )}
        {modo === 'nueva' && (
          <FormField etiqueta={t('formulario.tipo')}>
            {(c) => (
              <Select value={tipo} onValueChange={(v) => setTipo(v as TipType)}>
                <SelectTrigger id={c.id} aria-labelledby={c.idEtiqueta} className="h-10 border-line-strong bg-surface">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TIP_TYPES_FORMULARIO.map((x) => (
                    <SelectItem key={x} value={x}>
                      {t(`tipos.${x}`)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </FormField>
        )}
        {modo === 'nueva' && (
          <FormField etiqueta={t('formulario.notas')}>
            {(c) => <Textarea id={c.id} value={notas} maxLength={500} onChange={(e) => setNotas(e.target.value)} placeholder={t('formulario.notasPlaceholder')} />}
          </FormField>
        )}
        {modo === 'corregir' && (
          <FormField etiqueta={t('formularioV2.motivo')} obligatorio error={intentado ? errores.motivo : null} ayuda={t('formularioV2.motivoAyuda')}>
            {(c) => (
              <Input id={c.id} aria-describedby={c['aria-describedby']} value={motivo} maxLength={300} onChange={(e) => setMotivo(e.target.value)} className="h-10 border-line-strong bg-surface" />
            )}
          </FormField>
        )}
      </div>
    </Dialogo>
  );
}
