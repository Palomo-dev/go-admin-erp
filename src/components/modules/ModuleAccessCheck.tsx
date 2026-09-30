/**
 * Hook para verificar si el módulo actual está fuera del plan (GO-156)
 * 
 * Muestra aviso discreto al entrar a un módulo que no está incluido en el plan.
 * - En modo 'warn': muestra aviso sin bloquear
 * - En modo 'enforce': bloquea (pero está desactivado por defecto para suscripciones activas)
 */

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase/config';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { AlertCircle } from 'lucide-react';
import Link from 'next/link';

interface ModuleComplianceCheck {
  isChecking: boolean;
  isAllowed: boolean;
  shouldBlock: boolean;
  warningMessage?: string;
  enforcementMode?: 'off' | 'warn' | 'enforce';
}

export function useModuleAccessCheck(moduleCode: string): ModuleComplianceCheck {
  const [check, setCheck] = useState<ModuleComplianceCheck>({
    isChecking: true,
    isAllowed: true,
    shouldBlock: false
  });

  useEffect(() => {
    async function checkAccess() {
      try {
        // Obtener sesión actual
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) {
          setCheck({ isChecking: false, isAllowed: true, shouldBlock: false });
          return;
        }

        // Llamar al endpoint que verifica el compliance
        const response = await fetch('/api/modules/check-access', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ module_code: moduleCode })
        });

        if (!response.ok) {
          setCheck({ isChecking: false, isAllowed: true, shouldBlock: false });
          return;
        }

        const result = await response.json();
        setCheck({
          isChecking: false,
          isAllowed: result.allowed,
          shouldBlock: result.should_block,
          warningMessage: result.warning_message,
          enforcementMode: result.enforcement_mode
        });

      } catch (error) {
        console.error('Error checking module access:', error);
        // En caso de error, permitir acceso (fail open)
        setCheck({ isChecking: false, isAllowed: true, shouldBlock: false });
      }
    }

    checkAccess();
  }, [moduleCode]);

  return check;
}

/**
 * Componente de aviso discreto para módulos fuera del plan
 * 
 * Mostrar en el layout o cabecera del módulo cuando el usuario entre.
 */
export function ModuleAccessWarning({ moduleCode }: { moduleCode: string }) {
  const check = useModuleAccessCheck(moduleCode);
  const router = useRouter();

  // Mientras verifica o si está permitido sin aviso, no mostrar nada
  if (check.isChecking || (check.isAllowed && !check.warningMessage)) {
    return null;
  }

  // En modo 'enforce' con bloqueo activo, redirigir
  useEffect(() => {
    if (check.shouldBlock) {
      router.push('/app/plan?reason=module_not_allowed');
    }
  }, [check.shouldBlock, router]);

  if (check.shouldBlock) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Alert variant="destructive" className="max-w-lg">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            {check.warningMessage || 'Este módulo no está disponible en tu plan actual.'}
            {' '}
            <Link href="/app/plan" className="underline font-medium">
              Ver planes disponibles
            </Link>
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  // En modo 'warn', mostrar aviso discreto sin bloquear
  return (
    <Alert variant="default" className="mb-4 border-amber-200 bg-amber-50">
      <AlertCircle className="h-4 w-4 text-amber-600" />
      <AlertDescription className="text-amber-900">
        {check.warningMessage}
        {' '}
        <Link href="/app/plan" className="underline font-medium">
          Actualizar plan
        </Link>
      </AlertDescription>
    </Alert>
  );
}
