import { FC } from 'react';

interface InventarioPageProps {}

const InventarioPage: FC<InventarioPageProps> = () => {
  return (
    <div className="container mx-auto p-4">
      <h1 className="text-2xl font-bold mb-4">Inventario</h1>
      <p>Contenido del módulo Inventario</p>
    </div>
  );
};

export default InventarioPage;
