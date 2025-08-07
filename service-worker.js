// Service Worker for Global Vize Website
// Version 2.0.0

const CACHE_NAME = 'global-vize-v2.0.0';
const STATIC_CACHE = 'global-vize-static-v2.0.0';
const DYNAMIC_CACHE = 'global-vize-dynamic-v2.0.0';

// Assets to cache immediately
const STATIC_ASSETS = [
    '/',
    '/index.html',
    '/application.html',
    '/services.html',
    '/countries.html',
    '/blog.html',
    '/contact.html',
    '/faq.html',
    '/css/style.css',
    '/js/main.js',
    '/images/logo.png',
    '/images/favicon.ico',
    '/manifest.json',
    // Bootstrap CSS (from CDN)
    'https://cdn.jsdelivr.net/npm/bootstrap@5.3.0-alpha1/dist/css/bootstrap.min.css',
    // Font Awesome (from CDN)
    'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css',
    // Google Fonts
    'https://fonts.googleapis.com/css2?family=Poppins:wght@300;400;500;600;700&family=Montserrat:wght@700;800&display=swap'
];

// Routes that should always go to network first
const NETWORK_FIRST_ROUTES = [
    '/api/',
    '/form-submit',
    '/contact-submit'
];

// Routes that should use cache first
const CACHE_FIRST_ROUTES = [
    '/css/',
    '/js/',
    '/images/',
    '/fonts/',
    'https://fonts.googleapis.com',
    'https://fonts.gstatic.com',
    'https://cdn.jsdelivr.net',
    'https://cdnjs.cloudflare.com'
];

// Install Event - Cache Static Assets
self.addEventListener('install', event => {
    console.log('[SW] Installing service worker...');
    
    event.waitUntil(
        caches.open(STATIC_CACHE)
            .then(cache => {
                console.log('[SW] Caching static assets');
                return cache.addAll(STATIC_ASSETS);
            })
            .then(() => {
                console.log('[SW] Static assets cached successfully');
                return self.skipWaiting(); // Activate immediately
            })
            .catch(error => {
                console.error('[SW] Failed to cache static assets:', error);
            })
    );
});

// Activate Event - Clean Old Caches
self.addEventListener('activate', event => {
    console.log('[SW] Activating service worker...');
    
    event.waitUntil(
        caches.keys()
            .then(cacheNames => {
                return Promise.all(
                    cacheNames.map(cacheName => {
                        if (cacheName !== STATIC_CACHE && 
                            cacheName !== DYNAMIC_CACHE && 
                            cacheName !== CACHE_NAME) {
                            console.log('[SW] Deleting old cache:', cacheName);
                            return caches.delete(cacheName);
                        }
                    })
                );
            })
            .then(() => {
                console.log('[SW] Service worker activated');
                return self.clients.claim(); // Take control immediately
            })
    );
});

// Fetch Event - Handle Requests
self.addEventListener('fetch', event => {
    const request = event.request;
    const url = new URL(request.url);
    
    // Skip non-GET requests
    if (request.method !== 'GET') {
        return;
    }
    
    // Skip Chrome extension requests
    if (url.protocol === 'chrome-extension:') {
        return;
    }
    
    // Handle different caching strategies
    if (isNetworkFirst(request.url)) {
        event.respondWith(networkFirst(request));
    } else if (isCacheFirst(request.url)) {
        event.respondWith(cacheFirst(request));
    } else {
        event.respondWith(staleWhileRevalidate(request));
    }
});

// Network First Strategy (for API calls and form submissions)
async function networkFirst(request) {
    try {
        const networkResponse = await fetch(request);
        
        // Cache successful responses
        if (networkResponse.ok) {
            const cache = await caches.open(DYNAMIC_CACHE);
            cache.put(request, networkResponse.clone());
        }
        
        return networkResponse;
    } catch (error) {
        console.log('[SW] Network failed, trying cache:', request.url);
        
        const cachedResponse = await caches.match(request);
        if (cachedResponse) {
            return cachedResponse;
        }
        
        // Return offline fallback for API requests
        if (request.url.includes('/api/')) {
            return new Response(
                JSON.stringify({ 
                    error: 'Offline mode', 
                    message: 'Please check your internet connection' 
                }),
                {
                    status: 503,
                    statusText: 'Service Unavailable',
                    headers: { 'Content-Type': 'application/json' }
                }
            );
        }
        
        throw error;
    }
}

