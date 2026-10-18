import type { GraphQLResolveInfo, GraphQLScalarType, GraphQLScalarTypeConfig } from 'graphql';
import type { MyApolloContext } from '../server';
export type Maybe<T> = T | null;
export type InputMaybe<T> = Maybe<T>;
export type Exact<T extends { [key: string]: unknown }> = { [K in keyof T]: T[K] };
export type MakeOptional<T, K extends keyof T> = Omit<T, K> & { [SubKey in K]?: Maybe<T[SubKey]> };
export type MakeMaybe<T, K extends keyof T> = Omit<T, K> & { [SubKey in K]: Maybe<T[SubKey]> };
export type MakeEmpty<T extends { [key: string]: unknown }, K extends keyof T> = { [_ in K]?: never };
export type Incremental<T> = T | { [P in keyof T]?: P extends ' $fragmentName' | '__typename' ? T[P] : never };
export type RequireFields<T, K extends keyof T> = Omit<T, K> & { [P in K]-?: NonNullable<T[P]> };
/** All built-in and custom scalars, mapped to their actual values */
export type Scalars = {
  ID: { input: string; output: string; }
  String: { input: string; output: string; }
  Boolean: { input: boolean; output: boolean; }
  Int: { input: number; output: number; }
  Float: { input: number; output: number; }
  Date: { input: Date; output: Date | string; }
  DateTime: { input: string; output: string; }
  Decimal: { input: number; output: number; }
  Json: { input: any; output: any; }
  Upload: { input: any; output: any; }
};

export type AbConceptCorrection = {
  __typename?: 'AbConceptCorrection';
  bankCode?: Maybe<Scalars['String']['output']>;
  bankText: Scalars['String']['output'];
  canonicalType: Scalars['String']['output'];
  createdAt_: Scalars['DateTime']['output'];
  createdBy_: User;
  displayId: Scalars['String']['output'];
  id: Scalars['String']['output'];
  lastUpdatedAt_?: Maybe<Scalars['DateTime']['output']>;
  lastUpdatedBy_?: Maybe<User>;
  operationCode?: Maybe<Scalars['String']['output']>;
  rate?: Maybe<Scalars['Decimal']['output']>;
  review: AbCorrectionReview;
  reviewedAt?: Maybe<Scalars['DateTime']['output']>;
  tenant_id_?: Maybe<Scalars['String']['output']>;
  version_: Scalars['String']['output'];
};

export type AbConceptCorrection_CreateInput = {
  bankCode?: InputMaybe<Scalars['String']['input']>;
  bankText: Scalars['String']['input'];
  canonicalType: Scalars['String']['input'];
  operationCode?: InputMaybe<Scalars['String']['input']>;
  rate?: InputMaybe<Scalars['Decimal']['input']>;
  review: AbCorrectionReview;
  reviewedAt?: InputMaybe<Scalars['DateTime']['input']>;
};

export type AbConceptCorrection_Filter = {
  AND?: InputMaybe<Array<AbConceptCorrection_Filter>>;
  NOT?: InputMaybe<Array<AbConceptCorrection_Filter>>;
  OR?: InputMaybe<Array<AbConceptCorrection_Filter>>;
  bankCode?: InputMaybe<FilterString>;
  bankText?: InputMaybe<FilterString>;
  canonicalType?: InputMaybe<FilterString>;
  createdAt_?: InputMaybe<FilterDateTime>;
  createdBy_?: InputMaybe<User_Filter>;
  displayId?: InputMaybe<FilterString>;
  id?: InputMaybe<FilterString>;
  lastUpdatedAt_?: InputMaybe<FilterDateTime>;
  lastUpdatedBy_?: InputMaybe<User_Filter>;
  operationCode?: InputMaybe<FilterString>;
  rate?: InputMaybe<FilterDecimal>;
  review?: InputMaybe<FilterString>;
  reviewedAt?: InputMaybe<FilterDateTime>;
  version_?: InputMaybe<FilterString>;
};

export type AbConceptCorrection_OrderBy = {
  bankCode?: InputMaybe<SortOrder>;
  bankText?: InputMaybe<SortOrder>;
  canonicalType?: InputMaybe<SortOrder>;
  createdAt_?: InputMaybe<SortOrder>;
  createdBy_?: InputMaybe<User_OrderBy>;
  id?: InputMaybe<SortOrder>;
  lastUpdatedAt_?: InputMaybe<SortOrder>;
  lastUpdatedBy_?: InputMaybe<User_OrderBy>;
  operationCode?: InputMaybe<SortOrder>;
  rate?: InputMaybe<SortOrder>;
  review?: InputMaybe<SortOrder>;
  reviewedAt?: InputMaybe<SortOrder>;
  version_?: InputMaybe<SortOrder>;
};

export type AbConceptCorrection_OrderByCursor = {
  id?: InputMaybe<SortOrder>;
};

export type AbConceptCorrection_UpdateInput = {
  bankCode?: InputMaybe<Scalars['String']['input']>;
  bankText?: InputMaybe<Scalars['String']['input']>;
  canonicalType?: InputMaybe<Scalars['String']['input']>;
  id: Scalars['String']['input'];
  operationCode?: InputMaybe<Scalars['String']['input']>;
  rate?: InputMaybe<Scalars['Decimal']['input']>;
  review?: InputMaybe<AbCorrectionReview>;
  reviewedAt?: InputMaybe<Scalars['DateTime']['input']>;
  version_: Scalars['String']['input'];
};

export const AbCorrectionReview = {
  Confirmed: 'confirmed',
  Pending: 'pending',
  Rejected: 'rejected'
} as const;

export type AbCorrectionReview = typeof AbCorrectionReview[keyof typeof AbCorrectionReview];
export type AbDecision = {
  __typename?: 'AbDecision';
  bankCode?: Maybe<Scalars['String']['output']>;
  canonicalType: Scalars['String']['output'];
  chosen: Scalars['Json']['output'];
  chosenKind: Scalars['String']['output'];
  chosenPair?: Maybe<Scalars['Json']['output']>;
  conceptKey: Scalars['String']['output'];
  createdAt_: Scalars['DateTime']['output'];
  createdBy_: User;
  decidedAt: Scalars['DateTime']['output'];
  decisionKey: Scalars['String']['output'];
  displayId: Scalars['String']['output'];
  id: Scalars['String']['output'];
  lastUpdatedAt_?: Maybe<Scalars['DateTime']['output']>;
  lastUpdatedBy_?: Maybe<User>;
  lineId: Scalars['String']['output'];
  proposalId: Scalars['String']['output'];
  proposedKind: Scalars['String']['output'];
  proposedPair?: Maybe<Scalars['Json']['output']>;
  reconciliationId: Scalars['String']['output'];
  result: Scalars['String']['output'];
  statementId: Scalars['String']['output'];
  version_: Scalars['String']['output'];
};

export type AbDecision_Filter = {
  AND?: InputMaybe<Array<AbDecision_Filter>>;
  NOT?: InputMaybe<Array<AbDecision_Filter>>;
  OR?: InputMaybe<Array<AbDecision_Filter>>;
  bankCode?: InputMaybe<FilterString>;
  canonicalType?: InputMaybe<FilterString>;
  chosen?: InputMaybe<FilterJson>;
  chosenKind?: InputMaybe<FilterString>;
  chosenPair?: InputMaybe<FilterJson>;
  conceptKey?: InputMaybe<FilterString>;
  createdAt_?: InputMaybe<FilterDateTime>;
  createdBy_?: InputMaybe<User_Filter>;
  decidedAt?: InputMaybe<FilterDateTime>;
  decisionKey?: InputMaybe<FilterString>;
  displayId?: InputMaybe<FilterString>;
  id?: InputMaybe<FilterString>;
  lastUpdatedAt_?: InputMaybe<FilterDateTime>;
  lastUpdatedBy_?: InputMaybe<User_Filter>;
  lineId?: InputMaybe<FilterString>;
  proposalId?: InputMaybe<FilterString>;
  proposedKind?: InputMaybe<FilterString>;
  proposedPair?: InputMaybe<FilterJson>;
  reconciliationId?: InputMaybe<FilterString>;
  result?: InputMaybe<FilterString>;
  statementId?: InputMaybe<FilterString>;
  version_?: InputMaybe<FilterString>;
};

export type AbDecision_OrderBy = {
  bankCode?: InputMaybe<SortOrder>;
  canonicalType?: InputMaybe<SortOrder>;
  chosen?: InputMaybe<SortOrder>;
  chosenKind?: InputMaybe<SortOrder>;
  chosenPair?: InputMaybe<SortOrder>;
  conceptKey?: InputMaybe<SortOrder>;
  createdAt_?: InputMaybe<SortOrder>;
  createdBy_?: InputMaybe<User_OrderBy>;
  decidedAt?: InputMaybe<SortOrder>;
  decisionKey?: InputMaybe<SortOrder>;
  id?: InputMaybe<SortOrder>;
  lastUpdatedAt_?: InputMaybe<SortOrder>;
  lastUpdatedBy_?: InputMaybe<User_OrderBy>;
  lineId?: InputMaybe<SortOrder>;
  proposalId?: InputMaybe<SortOrder>;
  proposedKind?: InputMaybe<SortOrder>;
  proposedPair?: InputMaybe<SortOrder>;
  reconciliationId?: InputMaybe<SortOrder>;
  result?: InputMaybe<SortOrder>;
  statementId?: InputMaybe<SortOrder>;
  version_?: InputMaybe<SortOrder>;
};

export type AbDecision_OrderByCursor = {
  id?: InputMaybe<SortOrder>;
};

export type AbPaymentBatch = {
  __typename?: 'AbPaymentBatch';
  contentHash: Scalars['String']['output'];
  createdAt_: Scalars['DateTime']['output'];
  createdBy_: User;
  displayId: Scalars['String']['output'];
  failedCount: Scalars['Int']['output'];
  id: Scalars['String']['output'];
  lastUpdatedAt_?: Maybe<Scalars['DateTime']['output']>;
  lastUpdatedBy_?: Maybe<User>;
  originalName: Scalars['String']['output'];
  transferCount: Scalars['Int']['output'];
  transfers: Scalars['Json']['output'];
  version_: Scalars['String']['output'];
};

export type AbPaymentBatch_Filter = {
  AND?: InputMaybe<Array<AbPaymentBatch_Filter>>;
  NOT?: InputMaybe<Array<AbPaymentBatch_Filter>>;
  OR?: InputMaybe<Array<AbPaymentBatch_Filter>>;
  contentHash?: InputMaybe<FilterString>;
  createdAt_?: InputMaybe<FilterDateTime>;
  createdBy_?: InputMaybe<User_Filter>;
  displayId?: InputMaybe<FilterString>;
  failedCount?: InputMaybe<FilterInt>;
  id?: InputMaybe<FilterString>;
  lastUpdatedAt_?: InputMaybe<FilterDateTime>;
  lastUpdatedBy_?: InputMaybe<User_Filter>;
  originalName?: InputMaybe<FilterString>;
  transferCount?: InputMaybe<FilterInt>;
  transfers?: InputMaybe<FilterJson>;
  version_?: InputMaybe<FilterString>;
};

export type AbPaymentBatch_OrderBy = {
  contentHash?: InputMaybe<SortOrder>;
  createdAt_?: InputMaybe<SortOrder>;
  createdBy_?: InputMaybe<User_OrderBy>;
  failedCount?: InputMaybe<SortOrder>;
  id?: InputMaybe<SortOrder>;
  lastUpdatedAt_?: InputMaybe<SortOrder>;
  lastUpdatedBy_?: InputMaybe<User_OrderBy>;
  originalName?: InputMaybe<SortOrder>;
  transferCount?: InputMaybe<SortOrder>;
  transfers?: InputMaybe<SortOrder>;
  version_?: InputMaybe<SortOrder>;
};

export type AbPaymentBatch_OrderByCursor = {
  id?: InputMaybe<SortOrder>;
};

export type AbReconciliation = {
  __typename?: 'AbReconciliation';
  bankCode?: Maybe<Scalars['String']['output']>;
  createdAt_: Scalars['DateTime']['output'];
  createdBy_: User;
  displayId: Scalars['String']['output'];
  id: Scalars['String']['output'];
  lastUpdatedAt_?: Maybe<Scalars['DateTime']['output']>;
  lastUpdatedBy_?: Maybe<User>;
  proposalCount: Scalars['Int']['output'];
  request: Scalars['Json']['output'];
  requestKey: Scalars['String']['output'];
  result: Scalars['Json']['output'];
  statementId: Scalars['String']['output'];
  version_: Scalars['String']['output'];
};

export type AbReconciliation_Filter = {
  AND?: InputMaybe<Array<AbReconciliation_Filter>>;
  NOT?: InputMaybe<Array<AbReconciliation_Filter>>;
  OR?: InputMaybe<Array<AbReconciliation_Filter>>;
  bankCode?: InputMaybe<FilterString>;
  createdAt_?: InputMaybe<FilterDateTime>;
  createdBy_?: InputMaybe<User_Filter>;
  displayId?: InputMaybe<FilterString>;
  id?: InputMaybe<FilterString>;
  lastUpdatedAt_?: InputMaybe<FilterDateTime>;
  lastUpdatedBy_?: InputMaybe<User_Filter>;
  proposalCount?: InputMaybe<FilterInt>;
  request?: InputMaybe<FilterJson>;
  requestKey?: InputMaybe<FilterString>;
  result?: InputMaybe<FilterJson>;
  statementId?: InputMaybe<FilterString>;
  version_?: InputMaybe<FilterString>;
};

export type AbReconciliation_OrderBy = {
  bankCode?: InputMaybe<SortOrder>;
  createdAt_?: InputMaybe<SortOrder>;
  createdBy_?: InputMaybe<User_OrderBy>;
  id?: InputMaybe<SortOrder>;
  lastUpdatedAt_?: InputMaybe<SortOrder>;
  lastUpdatedBy_?: InputMaybe<User_OrderBy>;
  proposalCount?: InputMaybe<SortOrder>;
  request?: InputMaybe<SortOrder>;
  requestKey?: InputMaybe<SortOrder>;
  result?: InputMaybe<SortOrder>;
  statementId?: InputMaybe<SortOrder>;
  version_?: InputMaybe<SortOrder>;
};

export type AbReconciliation_OrderByCursor = {
  id?: InputMaybe<SortOrder>;
};

export type AbStatement = {
  __typename?: 'AbStatement';
  bankCode?: Maybe<Scalars['String']['output']>;
  cbu?: Maybe<Scalars['String']['output']>;
  closingBalance?: Maybe<Scalars['Decimal']['output']>;
  contentHash?: Maybe<Scalars['String']['output']>;
  createdAt_: Scalars['DateTime']['output'];
  createdBy_: User;
  declaredAccount?: Maybe<Scalars['Json']['output']>;
  displayId: Scalars['String']['output'];
  error?: Maybe<Scalars['String']['output']>;
  file: Scalars['String']['output'];
  file_data: FileData;
  id: Scalars['String']['output'];
  lastUpdatedAt_?: Maybe<Scalars['DateTime']['output']>;
  lastUpdatedBy_?: Maybe<User>;
  lineCount?: Maybe<Scalars['Int']['output']>;
  openingBalance?: Maybe<Scalars['Decimal']['output']>;
  originalName: Scalars['String']['output'];
  periodFrom?: Maybe<Scalars['Date']['output']>;
  periodTo?: Maybe<Scalars['Date']['output']>;
  processedAt?: Maybe<Scalars['DateTime']['output']>;
  readStarts: Scalars['Int']['output'];
  reading?: Maybe<Scalars['Json']['output']>;
  status: AbStatementStatus;
  verdict?: Maybe<Scalars['String']['output']>;
  version_: Scalars['String']['output'];
};

export type AbStatementReadReturn = {
  __typename?: 'AbStatementReadReturn';
  result: Scalars['String']['output'];
  status: Scalars['String']['output'];
};

export const AbStatementStatus = {
  Failed: 'failed',
  Processing: 'processing',
  Queued: 'queued',
  Read: 'read'
} as const;

export type AbStatementStatus = typeof AbStatementStatus[keyof typeof AbStatementStatus];
export type AbStatement_Filter = {
  AND?: InputMaybe<Array<AbStatement_Filter>>;
  NOT?: InputMaybe<Array<AbStatement_Filter>>;
  OR?: InputMaybe<Array<AbStatement_Filter>>;
  bankCode?: InputMaybe<FilterString>;
  cbu?: InputMaybe<FilterString>;
  closingBalance?: InputMaybe<FilterDecimal>;
  contentHash?: InputMaybe<FilterString>;
  createdAt_?: InputMaybe<FilterDateTime>;
  createdBy_?: InputMaybe<User_Filter>;
  declaredAccount?: InputMaybe<FilterJson>;
  displayId?: InputMaybe<FilterString>;
  error?: InputMaybe<FilterString>;
  file?: InputMaybe<FilterString>;
  id?: InputMaybe<FilterString>;
  lastUpdatedAt_?: InputMaybe<FilterDateTime>;
  lastUpdatedBy_?: InputMaybe<User_Filter>;
  lineCount?: InputMaybe<FilterInt>;
  openingBalance?: InputMaybe<FilterDecimal>;
  originalName?: InputMaybe<FilterString>;
  periodFrom?: InputMaybe<FilterDate>;
  periodTo?: InputMaybe<FilterDate>;
  processedAt?: InputMaybe<FilterDateTime>;
  readStarts?: InputMaybe<FilterInt>;
  reading?: InputMaybe<FilterJson>;
  status?: InputMaybe<FilterString>;
  verdict?: InputMaybe<FilterString>;
  version_?: InputMaybe<FilterString>;
};

export type AbStatement_OrderBy = {
  bankCode?: InputMaybe<SortOrder>;
  cbu?: InputMaybe<SortOrder>;
  closingBalance?: InputMaybe<SortOrder>;
  contentHash?: InputMaybe<SortOrder>;
  createdAt_?: InputMaybe<SortOrder>;
  createdBy_?: InputMaybe<User_OrderBy>;
  declaredAccount?: InputMaybe<SortOrder>;
  error?: InputMaybe<SortOrder>;
  file?: InputMaybe<SortOrder>;
  id?: InputMaybe<SortOrder>;
  lastUpdatedAt_?: InputMaybe<SortOrder>;
  lastUpdatedBy_?: InputMaybe<User_OrderBy>;
  lineCount?: InputMaybe<SortOrder>;
  openingBalance?: InputMaybe<SortOrder>;
  originalName?: InputMaybe<SortOrder>;
  periodFrom?: InputMaybe<SortOrder>;
  periodTo?: InputMaybe<SortOrder>;
  processedAt?: InputMaybe<SortOrder>;
  readStarts?: InputMaybe<SortOrder>;
  reading?: InputMaybe<SortOrder>;
  status?: InputMaybe<SortOrder>;
  verdict?: InputMaybe<SortOrder>;
  version_?: InputMaybe<SortOrder>;
};

export type AbStatement_OrderByCursor = {
  id?: InputMaybe<SortOrder>;
};

export type AuthenticateResponse = {
  __typename?: 'AuthenticateResponse';
  accessExpiresIn: Scalars['Int']['output'];
  accessToken: Scalars['String']['output'];
  refreshExpiresIn: Scalars['Int']['output'];
  refreshToken: Scalars['String']['output'];
};

export type Company = {
  __typename?: 'Company';
  extra?: Maybe<Scalars['Json']['output']>;
  id: Scalars['String']['output'];
  logo?: Maybe<Scalars['String']['output']>;
  logo_data?: Maybe<FileData>;
  name: Scalars['String']['output'];
};

export type DeletionBlockerItem = {
  __typename?: 'DeletionBlockerItem';
  id: Scalars['ID']['output'];
  nameI18n?: Maybe<Scalars['Json']['output']>;
  nameText?: Maybe<Scalars['String']['output']>;
};

export type DeletionBlockerReason = {
  __typename?: 'DeletionBlockerReason';
  hiddenInTenant?: Maybe<Scalars['Int']['output']>;
  kind: Scalars['String']['output'];
  otherTenants?: Maybe<Scalars['Int']['output']>;
  relations: Array<Scalars['String']['output']>;
  rootEntity: Scalars['String']['output'];
  visible?: Maybe<DeletionBlockerVisible>;
};

export type DeletionBlockerVisible = {
  __typename?: 'DeletionBlockerVisible';
  count: Scalars['Int']['output'];
  items: Array<DeletionBlockerItem>;
};

export type DeletionBlockers = {
  __typename?: 'DeletionBlockers';
  blocked: Scalars['Boolean']['output'];
  entity: Scalars['String']['output'];
  id: Scalars['ID']['output'];
  reasons: Array<DeletionBlockerReason>;
};

export const EmailFrequency = {
  DailyDigest: 'daily_digest',
  Immediate: 'immediate',
  WeeklyDigest: 'weekly_digest'
} as const;

