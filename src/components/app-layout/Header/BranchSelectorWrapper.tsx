'use client';

import BranchSelector from '@/components/common/BranchSelector';

interface BranchSelectorWrapperProps {
  orgId: string | null;
  className?: string;
}

/**
 * Wrapper que renderiza el BranchSelector global del header.
 *
 * No filtra por orgId aquí: BranchSelector obtiene sus datos de BranchContext
 * (useBranch), que ya maneja estados de loading y empty internamente.
 * Retornar null cuando orgId no está disponible causaba que el componente
 * nunca se montara durante navegación client-side, y al llegar orgId el
 * memo() impedía el re-render. Dejar que BranchSelector se monte siempre
 * permite que reaccione a cambios del contexto correctamente.
 */
export const BranchSelectorWrapper = ({ className = '' }: BranchSelectorWrapperProps) => {
  return <BranchSelector className={className} />;
};

export default BranchSelectorWrapper;
