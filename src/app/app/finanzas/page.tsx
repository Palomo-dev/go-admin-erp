import { FC } from 'react';

interface FinanzasPageProps {}

const FinanzasPage: FC<FinanzasPageProps> = () => {
  return (
    <div className="container mx-auto p-4">
      <h1 className="text-2xl font-bold mb-4">Finanzas</h1>
      <p>Contenido del módulo Finanzas</p>
    </div>
  );
};

export default FinanzasPage;
