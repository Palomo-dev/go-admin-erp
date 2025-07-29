"use client";

import React from "react";
import OpportunityTasksCore from "./OpportunityTasksCore";

interface OpportunityTasksProps {
  opportunityId: string;
}

/**
 * Componente wrapper para OpportunityTasks
 * Delega toda la funcionalidad al componente modularizado OpportunityTasksCore
 */
export default function OpportunityTasks({ opportunityId }: OpportunityTasksProps) {
  return <OpportunityTasksCore opportunityId={opportunityId} />;
}
