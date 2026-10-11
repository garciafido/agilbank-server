/**
 * TunnelProtocol - Protocol for satellite reverse tunnels
 *
 * Satellite Port (50052):
 *   Handshake: "SATELLITE:<satelliteId>:<token>\n"
 *   Then multiplexed frames: [4 bytes connId][4 bytes length][payload]
 *
 * Worker Port (50053):
 *   HTTP CONNECT proxy with Basic Auth for routing
 *   Request: "CONNECT host:port HTTP/1.1\r\nProxy-Authorization: Basic base64(satelliteId:x)\r\n\r\n"
 *   Response: "HTTP/1.1 200 Connection Established\r\n\r\n"
 */

export const TUNNEL_HANDSHAKE_TIMEOUT_MS = 5000;
export const TUNNEL_HEARTBEAT_INTERVAL_MS = 30000;

// Frame header: 4 bytes connectionId + 4 bytes length
export const FRAME_HEADER_SIZE = 8;

// Special connectionId for control messages
export const CONTROL_CONNECTION_ID = 0;

export type ControlMessageType = 'OPEN' | 'CLOSE' | 'READY' | 'PING' | 'PONG';

export interface ControlMessage {
  type: ControlMessageType;
  connectionId?: number;
  target?: string; // "host:port" - used in OPEN
  reason?: string;
}

export interface TunnelFrame {
  connectionId: number;
  payload: Buffer;
}

/**
 * Parse satellite handshake: "SATELLITE:<satelliteId>:<token>\n"
 */
export function parseSatelliteHandshake(data: Buffer): { satelliteId: string; token: string } | null {
  const str = data.toString('utf8');
  const newlineIndex = str.indexOf('\n');
  if (newlineIndex === -1) return null;

  const line = str.substring(0, newlineIndex);
  const match = line.match(/^SATELLITE:([^:]+):(.+)$/);
  if (!match) return null;

  return { satelliteId: match[1], token: match[2] };
}

/**
 * Create satellite handshake message
 */
export function createSatelliteHandshake(satelliteId: string, token: string): Buffer {
  return Buffer.from(`SATELLITE:${satelliteId}:${token}\n`);
}

/**
 * Create a tunnel frame with header
 */
export function createFrame(connectionId: number, payload: Buffer): Buffer {
  const header = Buffer.alloc(FRAME_HEADER_SIZE);
  header.writeUInt32BE(connectionId, 0);
  header.writeUInt32BE(payload.length, 4);
  return Buffer.concat([header, payload]);
}

/**
 * Create a control message frame
 */
export function createControlFrame(message: ControlMessage): Buffer {
  const payload = Buffer.from(JSON.stringify(message));
  return createFrame(CONTROL_CONNECTION_ID, payload);
}

/**
 * Parse control message from payload
 */
export function parseControlMessage(payload: Buffer): ControlMessage | null {
  try {
    return JSON.parse(payload.toString('utf8'));
  } catch {
    return null;
  }
}

/**
 * Frame parser - accumulates data and emits complete frames
 */
export class FrameParser {
  private buffer: Buffer = Buffer.alloc(0);

  /**
   * Add data and return any complete frames
   */
  parse(data: Buffer): TunnelFrame[] {
    this.buffer = Buffer.concat([this.buffer, data]);
    const frames: TunnelFrame[] = [];

    while (this.buffer.length >= FRAME_HEADER_SIZE) {
      const connectionId = this.buffer.readUInt32BE(0);
      const payloadLength = this.buffer.readUInt32BE(4);

      const totalLength = FRAME_HEADER_SIZE + payloadLength;
      if (this.buffer.length < totalLength) {
        break; // Wait for more data
      }

      const payload = this.buffer.subarray(FRAME_HEADER_SIZE, totalLength);
      frames.push({ connectionId, payload: Buffer.from(payload) });

      this.buffer = this.buffer.subarray(totalLength);
    }

    return frames;
  }

  /**
   * Reset parser state
   */
  reset(): void {
    this.buffer = Buffer.alloc(0);
  }

  /**
   * Get remaining buffered data (useful after handshake)
   */
  getRemaining(): Buffer {
    const remaining = this.buffer;
    this.buffer = Buffer.alloc(0);
    return remaining;
  }
}

/**
 * Handshake parser - reads until newline
 */
export class HandshakeParser {
  private buffer: Buffer = Buffer.alloc(0);

  /**
   * Add data and return handshake line if complete, plus remaining data
   */
  parse(data: Buffer): { line: string; remaining: Buffer } | null {
    this.buffer = Buffer.concat([this.buffer, data]);

    const str = this.buffer.toString('utf8');
    const newlineIndex = str.indexOf('\n');
    if (newlineIndex === -1) return null;

    const line = str.substring(0, newlineIndex);
    const remaining = this.buffer.subarray(newlineIndex + 1);
    this.buffer = Buffer.alloc(0);

    return { line, remaining: Buffer.from(remaining) };
  }

