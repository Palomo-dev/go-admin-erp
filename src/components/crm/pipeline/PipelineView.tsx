"use client";

import React from "react";
import PipelineViewCore from "./PipelineViewCore";

/**
 * Componente wrapper para PipelineView
 * Delega toda la funcionalidad al componente modularizado PipelineViewCore
 */
export default function PipelineView() {
  return <PipelineViewCore />;
}