export type EmailFrequency = typeof EmailFrequency[keyof typeof EmailFrequency];
export type EmailVerification = {
  __typename?: 'EmailVerification';
  createdAt_: Scalars['DateTime']['output'];
  createdBy_: User;
  displayId: Scalars['String']['output'];
  email: Scalars['String']['output'];
  expiresAt: Scalars['DateTime']['output'];
  id: Scalars['String']['output'];
  lastSentAt?: Maybe<Scalars['DateTime']['output']>;
  lastUpdatedAt_?: Maybe<Scalars['DateTime']['output']>;
  lastUpdatedBy_?: Maybe<User>;
  requestedBy: User;
  sentAt?: Maybe<Scalars['DateTime']['output']>;
  sentCount: Scalars['Int']['output'];
  sourceEntity?: Maybe<Scalars['String']['output']>;
  sourceRecordId?: Maybe<Scalars['String']['output']>;
  status: EmailVerificationStatus;
  validationChanges?: Maybe<Scalars['Json']['output']>;
  validationSubmittedAt?: Maybe<Scalars['DateTime']['output']>;
  verifiedAt?: Maybe<Scalars['DateTime']['output']>;
  version_: Scalars['String']['output'];
};

export const EmailVerificationStatus = {
  Expired: 'expired',
  Pending: 'pending',
  Revoked: 'revoked',
  Verified: 'verified'
} as const;

export type EmailVerificationStatus = typeof EmailVerificationStatus[keyof typeof EmailVerificationStatus];
export type EmailVerification_CreateInput = {
  email: Scalars['String']['input'];
};

export type EmailVerification_Filter = {
  AND?: InputMaybe<Array<EmailVerification_Filter>>;
  NOT?: InputMaybe<Array<EmailVerification_Filter>>;
  OR?: InputMaybe<Array<EmailVerification_Filter>>;
  createdAt_?: InputMaybe<FilterDateTime>;
  createdBy_?: InputMaybe<User_Filter>;
  displayId?: InputMaybe<FilterString>;
  email?: InputMaybe<FilterString>;
  expiresAt?: InputMaybe<FilterDateTime>;
  id?: InputMaybe<FilterString>;
  lastSentAt?: InputMaybe<FilterDateTime>;
  lastUpdatedAt_?: InputMaybe<FilterDateTime>;
  lastUpdatedBy_?: InputMaybe<User_Filter>;
  requestedBy?: InputMaybe<User_Filter>;
  sentAt?: InputMaybe<FilterDateTime>;
  sentCount?: InputMaybe<FilterInt>;
  sourceEntity?: InputMaybe<FilterString>;
  sourceRecordId?: InputMaybe<FilterString>;
  status?: InputMaybe<FilterString>;
  validationChanges?: InputMaybe<FilterJson>;
  validationSubmittedAt?: InputMaybe<FilterDateTime>;
  verifiedAt?: InputMaybe<FilterDateTime>;
  version_?: InputMaybe<FilterString>;
};

export type EmailVerification_OrderBy = {
  createdAt_?: InputMaybe<SortOrder>;
  createdBy_?: InputMaybe<User_OrderBy>;
  email?: InputMaybe<SortOrder>;
  expiresAt?: InputMaybe<SortOrder>;
  id?: InputMaybe<SortOrder>;
  lastSentAt?: InputMaybe<SortOrder>;
  lastUpdatedAt_?: InputMaybe<SortOrder>;
  lastUpdatedBy_?: InputMaybe<User_OrderBy>;
  requestedBy?: InputMaybe<User_OrderBy>;
  sentAt?: InputMaybe<SortOrder>;
  sentCount?: InputMaybe<SortOrder>;
  sourceEntity?: InputMaybe<SortOrder>;
  sourceRecordId?: InputMaybe<SortOrder>;
  status?: InputMaybe<SortOrder>;
  validationChanges?: InputMaybe<SortOrder>;
  validationSubmittedAt?: InputMaybe<SortOrder>;
  verifiedAt?: InputMaybe<SortOrder>;
  version_?: InputMaybe<SortOrder>;
};

export type EmailVerification_OrderByCursor = {
  email?: InputMaybe<SortOrder>;
  id?: InputMaybe<SortOrder>;
};

export type EmailVerification_UpdateInput = {
  email?: InputMaybe<Scalars['String']['input']>;
  id: Scalars['String']['input'];
  version_: Scalars['String']['input'];
};

export type FileData = {
  __typename?: 'FileData';
  description?: Maybe<Scalars['String']['output']>;
  mimetype: Scalars['String']['output'];
  name: Scalars['String']['output'];
  size?: Maybe<Scalars['Int']['output']>;
  thumbnails?: Maybe<Array<Maybe<Thumbnail>>>;
  url: Scalars['String']['output'];
};

export type FileData_UpdateInput = {
  create?: InputMaybe<Array<UploadedFile>>;
  remove?: InputMaybe<Array<Scalars['String']['input']>>;
  update?: InputMaybe<Array<UploadedFile>>;
};

export type FilterBoolean = {
  equals?: InputMaybe<Scalars['Boolean']['input']>;
  isEmpty?: InputMaybe<Scalars['Boolean']['input']>;
  isNull?: InputMaybe<Scalars['Boolean']['input']>;
  not?: InputMaybe<Scalars['Boolean']['input']>;
};

export type FilterDate = {
  equals?: InputMaybe<Scalars['Date']['input']>;
  gt?: InputMaybe<Scalars['Date']['input']>;
  gte?: InputMaybe<Scalars['Date']['input']>;
  in?: InputMaybe<Array<Scalars['Date']['input']>>;
  isEmpty?: InputMaybe<Scalars['Boolean']['input']>;
  isNull?: InputMaybe<Scalars['Boolean']['input']>;
  lt?: InputMaybe<Scalars['Date']['input']>;
  lte?: InputMaybe<Scalars['Date']['input']>;
  not?: InputMaybe<Scalars['Date']['input']>;
};

export type FilterDateTime = {
  equals?: InputMaybe<Scalars['String']['input']>;
  gt?: InputMaybe<Scalars['String']['input']>;
  gte?: InputMaybe<Scalars['String']['input']>;
  in?: InputMaybe<Array<Scalars['String']['input']>>;
  isEmpty?: InputMaybe<Scalars['Boolean']['input']>;
  isNull?: InputMaybe<Scalars['Boolean']['input']>;
  lt?: InputMaybe<Scalars['String']['input']>;
  lte?: InputMaybe<Scalars['String']['input']>;
  not?: InputMaybe<Scalars['String']['input']>;
  notIn?: InputMaybe<Array<Scalars['String']['input']>>;
  range?: InputMaybe<Scalars['String']['input']>;
  regex?: InputMaybe<Scalars['String']['input']>;
};

export type FilterDecimal = {
  equals?: InputMaybe<Scalars['Decimal']['input']>;
  gt?: InputMaybe<Scalars['Decimal']['input']>;
  gte?: InputMaybe<Scalars['Decimal']['input']>;
  in?: InputMaybe<Array<Scalars['Decimal']['input']>>;
  isEmpty?: InputMaybe<Scalars['Boolean']['input']>;
  isNull?: InputMaybe<Scalars['Boolean']['input']>;
  lt?: InputMaybe<Scalars['Decimal']['input']>;
  lte?: InputMaybe<Scalars['Decimal']['input']>;
  not?: InputMaybe<Scalars['Decimal']['input']>;
  notIn?: InputMaybe<Array<Scalars['Decimal']['input']>>;
};

export type FilterFloat = {
  equals?: InputMaybe<Scalars['Float']['input']>;
  gt?: InputMaybe<Scalars['Float']['input']>;
  gte?: InputMaybe<Scalars['Float']['input']>;
  in?: InputMaybe<Array<Scalars['Float']['input']>>;
  isEmpty?: InputMaybe<Scalars['Boolean']['input']>;
  isNull?: InputMaybe<Scalars['Boolean']['input']>;
  lt?: InputMaybe<Scalars['Float']['input']>;
  lte?: InputMaybe<Scalars['Float']['input']>;
  not?: InputMaybe<Scalars['Float']['input']>;
  notIn?: InputMaybe<Array<Scalars['Float']['input']>>;
};

export type FilterInt = {
  equals?: InputMaybe<Scalars['Int']['input']>;
  gt?: InputMaybe<Scalars['Int']['input']>;
  gte?: InputMaybe<Scalars['Int']['input']>;
  in?: InputMaybe<Array<Scalars['Int']['input']>>;
  isEmpty?: InputMaybe<Scalars['Boolean']['input']>;
  isNull?: InputMaybe<Scalars['Boolean']['input']>;
  lt?: InputMaybe<Scalars['Int']['input']>;
  lte?: InputMaybe<Scalars['Int']['input']>;
  not?: InputMaybe<Scalars['Int']['input']>;
  notIn?: InputMaybe<Array<Scalars['Int']['input']>>;
};

export type FilterJson = {
  byPath?: InputMaybe<Scalars['Json']['input']>;
  equals?: InputMaybe<Scalars['Json']['input']>;
  not?: InputMaybe<Scalars['Json']['input']>;
};

export const FilterMode = {
  Insensitive: 'insensitive'
} as const;

export type FilterMode = typeof FilterMode[keyof typeof FilterMode];
export type FilterString = {
  contains?: InputMaybe<Scalars['String']['input']>;
  endsWith?: InputMaybe<Scalars['String']['input']>;
  equals?: InputMaybe<Scalars['String']['input']>;
  gt?: InputMaybe<Scalars['String']['input']>;
  gte?: InputMaybe<Scalars['String']['input']>;
  in?: InputMaybe<Array<Scalars['String']['input']>>;
  isEmpty?: InputMaybe<Scalars['Boolean']['input']>;
  isNull?: InputMaybe<Scalars['Boolean']['input']>;
  lt?: InputMaybe<Scalars['String']['input']>;
  lte?: InputMaybe<Scalars['String']['input']>;
  mode?: InputMaybe<FilterMode>;
  not?: InputMaybe<Scalars['String']['input']>;
  notIn?: InputMaybe<Array<Scalars['String']['input']>>;
  range?: InputMaybe<Scalars['String']['input']>;
  regex?: InputMaybe<Scalars['String']['input']>;
  search?: InputMaybe<Scalars['String']['input']>;
  startsWith?: InputMaybe<Scalars['String']['input']>;
};

export type FilterStringList = {
  equals?: InputMaybe<Scalars['String']['input']>;
  has?: InputMaybe<Scalars['String']['input']>;
  hasEvery?: InputMaybe<Array<Scalars['String']['input']>>;
  hasNone?: InputMaybe<Array<Scalars['String']['input']>>;
  hasSome?: InputMaybe<Array<Scalars['String']['input']>>;
  isEmpty?: InputMaybe<Scalars['Boolean']['input']>;
  search?: InputMaybe<Scalars['String']['input']>;
};

export type IdempotencyRecord = {
  __typename?: 'IdempotencyRecord';
  bodyHash: Scalars['String']['output'];
  client: Scalars['String']['output'];
  completedAt?: Maybe<Scalars['DateTime']['output']>;
  createdAt_: Scalars['DateTime']['output'];
  createdBy_: User;
  displayId: Scalars['String']['output'];
  failureReason?: Maybe<Scalars['String']['output']>;
  id: Scalars['String']['output'];
  key: Scalars['String']['output'];
  lastUpdatedAt_?: Maybe<Scalars['DateTime']['output']>;
  lastUpdatedBy_?: Maybe<User>;
  result?: Maybe<Scalars['Json']['output']>;
  status: IdempotencyStatus;
  version_: Scalars['String']['output'];
};

export type IdempotencyRecord_Filter = {
  AND?: InputMaybe<Array<IdempotencyRecord_Filter>>;
  NOT?: InputMaybe<Array<IdempotencyRecord_Filter>>;
  OR?: InputMaybe<Array<IdempotencyRecord_Filter>>;
  bodyHash?: InputMaybe<FilterString>;
  client?: InputMaybe<FilterString>;
  completedAt?: InputMaybe<FilterDateTime>;
  createdAt_?: InputMaybe<FilterDateTime>;
  createdBy_?: InputMaybe<User_Filter>;
  displayId?: InputMaybe<FilterString>;
  failureReason?: InputMaybe<FilterString>;
  id?: InputMaybe<FilterString>;
  key?: InputMaybe<FilterString>;
  lastUpdatedAt_?: InputMaybe<FilterDateTime>;
  lastUpdatedBy_?: InputMaybe<User_Filter>;
  result?: InputMaybe<FilterJson>;
  status?: InputMaybe<FilterString>;
  version_?: InputMaybe<FilterString>;
};

export type IdempotencyRecord_OrderBy = {
  bodyHash?: InputMaybe<SortOrder>;
  client?: InputMaybe<SortOrder>;
  completedAt?: InputMaybe<SortOrder>;
  createdAt_?: InputMaybe<SortOrder>;
  createdBy_?: InputMaybe<User_OrderBy>;
  failureReason?: InputMaybe<SortOrder>;
  id?: InputMaybe<SortOrder>;
  key?: InputMaybe<SortOrder>;
  lastUpdatedAt_?: InputMaybe<SortOrder>;
  lastUpdatedBy_?: InputMaybe<User_OrderBy>;
  result?: InputMaybe<SortOrder>;
  status?: InputMaybe<SortOrder>;
  version_?: InputMaybe<SortOrder>;
};

export type IdempotencyRecord_OrderByCursor = {
  id?: InputMaybe<SortOrder>;
};

export const IdempotencyStatus = {
  Done: 'done',
  Failed: 'failed',
  InProgress: 'in_progress'
} as const;

export type IdempotencyStatus = typeof IdempotencyStatus[keyof typeof IdempotencyStatus];
export type InputMultipleRef = {
  add?: InputMaybe<Array<Scalars['String']['input']>>;
  remove?: InputMaybe<Array<Scalars['String']['input']>>;
  set?: InputMaybe<Array<Scalars['String']['input']>>;
};

export type IntegrationClient = {
  __typename?: 'IntegrationClient';
  createdAt_: Scalars['DateTime']['output'];
  createdBy_: User;
  displayId: Scalars['String']['output'];
  expiresAt?: Maybe<Scalars['DateTime']['output']>;
  id: Scalars['String']['output'];
  lastUpdatedAt_?: Maybe<Scalars['DateTime']['output']>;
  lastUpdatedBy_?: Maybe<User>;
  name: Scalars['String']['output'];
  scopes: Scalars['String']['output'];
  serviceUser: User;
  status: IntegrationClientStatus;
  tokenHash: Scalars['String']['output'];
  version_: Scalars['String']['output'];
};

export const IntegrationClientStatus = {
  Active: 'active',
  Revoked: 'revoked'
} as const;

export type IntegrationClientStatus = typeof IntegrationClientStatus[keyof typeof IntegrationClientStatus];
export type IntegrationClient_CreateInput = {
  expiresAt?: InputMaybe<Scalars['DateTime']['input']>;
  name: Scalars['String']['input'];
  scopes: Scalars['String']['input'];
  serviceUserId: Scalars['String']['input'];
  status: IntegrationClientStatus;
  tokenHash: Scalars['String']['input'];
};

export type IntegrationClient_Filter = {
  AND?: InputMaybe<Array<IntegrationClient_Filter>>;
  NOT?: InputMaybe<Array<IntegrationClient_Filter>>;
  OR?: InputMaybe<Array<IntegrationClient_Filter>>;
  createdAt_?: InputMaybe<FilterDateTime>;
  createdBy_?: InputMaybe<User_Filter>;
  displayId?: InputMaybe<FilterString>;
  expiresAt?: InputMaybe<FilterDateTime>;
  id?: InputMaybe<FilterString>;
  lastUpdatedAt_?: InputMaybe<FilterDateTime>;
  lastUpdatedBy_?: InputMaybe<User_Filter>;
  name?: InputMaybe<FilterString>;
  scopes?: InputMaybe<FilterString>;
  serviceUser?: InputMaybe<User_Filter>;
  status?: InputMaybe<FilterString>;
  tokenHash?: InputMaybe<FilterString>;
  version_?: InputMaybe<FilterString>;
};

export type IntegrationClient_OrderBy = {
  createdAt_?: InputMaybe<SortOrder>;
  createdBy_?: InputMaybe<User_OrderBy>;
  expiresAt?: InputMaybe<SortOrder>;
  id?: InputMaybe<SortOrder>;
  lastUpdatedAt_?: InputMaybe<SortOrder>;
  lastUpdatedBy_?: InputMaybe<User_OrderBy>;
  name?: InputMaybe<SortOrder>;
  scopes?: InputMaybe<SortOrder>;
  serviceUser?: InputMaybe<User_OrderBy>;
  status?: InputMaybe<SortOrder>;
  tokenHash?: InputMaybe<SortOrder>;
  version_?: InputMaybe<SortOrder>;
};

export type IntegrationClient_OrderByCursor = {
  id?: InputMaybe<SortOrder>;
};

export type IntegrationClient_UpdateInput = {
  expiresAt?: InputMaybe<Scalars['DateTime']['input']>;
  id: Scalars['String']['input'];
  name?: InputMaybe<Scalars['String']['input']>;
  scopes?: InputMaybe<Scalars['String']['input']>;
  serviceUserId?: InputMaybe<Scalars['String']['input']>;
  status?: InputMaybe<IntegrationClientStatus>;
  tokenHash?: InputMaybe<Scalars['String']['input']>;
  version_: Scalars['String']['input'];
};

export const Language = {
  En: 'en',
  Es: 'es',
  Pt: 'pt'
} as const;

export type Language = typeof Language[keyof typeof Language];
export type LoginResponse = {
  __typename?: 'LoginResponse';
  accessExpiresIn?: Maybe<Scalars['Int']['output']>;
  accessToken?: Maybe<Scalars['String']['output']>;
  refreshExpiresIn?: Maybe<Scalars['Int']['output']>;
  refreshToken?: Maybe<Scalars['String']['output']>;
  tempToken?: Maybe<Scalars['String']['output']>;
  twoFaAction?: Maybe<Scalars['String']['output']>;
  twoFaRequired: Scalars['Boolean']['output'];
};

export type Mutation = {
  __typename?: 'Mutation';
  _empty?: Maybe<Scalars['String']['output']>;
  abConceptCorrectionCreate: AbConceptCorrection;
  abConceptCorrectionDelete: AbConceptCorrection;
  abConceptCorrectionUpdate: AbConceptCorrection;
  abDecisionDelete: AbDecision;
  abPaymentBatchDelete: AbPaymentBatch;
  abReconciliationDelete: AbReconciliation;
  abStatementDelete: AbStatement;
  abStatementRead: AbStatementReadReturn;
  /** Archive a notification (soft delete) */
  archiveNotification: UserNotificationResult;
  botRunCancel: Scalars['String']['output'];
  broadcastMaintenance: Scalars['Int']['output'];
  confirmTwoFaSetup: AuthenticateResponse;
  deleteUploadedFile: Scalars['String']['output'];
  emailVerificationCreate: EmailVerification;
  emailVerificationDelete: EmailVerification;
  emailVerificationUpdate: EmailVerification;
  idempotencyRecordDelete: IdempotencyRecord;
  integrationClientCreate: IntegrationClient;
  integrationClientDelete: IntegrationClient;
  integrationClientUpdate: IntegrationClient;
  login: LoginResponse;
  logout: Scalars['Boolean']['output'];
  /**
   * Mark all notifications as read
   * Returns the number of notifications marked as read
   */
  markAllNotificationsRead: Scalars['Int']['output'];
  /** Mark a single notification as read */
  markNotificationRead: UserNotificationResult;
  permissionCreate: Permission;
  permissionDelete: Permission;
  permissionUpdate: Permission;
  refreshToken: AuthenticateResponse;
  revokeAllTokens: Scalars['Boolean']['output'];
  revokeAllTrustedDevices: Scalars['Boolean']['output'];
  revokeTrustedDevice: Scalars['Boolean']['output'];
  roleCreate: Role;
  roleDelete: Role;
  roleUpdate: Role;
  saveProfile: Scalars['Boolean']['output'];
  setMyLanguage: User;
  setupTwoFa: TwoFaSetupResponse;
  singleUpload: UploadedFileData;
  tenantCreate: Tenant;
  tenantDelete: Tenant;
  tenantUpdate: Tenant;
  updateMyAvatar: User;
  userChangePassword: User;
  userCreate: User;
  userDelete: User;
  userNotificationDelete: UserNotification;
  userNotificationPreferenceCreate: UserNotificationPreference;
  userNotificationPreferenceDelete: UserNotificationPreference;
  userNotificationPreferenceUpdate: UserNotificationPreference;
  userResetPassword: User;
  userUpdate: User;
  verifyTwoFa: AuthenticateResponse;
  verifyTwoFaBackupCode: AuthenticateResponse;
  workerEventDelete: WorkerEvent;
  workerEventRetry: WorkerEventRetryResult;
};


export type MutationAbConceptCorrectionCreateArgs = {
  bankCode?: InputMaybe<Scalars['String']['input']>;
  bankText: Scalars['String']['input'];
  canonicalType: Scalars['String']['input'];
  idempotencyKey_?: InputMaybe<Scalars['String']['input']>;
  operationCode?: InputMaybe<Scalars['String']['input']>;
  rate?: InputMaybe<Scalars['Decimal']['input']>;
  review: AbCorrectionReview;
  reviewedAt?: InputMaybe<Scalars['DateTime']['input']>;
};


