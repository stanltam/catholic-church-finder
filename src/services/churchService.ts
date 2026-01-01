import axios from 'axios';
import hkMassSchedules from '../data/hk_mass_schedules.json';

export interface Church {
  id: number;
  lat: number;
  lon: number;
  name: string;
  distance?: number; // Distance in km
  address?: string;
  massSchedule?: {
    originalName: string;
    schedule: { type: string; time: string }[];
  };
}

const OVERPASS_API_URL = 'https://overpass-api.de/api/interpreter';

export const findNearbyChurches = async (lat: number, lon: number, radius: number = 5000): Promise<Church[]> => {
  // Query for catholic churches within the radius (meters)
  // node["amenity"="place_of_worship"]["religion"="christian"]["denomination"="catholic"](around:radius, lat, lon);
  // way[...]...; relation[...]...; 
  // We'll focus on nodes and ways (buildings) for simplicity, represented as centers.
  
  const query = `
    [out:json];
    (
      node["amenity"="place_of_worship"]["religion"="christian"]["denomination"~"catholic",i](around:${radius},${lat},${lon});
      way["amenity"="place_of_worship"]["religion"="christian"]["denomination"~"catholic",i](around:${radius},${lat},${lon});
      relation["amenity"="place_of_worship"]["religion"="christian"]["denomination"~"catholic",i](around:${radius},${lat},${lon});
    );
    out center;
  `;

  try {
    const response = await axios.post(OVERPASS_API_URL, query, {
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded'
        }
    });

    const data = response.data.elements;
    
    return data.map((element: any) => {
        const churchLat = element.lat || element.center.lat;
        const churchLon = element.lon || element.center.lon;
        const dist = calculateDistance(lat, lon, churchLat, churchLon);
        const name = element.tags.name || "Unknown Catholic Church";
        
        return {
            id: element.id,
            lat: churchLat,
            lon: churchLon,
            name: name,
            address: formatAddress(element.tags),
            distance: dist,
            massSchedule: getMassSchedule(name)
        };
    }).sort((a: Church, b: Church) => (a.distance || 0) - (b.distance || 0));

  } catch (error) {
    console.error("Error fetching churches:", error);
    throw error;
  }
};

const getMassSchedule = (name: string) => {
    // Normalize name to match JSON keys
    let norm = name.toLowerCase();
    
    // Replace "saint" with "st"
    norm = norm.replace(/\bsaint\b/g, 'st');
    
    // Remove punctuation
    norm = norm.replace(/[^\w\s]/g, '');
    
    // Remove common words
    norm = norm.replace(/\b(church|parish|chapel|mass centre|center|catholic)\b/g, '');
    
    // Normalize spaces
    norm = norm.replace(/\s+/g, ' ').trim();
    
    // @ts-ignore
    const schedule = hkMassSchedules[norm];
    
    if (!schedule) {
        // console.log(`No schedule found for: "${name}" -> Normalized: "${norm}"`);
    }
    
    return schedule;
};

const formatAddress = (tags: any): string => {
    if (tags['addr:full']) return tags['addr:full'];

    const parts = [
        tags['addr:housenumber'],
        tags['addr:street'] || tags['addr:street_name'],
        tags['addr:city'] || tags['addr:suburb'] || tags['addr:town'] || tags['addr:postcode']
    ].filter(Boolean);
    
    return parts.length > 0 ? parts.join(', ') : '';
}

// Haversine formula to calculate distance in km
const calculateDistance = (lat1: number, lon1: number, lat2: number, lon2: number): number => {
  const R = 6371; // Radius of the earth in km
  const dLat = deg2rad(lat2 - lat1);
  const dLon = deg2rad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(deg2rad(lat1)) * Math.cos(deg2rad(lat2)) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  const d = R * c; // Distance in km
  return parseFloat(d.toFixed(2));
};

const deg2rad = (deg: number): number => {
  return deg * (Math.PI / 180);
};
