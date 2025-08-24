import { create } from 'zustand';
import { io, Socket } from 'socket.io-client';

interface SocketState {
  socket: Socket | null;
  connected: boolean;
  realtimeDisabled?: boolean;
  connect: (userId: string) => void;
  disconnect: () => void;
}

export const useSocketStore = create<SocketState>((set, get) => ({
  socket: null,
  connected: false,
  realtimeDisabled: false,

  connect: (userId: string) => {
    const currentSocket = get().socket;
    if (currentSocket) {
      if (currentSocket.connected) {
        return;
      }
      // Clean up stale instance to allow a fresh connect
      try {
        currentSocket.removeAllListeners();
        currentSocket.disconnect();
      } catch {}
      set({ socket: null, connected: false });
    }

    const token = typeof window !== 'undefined' ? localStorage.getItem('taskzen_token') : null;
    if (!token) {
      console.error('No auth token found');
      return;
    }

    // Determine server URL (prefer env; intelligently infer LAN when accessed from another device)
    const inferredFromWindow =
      typeof window !== 'undefined'
        ? `${window.location.protocol}//${window.location.hostname}:3001/api/v1`
        : 'http://localhost:3001/api/v1';
    const apiUrl = process.env.NEXT_PUBLIC_API_URL || inferredFromWindow;
    const inferredBase = apiUrl.replace(/\/??api\/v1\/?$/, '');
    // Base WS URL: env wins, else derive from API
    const envWs = process.env.NEXT_PUBLIC_WS_URL || '';
    const rawWsUrl = (envWs || `${inferredBase}/realtime`).replace(/\/$/, '');
    let finalWsUrl = /\/realtime$/.test(rawWsUrl) ? rawWsUrl : `${rawWsUrl}/realtime`;

    // If env points to loopback but the page is served on a LAN host, rewrite to that host
    if (typeof window !== 'undefined') {
      try {
        const u = new URL(finalWsUrl);
        const winHost = window.location.hostname;
        const winProto = window.location.protocol;
        const isLoopback = (h: string) => h === 'localhost' || h === '127.0.0.1' || h === '::1';
        const pageIsLoopback = isLoopback(winHost);
        const urlIsLoopback = isLoopback(u.hostname);

        if (urlIsLoopback && !pageIsLoopback) {
          // Replace host with the page's hostname for cross-device (LAN) access
          u.hostname = winHost;
          // In dev, prefer plain HTTP to avoid wss on non-TLS backend
          u.protocol = process.env.NODE_ENV !== 'production' ? 'http:' : winProto;
          if (!u.port) u.port = '3001';
          finalWsUrl = u.toString().replace(/\/$/, '');
        }

        // Also downshift https->http for local loopback in dev
        if (process.env.NODE_ENV !== 'production' && isLoopback(u.hostname) && u.protocol === 'https:') {
          u.protocol = 'http:';
          finalWsUrl = u.toString().replace(/\/$/, '');
        }
      } catch {}

      if (process.env.NODE_ENV !== 'production') {
        console.log('[socket] connecting to', finalWsUrl);
      }
    }

    const socket = io(finalWsUrl, {
      // Start with polling to survive environments where wss is not available
      transports: ['polling', 'websocket'],
      withCredentials: true,
      // Explicit default path for clarity
      path: '/socket.io',
      // Provide token in both places for maximum compatibility
      auth: { token },
      query: { token },
      reconnection: true,
      reconnectionAttempts: 10,
      reconnectionDelayMax: 2000,
      forceNew: true,
      timeout: 10000,
    });

    socket.on('connect', () => {
      console.log('Socket connected');
      socket.emit('auth', { userId });
      set({ connected: true, realtimeDisabled: false });
    });

    socket.on('disconnect', () => {
      console.log('Socket disconnected');
      set({ socket: null, connected: false });
    });

    socket.on('error', (error) => {
      console.error('Socket error:', error);
    });

    socket.on('connect_error', (error) => {
      const message = error instanceof Error
        ? error.message
        : typeof error === 'string'
          ? error
          : JSON.stringify(error);
      console.error('Socket connect_error:', message);
    });

    socket.on('connect_timeout', () => {
      console.error('Socket connect_timeout');
    });

    socket.on('reconnect_attempt', (attempt) => {
      console.warn('Socket reconnect_attempt:', attempt);
    });

    socket.on('reconnect_error', (err) => {
      const message = err instanceof Error
        ? err.message
        : typeof err === 'string'
          ? err
          : JSON.stringify(err);
      console.error('Socket reconnect_error:', message);
    });

    socket.on('reconnect_failed', () => {
      console.error('Socket reconnect_failed');
    });

    socket.on('authSuccess', (data) => {
      console.log('Socket authenticated:', data);
    });

    // Server may emit when realtime is disabled dynamically
    socket.on('realtimeDisabled', (payload) => {
      console.warn('Realtime disabled by server:', payload);
      try { socket.disconnect(); } catch {}
      set({ socket: null, connected: false, realtimeDisabled: true });
    });

    set({ socket });
  },

  disconnect: () => {
    const socket = get().socket;
    if (socket) {
      socket.disconnect();
      set({ socket: null, connected: false });
    }
  },
}))

