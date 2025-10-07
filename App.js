import React, { useState, useEffect } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import './App.css';

// Фикс для иконок маркеров
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
});

// Иконки для разных типов мест OSM
const placeIcons = {
  cafe: new L.Icon({
    iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-green.png',
    shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
    iconSize: [25, 41],
    iconAnchor: [12, 41],
  }),
  restaurant: new L.Icon({
    iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-red.png',
    shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
    iconSize: [25, 41],
    iconAnchor: [12, 41],
  }),
  park: new L.Icon({
    iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-green.png',
    shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
    iconSize: [25, 41],
    iconAnchor: [12, 41],
  }),
  museum: new L.Icon({
    iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-violet.png',
    shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
    iconSize: [25, 41],
    iconAnchor: [12, 41],
  }),
  hotel: new L.Icon({
    iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-blue.png',
    shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
    iconSize: [25, 41],
    iconAnchor: [12, 41],
  }),
  shop: new L.Icon({
    iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-orange.png',
    shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
    iconSize: [25, 41],
    iconAnchor: [12, 41],
  }),
  default: new L.Icon.Default()
};

function ChangeView({ center, zoom }) {
  const map = useMap();
  useEffect(() => {
    map.setView(center, zoom);
  }, [center, zoom, map]);
  return null;
}

