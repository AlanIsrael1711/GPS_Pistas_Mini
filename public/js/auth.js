// =======================================================
// auth.js - Login, sesión y rol
// =======================================================
// Igual que en el proyecto principal: expone window.usuarioActual, marca el
// rol en <body data-rol> y dispara 'gps:sesion-lista' / 'gps:sesion-cerrada'.
(function iniciarAuth() {
    'use strict';

    const $ = (id) => document.getElementById(id);
    const NOMBRES_ROL = { admin: 'Administrador', reporteador: 'Reporteador', monitoreo: 'Monitoreo' };

    window.usuarioActual = null;

    async function api(url, opciones) {
        const respuesta = await fetch(url, {
            credentials: 'same-origin',
            headers: { 'Content-Type': 'application/json' },
            ...opciones
        });
        const datos = await respuesta.json().catch(() => ({}));
        if (!respuesta.ok) throw Object.assign(new Error(datos.error || 'Error'), { estado: respuesta.status });
        return datos;
    }

    function aplicarSesion(usuario) {
        window.usuarioActual = usuario;
        document.body.dataset.rol = usuario.rol;

        $('modalLogin').hidden = true;
        $('barraSesion').hidden = false;
        $('barraSesion').dataset.rol = usuario.rol;
        $('panelPrueba').hidden = false;
        $('sesionNombre').textContent = usuario.nombre;
        $('sesionRol').textContent = NOMBRES_ROL[usuario.rol] || usuario.rol;

        window.dispatchEvent(new CustomEvent('gps:sesion-lista', { detail: usuario }));
    }

    function limpiarSesion() {
        const habiaSesion = Boolean(window.usuarioActual);
        window.usuarioActual = null;
        delete document.body.dataset.rol;

        $('barraSesion').hidden = true;
        $('panelPrueba').hidden = true;
        $('modalLogin').hidden = false;
        $('formLogin').reset();
        $('errorLogin').textContent = '';
        $('loginUsuario').focus();

        if (habiaSesion) window.dispatchEvent(new CustomEvent('gps:sesion-cerrada'));
    }

    $('formLogin').addEventListener('submit', async (evento) => {
        evento.preventDefault();
        $('errorLogin').textContent = '';
        try {
            const datos = await api('/api/auth/login', {
                method: 'POST',
                body: JSON.stringify({
                    usuario: $('loginUsuario').value,
                    password: $('loginPassword').value
                })
            });
            aplicarSesion(datos.usuario);
        } catch (error) {
            $('errorLogin').textContent = error.message;
        }
    });

    $('btnSalir').addEventListener('click', async () => {
        try { await api('/api/auth/logout', { method: 'POST', body: '{}' }); } catch (_) {}
        limpiarSesion();
    });

    // Al cargar: si ya hay una sesión vigente, se reutiliza.
    (async function verificarSesionExistente() {
        try {
            const datos = await api('/api/auth/yo');
            aplicarSesion(datos.usuario);
        } catch (_) {
            limpiarSesion();
        }
    })();
})();
