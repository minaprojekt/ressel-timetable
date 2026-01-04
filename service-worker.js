/**
 * Resseltrafiken Service Worker
 * Caches application assets for offline functionality
 * 
 * Version History:
 * 5.0.0 - Simplified timetable structure (50% fewer files)
 * 4.1.0 - Maintenance mode support + force update on version change
 * 4.0.0 - Förbättrad versionshantering och automatisk uppdatering
 * 3.0.0 - Förbättrad felhantering i fetch-event, fixad headers-kontroll
 * 2.0.0 - Förbättrad cachehantering för JSON-filer
 * 1.0.0 - Original service worker
 */

const APP_VERSION = '5.0.0';
const CACHE_NAME = `resseltrafiken-v${APP_VERSION}`;
const JSON_CACHE_NAME = `resseltrafiken-json-v${APP_VERSION}`;

// Statiska filer att cacha för offline-användning
const STATIC_FILES_TO_CACHE = [
  './',
  './index.html',
  './css/styles.css',
  './js/app.js',
  './js/timehandler.js',
  './js/renderer.js',
  './icons/boat.png',
  './manifest.json'
];

// JSON-filer som behöver hanteras med "network-first" strategi
// Version 5.0.0: Simplified structure with generic files
const JSON_FILES = [
  './data/ressel-sjo-config.json',
  './data/ressel-city-config.json',
  './data/ressel-sjo-weekday-standard.json',
  './data/ressel-sjo-weekday-summer.json',
  './data/ressel-sjo-weekend.json',
  './data/ressel-city-weekday-winter.json',
  './data/ressel-city-weekend-winter.json',
  // Legacy files still referenced by old configs (for backward compatibility)
  './data/ressel-city-spring-2025-weekday.json',
  './data/ressel-city-spring-2025-saturday.json',
  './data/ressel-city-spring-2025-sunday.json',
  './data/ressel-city-summer-2025-weekday.json',
  './data/ressel-city-summer-2025-saturday.json',
  './data/ressel-city-summer-2025-sunday.json',
  './data/ressel-city-fall-2025-weekday.json',
  './data/ressel-city-fall-2025-saturday.json',
  './data/ressel-city-fall-2025-sunday.json',
  './data/ressel-city-fall-extended-2025-weekday.json',
  './data/ressel-city-fall-extended-2025-saturday.json',
  './data/ressel-city-fall-extended-2025-sunday.json',
  './data/ressel-city-maintenance-2025-weekday.json',
  './data/ressel-city-maintenance-2025-saturday.json',
  './data/ressel-city-maintenance-2025-sunday.json'
];

// Check for version mismatch
const checkVersion = async () => {
  try {
    const response = await fetch('./manifest.json?_=' + Date.now());
    if (response.ok) {
      const manifest = await response.json();
      
      // If manifest version doesn't match current SW version
      if (manifest.version && manifest.version !== APP_VERSION) {
        console.log(`Version mismatch detected: SW=${APP_VERSION}, Manifest=${manifest.version}`);
        
        // Notify all clients about the update
        const clients = await self.clients.matchAll();
        for (const client of clients) {
          client.postMessage({
            type: 'UPDATE_AVAILABLE',
            current: APP_VERSION,
            new: manifest.version
          });
        }
      }
    }
  } catch (error) {
    console.error('Error checking version:', error);
  }
};

// Install event - cache static assets
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('Caching static files');
        return cache.addAll(STATIC_FILES_TO_CACHE);
      })
      .then(() => {
        // Pre-cache JSON files as fallback (only attempt, don't fail if missing)
        return caches.open(JSON_CACHE_NAME)
          .then((jsonCache) => {
            console.log('Pre-caching JSON files for offline use');
            // Try to cache each file individually, ignore 404s
            return Promise.allSettled(
              JSON_FILES.map(file => 
                fetch(file)
                  .then(response => {
                    if (response.ok) {
                      return jsonCache.put(file, response);
                    }
                  })
                  .catch(() => {
                    // Ignore missing files silently
                  })
              )
            );
          });
      })
      .then(() => {
        // Skip waiting to activate the new service worker immediately
        return self.skipWaiting();
      })
      .catch(error => {
        console.error('Fel vid cacheinstallation:', error);
      })
  );
});

