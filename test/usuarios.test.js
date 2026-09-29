'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

// Trabaja con un archivo temporal para no tocar users.json.
const temporal = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'gps-mini-')), 'users.json');
process.env.USUARIOS_JSON = temporal;
delete process.env.ADMIN_PASSWORD;

const usuarios = require('../usuarios');
const rutasAuth = require('../rutasAuth');

usuarios.guardarUsuario({ usuario: 'Admin', rol: 'admin', password: 'clave-admin', nombre: 'Administrador' });
usuarios.guardarUsuario({ usuario: 'ana', rol: 'reporteador', password: 'clave-ana', nombre: 'Ana' });

const guardado = fs.readFileSync(temporal, 'utf8');
assert(!guardado.includes('clave-admin') && !guardado.includes('clave-ana'), 'las contraseñas no se guardan en texto plano');
assert.throws(() => usuarios.guardarUsuario({ usuario: 'x', rol: 'dios', password: 'abcdef' }), /Rol inválido/);
assert.throws(() => usuarios.guardarUsuario({ usuario: 'x', rol: 'admin', password: '123' }), /al menos 6/);

// El módulo lee el archivo al cargar: se recarga ahora que ya tiene datos.
delete require.cache[require.resolve('../usuarios')];
delete require.cache[require.resolve('../rutasAuth')];
const u2 = require('../usuarios');
const auth = require('../rutasAuth');

assert.deepEqual(Object.keys(u2.verificar('admin', 'clave-admin')).sort(), ['id', 'nombre', 'rol', 'usuario']);
assert.equal(u2.verificar('ADMIN ', 'clave-admin').rol, 'admin', 'el usuario no distingue mayúsculas ni espacios');
assert.equal(u2.verificar('admin', 'mala'), null);
assert.equal(u2.verificar('fantasma', 'clave-admin'), null);
assert.equal(u2.verificar('ana', 'clave-ana').rol, 'reporteador');

// Rutas con req/res simulados.
function respuesta() {
    const r = { codigo: 200, cuerpo: null, cookies: [] };
    r.status = (c) => { r.codigo = c; return r; };
    r.json = (o) => { r.cuerpo = o; return r; };
    r.clearCookie = (n) => { r.cookies.push(n); };
    return r;
}
let res = respuesta();
auth.login({ body: { usuario: 'ana', password: 'clave-ana' }, session: {} }, res);
assert.equal(res.codigo, 200);
assert.equal(res.cuerpo.usuario.rol, 'reporteador');

const req = { body: { usuario: 'ana', password: 'clave-ana' }, session: {} };
auth.login(req, respuesta());
assert.equal(req.session.usuario.usuario, 'ana', 'la sesión guarda al usuario');

res = respuesta();
auth.login({ body: { usuario: 'ana', password: 'no' }, session: {} }, res);
assert.equal(res.codigo, 401);
res = respuesta();
auth.login({ body: {}, session: {} }, res);
assert.equal(res.codigo, 400);
res = respuesta();
auth.yo({ session: {} }, res);
assert.equal(res.codigo, 401);
res = respuesta();
auth.yo(req, res);
assert.equal(res.cuerpo.usuario.nombre, 'Ana');

res = respuesta();
req.session.destroy = (cb) => cb();
auth.logout(req, res);
assert.equal(res.cuerpo.ok, true);
assert.deepEqual(res.cookies, ['connect.sid']);

// ADMIN_PASSWORD sustituye la clave del admin en memoria, sin tocar el archivo.
process.env.ADMIN_PASSWORD = 'clave-de-render';
delete require.cache[require.resolve('../usuarios')];
const u3 = require('../usuarios');
assert.equal(u3.verificar('admin', 'clave-de-render').rol, 'admin');
assert.equal(u3.verificar('admin', 'clave-admin'), null);
assert(!fs.readFileSync(temporal, 'utf8').includes('clave-de-render'));

console.log('usuarios.test.js OK');
