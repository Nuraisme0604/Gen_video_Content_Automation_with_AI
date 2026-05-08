import { io, Socket } from 'socket.io-client';

let socket: Socket | null = null;

export function getSocket(): Socket {
  if (!socket) {
    const url = process.env.NEXT_PUBLIC_SOCKET_URL || 'http://localhost:3001';
    socket = io(`${url}/jobs`, { transports: ['websocket'], autoConnect: true });
  }
  return socket;
}

export function subscribeToVideo(videoId: string) {
  getSocket().emit('subscribe', videoId);
}

export function unsubscribeFromVideo(videoId: string) {
  getSocket().emit('unsubscribe', videoId);
}
