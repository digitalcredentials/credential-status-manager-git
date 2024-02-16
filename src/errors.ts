import { BaseCredentialStatusManager } from './credential-status-manager-base.js';

interface CustomErrorOptionalOptions {
  statusManager?: BaseCredentialStatusManager;
  message?: string;
}

interface CustomErrorRequiredOptions {
  defaultMessage: string;
  code: number;
}

type CustomErrorOptions = CustomErrorOptionalOptions & CustomErrorRequiredOptions;

class CustomError extends Error {
  public code: number;

  constructor(options: CustomErrorOptions) {
    const { defaultMessage, code } = options;
    const message = `${options?.message ?? defaultMessage}`;
    super(message);
    this.code = code;
  }
}

export class BadRequestError extends CustomError {
  constructor(options?: CustomErrorOptionalOptions) {
    const { message } = options ?? {};
    const defaultMessage = 'That is an invalid request.';
    super({ message, defaultMessage, code: 400 });
  }
}

export class NotFoundError extends CustomError {
  constructor(options?: CustomErrorOptionalOptions) {
    const { message } = options ?? {};
    const defaultMessage = 'Resource not found.';
    super({ message, defaultMessage, code: 404 });
  }
}

export class InvalidRepoStateError extends CustomError {
  constructor(options?: CustomErrorOptionalOptions) {
    const { message } = options ?? {};
    const defaultMessage = 'The status repos have an invalid state.';
    super({ message, defaultMessage, code: 500 });
  }
}

export class InvalidDidSeedError extends CustomError {
  constructor(options?: CustomErrorOptionalOptions) {
    const { message } = options ?? {};
    const defaultMessage = '"didSeed" must be a multibase-encoded value with at least 32 bytes.';
    super({ message, defaultMessage, code: 400 });
  }
}

export class InvalidTokenError extends CustomError {
  constructor(options?: CustomErrorOptionalOptions) {
    const { statusManager, message } = options ?? {};
    const repoName = statusManager?.getRepoName() ?? 'repoName';
    const metaRepoName = statusManager?.getMetaRepoName() ?? 'metaRepoName';
    const defaultMessage = `One or more of the access tokens you are using for the ` +
      `credential status repo ("${repoName}") and the ` +
      `credential status metadata repo ("${metaRepoName}") are incorrect or expired.`;
    super({ message, defaultMessage, code: 401 });
  }
}

export class MissingRepositoryError extends CustomError {
  constructor(options?: CustomErrorOptionalOptions) {
    const { statusManager, message } = options ?? {};
    const repoName = statusManager?.getRepoName() ?? 'repoName';
    const metaRepoName = statusManager?.getMetaRepoName() ?? 'metaRepoName';
    const defaultMessage = `The credential status repo ("${repoName}") and the ` +
      `credential status metadata repo ("${metaRepoName}") must be manually created in advance.`
    super({ message, defaultMessage, code: 400 });
  }
}

export class SnapshotExistsError extends CustomError {
  constructor(options?: CustomErrorOptionalOptions) {
    const { message } = options ?? {};
    const defaultMessage = 'Snapshot data already exists.';
    super({ message, defaultMessage, code: 400 });
  }
}
