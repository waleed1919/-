const CACHE_NAME = 'weso-pwa-v2'; // تم تغيير الرقم لتحديث ذاكرة الهاتف فوراً
const urlsToCache = [
  './',
  './index.html',
  './dashboard.html', // تم تصحيح اسم الملف هنا
  './Untitled_logo_9_free-file.png',
  './manifest.json'
];

// تثبيت ملفات التطبيق (الكاش)
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('Opened cache and caching files');
        return cache.addAll(urlsToCache);
      })
  );
});

// تشغيل التطبيق وتقديم الملفات المحفوظة
self.addEventListener('fetch', event => {
  event.respondWith(
    caches.match(event.request)
      .then(response => {
        // إرجاع الملف المحفوظ إذا كان موجوداً، أو طلبه من الإنترنت
        return response || fetch(event.request);
      })
  );
});

// تحديث الكاش عند وجود نسخة جديدة
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.filter(name => name !== CACHE_NAME)
          .map(name => caches.delete(name))
      );
    })
  );
});