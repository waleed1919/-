// sw.js - Service Worker للفراعنة للعقارات
const CACHE_NAME = 'pharaoh-realestate-v3.0.0';
const STATIC_CACHE = 'pharaoh-static-v3';
const DYNAMIC_CACHE = 'pharaoh-dynamic-v3';
const IMAGE_CACHE = 'pharaoh-images-v3';
const VIDEO_CACHE = 'pharaoh-video-v3';

// الملفات الأساسية للتخزين المؤقت
const STATIC_FILES = [
  '/',
  '/index.html',
  '/eqarat-masr.html',
  '/manifest.json',
  '/icon-192.png',
  '/icon-512.png',
  '/videos/designarena_video_06u8zgds.mp4',
  'designarena_video_06u8zgds.mp4',
  'https://fonts.googleapis.com/css2?family=Tajawal:wght@300;400;500;700;800;900&family=Amiri:wght@400;700&display=swap',
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css',
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js',
  'https://cdn.jsdelivr.net/npm/pannellum@2.5.6/build/pannellum.css',
  'https://cdn.jsdelivr.net/npm/pannellum@2.5.6/build/pannellum.js',
  'https://cdn.tailwindcss.com'
];

// حجم máximo للتخزين المؤقت (50 MB)
const MAX_CACHE_SIZE = 50 * 1024 * 1024;

// تثبيت Service Worker
self.addEventListener('install', (event) => {
  console.log('[SW] Installing Service Worker v3.0.0...');
  
  event.waitUntil(
    caches.open(STATIC_CACHE)
      .then((cache) => {
        console.log('[SW] Caching static assets');
        // تخزين الملفات الثابتة واحداً تلو الآخر لتجنب الفشل
        return Promise.allSettled(
          STATIC_FILES.map(url => 
            cache.add(url).catch(err => {
              console.warn(`[SW] Failed to cache: ${url}`, err);
              return null;
            })
          )
        );
      })
      .then(() => {
        console.log('[SW] Static assets cached successfully');
        return self.skipWaiting();
      })
      .catch((error) => {
        console.error('[SW] Failed to cache static assets:', error);
      })
  );
});

// تفعيل Service Worker
self.addEventListener('activate', (event) => {
  console.log('[SW] Activating Service Worker v3.0.0...');
  
  event.waitUntil(
    caches.keys()
      .then((cacheNames) => {
        return Promise.all(
          cacheNames
            .filter((cacheName) => {
              return cacheName !== STATIC_CACHE && 
                     cacheName !== DYNAMIC_CACHE && 
                     cacheName !== IMAGE_CACHE &&
                     cacheName !== VIDEO_CACHE;
            })
            .map((cacheName) => {
              console.log('[SW] Deleting old cache:', cacheName);
              return caches.delete(cacheName);
            })
        );
      })
      .then(() => {
        console.log('[SW] Service Worker activated');
        return self.clients.claim();
      })
      .then(() => {
        // إرسال رسالة للتحديث
        return self.clients.matchAll().then(clients => {
          clients.forEach(client => {
            client.postMessage({
              type: 'SW_ACTIVATED',
              version: CACHE_NAME
            });
          });
        });
      })
  );
});

// استراتيجية التخزين المؤقت
const cacheStrategies = {
  // Cache First - للملفات الثابتة
  cacheFirst: async (request) => {
    const cachedResponse = await caches.match(request);
    if (cachedResponse) {
      return cachedResponse;
    }
    
    try {
      const networkResponse = await fetch(request);
      if (networkResponse.ok) {
        const cache = await caches.open(STATIC_CACHE);
        cache.put(request, networkResponse.clone());
      }
      return networkResponse;
    } catch (error) {
      console.error('[SW] Cache First failed:', error);
      return new Response('Offline - المحتوى غير متاح', {
        status: 503,
        statusText: 'Service Unavailable',
        headers: { 'Content-Type': 'text/plain; charset=utf-8' }
      });
    }
  },
  
  // Network First - للبيانات الديناميكية
  networkFirst: async (request) => {
    try {
      const networkResponse = await fetch(request);
      if (networkResponse.ok) {
        const cache = await caches.open(DYNAMIC_CACHE);
        cache.put(request, networkResponse.clone());
      }
      return networkResponse;
    } catch (error) {
      const cachedResponse = await caches.match(request);
      if (cachedResponse) {
        return cachedResponse;
      }
      return new Response(JSON.stringify({ error: 'Offline', message: 'لا يوجد اتصال بالإنترنت' }), {
        status: 503,
        headers: { 'Content-Type': 'application/json; charset=utf-8' }
      });
    }
  },
  
  // Stale While Revalidate - للصور
  staleWhileRevalidate: async (request) => {
    const cachedResponse = await caches.match(request);
    
    const fetchPromise = fetch(request)
      .then((networkResponse) => {
        if (networkResponse.ok) {
          caches.open(IMAGE_CACHE).then((cache) => {
            cache.put(request, networkResponse.clone());
          });
        }
        return networkResponse;
      })
      .catch(() => cachedResponse);
    
    return cachedResponse || fetchPromise;
  },

  // Video Cache Strategy - للفيديوهات
  videoCache: async (request) => {
    // تحقق من الكاش أولاً
    const cachedResponse = await caches.match(request);
    if (cachedResponse) {
      console.log('[SW] Video served from cache:', request.url);
      return cachedResponse;
    }

    try {
      console.log('[SW] Fetching video from network:', request.url);
      const networkResponse = await fetch(request);
      
      if (networkResponse.ok) {
        // تخزين الفيديو في كاش مخصص
        const cache = await caches.open(VIDEO_CACHE);
        cache.put(request, networkResponse.clone());
        console.log('[SW] Video cached successfully:', request.url);
      }
      return networkResponse;
    } catch (error) {
      console.error('[SW] Video fetch failed:', error);
      // محاولة البحث في الكاش القديم
      const oldCache = await caches.match(request);
      if (oldCache) {
        return oldCache;
      }
      return new Response('Video not available offline', {
        status: 503,
        statusText: 'Service Unavailable'
      });
    }
  },

  // Range Request Support - للفيديوهات (Seek)
  rangeRequest: async (request) => {
    const cachedResponse = await caches.match(request.url, { ignoreVary: true });
    
    if (cachedResponse) {
      return cachedResponse;
    }

    try {
      const networkResponse = await fetch(request);
      if (networkResponse.ok) {
        const cache = await caches.open(VIDEO_CACHE);
        cache.put(request.url, networkResponse.clone());
      }
      return networkResponse;
    } catch (error) {
      console.error('[SW] Range request failed:', error);
      return new Response(null, { status: 503 });
    }
  }
};

