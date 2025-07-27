"use client";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Edit, ExternalLink } from "lucide-react";

interface OpportunityHeaderProps {
  opportunity: {
    id: string;
    name: string;
    status: string;
    pipeline: {
      name: string;
    };
    stage: {
      name: string;
    };
  };
  onBack: () => void;
  onEdit: () => void;
}

export default function OpportunityHeader({ opportunity, onBack, onEdit }: OpportunityHeaderProps) {
  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'won':
        return <Badge className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-100">Ganada</Badge>;
      case 'lost':
        return <Badge className="bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-100">Perdida</Badge>;
      default:
        return <Badge className="bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-100">Abierta</Badge>;
    }
  };

  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-4">
        <Button
          variant="ghost"
          size="sm"
          onClick={onBack}
          className="flex items-center gap-2"
        >
          <ArrowLeft className="h-4 w-4" />
          Volver al Pipeline
        </Button>
        
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold">{opportunity.name}</h1>
            {getStatusBadge(opportunity.status)}
          </div>
          <p className="text-muted-foreground">
            {opportunity.pipeline.name} • {opportunity.stage.name}
          </p>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={onEdit}
          className="flex items-center gap-2"
        >
          <Edit className="h-4 w-4" />
          Editar
        </Button>
        
        <Button
          variant="outline"
          size="sm"
          className="flex items-center gap-2"
        >
          <ExternalLink className="h-4 w-4" />
          Ver en Pipeline
        </Button>
      </div>
    </div>
  );
}
