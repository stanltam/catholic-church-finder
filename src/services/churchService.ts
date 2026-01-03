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
  nextMassTime?: number; // Minutes from midnight for the NEXT mass today. Null if no more masses.
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
        
        // Filter out known non-Catholic churches that might be mis-tagged or appear due to data issues
        if (name.includes("Swatow Christian") || name.includes("Lutheran") || name.includes("Methodist") || name.includes("Baptist")) {
             return null;
        }

        const schedule = getMassSchedule(name);
        
        const church: Church = {
            id: element.id,
            lat: churchLat,
            lon: churchLon,
            name: name,
            address: formatAddress(element.tags),
            distance: dist,
            massSchedule: schedule
        };

        // Calculate next mass time
        church.nextMassTime = calculateNextMassTime(church);

        return church;
    })
    .filter((c: Church | null) => c !== null) // Remove nulls
    .sort((a: Church, b: Church) => (a.distance || 0) - (b.distance || 0));

  } catch (error) {
    console.error("Error fetching churches:", error);
    throw error;
  }
};

const calculateNextMassTime = (church: Church): number | undefined => {
    if (!church.massSchedule) return undefined;

    const now = new Date();
    const day = now.getDay(); // 0 = Sunday, 1-6 = Mon-Sat
    const currentMinutes = now.getHours() * 60 + now.getMinutes();
    
    // Determine relevant categories
    const categories: string[] = [];
    if (day === 0) {
        categories.push("Sunday Masses");
    } else if (day === 6) {
        categories.push("Weekday Masses", "Anticipated Sunday Masses");
    } else {
        categories.push("Weekday Masses");
    }

    let nextMass = Infinity;

    church.massSchedule.schedule.forEach(item => {
        if (!categories.includes(item.type)) return;
        
        // Check for specific day restrictions in the text (e.g., "Mon., Wed.")
        if (hasDayRestrictionConflict(item.time, day)) return;

        // Parse all times in the string
        const times = parseTimes(item.time);
        times.forEach(t => {
            if (t >= currentMinutes && t < nextMass) {
                nextMass = t;
            }
        });
    });

    return nextMass === Infinity ? undefined : nextMass;
};

const hasDayRestrictionConflict = (text: string, currentDay: number): boolean => {
    // Simple check: if text starts with day names, check if today is included.
    const dayMap: { [key: string]: number[] } = {
        'Mon': [1], 'Tue': [2], 'Wed': [3], 'Thu': [4], 'Thur': [4], 'Fri': [5], 'Sat': [6], 'Sun': [0]
    };
    
    // Regex to find day patterns at the start: "Mon, Tue..." or "Mon to Fri"
    // This is complex. Heuristic: if text contains any day name *before* the first digit, assume it's a restriction.
    
    const firstDigitIdx = text.search(/\d/);
    if (firstDigitIdx === -1) return false; // No time found anyway
    
    const prefix = text.substring(0, firstDigitIdx).toLowerCase();
    
    // If prefix is short or empty, likely no restriction (e.g. "7:00 am")
    if (prefix.trim().length < 3) return false;

    // Check if prefix contains ANY day name
    const daysFound: number[] = [];
    let hasDayKeywords = false;
    
    Object.keys(dayMap).forEach(k => {
        if (prefix.includes(k.toLowerCase())) {
            hasDayKeywords = true;
            daysFound.push(...dayMap[k]);
        }
    });

    if (!hasDayKeywords) return false; // No day restrictions found

    // Handle "to" (range) - e.g., "Mon to Fri"
    if (prefix.includes(' to ') || prefix.includes('-')) {
        // This is getting complicated. 
        // fallback: if today is found in the explicit list, allow it.
        // If "to" is present, allow if today is Mon-Fri (1-5) and "Mon" and "Fri" are there?
        // Let's stick to explicit match for now to be safe.
        // "Mon to Fri" -> usually matches Mon, Tue, Wed, Thu, Fri.
        if ((prefix.includes('mon') && prefix.includes('fri')) && (currentDay >= 1 && currentDay <= 5)) return false;
        if ((prefix.includes('mon') && prefix.includes('sat')) && (currentDay >= 1 && currentDay <= 6)) return false;
    }

    // If explicit list "Mon, Wed", check if currentDay is in it.
    if (daysFound.includes(currentDay)) return false; // Allowed

    return true; // Conflict found (restriction exists but today not in it)
};

const parseTimes = (text: string): number[] => {
    // Regex for time: 8:00, 8:30am, 9am, 12:00 noon
    const timeRegex = /(\d{1,2})(?::(\d{2}))?\s*(am|pm|noon|a\.m\.|p\.m\.)?/gi;
    const matches = [...text.matchAll(timeRegex)];
    
    return matches.map(m => {
        let hours = parseInt(m[1]);
        const minutes = m[2] ? parseInt(m[2]) : 0;
        const period = m[3] ? m[3].toLowerCase().replace(/\./g, '') : null;

        if (period === 'pm' && hours < 12) hours += 12;
        if (period === 'am' && hours === 12) hours = 0;
        if (period === 'noon') hours = 12;
        
        // Heuristic for missing AM/PM: 
        // If no period, assume AM if < 7 (unlikely) or >= 7 && < 12?
        // Actually, many schedules say "7:00, 8:00 am". The period might apply to previous?
        // Or "7:00, 8:00, 6:00pm".
        // Robust strategy: if undefined, look ahead? Or just assume 24h if > 12?
        // For now, if undefined:
        // If hours < 7, assume PM (afternoon/evening)? No, 6:00 could be AM.
        // Let's look at the string context? Too hard.
        // Simple fallback: If < 7, add 12? (1:00, 2:00 usually PM). 7:00 usually AM.
        // If period is missing, and hours <= 6, assume PM. If >= 7, assume AM.
        if (!period) {
             if (hours >= 1 && hours <= 6) hours += 12;
        }

        return hours * 60 + minutes;
    });
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

export const geocodeLocation = async (query: string): Promise<{ lat: number, lon: number, display_name: string } | null> => {
    try {
        const response = await axios.get('https://nominatim.openstreetmap.org/search', {
            params: {
                q: query,
                format: 'json',
                limit: 1
            },
            headers: {
                'User-Agent': 'CatholicChurchFinder/1.0'
            }
        });

        if (response.data && response.data.length > 0) {
            const result = response.data[0];
            return {
                lat: parseFloat(result.lat),
                lon: parseFloat(result.lon),
                display_name: result.display_name
            };
        }
        return null;
    } catch (error) {
        console.error("Geocoding error:", error);
        return null;
    }
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
