'use strict';

const assert = require('node:assert/strict');
const presencia = require('../presencia/presenciaStore');
const activarSockets = require('../sockets/socketHandler');

// ---------- almacén ----------
presencia.limpiar();
assert.equal(presencia.registrar('s1', { id: 'u1', nombre: 'Ana', rol: 'reporteador' }), true);
assert.equal(presencia.registrar('s2', { id: 'u1', nombre: 'Ana', rol: 'reporteador' }), true, 'segunda conexión del mismo usuario');
assert.equal(presencia.listar().length, 1, 'un usuario con dos conexiones cuenta una vez');

assert.equal(presencia.actualizarPosicion('s1', { lat: 19.43, lng: -99.07, precision: 8 }), true);
assert.equal(presencia.actualizarPosicion('s1', { lat: 'x', lng: -99.07 }), false, 'rechaza coordenadas no numéricas');
assert.equal(presencia.actualizarPosicion('s1', { lat: 120, lng: 0 }), false, 'rechaza latitud fuera de rango');
assert.equal(presencia.actualizarPosicion('nadie', { lat: 19, lng: -99 }), false, 'socket no registrado');

const [ana] = presencia.listar();
assert.equal(ana.lat, 19.43);
assert.equal('sockets' in ana, false, 'no se exponen ids de conexión');
assert.equal('usuario' in ana, false, 'no se expone el usuario de login');

presencia.quitarSocket('s1');
assert.equal(presencia.listar().length, 1, 'sigue conectada por su otra conexión');
presencia.quitarSocket('s2');
assert.equal(presencia.listar().length, 0, 'sale de la lista al cerrar su última conexión');

presencia.registrar('a', { id: 'admin1', nombre: 'Admin', rol: 'admin' });
presencia.registrar('b', { id: 'u2', nombre: 'Beto', rol: 'monitoreo' });
assert.deepEqual(presencia.listar({ excluirUsuarioId: 'admin1' }).map(u => u.nombre), ['Beto']);
presencia.limpiar();

// ---------- manejador de sockets con io simulado ----------
const conectados = [];
const eventosIo = {};
const io = {
    on: (nombre, cb) => { eventosIo[nombre] = cb; },
    in: (sala) => ({
        fetchSockets: async () => conectados.filter(s => s.salas.has(sala))
    })
};
activarSockets(io, { estado: () => ({}) });

function nuevoSocket(id, sesionUsuario) {
    const manejadores = {};
    const socket = {
        id,
        salas: new Set(),
        emitidos: [],
        request: { session: { usuario: sesionUsuario, reload(cb) { cb(); } } },
        on: (nombre, cb) => { manejadores[nombre] = cb; },
        join(sala) { this.salas.add(sala); },
        leave(sala) { this.salas.delete(sala); },
        emit(nombre, datos) { this.emitidos.push({ nombre, datos }); },
        disparar: (nombre, ...args) => manejadores[nombre](...args)
    };
    conectados.push(socket);
    eventosIo.connection(socket);
    return socket;
}

const esperar = (ms) => new Promise(r => setTimeout(r, ms));
const ultimaLista = (socket) => {
    const listas = socket.emitidos.filter(e => e.nombre === 'presencia:lista');
    return listas.length ? listas[listas.length - 1].datos : null;
};

