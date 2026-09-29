'use strict';

// Login / logout / sesión actual. Misma forma que el proyecto principal:
// la sesión guarda { id, usuario, nombre, rol } en req.session.usuario.
// (No se regenera el id de sesión al entrar: el socket ya conectado necesita
// poder recargar SU sesión; ver sockets/socketHandler.js.)

const usuarios = require('./usuarios');

function texto(valor, max) {
    return typeof valor === 'string' ? valor.trim().slice(0, max) : '';
}

function login(req, res) {
    const usuario = texto(req.body && req.body.usuario, 60);
    const password = typeof (req.body && req.body.password) === 'string' ? req.body.password.slice(0, 200) : '';
    if (!usuario || !password) {
        return res.status(400).json({ ok: false, error: 'Ingresa usuario y contraseña' });
    }
    const valido = usuarios.verificar(usuario, password);
    if (!valido) {
        return res.status(401).json({ ok: false, error: 'Usuario o contraseña incorrectos' });
    }
    req.session.usuario = valido;
    res.json({ ok: true, usuario: valido });
}

function logout(req, res) {
    if (!req.session) return res.json({ ok: true });
    req.session.destroy(() => {
        res.clearCookie('connect.sid');
        res.json({ ok: true });
    });
}

function yo(req, res) {
    if (!req.session || !req.session.usuario) {
        return res.status(401).json({ ok: false, error: 'No hay sesión activa' });
    }
    res.json({ ok: true, usuario: req.session.usuario });
}

module.exports = { login, logout, yo };
