const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.join(__dirname, 'geolocation.db');
const db = new sqlite3.Database(dbPath);

db.serialize(() => {
  // Таблица для истории посещенных мест
  db.run(`CREATE TABLE IF NOT EXISTS visited_places (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    place_id TEXT UNIQUE,
    name TEXT NOT NULL,
    type TEXT,
    address TEXT,
    lat REAL NOT NULL,
    lng REAL NOT NULL,
    rating REAL,
    visit_count INTEGER DEFAULT 1,
    last_visited DATETIME DEFAULT CURRENT_TIMESTAMP,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  // Таблица для поисковых запросов
  db.run(`CREATE TABLE IF NOT EXISTS search_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    query TEXT NOT NULL,
    lat REAL,
    lng REAL,
    results_count INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  console.log('База данных инициализирована');
});

db.close();