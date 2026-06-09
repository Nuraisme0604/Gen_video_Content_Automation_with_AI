import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  MessageBody,
  ConnectedSocket,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';

@WebSocketGateway({ namespace: '/jobs', cors: { origin: '*' } })
export class JobsGateway {
  @WebSocketServer() server: Server;

  @SubscribeMessage('subscribe')
  handleSubscribe(@MessageBody() videoId: string, @ConnectedSocket() client: Socket) {
    client.join(`video:${videoId}`);
    return { subscribed: videoId };
  }

  @SubscribeMessage('unsubscribe')
  handleUnsubscribe(@MessageBody() videoId: string, @ConnectedSocket() client: Socket) {
    client.leave(`video:${videoId}`);
  }

  emitJobQueued(videoId: string, payload: object) {
    this.server.to(`video:${videoId}`).emit('job:queued', payload);
  }

  emitJobProgress(videoId: string, payload: { jobId: string; progress: number; stage?: string }) {
    this.server.to(`video:${videoId}`).emit('job:progress', payload);
  }

  emitSceneRendered(videoId: string, payload: { sceneIndex: number; previewUrl?: string }) {
    this.server.to(`video:${videoId}`).emit('scene:rendered', { videoId, ...payload });
  }

  emitJobComplete(videoId: string, payload: object) {
    this.server.to(`video:${videoId}`).emit('job:complete', { videoId, ...payload });
  }

  emitJobFailed(videoId: string, payload: { error: string }) {
    this.server.to(`video:${videoId}`).emit('job:failed', { videoId, ...payload });
  }

  emitSceneProgress(videoId: string, payload: { sceneIndex: number; status: string }) {
    this.server.to(`video:${videoId}`).emit('scene-progress', { videoId, ...payload });
  }
}
