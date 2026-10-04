# Modo online

Cualquier visitante puede crear una sala desde «Jugar Online» en Ten Pick, Monotype o Festa. Solo configura las opciones de la partida; no introduce nombres ni un número de jugadores. Comparte el enlace `/join/CODIGO`, cada persona entra con su nombre y el host empieza cuando estén todos. Se fija la lista de participantes con los jugadores conectados al empezar. Después solo pueden volver a entrar los participantes de esa partida.

El host es el organizador de una sala en el navegador. El servidor Node es el servicio común que sincroniza todas las salas. Los visitantes no necesitan instalar Node ni ejecutar un servidor. El host observa y dirige; si quiere jugar también debe entrar por el enlace desde otro navegador o dispositivo. Recargar `/host/CODIGO` recupera la sala en el navegador que la creó. Las conexiones recuperan su sesión automáticamente tras un corte de red.

## Probar en tu ordenador

Desde la raíz del repositorio, ejecuta `npm ci`. Abre dos terminales:

```powershell
npm run start:server
```

```powershell
npm start
```

Abre `http://localhost:4200`. Angular reenvía `/socket.io/` al puerto 3000 mediante `proxy.conf.json`. Mantén ambas terminales abiertas.

## Probar entre ordenadores de la misma red

Ejecuta el servidor igual y arranca Angular con:

```powershell
npm start -- --host 0.0.0.0
```

Consulta la IPv4 de tu ordenador con `ipconfig`, por ejemplo `192.168.1.50`. Todos abren `http://192.168.1.50:4200` y comparten enlaces con esa dirección. Permite el puerto TCP 4200 en el firewall de Windows para la red privada. El navegador conecta a la misma dirección de la web, y Angular reenvía la conexión al servidor: no hace falta configurar cada ordenador ni abrir el puerto 3000 a la red.

## Publicarlo en Internet con un backend separado

Si tu web sigue alojada en Vercel u otro alojamiento estático:

1. Despliega este repositorio en un servicio Node que mantenga un proceso activo y admita WebSockets. Instala con `npm ci` y arranca con `npm run start:server` desde la raíz. Incluye `server`, `src/app/models` y `public/data`: el motor lee el catálogo del repositorio. El comando usa `tsx`, así que también deben instalarse las dependencias de desarrollo. El servidor usa `MULTIPLAYER_PORT`, o `PORT` si el alojamiento lo asigna.
2. Configura `CLIENT_ORIGIN=https://pokefunny.dade.es` en el backend, sin barra final. Es el origen autorizado y la base de sus enlaces. Dale una URL HTTPS pública al backend, por ejemplo `https://online.tu-dominio.es`. Debe tener TLS y permitir conexiones WebSocket y HTTP a `/socket.io/`.
3. Edita `public/multiplayer-config.js` con la dirección real del backend:

   ```js
   globalThis.ngMultiplayerUrl = 'https://online.tu-dominio.es';
   ```

4. Ejecuta `npm run build` y publica `dist/pokefunny/browser`. Esa configuración se carga para todos los visitantes, sin ajustes en sus navegadores. Configura el alojamiento para servir `index.html` en las rutas de Angular, incluidas `/host/*`, `/join/*` y `/play/*`.
5. Comprueba `https://online.tu-dominio.es/health` (debe responder `{"ok":true}`) y prueba una sala con dos navegadores o dispositivos. Cualquiera puede abrir «Jugar Online» y crear otra sala independiente.

Conserva el backend en una única instancia: las salas están en memoria. Al reiniciarlo se pierden, y varias instancias independientes no comparten partidas. Para persistencia o varias instancias habría que añadir almacenamiento compartido y coordinación de eventos.

## Publicarlo con el mismo dominio

Puedes dejar `public/multiplayer-config.js` sin asignación y reenviar `/socket.io/` desde el dominio de la web al proceso Node. Por ejemplo, dentro del bloque HTTPS de Nginx que sirve la web:

```nginx
location /socket.io/ {
    proxy_pass http://127.0.0.1:3000;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_set_header Host $host;
    proxy_read_timeout 75s;
}

location / {
    try_files $uri $uri/ /index.html;
}
```

Configura `CLIENT_ORIGIN` con el origen HTTPS de la web. Ejecuta el proceso Node de forma permanente mediante el gestor de procesos de tu servidor. El cliente usa automáticamente el dominio desde el que se abre la página.

Documentación: [CORS de Socket.IO](https://socket.io/docs/v4/handling-cors/) y [WebSockets con Nginx](https://nginx.org/en/docs/http/websocket.html).

Si habías configurado manualmente `pokefunny.multiplayer.url` en el almacenamiento local del navegador, bórralo para usar la configuración nueva. Una asignación en `multiplayer-config.js` tiene prioridad sobre ese valor.
