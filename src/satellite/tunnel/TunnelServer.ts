/**
 * TunnelServer - Reverse tunnel server for satellites
 *
 * Listens on two ports:
 * - Satellite port (50052): Satellites connect here to establish tunnels
 * - Worker port (50053): Workers connect here via HTTP CONNECT proxy
 */

import * as net from 'net';
import * as tls from 'tls';
import * as fs from 'fs';
import type { Logger } from 'pino';
import { TunnelConnection } from './TunnelConnection';
import {
  HandshakeParser,
  HttpConnectParser,
  parseSatelliteHandshake,
  createHttpConnectResponse,
  createHttpAuthRequiredResponse,
  createHttpErrorResponse,
  TUNNEL_HANDSHAKE_TIMEOUT_MS,
} from './TunnelProtocol';

export interface TunnelServerConfig {
  enabled: boolean;
  satellitePort: number;
  workerPort: number;
  tlsEnabled?: boolean;
  caCertPath?: string;
  serverCertPath?: string;
  serverKeyPath?: string;
}

export interface TunnelServerOptions {
  config: TunnelServerConfig;
  logger: Logger;
  validateSatelliteToken: (satelliteId: string, token: string) => Promise<boolean>;
  onTunnelConnect?: (satelliteId: string) => Promise<void>;
  onTunnelDisconnect?: (satelliteId: string) => Promise<void>;
}

export class TunnelServer {
  private readonly config: TunnelServerConfig;
  private readonly logger: Logger;
  private readonly validateSatelliteToken: (satelliteId: string, token: string) => Promise<boolean>;
  private readonly onTunnelConnect?: (satelliteId: string) => Promise<void>;
  private readonly onTunnelDisconnect?: (satelliteId: string) => Promise<void>;

  private satelliteServer: net.Server | null = null;
  private workerServer: net.Server | null = null;

  // Map of satelliteId -> TunnelConnection
  private readonly tunnels = new Map<string, TunnelConnection>();

  constructor(options: TunnelServerOptions) {
    this.config = options.config;
    this.logger = options.logger.child({ module: 'TunnelServer' });
    this.validateSatelliteToken = options.validateSatelliteToken;
    this.onTunnelConnect = options.onTunnelConnect;
    this.onTunnelDisconnect = options.onTunnelDisconnect;
  }

  /**
   * Start the tunnel servers
   */
  async start(): Promise<void> {
    if (!this.config.enabled) {
      this.logger.info('Tunnel server is disabled');
      return;
    }

    await Promise.all([
      this.startSatelliteServer(),
      this.startWorkerServer(),
    ]);

    this.logger.info({
      satellitePort: this.config.satellitePort,
      workerPort: this.config.workerPort,
    }, 'Tunnel servers started');
  }

  /**
   * Stop the tunnel servers
   */
  async stop(): Promise<void> {
    this.logger.info('Stopping tunnel servers');

    // Close all tunnels
    for (const [satelliteId, tunnel] of this.tunnels) {
      tunnel.close();
      this.tunnels.delete(satelliteId);
    }

    // Close servers
    await Promise.all([
      this.closeServer(this.satelliteServer),
      this.closeServer(this.workerServer),
    ]);

    this.satelliteServer = null;
    this.workerServer = null;
  }

  /**
   * Check if a satellite has an active tunnel
   */
  hasTunnel(satelliteId: string): boolean {
    const tunnel = this.tunnels.get(satelliteId);
    return tunnel?.isAlive() ?? false;
  }

  /**
   * Get stats for all tunnels
   */
  getStats() {
    const tunnelStats = [];
    for (const tunnel of this.tunnels.values()) {
      tunnelStats.push(tunnel.getStats());
    }
    return {
      activeTunnels: this.tunnels.size,
      tunnels: tunnelStats,
    };
  }

  // ============================================================================
  // SATELLITE SERVER (port 50052)
  // ============================================================================