(async () => {
    const admin = nuevoSocket('sa', { id: 'admin1', nombre: 'Admin', rol: 'admin' });
    const ana = nuevoSocket('sb', { id: 'u1', nombre: 'Ana', rol: 'reporteador' });
    const intruso = nuevoSocket('sc', { id: 'u3', nombre: 'Carlos', rol: 'monitoreo' });
    const anonimo = nuevoSocket('sd', undefined);

    const acuses = {};
    const acuseDe = (nombre) => (respuesta) => { acuses[nombre] = respuesta; };
    await admin.disparar('presencia:iniciar', acuseDe('admin'));
    await ana.disparar('presencia:iniciar', acuseDe('ana'));
    await intruso.disparar('presencia:iniciar', acuseDe('intruso'));
    await anonimo.disparar('presencia:iniciar', acuseDe('anonimo'));
    assert.equal(presencia.listar().length, 3, 'una conexión sin sesión no se registra');
    assert.deepEqual(acuses.admin, { ok: true });
    assert.deepEqual(acuses.anonimo, { ok: false }, 'sin sesión el acuse es ok:false (el cliente se reconecta)');

    // Caso real: la página se abrió ANTES de iniciar sesión; el handshake trae una
    // sesión que ya no existe en el almacén y reload() falla.
    const tarde = nuevoSocket('se', { id: 'u9', nombre: 'Tarde', rol: 'monitoreo' });
    tarde.request.session.reload = (cb) => cb(new Error('failed to load session'));
    await tarde.disparar('presencia:iniciar', acuseDe('tarde'));
    assert.deepEqual(acuses.tarde, { ok: false });
    assert.equal(presencia.listar().some(u => u.nombre === 'Tarde'), false, 'no se registra con una sesión que no carga');

    ana.disparar('presencia:posicion', { lat: 19.4361, lng: -99.0702, precision: 6 });
    intruso.disparar('presencia:posicion', { lat: 19.44, lng: -99.06 });
    anonimo.disparar('presencia:posicion', { lat: 19.45, lng: -99.05 });

    // Solo el admin puede suscribirse a la lista.
    await intruso.disparar('presencia:suscribir');
    await ana.disparar('presencia:suscribir');
    await anonimo.disparar('presencia:suscribir');
    assert.equal(ultimaLista(intruso), null, 'monitoreo no recibe la lista');
    assert.equal(ultimaLista(ana), null, 'reporteador no recibe la lista');
    assert.equal(ultimaLista(anonimo), null, 'sin sesión no recibe la lista');
    assert.equal(intruso.salas.has('presencia-admins'), false);

    await admin.disparar('presencia:suscribir');
    const inicial = ultimaLista(admin);
    assert(inicial, 'el admin recibe la lista');
    assert.deepEqual(inicial.map(u => u.nombre).sort(), ['Ana', 'Carlos'], 'el admin no se ve a sí mismo');
    assert.equal(inicial.find(u => u.nombre === 'Ana').rol, 'reporteador');

    // Cambios posteriores llegan agrupados (difusión con retraso de 1 s).
    await esperar(1200);
    const tras = ultimaLista(admin);
    assert.equal(tras.find(u => u.nombre === 'Ana').lat, 19.4361);
    assert.equal(tras.find(u => u.nombre === 'Carlos').lat, 19.44);
    assert.equal(tras.find(u => u.nombre === 'Carlos').id, 'u3');

    // Límite de frecuencia: una segunda posición inmediata se ignora.
    ana.disparar('presencia:posicion', { lat: 19.5, lng: -99.1 });
    ana.disparar('presencia:posicion', { lat: 19.6, lng: -99.2 });
    assert.equal(presencia.listar().find(u => u.nombre === 'Ana').lat, 19.5, 'la segunda posición, demasiado seguida, se ignora');

    // Cerrar sesión: desaparece de la lista del admin.
    ana.disparar('presencia:detener');
    await esperar(1200);
    assert.deepEqual(ultimaLista(admin).map(u => u.nombre), ['Carlos']);

    // Desconexión: también.
    intruso.disparar('disconnect');
    await esperar(1200);
    assert.deepEqual(ultimaLista(admin), []);

    // Si a alguien le quitan el rol admin, ya no puede volver a suscribirse.
    admin.request.session.usuario.rol = 'reporteador';
    admin.salas.clear();
    admin.emitidos.length = 0;
    await admin.disparar('presencia:suscribir');
    assert.equal(ultimaLista(admin), null, 'sin rol admin no hay lista');

    presencia.limpiar();
    console.log('presencia.test.js OK');
    process.exit(0);
})().catch((error) => { console.error(error); process.exit(1); });
