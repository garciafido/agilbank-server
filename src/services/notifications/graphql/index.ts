/**
 * Notifications GraphQL Module
 *
 * Exports the notifications resolver and typeDefs for integration
 * with the main GraphQL server.
 */

import { readFileSync } from 'fs';
import { join } from 'path';

export { notificationsResolvers } from './notificationsResolver';

export const notificationsTypeDefs = readFileSync(
  join(__dirname, 'notifications.graphql'),
  'utf-8'
);