// Cache First Strategy (for static assets)
async function cacheFirst(request) {
    const cachedResponse = await caches.match(request);
    
    if (cachedResponse) {
        // Update cache in background
        fetch(request)
            .then(response => {
                if (response.ok) {
                    const cache = caches.open(STATIC_CACHE);
                    cache.then(cache => cache.put(request, response));
                }
            })
            .catch(() => {
                // Ignore network errors for background updates
            });
        
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
        console.error('[SW] Failed to fetch asset:', request.url);
        throw error;
    }
}

// Stale While Revalidate Strategy (for HTML pages)
async function staleWhileRevalidate(request) {
    const cachedResponse = await caches.match(request);
    
    const fetchPromise = fetch(request)
        .then(response => {
            if (response.ok) {
                const cache = caches.open(DYNAMIC_CACHE);
                cache.then(cache => cache.put(request, response.clone()));
            }
            return response;
        })
        .catch(error => {
            console.log('[SW] Network failed for:', request.url);
            return null;
        });
    
    // Return cached version immediately if available
    if (cachedResponse) {
        return cachedResponse;
    }
    
    // Wait for network if no cache
    return fetchPromise || getOfflineFallback(request);
}

// Check if URL should use network first strategy
function isNetworkFirst(url) {
    return NETWORK_FIRST_ROUTES.some(route => url.includes(route));
}

// Check if URL should use cache first strategy
function isCacheFirst(url) {
    return CACHE_FIRST_ROUTES.some(route => url.includes(route));
}

// Offline Fallback
async function getOfflineFallback(request) {
    // For HTML pages, return cached homepage or offline page
    if (request.headers.get('accept').includes('text/html')) {
        const cachedHomepage = await caches.match('/');
        if (cachedHomepage) {
            return cachedHomepage;
        }
        
        // Return basic offline page
        return new Response(`
            <!DOCTYPE html>
            <html>
            <head>
                <title>Offline - Global Vize</title>
                <meta charset="utf-8">
                <meta name="viewport" content="width=device-width, initial-scale=1">
                <style>
                    body { 
                        font-family: Arial, sans-serif; 
                        text-align: center; 
                        padding: 50px; 
                        background: #f8f9fa; 
                    }
                    .container { 
                        max-width: 500px; 
                        margin: 0 auto; 
                        background: white; 
                        padding: 40px; 
                        border-radius: 10px; 
                        box-shadow: 0 4px 6px rgba(0,0,0,0.1);
                    }
                    .icon { 
                        font-size: 4rem; 
                        color: #dc3545; 
                        margin-bottom: 20px; 
                    }
                    h1 { 
                        color: #333; 
                        margin-bottom: 20px; 
                    }
                    p { 
                        color: #666; 
                        line-height: 1.6; 
                    }
                    .btn { 
                        background: #2563eb; 
                        color: white; 
                        padding: 12px 24px; 
                        border: none; 
                        border-radius: 5px; 
                        text-decoration: none; 
                        display: inline-block; 
                        margin-top: 20px; 
                    }
                </style>
            </head>
            <body>
                <div class="container">
                    <div class="icon">📱</div>
                    <h1>Çevrimdışı Moddasınız</h1>
                    <p>İnternet bağlantınızı kontrol edin ve tekrar deneyin. Bazı sayfalar çevrimdışı olarak görüntülenebilir.</p>
                    <a href="/" class="btn" onclick="window.location.reload()">Tekrar Dene</a>
                </div>
            </body>
            </html>
        `, {
            headers: { 'Content-Type': 'text/html' }
        });
    }
    
    // For other resources, throw error
    throw new Error('Offline and no cached version available');
}

// Background Sync for Form Submissions
self.addEventListener('sync', event => {
    console.log('[SW] Background sync triggered:', event.tag);
    
    if (event.tag === 'visa-application-sync') {
        event.waitUntil(syncVisaApplications());
    }
    
    if (event.tag === 'contact-form-sync') {
        event.waitUntil(syncContactForms());
    }
});

// Sync offline form submissions
async function syncVisaApplications() {
    try {
        // Get pending submissions from IndexedDB
        const pendingForms = await getPendingForms('visa-applications');
        
        for (const form of pendingForms) {
            try {
                const response = await fetch('/api/visa-application', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify(form.data)
                });
                
                if (response.ok) {
                    await removePendingForm('visa-applications', form.id);
                    console.log('[SW] Synced visa application:', form.id);
                }
            } catch (error) {
                console.error('[SW] Failed to sync visa application:', error);
            }
        }
    } catch (error) {
        console.error('[SW] Background sync failed:', error);
    }
}

