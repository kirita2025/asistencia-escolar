const CACHE_NAME = 'asistencia-escolar-v2';

// Archivos que queremos guardar para que la app abra rápido (incluso offline)
const ASSETS = [
  '/',
  '/index.html'
  // Si tienes css o js separados, agrégalos aquí: '/style.css', '/app.js'
];

// 1. INSTALACIÓN: Guardamos los archivos básicos
self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS);
    })
  );
  self.skipWaiting(); // Fuerza la actualización inmediata
});

// 2. ACTIVACIÓN: Tomamos el control de todas las pestañas
self.addEventListener('activate', (e) => {
  e.waitUntil(clients.claim());
});

// 3. PETICIONES (FETCH): Estrategia inteligente
self.addEventListener('fetch', (e) => {
  
  // A. Si es una llamada a nuestra API (datos de alumnos/asistencia)
  // 👉 SIEMPRE vamos a la red. No queremos datos viejos.
  if (e.request.url.includes('/api/')) {
    e.respondWith(fetch(e.request));
    return;
  }

  // B. Si son archivos de la app (imágenes, html, etc)
  // 👉 Intentamos caché primero para velocidad, si no, vamos a la red.
  e.respondWith(
    caches.match(e.request).then((res) => {
      return res || fetch(e.request);
    })
  );
});