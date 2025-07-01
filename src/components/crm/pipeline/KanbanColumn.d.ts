import { ReactNode } from 'react';
import { Opportunity, Stage } from '../../../types/crm';

export interface KanbanColumnProps {
  stage: Stage;
  opportunities: Opportunity[];
  onOpportunityDrop: (opportunityId: string, sourceStageId: string, destinationStageId: string) => Promise<void>;
  stageTotal: number;
  isLoading?: boolean;
  children?: ReactNode;
}

declare const KanbanColumn: React.FC<KanbanColumnProps>;

export default KanbanColumn;