// Sync contact forms
async function syncContactForms() {
    try {
        const pendingForms = await getPendingForms('contact-forms');
        
        for (const form of pendingForms) {
            try {
                const response = await fetch('/api/contact', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify(form.data)
                });
                
                if (response.ok) {
                    await removePendingForm('contact-forms', form.id);
                    console.log('[SW] Synced contact form:', form.id);
                }
            } catch (error) {
                console.error('[SW] Failed to sync contact form:', error);
            }
        }
    } catch (error) {
        console.error('[SW] Contact form sync failed:', error);
    }
}

// IndexedDB helpers for offline form storage
async function getPendingForms(storeName) {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open('GlobalVizeOffline', 1);
        
        request.onerror = () => reject(request.error);
        
        request.onsuccess = () => {
            const db = request.result;
            const transaction = db.transaction([storeName], 'readonly');
            const store = transaction.objectStore(storeName);
            const getAllRequest = store.getAll();
            
            getAllRequest.onsuccess = () => resolve(getAllRequest.result);
            getAllRequest.onerror = () => reject(getAllRequest.error);
        };
        
        request.onupgradeneeded = () => {
            const db = request.result;
            if (!db.objectStoreNames.contains(storeName)) {
                db.createObjectStore(storeName, { keyPath: 'id', autoIncrement: true });
            }
        };
    });
}

async function removePendingForm(storeName, id) {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open('GlobalVizeOffline', 1);
        
        request.onsuccess = () => {
            const db = request.result;
            const transaction = db.transaction([storeName], 'readwrite');
            const store = transaction.objectStore(storeName);
            const deleteRequest = store.delete(id);
            
            deleteRequest.onsuccess = () => resolve();
            deleteRequest.onerror = () => reject(deleteRequest.error);
        };
    });
}

// Push Notifications
self.addEventListener('push', event => {
    console.log('[SW] Push message received');
    
    if (!event.data) {
        return;
    }
    
    const data = event.data.json();
    const options = {
        body: data.body || 'Vize başvurunuzla ilgili güncelleme',
        icon: '/images/icon-192x192.png',
        badge: '/images/badge-72x72.png',
        tag: data.tag || 'general',
        data: data.data || {},
        actions: [
            {
                action: 'view',
                title: 'Görüntüle',
                icon: '/images/action-view.png'
            },
            {
                action: 'dismiss',
                title: 'Kapat',
                icon: '/images/action-dismiss.png'
            }
        ],
        vibrate: [200, 100, 200],
        requireInteraction: data.requireInteraction || false
    };
    
    event.waitUntil(
        self.registration.showNotification(data.title || 'Global Vize', options)
    );
});

// Notification Click Handler
self.addEventListener('notificationclick', event => {
    console.log('[SW] Notification clicked:', event.notification.tag);
    
    event.notification.close();
    
    if (event.action === 'view') {
        const urlToOpen = event.notification.data.url || '/';
        
        event.waitUntil(
            clients.matchAll({ type: 'window' }).then(clientList => {
                // Try to focus existing tab
                for (const client of clientList) {
                    if (client.url === urlToOpen && 'focus' in client) {
                        return client.focus();
                    }
                }
                
                // Open new tab
                if (clients.openWindow) {
                    return clients.openWindow(urlToOpen);
                }
            })
        );
    }
});

// Cache size management
async function cleanCache() {
    const cache = await caches.open(DYNAMIC_CACHE);
    const keys = await cache.keys();
    
    // Remove old entries if cache is too large (max 50 items)
    if (keys.length > 50) {
        const keysToDelete = keys.slice(0, keys.length - 50);
        await Promise.all(keysToDelete.map(key => cache.delete(key)));
        console.log('[SW] Cleaned cache, removed', keysToDelete.length, 'items');
    }
}

// Periodic cache cleanup
setInterval(cleanCache, 60000); // Every minute

// Log service worker status
console.log('[SW] Service worker script loaded');

// Handle unhandled promise rejections
self.addEventListener('unhandledrejection', event => {
    console.error('[SW] Unhandled promise rejection:', event.reason);
    event.preventDefault();
});