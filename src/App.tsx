import { useEffect, useState } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { type Church, findNearbyChurches, geocodeLocation } from './services/churchService';
import './App.css';
import { MapPin, Navigation, Cross, ExternalLink, Locate, Search } from 'lucide-react';

// Fix for default Leaflet marker icons in React
import icon from 'leaflet/dist/images/marker-icon.png';
import iconShadow from 'leaflet/dist/images/marker-shadow.png';

let DefaultIcon = L.icon({
    iconUrl: icon,
    shadowUrl: iconShadow,
    iconSize: [25, 41],
    iconAnchor: [12, 41]
});

L.Marker.prototype.options.icon = DefaultIcon;

// Custom icon for user location
const userIcon = new L.Icon({
    iconUrl: 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAyNCAyNCIgd2lkdGg9IjM2IiBoZWlnaHQ9IjM2IiBmaWxsPSIjMmViODU1Ij48cGF0aCBkPSJNMTIgMEM3LjU4IDAgNCAzLjU4IDQgOGMwIDQuNDIgOCAxNiA4IDE2czgtMTEuNTggOC0xNmMwLTQuNDItMy41OC04LTgtOHptMCAxMmEyIDIgMCAxIDEgMC00IDIgMiAwIDAgMSAwIDR6Ii8+PC9zdmc+',
    shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/0.7.7/images/marker-shadow.png',
    iconSize: [36, 36],
    iconAnchor: [18, 36],
    popupAnchor: [0, -34],
    shadowSize: [41, 41]
});

// Icon for search result center
const searchIcon = new L.Icon({
    iconUrl: 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAyNCAyNCIgd2lkdGg9IjM2IiBoZWlnaHQ9IjM2IiBmaWxsPSIjZTkxZTYzIj48cGF0aCBkPSJNMTIgMEM3LjU4IDAgNCAzLjU4IDQgOGMwIDQuNDIgOCAxNiA4IDE2czgtMTEuNTggOC0xNmMwLTQuNDItMy41OC04LTgtOHptMCAxMmEyIDIgMCAxIDEgMC00IDIgMiAwIDAgMSAwIDR6Ii8+PC9zdmc+',
    shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/0.7.7/images/marker-shadow.png',
    iconSize: [36, 36],
    iconAnchor: [18, 36],
    popupAnchor: [0, -34],
    shadowSize: [41, 41]
});

function MapUpdater({ center }: { center: [number, number] }) {
  const map = useMap();
  useEffect(() => {
    map.setView(center, 14);
  }, [center, map]);
  return null;
}

function RecenterControl({ onLocate, hasLocation }: { onLocate: () => void, hasLocation: boolean }) {
  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    onLocate();
  };

  return (
    <div className="leaflet-top leaflet-left" style={{ marginTop: '80px', marginLeft: '10px' }}>
      <div className="leaflet-control leaflet-bar">
        <a 
            href="#" 
            title="Show my location"
            onClick={handleClick}
            style={{ 
                backgroundColor: 'white', 
                width: '34px', 
                height: '34px', 
                display: 'flex', 
                alignItems: 'center', 
                justifyContent: 'center',
                color: '#333',
                cursor: 'pointer'
            }}
        >
            <Locate size={20} className={!hasLocation ? 'text-gray-400' : ''} />
        </a>
      </div>
    </div>
  );
}