export type MutationAbConceptCorrectionDeleteArgs = {
  id: Scalars['String']['input'];
};


export type MutationAbConceptCorrectionUpdateArgs = {
  bankCode?: InputMaybe<Scalars['String']['input']>;
  bankText?: InputMaybe<Scalars['String']['input']>;
  canonicalType?: InputMaybe<Scalars['String']['input']>;
  id: Scalars['String']['input'];
  idempotencyKey_?: InputMaybe<Scalars['String']['input']>;
  operationCode?: InputMaybe<Scalars['String']['input']>;
  rate?: InputMaybe<Scalars['Decimal']['input']>;
  review?: InputMaybe<AbCorrectionReview>;
  reviewedAt?: InputMaybe<Scalars['DateTime']['input']>;
  version_: Scalars['String']['input'];
};


export type MutationAbDecisionDeleteArgs = {
  id: Scalars['String']['input'];
};


export type MutationAbPaymentBatchDeleteArgs = {
  id: Scalars['String']['input'];
};


export type MutationAbReconciliationDeleteArgs = {
  id: Scalars['String']['input'];
};


export type MutationAbStatementDeleteArgs = {
  id: Scalars['String']['input'];
};


export type MutationAbStatementReadArgs = {
  statementId: Scalars['String']['input'];
};


export type MutationArchiveNotificationArgs = {
  id: Scalars['ID']['input'];
};


export type MutationBotRunCancelArgs = {
  botRunId: Scalars['String']['input'];
  force?: InputMaybe<Scalars['Boolean']['input']>;
};


export type MutationBroadcastMaintenanceArgs = {
  active: Scalars['Boolean']['input'];
  message?: InputMaybe<Scalars['String']['input']>;
  until?: InputMaybe<Scalars['String']['input']>;
};


export type MutationConfirmTwoFaSetupArgs = {
  code: Scalars['String']['input'];
  rememberDevice?: InputMaybe<Scalars['Boolean']['input']>;
  tempToken: Scalars['String']['input'];
};


export type MutationDeleteUploadedFileArgs = {
  ticket: Scalars['String']['input'];
};


export type MutationEmailVerificationCreateArgs = {
  email: Scalars['String']['input'];
  idempotencyKey_?: InputMaybe<Scalars['String']['input']>;
};


export type MutationEmailVerificationDeleteArgs = {
  id: Scalars['String']['input'];
};


export type MutationEmailVerificationUpdateArgs = {
  email?: InputMaybe<Scalars['String']['input']>;
  id: Scalars['String']['input'];
  idempotencyKey_?: InputMaybe<Scalars['String']['input']>;
  version_: Scalars['String']['input'];
};


export type MutationIdempotencyRecordDeleteArgs = {
  id: Scalars['String']['input'];
};


export type MutationIntegrationClientCreateArgs = {
  expiresAt?: InputMaybe<Scalars['DateTime']['input']>;
  idempotencyKey_?: InputMaybe<Scalars['String']['input']>;
  name: Scalars['String']['input'];
  scopes: Scalars['String']['input'];
  serviceUserId: Scalars['String']['input'];
  status: IntegrationClientStatus;
  tokenHash: Scalars['String']['input'];
};


export type MutationIntegrationClientDeleteArgs = {
  id: Scalars['String']['input'];
};


export type MutationIntegrationClientUpdateArgs = {
  expiresAt?: InputMaybe<Scalars['DateTime']['input']>;
  id: Scalars['String']['input'];
  idempotencyKey_?: InputMaybe<Scalars['String']['input']>;
  name?: InputMaybe<Scalars['String']['input']>;
  scopes?: InputMaybe<Scalars['String']['input']>;
  serviceUserId?: InputMaybe<Scalars['String']['input']>;
  status?: InputMaybe<IntegrationClientStatus>;
  tokenHash?: InputMaybe<Scalars['String']['input']>;
  version_: Scalars['String']['input'];
};


export type MutationLoginArgs = {
  email: Scalars['String']['input'];
  password: Scalars['String']['input'];
};


export type MutationMarkNotificationReadArgs = {
  id: Scalars['ID']['input'];
};


export type MutationPermissionCreateArgs = {
  idempotencyKey_?: InputMaybe<Scalars['String']['input']>;
  name: Scalars['String']['input'];
};


export type MutationPermissionDeleteArgs = {
  id: Scalars['String']['input'];
};


export type MutationPermissionUpdateArgs = {
  id: Scalars['String']['input'];
  idempotencyKey_?: InputMaybe<Scalars['String']['input']>;
  name?: InputMaybe<Scalars['String']['input']>;
  version_: Scalars['String']['input'];
};


export type MutationRefreshTokenArgs = {
  refreshToken: Scalars['String']['input'];
};


export type MutationRevokeTrustedDeviceArgs = {
  id: Scalars['String']['input'];
};


export type MutationRoleCreateArgs = {
  idempotencyKey_?: InputMaybe<Scalars['String']['input']>;
  isForAllTenants: Scalars['Boolean']['input'];
  name: Scalars['String']['input'];
  permissionsIds?: InputMaybe<Array<Scalars['String']['input']>>;
};


export type MutationRoleDeleteArgs = {
  id: Scalars['String']['input'];
};


export type MutationRoleUpdateArgs = {
  id: Scalars['String']['input'];
  idempotencyKey_?: InputMaybe<Scalars['String']['input']>;
  isForAllTenants?: InputMaybe<Scalars['Boolean']['input']>;
  name?: InputMaybe<Scalars['String']['input']>;
  permissionsIds?: InputMaybe<InputMultipleRef>;
  version_: Scalars['String']['input'];
};


export type MutationSaveProfileArgs = {
  key: Array<Scalars['String']['input']>;
  value: Scalars['Json']['input'];
};


export type MutationSetMyLanguageArgs = {
  language: Language;
};


export type MutationSetupTwoFaArgs = {
  tempToken: Scalars['String']['input'];
};


export type MutationSingleUploadArgs = {
  file: Scalars['Upload']['input'];
};


export type MutationTenantCreateArgs = {
  grossReceiptsJurisdiction?: InputMaybe<Scalars['String']['input']>;
  idempotencyKey_?: InputMaybe<Scalars['String']['input']>;
  imputationMinConfidence?: InputMaybe<Scalars['Int']['input']>;
  ivaCondition: TenantIvaCondition;
  logo?: InputMaybe<UploadedFile>;
  name: Scalars['String']['input'];
  status: TenantStatus;
  taxId?: InputMaybe<Scalars['String']['input']>;
  withholdingAgent: Scalars['Boolean']['input'];
};


export type MutationTenantDeleteArgs = {
  id: Scalars['String']['input'];
};


export type MutationTenantUpdateArgs = {
  grossReceiptsJurisdiction?: InputMaybe<Scalars['String']['input']>;
  id: Scalars['String']['input'];
  idempotencyKey_?: InputMaybe<Scalars['String']['input']>;
  imputationMinConfidence?: InputMaybe<Scalars['Int']['input']>;
  ivaCondition?: InputMaybe<TenantIvaCondition>;
  logo?: InputMaybe<UploadedFile>;
  name?: InputMaybe<Scalars['String']['input']>;
  status?: InputMaybe<TenantStatus>;
  taxId?: InputMaybe<Scalars['String']['input']>;
  version_: Scalars['String']['input'];
  withholdingAgent?: InputMaybe<Scalars['Boolean']['input']>;
};


export type MutationUpdateMyAvatarArgs = {
  avatar?: InputMaybe<UploadedFile>;
};


export type MutationUserChangePasswordArgs = {
  newPassword: Scalars['String']['input'];
  oldPassword: Scalars['String']['input'];
};


export type MutationUserCreateArgs = {
  active: Scalars['Boolean']['input'];
  avatar?: InputMaybe<UploadedFile>;
  cellphone?: InputMaybe<Scalars['String']['input']>;
  email: Scalars['String']['input'];
  idempotencyKey_?: InputMaybe<Scalars['String']['input']>;
  language: Language;
  name: Scalars['String']['input'];
  roleId?: InputMaybe<Scalars['String']['input']>;
  targetTenantId?: InputMaybe<Scalars['String']['input']>;
  twoFaseAuth?: InputMaybe<Scalars['Boolean']['input']>;
};


export type MutationUserDeleteArgs = {
  id: Scalars['String']['input'];
};


export type MutationUserNotificationDeleteArgs = {
  id: Scalars['String']['input'];
};


export type MutationUserNotificationPreferenceCreateArgs = {
  emailEnabled: Scalars['Boolean']['input'];
  emailFrequency: EmailFrequency;
  idempotencyKey_?: InputMaybe<Scalars['String']['input']>;
  inAppEnabled: Scalars['Boolean']['input'];
  notificationType: NotificationType;
};


export type MutationUserNotificationPreferenceDeleteArgs = {
  id: Scalars['String']['input'];
};


export type MutationUserNotificationPreferenceUpdateArgs = {
  emailEnabled?: InputMaybe<Scalars['Boolean']['input']>;
  emailFrequency?: InputMaybe<EmailFrequency>;
  id: Scalars['String']['input'];
  idempotencyKey_?: InputMaybe<Scalars['String']['input']>;
  inAppEnabled?: InputMaybe<Scalars['Boolean']['input']>;
  notificationType?: InputMaybe<NotificationType>;
  version_: Scalars['String']['input'];
};


export type MutationUserResetPasswordArgs = {
  email: Scalars['String']['input'];
};


export type MutationUserUpdateArgs = {
  active?: InputMaybe<Scalars['Boolean']['input']>;
  avatar?: InputMaybe<UploadedFile>;
  cellphone?: InputMaybe<Scalars['String']['input']>;
  email?: InputMaybe<Scalars['String']['input']>;
  id: Scalars['String']['input'];
  idempotencyKey_?: InputMaybe<Scalars['String']['input']>;
  language?: InputMaybe<Language>;
  name?: InputMaybe<Scalars['String']['input']>;
  profile?: InputMaybe<Scalars['Json']['input']>;
  roleId?: InputMaybe<Scalars['String']['input']>;
  twoFaseAuth?: InputMaybe<Scalars['Boolean']['input']>;
  version_: Scalars['String']['input'];
};


export type MutationVerifyTwoFaArgs = {
  code: Scalars['String']['input'];
  rememberDevice?: InputMaybe<Scalars['Boolean']['input']>;
  tempToken: Scalars['String']['input'];
};


export type MutationVerifyTwoFaBackupCodeArgs = {
  code: Scalars['String']['input'];
  rememberDevice?: InputMaybe<Scalars['Boolean']['input']>;
  tempToken: Scalars['String']['input'];
};


export type MutationWorkerEventDeleteArgs = {
  id: Scalars['String']['input'];
};


export type MutationWorkerEventRetryArgs = {
  id: Scalars['ID']['input'];
  mode?: InputMaybe<Scalars['String']['input']>;
  overrides?: InputMaybe<Scalars['Json']['input']>;
};

export type NotificationActorUser = {
  __typename?: 'NotificationActorUser';
  email?: Maybe<Scalars['String']['output']>;
  id: Scalars['ID']['output'];
  name?: Maybe<Scalars['String']['output']>;
};

export type NotificationConnection = {
  __typename?: 'NotificationConnection';
  /** Whether there are more notifications available */
  hasMore: Scalars['Boolean']['output'];
  /** List of notifications */
  notifications: Array<UserNotificationItem>;
  /** Total count of notifications matching the filter */
  totalCount: Scalars['Int']['output'];
};

export const NotificationPriority = {
  High: 'high',
  Low: 'low',
  Medium: 'medium'
} as const;

export type NotificationPriority = typeof NotificationPriority[keyof typeof NotificationPriority];
export const NotificationType = {
  Alert: 'alert',
  Assignment: 'assignment',
  Comment: 'comment',
  Mention: 'mention',
  System: 'system'
} as const;

export type NotificationType = typeof NotificationType[keyof typeof NotificationType];
export const NotificationTypeFilter = {
  Alert: 'alert',
  Assignment: 'assignment',
  Comment: 'comment',
  Mention: 'mention',
  System: 'system',
  TokenLimitReached: 'token_limit_reached'
} as const;

export type NotificationTypeFilter = typeof NotificationTypeFilter[keyof typeof NotificationTypeFilter];
export type OrderByMultiple = {
  _count?: InputMaybe<SortOrder>;
};

export type Permission = {
  __typename?: 'Permission';
  createdAt_: Scalars['DateTime']['output'];
  createdBy_: User;
  displayId: Scalars['String']['output'];
  id: Scalars['String']['output'];
  lastUpdatedAt_?: Maybe<Scalars['DateTime']['output']>;
  lastUpdatedBy_?: Maybe<User>;
  name: Scalars['String']['output'];
  version_: Scalars['String']['output'];
};

export type Permission_CreateInput = {
  name: Scalars['String']['input'];
};

export type Permission_Filter = {
  AND?: InputMaybe<Array<Permission_Filter>>;
  NOT?: InputMaybe<Array<Permission_Filter>>;
  OR?: InputMaybe<Array<Permission_Filter>>;
  createdAt_?: InputMaybe<FilterDateTime>;
  createdBy_?: InputMaybe<User_Filter>;
  displayId?: InputMaybe<FilterString>;
  id?: InputMaybe<FilterString>;
  lastUpdatedAt_?: InputMaybe<FilterDateTime>;
  lastUpdatedBy_?: InputMaybe<User_Filter>;
  name?: InputMaybe<FilterString>;
  version_?: InputMaybe<FilterString>;
};

export type Permission_OrderBy = {
  createdAt_?: InputMaybe<SortOrder>;
  createdBy_?: InputMaybe<User_OrderBy>;
  id?: InputMaybe<SortOrder>;
  lastUpdatedAt_?: InputMaybe<SortOrder>;
  lastUpdatedBy_?: InputMaybe<User_OrderBy>;
  name?: InputMaybe<SortOrder>;
  version_?: InputMaybe<SortOrder>;
};

export type Permission_OrderByCursor = {
  id?: InputMaybe<SortOrder>;
  name?: InputMaybe<SortOrder>;
};

export type Permission_UpdateInput = {
  id: Scalars['String']['input'];
  name?: InputMaybe<Scalars['String']['input']>;
  version_: Scalars['String']['input'];
};

export type Query = {
  __typename?: 'Query';
  _empty?: Maybe<Scalars['String']['output']>;
  abConceptCorrectionListWithCursor: Array<Maybe<AbConceptCorrection>>;
  abConceptCorrectionListWithOffset: Array<Maybe<AbConceptCorrection>>;
  abConceptCorrectionOne: AbConceptCorrection;
  abDecisionListWithCursor: Array<Maybe<AbDecision>>;
  abDecisionListWithOffset: Array<Maybe<AbDecision>>;
  abDecisionOne: AbDecision;
  abPaymentBatchListWithCursor: Array<Maybe<AbPaymentBatch>>;
  abPaymentBatchListWithOffset: Array<Maybe<AbPaymentBatch>>;
  abPaymentBatchOne: AbPaymentBatch;
  abReconciliationListWithCursor: Array<Maybe<AbReconciliation>>;
  abReconciliationListWithOffset: Array<Maybe<AbReconciliation>>;
  abReconciliationOne: AbReconciliation;
  abStatementListWithCursor: Array<Maybe<AbStatement>>;
  abStatementListWithOffset: Array<Maybe<AbStatement>>;
  abStatementOne: AbStatement;
  deletionBlockers: DeletionBlockers;
  emailVerificationListWithCursor: Array<Maybe<EmailVerification>>;
  emailVerificationListWithOffset: Array<Maybe<EmailVerification>>;
  emailVerificationOne: EmailVerification;
  idempotencyRecordListWithCursor: Array<Maybe<IdempotencyRecord>>;
  idempotencyRecordListWithOffset: Array<Maybe<IdempotencyRecord>>;
  idempotencyRecordOne: IdempotencyRecord;
  integrationClientListWithCursor: Array<Maybe<IntegrationClient>>;
  integrationClientListWithOffset: Array<Maybe<IntegrationClient>>;
  integrationClientOne: IntegrationClient;
  me: User;
  /** Get current user's notifications with optional filters */
  myNotifications: NotificationConnection;
  mySessions: Array<SessionInfo>;
  myTrustedDevices: Array<TrustedDeviceInfo>;
  permissionListWithCursor: Array<Maybe<Permission>>;
  permissionListWithOffset: Array<Maybe<Permission>>;
  permissionOne: Permission;
  roleListWithCursor: Array<Maybe<Role>>;
  roleListWithOffset: Array<Maybe<Role>>;
  roleOne: Role;
  tenantListWithCursor: Array<Maybe<Tenant>>;
  tenantListWithOffset: Array<Maybe<Tenant>>;
  tenantOne: Tenant;
  /** Get count of unread notifications for current user */
  unreadNotificationCount: Scalars['Int']['output'];
  userListWithCursor: Array<Maybe<User>>;
  userListWithOffset: Array<Maybe<User>>;
  userNotificationListWithCursor: Array<Maybe<UserNotification>>;
  userNotificationListWithOffset: Array<Maybe<UserNotification>>;
  userNotificationOne: UserNotification;
  userNotificationPreferenceListWithCursor: Array<Maybe<UserNotificationPreference>>;
  userNotificationPreferenceListWithOffset: Array<Maybe<UserNotificationPreference>>;
  userNotificationPreferenceOne: UserNotificationPreference;
  userOne: User;
  workerEventListWithCursor: Array<Maybe<WorkerEvent>>;
  workerEventListWithOffset: Array<Maybe<WorkerEvent>>;
  workerEventOne: WorkerEvent;
  workerEventRetryInfo: WorkerEventRetryInfo;
};


export type QueryAbConceptCorrectionListWithCursorArgs = {
  allTenants?: InputMaybe<Scalars['Boolean']['input']>;
  cursorKey?: InputMaybe<Scalars['String']['input']>;
  orderBy: AbConceptCorrection_OrderByCursor;
  take: Scalars['Int']['input'];
  where?: InputMaybe<AbConceptCorrection_Filter>;
};


export type QueryAbConceptCorrectionListWithOffsetArgs = {
  allTenants?: InputMaybe<Scalars['Boolean']['input']>;
  offset: Scalars['Int']['input'];
  orderBy?: InputMaybe<Array<AbConceptCorrection_OrderBy>>;
  take: Scalars['Int']['input'];
  where?: InputMaybe<AbConceptCorrection_Filter>;
};


export type QueryAbConceptCorrectionOneArgs = {
  allTenants?: InputMaybe<Scalars['Boolean']['input']>;
  id: Scalars['String']['input'];
};


export type QueryAbDecisionListWithCursorArgs = {
  cursorKey?: InputMaybe<Scalars['String']['input']>;
  orderBy: AbDecision_OrderByCursor;
  take: Scalars['Int']['input'];
  where?: InputMaybe<AbDecision_Filter>;
};


export type QueryAbDecisionListWithOffsetArgs = {
  offset: Scalars['Int']['input'];
  orderBy?: InputMaybe<Array<AbDecision_OrderBy>>;
  take: Scalars['Int']['input'];
  where?: InputMaybe<AbDecision_Filter>;
};


export type QueryAbDecisionOneArgs = {
  id: Scalars['String']['input'];
};


export type QueryAbPaymentBatchListWithCursorArgs = {
  cursorKey?: InputMaybe<Scalars['String']['input']>;
  orderBy: AbPaymentBatch_OrderByCursor;
  take: Scalars['Int']['input'];
  where?: InputMaybe<AbPaymentBatch_Filter>;
};


export type QueryAbPaymentBatchListWithOffsetArgs = {
  offset: Scalars['Int']['input'];
  orderBy?: InputMaybe<Array<AbPaymentBatch_OrderBy>>;
  take: Scalars['Int']['input'];
  where?: InputMaybe<AbPaymentBatch_Filter>;
};


export type QueryAbPaymentBatchOneArgs = {
  id: Scalars['String']['input'];
};


export type QueryAbReconciliationListWithCursorArgs = {
  cursorKey?: InputMaybe<Scalars['String']['input']>;
  orderBy: AbReconciliation_OrderByCursor;
  take: Scalars['Int']['input'];
  where?: InputMaybe<AbReconciliation_Filter>;
};


export type QueryAbReconciliationListWithOffsetArgs = {
  offset: Scalars['Int']['input'];
  orderBy?: InputMaybe<Array<AbReconciliation_OrderBy>>;
  take: Scalars['Int']['input'];
  where?: InputMaybe<AbReconciliation_Filter>;
};


export type QueryAbReconciliationOneArgs = {
  id: Scalars['String']['input'];
};


export type QueryAbStatementListWithCursorArgs = {
  cursorKey?: InputMaybe<Scalars['String']['input']>;
  orderBy: AbStatement_OrderByCursor;
  take: Scalars['Int']['input'];
  where?: InputMaybe<AbStatement_Filter>;
};


export type QueryAbStatementListWithOffsetArgs = {
  offset: Scalars['Int']['input'];
  orderBy?: InputMaybe<Array<AbStatement_OrderBy>>;
  take: Scalars['Int']['input'];
  where?: InputMaybe<AbStatement_Filter>;
};


export type QueryAbStatementOneArgs = {
  id: Scalars['String']['input'];
};


