const express = require('express');
const cors = require('cors');
const axios = require('axios');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(express.json());

// Инициализация базы данных
const dbPath = path.join(__dirname, 'geolocation.db');
const db = new sqlite3.Database(dbPath);

// Основные категории мест для поиска в OSM
const OSM_CATEGORIES = [
  'amenity=cafe',
  'amenity=restaurant',
  'amenity=bar',
  'amenity=pub',
  'tourism=hotel',
  'tourism=museum',
  'tourism=attraction',
  'tourism=artwork',
  'leisure=park',
  'leisure=garden',
  'leisure=playground',
  'shop=mall',
  'shop=supermarket',
  'historic=monument',
  'historic=castle',
  'building=church',
  'amenity=library',
  'amenity=cinema',
  'amenity=theatre'
];

// Функция для получения мест из OpenStreetMap Nominatim
// Улучшенная функция для получения мест из OSM
async function getPlacesFromOSM(lat, lng, radius = 2000) {
  try {
    const url = `${process.env.OPENSTREETMAP_NOMINATIM_URL}/search`;
    
    // Определяем bounding box для поиска
    const bbox = calculateBoundingBox(lat, lng, radius);
    
    // Категории для поиска (используем правильный формат для OSM)
    const searchQueries = [
      'cafe', 'restaurant', 'pub', 'bar', 'bakery',
      'park', 'garden', 'playground',
      'museum', 'art_gallery', 'theatre', 'cinema',
      'hotel', 'hostel', 'guest_house',
      'supermarket', 'mall', 'shop',
      'library', 'university', 'school',
      'pharmacy', 'hospital', 'clinic'
    ];

    let allPlaces = [];

    for (const query of searchQueries) {
      try {
        const response = await axios.get(url, {
          params: {
            q: query,
            format: 'json',
            lat: lat,
            lon: lng,
            bounded: 1,
            limit: 10,
            viewbox: bbox.viewbox,
            bounded: 1
          },
          timeout: 8000,
          headers: {
            'User-Agent': 'GeolocationService/1.0'
          }
        });

        if (response.data && Array.isArray(response.data)) {
          response.data.forEach(place => {
            // Проверяем, что место находится в пределах радиуса
            const distance = calculateDistance(lat, lng, parseFloat(place.lat), parseFloat(place.lon));
            if (distance <= (radius / 1000)) { // Конвертируем в км
              const formattedPlace = {
                id: place.place_id.toString(),
                name: place.display_name.split(',')[0] || place.name || query,
                type: getPlaceType(place, query),
                lat: parseFloat(place.lat),
                lng: parseFloat(place.lon),
                address: formatShortAddress(place.display_name),
                distance: distance.toFixed(2)
              };

              // Добавляем только уникальные места
              if (!allPlaces.find(p => p.id === formattedPlace.id)) {
                allPlaces.push(formattedPlace);
              }
            }
          });
        }

        // Задержка для соблюдения лимитов OSM API
        await new Promise(resolve => setTimeout(resolve, 1000));
        
      } catch (error) {
        console.log(`Ошибка при поиске ${query}:`, error.message);
        continue;
      }
    }

    // Сортируем по расстоянию и ограничиваем количество
    return allPlaces
      .sort((a, b) => parseFloat(a.distance) - parseFloat(b.distance))
      .slice(0, 30);

  } catch (error) {
    console.error('Ошибка при получении мест из OSM:', error);
    return getFallbackPlaces(lat, lng);
  }
}

// Улучшенная функция определения типа места
function getPlaceType(place, query) {
  // Сначала проверяем теги OSM
  if (place.class === 'amenity') {
    return place.type || 'amenity';
  }
  if (place.class === 'tourism') {
    return place.type || 'tourism';
  }
  if (place.class === 'leisure') {
    return place.type || 'leisure';
  }
  if (place.class === 'shop') {
    return place.type || 'shop';
  }
  
  // Если не нашли в тегах, используем поисковый запрос
  const typeMap = {
    'cafe': 'cafe',
    'restaurant': 'restaurant', 
    'pub': 'pub',
    'bar': 'bar',
    'bakery': 'bakery',
    'park': 'park',
    'garden': 'park',
    'playground': 'park',
    'museum': 'museum',
    'art_gallery': 'museum',
    'theatre': 'theatre',
    'cinema': 'cinema',
    'hotel': 'hotel',
    'supermarket': 'shop',
    'mall': 'shop',
    'library': 'library'
  };
  
  return typeMap[query] || query || 'unknown';
}

