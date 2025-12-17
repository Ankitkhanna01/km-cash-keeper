import { useLocalStorage } from './useLocalStorage';
import { Trip } from '@/types';
import { parseLocalDate } from '@/lib/dateUtils';

const generateId = () => {
  return Date.now().toString(36) + Math.random().toString(36).substr(2);
};

export function useTrips() {
  const [trips, setTrips] = useLocalStorage<Trip[]>('driverTax_trips', []);

  const addTrip = (tripData: Omit<Trip, 'id' | 'createdAt'>) => {
    const newTrip: Trip = {
      ...tripData,
      id: generateId(),
      createdAt: new Date().toISOString(),
    };
    setTrips((prev) => [newTrip, ...prev]);
    return newTrip;
  };

  const updateTrip = (id: string, updates: Partial<Trip>) => {
    setTrips((prev) =>
      prev.map((trip) => (trip.id === id ? { ...trip, ...updates } : trip))
    );
  };

  const deleteTrip = (id: string) => {
    setTrips((prev) => prev.filter((trip) => trip.id !== id));
  };

  const categorizeTrip = (id: string, category: 'business' | 'personal') => {
    updateTrip(id, { category });
  };

  const getUncategorizedTrips = () => {
    return trips.filter((trip) => trip.category === 'uncategorized');
  };

  const getTripsByYear = (year: number) => {
    return trips.filter((trip) => parseLocalDate(trip.date).getFullYear() === year);
  };

  const getStats = (year?: number) => {
    const filteredTrips = year ? getTripsByYear(year) : trips;
    const businessTrips = filteredTrips.filter((t) => t.category === 'business');
    const personalTrips = filteredTrips.filter((t) => t.category === 'personal');

    const totalKm = filteredTrips.reduce((sum, t) => sum + t.kilometres, 0);
    const businessKm = businessTrips.reduce((sum, t) => sum + t.kilometres, 0);
    const personalKm = personalTrips.reduce((sum, t) => sum + t.kilometres, 0);

    return {
      totalTrips: filteredTrips.length,
      businessTrips: businessTrips.length,
      personalTrips: personalTrips.length,
      totalKilometres: totalKm,
      businessKilometres: businessKm,
      personalKilometres: personalKm,
      businessPercentage: totalKm > 0 ? (businessKm / totalKm) * 100 : 0,
    };
  };

  return {
    trips,
    addTrip,
    updateTrip,
    deleteTrip,
    categorizeTrip,
    getUncategorizedTrips,
    getTripsByYear,
    getStats,
  };
}
