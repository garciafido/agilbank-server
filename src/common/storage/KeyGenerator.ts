import { KeyGenerationOptions } from './types';
import { randomUUID } from 'crypto';
import * as path from 'path';

export class KeyGenerator {
  generateKey(options: KeyGenerationOptions): string {
    const {
      tenant,
      entity,
      field,
      filename,
      date = new Date(),
      uuid = randomUUID()
    } = options;

    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');

    return path.join(
      tenant,
      `${entity}.${field}`,
      String(year),
      month,
      day,
      uuid,
      filename
    );
  }

  generateLegacyKey(entity: string, field: string, entityId: string, filename: string): string {
    return path.join(`${entity}.${field}`, entityId, filename);
  }

  isLegacyKey(key: string): boolean {
    const parts = key.split(path.sep);
    return parts.length === 3 && parts[0].includes('.');
  }

  parseLegacyKey(key: string): {
    entityField: string;
    entityId: string;
    filename: string;
  } | null {
    if (!this.isLegacyKey(key)) {
      return null;
    }

    const parts = key.split(path.sep);
    return {
      entityField: parts[0],
      entityId: parts[1],
      filename: parts[2]
    };
  }

  parseKey(key: string): {
    tenant?: string;
    entity?: string;
    field?: string;
    date?: Date;
    uuid?: string;
    filename?: string;
  } | null {
    const legacy = this.parseLegacyKey(key);
    if (legacy) {
      const [entity, field] = legacy.entityField.split('.');
      return {
        entity,
        field,
        uuid: legacy.entityId,
        filename: legacy.filename
      };
    }

    const parts = key.split(path.sep);
    if (parts.length !== 7) {
      return null;
    }

    const [tenant, entityField, year, month, day, uuid, filename] = parts;
    const [entity, field] = entityField.split('.');

    if (!entity || !field) {
      return null;
    }

    const date = new Date(
      parseInt(year),
      parseInt(month) - 1,
      parseInt(day)
    );

    return {
      tenant,
      entity,
      field,
      date,
      uuid,
      filename
    };
  }
}

export const keyGenerator = new KeyGenerator();
