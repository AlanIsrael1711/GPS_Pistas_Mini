'use strict';

// =======================================================
// usuarios.js - Usuarios en un archivo JSON (sin base de datos)
// =======================================================
// Mismos roles que el proyecto principal: admin, reporteador y monitoreo.
// Las contraseñas se guardan con scrypt (módulo crypto de Node), nunca en
// texto plano. El archivo se lee UNA vez al arrancar y en Render se usa
// como solo lectura (el disco de Render se borra en cada despliegue), así
// que los usuarios se agregan ANTES de subir: node scripts/crearUsuario.js

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const ARCHIVO = process.env.USUARIOS_JSON || path.join(__dirname, 'users.json');
const ROLES = new Set(['admin', 'reporteador', 'monitoreo']);
const LONGITUD_HASH = 64;

function hashear(password, salt = crypto.randomBytes(16).toString('hex')) {
    const hash = crypto.scryptSync(String(password), salt, LONGITUD_HASH).toString('hex');
    return { salt, hash };
}

function leerArchivo() {
    try {
        const datos = JSON.parse(fs.readFileSync(ARCHIVO, 'utf8'));
        return Array.isArray(datos) ? datos : [];
    } catch (error) {
        if (error.code !== 'ENOENT') console.error(`[usuarios] No se pudo leer ${ARCHIVO}:`, error.message);
        return [];
    }
}

let usuarios = leerArchivo();

// ADMIN_PASSWORD (variable de entorno de Render) sustituye la contraseña del
// usuario "admin" solo en memoria, para no dejar la de pruebas en producción.
if (process.env.ADMIN_PASSWORD) {
    const admin = usuarios.find((u) => u.usuario === 'admin');
    if (admin) Object.assign(admin, hashear(process.env.ADMIN_PASSWORD));
}

const HASH_FALSO = hashear('sin-usuario').hash;

function normalizar(nombreUsuario) {
    return String(nombreUsuario || '').trim().toLowerCase();
}

function publico(u) {
    return { id: u.id, usuario: u.usuario, nombre: u.nombre, rol: u.rol };
}

// Devuelve el usuario (sin datos de contraseña) o null. Siempre hace un
// scrypt, exista o no el usuario, para no delatar cuáles existen por el tiempo.
function verificar(nombreUsuario, password) {
    const u = usuarios.find((x) => x.usuario === normalizar(nombreUsuario) && x.activo !== false);
    const calculado = hashear(password, u ? u.salt : 'sal-falsa').hash;
    const esperado = u ? u.hash : HASH_FALSO;
    const coincide = crypto.timingSafeEqual(Buffer.from(calculado, 'hex'), Buffer.from(esperado, 'hex'));
    return u && coincide ? publico(u) : null;
}

// Solo para el script de línea de comandos: agrega o reemplaza en el archivo.
function guardarUsuario({ usuario, nombre, rol, password }) {
    const login = normalizar(usuario);
    if (!login) throw new Error('El usuario es obligatorio');
    if (!ROLES.has(rol)) throw new Error('Rol inválido. Usa admin, reporteador o monitoreo');
    if (typeof password !== 'string' || password.length < 6) {
        throw new Error('La contraseña debe tener al menos 6 caracteres');
    }
    const lista = leerArchivo();
    const existente = lista.find((u) => u.usuario === login);
    const registro = {
        id: existente ? existente.id : crypto.randomUUID(),
        usuario: login,
        nombre: String(nombre || '').trim().slice(0, 100) || login,
        rol,
        activo: true,
        ...hashear(password)
    };
    if (existente) Object.assign(existente, registro); else lista.push(registro);
    fs.writeFileSync(ARCHIVO, JSON.stringify(lista, null, 2) + '\n');
    return publico(registro);
}

module.exports = { verificar, guardarUsuario, ARCHIVO, ROLES };