// Activate event - clean up old caches
self.addEventListener('activate', (event) => {
  const cacheWhitelist = [CACHE_NAME, JSON_CACHE_NAME];
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheWhitelist.indexOf(cacheName) === -1) {
            console.log('Deleting old cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    })
    .then(() => {
      // Take control of all clients immediately
      return self.clients.claim();
    })
    .then(() => {
      // Check for version changes
      return checkVersion();
    })
    .catch(error => {
      console.error('Fel vid cachaktivering:', error);
    })
  );
});

// Periodic version check (every hour)
setInterval(() => {
  checkVersion();
}, 3600000); // 1 hour

// Fetch event - network-first for JSON, cache-first for static assets
self.addEventListener('fetch', (event) => {
  try {
    const url = new URL(event.request.url);
    
    // Använd network-first strategi för JSON-filer för att alltid visa aktuella tider
    if (url.pathname.endsWith('.json')) {
      event.respondWith(
        fetch(event.request)
          .then(response => {
            // Cacha en kopia av svaret för offline-användning
            const clonedResponse = response.clone();
            caches.open(JSON_CACHE_NAME)
              .then(cache => cache.put(event.request, clonedResponse))
              .catch(err => console.warn('Kunde inte cacha JSON-svar:', err));
            
            return response;
          })
          .catch(() => {
            // Fallback till cache om nätverket inte är tillgängligt
            return caches.match(event.request)
              .catch(err => {
                console.warn('Kunde inte hämta från JSON-cache:', err);
                // Om vi inte kan hämta från cache heller, returnera ett tomt svar
                return new Response(JSON.stringify({error: 'Offline och ingen cachedata tillgänglig'}), {
                  headers: {'Content-Type': 'application/json'}
                });
              });
          })
      );
      return;
    }
    
    // För alla andra resurser, använd cache-first strategi
    event.respondWith(
      caches.match(event.request)
        .then((response) => {
          // Cache hit - return response
          if (response) {
            return response;
          }
          
          // Clone the request
          const fetchRequest = event.request.clone();
          
          return fetch(fetchRequest)
            .then((response) => {
              // Check if valid response
              if (!response || response.status !== 200) {
                return response;
              }
              
              // Säker kontroll för "basic" typ - vissa browsers kan hantera detta annorlunda
              const responseToCache = response.clone();
              
              caches.open(CACHE_NAME)
                .then((cache) => {
                  // Don't cache API requests
                  if (!event.request.url.includes('/api/')) {
                    cache.put(event.request, responseToCache)
                      .catch(err => console.warn('Kunde inte cacha:', err));
                  }
                })
                .catch(err => console.warn('Kunde inte öppna cache:', err));
                
              return response;
            })
            .catch((error) => {
              console.warn('Fetch misslyckades:', error);
              
              // Provide fallback for HTML pages
              if (event.request.headers && event.request.headers.get('accept') && 
                  event.request.headers.get('accept').includes('text/html')) {
                return caches.match('./index.html');
              }
              
              // Annars returnera ett passande felsvar
              return new Response('Offline och ingen cachedata tillgänglig', {
                status: 503,
                statusText: 'Service Unavailable',
                headers: new Headers({
                  'Content-Type': 'text/plain'
                })
              });
            });
        })
        .catch(err => {
          console.error('Fel i cache.match:', err);
          return new Response('Ett fel inträffade', {
            status: 500,
            headers: new Headers({
              'Content-Type': 'text/plain'
            })
          });
        })
    );
  } catch (error) {
    console.error('Fel i fetch-händelse:', error);
    
    // Om något går riktigt fel, ge ett generiskt svar
    event.respondWith(
      new Response('Ett allvarligt fel inträffade', {
        status: 500,
        headers: new Headers({
          'Content-Type': 'text/plain'
        })
      })
    );
  }
});

// Extra händelselyssnare för att hantera kommunikation med huvudtråden
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  } else if (event.data && event.data.type === 'CHECK_VERSION') {
    checkVersion();
  } else if (event.data && event.data.type === 'CLEAR_CACHES') {
    // Rensa alla cacher och meddela om det är klart
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          return caches.delete(cacheName);
        })
      );
    }).then(() => {
      // Meddela att alla cacher är borttagna
      event.ports[0].postMessage({ success: true });
    }).catch(error => {
      console.error('Fel vid rensning av cacher:', error);
      event.ports[0].postMessage({ success: false, error: error.message });
    });
  }
});
