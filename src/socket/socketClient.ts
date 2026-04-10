/**
 * Cliente Socket.io para integrar com o backend principal.
 * Emite instagram-updated / instagram-instance-updated para o CRM em tempo real.
 *
 * Em Node (Docker/PaaS), WebSocket primeiro costuma falhar; polling primeiro + timeout maior.
 */

import { io, Socket } from 'socket.io-client';
import { SOCKET_CONFIG } from '../config/constants';

let socket: Socket | null = null;
const pendingEvents: PendingEvent[] = [];

interface PendingEvent {
  event: string;
  data: unknown;
}

const SOCKET_TIMEOUT_MS = parseInt(process.env.SOCKET_IO_TIMEOUT_MS || '20000', 10);
const SOCKET_RECONNECT_ATTEMPTS = parseInt(process.env.SOCKET_IO_RECONNECT_ATTEMPTS || '15', 10);

let lastConnectErrorLog = 0;
const CONNECT_ERROR_LOG_INTERVAL_MS = 60_000;

/**
 * Conectar ao servidor Socket.io do backend principal.
 * Microserviço sem JWT: o backend aceita conexão sem token para estes emits.
 */
export const connectSocket = (): void => {
  if (socket) {
    return;
  }

  try {
    socket = io(SOCKET_CONFIG.URL, {
      transports: ['polling', 'websocket'],
      upgrade: true,
      reconnection: true,
      reconnectionDelay: 2000,
      reconnectionDelayMax: 15000,
      reconnectionAttempts: SOCKET_RECONNECT_ATTEMPTS,
      timeout: SOCKET_TIMEOUT_MS,
      path: process.env.SOCKET_IO_PATH || '/socket.io/',
    });

    socket.on('connect', () => {
      console.log('[Insta-Clerky] Socket.io conectado ao backend');
      while (pendingEvents.length > 0) {
        const event = pendingEvents.shift();
        if (event && socket) {
          socket.emit(event.event, event.data);
        }
      }
    });

    socket.on('connect_error', (error) => {
      const now = Date.now();
      if (now - lastConnectErrorLog >= CONNECT_ERROR_LOG_INTERVAL_MS) {
        lastConnectErrorLog = now;
        console.warn(
          `[Insta-Clerky] Socket.io: ${error.message} — confira SOCKET_URL/BACKEND_SOCKET_URL (https em produção)`
        );
      }
    });
  } catch (error) {
    console.error('[Insta-Clerky] Erro ao iniciar Socket.io:', error);
  }
};

export const emitInstagramUpdate = (userId: string, data: unknown): void => {
  const eventData = { userId, data };

  if (!socket) {
    connectSocket();
  }

  if (socket?.connected) {
    socket.emit('instagram-updated', eventData);
  } else {
    pendingEvents.push({
      event: 'instagram-updated',
      data: eventData,
    });
  }
};

export const emitInstagramInstanceUpdated = (
  userId: string,
  instanceId: string,
  status: string
): void => {
  const eventData = { userId, instanceId, status };

  if (!socket) {
    connectSocket();
  }

  if (socket?.connected) {
    socket.emit('instagram-instance-updated', eventData);
  } else {
    pendingEvents.push({
      event: 'instagram-instance-updated',
      data: eventData,
    });
  }
};

export const disconnectSocket = (): void => {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
  pendingEvents.length = 0;
};
