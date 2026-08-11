import { MdElectricBike, MdElectricScooter } from 'react-icons/md';
import { IoCarSport } from 'react-icons/io5';
import { FaMotorcycle, FaTruckFront } from 'react-icons/fa6';







export function VehicleGlyph({
  formFactor,
  size = 20,
  color = '#ffffff',
  rotated = false,
}: {
  formFactor: string;
  size?: number;
  color?: string;
  
  rotated?: boolean;
}) {
  const Icon =
    formFactor === 'car' ? IoCarSport :
    formFactor === 'truck' ? FaTruckFront :
    formFactor === 'moped' ? FaMotorcycle :
    formFactor === 'bicycle' ? MdElectricBike :
    MdElectricScooter;

  return (
    <Icon
      size={size}
      color={color}
      style={rotated ? { transform: 'rotate(45deg)' } : undefined}
      className="flex-shrink-0"
    />
  );
}
