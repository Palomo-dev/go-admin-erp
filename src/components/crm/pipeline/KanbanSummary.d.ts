import { ReactNode } from 'react';
import { Stage } from '../../../types/crm';

export interface KanbanSummaryProps {
  stages: Stage[];
  totalAmount: number;
  totalOpportunities: number;
  isLoading?: boolean;
  children?: ReactNode;
}

declare const KanbanSummary: React.FC<KanbanSummaryProps>;

export default KanbanSummary;
