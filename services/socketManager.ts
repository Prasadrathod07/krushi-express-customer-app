// Centralized Socket Manager for Customer App
import { io, Socket } from 'socket.io-client';
import { SOCKET_URL } from '../lib/env';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { AppState, AppStateStatus } from 'react-native';

class SocketManager {
  private socket: Socket | null = null;
  private isConnecting = false;
  private listeners: Map<string, Set<Function>> = new Map();
  private appState: AppStateStatus = 'active';

  constructor() {
    AppState.addEventListener('change', this.handleAppStateChange);
  }

  private handleAppStateChange = (nextAppState: AppStateStatus) => {
    if (this.appState.match(/inactive|background/) && nextAppState === 'active') {
      if (!this.socket?.connected) {
        this.connect();
      }
    }
    this.appState = nextAppState;
  };

  async connect(): Promise<void> {
    if (this.isConnecting || this.socket?.connected) {
      return;
    }

    this.isConnecting = true;

    try {
      const token = await AsyncStorage.getItem('userToken') || await AsyncStorage.getItem('authToken');
      if (!token) {
        throw new Error('No authentication token found');
      }

      if (this.socket) {
        this.socket.disconnect();
      }

      this.socket = io(SOCKET_URL, {
        auth: { token },
        transports: ['websocket', 'polling'],
        reconnection: true,
      });

      this.setupEventHandlers();
    } catch (error) {
      console.error('SocketManager connection error:', error);
      this.isConnecting = false;
      throw error;
    }
  }

  private setupEventHandlers(): void {
    if (!this.socket) return;

    this.socket.on('connect', () => {
      console.log('✅ SocketManager: Connected');
      this.isConnecting = false;
      this.emitLocal('socket-connected', {});
    });

    this.socket.on('disconnect', (reason) => {
      console.log('❌ SocketManager: Disconnected', reason);
      this.isConnecting = false;
      this.emitLocal('socket-disconnected', { reason });
    });

    // ── Trip lifecycle ────────────────────────────────────────────────────────
    this.socket.on('trip-accepted',       (data) => this.emitLocal('trip-accepted', data));
    this.socket.on('trip-state-updated',  (data) => this.emitLocal('trip-state-updated', data));
    this.socket.on('trip-cancelled',      (data) => this.emitLocal('trip-cancelled', data));
    this.socket.on('otp-verified',        (data) => this.emitLocal('otp-verified', data));
    this.socket.on('driver-location-updated', (data) => this.emitLocal('driver-location-updated', data));

    // ── Negotiation / chat ────────────────────────────────────────────────────
    this.socket.on('new-offer',           (data) => this.emitLocal('new-offer', data));
    this.socket.on('offer-updated',       (data) => this.emitLocal('offer-updated', data));
    this.socket.on('chat-message',        (data) => this.emitLocal('chat-message', data));
    this.socket.on('typing-start',        (data) => this.emitLocal('typing-start', data));
    this.socket.on('typing-stop',         (data) => this.emitLocal('typing-stop', data));
    this.socket.on('negotiation-expired', (data) => this.emitLocal('negotiation-expired', data));

    // ── Driver search waves ───────────────────────────────────────────────────
    this.socket.on('wave-expanding',         (data) => this.emitLocal('wave-expanding', data));
    this.socket.on('no-drivers-found',       (data) => this.emitLocal('no-drivers-found', data));
    this.socket.on('priority-search-started',(data) => this.emitLocal('priority-search-started', data));
    this.socket.on('search-exhausted',       (data) => this.emitLocal('search-exhausted', data));
    this.socket.on('driver-offer',           (data) => this.emitLocal('driver-offer', data));

    // ── Misc ──────────────────────────────────────────────────────────────────
    this.socket.on('request-rating',         (data) => this.emitLocal('request-rating', data));
    this.socket.on('vehicle-location-updated',(data) => this.emitLocal('vehicle-location-updated', data));
    this.socket.on('new-notification',       (data) => this.emitLocal('new-notification', data));
  }

  disconnect(): void {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }
    this.isConnecting = false;
  }

  subscribeToTrip(tripId: string, userId?: string): void {
    if (this.socket?.connected) {
      this.socket.emit('subscribe-trip', { tripId, userId });
    }
  }

  unsubscribeFromTrip(tripId: string): void {
    if (this.socket?.connected) {
      this.socket.emit('leave-trip-room', { tripId });
    }
  }

  /** Send an event directly through the underlying socket */
  sendEvent(event: string, data: any): void {
    if (this.socket?.connected) {
      this.socket.emit(event, data);
    }
  }

  // ── Event emitter pattern ─────────────────────────────────────────────────
  on(event: string, callback: Function): void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)!.add(callback);
  }

  off(event: string, callback: Function): void {
    const callbacks = this.listeners.get(event);
    if (callbacks) {
      callbacks.delete(callback);
    }
  }

  private emitLocal(event: string, data: any): void {
    const callbacks = this.listeners.get(event);
    if (callbacks) {
      callbacks.forEach(callback => {
        try {
          callback(data);
        } catch (error) {
          console.error(`Error in socket event listener for ${event}:`, error);
        }
      });
    }
  }

  isConnected(): boolean {
    return this.socket?.connected || false;
  }

  getSocket(): Socket | null {
    return this.socket;
  }
}

export const socketManager = new SocketManager();