export type QueryDeletionBlockersArgs = {
  entity: Scalars['String']['input'];
  id: Scalars['ID']['input'];
};


export type QueryEmailVerificationListWithCursorArgs = {
  cursorKey?: InputMaybe<Scalars['String']['input']>;
  orderBy: EmailVerification_OrderByCursor;
  take: Scalars['Int']['input'];
  where?: InputMaybe<EmailVerification_Filter>;
};


export type QueryEmailVerificationListWithOffsetArgs = {
  offset: Scalars['Int']['input'];
  orderBy?: InputMaybe<Array<EmailVerification_OrderBy>>;
  take: Scalars['Int']['input'];
  where?: InputMaybe<EmailVerification_Filter>;
};


export type QueryEmailVerificationOneArgs = {
  id: Scalars['String']['input'];
};


export type QueryIdempotencyRecordListWithCursorArgs = {
  cursorKey?: InputMaybe<Scalars['String']['input']>;
  orderBy: IdempotencyRecord_OrderByCursor;
  take: Scalars['Int']['input'];
  where?: InputMaybe<IdempotencyRecord_Filter>;
};


export type QueryIdempotencyRecordListWithOffsetArgs = {
  offset: Scalars['Int']['input'];
  orderBy?: InputMaybe<Array<IdempotencyRecord_OrderBy>>;
  take: Scalars['Int']['input'];
  where?: InputMaybe<IdempotencyRecord_Filter>;
};


export type QueryIdempotencyRecordOneArgs = {
  id: Scalars['String']['input'];
};


export type QueryIntegrationClientListWithCursorArgs = {
  cursorKey?: InputMaybe<Scalars['String']['input']>;
  orderBy: IntegrationClient_OrderByCursor;
  take: Scalars['Int']['input'];
  where?: InputMaybe<IntegrationClient_Filter>;
};


export type QueryIntegrationClientListWithOffsetArgs = {
  offset: Scalars['Int']['input'];
  orderBy?: InputMaybe<Array<IntegrationClient_OrderBy>>;
  take: Scalars['Int']['input'];
  where?: InputMaybe<IntegrationClient_Filter>;
};


export type QueryIntegrationClientOneArgs = {
  id: Scalars['String']['input'];
};


export type QueryMyNotificationsArgs = {
  limit?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  type?: InputMaybe<NotificationTypeFilter>;
  unreadOnly?: InputMaybe<Scalars['Boolean']['input']>;
};


export type QueryPermissionListWithCursorArgs = {
  cursorKey?: InputMaybe<Scalars['String']['input']>;
  orderBy: Permission_OrderByCursor;
  take: Scalars['Int']['input'];
  where?: InputMaybe<Permission_Filter>;
};


export type QueryPermissionListWithOffsetArgs = {
  offset: Scalars['Int']['input'];
  orderBy?: InputMaybe<Array<Permission_OrderBy>>;
  take: Scalars['Int']['input'];
  where?: InputMaybe<Permission_Filter>;
};


export type QueryPermissionOneArgs = {
  id: Scalars['String']['input'];
};


export type QueryRoleListWithCursorArgs = {
  cursorKey?: InputMaybe<Scalars['String']['input']>;
  orderBy: Role_OrderByCursor;
  take: Scalars['Int']['input'];
  where?: InputMaybe<Role_Filter>;
};


export type QueryRoleListWithOffsetArgs = {
  offset: Scalars['Int']['input'];
  orderBy?: InputMaybe<Array<Role_OrderBy>>;
  take: Scalars['Int']['input'];
  where?: InputMaybe<Role_Filter>;
};


export type QueryRoleOneArgs = {
  id: Scalars['String']['input'];
};


export type QueryTenantListWithCursorArgs = {
  cursorKey?: InputMaybe<Scalars['String']['input']>;
  orderBy: Tenant_OrderByCursor;
  take: Scalars['Int']['input'];
  where?: InputMaybe<Tenant_Filter>;
};


export type QueryTenantListWithOffsetArgs = {
  offset: Scalars['Int']['input'];
  orderBy?: InputMaybe<Array<Tenant_OrderBy>>;
  take: Scalars['Int']['input'];
  where?: InputMaybe<Tenant_Filter>;
};


export type QueryTenantOneArgs = {
  id: Scalars['String']['input'];
};


export type QueryUserListWithCursorArgs = {
  cursorKey?: InputMaybe<Scalars['String']['input']>;
  orderBy: User_OrderByCursor;
  take: Scalars['Int']['input'];
  where?: InputMaybe<User_Filter>;
};


export type QueryUserListWithOffsetArgs = {
  offset: Scalars['Int']['input'];
  orderBy?: InputMaybe<Array<User_OrderBy>>;
  take: Scalars['Int']['input'];
  where?: InputMaybe<User_Filter>;
};


export type QueryUserNotificationListWithCursorArgs = {
  cursorKey?: InputMaybe<Scalars['String']['input']>;
  orderBy: UserNotification_OrderByCursor;
  take: Scalars['Int']['input'];
  where?: InputMaybe<UserNotification_Filter>;
};


export type QueryUserNotificationListWithOffsetArgs = {
  offset: Scalars['Int']['input'];
  orderBy?: InputMaybe<Array<UserNotification_OrderBy>>;
  take: Scalars['Int']['input'];
  where?: InputMaybe<UserNotification_Filter>;
};


export type QueryUserNotificationOneArgs = {
  id: Scalars['String']['input'];
};


export type QueryUserNotificationPreferenceListWithCursorArgs = {
  cursorKey?: InputMaybe<Scalars['String']['input']>;
  orderBy: UserNotificationPreference_OrderByCursor;
  take: Scalars['Int']['input'];
  where?: InputMaybe<UserNotificationPreference_Filter>;
};


export type QueryUserNotificationPreferenceListWithOffsetArgs = {
  offset: Scalars['Int']['input'];
  orderBy?: InputMaybe<Array<UserNotificationPreference_OrderBy>>;
  take: Scalars['Int']['input'];
  where?: InputMaybe<UserNotificationPreference_Filter>;
};


export type QueryUserNotificationPreferenceOneArgs = {
  id: Scalars['String']['input'];
};


export type QueryUserOneArgs = {
  id: Scalars['String']['input'];
};


export type QueryWorkerEventListWithCursorArgs = {
  allTenants?: InputMaybe<Scalars['Boolean']['input']>;
  cursorKey?: InputMaybe<Scalars['String']['input']>;
  orderBy: WorkerEvent_OrderByCursor;
  take: Scalars['Int']['input'];
  where?: InputMaybe<WorkerEvent_Filter>;
};


export type QueryWorkerEventListWithOffsetArgs = {
  allTenants?: InputMaybe<Scalars['Boolean']['input']>;
  offset: Scalars['Int']['input'];
  orderBy?: InputMaybe<Array<WorkerEvent_OrderBy>>;
  take: Scalars['Int']['input'];
  where?: InputMaybe<WorkerEvent_Filter>;
};


export type QueryWorkerEventOneArgs = {
  allTenants?: InputMaybe<Scalars['Boolean']['input']>;
  id: Scalars['String']['input'];
};


export type QueryWorkerEventRetryInfoArgs = {
  id: Scalars['ID']['input'];
};

export type Role = {
  __typename?: 'Role';
  createdAt_: Scalars['DateTime']['output'];
  createdBy_: User;
  displayId: Scalars['String']['output'];
  id: Scalars['String']['output'];
  isForAllTenants: Scalars['Boolean']['output'];
  lastUpdatedAt_?: Maybe<Scalars['DateTime']['output']>;
  lastUpdatedBy_?: Maybe<User>;
  name: Scalars['String']['output'];
  permissions?: Maybe<Array<Permission>>;
  version_: Scalars['String']['output'];
};

export type Role_CreateInput = {
  isForAllTenants: Scalars['Boolean']['input'];
  name: Scalars['String']['input'];
  permissionsIds?: InputMaybe<Array<Scalars['String']['input']>>;
};

export type Role_Filter = {
  AND?: InputMaybe<Array<Role_Filter>>;
  NOT?: InputMaybe<Array<Role_Filter>>;
  OR?: InputMaybe<Array<Role_Filter>>;
  createdAt_?: InputMaybe<FilterDateTime>;
  createdBy_?: InputMaybe<User_Filter>;
  displayId?: InputMaybe<FilterString>;
  id?: InputMaybe<FilterString>;
  isForAllTenants?: InputMaybe<FilterBoolean>;
  lastUpdatedAt_?: InputMaybe<FilterDateTime>;
  lastUpdatedBy_?: InputMaybe<User_Filter>;
  name?: InputMaybe<FilterString>;
  permissions?: InputMaybe<Role_Permissions_Filter>;
  version_?: InputMaybe<FilterString>;
};

export type Role_OrderBy = {
  createdAt_?: InputMaybe<SortOrder>;
  createdBy_?: InputMaybe<User_OrderBy>;
  id?: InputMaybe<SortOrder>;
  isForAllTenants?: InputMaybe<SortOrder>;
  lastUpdatedAt_?: InputMaybe<SortOrder>;
  lastUpdatedBy_?: InputMaybe<User_OrderBy>;
  name?: InputMaybe<SortOrder>;
  permissions?: InputMaybe<OrderByMultiple>;
  version_?: InputMaybe<SortOrder>;
};

export type Role_OrderByCursor = {
  id?: InputMaybe<SortOrder>;
  name?: InputMaybe<SortOrder>;
};

export type Role_UpdateInput = {
  id: Scalars['String']['input'];
  isForAllTenants?: InputMaybe<Scalars['Boolean']['input']>;
  name?: InputMaybe<Scalars['String']['input']>;
  permissionsIds?: InputMaybe<InputMultipleRef>;
  version_: Scalars['String']['input'];
};

export type Role_Permissions_Filter = {
  every?: InputMaybe<Permission_Filter>;
  none?: InputMaybe<Permission_Filter>;
  some?: InputMaybe<Permission_Filter>;
};

export type SessionInfo = {
  __typename?: 'SessionInfo';
  browserName?: Maybe<Scalars['String']['output']>;
  browserVersion?: Maybe<Scalars['String']['output']>;
  createdAt: Scalars['DateTime']['output'];
  deviceType?: Maybe<Scalars['String']['output']>;
  expiresAt: Scalars['DateTime']['output'];
  id: Scalars['String']['output'];
  ipAddress?: Maybe<Scalars['String']['output']>;
  lastUsedAt?: Maybe<Scalars['DateTime']['output']>;
  osName?: Maybe<Scalars['String']['output']>;
};

export type SimulationControlResult = {
  __typename?: 'SimulationControlResult';
  ok: Scalars['Boolean']['output'];
};

export type SimulationResetResult = {
  __typename?: 'SimulationResetResult';
  ok: Scalars['Boolean']['output'];
};

export type SimulationStartResult = {
  __typename?: 'SimulationStartResult';
  sessionId: Scalars['ID']['output'];
};

export const SortOrder = {
  Asc: 'asc',
  Desc: 'desc'
} as const;

export type SortOrder = typeof SortOrder[keyof typeof SortOrder];
export type Tenant = {
  __typename?: 'Tenant';
  createdAt_: Scalars['DateTime']['output'];
  createdBy_: User;
  displayId: Scalars['String']['output'];
  grossReceiptsJurisdiction?: Maybe<Scalars['String']['output']>;
  id: Scalars['String']['output'];
  imputationMinConfidence?: Maybe<Scalars['Int']['output']>;
  ivaCondition: TenantIvaCondition;
  lastUpdatedAt_?: Maybe<Scalars['DateTime']['output']>;
  lastUpdatedBy_?: Maybe<User>;
  logo?: Maybe<Scalars['String']['output']>;
  logo_data?: Maybe<FileData>;
  name: Scalars['String']['output'];
  status: TenantStatus;
  taxId?: Maybe<Scalars['String']['output']>;
  version_: Scalars['String']['output'];
  withholdingAgent: Scalars['Boolean']['output'];
};

export const TenantIvaCondition = {
  Exempt: 'exempt',
  Monotax: 'monotax',
  RegisteredResponsible: 'registeredResponsible'
} as const;

export type TenantIvaCondition = typeof TenantIvaCondition[keyof typeof TenantIvaCondition];
export const TenantStatus = {
  Active: 'active',
  Suspended: 'suspended'
} as const;

export type TenantStatus = typeof TenantStatus[keyof typeof TenantStatus];
export type Tenant_CreateInput = {
  grossReceiptsJurisdiction?: InputMaybe<Scalars['String']['input']>;
  imputationMinConfidence?: InputMaybe<Scalars['Int']['input']>;
  ivaCondition: TenantIvaCondition;
  logo?: InputMaybe<UploadedFile>;
  name: Scalars['String']['input'];
  status: TenantStatus;
  taxId?: InputMaybe<Scalars['String']['input']>;
  withholdingAgent: Scalars['Boolean']['input'];
};

export type Tenant_Filter = {
  AND?: InputMaybe<Array<Tenant_Filter>>;
  NOT?: InputMaybe<Array<Tenant_Filter>>;
  OR?: InputMaybe<Array<Tenant_Filter>>;
  createdAt_?: InputMaybe<FilterDateTime>;
  createdBy_?: InputMaybe<User_Filter>;
  displayId?: InputMaybe<FilterString>;
  grossReceiptsJurisdiction?: InputMaybe<FilterString>;
  id?: InputMaybe<FilterString>;
  imputationMinConfidence?: InputMaybe<FilterInt>;
  ivaCondition?: InputMaybe<FilterString>;
  lastUpdatedAt_?: InputMaybe<FilterDateTime>;
  lastUpdatedBy_?: InputMaybe<User_Filter>;
  logo?: InputMaybe<FilterString>;
  name?: InputMaybe<FilterString>;
  status?: InputMaybe<FilterString>;
  taxId?: InputMaybe<FilterString>;
  version_?: InputMaybe<FilterString>;
  withholdingAgent?: InputMaybe<FilterBoolean>;
};

export type Tenant_OrderBy = {
  createdAt_?: InputMaybe<SortOrder>;
  createdBy_?: InputMaybe<User_OrderBy>;
  grossReceiptsJurisdiction?: InputMaybe<SortOrder>;
  id?: InputMaybe<SortOrder>;
  imputationMinConfidence?: InputMaybe<SortOrder>;
  ivaCondition?: InputMaybe<SortOrder>;
  lastUpdatedAt_?: InputMaybe<SortOrder>;
  lastUpdatedBy_?: InputMaybe<User_OrderBy>;
  logo?: InputMaybe<SortOrder>;
  name?: InputMaybe<SortOrder>;
  status?: InputMaybe<SortOrder>;
  taxId?: InputMaybe<SortOrder>;
  version_?: InputMaybe<SortOrder>;
  withholdingAgent?: InputMaybe<SortOrder>;
};

export type Tenant_OrderByCursor = {
  id?: InputMaybe<SortOrder>;
  name?: InputMaybe<SortOrder>;
};

export type Tenant_UpdateInput = {
  grossReceiptsJurisdiction?: InputMaybe<Scalars['String']['input']>;
  id: Scalars['String']['input'];
  imputationMinConfidence?: InputMaybe<Scalars['Int']['input']>;
  ivaCondition?: InputMaybe<TenantIvaCondition>;
  logo?: InputMaybe<UploadedFile>;
  name?: InputMaybe<Scalars['String']['input']>;
  status?: InputMaybe<TenantStatus>;
  taxId?: InputMaybe<Scalars['String']['input']>;
  version_: Scalars['String']['input'];
  withholdingAgent?: InputMaybe<Scalars['Boolean']['input']>;
};

export type Thumbnail = {
  __typename?: 'Thumbnail';
  size: ThumbnailSize;
  url: Scalars['String']['output'];
};

export const ThumbnailSize = {
  Width256: 'width256',
  Width512: 'width512',
  Width1280: 'width1280'
} as const;

export type ThumbnailSize = typeof ThumbnailSize[keyof typeof ThumbnailSize];
export type TrustedDeviceInfo = {
  __typename?: 'TrustedDeviceInfo';
  browserName?: Maybe<Scalars['String']['output']>;
  browserVersion?: Maybe<Scalars['String']['output']>;
  createdAt: Scalars['DateTime']['output'];
  deviceType?: Maybe<Scalars['String']['output']>;
  expiresAt: Scalars['DateTime']['output'];
  id: Scalars['String']['output'];
  ipAddress?: Maybe<Scalars['String']['output']>;
  lastUsedAt?: Maybe<Scalars['DateTime']['output']>;
  osName?: Maybe<Scalars['String']['output']>;
};

export type TwoFaSetupResponse = {
  __typename?: 'TwoFaSetupResponse';
  backupCodes: Array<Scalars['String']['output']>;
  qrCodeDataUrl: Scalars['String']['output'];
  secret: Scalars['String']['output'];
};

export type UploadedFile = {
  encoding?: InputMaybe<Scalars['String']['input']>;
  filename: Scalars['String']['input'];
  mimetype: Scalars['String']['input'];
  size: Scalars['Int']['input'];
  ticket: Scalars['String']['input'];
};

export type UploadedFileData = {
  __typename?: 'UploadedFileData';
  encoding?: Maybe<Scalars['String']['output']>;
  filename: Scalars['String']['output'];
  mimetype: Scalars['String']['output'];
  size: Scalars['Int']['output'];
  ticket: Scalars['String']['output'];
};

export type User = {
  __typename?: 'User';
  active: Scalars['Boolean']['output'];
  avatar?: Maybe<Scalars['String']['output']>;
  avatar_data?: Maybe<FileData>;
  cellphone?: Maybe<Scalars['String']['output']>;
  company?: Maybe<Company>;
  createdAt_: Scalars['DateTime']['output'];
  createdBy_: User;
  displayId: Scalars['String']['output'];
  email: Scalars['String']['output'];
  id: Scalars['String']['output'];
  language: Language;
  lastUpdatedAt_?: Maybe<Scalars['DateTime']['output']>;
  lastUpdatedBy_?: Maybe<User>;
  name: Scalars['String']['output'];
  profile?: Maybe<Scalars['Json']['output']>;
  role?: Maybe<Role>;
  targetTenant?: Maybe<Tenant>;
  tenantDisplayName?: Maybe<Scalars['String']['output']>;
  tenant_id_?: Maybe<Scalars['String']['output']>;
  twoFaseAuth?: Maybe<Scalars['Boolean']['output']>;
  version_: Scalars['String']['output'];
};

export type UserNotification = {
  __typename?: 'UserNotification';
  actionUrl?: Maybe<Scalars['String']['output']>;
  actorUser?: Maybe<User>;
  archivedAt?: Maybe<Scalars['DateTime']['output']>;
  body?: Maybe<Scalars['String']['output']>;
  createdAt_: Scalars['DateTime']['output'];
  createdBy_: User;
  displayId: Scalars['String']['output'];
  id: Scalars['String']['output'];
  lastUpdatedAt_?: Maybe<Scalars['DateTime']['output']>;
  lastUpdatedBy_?: Maybe<User>;
  metadata?: Maybe<Scalars['Json']['output']>;
  notificationCreatedAt?: Maybe<Scalars['DateTime']['output']>;
  objectId?: Maybe<Scalars['String']['output']>;
  objectType?: Maybe<Scalars['String']['output']>;
  priority?: Maybe<NotificationPriority>;
  readAt?: Maybe<Scalars['DateTime']['output']>;
  title: Scalars['String']['output'];
  type: NotificationType;
  version_: Scalars['String']['output'];
};

export type UserNotificationItem = {
  __typename?: 'UserNotificationItem';
  actionUrl?: Maybe<Scalars['String']['output']>;
  actorUser?: Maybe<NotificationActorUser>;
  archivedAt?: Maybe<Scalars['String']['output']>;
  body?: Maybe<Scalars['String']['output']>;
  createdAt: Scalars['String']['output'];
  id: Scalars['ID']['output'];
  objectId?: Maybe<Scalars['String']['output']>;
  objectType?: Maybe<Scalars['String']['output']>;
  priority: Scalars['String']['output'];
  readAt?: Maybe<Scalars['String']['output']>;
  title: Scalars['String']['output'];
  type: Scalars['String']['output'];
};

export type UserNotificationPreference = {
  __typename?: 'UserNotificationPreference';
  createdAt_: Scalars['DateTime']['output'];
  createdBy_: User;
  displayId: Scalars['String']['output'];
  emailEnabled: Scalars['Boolean']['output'];
  emailFrequency: EmailFrequency;
  id: Scalars['String']['output'];
  inAppEnabled: Scalars['Boolean']['output'];
  lastUpdatedAt_?: Maybe<Scalars['DateTime']['output']>;
  lastUpdatedBy_?: Maybe<User>;
  notificationType: NotificationType;
  version_: Scalars['String']['output'];
};

export type UserNotificationPreference_CreateInput = {
  emailEnabled: Scalars['Boolean']['input'];
  emailFrequency: EmailFrequency;
  inAppEnabled: Scalars['Boolean']['input'];
  notificationType: NotificationType;
};

