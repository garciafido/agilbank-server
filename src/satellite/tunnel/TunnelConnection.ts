/**
 * TunnelConnection - Manages a single satellite's tunnel connection
 *
 * Handles:
 * - The satellite's TCP connection (from port 50052)
 * - Multiple worker connections (from port 50053)
 * - Multiplexing worker traffic over the satellite tunnel
 */

import * as net from 'net';
import type { Logger } from 'pino';
import {
  FrameParser,
  createFrame,
  createControlFrame,
  parseControlMessage,
  CONTROL_CONNECTION_ID,
  TUNNEL_HEARTBEAT_INTERVAL_MS,
  type TunnelFrame,
} from './TunnelProtocol';

export interface TunnelConnectionOptions {
  satelliteId: string;
  satelliteSocket: net.Socket;
  logger: Logger;
  onClose: (satelliteId: string) => void;
}

// Pending connection waiting for READY from satellite
interface PendingWorkerConnection {
  socket: net.Socket;
  target: string;
  onReady: () => void;
  onError: (error: string) => void;
}

export class TunnelConnection {
  private readonly satelliteId: string;
  private readonly satelliteSocket: net.Socket;
  private readonly logger: Logger;
  private readonly onClose: (satelliteId: string) => void;

  private readonly frameParser = new FrameParser();
  private readonly workerConnections = new Map<number, net.Socket>();
  private readonly pendingConnections = new Map<number, PendingWorkerConnection>();
  private nextConnectionId = 1;
  private heartbeatTimer: NodeJS.Timeout | null = null;
  private lastPongAt = Date.now();
  private closed = false;

  // Stats
  private bytesToSatellite = 0;
  private bytesFromSatellite = 0;

  constructor(options: TunnelConnectionOptions) {
    this.satelliteId = options.satelliteId;
    this.satelliteSocket = options.satelliteSocket;
    this.logger = options.logger.child({ module: 'TunnelConnection', satelliteId: options.satelliteId });
    this.onClose = options.onClose;

    this.setupSatelliteSocket();
    this.startHeartbeat();

    this.logger.info('Tunnel connection established');
  }

