"use client";

import React from 'react';
import TaxesTable from './TaxesTable';

const TaxesIndexPage = () => {
  return (
    <div className="container mx-auto py-8 px-4 md:px-6">
      <div className="flex flex-col gap-6">
        <div className="flex flex-col gap-2">
          <h1 className="text-2xl font-bold text-blue-600 dark:text-blue-400">
            Gestión de Impuestos
          </h1>
          <p className="text-gray-600 dark:text-gray-300">
            Administra los tipos de impuestos aplicables a los productos y servicios de tu organización.
          </p>
        </div>
        
        <TaxesTable />
      </div>
    </div>
  );
};

export default TaxesIndexPage;
