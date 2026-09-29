'use strict';

// Ejecuta public/js/mapUsuarios.js (el MISMO archivo del proyecto principal)
// con un navegador, un mapa Leaflet y un socket simulados.

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const codigo = fs.readFileSync(path.join(__dirname, '..', 'public', 'js', 'mapUsuarios.js'), 'utf8');

function elemento(etiqueta) {
    return {
        etiqueta, className: '', textContent: '', hijos: [],
        classList: { add() {} },
        append(...nodos) { this.hijos.push(...nodos); }
    };
}

function crearEntorno({ ackIniciar }) {
    const eventosWindow = {};
    const manejadoresSocket = {};
    const emitidos = [];
    let conexiones = 0;

    const socket = {
        connected: true,
        emit(nombre, ...args) {
            emitidos.push(nombre);
            if (nombre === 'presencia:iniciar') {
                const acuse = args[args.length - 1];
                const respuesta = ackIniciar(conexiones);
                if (typeof acuse === 'function') acuse(respuesta);
            }
        },
        on(nombre, cb) { manejadoresSocket[nombre] = cb; },
        disconnect() { socket.connected = false; return socket; },
        connect() { conexiones++; socket.connected = true; setImmediate(() => manejadoresSocket.connect && manejadoresSocket.connect()); return socket; }
    };

    const marcadores = [];
    const capa = {
        layers: [], addTo() { return capa; },
        clearLayers() { capa.layers = []; }, removeLayer(m) { capa.layers = capa.layers.filter(x => x !== m); }
    };
    const L = {
        layerGroup: () => capa,
        latLng: (lat, lng) => ({ lat, lng, distanceTo: () => 999 }),
        divIcon: (opciones) => opciones,
        marker: (pos, opciones) => {
            const m = {
                pos, opciones, setLatLng(p) { m.pos = p; }, setIcon(i) { m.opciones.icon = i; },
                bindPopup() { return m; }, addTo() { capa.layers.push(m); return m; }
            };
            marcadores.push(m);
            return m;
        }
    };

    const ventana = {
        gpsSocket: socket,
        usuarioActual: null,
        map: { hasLayer: () => true, removeLayer() {} },
        obtenerUbicacionUsuarioActual: () => ({ lat: 19.43, lng: -99.07, accuracy: 7, timestamp: Date.now() }),
        addEventListener(nombre, cb) { eventosWindow[nombre] = cb; }
    };
    const documento = {
        hidden: false,
        createElement: elemento,
        getElementById: () => null,
        addEventListener() {}
    };

    const contexto = vm.createContext({
        window: ventana, document: documento, L, io: () => socket,
        setTimeout, clearInterval, setInterval, Date, Math, Number, Array, Set, Map, Object, String
    });
    vm.runInContext(codigo, contexto);
    return { eventosWindow, manejadoresSocket, emitidos, marcadores, capa, socket, ventana, conexiones: () => conexiones };
}

const esperar = (ms) => new Promise(r => setTimeout(r, ms));

(async () => {
    // 1) Caso del error corregido: el primer intento no se reconoce, se reconecta UNA vez y ya queda registrado.
    let e = crearEntorno({ ackIniciar: (conexiones) => ({ ok: conexiones >= 1 }) });
    e.eventosWindow['gps:sesion-lista']({ detail: { id: 'u1', nombre: 'Ana', rol: 'reporteador' } });
    await esperar(50);
    assert.equal(e.conexiones(), 1, 'se reconectó exactamente una vez');
    assert.equal(e.emitidos.filter(n => n === 'presencia:iniciar').length, 2, 'volvió a anunciarse tras reconectar');

    // 2) Si el servidor sigue sin reconocerlo, no entra en un bucle de reconexiones.
    e = crearEntorno({ ackIniciar: () => ({ ok: false }) });
    e.eventosWindow['gps:sesion-lista']({ detail: { id: 'u1', nombre: 'Ana', rol: 'reporteador' } });
    await esperar(50);
    assert.equal(e.conexiones(), 1, 'máximo una reconexión por inicio de sesión');

    // 3) El admin se suscribe y dibuja a los demás con nombre y rol (sin dibujarse a sí mismo).
    e = crearEntorno({ ackIniciar: () => ({ ok: true }) });
    e.eventosWindow['gps:sesion-lista']({ detail: { id: 'admin1', nombre: 'Admin', rol: 'admin' } });
    assert(e.emitidos.includes('presencia:suscribir'), 'el admin se suscribe a la lista');
    e.manejadoresSocket['presencia:lista']([
        { id: 'admin1', nombre: 'Admin', rol: 'admin', lat: 19.4, lng: -99.0, actualizadoEn: Date.now() },
        { id: 'u1', nombre: 'Ana <b>x</b>', rol: 'reporteador', lat: 19.436, lng: -99.07, actualizadoEn: Date.now() },
        { id: 'u2', nombre: 'Beto', rol: 'monitoreo', lat: null, lng: null, actualizadoEn: null }
    ]);
    assert.equal(e.marcadores.length, 1, 'solo Ana: el admin no se dibuja y Beto no tiene ubicación');
    const html = e.marcadores[0].opciones.icon.html;
    const etiqueta = html.hijos[1];
    assert.equal(etiqueta.hijos[0].textContent, 'Ana <b>x</b>', 'el nombre va como texto, no como HTML');
    assert.equal(etiqueta.hijos[1].textContent, 'Reporteador');

    // 4) Un usuario que NO es admin nunca se suscribe ni dibuja.
    e = crearEntorno({ ackIniciar: () => ({ ok: true }) });
    e.eventosWindow['gps:sesion-lista']({ detail: { id: 'u1', nombre: 'Ana', rol: 'reporteador' } });
    assert(!e.emitidos.includes('presencia:suscribir'));
    e.manejadoresSocket['presencia:lista']([{ id: 'u2', nombre: 'Beto', rol: 'monitoreo', lat: 1, lng: 1, actualizadoEn: Date.now() }]);
    assert.equal(e.marcadores.length, 0, 'un no-admin no dibuja a nadie aunque llegara una lista');

    // 5) Al cerrar sesión se anuncia la salida.
    e = crearEntorno({ ackIniciar: () => ({ ok: true }) });
    e.eventosWindow['gps:sesion-lista']({ detail: { id: 'u1', nombre: 'Ana', rol: 'reporteador' } });
    e.eventosWindow['gps:sesion-cerrada']();
    assert(e.emitidos.includes('presencia:detener'));

    console.log('cliente.test.js OK');
    process.exit(0);
})().catch((error) => { console.error(error); process.exit(1); });
