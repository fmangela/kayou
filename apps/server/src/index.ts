import http from 'node:http';
import { fileURLToPath } from 'node:url';
import cors from 'cors';
import express, { type NextFunction, type Request, type Response } from 'express';
import { Server } from 'socket.io';
import { env } from './config/env.js';
import { getErrorPayload } from './lib/errors.js';
import { ensureSystemData } from './modules/system/bootstrap.js';
import { apiRouter } from './modules/router.js';

const app = express();
const assetsRoot = fileURLToPath(new URL('../../../assets', import.meta.url));

app.use(
  cors({
    origin: [env.CLIENT_URL, env.ADMIN_URL],
    credentials: true,
  }),
);
app.use(express.json());
app.use('/assets', express.static(assetsRoot));

app.get('/', (_request, response) => {
  response.json({
    ok: true,
    service: 'kayou-server',
    message: 'Kayou backend service is running.',
  });
});

app.use('/api', apiRouter);

app.use(
  (
    error: unknown,
    _request: Request,
    response: Response,
    _next: NextFunction,
  ) => {
    const payload = getErrorPayload(error);

    response.status(payload.statusCode).json({
      ok: false,
      message: payload.message,
      details: payload.details,
    });
  },
);

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: [env.CLIENT_URL, env.ADMIN_URL],
    credentials: true,
  },
});

io.on('connection', (socket) => {
  socket.emit('server:ready', {
    connectedAt: new Date().toISOString(),
    message: 'Socket.IO realtime channel connected.',
  });

  socket.on('pvp:queue:join', (payload) => {
    socket.emit('pvp:queue:queued', {
      queuedAt: new Date().toISOString(),
      payload,
    });
  });
});

async function start() {
  await ensureSystemData();

  server.listen(env.PORT, () => {
    console.log(`Kayou server listening on http://localhost:${env.PORT}`);
  });
}

void start();
