/**
 * Cliente Socket.io para integrar com o backend principal
 * Emite eventos de atualização do Instagram para o frontend via backend principal
 */

import { io, Socket } from 'socket.io-client';
import { SOCKET_CONFIG } from '../config/constants';

let socket: Socket | null = null;
let isConnected = false;
let hasWarnedAboutConnection = false;
let reconnectAttempts = 0;
const MAX_RECONNECT_ATTEMPTS = 3;

// Fila de eventos para emitir quando o socket estiver conectado
interface PendingEvent {
  event: string;
  data: unknown;
}

const pendingEvents: PendingEvent[] = [];

/**
 * Conectar ao servidor Socket.io do backend principal
 * Nota: O Socket.io é opcional - se não conectar, o sistema continua funcionando
 * mas não emite atualizações em tempo real para o frontend
 */
export const connectSocket = (): void => {
  if (socket && isConnected) {
    return;
  }

  // Se já tentou muitas vezes, não tentar mais
  if (reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
    if (!hasWarnedAboutConnection) {
      console.warn('⚠️ Socket.io: Muitas tentativas de reconexão falharam. Desabilitando reconexão automática.');
      hasWarnedAboutConnection = true;
    }
    return;
  }

  try {
    // Socket.io é opcional - não requer autenticação para o microserviço
    socket = io(SOCKET_CONFIG.URL, {
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionDelay: 2000,
      reconnectionDelayMax: 10000,
      reconnectionAttempts: MAX_RECONNECT_ATTEMPTS,
      timeout: 5000,
    });

    socket.on('connect', () => {
      isConnected = true;
      reconnectAttempts = 0;
      hasWarnedAboutConnection = false;
      console.log('✅ Conectado ao Socket.io do backend principal');
      
      // Emitir eventos pendentes
      while (pendingEvents.length > 0) {
        const event = pendingEvents.shift();
        if (event && socket) {
          socket.emit(event.event, event.data);
        }
      }
    });

    socket.on('disconnect', () => {
      isConnected = false;
    });

    socket.on('connect_error', (error) => {
      reconnectAttempts++;
      if (!hasWarnedAboutConnection) {
        if (error.message.includes('Token')) {
          console.warn('⚠️ Socket.io requer autenticação. Atualizações em tempo real podem não funcionar.');
        } else {
          console.warn('⚠️ Erro ao conectar ao Socket.io:', error.message);
        }
        hasWarnedAboutConnection = true;
      }
    });

    socket.on('reconnect_attempt', (attemptNumber) => {
      if (attemptNumber >= MAX_RECONNECT_ATTEMPTS) {
        console.warn(`⚠️ Socket.io: Limite de tentativas de reconexão atingido (${MAX_RECONNECT_ATTEMPTS}).`);
      }
    });
  } catch (error) {
    reconnectAttempts++;
    console.error('❌ Erro ao inicializar Socket.io:', error);
  }
};

/**
 * Emitir evento de atualização do Instagram
 * O backend principal irá re-emitir para o frontend
 */
export const emitInstagramUpdate = (userId: string, data: unknown): void => {
  const eventData = {
    userId,
    data,
  };

  // Tentar conectar se não estiver conectado
  if (!socket) {
    connectSocket();
  }

  // Se estiver conectado, emitir imediatamente
  if (socket && isConnected) {
    socket.emit('instagram-updated', eventData);
  } else {
    // Se não estiver conectado, adicionar à fila
    pendingEvents.push({
      event: 'instagram-updated',
      data: eventData,
    });
  }
};

/**
 * Desconectar do Socket.io
 */
export const disconnectSocket = (): void => {
  if (socket) {
    socket.disconnect();
    socket = null;
    isConnected = false;
  }
};