// Улучшенная функция форматирования адреса
function formatShortAddress(displayName) {
  const parts = displayName.split(',');
  if (parts.length <= 2) {
    return displayName;
  }
  // Берем первые 2-3 части (обычно название + улица + город)
  return parts.slice(0, Math.min(3, parts.length - 1)).join(', ');
}

// Улучшенная функция расчета расстояния
function calculateDistance(lat1, lng1, lat2, lng2) {
  const R = 6371; // Радиус Земли в км
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = 
    Math.sin(dLat/2) * Math.sin(dLat/2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * 
    Math.sin(dLng/2) * Math.sin(dLng/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return R * c;
}


// Альтернативный метод через Overpass API (более надежный)
async function getPlacesFromOverpass(lat, lng, radius = 2000) {
  try {
    const overpassUrl = 'https://overpass-api.de/api/interpreter';
    
    // Overpass QL запрос для поиска различных мест
    const query = `
      [out:json][timeout:25];
      (
        node["amenity"~"cafe|restaurant|pub|bar|fast_food|ice_cream"](${lat - 0.02},${lng - 0.02},${lat + 0.02},${lng + 0.02});
        node["tourism"~"museum|attraction|artwork|viewpoint"](${lat - 0.02},${lng - 0.02},${lat + 0.02},${lng + 0.02});
        node["leisure"~"park|garden|playground"](${lat - 0.02},${lng - 0.02},${lat + 0.02},${lng + 0.02});
        node["shop"](${lat - 0.02},${lng - 0.02},${lat + 0.02},${lng + 0.02});
      );
      out body;
      >;
      out skel qt;
    `;

    const response = await axios.post(overpassUrl, query, {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      timeout: 10000
    });

    if (response.data && response.data.elements) {
      const places = response.data.elements
        .filter(element => element.tags && element.tags.name)
        .map(element => {
          const distance = calculateDistance(lat, lng, element.lat, element.lon);
          return {
            id: element.id.toString(),
            name: element.tags.name,
            type: getOverpassPlaceType(element.tags),
            lat: element.lat,
            lng: element.lon,
            address: getOverpassAddress(element.tags),
            distance: distance.toFixed(2)
          };
        })
        .filter(place => place.distance <= 5) // Фильтруем по расстоянию (5 км)
        .sort((a, b) => parseFloat(a.distance) - parseFloat(b.distance))
        .slice(0, 25);

      return places;
    }

    return [];
  } catch (error) {
    console.error('Ошибка при запросе к Overpass API:', error);
    return [];
  }
}

function getOverpassPlaceType(tags) {
  if (tags.amenity) {
    return tags.amenity;
  }
  if (tags.tourism) {
    return tags.tourism;
  }
  if (tags.leisure) {
    return tags.leisure;
  }
  if (tags.shop) {
    return tags.shop;
  }
  return 'unknown';
}

function getOverpassAddress(tags) {
  const addressParts = [];
  if (tags['addr:street']) {
    addressParts.push(tags['addr:street']);
    if (tags['addr:housenumber']) {
      addressParts[addressParts.length - 1] += `, ${tags['addr:housenumber']}`;
    }
  }
  if (tags['addr:city']) {
    addressParts.push(tags['addr:city']);
  }
  return addressParts.length > 0 ? addressParts.join(', ') : 'Адрес не указан';
}


// Резервная функция с тестовыми данными
function getFallbackPlaces(lat, lng) {
  console.log('Using fallback places data');
  const placeTypes = ['cafe', 'restaurant', 'park', 'museum', 'shop', 'hotel'];
  const placeNames = {
    cafe: ['Кофейня "Уют"', 'Кофе Хаус', 'Ароматная чашка', 'Бодрое утро'],
    restaurant: ['Ресторан "Вкусно"', 'Итальянская кухня', 'Суши-бар', 'Гриль-хаус'],
    park: ['Центральный парк', 'Городской сад', 'Парк Победы', 'Сквер Отдыха'],
    museum: ['Краеведческий музей', 'Художественная галерея', 'Музей истории'],
    shop: ['Торговый центр', 'Супермаркет', 'Бутик', 'Универмаг'],
    hotel: ['Гостиница "Комфорт"', 'Отель "Престиж"', 'Мини-отель', 'Апартаменты']
  };

  const places = [];
  
  for (let i = 0; i < 15; i++) {
    const type = placeTypes[Math.floor(Math.random() * placeTypes.length)];
    const name = placeNames[type][Math.floor(Math.random() * placeNames[type].length)];
    
    const radius = 2;
    const randomLat = lat + (Math.random() - 0.5) * radius * 0.018;
    const randomLng = lng + (Math.random() - 0.5) * radius * 0.018;
    
    places.push({
      id: `fallback_${i + 1}`,
      name: `${name} ${i + 1}`,
      type: type,
      lat: randomLat,
      lng: randomLng,
      address: `ул. Примерная, ${Math.floor(Math.random() * 100) + 1}`,
      rating: (Math.random() * 2 + 3).toFixed(1),
      distance: (Math.random() * 2).toFixed(1)
    });
  }
  
  return places.sort((a, b) => parseFloat(a.distance) - parseFloat(b.distance));
}

// Функция для сохранения посещенного места
function saveVisitedPlace(place) {
  return new Promise((resolve, reject) => {
    db.get(
      `SELECT * FROM visited_places WHERE place_id = ?`,
      [place.id],
      (err, row) => {
        if (err) {
          reject(err);
          return;
        }

        if (row) {
          db.run(
            `UPDATE visited_places SET visit_count = visit_count + 1, last_visited = CURRENT_TIMESTAMP WHERE place_id = ?`,
            [place.id],
            function(err) {
              if (err) reject(err);
              else resolve({...row, visit_count: row.visit_count + 1});
            }
          );
        } else {
          db.run(
            `INSERT INTO visited_places (place_id, name, type, address, lat, lng, rating) VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [place.id, place.name, place.type, place.address, place.lat, place.lng, place.rating],
            function(err) {
              if (err) reject(err);
              else resolve({id: this.lastID, ...place, visit_count: 1});
            }
          );
        }
      }
    );
  });
}

// API для получения местоположения по IP
// API для получения мест рядом
app.get('/api/places', async (req, res) => {
  try {
    const { lat, lng } = req.query;
    
    if (!lat || !lng) {
      return res.status(400).json({
        success: false,
        error: 'Необходимы параметры lat и lng'
      });
    }

    const latitude = parseFloat(lat);
    const longitude = parseFloat(lng);

    console.log(`Поиск мест рядом с координатами: ${latitude}, ${longitude}`);

    // Пробуем оба метода
    const [nominatimPlaces, overpassPlaces] = await Promise.allSettled([
      getPlacesFromOSM(latitude, longitude),
      getPlacesFromOverpass(latitude, longitude)
    ]);

    let places = [];
    
    // Объединяем результаты из обоих источников
    if (overpassPlaces.status === 'fulfilled' && overpassPlaces.value.length > 0) {
      console.log(`Найдено мест через Overpass: ${overpassPlaces.value.length}`);
      places = overpassPlaces.value;
    } else if (nominatimPlaces.status === 'fulfilled' && nominatimPlaces.value.length > 0) {
      console.log(`Найдено мест через Nominatim: ${nominatimPlaces.value.length}`);
      places = nominatimPlaces.value;
    } else {
      console.log('Используем тестовые данные');
      places = getFallbackPlaces(latitude, longitude);
    }

    // Убираем дубликаты
    const uniquePlaces = places.reduce((acc, place) => {
      if (!acc.find(p => p.id === place.id)) {
        acc.push(place);
      }
      return acc;
    }, []);

    // Сохраняем в историю поиска
    db.run(
      `INSERT INTO search_history (query, lat, lng, results_count) VALUES (?, ?, ?, ?)`,
      [`places_near_${lat}_${lng}`, lat, lng, uniquePlaces.length]
    );

    res.json({
      success: true,
      places: uniquePlaces,
      source: uniquePlaces.length > 0 ? 'openstreetmap' : 'fallback',
      count: uniquePlaces.length
    });

  } catch (error) {
    console.error('Ошибка при получении мест:', error);
    res.status(500).json({
      success: false,
      error: 'Не удалось получить список мест'
    });
  }
});

// API для получения мест рядом из OpenStreetMap
app.get('/api/places', async (req, res) => {
  try {
    const { lat, lng } = req.query;
    
    if (!lat || !lng) {
      return res.status(400).json({
        success: false,
        error: 'Необходимы параметры lat и lng'
      });
    }

    const latitude = parseFloat(lat);
    const longitude = parseFloat(lng);

    // Получаем места из OpenStreetMap
    const places = await getPlacesFromOSM(latitude, longitude);

    // Сохраняем в историю поиска
    db.run(
      `INSERT INTO search_history (query, lat, lng, results_count) VALUES (?, ?, ?, ?)`,
      [`places_near_${lat}_${lng}`, lat, lng, places.length]
    );

    res.json({
      success: true,
      places: places.slice(0, 25), // Ограничиваем количество
      source: 'openstreetmap'
    });

  } catch (error) {
    console.error('Error getting places:', error);
    res.status(500).json({
      success: false,
      error: 'Не удалось получить список мест'
    });
  }
});

// API для поиска мест по названию в OpenStreetMap
app.get('/api/places/search', async (req, res) => {
  try {
    const { q, lat, lng } = req.query;
    
    if (!q) {
      return res.status(400).json({
        success: false,
        error: 'Необходим параметр q (поисковый запрос)'
      });
    }

    // Используем OSM Nominatim для поиска
    const response = await axios.get(`${process.env.OPENSTREETMAP_NOMINATIM_URL}/search`, {
      params: {
        q: q,
        format: 'json',
        limit: 20,
        lat: lat,
        lon: lng,
        bounded: 1,
        addressdetails: 1
      },
      timeout: 10000
    });

    const places = response.data.map(place => ({
      id: place.place_id,
      name: place.display_name.split(',')[0] || place.name || 'Неизвестное место',
      type: getPlaceType(place),
      lat: parseFloat(place.lat),
      lng: parseFloat(place.lon),
      address: formatAddress(place.display_name),
      distance: lat && lng ? calculateDistance(parseFloat(lat), parseFloat(lng), parseFloat(place.lat), parseFloat(place.lon)) : null
    }));

    // Сохраняем поисковый запрос
    db.run(
      `INSERT INTO search_history (query, lat, lng, results_count) VALUES (?, ?, ?, ?)`,
      [q, lat, lng, places.length]
    );

    res.json({
      success: true,
      places: places
    });

  } catch (error) {
    console.error('Error searching places:', error);
    res.status(500).json({
      success: false,
      error: 'Не удалось выполнить поиск'
    });
  }
});

// API для получения обратного геокодирования (адрес по координатам)
app.get('/api/geocode/reverse', async (req, res) => {
  try {
    const { lat, lng } = req.query;
    
    if (!lat || !lng) {
      return res.status(400).json({
        success: false,
        error: 'Необходимы параметры lat и lng'
      });
    }

    const response = await axios.get(`${process.env.OPENSTREETMAP_NOMINATIM_URL}/reverse`, {
      params: {
        lat: lat,
        lon: lng,
        format: 'json',
        addressdetails: 1
      }
    });

    res.json({
      success: true,
      address: response.data.display_name,
      details: response.data.address
    });

  } catch (error) {
    console.error('Error reverse geocoding:', error);
    res.status(500).json({
      success: false,
      error: 'Не удалось получить адрес'
    });
  }
});

// API для сохранения посещенного места
app.post('/api/places/visited', async (req, res) => {
  try {
    const place = req.body;
    
    if (!place.id || !place.name || !place.lat || !place.lng) {
      return res.status(400).json({
        success: false,
        error: 'Необходимы id, name, lat и lng'
      });
    }

    const savedPlace = await saveVisitedPlace(place);
    
    res.json({
      success: true,
      place: savedPlace
    });

  } catch (error) {
    console.error('Error saving visited place:', error);
    res.status(500).json({
      success: false,
      error: 'Не удалось сохранить место'
    });
  }
});

// API для получения истории посещенных мест
app.get('/api/places/visited', (req, res) => {
  const { limit = 50, orderBy = 'last_visited' } = req.query;

  db.all(
    `SELECT * FROM visited_places ORDER BY ${orderBy} DESC LIMIT ?`,
    [parseInt(limit)],
    (err, rows) => {
      if (err) {
        console.error('Error getting visited places:', err);
        return res.status(500).json({
          success: false,
          error: 'Не удалось получить историю'
        });
      }

      res.json({
        success: true,
        places: rows
      });
    }
  );
});

// API для получения истории поиска
app.get('/api/search/history', (req, res) => {
  const { limit = 20 } = req.query;

  db.all(
    `SELECT * FROM search_history ORDER BY created_at DESC LIMIT ?`,
    [parseInt(limit)],
    (err, rows) => {
      if (err) {
        console.error('Error getting search history:', err);
        return res.status(500).json({
          success: false,
          error: 'Не удалось получить историю поиска'
        });
      }

      res.json({
        success: true,
        history: rows
      });
    }
  );
});

// Статус API
app.get('/api/status', (req, res) => {
  res.json({
    success: true,
    service: 'Geolocation Service',
    version: '1.0.0',
    source: 'OpenStreetMap',
    database: 'SQLite',
    status: 'operational'
  });
});

app.listen(PORT, () => {
  console.log(`🚀 Сервер запущен на порту ${PORT}`);
  console.log(`🌍 Используется OpenStreetMap API`);
  console.log(`💾 База данных: SQLite`);
});