// تحديد نوع الملف
function getAssetType(url) {
  const pathname = url.pathname.toLowerCase();
  
  if (pathname.endsWith('.mp4') || pathname.endsWith('.webm') || pathname.endsWith('.mov')) {
    return 'video';
  }
  if (pathname.endsWith('.jpg') || pathname.endsWith('.jpeg') || 
      pathname.endsWith('.png') || pathname.endsWith('.gif') || 
      pathname.endsWith('.webp') || pathname.endsWith('.svg')) {
    return 'image';
  }
  if (pathname.endsWith('.css')) {
    return 'style';
  }
  if (pathname.endsWith('.js')) {
    return 'script';
  }
  if (pathname.endsWith('.woff') || pathname.endsWith('.woff2') || 
      pathname.endsWith('.ttf') || pathname.endsWith('.otf')) {
    return 'font';
  }
  return 'other';
}

// معالجة طلبات الشبكة
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);
  
  // تجاهل طلبات Chrome extensions و non-GET
  if (url.protocol === 'chrome-extension:' || request.method !== 'GET') {
    return;
  }

  // تجاهل طلبات Firebase و Google APIs (تستخدم استراتيجية Network First)
  if (url.hostname.includes('firebase') || 
      url.hostname.includes('googleapis') ||
      url.hostname.includes('gstatic')) {
    event.respondWith(cacheStrategies.networkFirst(request));
    return;
  }

  // تحديد نوع الملف
  const assetType = getAssetType(url);

  // تطبيق الاستراتيجية المناسبة
  switch (assetType) {
    case 'video':
      // دعم Range Requests للفيديو
      if (request.headers.has('range')) {
        event.respondWith(cacheStrategies.rangeRequest(request));
      } else {
        event.respondWith(cacheStrategies.videoCache(request));
      }
      break;
      
    case 'image':
      event.respondWith(cacheStrategies.staleWhileRevalidate(request));
      break;
      
    case 'style':
    case 'script':
    case 'font':
      event.respondWith(cacheStrategies.cacheFirst(request));
      break;
      
    default:
      // للـ HTML والملفات الأخرى
      if (request.headers.get('accept')?.includes('text/html')) {
        event.respondWith(cacheStrategies.networkFirst(request));
      } else {
        event.respondWith(cacheStrategies.cacheFirst(request));
      }
  }
});

// معالجة الرسائل من التطبيق
self.addEventListener('message', (event) => {
  console.log('[SW] Message received:', event.data);
  
  if (!event.data) return;

  switch (event.data.type) {
    case 'SKIP_WAITING':
      self.skipWaiting();
      break;
      
    case 'CLEAR_CACHE':
      clearAllCaches().then(() => {
        if (event.ports[0]) {
          event.ports[0].postMessage({ success: true });
        }
      });
      break;

    case 'CACHE_VIDEO':
      if (event.data.url) {
        cacheVideo(event.data.url).then(() => {
          if (event.ports[0]) {
            event.ports[0].postMessage({ success: true, url: event.data.url });
          }
        });
      }
      break;

    case 'GET_CACHE_STATUS':
      getCacheStatus().then(status => {
        if (event.ports[0]) {
          event.ports[0].postMessage(status);
        }
      });
      break;
  }
});

// مسح كل الكاش
async function clearAllCaches() {
  const cacheNames = await caches.keys();
  return Promise.all(
    cacheNames.map(cacheName => caches.delete(cacheName))
  );
}

