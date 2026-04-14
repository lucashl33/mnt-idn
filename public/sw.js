importScripts('https://www.gstatic.com/firebasejs/10.7.0/firebase-app.compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.7.0/firebase-messaging-compat.js');

// Inicializar Firebase (será preenchido dinamicamente)
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'INIT_FIREBASE') {
    const config = event.data.config;
    firebase.initializeApp(config);
  }
});

self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(clients.claim());
});

// Lidar com mensagens FCM background
self.addEventListener('push', (event) => {
  if (event.data) {
    const data = event.data.json();
    const notification = data.notification;
    
    const title = notification?.title || 'Notificação';
    const options = {
      body: notification?.body,
      icon: notification?.icon || '/favicon.png',
      badge: '/favicon.png',
      tag: data.data?.tag || 'default',
      data: data.data || {},
      requireInteraction: data.data?.requireInteraction === 'true',
    };

    event.waitUntil(
      self.registration.showNotification(title, options)
    );
  }
});

// Lidar com clique em notificação
self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const data = event.notification.data;
  const action = data.action || 'open_app';
  
  event.waitUntil(
    clients.matchAll({ type: 'window' }).then((clientList) => {
      // Procurar por uma aba existente
      for (const client of clientList) {
        if (client.url === '/' && 'focus' in client) {
          return client.focus();
        }
      }
      // Abrir nova aba se não existir
      if (clients.openWindow) {
        const url = data.url || '/';
        return clients.openWindow(url);
      }
    })
  );
});

// Passar-through para outras requisições
self.addEventListener('fetch', (event) => {
  event.respondWith(fetch(event.request));
});

