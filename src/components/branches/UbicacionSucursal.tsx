'use client';

/**
 * País, Departamento y Ciudad de la sucursal en tres columnas con el `Select`
 * del kit (Figma «Nueva Sucursal», bloque Ubicación). Mismas consultas que
 * `LocationSelector` (`countries` y `municipalities`); los países sin
 * municipios en el catálogo escriben departamento y ciudad a mano.
 *
 * `branchService` guarda los nombres (`country`, `state`, `city`) y no los
 * códigos, así que al editar se recupera el código por el nombre guardado
 * para que los selectores muestren lo que hay en la base.
 */
import { useCallback, useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { supabase } from '@/lib/supabase/config';
import { FormField } from '@/components/kit/FormField';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

export interface UbicacionSede {
  country: string;
  countryCode: string;
  state: string;
  stateCode: string;
  city: string;
  municipalityId: string;
}

interface Pais { code: string; name: string }
interface Departamento { state_code: string; state_name: string }
interface Municipio { id: string; name: string; state_code: string }

const plano = (t: string) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase();

export function UbicacionSucursal({ valor, onCambio }: { valor: UbicacionSede; onCambio: (u: UbicacionSede) => void }) {
  const t = useTranslations('org.acceso.sucursales.formulario.campos');
  const [paises, setPaises] = useState<Pais[]>([]);
  const [departamentos, setDepartamentos] = useState<Departamento[]>([]);
  const [municipios, setMunicipios] = useState<Municipio[]>([]);
  const [cargandoDeptos, setCargandoDeptos] = useState(false);

  useEffect(() => {
    let vivo = true;
    supabase
      .from('countries')
      .select('code, name')
      .eq('is_active', true)
      .order('name')
      .then(({ data }) => {
        if (vivo && data) setPaises(data as Pais[]);
      });
    return () => {
      vivo = false;
    };
  }, []);

  // País guardado solo por nombre: se recupera su código.
  useEffect(() => {
    if (valor.countryCode || !valor.country || paises.length === 0) return;
    const p = paises.find((x) => plano(x.name) === plano(valor.country));
    if (p) onCambio({ ...valor, countryCode: p.code, country: p.name });
  }, [paises, valor, onCambio]);

  const cargarDepartamentos = useCallback(async (pais: string) => {
    setCargandoDeptos(true);
    const { data } = await supabase.from('municipalities').select('state_code, state_name').eq('country_code', pais).order('state_name');
    const unicos = new Map<string, Departamento>();
    for (const d of (data ?? []) as Departamento[]) unicos.set(d.state_code, d);
    setDepartamentos(Array.from(unicos.values()));
    setCargandoDeptos(false);
  }, []);

  useEffect(() => {
    if (!valor.countryCode) {
      setDepartamentos([]);
      return;
    }
    void cargarDepartamentos(valor.countryCode);
  }, [valor.countryCode, cargarDepartamentos]);

  useEffect(() => {
    if (!valor.countryCode || !valor.stateCode) {
      setMunicipios([]);
      return;
    }
    let vivo = true;
    supabase
      .from('municipalities')
      .select('id, name, state_code')
      .eq('country_code', valor.countryCode)
      .eq('state_code', valor.stateCode)
      .order('name')
      .then(({ data }) => {
        if (vivo) setMunicipios((data ?? []) as Municipio[]);
      });
    return () => {
      vivo = false;
    };
  }, [valor.countryCode, valor.stateCode]);

  // Departamento y ciudad guardados solo por nombre: se recuperan sus códigos.
  useEffect(() => {
    if (valor.stateCode || !valor.state || departamentos.length === 0) return;
    const d = departamentos.find((x) => plano(x.state_name) === plano(valor.state));
    if (d) onCambio({ ...valor, stateCode: d.state_code });
  }, [departamentos, valor, onCambio]);

  useEffect(() => {
    if (valor.municipalityId || !valor.city || municipios.length === 0) return;
    const m = municipios.find((x) => plano(x.name) === plano(valor.city));
    if (m) onCambio({ ...valor, municipalityId: m.id });
  }, [municipios, valor, onCambio]);

  const conCatalogo = departamentos.length > 0;

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
      <FormField etiqueta={t('pais')}>
        {(campo) => (
          <Select
            value={valor.countryCode || ''}
            onValueChange={(code) => {
              const p = paises.find((x) => x.code === code);
              onCambio({ country: p?.name ?? '', countryCode: code, state: '', stateCode: '', city: '', municipalityId: '' });
            }}
          >
            <SelectTrigger id={campo.id} aria-describedby={campo['aria-describedby']} className="h-10">
              <SelectValue placeholder={valor.country || t('paisElegir')} />
            </SelectTrigger>
            <SelectContent className="max-h-72">
              {paises.map((p) => (
                <SelectItem key={p.code} value={p.code}>
                  {p.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </FormField>

      <FormField etiqueta={t('departamento')}>
        {conCatalogo ? (
          (campo) => (
            <Select
              value={valor.stateCode || ''}
              disabled={cargandoDeptos}
              onValueChange={(code) => {
                const d = departamentos.find((x) => x.state_code === code);
                onCambio({ ...valor, state: d?.state_name ?? '', stateCode: code, city: '', municipalityId: '' });
              }}
            >
              <SelectTrigger id={campo.id} aria-describedby={campo['aria-describedby']} className="h-10">
                <SelectValue placeholder={valor.state || t('departamentoElegir')} />
              </SelectTrigger>
              <SelectContent className="max-h-72">
                {departamentos.map((d) => (
                  <SelectItem key={d.state_code} value={d.state_code}>
                    {d.state_name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )
        ) : (
          <Input
            className="h-10"
            value={valor.state}
            placeholder={t('departamentoEscribir')}
            onChange={(e) => onCambio({ ...valor, state: e.target.value, stateCode: '' })}
          />
        )}
      </FormField>

      <FormField etiqueta={t('ciudad')}>
        {conCatalogo && valor.stateCode ? (
          (campo) => (
            <Select
              value={valor.municipalityId || ''}
              onValueChange={(id) => {
                const m = municipios.find((x) => x.id === id);
                onCambio({ ...valor, city: m?.name ?? '', municipalityId: id });
              }}
            >
              <SelectTrigger id={campo.id} aria-describedby={campo['aria-describedby']} className="h-10">
                <SelectValue placeholder={valor.city || t('ciudadElegir')} />
              </SelectTrigger>
              <SelectContent className="max-h-72">
                {municipios.map((m) => (
                  <SelectItem key={m.id} value={m.id}>
                    {m.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )
        ) : (
          <Input
            className="h-10"
            value={valor.city}
            placeholder={t('ciudadEscribir')}
            onChange={(e) => onCambio({ ...valor, city: e.target.value, municipalityId: '' })}
          />
        )}
      </FormField>
    </div>
  );
}
