/**
 * Sjöstadsfärjetrafiken Web Application - Initialization Script
 * 
 * Detta skript innehåller initieringskod som tidigare fanns inline i index.html.
 * Flyttat till separat fil för CSP-kompatibilitet (Content Security Policy).
 * 
 * Versionshistorik:
 * 5.0.2 - CSP-fixar: unsafe-inline, frame-ancestors borttagen, enctype tillagd
 * 5.0.1 - Skapad: Flyttat inline-script från index.html för CSP
 * 
 * @author Christian Gillinger
 * @version 5.0.2
 * @license MIT
 */

// Applikationsversion (ska matcha manifest.json och app.js)
window.APP_VERSION = '5.0.2';

/**
 * Global felhanterare (SÄKERHETSHÄRDAD)
 */
window.onerror = function(msg, url, lineNo, columnNo, error) {
    console.error('Error:', {
        message: msg,
        url: url,
        line: lineNo,
        column: columnNo,
        error: error
    });

    // Visa användarvänligt felmeddelande (SÄKERHETSHÄRDAD med createElement)
    const errorContainer = document.getElementById('error-container');
    if (errorContainer) {
        const errorDiv = document.createElement('div');
        errorDiv.className = 'notification error';
        errorDiv.textContent = 'Ett fel uppstod. Försök ladda om sidan.';
        errorContainer.appendChild(errorDiv);
    }
    return false;
};

/**
 * Ta bort laddningsindikator när sidan är fullt laddad
 */
window.addEventListener('load', function() {
    const loading = document.getElementById('loading');
    if (loading) {
        loading.style.display = 'none';
    }
});

/**
 * Hantera uppdateringsknapp
 */
document.addEventListener('DOMContentLoaded', function() {
    const updateButton = document.getElementById('update-now-btn');
    if (updateButton) {
        updateButton.addEventListener('click', function() {
            // Rensa cacher och ladda om sidan
            if ('caches' in window) {
                caches.keys().then(function(cacheNames) {
                    cacheNames.forEach(function(cacheName) {
                        caches.delete(cacheName);
                    });
                    location.reload(true);
                });
            } else {
                location.reload(true);
            }
        });
    }
});

/**
 * Lyssna på meddelanden från service worker
 */
if ('serviceWorker' in navigator) {
    navigator.serviceWorker.addEventListener('message', function(event) {
        if (event.data && event.data.type === 'UPDATE_AVAILABLE') {
            // Visa uppdateringsnotifikation
            const notification = document.getElementById('update-notification');
            if (notification) {
                notification.style.display = 'block';
            }
        }
    });
}

/**
 * Service Worker Registrering
 */
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('./service-worker.js')
            .then(registration => {
                console.log('ServiceWorker registration successful');
                
                // Kontrollera efter uppdateringar
                registration.addEventListener('updatefound', () => {
                    const newWorker = registration.installing;
                    newWorker.addEventListener('statechange', () => {
                        if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                            // Ny version installerad men inte aktiverad ännu
                            const notification = document.getElementById('update-notification');
                            if (notification) {
                                notification.style.display = 'block';
                            }
                        }
                    });
                });
            })
            .catch(err => {
                console.log('ServiceWorker registration failed: ', err);
            });
    });
}
