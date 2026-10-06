'use client';

/**
 * «Nueva carta» (Figma B/13-01, acción primaria): nombre, icono y con qué
 * empezar (todas las categorías del inventario, ninguna o la copia de otra
 * carta). Crea la carta en una transacción (`crear_carta`) y lleva a su
 * detalle para elegir horario, sedes y categorías.
 */
import { useEffect, useState } from 'react';
import { BookOpen } from 'lucide-react';
import { ChipsOpcion, Dialogo, FormField, SegmentedControl } from '@/components/kit';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ICONOS_CARTA, type CartaResumen, type IconoCarta } from '@/lib/website/carta';
import type { TraductorConfiguracion } from '../textos';

type Inicio = 'todas' | 'vacia' | 'duplicar';

export interface DialogoNuevaCartaProps {
  t: TraductorConfiguracion;
  abierto: boolean;
  onAbiertoChange: (v: boolean) => void;
  cartas: CartaResumen[];
  creando: boolean;
  onCrear: (datos: { nombre: string; icono: IconoCarta; duplicarDe: string | null; todasLasCategorias: boolean }) => void;
}

export function DialogoNuevaCarta({ t, abierto, onAbiertoChange, cartas, creando, onCrear }: DialogoNuevaCartaProps) {
  const [nombre, setNombre] = useState('');
  const [icono, setIcono] = useState<IconoCarta>('almuerzo');
  const [inicio, setInicio] = useState<Inicio>('todas');
  const [origen, setOrigen] = useState<string>('');
  const [intentado, setIntentado] = useState(false);
  const copiables = cartas.filter((c) => !c.implicita);

  useEffect(() => {
    if (!abierto) return;
    setNombre('');
    setIcono('almuerzo');
    setInicio('todas');
    setOrigen(copiables[0]?.id ?? '');
    setIntentado(false);
    // Solo al abrir.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [abierto]);

  const crear = () => {
    setIntentado(true);
    if (!nombre.trim()) return;
    onCrear({
      nombre: nombre.trim(),
      icono,
      duplicarDe: inicio === 'duplicar' && origen ? origen : null,
      todasLasCategorias: inicio === 'todas',
    });
  };

  return (
    <Dialogo
      abierto={abierto}
      onAbiertoChange={onAbiertoChange}
      titulo={t('carta.dialogo.titulo')}
      descripcion={t('carta.dialogo.descripcion')}
      icono={BookOpen}
      ancho={520}
      primario={{ etiqueta: t('carta.dialogo.crear'), onClick: crear, cargando: creando }}
    >
      <div className="flex flex-col gap-4">
        <FormField etiqueta={t('carta.dialogo.nombre')} obligatorio error={intentado && !nombre.trim() ? t('carta.dialogo.nombreRequerido') : null}>
          <Input value={nombre} maxLength={80} placeholder={t('carta.dialogo.nombrePlaceholder')} onChange={(e) => setNombre(e.target.value)} autoFocus />
        </FormField>
        <FormField etiqueta={t('carta.dialogo.icono')}>
          {(campo) => (
            <ChipsOpcion
              aria-labelledby={campo.idEtiqueta}
              opciones={ICONOS_CARTA.map((i) => ({ valor: i, etiqueta: t(`carta.iconos.${i}`) }))}
              valor={icono}
              onValorChange={(v: IconoCarta) => setIcono(v)}
            />
          )}
        </FormField>
        <FormField etiqueta={t('carta.dialogo.empezar')}>
          {(campo) => (
            <SegmentedControl
              aria-labelledby={campo.idEtiqueta}
              anchoCompleto
              opciones={[
                { valor: 'todas', etiqueta: t('carta.dialogo.todas') },
                { valor: 'vacia', etiqueta: t('carta.dialogo.vacia') },
                { valor: 'duplicar', etiqueta: t('carta.dialogo.duplicar'), deshabilitada: copiables.length === 0 },
              ]}
              valor={inicio}
              onValorChange={setInicio}
            />
          )}
        </FormField>
        {inicio === 'duplicar' && copiables.length > 0 && (
          <FormField etiqueta={t('carta.dialogo.deCual')}>
            {(campo) => (
              <Select value={origen} onValueChange={setOrigen}>
                <SelectTrigger className="h-10 rounded-lg" aria-labelledby={campo.idEtiqueta}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {copiables.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.nombre}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </FormField>
        )}
      </div>
    </Dialogo>
  );
}
