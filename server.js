'use strict';

const express = require('express');
const session = require('express-session');
const http = require('node:http');
const path = require('node:path');
const { Server } = require('socket.io');
const rutasAuth = require('./rutasAuth');
const activarSockets = require('./sockets/socketHandler');

const app = express();
const server = http.createServer(app);
const io = new Server(server);
const produccion = process.env.NODE_ENV === 'production';

// Render pone un proxy HTTPS delante: hay que confiar en él para que la
// cookie de sesión "secure" funcione.
if (produccion) app.set('trust proxy', 1);

const sessionMiddleware = session({
    secret: process.env.SESSION_SECRET || 'clave-solo-para-pruebas-locales',
    resave: false,
    saveUninitialized: false,
    proxy: produccion ? true : undefined,
    cookie: {
        httpOnly: true,
        sameSite: 'lax',
        secure: produccion,
        maxAge: 12 * 60 * 60 * 1000
    }
});
app.use(sessionMiddleware);
// Socket.IO comparte la sesión de Express (igual que en el proyecto principal).
io.engine.use(sessionMiddleware);

app.get('/healthz', (req, res) => res.type('text').send('ok'));

app.post('/api/auth/login', express.json({ limit: '2kb' }), rutasAuth.login);
app.post('/api/auth/logout', rutasAuth.logout);
app.get('/api/auth/yo', (req, res) => {
    res.set('Cache-Control', 'no-store');
    rutasAuth.yo(req, res);
});

app.use(express.static(path.join(__dirname, 'public')));

activarSockets(io);

const PUERTO = Number(process.env.PORT) || 3001;
server.listen(PUERTO, () => {
    console.log(`GPS Pistas (versión mínima) escuchando en el puerto ${PUERTO}`);
});