export type UserNotificationPreference_Filter = {
  AND?: InputMaybe<Array<UserNotificationPreference_Filter>>;
  NOT?: InputMaybe<Array<UserNotificationPreference_Filter>>;
  OR?: InputMaybe<Array<UserNotificationPreference_Filter>>;
  createdAt_?: InputMaybe<FilterDateTime>;
  createdBy_?: InputMaybe<User_Filter>;
  displayId?: InputMaybe<FilterString>;
  emailEnabled?: InputMaybe<FilterBoolean>;
  emailFrequency?: InputMaybe<FilterString>;
  id?: InputMaybe<FilterString>;
  inAppEnabled?: InputMaybe<FilterBoolean>;
  lastUpdatedAt_?: InputMaybe<FilterDateTime>;
  lastUpdatedBy_?: InputMaybe<User_Filter>;
  notificationType?: InputMaybe<FilterString>;
  version_?: InputMaybe<FilterString>;
};

export type UserNotificationPreference_OrderBy = {
  createdAt_?: InputMaybe<SortOrder>;
  createdBy_?: InputMaybe<User_OrderBy>;
  emailEnabled?: InputMaybe<SortOrder>;
  emailFrequency?: InputMaybe<SortOrder>;
  id?: InputMaybe<SortOrder>;
  inAppEnabled?: InputMaybe<SortOrder>;
  lastUpdatedAt_?: InputMaybe<SortOrder>;
  lastUpdatedBy_?: InputMaybe<User_OrderBy>;
  notificationType?: InputMaybe<SortOrder>;
  version_?: InputMaybe<SortOrder>;
};

export type UserNotificationPreference_OrderByCursor = {
  id?: InputMaybe<SortOrder>;
};

export type UserNotificationPreference_UpdateInput = {
  emailEnabled?: InputMaybe<Scalars['Boolean']['input']>;
  emailFrequency?: InputMaybe<EmailFrequency>;
  id: Scalars['String']['input'];
  inAppEnabled?: InputMaybe<Scalars['Boolean']['input']>;
  notificationType?: InputMaybe<NotificationType>;
  version_: Scalars['String']['input'];
};

export type UserNotificationResult = {
  __typename?: 'UserNotificationResult';
  error?: Maybe<Scalars['String']['output']>;
  notification?: Maybe<UserNotificationItem>;
  success: Scalars['Boolean']['output'];
};

export type UserNotification_Filter = {
  AND?: InputMaybe<Array<UserNotification_Filter>>;
  NOT?: InputMaybe<Array<UserNotification_Filter>>;
  OR?: InputMaybe<Array<UserNotification_Filter>>;
  actionUrl?: InputMaybe<FilterString>;
  actorUser?: InputMaybe<User_Filter>;
  archivedAt?: InputMaybe<FilterDateTime>;
  body?: InputMaybe<FilterString>;
  createdAt_?: InputMaybe<FilterDateTime>;
  createdBy_?: InputMaybe<User_Filter>;
  displayId?: InputMaybe<FilterString>;
  id?: InputMaybe<FilterString>;
  lastUpdatedAt_?: InputMaybe<FilterDateTime>;
  lastUpdatedBy_?: InputMaybe<User_Filter>;
  metadata?: InputMaybe<FilterJson>;
  notificationCreatedAt?: InputMaybe<FilterDateTime>;
  objectId?: InputMaybe<FilterString>;
  objectType?: InputMaybe<FilterString>;
  priority?: InputMaybe<FilterString>;
  readAt?: InputMaybe<FilterDateTime>;
  title?: InputMaybe<FilterString>;
  type?: InputMaybe<FilterString>;
  version_?: InputMaybe<FilterString>;
};

export type UserNotification_OrderBy = {
  actionUrl?: InputMaybe<SortOrder>;
  actorUser?: InputMaybe<User_OrderBy>;
  archivedAt?: InputMaybe<SortOrder>;
  body?: InputMaybe<SortOrder>;
  createdAt_?: InputMaybe<SortOrder>;
  createdBy_?: InputMaybe<User_OrderBy>;
  id?: InputMaybe<SortOrder>;
  lastUpdatedAt_?: InputMaybe<SortOrder>;
  lastUpdatedBy_?: InputMaybe<User_OrderBy>;
  metadata?: InputMaybe<SortOrder>;
  notificationCreatedAt?: InputMaybe<SortOrder>;
  objectId?: InputMaybe<SortOrder>;
  objectType?: InputMaybe<SortOrder>;
  priority?: InputMaybe<SortOrder>;
  readAt?: InputMaybe<SortOrder>;
  title?: InputMaybe<SortOrder>;
  type?: InputMaybe<SortOrder>;
  version_?: InputMaybe<SortOrder>;
};

export type UserNotification_OrderByCursor = {
  id?: InputMaybe<SortOrder>;
};

export type User_CreateInput = {
  active: Scalars['Boolean']['input'];
  avatar?: InputMaybe<UploadedFile>;
  cellphone?: InputMaybe<Scalars['String']['input']>;
  email: Scalars['String']['input'];
  language: Language;
  name: Scalars['String']['input'];
  roleId?: InputMaybe<Scalars['String']['input']>;
  targetTenantId?: InputMaybe<Scalars['String']['input']>;
  twoFaseAuth?: InputMaybe<Scalars['Boolean']['input']>;
};

export type User_Filter = {
  AND?: InputMaybe<Array<User_Filter>>;
  NOT?: InputMaybe<Array<User_Filter>>;
  OR?: InputMaybe<Array<User_Filter>>;
  active?: InputMaybe<FilterBoolean>;
  avatar?: InputMaybe<FilterString>;
  cellphone?: InputMaybe<FilterString>;
  createdAt_?: InputMaybe<FilterDateTime>;
  createdBy_?: InputMaybe<User_Filter>;
  displayId?: InputMaybe<FilterString>;
  email?: InputMaybe<FilterString>;
  id?: InputMaybe<FilterString>;
  language?: InputMaybe<FilterString>;
  lastUpdatedAt_?: InputMaybe<FilterDateTime>;
  lastUpdatedBy_?: InputMaybe<User_Filter>;
  name?: InputMaybe<FilterString>;
  profile?: InputMaybe<FilterJson>;
  role?: InputMaybe<Role_Filter>;
  targetTenant?: InputMaybe<Tenant_Filter>;
  tenantDisplayName?: InputMaybe<FilterString>;
  twoFaseAuth?: InputMaybe<FilterBoolean>;
  version_?: InputMaybe<FilterString>;
};

export type User_OrderBy = {
  active?: InputMaybe<SortOrder>;
  avatar?: InputMaybe<SortOrder>;
  cellphone?: InputMaybe<SortOrder>;
  createdAt_?: InputMaybe<SortOrder>;
  createdBy_?: InputMaybe<User_OrderBy>;
  email?: InputMaybe<SortOrder>;
  id?: InputMaybe<SortOrder>;
  language?: InputMaybe<SortOrder>;
  lastUpdatedAt_?: InputMaybe<SortOrder>;
  lastUpdatedBy_?: InputMaybe<User_OrderBy>;
  name?: InputMaybe<SortOrder>;
  profile?: InputMaybe<SortOrder>;
  role?: InputMaybe<Role_OrderBy>;
  targetTenant?: InputMaybe<Tenant_OrderBy>;
  tenantDisplayName?: InputMaybe<SortOrder>;
  twoFaseAuth?: InputMaybe<SortOrder>;
  version_?: InputMaybe<SortOrder>;
};

export type User_OrderByCursor = {
  email?: InputMaybe<SortOrder>;
  id?: InputMaybe<SortOrder>;
};

export type User_UpdateInput = {
  active?: InputMaybe<Scalars['Boolean']['input']>;
  avatar?: InputMaybe<UploadedFile>;
  cellphone?: InputMaybe<Scalars['String']['input']>;
  email?: InputMaybe<Scalars['String']['input']>;
  id: Scalars['String']['input'];
  language?: InputMaybe<Language>;
  name?: InputMaybe<Scalars['String']['input']>;
  profile?: InputMaybe<Scalars['Json']['input']>;
  roleId?: InputMaybe<Scalars['String']['input']>;
  twoFaseAuth?: InputMaybe<Scalars['Boolean']['input']>;
  version_: Scalars['String']['input'];
};

export type WorkerEvent = {
  __typename?: 'WorkerEvent';
  completedAt?: Maybe<Scalars['DateTime']['output']>;
  correlationId?: Maybe<Scalars['String']['output']>;
  createdAt_: Scalars['DateTime']['output'];
  createdBy_: User;
  displayId: Scalars['String']['output'];
  duration?: Maybe<Scalars['Int']['output']>;
  enqueuedAt: Scalars['DateTime']['output'];
  error?: Maybe<Scalars['Json']['output']>;
  id: Scalars['String']['output'];
  jobType: Scalars['String']['output'];
  lastUpdatedAt_?: Maybe<Scalars['DateTime']['output']>;
  lastUpdatedBy_?: Maybe<User>;
  manualRetryCount: Scalars['Int']['output'];
  nextRetryAt?: Maybe<Scalars['DateTime']['output']>;
  payload: Scalars['Json']['output'];
  queueName: Scalars['String']['output'];
  result?: Maybe<Scalars['Json']['output']>;
  retryCount: Scalars['Int']['output'];
  startedAt?: Maybe<Scalars['DateTime']['output']>;
  status: Scalars['String']['output'];
  tenant_id_?: Maybe<Scalars['String']['output']>;
  triggerUserId: User;
  version_: Scalars['String']['output'];
};

export type WorkerEventRetryInfo = {
  __typename?: 'WorkerEventRetryInfo';
  canRetry: Scalars['Boolean']['output'];
  currentValues?: Maybe<Scalars['Json']['output']>;
  editableFields: Array<Scalars['String']['output']>;
  modes: Array<Scalars['String']['output']>;
  reason?: Maybe<Scalars['String']['output']>;
};

export type WorkerEventRetryResult = {
  __typename?: 'WorkerEventRetryResult';
  newWorkerEventId: Scalars['ID']['output'];
};

export type WorkerEvent_Filter = {
  AND?: InputMaybe<Array<WorkerEvent_Filter>>;
  NOT?: InputMaybe<Array<WorkerEvent_Filter>>;
  OR?: InputMaybe<Array<WorkerEvent_Filter>>;
  completedAt?: InputMaybe<FilterDateTime>;
  correlationId?: InputMaybe<FilterString>;
  createdAt_?: InputMaybe<FilterDateTime>;
  createdBy_?: InputMaybe<User_Filter>;
  displayId?: InputMaybe<FilterString>;
  duration?: InputMaybe<FilterInt>;
  enqueuedAt?: InputMaybe<FilterDateTime>;
  error?: InputMaybe<FilterJson>;
  id?: InputMaybe<FilterString>;
  jobType?: InputMaybe<FilterString>;
  lastUpdatedAt_?: InputMaybe<FilterDateTime>;
  lastUpdatedBy_?: InputMaybe<User_Filter>;
  manualRetryCount?: InputMaybe<FilterInt>;
  nextRetryAt?: InputMaybe<FilterDateTime>;
  payload?: InputMaybe<FilterJson>;
  queueName?: InputMaybe<FilterString>;
  result?: InputMaybe<FilterJson>;
  retryCount?: InputMaybe<FilterInt>;
  startedAt?: InputMaybe<FilterDateTime>;
  status?: InputMaybe<FilterString>;
  triggerUserId?: InputMaybe<User_Filter>;
  version_?: InputMaybe<FilterString>;
};

export type WorkerEvent_OrderBy = {
  completedAt?: InputMaybe<SortOrder>;
  correlationId?: InputMaybe<SortOrder>;
  createdAt_?: InputMaybe<SortOrder>;
  createdBy_?: InputMaybe<User_OrderBy>;
  duration?: InputMaybe<SortOrder>;
  enqueuedAt?: InputMaybe<SortOrder>;
  error?: InputMaybe<SortOrder>;
  id?: InputMaybe<SortOrder>;
  jobType?: InputMaybe<SortOrder>;
  lastUpdatedAt_?: InputMaybe<SortOrder>;
  lastUpdatedBy_?: InputMaybe<User_OrderBy>;
  manualRetryCount?: InputMaybe<SortOrder>;
  nextRetryAt?: InputMaybe<SortOrder>;
  payload?: InputMaybe<SortOrder>;
  queueName?: InputMaybe<SortOrder>;
  result?: InputMaybe<SortOrder>;
  retryCount?: InputMaybe<SortOrder>;
  startedAt?: InputMaybe<SortOrder>;
  status?: InputMaybe<SortOrder>;
  triggerUserId?: InputMaybe<User_OrderBy>;
  version_?: InputMaybe<SortOrder>;
};

export type WorkerEvent_OrderByCursor = {
  id?: InputMaybe<SortOrder>;
};



export type ResolverTypeWrapper<T> = Promise<T> | T;


export type ResolverWithResolve<TResult, TParent, TContext, TArgs> = {
  resolve: ResolverFn<TResult, TParent, TContext, TArgs>;
};
export type Resolver<TResult, TParent = {}, TContext = {}, TArgs = {}> = ResolverFn<TResult, TParent, TContext, TArgs> | ResolverWithResolve<TResult, TParent, TContext, TArgs>;

export type ResolverFn<TResult, TParent, TContext, TArgs> = (
  parent: TParent,
  args: TArgs,
  context: TContext,
  info: GraphQLResolveInfo
) => Promise<TResult> | TResult;

export type SubscriptionSubscribeFn<TResult, TParent, TContext, TArgs> = (
  parent: TParent,
  args: TArgs,
  context: TContext,
  info: GraphQLResolveInfo
) => AsyncIterable<TResult> | Promise<AsyncIterable<TResult>>;

export type SubscriptionResolveFn<TResult, TParent, TContext, TArgs> = (
  parent: TParent,
  args: TArgs,
  context: TContext,
  info: GraphQLResolveInfo
) => TResult | Promise<TResult>;

export interface SubscriptionSubscriberObject<TResult, TKey extends string, TParent, TContext, TArgs> {
  subscribe: SubscriptionSubscribeFn<{ [key in TKey]: TResult }, TParent, TContext, TArgs>;
  resolve?: SubscriptionResolveFn<TResult, { [key in TKey]: TResult }, TContext, TArgs>;
}

export interface SubscriptionResolverObject<TResult, TParent, TContext, TArgs> {
  subscribe: SubscriptionSubscribeFn<any, TParent, TContext, TArgs>;
  resolve: SubscriptionResolveFn<TResult, any, TContext, TArgs>;
}

export type SubscriptionObject<TResult, TKey extends string, TParent, TContext, TArgs> =
  | SubscriptionSubscriberObject<TResult, TKey, TParent, TContext, TArgs>
  | SubscriptionResolverObject<TResult, TParent, TContext, TArgs>;

export type SubscriptionResolver<TResult, TKey extends string, TParent = {}, TContext = {}, TArgs = {}> =
  | ((...args: any[]) => SubscriptionObject<TResult, TKey, TParent, TContext, TArgs>)
  | SubscriptionObject<TResult, TKey, TParent, TContext, TArgs>;

export type TypeResolveFn<TTypes, TParent = {}, TContext = {}> = (
  parent: TParent,
  context: TContext,
  info: GraphQLResolveInfo
) => Maybe<TTypes> | Promise<Maybe<TTypes>>;

export type IsTypeOfResolverFn<T = {}, TContext = {}> = (obj: T, context: TContext, info: GraphQLResolveInfo) => boolean | Promise<boolean>;

export type NextResolverFn<T> = () => Promise<T>;

export type DirectiveResolverFn<TResult = {}, TParent = {}, TContext = {}, TArgs = {}> = (
  next: NextResolverFn<TResult>,
  parent: TParent,
  args: TArgs,
  context: TContext,
  info: GraphQLResolveInfo
) => TResult | Promise<TResult>;



/** Mapping between all available schema types and the resolvers types */
export type ResolversTypes = {
  AbConceptCorrection: ResolverTypeWrapper<AbConceptCorrection>;
  AbConceptCorrection_CreateInput: AbConceptCorrection_CreateInput;
  AbConceptCorrection_Filter: AbConceptCorrection_Filter;
  AbConceptCorrection_OrderBy: AbConceptCorrection_OrderBy;
  AbConceptCorrection_OrderByCursor: AbConceptCorrection_OrderByCursor;
  AbConceptCorrection_UpdateInput: AbConceptCorrection_UpdateInput;
  AbCorrectionReview: AbCorrectionReview;
  AbDecision: ResolverTypeWrapper<AbDecision>;
  AbDecision_Filter: AbDecision_Filter;
  AbDecision_OrderBy: AbDecision_OrderBy;
  AbDecision_OrderByCursor: AbDecision_OrderByCursor;
  AbPaymentBatch: ResolverTypeWrapper<AbPaymentBatch>;
  AbPaymentBatch_Filter: AbPaymentBatch_Filter;
  AbPaymentBatch_OrderBy: AbPaymentBatch_OrderBy;
  AbPaymentBatch_OrderByCursor: AbPaymentBatch_OrderByCursor;
  AbReconciliation: ResolverTypeWrapper<AbReconciliation>;
  AbReconciliation_Filter: AbReconciliation_Filter;
  AbReconciliation_OrderBy: AbReconciliation_OrderBy;
  AbReconciliation_OrderByCursor: AbReconciliation_OrderByCursor;
  AbStatement: ResolverTypeWrapper<AbStatement>;
  AbStatementReadReturn: ResolverTypeWrapper<AbStatementReadReturn>;
  AbStatementStatus: AbStatementStatus;
  AbStatement_Filter: AbStatement_Filter;
  AbStatement_OrderBy: AbStatement_OrderBy;
  AbStatement_OrderByCursor: AbStatement_OrderByCursor;
  AuthenticateResponse: ResolverTypeWrapper<AuthenticateResponse>;
  Boolean: ResolverTypeWrapper<Scalars['Boolean']['output']>;
  Company: ResolverTypeWrapper<Company>;
  Date: ResolverTypeWrapper<Scalars['Date']['output']>;
  DateTime: ResolverTypeWrapper<Scalars['DateTime']['output']>;
  Decimal: ResolverTypeWrapper<Scalars['Decimal']['output']>;
  DeletionBlockerItem: ResolverTypeWrapper<DeletionBlockerItem>;
  DeletionBlockerReason: ResolverTypeWrapper<DeletionBlockerReason>;
  DeletionBlockerVisible: ResolverTypeWrapper<DeletionBlockerVisible>;
  DeletionBlockers: ResolverTypeWrapper<DeletionBlockers>;
  EmailFrequency: EmailFrequency;
  EmailVerification: ResolverTypeWrapper<EmailVerification>;
  EmailVerificationStatus: EmailVerificationStatus;
  EmailVerification_CreateInput: EmailVerification_CreateInput;
  EmailVerification_Filter: EmailVerification_Filter;
  EmailVerification_OrderBy: EmailVerification_OrderBy;
  EmailVerification_OrderByCursor: EmailVerification_OrderByCursor;
  EmailVerification_UpdateInput: EmailVerification_UpdateInput;
  FileData: ResolverTypeWrapper<FileData>;
  FileData_UpdateInput: FileData_UpdateInput;
  FilterBoolean: FilterBoolean;
  FilterDate: FilterDate;
  FilterDateTime: FilterDateTime;
  FilterDecimal: FilterDecimal;
  FilterFloat: FilterFloat;
  FilterInt: FilterInt;
  FilterJson: FilterJson;
  FilterMode: FilterMode;
  FilterString: FilterString;
  FilterStringList: FilterStringList;
  Float: ResolverTypeWrapper<Scalars['Float']['output']>;
  ID: ResolverTypeWrapper<Scalars['ID']['output']>;
  IdempotencyRecord: ResolverTypeWrapper<IdempotencyRecord>;
  IdempotencyRecord_Filter: IdempotencyRecord_Filter;
  IdempotencyRecord_OrderBy: IdempotencyRecord_OrderBy;
  IdempotencyRecord_OrderByCursor: IdempotencyRecord_OrderByCursor;
  IdempotencyStatus: IdempotencyStatus;
  InputMultipleRef: InputMultipleRef;
  Int: ResolverTypeWrapper<Scalars['Int']['output']>;
  IntegrationClient: ResolverTypeWrapper<IntegrationClient>;
  IntegrationClientStatus: IntegrationClientStatus;
  IntegrationClient_CreateInput: IntegrationClient_CreateInput;
  IntegrationClient_Filter: IntegrationClient_Filter;
  IntegrationClient_OrderBy: IntegrationClient_OrderBy;
  IntegrationClient_OrderByCursor: IntegrationClient_OrderByCursor;
  IntegrationClient_UpdateInput: IntegrationClient_UpdateInput;
  Json: ResolverTypeWrapper<Scalars['Json']['output']>;
  Language: Language;
  LoginResponse: ResolverTypeWrapper<LoginResponse>;
  Mutation: ResolverTypeWrapper<{}>;
  NotificationActorUser: ResolverTypeWrapper<NotificationActorUser>;
  NotificationConnection: ResolverTypeWrapper<NotificationConnection>;
  NotificationPriority: NotificationPriority;
  NotificationType: NotificationType;
  NotificationTypeFilter: NotificationTypeFilter;
  OrderByMultiple: OrderByMultiple;
  Permission: ResolverTypeWrapper<Permission>;
  Permission_CreateInput: Permission_CreateInput;
  Permission_Filter: Permission_Filter;
  Permission_OrderBy: Permission_OrderBy;
  Permission_OrderByCursor: Permission_OrderByCursor;
  Permission_UpdateInput: Permission_UpdateInput;
  Query: ResolverTypeWrapper<{}>;
  Role: ResolverTypeWrapper<Role>;
  Role_CreateInput: Role_CreateInput;
  Role_Filter: Role_Filter;
  Role_OrderBy: Role_OrderBy;
  Role_OrderByCursor: Role_OrderByCursor;
  Role_UpdateInput: Role_UpdateInput;
  Role_permissions_Filter: Role_Permissions_Filter;
  SessionInfo: ResolverTypeWrapper<SessionInfo>;
  SimulationControlResult: ResolverTypeWrapper<SimulationControlResult>;
  SimulationResetResult: ResolverTypeWrapper<SimulationResetResult>;
  SimulationStartResult: ResolverTypeWrapper<SimulationStartResult>;
  SortOrder: SortOrder;
  String: ResolverTypeWrapper<Scalars['String']['output']>;
  Tenant: ResolverTypeWrapper<Tenant>;
  TenantIvaCondition: TenantIvaCondition;
  TenantStatus: TenantStatus;
  Tenant_CreateInput: Tenant_CreateInput;
  Tenant_Filter: Tenant_Filter;
  Tenant_OrderBy: Tenant_OrderBy;
  Tenant_OrderByCursor: Tenant_OrderByCursor;
  Tenant_UpdateInput: Tenant_UpdateInput;
  Thumbnail: ResolverTypeWrapper<Thumbnail>;
  ThumbnailSize: ThumbnailSize;
  TrustedDeviceInfo: ResolverTypeWrapper<TrustedDeviceInfo>;
  TwoFaSetupResponse: ResolverTypeWrapper<TwoFaSetupResponse>;
  Upload: ResolverTypeWrapper<Scalars['Upload']['output']>;
  UploadedFile: UploadedFile;
  UploadedFileData: ResolverTypeWrapper<UploadedFileData>;
  User: ResolverTypeWrapper<User>;
  UserNotification: ResolverTypeWrapper<UserNotification>;
  UserNotificationItem: ResolverTypeWrapper<UserNotificationItem>;
  UserNotificationPreference: ResolverTypeWrapper<UserNotificationPreference>;
  UserNotificationPreference_CreateInput: UserNotificationPreference_CreateInput;
  UserNotificationPreference_Filter: UserNotificationPreference_Filter;
  UserNotificationPreference_OrderBy: UserNotificationPreference_OrderBy;
  UserNotificationPreference_OrderByCursor: UserNotificationPreference_OrderByCursor;
  UserNotificationPreference_UpdateInput: UserNotificationPreference_UpdateInput;
  UserNotificationResult: ResolverTypeWrapper<UserNotificationResult>;
  UserNotification_Filter: UserNotification_Filter;
  UserNotification_OrderBy: UserNotification_OrderBy;
  UserNotification_OrderByCursor: UserNotification_OrderByCursor;
  User_CreateInput: User_CreateInput;
  User_Filter: User_Filter;
  User_OrderBy: User_OrderBy;
  User_OrderByCursor: User_OrderByCursor;
  User_UpdateInput: User_UpdateInput;
  WorkerEvent: ResolverTypeWrapper<WorkerEvent>;
  WorkerEventRetryInfo: ResolverTypeWrapper<WorkerEventRetryInfo>;
  WorkerEventRetryResult: ResolverTypeWrapper<WorkerEventRetryResult>;
  WorkerEvent_Filter: WorkerEvent_Filter;
  WorkerEvent_OrderBy: WorkerEvent_OrderBy;
  WorkerEvent_OrderByCursor: WorkerEvent_OrderByCursor;
};

