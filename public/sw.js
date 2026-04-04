// ============================================================
// MUMAA Platform - Service Worker for Push Notifications
// ============================================================

const CACHE_NAME = 'mumaa-push-v1';

// Install event - self-registration
self.addEventListener('install', (event) => {
  console.log('[MUMAA SW] Service Worker installed');
  event.waitUntil(self.skipWaiting());
});

// Activate event - clean old caches and take control
self.addEventListener('activate', (event) => {
  console.log('[MUMAA SW] Service Worker activated');
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames
          .filter((name) => name.startsWith('mumaa-') && name !== CACHE_NAME)
          .map((name) => caches.delete(name))
      );
    }).then(() => self.clients.claim())
  );
});

// Push event - show notification
self.addEventListener('push', (event) => {
  console.log('[MUMAA SW] Push event received');

  let payload;

  if (event.data) {
    try {
      payload = event.data.json();
    } catch {
      payload = {
        title: 'MUMAA Notification',
        body: event.data.text() || 'You have a new notification.',
      };
    }
  } else {
    payload = {
      title: 'MUMAA Notification',
      body: 'You have a new notification.',
    };
  }

  const notificationOptions = {
    body: payload.body || '',
    icon: payload.icon || '/logo.svg',
    badge: payload.badge || '/logo.svg',
    image: payload.image || undefined,
    tag: payload.tag || undefined,
    data: payload.data || {},
    requireInteraction: payload.requireInteraction || false,
    vibrate: payload.type === 'CALL_REQUEST' ? [200, 100, 200, 100, 200, 100, 200] : [100, 50, 100],
    actions: payload.actions || undefined,
  };

  // For incoming calls, add special actions
  if (payload.type === 'CALL_REQUEST') {
    notificationOptions.actions = [
      { action: 'accept', title: 'Accept Call' },
      { action: 'decline', title: 'Decline' },
    ];
    notificationOptions.requireInteraction = true;
  }

  event.waitUntil(
    self.registration.showNotification(payload.title || 'MUMAA Notification', notificationOptions)
  );
});

// Notification click event - handle user interaction
self.addEventListener('notificationclick', (event) => {
  console.log('[MUMAA SW] Notification clicked:', event.action);

  event.notification.close();

  const notificationData = event.notification.data || {};
  const clickUrl = notificationData.url || '/';

  if (event.action === 'accept') {
    // User accepted the call - open the app with call context
    handleCallAction('accept', notificationData);
  } else if (event.action === 'decline') {
    // User declined the call
    handleCallAction('decline', notificationData);
  } else {
    // Default click - open or focus the app
    event.waitUntil(
      self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
        // Focus existing window if available
        for (const client of clientList) {
          if (client.url.includes(self.location.origin) && 'focus' in client) {
            return client.focus();
          }
        }
        // Open new window
        if (self.clients.openWindow) {
          return self.clients.openWindow(clickUrl);
        }
        return null;
      })
    );
  }
});

// Handle call accept/decline actions
function handleCallAction(action, data) {
  const callId = data.callId;

  // Open the app with call context
  const url = callId ? `/?call=${callId}&action=${action}` : '/';

  self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
    for (const client of clientList) {
      if (client.url.includes(self.location.origin) && 'focus' in client) {
        // Post message to the focused window about the call action
        client.postMessage({
          type: 'PUSH_CALL_ACTION',
          action,
          callId,
        });
        return client.focus();
      }
    }
    // No existing window, open a new one
    if (self.clients.openWindow) {
      return self.clients.openWindow(url);
    }
    return null;
  });
}

// Listen for messages from the main thread
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