function App() {
  const [userLocation, setUserLocation] = useState([55.7558, 37.6173]);
  const [places, setPlaces] = useState([]);
  const [visitedPlaces, setVisitedPlaces] = useState([]);
  const [searchHistory, setSearchHistory] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState('nearby');
  const [currentAddress, setCurrentAddress] = useState('');

  const getIconForPlace = (type) => {
    return placeIcons[type] || placeIcons.default;
  };

  const getCurrentLocation = () => {
  setLoading(true);
  setError('');
  
  if (!navigator.geolocation) {
    setError('Геолокация не поддерживается вашим браузером');
    // Если геолокация не поддерживается, используем IP
    getLocationByIP();
    return;
  }

  navigator.geolocation.getCurrentPosition(
    async (position) => {
      const { latitude, longitude } = position.coords;
      setUserLocation([latitude, longitude]);
      await getNearbyPlaces(latitude, longitude);
      await getCurrentAddress(latitude, longitude);
      setLoading(false);
    },
    async (error) => {
      console.error('Error getting precise location:', error);
      let errorMessage = 'Не удалось получить точное местоположение';
      
      switch(error.code) {
        case error.PERMISSION_DENIED:
          errorMessage = 'Доступ к геолокации запрещен. Используется местоположение по IP';
          break;
        case error.POSITION_UNAVAILABLE:
          errorMessage = 'Информация о местоположении недоступна. Используется местоположение по IP';
          break;
        case error.TIMEOUT:
          errorMessage = 'Время ожидания геолокации истекло. Используется местоположение по IP';
          break;
      }
      
      setError(errorMessage);
      // Используем определение по IP как fallback
      await getLocationByIP();
      setLoading(false);
    },
    {
      enableHighAccuracy: true,
      timeout: 10000,
      maximumAge: 60000
    }
  );
};

    const getLocationByIP = async () => {
      try {
        const response = await fetch('http://localhost:5000/api/location');
        const data = await response.json();
        
        if (data.success) {
          setUserLocation([data.lat, data.lng]);
          await getNearbyPlaces(data.lat, data.lng);
          await getCurrentAddress(data.lat, data.lng);
          console.log('Местоположение определено по IP:', data.message);
        } else {
          throw new Error(data.error || 'Ошибка при определении местоположения по IP');
        }
      } catch (err) {
        console.error('Error getting location by IP:', err);
        setError('Не удалось определить местоположение по IP');
      } 
    };
  

  const getNearbyPlaces = async (lat, lng) => {
    try {
      setLoading(true);
      const response = await fetch(`http://localhost:5000/api/places?lat=${lat}&lng=${lng}`);
      const data = await response.json();
      
      if (data.success) {
        setPlaces(data.places);
        setActiveTab('nearby');
      } else {
        setError(data.error || 'Ошибка при получении мест');
      }
    } catch (err) {
      console.error('Error getting places:', err);
      setError('Ошибка соединения с сервером');
    } finally {
      setLoading(false);
    }
  };

  const getCurrentAddress = async (lat, lng) => {
    try {
      const response = await fetch(`http://localhost:5000/api/geocode/reverse?lat=${lat}&lng=${lng}`);
      const data = await response.json();
      
      if (data.success) {
        setCurrentAddress(data.address);
      }
    } catch (err) {
      console.error('Error getting address:', err);
    }
  };

  const searchPlaces = async (query) => {
    if (!query.trim()) return;
    
    try {
      setLoading(true);
      const response = await fetch(
        `http://localhost:5000/api/places/search?q=${encodeURIComponent(query)}&lat=${userLocation[0]}&lng=${userLocation[1]}`
      );
      const data = await response.json();
      
      if (data.success) {
        setPlaces(data.places);
        setActiveTab('search');
        setSearchQuery('');
      } else {
        setError(data.error || 'Ошибка при поиске');
      }
    } catch (err) {
      console.error('Error searching places:', err);
      setError('Ошибка соединения с сервером');
    } finally {
      setLoading(false);
    }
  };

  const saveVisitedPlace = async (place) => {
    try {
      const response = await fetch('http://localhost:5000/api/places/visited', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(place)
      });
      
      const data = await response.json();
      if (data.success) {
        loadVisitedPlaces();
      }
    } catch (err) {
      console.error('Error saving visited place:', err);
    }
  };

  const loadVisitedPlaces = async () => {
    try {
      const response = await fetch('http://localhost:5000/api/places/visited');
      const data = await response.json();
      
      if (data.success) {
        setVisitedPlaces(data.places);
      }
    } catch (err) {
      console.error('Error loading visited places:', err);
    }
  };

  const loadSearchHistory = async () => {
    try {
      const response = await fetch('http://localhost:5000/api/search/history');
      const data = await response.json();
      
      if (data.success) {
        setSearchHistory(data.history);
      }
    } catch (err) {
      console.error('Error loading search history:', err);
    }
  };

  useEffect(() => {
    getCurrentLocation()
    getLocationByIP()
    loadVisitedPlaces();
    loadSearchHistory();
  }, []);

  const handlePlaceClick = (place) => {
    saveVisitedPlace(place);
  };

  return (
    <div className="App">
      <header className="app-header">
        <h1>🌍 Геолокационный сервис (OpenStreetMap)</h1>
        <div className="header-controls">
          <div className="search-box">
            <input
              type="text"
              placeholder="Поиск мест..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && searchPlaces(searchQuery)}
            />
            <button onClick={() => searchPlaces(searchQuery)}>🔍</button>
          </div>
          <button 
            onClick={getCurrentLocation}
            disabled={loading}
            className="location-btn"
          >
            {loading ? '📍 Определение...' : '📍 Мое местоположение'}
          </button>
        </div>
      </header>

      {currentAddress && (
        <div className="current-address">
          📍 Текущее местоположение: {currentAddress}
        </div>
      )}

      <div className="app-content">
        <div className="map-container">
          {userLocation ? (
            <MapContainer
              center={userLocation}
              zoom={13}
              style={{ height: '100%', width: '100%' }}
            >
              <ChangeView center={userLocation} zoom={13} />
              <TileLayer
                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
              />
              
              <Marker position={userLocation}>
                <Popup>
                  <strong>📍 Ваше местоположение</strong>
                  {currentAddress && <p>{currentAddress}</p>}
                </Popup>
              </Marker>
              
              {places.map(place => (
                <Marker
                  key={place.id}
                  position={[place.lat, place.lng]}
                  icon={getIconForPlace(place.type)}
                  eventHandlers={{
                    click: () => handlePlaceClick(place),
                  }}
                >
                  <Popup>
                    <div className="popup-content">
                      <h3>{place.name}</h3>
                      <p><strong>Тип:</strong> {place.type}</p>
                      <p><strong>Адрес:</strong> {place.address}</p>
                      {place.distance && <p><strong>Расстояние:</strong> {place.distance} км</p>}
                      <p><em>Данные предоставлены OpenStreetMap</em></p>
                    </div>
                  </Popup>
                </Marker>
              ))}
            </MapContainer>
          ) : (
            <div className="map-placeholder">
              {loading ? 'Загрузка карты...' : 'Нажмите кнопку для определения местоположения'}
            </div>
          )}
        </div>

        <div className="places-sidebar">
          <div className="sidebar-tabs">
            <button 
              className={activeTab === 'nearby' ? 'active' : ''}
              onClick={() => setActiveTab('nearby')}
            >
              Ближайшие
            </button>
            <button 
              className={activeTab === 'visited' ? 'active' : ''}
              onClick={() => setActiveTab('visited')}
            >
              История ({visitedPlaces.length})
            </button>
            <button 
              className={activeTab === 'searches' ? 'active' : ''}
              onClick={() => setActiveTab('searches')}
            >
              Поиски
            </button>
          </div>

          <div className="tab-content">
            {error && <div className="error-message">{error}</div>}
            
            {activeTab === 'nearby' && (
              <div className="places-list">
                <h3>📍 Ближайшие места</h3>
                {loading && <div className="loading">Загрузка...</div>}
                {places.map(place => (
                  <div 
                    key={place.id} 
                    className="place-card"
                    onClick={() => handlePlaceClick(place)}
                  >
                    <h4>{place.name}</h4>
                    <p className="place-type">{place.type}</p>
                    <p className="place-address">{place.address}</p>
                    <div className="place-info">
                      {place.distance && <span className="distance">{place.distance} км</span>}
                      <span className="source">OSM</span>
                    </div>
                  </div>
                ))}
                {places.length === 0 && !loading && (
                  <p className="no-places">Нет nearby мест для отображения</p>
                )}
              </div>
            )}

            {activeTab === 'visited' && (
              <div className="places-list">
                <h3>📚 Посещенные места</h3>
                {visitedPlaces.map(place => (
                  <div key={place.id} className="place-card visited">
                    <h4>{place.name}</h4>
                    <p className="place-type">{place.type}</p>
                    <p className="place-address">{place.address}</p>
                    <div className="place-info">
                      <span className="visits">👁️ {place.visit_count} раз</span>
                      <span className="last-visited">
                        {new Date(place.last_visited).toLocaleDateString()}
                      </span>
                    </div>
                  </div>
                ))}
                {visitedPlaces.length === 0 && (
                  <p className="no-places">Вы еще не посещали места</p>
                )}
              </div>
            )}

            {activeTab === 'searches' && (
              <div className="places-list">
                <h3>🔍 История поиска</h3>
                {searchHistory.map(record => (
                  <div key={record.id} className="search-record">
                    <p className="search-query">"{record.query}"</p>
                    <div className="search-info">
                      <span>{new Date(record.created_at).toLocaleString()}</span>
                      <span>{record.results_count} результатов</span>
                    </div>
                  </div>
                ))}
                {searchHistory.length === 0 && (
                  <p className="no-places">История поиска пуста</p>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default App;