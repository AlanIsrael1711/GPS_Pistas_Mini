'use strict';

// =======================================================
// presenciaStore.js - Usuarios conectados y su última posición
// =======================================================
// Vive solo en memoria: la presencia es efímera y no se guarda en la
// base de datos. Un mismo usuario puede tener varias conexiones abiertas
// (celular + computadora, o dos pestañas); se agrupa por id de usuario y
// se conserva la posición más reciente.

const usuarios = new Map();   // usuarioId -> registro
const porSocket = new Map();  // socketId  -> usuarioId

function esNumero(valor) {
    return typeof valor === 'number' && Number.isFinite(valor);
}

function numeroOpcional(valor) {
    return esNumero(valor) ? valor : null;
}

// Registra (o vuelve a registrar) una conexión autenticada.
function registrar(socketId, usuario, ahora = Date.now()) {
    if (!socketId || !usuario || !usuario.id) return false;

    // Si el mismo socket cambia de usuario (cerró sesión y entró otro), se
    // desvincula primero del anterior.
    quitarSocket(socketId);

    let registro = usuarios.get(usuario.id);
    if (!registro) {
        registro = {
            id: usuario.id,
            nombre: String(usuario.nombre || usuario.usuario || 'Sin nombre').slice(0, 100),
            rol: String(usuario.rol || ''),
            sockets: new Set(),
            lat: null,
            lng: null,
            precision: null,
            rumbo: null,
            actualizadoEn: null,
            conectadoEn: ahora
        };
        usuarios.set(usuario.id, registro);
    }
    // Nombre y rol se refrescan en cada registro por si cambiaron.
    registro.nombre = String(usuario.nombre || usuario.usuario || registro.nombre).slice(0, 100);
    registro.rol = String(usuario.rol || registro.rol);
    registro.sockets.add(socketId);
    porSocket.set(socketId, usuario.id);
    return true;
}

// Guarda la posición de un socket ya registrado. Devuelve false si el
// socket no está registrado o si las coordenadas no son válidas.
function actualizarPosicion(socketId, datos, ahora = Date.now()) {
    const usuarioId = porSocket.get(socketId);
    const registro = usuarioId && usuarios.get(usuarioId);
    if (!registro || !datos) return false;

    const lat = datos.lat;
    const lng = datos.lng;
    if (!esNumero(lat) || !esNumero(lng)) return false;
    if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return false;

    registro.lat = lat;
    registro.lng = lng;
    registro.precision = numeroOpcional(datos.precision);
    registro.rumbo = numeroOpcional(datos.rumbo);
    registro.actualizadoEn = ahora;
    return true;
}

// Quita una conexión. Si era la última del usuario, el usuario sale de la
// lista. Devuelve el id del usuario afectado o null.
function quitarSocket(socketId) {
    const usuarioId = porSocket.get(socketId);
    if (!usuarioId) return null;
    porSocket.delete(socketId);

    const registro = usuarios.get(usuarioId);
    if (registro) {
        registro.sockets.delete(socketId);
        if (registro.sockets.size === 0) usuarios.delete(usuarioId);
    }
    return usuarioId;
}

function usuarioDeSocket(socketId) {
    const usuarioId = porSocket.get(socketId);
    return usuarioId ? usuarios.get(usuarioId) || null : null;
}

// Lista pública para el administrador: solo lo necesario para dibujar
// (sin nombre de login ni ids de socket).
function listar({ excluirUsuarioId = null } = {}) {
    const lista = [];
    for (const registro of usuarios.values()) {
        if (excluirUsuarioId && registro.id === excluirUsuarioId) continue;
        lista.push({
            id: registro.id,
            nombre: registro.nombre,
            rol: registro.rol,
            lat: registro.lat,
            lng: registro.lng,
            precision: registro.precision,
            rumbo: registro.rumbo,
            actualizadoEn: registro.actualizadoEn,
            conectadoEn: registro.conectadoEn
        });
    }
    lista.sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
    return lista;
}

function limpiar() {
    usuarios.clear();
    porSocket.clear();
}

module.exports = {
    registrar,
    actualizarPosicion,
    quitarSocket,
    usuarioDeSocket,
    listar,
    limpiar
};