  /**
   * Reset parser state
   */
  reset(): void {
    this.buffer = Buffer.alloc(0);
  }
}

// ============================================================================
// HTTP CONNECT PROXY PROTOCOL
// ============================================================================

export interface HttpConnectRequest {
  host: string;
  port: number;
  satelliteId: string;
}

export interface HttpConnectNeedsAuth {
  needsAuth: true;
  host: string;
  port: number;
}

export type HttpConnectParseResult =
  | { request: HttpConnectRequest; remaining: Buffer }
  | { needsAuth: true; host: string; port: number }
  | { error: string }
  | null;

/**
 * HTTP CONNECT Parser
 * Parses: "CONNECT host:port HTTP/1.1\r\n...headers...\r\n\r\n"
 *
 * Returns needsAuth when request is valid but missing Proxy-Authorization.
 * This allows the server to respond with 407 and wait for retry with auth.
 */
export class HttpConnectParser {
  private buffer: Buffer = Buffer.alloc(0);

  /**
   * Parse HTTP CONNECT request
   * Returns:
   * - null: need more data
   * - { error }: invalid request
   * - { needsAuth, host, port }: valid request but missing auth (send 407)
   * - { request, remaining }: complete valid request with auth
   */
  parse(data: Buffer): HttpConnectParseResult {
    this.buffer = Buffer.concat([this.buffer, data]);
    const str = this.buffer.toString('utf8');

    // Look for end of headers
    const headerEnd = str.indexOf('\r\n\r\n');
    if (headerEnd === -1) {
      // Check if buffer is too large (possible attack)
      if (this.buffer.length > 8192) {
        return { error: 'Request too large' };
      }
      return null; // Need more data
    }

    const headerSection = str.substring(0, headerEnd);
    const lines = headerSection.split('\r\n');

    // Parse request line: "CONNECT host:port HTTP/1.1"
    const requestLine = lines[0];
    const requestMatch = requestLine.match(/^CONNECT\s+([^\s:]+):(\d+)\s+HTTP\/1\.[01]$/i);
    if (!requestMatch) {
      return { error: `Invalid CONNECT request: ${requestLine}` };
    }

    const host = requestMatch[1];
    const port = parseInt(requestMatch[2], 10);

    // Parse headers to find Proxy-Authorization
    let satelliteId: string | null = null;
    for (let i = 1; i < lines.length; i++) {
      const colonIndex = lines[i].indexOf(':');
      if (colonIndex === -1) continue;

      const headerName = lines[i].substring(0, colonIndex).trim().toLowerCase();
      const headerValue = lines[i].substring(colonIndex + 1).trim();

      if (headerName === 'proxy-authorization') {
        satelliteId = parseBasicAuth(headerValue);
      }
    }

    // Clear buffer after consuming request
    this.buffer = Buffer.alloc(0);

    // No auth header - return needsAuth so server can send 407
    if (!satelliteId) {
      return { needsAuth: true, host, port };
    }

    // Get remaining data after headers
    const remaining = Buffer.from(str.substring(headerEnd + 4));

    return {
      request: { host, port, satelliteId },
      remaining,
    };
  }

  reset(): void {
    this.buffer = Buffer.alloc(0);
  }
}

/**
 * Parse Basic auth header and extract username (satelliteId)
 * Format: "Basic base64(username:password)"
 */
function parseBasicAuth(authHeader: string): string | null {
  const match = authHeader.match(/^Basic\s+(.+)$/i);
  if (!match) return null;

  try {
    const decoded = Buffer.from(match[1], 'base64').toString('utf8');
    const colonIndex = decoded.indexOf(':');
    if (colonIndex === -1) return decoded; // No password, entire thing is username
    return decoded.substring(0, colonIndex);
  } catch {
    return null;
  }
}

/**
 * Create HTTP 200 Connection Established response
 */
export function createHttpConnectResponse(): Buffer {
  return Buffer.from('HTTP/1.1 200 Connection Established\r\n\r\n');
}

/**
 * Create HTTP 407 Proxy Authentication Required response
 * Browser will retry with Proxy-Authorization header
 */
export function createHttpAuthRequiredResponse(): Buffer {
  return Buffer.from(
    'HTTP/1.1 407 Proxy Authentication Required\r\n' +
    'Proxy-Authenticate: Basic realm="Satellite Proxy"\r\n' +
    '\r\n'
  );
}

/**
 * Create HTTP error response
 */
export function createHttpErrorResponse(code: number, message: string): Buffer {
  return Buffer.from(`HTTP/1.1 ${code} ${message}\r\n\r\n`);
}
