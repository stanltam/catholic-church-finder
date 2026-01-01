import { useEffect, useState } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { type Church, findNearbyChurches } from './services/churchService';
import './App.css';
import { MapPin, Navigation, Cross, ExternalLink, Locate } from 'lucide-react';

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

function MapUpdater({ center }: { center: [number, number] }) {
  const map = useMap();
  useEffect(() => {
    map.setView(center, 14);
  }, [center, map]);
  return null;
}

function RecenterControl({ location }: { location: [number, number] }) {
  const map = useMap();
  
  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    map.setView(location, 15);
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
            <Locate size={20} />
        </a>
      </div>
    </div>
  );
}

function App() {
  const [location, setLocation] = useState<[number, number] | null>(null);
  const [churches, setChurches] = useState<Church[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedChurchId, setSelectedChurchId] = useState<number | null>(null);

  useEffect(() => {
    if (!navigator.geolocation) {
      setError("Geolocation is not supported by your browser.");
      setLoading(false);
      return;
    }

    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const { latitude, longitude } = position.coords;
        setLocation([latitude, longitude]);
        
        try {
          const results = await findNearbyChurches(latitude, longitude);
          setChurches(results);
        } catch (err) {
          console.error(err);
          setError("Failed to fetch nearby churches. Please try again later.");
        } finally {
          setLoading(false);
        }
      },
      (err) => {
        console.error(err);
        setError("Unable to retrieve your location. Please allow location access.");
        setLoading(false);
      }
    );
  }, []);

  const handleChurchClick = (church: Church) => {
    setSelectedChurchId(church.id);
  };

  const getGoogleMapsUrl = (lat: number, lon: number) => {
    return `https://www.google.com/maps/dir/?api=1&destination=${lat},${lon}`;
  };

  const selectedChurch = churches.find(c => c.id === selectedChurchId);

  if (loading) {
    return (
      <div className="loading-overlay">
        <Navigation className="animate-spin" size={48} color="#2c3e50" />
        <p>Finding nearest Catholic churches...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="error-overlay">
        <p>{error}</p>
        <button className="btn" onClick={() => window.location.reload()}>Retry</button>
      </div>
    );
  }

  return (
    <div className="app-container">
      <header>
        <h1><Cross size={24} /> Catholic Church Finder</h1>
      </header>
      
      <div className="content">
        <div className="map-container">
            {location && (
              <MapContainer center={location} zoom={13} scrollWheelZoom={true}>
                <TileLayer
                  attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                  url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                />
                <Marker position={location} icon={userIcon}>
                  <Popup>
                    You are here
                  </Popup>
                </Marker>
                
                {churches.map(church => (
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

                {/* If a church is selected from the list, pan to it */}
                {selectedChurch && <MapUpdater center={[selectedChurch.lat, selectedChurch.lon]} />}
                
                <RecenterControl location={location} />
              </MapContainer>
            )}
        </div>
        
        <div className="list-container">
          <div className="list-header">
            <h2>Nearby Churches ({churches.length})</h2>
          </div>
          <ul className="church-list">
            {churches.map(church => (
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
                  {church.massSchedule && (
                    <div style={{ fontSize: '0.8rem', marginTop: '0.5rem', color: '#555' }}>
                        <strong>Mass Schedule Available</strong>
                    </div>
                  )}
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
            {churches.length === 0 && (
                <li className="church-item">No Catholic churches found nearby.</li>
            )}
          </ul>
        </div>
      </div>
    </div>
  );
}

export default App;