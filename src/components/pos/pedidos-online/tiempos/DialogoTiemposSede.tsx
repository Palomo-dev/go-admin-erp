'use client';

/**
 * «Tiempos de <sede>» (Figma T3 3011:239316): interruptor «Usar los tiempos generales» y la
 * misma tabla de la pestaña. «Guardar» deja el cambio en el borrador de la pestaña; se guarda
 * de verdad con «Guardar cambios» de la barra del diálogo de Configuración.
 */
import * as React from 'react';
import { useTranslations } from 'next-intl';
import { Dialogo } from '@/components/kit';
import { Switch } from '@/components/ui/switch';
import { TablaTiempos } from './TablaTiempos';
import { cambiarTiempo, type TiemposCompletos } from './borradorTiempos';

interface Props {
  abierto: boolean;
  onAbiertoChange: (abierto: boolean) => void;
  sede: { id: number; nombre: string };
  generales: TiemposCompletos;
  /** Los propios de la sede, o null si usa los generales. */
  propios: TiemposCompletos | null;
  deshabilitado?: boolean;
  onGuardar: (propios: TiemposCompletos | null) => void;
}

export function DialogoTiemposSede({ abierto, onAbiertoChange, sede, generales, propios, deshabilitado, onGuardar }: Props) {
  const t = useTranslations('pedidosOnlineTiempos');
  const [usarGenerales, setUsarGenerales] = React.useState(!propios);
  const [valores, setValores] = React.useState<TiemposCompletos>(propios ?? generales);

  // Cada vez que se abre, arranca de lo que hay en el borrador.
  React.useEffect(() => {
    if (!abierto) return;
    setUsarGenerales(!propios);
    setValores(propios ?? generales);
  }, [abierto, propios, generales]);

  const idSwitch = `tiempos-sede-${sede.id}-generales`;
  return (
    <Dialogo
      abierto={abierto}
      onAbiertoChange={onAbiertoChange}
      titulo={t('dialogoSede.titulo', { sede: sede.nombre })}
      ancho={672}
      textoCancelar={t('dialogoSede.cancelar')}
      primario={{
        etiqueta: t('dialogoSede.guardar'),
        deshabilitada: deshabilitado,
        onClick: () => {
          onGuardar(usarGenerales ? null : valores);
          onAbiertoChange(false);
        },
      }}
    >
      <div className="flex items-center justify-between gap-4 border-b border-line pb-3">
        <div className="flex min-w-0 flex-col gap-0.5">
          <label htmlFor={idSwitch} className="text-sm font-medium text-fg">
            {t('dialogoSede.usarGenerales.titulo')}
          </label>
          <p className="text-[13px] leading-[18px] text-fg-secondary">{t('dialogoSede.usarGenerales.descripcion')}</p>
        </div>
        <Switch
          id={idSwitch}
          checked={usarGenerales}
          disabled={deshabilitado}
          onCheckedChange={(v) => {
            setUsarGenerales(v === true);
            // Al apagarlo se parte de los generales (o de los propios que ya tenía).
            if (v !== true) setValores(propios ?? generales);
          }}
        />
      </div>
      <TablaTiempos
        idPrefijo={`tiempos-sede-${sede.id}`}
        valores={usarGenerales ? generales : valores}
        deshabilitado={deshabilitado || usarGenerales}
        onCambiar={(tipo, campo, tiempo) => setValores((v) => cambiarTiempo(v, tipo, campo, tiempo))}
      />
    </Dialogo>
  );
}