/** Mapping between all available schema types and the resolvers parents */
export type ResolversParentTypes = {
  AbConceptCorrection: AbConceptCorrection;
  AbConceptCorrection_CreateInput: AbConceptCorrection_CreateInput;
  AbConceptCorrection_Filter: AbConceptCorrection_Filter;
  AbConceptCorrection_OrderBy: AbConceptCorrection_OrderBy;
  AbConceptCorrection_OrderByCursor: AbConceptCorrection_OrderByCursor;
  AbConceptCorrection_UpdateInput: AbConceptCorrection_UpdateInput;
  AbDecision: AbDecision;
  AbDecision_Filter: AbDecision_Filter;
  AbDecision_OrderBy: AbDecision_OrderBy;
  AbDecision_OrderByCursor: AbDecision_OrderByCursor;
  AbPaymentBatch: AbPaymentBatch;
  AbPaymentBatch_Filter: AbPaymentBatch_Filter;
  AbPaymentBatch_OrderBy: AbPaymentBatch_OrderBy;
  AbPaymentBatch_OrderByCursor: AbPaymentBatch_OrderByCursor;
  AbReconciliation: AbReconciliation;
  AbReconciliation_Filter: AbReconciliation_Filter;
  AbReconciliation_OrderBy: AbReconciliation_OrderBy;
  AbReconciliation_OrderByCursor: AbReconciliation_OrderByCursor;
  AbStatement: AbStatement;
  AbStatementReadReturn: AbStatementReadReturn;
  AbStatement_Filter: AbStatement_Filter;
  AbStatement_OrderBy: AbStatement_OrderBy;
  AbStatement_OrderByCursor: AbStatement_OrderByCursor;
  AuthenticateResponse: AuthenticateResponse;
  Boolean: Scalars['Boolean']['output'];
  Company: Company;
  Date: Scalars['Date']['output'];
  DateTime: Scalars['DateTime']['output'];
  Decimal: Scalars['Decimal']['output'];
  DeletionBlockerItem: DeletionBlockerItem;
  DeletionBlockerReason: DeletionBlockerReason;
  DeletionBlockerVisible: DeletionBlockerVisible;
  DeletionBlockers: DeletionBlockers;
  EmailVerification: EmailVerification;
  EmailVerification_CreateInput: EmailVerification_CreateInput;
  EmailVerification_Filter: EmailVerification_Filter;
  EmailVerification_OrderBy: EmailVerification_OrderBy;
  EmailVerification_OrderByCursor: EmailVerification_OrderByCursor;
  EmailVerification_UpdateInput: EmailVerification_UpdateInput;
  FileData: FileData;
  FileData_UpdateInput: FileData_UpdateInput;
  FilterBoolean: FilterBoolean;
  FilterDate: FilterDate;
  FilterDateTime: FilterDateTime;
  FilterDecimal: FilterDecimal;
  FilterFloat: FilterFloat;
  FilterInt: FilterInt;
  FilterJson: FilterJson;
  FilterString: FilterString;
  FilterStringList: FilterStringList;
  Float: Scalars['Float']['output'];
  ID: Scalars['ID']['output'];
  IdempotencyRecord: IdempotencyRecord;
  IdempotencyRecord_Filter: IdempotencyRecord_Filter;
  IdempotencyRecord_OrderBy: IdempotencyRecord_OrderBy;
  IdempotencyRecord_OrderByCursor: IdempotencyRecord_OrderByCursor;
  InputMultipleRef: InputMultipleRef;
  Int: Scalars['Int']['output'];
  IntegrationClient: IntegrationClient;
  IntegrationClient_CreateInput: IntegrationClient_CreateInput;
  IntegrationClient_Filter: IntegrationClient_Filter;
  IntegrationClient_OrderBy: IntegrationClient_OrderBy;
  IntegrationClient_OrderByCursor: IntegrationClient_OrderByCursor;
  IntegrationClient_UpdateInput: IntegrationClient_UpdateInput;
  Json: Scalars['Json']['output'];
  LoginResponse: LoginResponse;
  Mutation: {};
  NotificationActorUser: NotificationActorUser;
  NotificationConnection: NotificationConnection;
  OrderByMultiple: OrderByMultiple;
  Permission: Permission;
  Permission_CreateInput: Permission_CreateInput;
  Permission_Filter: Permission_Filter;
  Permission_OrderBy: Permission_OrderBy;
  Permission_OrderByCursor: Permission_OrderByCursor;
  Permission_UpdateInput: Permission_UpdateInput;
  Query: {};
  Role: Role;
  Role_CreateInput: Role_CreateInput;
  Role_Filter: Role_Filter;
  Role_OrderBy: Role_OrderBy;
  Role_OrderByCursor: Role_OrderByCursor;
  Role_UpdateInput: Role_UpdateInput;
  Role_permissions_Filter: Role_Permissions_Filter;
  SessionInfo: SessionInfo;
  SimulationControlResult: SimulationControlResult;
  SimulationResetResult: SimulationResetResult;
  SimulationStartResult: SimulationStartResult;
  String: Scalars['String']['output'];
  Tenant: Tenant;
  Tenant_CreateInput: Tenant_CreateInput;
  Tenant_Filter: Tenant_Filter;
  Tenant_OrderBy: Tenant_OrderBy;
  Tenant_OrderByCursor: Tenant_OrderByCursor;
  Tenant_UpdateInput: Tenant_UpdateInput;
  Thumbnail: Thumbnail;
  TrustedDeviceInfo: TrustedDeviceInfo;
  TwoFaSetupResponse: TwoFaSetupResponse;
  Upload: Scalars['Upload']['output'];
  UploadedFile: UploadedFile;
  UploadedFileData: UploadedFileData;
  User: User;
  UserNotification: UserNotification;
  UserNotificationItem: UserNotificationItem;
  UserNotificationPreference: UserNotificationPreference;
  UserNotificationPreference_CreateInput: UserNotificationPreference_CreateInput;
  UserNotificationPreference_Filter: UserNotificationPreference_Filter;
  UserNotificationPreference_OrderBy: UserNotificationPreference_OrderBy;
  UserNotificationPreference_OrderByCursor: UserNotificationPreference_OrderByCursor;
  UserNotificationPreference_UpdateInput: UserNotificationPreference_UpdateInput;
  UserNotificationResult: UserNotificationResult;
  UserNotification_Filter: UserNotification_Filter;
  UserNotification_OrderBy: UserNotification_OrderBy;
  UserNotification_OrderByCursor: UserNotification_OrderByCursor;
  User_CreateInput: User_CreateInput;
  User_Filter: User_Filter;
  User_OrderBy: User_OrderBy;
  User_OrderByCursor: User_OrderByCursor;
  User_UpdateInput: User_UpdateInput;
  WorkerEvent: WorkerEvent;
  WorkerEventRetryInfo: WorkerEventRetryInfo;
  WorkerEventRetryResult: WorkerEventRetryResult;
  WorkerEvent_Filter: WorkerEvent_Filter;
  WorkerEvent_OrderBy: WorkerEvent_OrderBy;
  WorkerEvent_OrderByCursor: WorkerEvent_OrderByCursor;
};

export type AuthDirectiveArgs = {
  roles: Array<Scalars['String']['input']>;
};

export type AuthDirectiveResolver<Result, Parent, ContextType = MyApolloContext, Args = AuthDirectiveArgs> = DirectiveResolverFn<Result, Parent, ContextType, Args>;

export type AbConceptCorrectionResolvers<ContextType = MyApolloContext, ParentType extends ResolversParentTypes['AbConceptCorrection'] = ResolversParentTypes['AbConceptCorrection']> = {
  bankCode?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  bankText?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  canonicalType?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  createdAt_?: Resolver<ResolversTypes['DateTime'], ParentType, ContextType>;
  createdBy_?: Resolver<ResolversTypes['User'], ParentType, ContextType>;
  displayId?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  id?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  lastUpdatedAt_?: Resolver<Maybe<ResolversTypes['DateTime']>, ParentType, ContextType>;
  lastUpdatedBy_?: Resolver<Maybe<ResolversTypes['User']>, ParentType, ContextType>;
  operationCode?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  rate?: Resolver<Maybe<ResolversTypes['Decimal']>, ParentType, ContextType>;
  review?: Resolver<ResolversTypes['AbCorrectionReview'], ParentType, ContextType>;
  reviewedAt?: Resolver<Maybe<ResolversTypes['DateTime']>, ParentType, ContextType>;
  tenant_id_?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  version_?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
};

export type AbDecisionResolvers<ContextType = MyApolloContext, ParentType extends ResolversParentTypes['AbDecision'] = ResolversParentTypes['AbDecision']> = {
  bankCode?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  canonicalType?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  chosen?: Resolver<ResolversTypes['Json'], ParentType, ContextType>;
  chosenKind?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  chosenPair?: Resolver<Maybe<ResolversTypes['Json']>, ParentType, ContextType>;
  conceptKey?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  createdAt_?: Resolver<ResolversTypes['DateTime'], ParentType, ContextType>;
  createdBy_?: Resolver<ResolversTypes['User'], ParentType, ContextType>;
  decidedAt?: Resolver<ResolversTypes['DateTime'], ParentType, ContextType>;
  decisionKey?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  displayId?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  id?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  lastUpdatedAt_?: Resolver<Maybe<ResolversTypes['DateTime']>, ParentType, ContextType>;
  lastUpdatedBy_?: Resolver<Maybe<ResolversTypes['User']>, ParentType, ContextType>;
  lineId?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  proposalId?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  proposedKind?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  proposedPair?: Resolver<Maybe<ResolversTypes['Json']>, ParentType, ContextType>;
  reconciliationId?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  result?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  statementId?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  version_?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
};

export type AbPaymentBatchResolvers<ContextType = MyApolloContext, ParentType extends ResolversParentTypes['AbPaymentBatch'] = ResolversParentTypes['AbPaymentBatch']> = {
  contentHash?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  createdAt_?: Resolver<ResolversTypes['DateTime'], ParentType, ContextType>;
  createdBy_?: Resolver<ResolversTypes['User'], ParentType, ContextType>;
  displayId?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  failedCount?: Resolver<ResolversTypes['Int'], ParentType, ContextType>;
  id?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  lastUpdatedAt_?: Resolver<Maybe<ResolversTypes['DateTime']>, ParentType, ContextType>;
  lastUpdatedBy_?: Resolver<Maybe<ResolversTypes['User']>, ParentType, ContextType>;
  originalName?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  transferCount?: Resolver<ResolversTypes['Int'], ParentType, ContextType>;
  transfers?: Resolver<ResolversTypes['Json'], ParentType, ContextType>;
  version_?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
};

export type AbReconciliationResolvers<ContextType = MyApolloContext, ParentType extends ResolversParentTypes['AbReconciliation'] = ResolversParentTypes['AbReconciliation']> = {
  bankCode?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  createdAt_?: Resolver<ResolversTypes['DateTime'], ParentType, ContextType>;
  createdBy_?: Resolver<ResolversTypes['User'], ParentType, ContextType>;
  displayId?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  id?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  lastUpdatedAt_?: Resolver<Maybe<ResolversTypes['DateTime']>, ParentType, ContextType>;
  lastUpdatedBy_?: Resolver<Maybe<ResolversTypes['User']>, ParentType, ContextType>;
  proposalCount?: Resolver<ResolversTypes['Int'], ParentType, ContextType>;
  request?: Resolver<ResolversTypes['Json'], ParentType, ContextType>;
  requestKey?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  result?: Resolver<ResolversTypes['Json'], ParentType, ContextType>;
  statementId?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  version_?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
};

export type AbStatementResolvers<ContextType = MyApolloContext, ParentType extends ResolversParentTypes['AbStatement'] = ResolversParentTypes['AbStatement']> = {
  bankCode?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  cbu?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  closingBalance?: Resolver<Maybe<ResolversTypes['Decimal']>, ParentType, ContextType>;
  contentHash?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  createdAt_?: Resolver<ResolversTypes['DateTime'], ParentType, ContextType>;
  createdBy_?: Resolver<ResolversTypes['User'], ParentType, ContextType>;
  declaredAccount?: Resolver<Maybe<ResolversTypes['Json']>, ParentType, ContextType>;
  displayId?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  error?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  file?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  file_data?: Resolver<ResolversTypes['FileData'], ParentType, ContextType>;
  id?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  lastUpdatedAt_?: Resolver<Maybe<ResolversTypes['DateTime']>, ParentType, ContextType>;
  lastUpdatedBy_?: Resolver<Maybe<ResolversTypes['User']>, ParentType, ContextType>;
  lineCount?: Resolver<Maybe<ResolversTypes['Int']>, ParentType, ContextType>;
  openingBalance?: Resolver<Maybe<ResolversTypes['Decimal']>, ParentType, ContextType>;
  originalName?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  periodFrom?: Resolver<Maybe<ResolversTypes['Date']>, ParentType, ContextType>;
  periodTo?: Resolver<Maybe<ResolversTypes['Date']>, ParentType, ContextType>;
  processedAt?: Resolver<Maybe<ResolversTypes['DateTime']>, ParentType, ContextType>;
  readStarts?: Resolver<ResolversTypes['Int'], ParentType, ContextType>;
  reading?: Resolver<Maybe<ResolversTypes['Json']>, ParentType, ContextType>;
  status?: Resolver<ResolversTypes['AbStatementStatus'], ParentType, ContextType>;
  verdict?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  version_?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
};

export type AbStatementReadReturnResolvers<ContextType = MyApolloContext, ParentType extends ResolversParentTypes['AbStatementReadReturn'] = ResolversParentTypes['AbStatementReadReturn']> = {
  result?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  status?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
};

export type AuthenticateResponseResolvers<ContextType = MyApolloContext, ParentType extends ResolversParentTypes['AuthenticateResponse'] = ResolversParentTypes['AuthenticateResponse']> = {
  accessExpiresIn?: Resolver<ResolversTypes['Int'], ParentType, ContextType>;
  accessToken?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  refreshExpiresIn?: Resolver<ResolversTypes['Int'], ParentType, ContextType>;
  refreshToken?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
};

export type CompanyResolvers<ContextType = MyApolloContext, ParentType extends ResolversParentTypes['Company'] = ResolversParentTypes['Company']> = {
  extra?: Resolver<Maybe<ResolversTypes['Json']>, ParentType, ContextType>;
  id?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  logo?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  logo_data?: Resolver<Maybe<ResolversTypes['FileData']>, ParentType, ContextType>;
  name?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
};

export interface DateScalarConfig extends GraphQLScalarTypeConfig<ResolversTypes['Date'], any> {
  name: 'Date';
}

export interface DateTimeScalarConfig extends GraphQLScalarTypeConfig<ResolversTypes['DateTime'], any> {
  name: 'DateTime';
}

export interface DecimalScalarConfig extends GraphQLScalarTypeConfig<ResolversTypes['Decimal'], any> {
  name: 'Decimal';
}

export type DeletionBlockerItemResolvers<ContextType = MyApolloContext, ParentType extends ResolversParentTypes['DeletionBlockerItem'] = ResolversParentTypes['DeletionBlockerItem']> = {
  id?: Resolver<ResolversTypes['ID'], ParentType, ContextType>;
  nameI18n?: Resolver<Maybe<ResolversTypes['Json']>, ParentType, ContextType>;
  nameText?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
};

export type DeletionBlockerReasonResolvers<ContextType = MyApolloContext, ParentType extends ResolversParentTypes['DeletionBlockerReason'] = ResolversParentTypes['DeletionBlockerReason']> = {
  hiddenInTenant?: Resolver<Maybe<ResolversTypes['Int']>, ParentType, ContextType>;
  kind?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  otherTenants?: Resolver<Maybe<ResolversTypes['Int']>, ParentType, ContextType>;
  relations?: Resolver<Array<ResolversTypes['String']>, ParentType, ContextType>;
  rootEntity?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  visible?: Resolver<Maybe<ResolversTypes['DeletionBlockerVisible']>, ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
};

export type DeletionBlockerVisibleResolvers<ContextType = MyApolloContext, ParentType extends ResolversParentTypes['DeletionBlockerVisible'] = ResolversParentTypes['DeletionBlockerVisible']> = {
  count?: Resolver<ResolversTypes['Int'], ParentType, ContextType>;
  items?: Resolver<Array<ResolversTypes['DeletionBlockerItem']>, ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
};

export type DeletionBlockersResolvers<ContextType = MyApolloContext, ParentType extends ResolversParentTypes['DeletionBlockers'] = ResolversParentTypes['DeletionBlockers']> = {
  blocked?: Resolver<ResolversTypes['Boolean'], ParentType, ContextType>;
  entity?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  id?: Resolver<ResolversTypes['ID'], ParentType, ContextType>;
  reasons?: Resolver<Array<ResolversTypes['DeletionBlockerReason']>, ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
};

