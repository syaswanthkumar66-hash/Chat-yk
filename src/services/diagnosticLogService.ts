import { CallError } from '../types';

export interface DiagnosticEntry {
  id: string;
  timestamp: string;      // Full ISO timestamp
  timeStr: string;        // HH:mm:ss.SSS format for easy reading
  category: 'signaling' | 'socket' | 'webrtc' | 'media' | 'error';
  event: string;
  message: string;
  peerId?: string;
  roomId?: string;
  metadata?: any;
}

class DiagnosticLogService {
  private logs: DiagnosticEntry[] = [];
  private readonly maxLogs = 500;
  private listeners: ((log: DiagnosticEntry) => void)[] = [];

  constructor() {
    this.log('media', 'system_init', 'Diagnostic Log Service initialized. Monitoring starts now.', undefined, undefined, {
      userAgent: navigator.userAgent,
      platform: navigator.platform
    });
  }

  private formatTime(date: Date): string {
    const pad = (n: number, size = 2) => n.toString().padStart(size, '0');
    return `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}.${pad(date.getMilliseconds(), 3)}`;
  }

  public log(
    category: 'signaling' | 'socket' | 'webrtc' | 'media' | 'error',
    event: string,
    message: string,
    peerId?: string,
    roomId?: string,
    metadata?: any
  ) {
    const now = new Date();
    const entry: DiagnosticEntry = {
      id: Math.random().toString(36).substring(2, 11),
      timestamp: now.toISOString(),
      timeStr: this.formatTime(now),
      category,
      event,
      message,
      peerId,
      roomId,
      metadata
    };

    this.logs.push(entry);
    if (this.logs.length > this.maxLogs) {
      this.logs.shift();
    }

    // Output formatted console message with high visual contrast
    const prefix = `[WEBRTC-DIAGNOSTIC][${entry.timeStr}][${category.toUpperCase()}][${event}]`;
    const peerRoomInfo = `${peerId ? `[Peer: ${peerId}]` : ''}${roomId ? `[Room: ${roomId}]` : ''}`;
    
    let consoleMethod: 'log' | 'warn' | 'error' = 'log';
    if (category === 'error') {
      consoleMethod = 'error';
    } else if (event.includes('fail') || event.includes('error') || event.includes('stall') || event.includes('timeout')) {
      consoleMethod = 'warn';
    }

    if (consoleMethod === 'error') {
      console.error(`${prefix}${peerRoomInfo} ${message}`, metadata || '');
    } else if (consoleMethod === 'warn') {
      console.warn(`${prefix}${peerRoomInfo} ${message}`, metadata || '');
    } else {
      console.log(`${prefix}${peerRoomInfo} ${message}`, metadata || '');
    }

    // Trigger listeners
    this.listeners.forEach(listener => {
      try {
        listener(entry);
      } catch (err) {
        // Suppress callback failures
      }
    });

    // Dispatch a global CustomEvent so visual overlays or logs monitors can update automatically
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('webrtc_diagnostic_log_added', { detail: entry }));
    }
  }

  public subscribe(callback: (log: DiagnosticEntry) => void): () => void {
    this.listeners.push(callback);
    return () => {
      this.listeners = this.listeners.filter(l => l !== callback);
    };
  }

  public getLogs(): DiagnosticEntry[] {
    return [...this.logs];
  }

  public clearLogs() {
    this.logs = [];
    this.log('media', 'logs_cleared', 'Diagnostic logs cleared manually.');
  }
}

export const diagnosticLogger = new DiagnosticLogService();
