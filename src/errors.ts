import { BaseCredentialStatusManager } from './credential-status-manager-base.js';

interface BaseErrorOptions {
  statusManager?: BaseCredentialStatusManager;
  message: string;
}

interface ChildErrorOptions {
  statusManager?: BaseCredentialStatusManager;
  message?: string;
  defaultMessage: string;
  label: string;
}

interface CustomErrorOptions {
  statusManager?: BaseCredentialStatusManager;
  message?: string;
}

class BaseError extends Error {
  public statusManager: BaseCredentialStatusManager | undefined;
  public message: string;

  constructor(options: BaseErrorOptions) {
    const { statusManager, message } = options;
    super(message);
    this.statusManager = statusManager;
    this.message = message;
  }
}

class ChildError extends BaseError {
  constructor(options: ChildErrorOptions) {
    const { statusManager, defaultMessage, label } = options;
    const message = `[${label}] ${options?.message ?? defaultMessage}`;
    super({ statusManager, message });
  }
}

export class BadRequestError extends ChildError {
  constructor(options?: CustomErrorOptions) {
    const { statusManager, message } = options ?? {};
    const defaultMessage = 'That is an invalid request.';
    const label = 'BadRequestError';
    super({ statusManager, message, defaultMessage, label });
  }
}

export class NotFoundError extends ChildError {
  constructor(options?: CustomErrorOptions) {
    const { statusManager, message } = options ?? {};
    const defaultMessage = 'Resource not found.';
    const label = 'NotFoundError';
    super({ statusManager, message, defaultMessage, label });
  }
}

export class InvalidDidSeedError extends ChildError {
  constructor(options?: CustomErrorOptions) {
    const { statusManager, message } = options ?? {};
    const defaultMessage = '"didSeed" must be a multibase-encoded value with at least 32 bytes.';
    const label = 'InvalidDidSeedError';
    super({ statusManager, message, defaultMessage, label });
  }
}

export class InvalidTokenError extends ChildError {
  constructor(options?: CustomErrorOptions) {
    const { statusManager, message } = options ?? {};
    const repoName = statusManager?.getRepoName() ?? 'repoName';
    const metaRepoName = statusManager?.getMetaRepoName() ?? 'metaRepoName';
    const defaultMessage = `One or more of the access tokens you are using for the ` +
      `credential status repo ("${repoName}") and the ` +
      `credential status metadata repo ("${metaRepoName}") are incorrect or expired.`;
    const label = 'InvalidTokenError';
    super({ statusManager, message, defaultMessage, label });
  }
}

export class MissingRepositoryError extends ChildError {
  constructor(options?: CustomErrorOptions) {
    const { statusManager, message } = options ?? {};
    const repoName = statusManager?.getRepoName() ?? 'repoName';
    const metaRepoName = statusManager?.getMetaRepoName() ?? 'metaRepoName';
    const defaultMessage = `The credential status repo ("${repoName}") and the ` +
      `credential status metadata repo ("${metaRepoName}") must be manually created in advance.`
    const label = 'MissingRepositoryError';
    super({ statusManager, message, defaultMessage, label });
  }
}

export class SnapshotExistsError extends ChildError {
  constructor(options?: CustomErrorOptions) {
    const { statusManager, message } = options ?? {};
    const defaultMessage = 'Snapshot data already exists.';
    const label = 'SnapshotExistsError';
    super({ statusManager, message, defaultMessage, label });
  }
}

export class InconsistentRepositoryError extends ChildError {
  constructor(options?: CustomErrorOptions) {
    const { statusManager, message } = options ?? {};
    const repoName = statusManager?.getRepoName() ?? 'repoName';
    const metaRepoName = statusManager?.getMetaRepoName() ?? 'metaRepoName';
    const defaultMessage = `Inconsistencies in the status repos may need to be manually resolved. ` +
      `If this is your first operation with this library (e.g., "createStatusManager"), please make sure that the ` +
      `credential status repo ("${repoName}") and the credential status metadata repo ("${metaRepoName}") are empty.`;
    const label = 'InconsistentRepositoryError';
    super({ statusManager, message, defaultMessage, label });
  }
}