export type EmailVerificationResolvers<ContextType = MyApolloContext, ParentType extends ResolversParentTypes['EmailVerification'] = ResolversParentTypes['EmailVerification']> = {
  createdAt_?: Resolver<ResolversTypes['DateTime'], ParentType, ContextType>;
  createdBy_?: Resolver<ResolversTypes['User'], ParentType, ContextType>;
  displayId?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  email?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  expiresAt?: Resolver<ResolversTypes['DateTime'], ParentType, ContextType>;
  id?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  lastSentAt?: Resolver<Maybe<ResolversTypes['DateTime']>, ParentType, ContextType>;
  lastUpdatedAt_?: Resolver<Maybe<ResolversTypes['DateTime']>, ParentType, ContextType>;
  lastUpdatedBy_?: Resolver<Maybe<ResolversTypes['User']>, ParentType, ContextType>;
  requestedBy?: Resolver<ResolversTypes['User'], ParentType, ContextType>;
  sentAt?: Resolver<Maybe<ResolversTypes['DateTime']>, ParentType, ContextType>;
  sentCount?: Resolver<ResolversTypes['Int'], ParentType, ContextType>;
  sourceEntity?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  sourceRecordId?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  status?: Resolver<ResolversTypes['EmailVerificationStatus'], ParentType, ContextType>;
  validationChanges?: Resolver<Maybe<ResolversTypes['Json']>, ParentType, ContextType>;
  validationSubmittedAt?: Resolver<Maybe<ResolversTypes['DateTime']>, ParentType, ContextType>;
  verifiedAt?: Resolver<Maybe<ResolversTypes['DateTime']>, ParentType, ContextType>;
  version_?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
};

export type FileDataResolvers<ContextType = MyApolloContext, ParentType extends ResolversParentTypes['FileData'] = ResolversParentTypes['FileData']> = {
  description?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  mimetype?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  name?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  size?: Resolver<Maybe<ResolversTypes['Int']>, ParentType, ContextType>;
  thumbnails?: Resolver<Maybe<Array<Maybe<ResolversTypes['Thumbnail']>>>, ParentType, ContextType>;
  url?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
};

export type IdempotencyRecordResolvers<ContextType = MyApolloContext, ParentType extends ResolversParentTypes['IdempotencyRecord'] = ResolversParentTypes['IdempotencyRecord']> = {
  bodyHash?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  client?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  completedAt?: Resolver<Maybe<ResolversTypes['DateTime']>, ParentType, ContextType>;
  createdAt_?: Resolver<ResolversTypes['DateTime'], ParentType, ContextType>;
  createdBy_?: Resolver<ResolversTypes['User'], ParentType, ContextType>;
  displayId?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  failureReason?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  id?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  key?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  lastUpdatedAt_?: Resolver<Maybe<ResolversTypes['DateTime']>, ParentType, ContextType>;
  lastUpdatedBy_?: Resolver<Maybe<ResolversTypes['User']>, ParentType, ContextType>;
  result?: Resolver<Maybe<ResolversTypes['Json']>, ParentType, ContextType>;
  status?: Resolver<ResolversTypes['IdempotencyStatus'], ParentType, ContextType>;
  version_?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
};

export type IntegrationClientResolvers<ContextType = MyApolloContext, ParentType extends ResolversParentTypes['IntegrationClient'] = ResolversParentTypes['IntegrationClient']> = {
  createdAt_?: Resolver<ResolversTypes['DateTime'], ParentType, ContextType>;
  createdBy_?: Resolver<ResolversTypes['User'], ParentType, ContextType>;
  displayId?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  expiresAt?: Resolver<Maybe<ResolversTypes['DateTime']>, ParentType, ContextType>;
  id?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  lastUpdatedAt_?: Resolver<Maybe<ResolversTypes['DateTime']>, ParentType, ContextType>;
  lastUpdatedBy_?: Resolver<Maybe<ResolversTypes['User']>, ParentType, ContextType>;
  name?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  scopes?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  serviceUser?: Resolver<ResolversTypes['User'], ParentType, ContextType>;
  status?: Resolver<ResolversTypes['IntegrationClientStatus'], ParentType, ContextType>;
  tokenHash?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  version_?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
};

export interface JsonScalarConfig extends GraphQLScalarTypeConfig<ResolversTypes['Json'], any> {
  name: 'Json';
}

export type LoginResponseResolvers<ContextType = MyApolloContext, ParentType extends ResolversParentTypes['LoginResponse'] = ResolversParentTypes['LoginResponse']> = {
  accessExpiresIn?: Resolver<Maybe<ResolversTypes['Int']>, ParentType, ContextType>;
  accessToken?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  refreshExpiresIn?: Resolver<Maybe<ResolversTypes['Int']>, ParentType, ContextType>;
  refreshToken?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  tempToken?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  twoFaAction?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  twoFaRequired?: Resolver<ResolversTypes['Boolean'], ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
};

export type MutationResolvers<ContextType = MyApolloContext, ParentType extends ResolversParentTypes['Mutation'] = ResolversParentTypes['Mutation']> = {
  _empty?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  abConceptCorrectionCreate?: Resolver<ResolversTypes['AbConceptCorrection'], ParentType, ContextType, RequireFields<MutationAbConceptCorrectionCreateArgs, 'bankText' | 'canonicalType' | 'review'>>;
  abConceptCorrectionDelete?: Resolver<ResolversTypes['AbConceptCorrection'], ParentType, ContextType, RequireFields<MutationAbConceptCorrectionDeleteArgs, 'id'>>;
  abConceptCorrectionUpdate?: Resolver<ResolversTypes['AbConceptCorrection'], ParentType, ContextType, RequireFields<MutationAbConceptCorrectionUpdateArgs, 'id' | 'version_'>>;
  abDecisionDelete?: Resolver<ResolversTypes['AbDecision'], ParentType, ContextType, RequireFields<MutationAbDecisionDeleteArgs, 'id'>>;
  abPaymentBatchDelete?: Resolver<ResolversTypes['AbPaymentBatch'], ParentType, ContextType, RequireFields<MutationAbPaymentBatchDeleteArgs, 'id'>>;
  abReconciliationDelete?: Resolver<ResolversTypes['AbReconciliation'], ParentType, ContextType, RequireFields<MutationAbReconciliationDeleteArgs, 'id'>>;
  abStatementDelete?: Resolver<ResolversTypes['AbStatement'], ParentType, ContextType, RequireFields<MutationAbStatementDeleteArgs, 'id'>>;
  abStatementRead?: Resolver<ResolversTypes['AbStatementReadReturn'], ParentType, ContextType, RequireFields<MutationAbStatementReadArgs, 'statementId'>>;
  archiveNotification?: Resolver<ResolversTypes['UserNotificationResult'], ParentType, ContextType, RequireFields<MutationArchiveNotificationArgs, 'id'>>;
  botRunCancel?: Resolver<ResolversTypes['String'], ParentType, ContextType, RequireFields<MutationBotRunCancelArgs, 'botRunId'>>;
  broadcastMaintenance?: Resolver<ResolversTypes['Int'], ParentType, ContextType, RequireFields<MutationBroadcastMaintenanceArgs, 'active'>>;
  confirmTwoFaSetup?: Resolver<ResolversTypes['AuthenticateResponse'], ParentType, ContextType, RequireFields<MutationConfirmTwoFaSetupArgs, 'code' | 'tempToken'>>;
  deleteUploadedFile?: Resolver<ResolversTypes['String'], ParentType, ContextType, RequireFields<MutationDeleteUploadedFileArgs, 'ticket'>>;
  emailVerificationCreate?: Resolver<ResolversTypes['EmailVerification'], ParentType, ContextType, RequireFields<MutationEmailVerificationCreateArgs, 'email'>>;
  emailVerificationDelete?: Resolver<ResolversTypes['EmailVerification'], ParentType, ContextType, RequireFields<MutationEmailVerificationDeleteArgs, 'id'>>;
  emailVerificationUpdate?: Resolver<ResolversTypes['EmailVerification'], ParentType, ContextType, RequireFields<MutationEmailVerificationUpdateArgs, 'id' | 'version_'>>;
  idempotencyRecordDelete?: Resolver<ResolversTypes['IdempotencyRecord'], ParentType, ContextType, RequireFields<MutationIdempotencyRecordDeleteArgs, 'id'>>;
  integrationClientCreate?: Resolver<ResolversTypes['IntegrationClient'], ParentType, ContextType, RequireFields<MutationIntegrationClientCreateArgs, 'name' | 'scopes' | 'serviceUserId' | 'status' | 'tokenHash'>>;
  integrationClientDelete?: Resolver<ResolversTypes['IntegrationClient'], ParentType, ContextType, RequireFields<MutationIntegrationClientDeleteArgs, 'id'>>;
  integrationClientUpdate?: Resolver<ResolversTypes['IntegrationClient'], ParentType, ContextType, RequireFields<MutationIntegrationClientUpdateArgs, 'id' | 'version_'>>;
  login?: Resolver<ResolversTypes['LoginResponse'], ParentType, ContextType, RequireFields<MutationLoginArgs, 'email' | 'password'>>;
  logout?: Resolver<ResolversTypes['Boolean'], ParentType, ContextType>;
  markAllNotificationsRead?: Resolver<ResolversTypes['Int'], ParentType, ContextType>;
  markNotificationRead?: Resolver<ResolversTypes['UserNotificationResult'], ParentType, ContextType, RequireFields<MutationMarkNotificationReadArgs, 'id'>>;
  permissionCreate?: Resolver<ResolversTypes['Permission'], ParentType, ContextType, RequireFields<MutationPermissionCreateArgs, 'name'>>;
  permissionDelete?: Resolver<ResolversTypes['Permission'], ParentType, ContextType, RequireFields<MutationPermissionDeleteArgs, 'id'>>;
  permissionUpdate?: Resolver<ResolversTypes['Permission'], ParentType, ContextType, RequireFields<MutationPermissionUpdateArgs, 'id' | 'version_'>>;
  refreshToken?: Resolver<ResolversTypes['AuthenticateResponse'], ParentType, ContextType, RequireFields<MutationRefreshTokenArgs, 'refreshToken'>>;
  revokeAllTokens?: Resolver<ResolversTypes['Boolean'], ParentType, ContextType>;
  revokeAllTrustedDevices?: Resolver<ResolversTypes['Boolean'], ParentType, ContextType>;
  revokeTrustedDevice?: Resolver<ResolversTypes['Boolean'], ParentType, ContextType, RequireFields<MutationRevokeTrustedDeviceArgs, 'id'>>;
  roleCreate?: Resolver<ResolversTypes['Role'], ParentType, ContextType, RequireFields<MutationRoleCreateArgs, 'isForAllTenants' | 'name'>>;
  roleDelete?: Resolver<ResolversTypes['Role'], ParentType, ContextType, RequireFields<MutationRoleDeleteArgs, 'id'>>;
  roleUpdate?: Resolver<ResolversTypes['Role'], ParentType, ContextType, RequireFields<MutationRoleUpdateArgs, 'id' | 'version_'>>;
  saveProfile?: Resolver<ResolversTypes['Boolean'], ParentType, ContextType, RequireFields<MutationSaveProfileArgs, 'key' | 'value'>>;
  setMyLanguage?: Resolver<ResolversTypes['User'], ParentType, ContextType, RequireFields<MutationSetMyLanguageArgs, 'language'>>;
  setupTwoFa?: Resolver<ResolversTypes['TwoFaSetupResponse'], ParentType, ContextType, RequireFields<MutationSetupTwoFaArgs, 'tempToken'>>;
  singleUpload?: Resolver<ResolversTypes['UploadedFileData'], ParentType, ContextType, RequireFields<MutationSingleUploadArgs, 'file'>>;
  tenantCreate?: Resolver<ResolversTypes['Tenant'], ParentType, ContextType, RequireFields<MutationTenantCreateArgs, 'ivaCondition' | 'name' | 'status' | 'withholdingAgent'>>;
  tenantDelete?: Resolver<ResolversTypes['Tenant'], ParentType, ContextType, RequireFields<MutationTenantDeleteArgs, 'id'>>;
  tenantUpdate?: Resolver<ResolversTypes['Tenant'], ParentType, ContextType, RequireFields<MutationTenantUpdateArgs, 'id' | 'version_'>>;
  updateMyAvatar?: Resolver<ResolversTypes['User'], ParentType, ContextType, Partial<MutationUpdateMyAvatarArgs>>;
  userChangePassword?: Resolver<ResolversTypes['User'], ParentType, ContextType, RequireFields<MutationUserChangePasswordArgs, 'newPassword' | 'oldPassword'>>;
  userCreate?: Resolver<ResolversTypes['User'], ParentType, ContextType, RequireFields<MutationUserCreateArgs, 'active' | 'email' | 'language' | 'name'>>;
  userDelete?: Resolver<ResolversTypes['User'], ParentType, ContextType, RequireFields<MutationUserDeleteArgs, 'id'>>;
  userNotificationDelete?: Resolver<ResolversTypes['UserNotification'], ParentType, ContextType, RequireFields<MutationUserNotificationDeleteArgs, 'id'>>;
  userNotificationPreferenceCreate?: Resolver<ResolversTypes['UserNotificationPreference'], ParentType, ContextType, RequireFields<MutationUserNotificationPreferenceCreateArgs, 'emailEnabled' | 'emailFrequency' | 'inAppEnabled' | 'notificationType'>>;
  userNotificationPreferenceDelete?: Resolver<ResolversTypes['UserNotificationPreference'], ParentType, ContextType, RequireFields<MutationUserNotificationPreferenceDeleteArgs, 'id'>>;
  userNotificationPreferenceUpdate?: Resolver<ResolversTypes['UserNotificationPreference'], ParentType, ContextType, RequireFields<MutationUserNotificationPreferenceUpdateArgs, 'id' | 'version_'>>;
  userResetPassword?: Resolver<ResolversTypes['User'], ParentType, ContextType, RequireFields<MutationUserResetPasswordArgs, 'email'>>;
  userUpdate?: Resolver<ResolversTypes['User'], ParentType, ContextType, RequireFields<MutationUserUpdateArgs, 'id' | 'version_'>>;
  verifyTwoFa?: Resolver<ResolversTypes['AuthenticateResponse'], ParentType, ContextType, RequireFields<MutationVerifyTwoFaArgs, 'code' | 'tempToken'>>;
  verifyTwoFaBackupCode?: Resolver<ResolversTypes['AuthenticateResponse'], ParentType, ContextType, RequireFields<MutationVerifyTwoFaBackupCodeArgs, 'code' | 'tempToken'>>;
  workerEventDelete?: Resolver<ResolversTypes['WorkerEvent'], ParentType, ContextType, RequireFields<MutationWorkerEventDeleteArgs, 'id'>>;
  workerEventRetry?: Resolver<ResolversTypes['WorkerEventRetryResult'], ParentType, ContextType, RequireFields<MutationWorkerEventRetryArgs, 'id'>>;
};

export type NotificationActorUserResolvers<ContextType = MyApolloContext, ParentType extends ResolversParentTypes['NotificationActorUser'] = ResolversParentTypes['NotificationActorUser']> = {
  email?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  id?: Resolver<ResolversTypes['ID'], ParentType, ContextType>;
  name?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
};

export type NotificationConnectionResolvers<ContextType = MyApolloContext, ParentType extends ResolversParentTypes['NotificationConnection'] = ResolversParentTypes['NotificationConnection']> = {
  hasMore?: Resolver<ResolversTypes['Boolean'], ParentType, ContextType>;
  notifications?: Resolver<Array<ResolversTypes['UserNotificationItem']>, ParentType, ContextType>;
  totalCount?: Resolver<ResolversTypes['Int'], ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
};

export type PermissionResolvers<ContextType = MyApolloContext, ParentType extends ResolversParentTypes['Permission'] = ResolversParentTypes['Permission']> = {
  createdAt_?: Resolver<ResolversTypes['DateTime'], ParentType, ContextType>;
  createdBy_?: Resolver<ResolversTypes['User'], ParentType, ContextType>;
  displayId?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  id?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  lastUpdatedAt_?: Resolver<Maybe<ResolversTypes['DateTime']>, ParentType, ContextType>;
  lastUpdatedBy_?: Resolver<Maybe<ResolversTypes['User']>, ParentType, ContextType>;
  name?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  version_?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
};

export type QueryResolvers<ContextType = MyApolloContext, ParentType extends ResolversParentTypes['Query'] = ResolversParentTypes['Query']> = {
  _empty?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  abConceptCorrectionListWithCursor?: Resolver<Array<Maybe<ResolversTypes['AbConceptCorrection']>>, ParentType, ContextType, RequireFields<QueryAbConceptCorrectionListWithCursorArgs, 'orderBy' | 'take'>>;
  abConceptCorrectionListWithOffset?: Resolver<Array<Maybe<ResolversTypes['AbConceptCorrection']>>, ParentType, ContextType, RequireFields<QueryAbConceptCorrectionListWithOffsetArgs, 'offset' | 'take'>>;
  abConceptCorrectionOne?: Resolver<ResolversTypes['AbConceptCorrection'], ParentType, ContextType, RequireFields<QueryAbConceptCorrectionOneArgs, 'id'>>;
  abDecisionListWithCursor?: Resolver<Array<Maybe<ResolversTypes['AbDecision']>>, ParentType, ContextType, RequireFields<QueryAbDecisionListWithCursorArgs, 'orderBy' | 'take'>>;
  abDecisionListWithOffset?: Resolver<Array<Maybe<ResolversTypes['AbDecision']>>, ParentType, ContextType, RequireFields<QueryAbDecisionListWithOffsetArgs, 'offset' | 'take'>>;
  abDecisionOne?: Resolver<ResolversTypes['AbDecision'], ParentType, ContextType, RequireFields<QueryAbDecisionOneArgs, 'id'>>;
  abPaymentBatchListWithCursor?: Resolver<Array<Maybe<ResolversTypes['AbPaymentBatch']>>, ParentType, ContextType, RequireFields<QueryAbPaymentBatchListWithCursorArgs, 'orderBy' | 'take'>>;
  abPaymentBatchListWithOffset?: Resolver<Array<Maybe<ResolversTypes['AbPaymentBatch']>>, ParentType, ContextType, RequireFields<QueryAbPaymentBatchListWithOffsetArgs, 'offset' | 'take'>>;
  abPaymentBatchOne?: Resolver<ResolversTypes['AbPaymentBatch'], ParentType, ContextType, RequireFields<QueryAbPaymentBatchOneArgs, 'id'>>;
  abReconciliationListWithCursor?: Resolver<Array<Maybe<ResolversTypes['AbReconciliation']>>, ParentType, ContextType, RequireFields<QueryAbReconciliationListWithCursorArgs, 'orderBy' | 'take'>>;
  abReconciliationListWithOffset?: Resolver<Array<Maybe<ResolversTypes['AbReconciliation']>>, ParentType, ContextType, RequireFields<QueryAbReconciliationListWithOffsetArgs, 'offset' | 'take'>>;
  abReconciliationOne?: Resolver<ResolversTypes['AbReconciliation'], ParentType, ContextType, RequireFields<QueryAbReconciliationOneArgs, 'id'>>;
  abStatementListWithCursor?: Resolver<Array<Maybe<ResolversTypes['AbStatement']>>, ParentType, ContextType, RequireFields<QueryAbStatementListWithCursorArgs, 'orderBy' | 'take'>>;
  abStatementListWithOffset?: Resolver<Array<Maybe<ResolversTypes['AbStatement']>>, ParentType, ContextType, RequireFields<QueryAbStatementListWithOffsetArgs, 'offset' | 'take'>>;
  abStatementOne?: Resolver<ResolversTypes['AbStatement'], ParentType, ContextType, RequireFields<QueryAbStatementOneArgs, 'id'>>;
  deletionBlockers?: Resolver<ResolversTypes['DeletionBlockers'], ParentType, ContextType, RequireFields<QueryDeletionBlockersArgs, 'entity' | 'id'>>;
  emailVerificationListWithCursor?: Resolver<Array<Maybe<ResolversTypes['EmailVerification']>>, ParentType, ContextType, RequireFields<QueryEmailVerificationListWithCursorArgs, 'orderBy' | 'take'>>;
  emailVerificationListWithOffset?: Resolver<Array<Maybe<ResolversTypes['EmailVerification']>>, ParentType, ContextType, RequireFields<QueryEmailVerificationListWithOffsetArgs, 'offset' | 'take'>>;
  emailVerificationOne?: Resolver<ResolversTypes['EmailVerification'], ParentType, ContextType, RequireFields<QueryEmailVerificationOneArgs, 'id'>>;
  idempotencyRecordListWithCursor?: Resolver<Array<Maybe<ResolversTypes['IdempotencyRecord']>>, ParentType, ContextType, RequireFields<QueryIdempotencyRecordListWithCursorArgs, 'orderBy' | 'take'>>;
  idempotencyRecordListWithOffset?: Resolver<Array<Maybe<ResolversTypes['IdempotencyRecord']>>, ParentType, ContextType, RequireFields<QueryIdempotencyRecordListWithOffsetArgs, 'offset' | 'take'>>;
  idempotencyRecordOne?: Resolver<ResolversTypes['IdempotencyRecord'], ParentType, ContextType, RequireFields<QueryIdempotencyRecordOneArgs, 'id'>>;
  integrationClientListWithCursor?: Resolver<Array<Maybe<ResolversTypes['IntegrationClient']>>, ParentType, ContextType, RequireFields<QueryIntegrationClientListWithCursorArgs, 'orderBy' | 'take'>>;
  integrationClientListWithOffset?: Resolver<Array<Maybe<ResolversTypes['IntegrationClient']>>, ParentType, ContextType, RequireFields<QueryIntegrationClientListWithOffsetArgs, 'offset' | 'take'>>;
  integrationClientOne?: Resolver<ResolversTypes['IntegrationClient'], ParentType, ContextType, RequireFields<QueryIntegrationClientOneArgs, 'id'>>;
  me?: Resolver<ResolversTypes['User'], ParentType, ContextType>;
  myNotifications?: Resolver<ResolversTypes['NotificationConnection'], ParentType, ContextType, Partial<QueryMyNotificationsArgs>>;
  mySessions?: Resolver<Array<ResolversTypes['SessionInfo']>, ParentType, ContextType>;
  myTrustedDevices?: Resolver<Array<ResolversTypes['TrustedDeviceInfo']>, ParentType, ContextType>;
  permissionListWithCursor?: Resolver<Array<Maybe<ResolversTypes['Permission']>>, ParentType, ContextType, RequireFields<QueryPermissionListWithCursorArgs, 'orderBy' | 'take'>>;
  permissionListWithOffset?: Resolver<Array<Maybe<ResolversTypes['Permission']>>, ParentType, ContextType, RequireFields<QueryPermissionListWithOffsetArgs, 'offset' | 'take'>>;
  permissionOne?: Resolver<ResolversTypes['Permission'], ParentType, ContextType, RequireFields<QueryPermissionOneArgs, 'id'>>;
  roleListWithCursor?: Resolver<Array<Maybe<ResolversTypes['Role']>>, ParentType, ContextType, RequireFields<QueryRoleListWithCursorArgs, 'orderBy' | 'take'>>;
  roleListWithOffset?: Resolver<Array<Maybe<ResolversTypes['Role']>>, ParentType, ContextType, RequireFields<QueryRoleListWithOffsetArgs, 'offset' | 'take'>>;
  roleOne?: Resolver<ResolversTypes['Role'], ParentType, ContextType, RequireFields<QueryRoleOneArgs, 'id'>>;
  tenantListWithCursor?: Resolver<Array<Maybe<ResolversTypes['Tenant']>>, ParentType, ContextType, RequireFields<QueryTenantListWithCursorArgs, 'orderBy' | 'take'>>;
  tenantListWithOffset?: Resolver<Array<Maybe<ResolversTypes['Tenant']>>, ParentType, ContextType, RequireFields<QueryTenantListWithOffsetArgs, 'offset' | 'take'>>;
  tenantOne?: Resolver<ResolversTypes['Tenant'], ParentType, ContextType, RequireFields<QueryTenantOneArgs, 'id'>>;
  unreadNotificationCount?: Resolver<ResolversTypes['Int'], ParentType, ContextType>;
  userListWithCursor?: Resolver<Array<Maybe<ResolversTypes['User']>>, ParentType, ContextType, RequireFields<QueryUserListWithCursorArgs, 'orderBy' | 'take'>>;
  userListWithOffset?: Resolver<Array<Maybe<ResolversTypes['User']>>, ParentType, ContextType, RequireFields<QueryUserListWithOffsetArgs, 'offset' | 'take'>>;
  userNotificationListWithCursor?: Resolver<Array<Maybe<ResolversTypes['UserNotification']>>, ParentType, ContextType, RequireFields<QueryUserNotificationListWithCursorArgs, 'orderBy' | 'take'>>;
  userNotificationListWithOffset?: Resolver<Array<Maybe<ResolversTypes['UserNotification']>>, ParentType, ContextType, RequireFields<QueryUserNotificationListWithOffsetArgs, 'offset' | 'take'>>;
  userNotificationOne?: Resolver<ResolversTypes['UserNotification'], ParentType, ContextType, RequireFields<QueryUserNotificationOneArgs, 'id'>>;
  userNotificationPreferenceListWithCursor?: Resolver<Array<Maybe<ResolversTypes['UserNotificationPreference']>>, ParentType, ContextType, RequireFields<QueryUserNotificationPreferenceListWithCursorArgs, 'orderBy' | 'take'>>;
  userNotificationPreferenceListWithOffset?: Resolver<Array<Maybe<ResolversTypes['UserNotificationPreference']>>, ParentType, ContextType, RequireFields<QueryUserNotificationPreferenceListWithOffsetArgs, 'offset' | 'take'>>;
  userNotificationPreferenceOne?: Resolver<ResolversTypes['UserNotificationPreference'], ParentType, ContextType, RequireFields<QueryUserNotificationPreferenceOneArgs, 'id'>>;
  userOne?: Resolver<ResolversTypes['User'], ParentType, ContextType, RequireFields<QueryUserOneArgs, 'id'>>;
  workerEventListWithCursor?: Resolver<Array<Maybe<ResolversTypes['WorkerEvent']>>, ParentType, ContextType, RequireFields<QueryWorkerEventListWithCursorArgs, 'orderBy' | 'take'>>;
  workerEventListWithOffset?: Resolver<Array<Maybe<ResolversTypes['WorkerEvent']>>, ParentType, ContextType, RequireFields<QueryWorkerEventListWithOffsetArgs, 'offset' | 'take'>>;
  workerEventOne?: Resolver<ResolversTypes['WorkerEvent'], ParentType, ContextType, RequireFields<QueryWorkerEventOneArgs, 'id'>>;
  workerEventRetryInfo?: Resolver<ResolversTypes['WorkerEventRetryInfo'], ParentType, ContextType, RequireFields<QueryWorkerEventRetryInfoArgs, 'id'>>;
};