function App() {
  const [userLocation, setUserLocation] = useState<[number, number] | null>(null);
  const [mapCenter, setMapCenter] = useState<[number, number] | null>(null);
  const [churches, setChurches] = useState<Church[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedChurchId, setSelectedChurchId] = useState<number | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResultName, setSearchResultName] = useState<string | null>(null);
  const [sortOption, setSortOption] = useState<'distance' | 'time'>('distance');

  const fetchChurches = async (lat: number, lon: number) => {
    setLoading(true);
    try {
        const results = await findNearbyChurches(lat, lon);
        setChurches(results);
        setError(null);
    } catch (err) {
        console.error(err);
        setError("Failed to fetch nearby churches. Please try again later.");
    } finally {
        setLoading(false);
    }
  };

  const refreshLocation = () => {
    if (!navigator.geolocation) {
      setError("Geolocation is not supported by your browser.");
      setLoading(false);
      return;
    }

    setLoading(true);
    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const { latitude, longitude } = position.coords;
        setUserLocation([latitude, longitude]);
        setMapCenter([latitude, longitude]);
        setSearchResultName(null); // Clear search result when going back to GPS
        fetchChurches(latitude, longitude);
      },
      (err) => {
        console.error(err);
        setError("Unable to retrieve your location. Please allow location access or search for a location manually.");
        setLoading(false);
      },
      { enableHighAccuracy: true }
    );
  };

  useEffect(() => {
    refreshLocation();
  }, []);

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchQuery.trim()) return;

    setLoading(true);
    const result = await geocodeLocation(searchQuery);
    if (result) {
        setMapCenter([result.lat, result.lon]);
        setSearchResultName(result.display_name);
        fetchChurches(result.lat, result.lon);
        // Clear selection when searching new area
        setSelectedChurchId(null);
    } else {
        alert("Location not found. Please try a different query.");
        setLoading(false);
    }
  };

  const handleChurchClick = (church: Church) => {
    setSelectedChurchId(church.id);
  };

  const getGoogleMapsUrl = (lat: number, lon: number) => {
    return `https://www.google.com/maps/dir/?api=1&destination=${lat},${lon}`;
  };

  const formatMinutes = (minutes: number) => {
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    const ampm = h >= 12 ? 'PM' : 'AM';
    const h12 = h % 12 || 12;
    return `${h12}:${m.toString().padStart(2, '0')} ${ampm}`;
  };

  const sortedChurches = [...churches].sort((a, b) => {
    if (sortOption === 'time') {
        const timeA = a.nextMassTime ?? Infinity;
        const timeB = b.nextMassTime ?? Infinity;
        if (timeA === timeB) {
             return (a.distance || 0) - (b.distance || 0); // fallback to distance
        }
        return timeA - timeB;
    }
    return (a.distance || 0) - (b.distance || 0);
  });

  const selectedChurch = churches.find(c => c.id === selectedChurchId);

  return (
    <div className="app-container">
      <header>
        <h1><Cross size={24} /> Catholic Church Finder</h1>
        <form onSubmit={handleSearch} className="search-bar">
            <input 
                type="text" 
                placeholder="Search city or place..." 
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="search-input"
            />
            <button type="submit" className="search-btn">
                <Search size={18} />
            </button>
        </form>
      </header>
      
      <div className="content">
        <div className="map-container">
            {/* Show map if we have a center (either from geo or search) */}
            {mapCenter ? (
              <MapContainer center={mapCenter} zoom={13} scrollWheelZoom={true}>
                <TileLayer
                  attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                  url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                />
                
                {/* User Location Marker */}
                {userLocation && (
                    <Marker position={userLocation} icon={userIcon}>
                    <Popup>
                        You are here
                    </Popup>
                    </Marker>
                )}

                {/* Search Result Marker (if different from user location and search happened) */}
                {searchResultName && mapCenter && (
                     <Marker position={mapCenter} icon={searchIcon}>
                        <Popup>
                            <strong>Search Location</strong><br/>
                            {searchResultName}
                        </Popup>
                     </Marker>
                )}
                
                {sortedChurches.map(church => (
                  <Marker 
                    key={church.id} 
                    position={[church.lat, church.lon]}
                    eventHandlers={{
                        click: () => handleChurchClick(church),
                    }}
                  >
                    <Popup>
                      <div className="popup-content">
                        <strong>{church.name}</strong><br />
                        {church.address && <span className="popup-address">{church.address}<br /></span>}
                        <span className="popup-distance">{church.distance} km away</span><br />
                        
                        {church.nextMassTime && (
                             <div style={{ color: '#e67e22', fontWeight: 'bold', marginBottom: '0.5rem' }}>
                                Next Mass Today: {formatMinutes(church.nextMassTime)}
                             </div>
                        )}

                        {church.massSchedule && (
                            <div className="popup-schedule">
                                <strong>Mass Schedule:</strong>
                                <ul style={{ paddingLeft: '1rem', margin: '0.25rem 0' }}>
                                    {church.massSchedule.schedule.slice(0, 3).map((s, i) => (
                                        <li key={i}>
                                            <span style={{fontWeight: 500}}>{s.type}:</span> {s.time}
                                        </li>
                                    ))}
                                    {church.massSchedule.schedule.length > 3 && <li>...and more</li>}
                                </ul>
                            </div>
                        )}

                        <a 
                          href={getGoogleMapsUrl(church.lat, church.lon)} 
                          target="_blank" 
                          rel="noopener noreferrer"
                          className="popup-link"
                        >
                          Get Directions <ExternalLink size={12} />
                        </a>
                      </div>
                    </Popup>
                  </Marker>
                ))}

                {/* If a church is selected, pan to it. Otherwise pan to mapCenter when it changes */}
                {selectedChurch ? 
                    <MapUpdater center={[selectedChurch.lat, selectedChurch.lon]} /> : 
                    <MapUpdater center={mapCenter} />
                }
                
                <RecenterControl onLocate={refreshLocation} hasLocation={!!userLocation} />
              </MapContainer>
            ) : (
                <div className="map-placeholder">
                    {loading ? (
                         <div className="loading-state">
                             <Navigation className="animate-spin" size={48} color="#2c3e50" />
                             <p>Locating you...</p>
                         </div>
                    ) : (
                         <div className="error-state">
                             <p>{error || "Please search for a location to begin."}</p>
                         </div>
                    )}
                </div>
            )}
            
            {loading && mapCenter && (
                <div className="loading-overlay-floating">
                    <Navigation className="animate-spin" size={32} color="#2c3e50" />
                    <span>Searching...</span>
                </div>
            )}
        </div>
        
        <div className="list-container">
          <div className="list-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h2 style={{ fontSize: '1.1rem' }}>Nearby ({sortedChurches.length})</h2>
            <div className="sort-controls">
                <button 
                    className={`sort-btn ${sortOption === 'distance' ? 'active' : ''}`}
                    onClick={() => setSortOption('distance')}
                >
                    Distance
                </button>
                <button 
                    className={`sort-btn ${sortOption === 'time' ? 'active' : ''}`}
                    onClick={() => setSortOption('time')}
                >
                    Next Mass
                </button>
            </div>
          </div>
          <ul className="church-list">
            {sortedChurches.map(church => (
              <li 
                key={church.id} 
                className={`church-item ${selectedChurchId === church.id ? 'active' : ''}`}
                onClick={() => handleChurchClick(church)}
              >
                <div className="church-info">
                  <div className="church-name">{church.name}</div>
                  <div className="church-address">{church.address || "Address not available"}</div>
                  <div className="church-distance">
                      <MapPin size={14} style={{ display: 'inline', marginRight: '4px' }} />
                      {church.distance} km
                  </div>
                  {church.nextMassTime ? (
                    <div style={{ fontSize: '0.85rem', marginTop: '0.4rem', color: '#e67e22', fontWeight: 600 }}>
                        Next Mass: {formatMinutes(church.nextMassTime)}
                    </div>
                  ) : church.massSchedule ? (
                    <div style={{ fontSize: '0.8rem', marginTop: '0.5rem', color: '#555' }}>
                        Mass Schedule Available
                    </div>
                  ) : null}
                </div>
                <div className="church-actions">
                  <a 
                    href={getGoogleMapsUrl(church.lat, church.lon)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="directions-btn"
                    onClick={(e) => e.stopPropagation()}
                    title="Get Directions"
                  >
                    <ExternalLink size={18} />
                  </a>
                </div>
              </li>
            ))}
            {churches.length === 0 && !loading && (
                <li className="church-item">No Catholic churches found nearby.</li>
            )}
          </ul>
        </div>
      </div>
    </div>
  );
}

export default App;