// تخزين فيديو معين
async function cacheVideo(url) {
  try {
    const cache = await caches.open(VIDEO_CACHE);
    await cache.add(url);
    console.log('[SW] Video cached:', url);
  } catch (error) {
    console.error('[SW] Failed to cache video:', error);
  }
}

// حالة الكاش
async function getCacheStatus() {
  const cacheNames = await caches.keys();
  const status = {
    caches: {},
    totalSize: 0
  };

  for (const name of cacheNames) {
    const cache = await caches.open(name);
    const keys = await cache.keys();
    status.caches[name] = keys.length;
  }

  return status;
}

// الإشعارات Push
self.addEventListener('push', (event) => {
  console.log('[SW] Push received');
  
  let data = {
    title: 'الفراعنة للعقارات',
    body: 'لديك إشعار جديد',
    icon: '/icon-192.png',
    badge: '/icon-192.png',
    tag: 'pharaoh-notification',
    dir: 'rtl',
    lang: 'ar'
  };
  
  if (event.data) {
    try {
      data = { ...data, ...event.data.json() };
    } catch (e) {
      data.body = event.data.text();
    }
  }
  
  const options = {
    body: data.body,
    icon: data.icon,
    badge: data.badge,
    vibrate: [100, 50, 100],
    tag: data.tag,
    dir: data.dir,
    lang: data.lang,
    data: data.data || {},
    actions: [
      { action: 'open', title: 'فتح' },
      { action: 'close', title: 'إغلاق' }
    ],
    requireInteraction: true,
    silent: false
  };
  
  event.waitUntil(
    self.registration.showNotification(data.title, options)
  );
});

// معالجة النقر على الإشعارات
self.addEventListener('notificationclick', (event) => {
  console.log('[SW] Notification clicked:', event.action);
  
  event.notification.close();
  
  if (event.action === 'close') {
    return;
  }
  
  const urlToOpen = event.notification.data?.url || '/';
  
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true })
      .then((clientList) => {
        // البحث عن نافذة مفتوحة
        for (const client of clientList) {
          if (client.url.includes(self.location.origin) && 'focus' in client) {
            client.postMessage({
              type: 'NOTIFICATION_CLICKED',
              data: event.notification.data
            });
            return client.focus();
          }
        }
        // فتح نافذة جديدة
        if (clients.openWindow) {
          return clients.openWindow(urlToOpen);
        }
      })
  );
});

// Background Sync
self.addEventListener('sync', (event) => {
  console.log('[SW] Background sync:', event.tag);
  
  if (event.tag === 'sync-properties') {
    event.waitUntil(syncProperties());
  }
  
  if (event.tag === 'sync-favorites') {
    event.waitUntil(syncFavorites());
  }
});

// مزامنة العقارات
async function syncProperties() {
  try {
    const pendingData = await getLocalData('pending_properties');
    if (pendingData && pendingData.length > 0) {
      // إرسال البيانات المعلقة
      console.log('[SW] Syncing pending properties:', pendingData.length);
      // سيتم التنفيذ عند توفر الاتصال
    }
  } catch (error) {
    console.error('[SW] Properties sync failed:', error);
  }
}

// مزامنة المفضلة
async function syncFavorites() {
  try {
    const favorites = await getLocalData('pharaoh_favorites');
    console.log('[SW] Syncing favorites:', favorites?.length || 0);
  } catch (error) {
    console.error('[SW] Favorites sync failed:', error);
  }
}

// الحصول على بيانات محلية
async function getLocalData(key) {
  // سيتم استبدالها بـ IndexedDB لاحقاً
  return null;
}

// Periodic Background Sync (للتطبيقات المدفوعة)
self.addEventListener('periodicsync', (event) => {
  console.log('[SW] Periodic sync:', event.tag);
  
  if (event.tag === 'update-properties') {
    event.waitUntil(updatePropertiesCache());
  }
});

// تحديث كاش العقارات
async function updatePropertiesCache() {
  try {
    const response = await fetch('/api/properties/latest');
    if (response.ok) {
      const data = await response.json();
      const cache = await caches.open(DYNAMIC_CACHE);
      cache.put('/api/properties/latest', new Response(JSON.stringify(data)));
      console.log('[SW] Properties cache updated');
    }
  } catch (error) {
    console.error('[SW] Failed to update properties cache:', error);
  }
}

// تنظيف الكاش القديم
async function cleanupOldCache() {
  try {
    const cache = await caches.open(VIDEO_CACHE);
    const keys = await cache.keys();
    
    // حذف الملفات القديمة إذا تجاوز الحد
    if (keys.length > 20) {
      const oldKeys = keys.slice(0, keys.length - 20);
      for (const key of oldKeys) {
        await cache.delete(key);
      }
      console.log('[SW] Cleaned up old video cache');
    }
  } catch (error) {
    console.error('[SW] Cache cleanup failed:', error);
  }
}

// تشغيل التنظيف عند التفعيل
self.addEventListener('activate', (event) => {
  event.waitUntil(cleanupOldCache());
});

console.log('[SW] Service Worker loaded - الفراعنة للعقارات v3.0.0');