  /**
   * Handle a new worker connection with HTTP CONNECT target
   * Returns a promise that resolves when satellite confirms connection is ready
   */
  handleWorkerConnection(
    workerSocket: net.Socket,
    target: string
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      if (this.closed) {
        this.logger.warn('Rejecting worker connection - tunnel is closed');
        reject(new Error('Tunnel closed'));
        return;
      }

      const connectionId = this.nextConnectionId++;
      const workerAddr = `${workerSocket.remoteAddress}:${workerSocket.remotePort}`;

      this.logger.debug({ connectionId, workerAddr, target }, 'Worker connection pending');

      // Store as pending until satellite confirms READY
      this.pendingConnections.set(connectionId, {
        socket: workerSocket,
        target,
        onReady: () => {
          // Move to active connections
          this.pendingConnections.delete(connectionId);
          this.workerConnections.set(connectionId, workerSocket);

          // Setup data forwarding
          workerSocket.on('data', (data: Buffer) => {
            const frame = createFrame(connectionId, data);
            this.sendToSatellite(frame);
          });

          this.logger.debug({ connectionId, target }, 'Worker connection ready');
          resolve();
        },
        onError: (error: string) => {
          this.pendingConnections.delete(connectionId);
          reject(new Error(error));
        },
      });

      // Handle worker socket events
      workerSocket.on('error', (err) => {
        this.logger.debug({ connectionId, error: err.message }, 'Worker socket error');
        this.closeWorkerConnection(connectionId, 'error');
      });

      workerSocket.on('close', () => {
        this.logger.debug({ connectionId }, 'Worker disconnected');
        this.closeWorkerConnection(connectionId, 'closed');
      });

      // Send OPEN control message to satellite with target
      const openMsg = createControlFrame({
        type: 'OPEN',
        connectionId,
        target,
      });
      this.sendToSatellite(openMsg);

      // Timeout for READY response
      setTimeout(() => {
        const pending = this.pendingConnections.get(connectionId);
        if (pending) {
          this.logger.warn({ connectionId, target }, 'Timeout waiting for READY');
          pending.onError('Timeout waiting for satellite');
          this.closeWorkerConnection(connectionId, 'timeout');
        }
      }, 30000);
    });
  }

  /**
   * Close the tunnel and all worker connections
   */
  close(): void {
    if (this.closed) return;
    this.closed = true;

    this.logger.info({
      bytesToSatellite: this.bytesToSatellite,
      bytesFromSatellite: this.bytesFromSatellite,
      workerConnections: this.workerConnections.size,
      pendingConnections: this.pendingConnections.size,
    }, 'Closing tunnel connection');

    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }

    // Reject all pending connections
    for (const [connectionId, pending] of this.pendingConnections) {
      pending.onError('Tunnel closed');
      pending.socket.destroy();
      this.pendingConnections.delete(connectionId);
    }

    // Close all worker connections
    for (const [connectionId, socket] of this.workerConnections) {
      socket.destroy();
      this.workerConnections.delete(connectionId);
    }

    // Close satellite socket
    this.satelliteSocket.destroy();

    this.onClose(this.satelliteId);
  }

  /**
   * Check if connection is still alive
   */
  isAlive(): boolean {
    return !this.closed && !this.satelliteSocket.destroyed;
  }

  /**
   * Get connection stats
   */
  getStats() {
    return {
      satelliteId: this.satelliteId,
      workerConnections: this.workerConnections.size,
      pendingConnections: this.pendingConnections.size,
      bytesToSatellite: this.bytesToSatellite,
      bytesFromSatellite: this.bytesFromSatellite,
      lastPongAt: this.lastPongAt,
    };
  }

  // ============================================================================
  // PRIVATE METHODS
  // ============================================================================

  private setupSatelliteSocket(): void {
    this.satelliteSocket.on('data', (data: Buffer) => {
      this.bytesFromSatellite += data.length;
      this.handleSatelliteData(data);
    });

    this.satelliteSocket.on('error', (err) => {
      this.logger.error({ error: err.message }, 'Satellite socket error');
      this.close();
    });

    this.satelliteSocket.on('close', () => {
      this.logger.info('Satellite disconnected');
      this.close();
    });
  }

  private handleSatelliteData(data: Buffer): void {
    const frames = this.frameParser.parse(data);

    for (const frame of frames) {
      if (frame.connectionId === CONTROL_CONNECTION_ID) {
        this.handleControlMessage(frame.payload);
      } else {
        this.handleDataFrame(frame);
      }
    }
  }

  private handleControlMessage(payload: Buffer): void {
    const msg = parseControlMessage(payload);
    if (!msg) {
      this.logger.warn('Invalid control message received');
      return;
    }

    switch (msg.type) {
      case 'PONG':
        this.lastPongAt = Date.now();
        break;

      case 'READY':
        if (msg.connectionId) {
          const pending = this.pendingConnections.get(msg.connectionId);
          if (pending) {
            pending.onReady();
          } else {
            this.logger.debug({ connectionId: msg.connectionId }, 'READY for unknown connection');
          }
        }
        break;

      case 'CLOSE':
        if (msg.connectionId) {
          // Handle pending connection failure
          const pending = this.pendingConnections.get(msg.connectionId);
          if (pending) {
            pending.onError(msg.reason || 'Connection closed by satellite');
            pending.socket.destroy();
            this.pendingConnections.delete(msg.connectionId);
          }

          // Handle active connection close
          const socket = this.workerConnections.get(msg.connectionId);
          if (socket) {
            socket.end(); // Graceful close
            this.workerConnections.delete(msg.connectionId);
          }
        }
        break;

      default:
        this.logger.debug({ type: msg.type }, 'Unhandled control message');
    }
  }

  private handleDataFrame(frame: TunnelFrame): void {
    const socket = this.workerConnections.get(frame.connectionId);
    if (!socket) {
      this.logger.debug({ connectionId: frame.connectionId }, 'Data for unknown connection');
      // Send CLOSE to satellite for this connection
      const closeMsg = createControlFrame({
        type: 'CLOSE',
        connectionId: frame.connectionId,
        reason: 'unknown connection',
      });
      this.sendToSatellite(closeMsg);
      return;
    }

    socket.write(frame.payload);
  }

  private closeWorkerConnection(connectionId: number, reason: string): void {
    // Check pending connections
    const pending = this.pendingConnections.get(connectionId);
    if (pending) {
      pending.onError(reason);
      pending.socket.destroy();
      this.pendingConnections.delete(connectionId);
    }

    // Check active connections
    const socket = this.workerConnections.get(connectionId);
    if (socket) {
      socket.destroy();
      this.workerConnections.delete(connectionId);
    }

    // Notify satellite
    const closeMsg = createControlFrame({
      type: 'CLOSE',
      connectionId,
      reason,
    });
    this.sendToSatellite(closeMsg);
  }

  private sendToSatellite(data: Buffer): void {
    if (!this.satelliteSocket.destroyed) {
      this.bytesToSatellite += data.length;
      this.satelliteSocket.write(data);
    }
  }

  private startHeartbeat(): void {
    this.heartbeatTimer = setInterval(() => {
      // Check if satellite is responsive
      const timeSinceLastPong = Date.now() - this.lastPongAt;
      if (timeSinceLastPong > TUNNEL_HEARTBEAT_INTERVAL_MS * 3) {
        this.logger.warn({ timeSinceLastPong }, 'Satellite not responding to pings');
        this.close();
        return;
      }

      // Send ping
      const pingMsg = createControlFrame({ type: 'PING' });
      this.sendToSatellite(pingMsg);
    }, TUNNEL_HEARTBEAT_INTERVAL_MS);
  }
}
