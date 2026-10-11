import type { Logger } from 'pino';
import type {
  ISatelliteRegistry,
  IProxyPool,
  ProxyInfo,
  ProxyPoolOptions,
  SatelliteInfo,
} from '../types';

const DEFAULT_PROXY_PORT = 1080;

export class ProxyPool implements IProxyPool {
  private roundRobinIndex = 0;
  private tunnelWorkerHost: string;
  private tunnelWorkerPort: number;

  constructor(
    private registry: ISatelliteRegistry,
    private logger: Logger,
    private defaultPort: number = DEFAULT_PROXY_PORT
  ) {
    // Read from environment with sensible defaults
    this.tunnelWorkerHost = process.env.SATELLITE_TUNNEL_WORKER_HOST || 'server';
    this.tunnelWorkerPort = parseInt(process.env.SATELLITE_TUNNEL_WORKER_PORT || '50053', 10);

    this.logger.debug({
      tunnelWorkerHost: this.tunnelWorkerHost,
      tunnelWorkerPort: this.tunnelWorkerPort,
    }, 'ProxyPool initialized with tunnel config');
  }

  /**
   * Configure tunnel worker endpoint
   */
  setTunnelConfig(workerHost?: string, workerPort?: number): void {
    if (workerHost) this.tunnelWorkerHost = workerHost;
    if (workerPort) this.tunnelWorkerPort = workerPort;
    this.logger.info({ workerHost: this.tunnelWorkerHost, workerPort: this.tunnelWorkerPort }, 'Tunnel config set for ProxyPool');
  }

  /**
   * Gets the next available proxy using round-robin load balancing.
   * Filters by region and/or countryCode if provided.
   */
  async getNextProxy(options?: ProxyPoolOptions): Promise<ProxyInfo | null> {
    const satellites = await this.registry.findByCapability('proxy');

    if (satellites.length === 0) {
      this.logger.warn('No proxy satellites available');
      return null;
    }

    // Filter by region/country if specified
    const filtered = this.filterSatellites(satellites, options);

    if (filtered.length === 0) {
      this.logger.warn({ options }, 'No proxy satellites match filter criteria');
      return null;
    }

    // Filter to satellites that are actually reachable (have tunnel or publicIp)
    const reachable = filtered.filter(s =>
      s.tunnelConnectedAt != null || s.publicIp
    );

    if (reachable.length === 0) {
      this.logger.warn({ options }, 'No reachable proxy satellites (no tunnel or publicIp)');
      return null;
    }

    // Round-robin selection
    this.roundRobinIndex = (this.roundRobinIndex + 1) % reachable.length;
    const satellite = reachable[this.roundRobinIndex];

    const proxyInfo = this.satelliteToProxyInfo(satellite);
    if (!proxyInfo) {
      this.logger.warn({ satelliteId: satellite.id }, 'Failed to create proxy info');
      return null;
    }

    this.logger.info(
      { proxy: { satelliteId: proxyInfo.satelliteId, host: proxyInfo.host, viaTunnel: proxyInfo.viaTunnel } },
      'Selected proxy from pool'
    );

    return proxyInfo;
  }

  /**
   * Lists all available proxies matching the filter criteria.
   */
  async listAvailableProxies(options?: ProxyPoolOptions): Promise<ProxyInfo[]> {
    const satellites = await this.registry.findByCapability('proxy');
    const filtered = this.filterSatellites(satellites, options);

    return filtered
      .map(s => this.satelliteToProxyInfo(s))
      .filter((p): p is ProxyInfo => p !== null);
  }

  /**
   * Gets proxy info for a specific satellite by ID.
   */
  async getProxyBySatelliteId(satelliteId: string): Promise<ProxyInfo | null> {
    const satellite = await this.registry.findById(satelliteId);

    if (!satellite) {
      this.logger.warn({ satelliteId }, 'Satellite not found');
      return null;
    }

    if (satellite.status !== 'online') {
      this.logger.warn({ satelliteId, status: satellite.status }, 'Satellite is not online');
      return null;
    }

    if (!satellite.capabilities.proxy.enabled) {
      this.logger.warn({ satelliteId }, 'Satellite does not have proxy capability enabled');
      return null;
    }

    return this.satelliteToProxyInfo(satellite);
  }

  /**
   * Gets the count of available proxies matching the filter criteria.
   */
  async getAvailableCount(options?: ProxyPoolOptions): Promise<number> {
    const satellites = await this.registry.findByCapability('proxy');
    const filtered = this.filterSatellites(satellites, options);
    // Count satellites that have either a tunnel or a public IP
    return filtered.filter(s =>
      s.tunnelConnectedAt != null || s.publicIp
    ).length;
  }

  // ============================================================================
  // HELPERS
  // ============================================================================

  private filterSatellites(
    satellites: SatelliteInfo[],
    options?: ProxyPoolOptions
  ): SatelliteInfo[] {
    let filtered = satellites;

    if (options?.region) {
      filtered = filtered.filter(s => s.location === options.region);
    }

    if (options?.countryCode) {
      filtered = filtered.filter(s => s.countryCode === options.countryCode);
    }

    return filtered;
  }

  private satelliteToProxyInfo(satellite: SatelliteInfo): ProxyInfo | null {
    // Check if satellite has an active tunnel (preferred - works behind NAT)
    if (satellite.tunnelConnectedAt != null) {
      this.logger.debug({ satelliteId: satellite.id }, 'Using tunnel for proxy');
      return {
        satelliteId: satellite.id,
        satelliteName: satellite.name,
        host: this.tunnelWorkerHost,
        port: this.tunnelWorkerPort,
        protocol: 'socks5',
        region: satellite.location,
        countryCode: satellite.countryCode,
        viaTunnel: true,
      };
    }

    // Fallback to direct connection via public IP
    if (!satellite.publicIp) {
      return null;
    }

    const port = satellite.capabilities.proxy.allowedPorts?.[0] ?? this.defaultPort;

    return {
      satelliteId: satellite.id,
      satelliteName: satellite.name,
      host: satellite.publicIp,
      port,
      protocol: 'socks5',
      region: satellite.location,
      countryCode: satellite.countryCode,
      viaTunnel: false,
    };
  }
}