export type RoleResolvers<ContextType = MyApolloContext, ParentType extends ResolversParentTypes['Role'] = ResolversParentTypes['Role']> = {
  createdAt_?: Resolver<ResolversTypes['DateTime'], ParentType, ContextType>;
  createdBy_?: Resolver<ResolversTypes['User'], ParentType, ContextType>;
  displayId?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  id?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  isForAllTenants?: Resolver<ResolversTypes['Boolean'], ParentType, ContextType>;
  lastUpdatedAt_?: Resolver<Maybe<ResolversTypes['DateTime']>, ParentType, ContextType>;
  lastUpdatedBy_?: Resolver<Maybe<ResolversTypes['User']>, ParentType, ContextType>;
  name?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  permissions?: Resolver<Maybe<Array<ResolversTypes['Permission']>>, ParentType, ContextType>;
  version_?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
};

export type SessionInfoResolvers<ContextType = MyApolloContext, ParentType extends ResolversParentTypes['SessionInfo'] = ResolversParentTypes['SessionInfo']> = {
  browserName?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  browserVersion?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  createdAt?: Resolver<ResolversTypes['DateTime'], ParentType, ContextType>;
  deviceType?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  expiresAt?: Resolver<ResolversTypes['DateTime'], ParentType, ContextType>;
  id?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  ipAddress?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  lastUsedAt?: Resolver<Maybe<ResolversTypes['DateTime']>, ParentType, ContextType>;
  osName?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
};

export type SimulationControlResultResolvers<ContextType = MyApolloContext, ParentType extends ResolversParentTypes['SimulationControlResult'] = ResolversParentTypes['SimulationControlResult']> = {
  ok?: Resolver<ResolversTypes['Boolean'], ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
};

export type SimulationResetResultResolvers<ContextType = MyApolloContext, ParentType extends ResolversParentTypes['SimulationResetResult'] = ResolversParentTypes['SimulationResetResult']> = {
  ok?: Resolver<ResolversTypes['Boolean'], ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
};

export type SimulationStartResultResolvers<ContextType = MyApolloContext, ParentType extends ResolversParentTypes['SimulationStartResult'] = ResolversParentTypes['SimulationStartResult']> = {
  sessionId?: Resolver<ResolversTypes['ID'], ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
};

export type TenantResolvers<ContextType = MyApolloContext, ParentType extends ResolversParentTypes['Tenant'] = ResolversParentTypes['Tenant']> = {
  createdAt_?: Resolver<ResolversTypes['DateTime'], ParentType, ContextType>;
  createdBy_?: Resolver<ResolversTypes['User'], ParentType, ContextType>;
  displayId?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  grossReceiptsJurisdiction?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  id?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  imputationMinConfidence?: Resolver<Maybe<ResolversTypes['Int']>, ParentType, ContextType>;
  ivaCondition?: Resolver<ResolversTypes['TenantIvaCondition'], ParentType, ContextType>;
  lastUpdatedAt_?: Resolver<Maybe<ResolversTypes['DateTime']>, ParentType, ContextType>;
  lastUpdatedBy_?: Resolver<Maybe<ResolversTypes['User']>, ParentType, ContextType>;
  logo?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  logo_data?: Resolver<Maybe<ResolversTypes['FileData']>, ParentType, ContextType>;
  name?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  status?: Resolver<ResolversTypes['TenantStatus'], ParentType, ContextType>;
  taxId?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  version_?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  withholdingAgent?: Resolver<ResolversTypes['Boolean'], ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
};

export type ThumbnailResolvers<ContextType = MyApolloContext, ParentType extends ResolversParentTypes['Thumbnail'] = ResolversParentTypes['Thumbnail']> = {
  size?: Resolver<ResolversTypes['ThumbnailSize'], ParentType, ContextType>;
  url?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
};

export type TrustedDeviceInfoResolvers<ContextType = MyApolloContext, ParentType extends ResolversParentTypes['TrustedDeviceInfo'] = ResolversParentTypes['TrustedDeviceInfo']> = {
  browserName?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  browserVersion?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  createdAt?: Resolver<ResolversTypes['DateTime'], ParentType, ContextType>;
  deviceType?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  expiresAt?: Resolver<ResolversTypes['DateTime'], ParentType, ContextType>;
  id?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  ipAddress?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  lastUsedAt?: Resolver<Maybe<ResolversTypes['DateTime']>, ParentType, ContextType>;
  osName?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
};

export type TwoFaSetupResponseResolvers<ContextType = MyApolloContext, ParentType extends ResolversParentTypes['TwoFaSetupResponse'] = ResolversParentTypes['TwoFaSetupResponse']> = {
  backupCodes?: Resolver<Array<ResolversTypes['String']>, ParentType, ContextType>;
  qrCodeDataUrl?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  secret?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
};

export interface UploadScalarConfig extends GraphQLScalarTypeConfig<ResolversTypes['Upload'], any> {
  name: 'Upload';
}

export type UploadedFileDataResolvers<ContextType = MyApolloContext, ParentType extends ResolversParentTypes['UploadedFileData'] = ResolversParentTypes['UploadedFileData']> = {
  encoding?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  filename?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  mimetype?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  size?: Resolver<ResolversTypes['Int'], ParentType, ContextType>;
  ticket?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
};

export type UserResolvers<ContextType = MyApolloContext, ParentType extends ResolversParentTypes['User'] = ResolversParentTypes['User']> = {
  active?: Resolver<ResolversTypes['Boolean'], ParentType, ContextType>;
  avatar?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  avatar_data?: Resolver<Maybe<ResolversTypes['FileData']>, ParentType, ContextType>;
  cellphone?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  company?: Resolver<Maybe<ResolversTypes['Company']>, ParentType, ContextType>;
  createdAt_?: Resolver<ResolversTypes['DateTime'], ParentType, ContextType>;
  createdBy_?: Resolver<ResolversTypes['User'], ParentType, ContextType>;
  displayId?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  email?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  id?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  language?: Resolver<ResolversTypes['Language'], ParentType, ContextType>;
  lastUpdatedAt_?: Resolver<Maybe<ResolversTypes['DateTime']>, ParentType, ContextType>;
  lastUpdatedBy_?: Resolver<Maybe<ResolversTypes['User']>, ParentType, ContextType>;
  name?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  profile?: Resolver<Maybe<ResolversTypes['Json']>, ParentType, ContextType>;
  role?: Resolver<Maybe<ResolversTypes['Role']>, ParentType, ContextType>;
  targetTenant?: Resolver<Maybe<ResolversTypes['Tenant']>, ParentType, ContextType>;
  tenantDisplayName?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  tenant_id_?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  twoFaseAuth?: Resolver<Maybe<ResolversTypes['Boolean']>, ParentType, ContextType>;
  version_?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
};

export type UserNotificationResolvers<ContextType = MyApolloContext, ParentType extends ResolversParentTypes['UserNotification'] = ResolversParentTypes['UserNotification']> = {
  actionUrl?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  actorUser?: Resolver<Maybe<ResolversTypes['User']>, ParentType, ContextType>;
  archivedAt?: Resolver<Maybe<ResolversTypes['DateTime']>, ParentType, ContextType>;
  body?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  createdAt_?: Resolver<ResolversTypes['DateTime'], ParentType, ContextType>;
  createdBy_?: Resolver<ResolversTypes['User'], ParentType, ContextType>;
  displayId?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  id?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  lastUpdatedAt_?: Resolver<Maybe<ResolversTypes['DateTime']>, ParentType, ContextType>;
  lastUpdatedBy_?: Resolver<Maybe<ResolversTypes['User']>, ParentType, ContextType>;
  metadata?: Resolver<Maybe<ResolversTypes['Json']>, ParentType, ContextType>;
  notificationCreatedAt?: Resolver<Maybe<ResolversTypes['DateTime']>, ParentType, ContextType>;
  objectId?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  objectType?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  priority?: Resolver<Maybe<ResolversTypes['NotificationPriority']>, ParentType, ContextType>;
  readAt?: Resolver<Maybe<ResolversTypes['DateTime']>, ParentType, ContextType>;
  title?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  type?: Resolver<ResolversTypes['NotificationType'], ParentType, ContextType>;
  version_?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
};

export type UserNotificationItemResolvers<ContextType = MyApolloContext, ParentType extends ResolversParentTypes['UserNotificationItem'] = ResolversParentTypes['UserNotificationItem']> = {
  actionUrl?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  actorUser?: Resolver<Maybe<ResolversTypes['NotificationActorUser']>, ParentType, ContextType>;
  archivedAt?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  body?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  createdAt?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  id?: Resolver<ResolversTypes['ID'], ParentType, ContextType>;
  objectId?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  objectType?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  priority?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  readAt?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  title?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  type?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
};

export type UserNotificationPreferenceResolvers<ContextType = MyApolloContext, ParentType extends ResolversParentTypes['UserNotificationPreference'] = ResolversParentTypes['UserNotificationPreference']> = {
  createdAt_?: Resolver<ResolversTypes['DateTime'], ParentType, ContextType>;
  createdBy_?: Resolver<ResolversTypes['User'], ParentType, ContextType>;
  displayId?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  emailEnabled?: Resolver<ResolversTypes['Boolean'], ParentType, ContextType>;
  emailFrequency?: Resolver<ResolversTypes['EmailFrequency'], ParentType, ContextType>;
  id?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  inAppEnabled?: Resolver<ResolversTypes['Boolean'], ParentType, ContextType>;
  lastUpdatedAt_?: Resolver<Maybe<ResolversTypes['DateTime']>, ParentType, ContextType>;
  lastUpdatedBy_?: Resolver<Maybe<ResolversTypes['User']>, ParentType, ContextType>;
  notificationType?: Resolver<ResolversTypes['NotificationType'], ParentType, ContextType>;
  version_?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
};

export type UserNotificationResultResolvers<ContextType = MyApolloContext, ParentType extends ResolversParentTypes['UserNotificationResult'] = ResolversParentTypes['UserNotificationResult']> = {
  error?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  notification?: Resolver<Maybe<ResolversTypes['UserNotificationItem']>, ParentType, ContextType>;
  success?: Resolver<ResolversTypes['Boolean'], ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
};

export type WorkerEventResolvers<ContextType = MyApolloContext, ParentType extends ResolversParentTypes['WorkerEvent'] = ResolversParentTypes['WorkerEvent']> = {
  completedAt?: Resolver<Maybe<ResolversTypes['DateTime']>, ParentType, ContextType>;
  correlationId?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  createdAt_?: Resolver<ResolversTypes['DateTime'], ParentType, ContextType>;
  createdBy_?: Resolver<ResolversTypes['User'], ParentType, ContextType>;
  displayId?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  duration?: Resolver<Maybe<ResolversTypes['Int']>, ParentType, ContextType>;
  enqueuedAt?: Resolver<ResolversTypes['DateTime'], ParentType, ContextType>;
  error?: Resolver<Maybe<ResolversTypes['Json']>, ParentType, ContextType>;
  id?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  jobType?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  lastUpdatedAt_?: Resolver<Maybe<ResolversTypes['DateTime']>, ParentType, ContextType>;
  lastUpdatedBy_?: Resolver<Maybe<ResolversTypes['User']>, ParentType, ContextType>;
  manualRetryCount?: Resolver<ResolversTypes['Int'], ParentType, ContextType>;
  nextRetryAt?: Resolver<Maybe<ResolversTypes['DateTime']>, ParentType, ContextType>;
  payload?: Resolver<ResolversTypes['Json'], ParentType, ContextType>;
  queueName?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  result?: Resolver<Maybe<ResolversTypes['Json']>, ParentType, ContextType>;
  retryCount?: Resolver<ResolversTypes['Int'], ParentType, ContextType>;
  startedAt?: Resolver<Maybe<ResolversTypes['DateTime']>, ParentType, ContextType>;
  status?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  tenant_id_?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  triggerUserId?: Resolver<ResolversTypes['User'], ParentType, ContextType>;
  version_?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
};

export type WorkerEventRetryInfoResolvers<ContextType = MyApolloContext, ParentType extends ResolversParentTypes['WorkerEventRetryInfo'] = ResolversParentTypes['WorkerEventRetryInfo']> = {
  canRetry?: Resolver<ResolversTypes['Boolean'], ParentType, ContextType>;
  currentValues?: Resolver<Maybe<ResolversTypes['Json']>, ParentType, ContextType>;
  editableFields?: Resolver<Array<ResolversTypes['String']>, ParentType, ContextType>;
  modes?: Resolver<Array<ResolversTypes['String']>, ParentType, ContextType>;
  reason?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
};

export type WorkerEventRetryResultResolvers<ContextType = MyApolloContext, ParentType extends ResolversParentTypes['WorkerEventRetryResult'] = ResolversParentTypes['WorkerEventRetryResult']> = {
  newWorkerEventId?: Resolver<ResolversTypes['ID'], ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
};

export type Resolvers<ContextType = MyApolloContext> = {
  AbConceptCorrection?: AbConceptCorrectionResolvers<ContextType>;
  AbDecision?: AbDecisionResolvers<ContextType>;
  AbPaymentBatch?: AbPaymentBatchResolvers<ContextType>;
  AbReconciliation?: AbReconciliationResolvers<ContextType>;
  AbStatement?: AbStatementResolvers<ContextType>;
  AbStatementReadReturn?: AbStatementReadReturnResolvers<ContextType>;
  AuthenticateResponse?: AuthenticateResponseResolvers<ContextType>;
  Company?: CompanyResolvers<ContextType>;
  Date?: GraphQLScalarType;
  DateTime?: GraphQLScalarType;
  Decimal?: GraphQLScalarType;
  DeletionBlockerItem?: DeletionBlockerItemResolvers<ContextType>;
  DeletionBlockerReason?: DeletionBlockerReasonResolvers<ContextType>;
  DeletionBlockerVisible?: DeletionBlockerVisibleResolvers<ContextType>;
  DeletionBlockers?: DeletionBlockersResolvers<ContextType>;
  EmailVerification?: EmailVerificationResolvers<ContextType>;
  FileData?: FileDataResolvers<ContextType>;
  IdempotencyRecord?: IdempotencyRecordResolvers<ContextType>;
  IntegrationClient?: IntegrationClientResolvers<ContextType>;
  Json?: GraphQLScalarType;
  LoginResponse?: LoginResponseResolvers<ContextType>;
  Mutation?: MutationResolvers<ContextType>;
  NotificationActorUser?: NotificationActorUserResolvers<ContextType>;
  NotificationConnection?: NotificationConnectionResolvers<ContextType>;
  Permission?: PermissionResolvers<ContextType>;
  Query?: QueryResolvers<ContextType>;
  Role?: RoleResolvers<ContextType>;
  SessionInfo?: SessionInfoResolvers<ContextType>;
  SimulationControlResult?: SimulationControlResultResolvers<ContextType>;
  SimulationResetResult?: SimulationResetResultResolvers<ContextType>;
  SimulationStartResult?: SimulationStartResultResolvers<ContextType>;
  Tenant?: TenantResolvers<ContextType>;
  Thumbnail?: ThumbnailResolvers<ContextType>;
  TrustedDeviceInfo?: TrustedDeviceInfoResolvers<ContextType>;
  TwoFaSetupResponse?: TwoFaSetupResponseResolvers<ContextType>;
  Upload?: GraphQLScalarType;
  UploadedFileData?: UploadedFileDataResolvers<ContextType>;
  User?: UserResolvers<ContextType>;
  UserNotification?: UserNotificationResolvers<ContextType>;
  UserNotificationItem?: UserNotificationItemResolvers<ContextType>;
  UserNotificationPreference?: UserNotificationPreferenceResolvers<ContextType>;
  UserNotificationResult?: UserNotificationResultResolvers<ContextType>;
  WorkerEvent?: WorkerEventResolvers<ContextType>;
  WorkerEventRetryInfo?: WorkerEventRetryInfoResolvers<ContextType>;
  WorkerEventRetryResult?: WorkerEventRetryResultResolvers<ContextType>;
};

export type DirectiveResolvers<ContextType = MyApolloContext> = {
  auth?: AuthDirectiveResolver<any, any, ContextType>;
};
