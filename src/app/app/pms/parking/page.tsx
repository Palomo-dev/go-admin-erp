import { FC } from 'react';

interface ParkingPageProps {}

const ParkingPage: FC<ParkingPageProps> = () => {
  return (
    <div className="container mx-auto p-4">
      <h1 className="text-2xl font-bold mb-4">Parking</h1>
      <p>Contenido del módulo Parking</p>
    </div>
  );
};

export default ParkingPage;
