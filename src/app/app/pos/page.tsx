import { FC } from 'react';

interface PosPageProps {}

const PosPage: FC<PosPageProps> = () => {
  return (
    <div className="container mx-auto p-4">
      <h1 className="text-2xl font-bold mb-4">POS</h1>
      <p>Contenido del módulo POS</p>
    </div>
  );
};

export default PosPage;
