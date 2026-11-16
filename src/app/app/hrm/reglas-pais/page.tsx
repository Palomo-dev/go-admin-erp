import { redirect } from 'next/navigation';
import { rutaSeccion } from '@/components/configuracion/config/configSectionsRegistry';

/**
 * «Reglas por país» se retiró (decisión del dueño, 2026-11-16): mostraba la tabla
 * legada country_payroll_rules con valores viejos. Los valores de ley vigentes, por
 * país y con su vigencia, están en Configuración › Recursos humanos › Parámetros
 * legales (hr_legal_parameters), que es lo que usa la nómina.
 */
export default function Page() {
  redirect(rutaSeccion('hrm.general'));
}