  private async startSatelliteServer(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (this.config.tlsEnabled && this.config.caCertPath && this.config.serverCertPath && this.config.serverKeyPath) {
        const tlsOptions: tls.TlsOptions = {
          ca: fs.readFileSync(this.config.caCertPath),
          cert: fs.readFileSync(this.config.serverCertPath),
          key: fs.readFileSync(this.config.serverKeyPath),
          requestCert: true,
          rejectUnauthorized: true,
        };
        this.satelliteServer = tls.createServer(tlsOptions, (socket) => {
          this.handleSatelliteConnection(socket);
        });
        this.logger.info('Satellite tunnel server using TLS');
      } else {
        this.satelliteServer = net.createServer((socket) => {
          this.handleSatelliteConnection(socket);
        });
        if (this.config.tlsEnabled) {
          this.logger.warn('TLS enabled but certificate paths not configured — falling back to insecure');
        }
      }

      this.satelliteServer.on('error', (err) => {
        this.logger.error({ error: err.message }, 'Satellite server error');
        if (!this.satelliteServer) reject(err);
      });

      this.satelliteServer.listen(this.config.satellitePort, '0.0.0.0', () => {
        this.logger.info({ port: this.config.satellitePort }, 'Satellite tunnel server listening');
        resolve();
      });
    });
  }

  private handleSatelliteConnection(socket: net.Socket): void {
    const remoteAddr = `${socket.remoteAddress}:${socket.remotePort}`;
    this.logger.debug({ remoteAddr }, 'Satellite connection received');

    const parser = new HandshakeParser();
    let handshakeComplete = false;

    // Handshake timeout
    const timeout = setTimeout(() => {
      if (!handshakeComplete) {
        this.logger.warn({ remoteAddr }, 'Satellite handshake timeout');
        socket.destroy();
      }
    }, TUNNEL_HANDSHAKE_TIMEOUT_MS);

    const onData = async (data: Buffer) => {
      const result = parser.parse(data);
      if (!result) return; // Wait for more data

      clearTimeout(timeout);
      socket.removeListener('data', onData);
      handshakeComplete = true;

      const handshake = parseSatelliteHandshake(Buffer.from(result.line + '\n'));
      if (!handshake) {
        this.logger.warn({ remoteAddr, line: result.line }, 'Invalid satellite handshake');
        socket.destroy();
        return;
      }

      // Validate token
      const valid = await this.validateSatelliteToken(handshake.satelliteId, handshake.token);
      if (!valid) {
        this.logger.warn({ remoteAddr, satelliteId: handshake.satelliteId }, 'Invalid satellite token');
        socket.destroy();
        return;
      }

      // Check for existing tunnel
      const existingTunnel = this.tunnels.get(handshake.satelliteId);
      if (existingTunnel) {
        this.logger.warn({ satelliteId: handshake.satelliteId }, 'Replacing existing tunnel');
        existingTunnel.close();
        this.tunnels.delete(handshake.satelliteId);
      }

      // Create new tunnel connection
      const tunnel = new TunnelConnection({
        satelliteId: handshake.satelliteId,
        satelliteSocket: socket,
        logger: this.logger,
        onClose: (id) => {
          this.tunnels.delete(id);
          // Notify tunnel disconnect
          this.onTunnelDisconnect?.(id).catch((err) => {
            this.logger.error({ satelliteId: id, error: err.message }, 'Failed to handle tunnel disconnect');
          });
        },
      });

      this.tunnels.set(handshake.satelliteId, tunnel);

      this.logger.info({ satelliteId: handshake.satelliteId, remoteAddr }, 'Satellite tunnel established');

      // Notify tunnel connect
      this.onTunnelConnect?.(handshake.satelliteId).catch((err) => {
        this.logger.error({ satelliteId: handshake.satelliteId, error: err.message }, 'Failed to handle tunnel connect');
      });

      // Process any remaining data after handshake
      if (result.remaining.length > 0) {
        socket.emit('data', result.remaining);
      }
    };

    socket.on('data', onData);

    socket.on('error', (err) => {
      clearTimeout(timeout);
      this.logger.debug({ remoteAddr, error: err.message }, 'Satellite socket error during handshake');
    });

    socket.on('close', () => {
      clearTimeout(timeout);
    });
  }

  // ============================================================================
  // WORKER SERVER (port 50053) - HTTP CONNECT Proxy
  // ============================================================================

  private async startWorkerServer(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.workerServer = net.createServer((socket) => {
        this.handleWorkerConnection(socket);
      });

      this.workerServer.on('error', (err) => {
        this.logger.error({ error: err.message }, 'Worker server error');
        if (!this.workerServer) reject(err);
      });

      this.workerServer.listen(this.config.workerPort, '0.0.0.0', () => {
        this.logger.info({ port: this.config.workerPort }, 'Worker HTTP CONNECT proxy listening');
        resolve();
      });
    });
  }

  private handleWorkerConnection(socket: net.Socket): void {
    const remoteAddr = `${socket.remoteAddress}:${socket.remotePort}`;
    this.logger.debug({ remoteAddr }, 'Worker connection received');

    const parser = new HttpConnectParser();
    let requestComplete = false;
    let authRequested = false;

    // Request timeout
    const timeout = setTimeout(() => {
      if (!requestComplete) {
        this.logger.warn({ remoteAddr }, 'Worker HTTP CONNECT timeout');
        socket.write(createHttpErrorResponse(408, 'Request Timeout'));
        socket.destroy();
      }
    }, TUNNEL_HANDSHAKE_TIMEOUT_MS);

    const onData = async (data: Buffer) => {
      const result = parser.parse(data);

      if (result === null) {
        return; // Need more data
      }

      // Check for parse error
      if ('error' in result) {
        clearTimeout(timeout);
        socket.removeListener('data', onData);
        requestComplete = true;
        this.logger.warn({ remoteAddr, error: result.error }, 'Invalid HTTP CONNECT request');
        socket.write(createHttpErrorResponse(400, 'Bad Request'));
        socket.destroy();
        return;
      }

      // Check if auth is needed (first request without Proxy-Authorization)
      if ('needsAuth' in result) {
        if (authRequested) {
          // Already asked for auth, still no credentials - reject
          clearTimeout(timeout);
          socket.removeListener('data', onData);
          requestComplete = true;
          this.logger.warn({ remoteAddr }, 'No credentials after 407');
          socket.write(createHttpErrorResponse(407, 'Proxy Authentication Required'));
          socket.destroy();
          return;
        }

        // Send 407 and wait for retry with credentials
        authRequested = true;
        this.logger.debug({ remoteAddr, host: result.host, port: result.port }, 'Requesting proxy authentication');
        socket.write(createHttpAuthRequiredResponse());
        // Keep listening for the retry with auth
        return;
      }

      // We have a complete request with auth
      clearTimeout(timeout);
      socket.removeListener('data', onData);
      requestComplete = true;

      const { request, remaining } = result;
      const { host, port, satelliteId } = request;
      const target = `${host}:${port}`;

      this.logger.debug({ remoteAddr, satelliteId, target }, 'HTTP CONNECT request authenticated');

      // Find tunnel for this satellite
      const tunnel = this.tunnels.get(satelliteId);
      if (!tunnel || !tunnel.isAlive()) {
        this.logger.warn({ remoteAddr, satelliteId }, 'No tunnel available for satellite');
        socket.write(createHttpErrorResponse(502, 'Bad Gateway'));
        socket.destroy();
        return;
      }

      // Hand off to tunnel connection and wait for satellite to be ready
      try {
        await tunnel.handleWorkerConnection(socket, target);

        // Satellite confirmed connection is ready, send 200 to browser
        socket.write(createHttpConnectResponse());

        this.logger.debug({ remoteAddr, satelliteId, target }, 'HTTP CONNECT tunnel established');

        // If there was any data after the request headers, forward it now
        if (remaining.length > 0) {
          socket.emit('data', remaining);
        }
      } catch (err) {
        this.logger.warn({ remoteAddr, satelliteId, target, error: (err as Error).message },
          'Failed to establish tunnel connection');
        socket.write(createHttpErrorResponse(502, 'Bad Gateway'));
        socket.destroy();
      }
    };

    socket.on('data', onData);

    socket.on('error', (err) => {
      clearTimeout(timeout);
      this.logger.debug({ remoteAddr, error: err.message }, 'Worker socket error during request');
    });

    socket.on('close', () => {
      clearTimeout(timeout);
    });
  }

  // ============================================================================
  // HELPERS
  // ============================================================================

  private closeServer(server: net.Server | null): Promise<void> {
    return new Promise((resolve) => {
      if (!server) {
        resolve();
        return;
      }

      server.close(() => resolve());
    });
  }
}
