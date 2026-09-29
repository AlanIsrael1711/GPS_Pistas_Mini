// =======================================================
// mapa.js - Mapa sencillo + posición propia
// =======================================================
// Expone lo mismo que main.js en el proyecto principal, que es lo que
// mapUsuarios.js necesita: window.map y window.obtenerUbicacionUsuarioActual().
(function iniciarMapa() {
    'use strict';

    window.map = L.map('map', { center: [19.4360, -99.0701], zoom: 16 });

    L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
        attribution: '© OpenStreetMap contributors © CARTO',
        subdomains: 'abcd',
        maxZoom: 20
    }).addTo(window.map);

    let ultimoGPS = null;      // { lat, lng, accuracy, timestamp }
    let marcadorPropio = null;
    let centrado = false;
    let simulando = false;

    function ponerPosicion(lat, lng, accuracy, centrar) {
        ultimoGPS = { lat, lng, accuracy, timestamp: Date.now() };
        if (marcadorPropio) {
            marcadorPropio.setLatLng([lat, lng]);
        } else {
            marcadorPropio = L.circleMarker([lat, lng], {
                radius: 9, color: '#fff', weight: 3, fillColor: '#2563eb', fillOpacity: 1
            }).addTo(window.map).bindTooltip('Tú', { permanent: false });
        }
        if (centrar) window.map.setView([lat, lng], 17);
    }

    // Misma firma que en el proyecto principal.
    window.obtenerUbicacionUsuarioActual = function () {
        if (!ultimoGPS) return null;
        return {
            lat: ultimoGPS.lat,
            lng: ultimoGPS.lng,
            accuracy: Number.isFinite(ultimoGPS.accuracy) ? ultimoGPS.accuracy : null,
            timestamp: ultimoGPS.timestamp
        };
    };

    if (navigator.geolocation) {
        navigator.geolocation.watchPosition(
            (pos) => {
                if (simulando) return;
                ponerPosicion(pos.coords.latitude, pos.coords.longitude, pos.coords.accuracy, !centrado);
                centrado = true;
            },
            (error) => console.warn('GPS no disponible:', error.message),
            { enableHighAccuracy: true, timeout: 10000, maximumAge: 1500 }
        );
    }

    // Posición simulada para probar sin moverse (o en una PC sin GPS).
    document.addEventListener('DOMContentLoaded', () => {
        const chk = document.getElementById('chkSimular');
        if (chk) chk.addEventListener('change', () => { simulando = chk.checked; });
    });
    window.map.on('click', (evento) => {
        if (!simulando) return;
        ponerPosicion(evento.latlng.lat, evento.latlng.lng, 5, false);
    });
})();
