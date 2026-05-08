import { Injectable } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { ConfigService } from '@nestjs/config';
import { Queue } from 'bullmq';
import TelegramBot from 'node-telegram-bot-api';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class NotificationService {
  private bot: TelegramBot | null = null;

  constructor(
    private prisma: PrismaService,
    private config: ConfigService,
    @InjectQueue('notify') private notifyQueue: Queue,
  ) {
    const token = this.config.get('TELEGRAM_BOT_TOKEN');
    if (token) this.bot = new TelegramBot(token);
  }

  async sendTelegram(payload: {
    videoId?: string;
    projectId?: string;
    event: string;
    message: string;
    imageUrl?: string;
  }) {
    const chatId = this.config.get('TELEGRAM_CHAT_ID');
    let status = 'sent';
    let errorMsg: string | undefined;

    if (this.bot && chatId) {
      try {
        await this.bot.sendMessage(chatId, payload.message, { parse_mode: 'HTML' });
      } catch (e: any) {
        status = 'failed';
        errorMsg = e.message;
      }
    }

    return this.prisma.notificationLog.create({
      data: {
        projectId: payload.projectId,
        videoId: payload.videoId,
        channel: 'telegram',
        event: payload.event,
        message: payload.message,
        imageUrl: payload.imageUrl,
        status,
        errorMsg,
      },
    });
  }

  enqueue(payload: { event: string; message: string; videoId?: string; projectId?: string }) {
    return this.notifyQueue.add('send', payload, { attempts: 3 });
  }

  list(projectId?: string) {
    return this.prisma.notificationLog.findMany({
      where: projectId ? { projectId } : {},
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
  }

  async testConnection() {
    const chatId = this.config.get('TELEGRAM_CHAT_ID');
    if (!this.bot || !chatId) return { ok: false, error: 'Bot not configured' };
    try {
      await this.bot.sendMessage(chatId, '✅ VCA Telegram kết nối thành công!');
      return { ok: true };
    } catch (e: any) {
      return { ok: false, error: e.message };
    }
  }
}
