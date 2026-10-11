/**
 * E-Signature Service
 *
 * Multi-provider e-signature service supporting DocuSign, PandaDoc, SignNow, and AgilSign.
 *
 * @module services/esignature
 */

// Types
export * from './types';

// Providers
export {
  // Types
  IESignatureProvider,
  ESignatureProviderFactory,
  ESignatureProviderRegistry,
  ESignatureError,
  ESignatureConfigurationError,
  ESignatureAuthenticationError,
  ESignatureRateLimitError,
  ESignatureDocumentNotFoundError,
  ESignatureInvalidOperationError,
  // Config
  resolveESignatureConfig,
  getConfiguredProviders,
  // Factory
  createESignatureProvider,
  clearProviderCache,
  clearAllProviderCache,
  registerProvider,
  getAvailableProviders,
  esignatureProviderRegistry,
  // Provider implementations
  DocuSignProvider,
  PandaDocProvider,
  SignNowProvider,
  AgilSignProvider,
} from './providers';

// Service
export {
  ESignatureService,
  createESignatureService,
} from './EsignatureService';

// Event Handler
export {
  ESignatureEventHandler,
  getESignatureEventHandler,
  EventCallback,
} from './EsignatureEventHandler';
