import type { SatelliteGrpcServerOptions } from './types';

export interface SatelliteConfig {
  enabled: boolean;
  grpc: {
    port: number;
    host: string;
    tlsEnabled: boolean;
    caCertPath?: string;
    serverCertPath?: string;
    serverKeyPath?: string;
    requireClientCert: boolean;
  };
  tunnel: {
    enabled: boolean;
    satellitePort: number;
    workerPort: number;
    tlsEnabled: boolean;
    caCertPath?: string;
    serverCertPath?: string;
    serverKeyPath?: string;
  };
  heartbeat: {
    intervalMs: number;
    timeoutMs: number;
    maxMissed: number;
  };
  tasks: {
    defaultTimeoutMs: number;
    maxRetries: number;
    dispatchIntervalMs: number;
  };
}

const getEnvBoolean = (key: string, defaultValue: boolean): boolean => {
  const value = process.env[key];
  if (value === undefined) return defaultValue;
  return value.toLowerCase() === 'true' || value === '1';
};

const getEnvNumber = (key: string, defaultValue: number): number => {
  const value = process.env[key];
  if (value === undefined) return defaultValue;
  const parsed = parseInt(value, 10);
  return isNaN(parsed) ? defaultValue : parsed;
};

export const getSatelliteConfig = (): SatelliteConfig => ({
  enabled: getEnvBoolean('SATELLITE_ENABLED', false),
  grpc: {
    port: getEnvNumber('SATELLITE_GRPC_PORT', 50051),
    host: process.env.SATELLITE_GRPC_HOST || '0.0.0.0',
    tlsEnabled: getEnvBoolean('SATELLITE_TLS_ENABLED', true),
    caCertPath: process.env.SATELLITE_CA_CERT_PATH,
    serverCertPath: process.env.SATELLITE_SERVER_CERT_PATH,
    serverKeyPath: process.env.SATELLITE_SERVER_KEY_PATH,
    requireClientCert: getEnvBoolean('SATELLITE_REQUIRE_CLIENT_CERT', true),
  },
  tunnel: {
    enabled: getEnvBoolean('SATELLITE_TUNNEL_ENABLED', true),
    satellitePort: getEnvNumber('SATELLITE_TUNNEL_PORT', 50052),
    workerPort: getEnvNumber('SATELLITE_TUNNEL_WORKER_PORT', 50053),
    tlsEnabled: getEnvBoolean('SATELLITE_TLS_ENABLED', true),
    caCertPath: process.env.SATELLITE_CA_CERT_PATH,
    serverCertPath: process.env.SATELLITE_SERVER_CERT_PATH,
    serverKeyPath: process.env.SATELLITE_SERVER_KEY_PATH,
  },
  heartbeat: {
    intervalMs: getEnvNumber('SATELLITE_HEARTBEAT_INTERVAL_MS', 30000),
    timeoutMs: getEnvNumber('SATELLITE_HEARTBEAT_TIMEOUT_MS', 90000),
    maxMissed: getEnvNumber('SATELLITE_HEARTBEAT_MAX_MISSED', 3),
  },
  tasks: {
    defaultTimeoutMs: getEnvNumber('SATELLITE_TASK_DEFAULT_TIMEOUT_MS', 60000),
    maxRetries: getEnvNumber('SATELLITE_TASK_MAX_RETRIES', 3),
    dispatchIntervalMs: getEnvNumber('SATELLITE_TASK_DISPATCH_INTERVAL_MS', 1000),
  },
});

export const validateSatelliteConfig = (config: SatelliteConfig): string[] => {
  const errors: string[] = [];

  if (config.enabled) {
    if (config.grpc.tlsEnabled) {
      if (!config.grpc.caCertPath) {
        errors.push('SATELLITE_CA_CERT_PATH is required when TLS is enabled');
      }
      if (!config.grpc.serverCertPath) {
        errors.push('SATELLITE_SERVER_CERT_PATH is required when TLS is enabled');
      }
      if (!config.grpc.serverKeyPath) {
        errors.push('SATELLITE_SERVER_KEY_PATH is required when TLS is enabled');
      }
    }

    if (config.grpc.port < 1 || config.grpc.port > 65535) {
      errors.push(`Invalid SATELLITE_GRPC_PORT: ${config.grpc.port}`);
    }
  }

  return errors;
};
