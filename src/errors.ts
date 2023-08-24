import { BaseCredentialStatusManager } from "./credential-status-manager-base";

interface StatusRepoInconsistencyErrorOptions {
  statusManager?: BaseCredentialStatusManager;
  message?: string;
}
export class StatusRepoInconsistencyError extends Error {
  constructor(options?: StatusRepoInconsistencyErrorOptions) {
    let statusManager, message;
    if (!options) {
      statusManager = undefined;
      message = undefined;
    } else {
      ({ statusManager, message } = options);
    }
    const repoName = statusManager?.getRepoName() ?? "repoName";
    const metaRepoName = statusManager?.getMetaRepoName() ?? "metaRepoName";
    const defaultMessage = `Inconsistencies in the status repos may need to be manually resolved. ` +
      `If this is your first operation with this library (e.g., "createStatusManager"), please make sure that the ` +
      `credential status repo ("${repoName}") and the credential status metadata repo ("${metaRepoName}") are empty.`;
    super(`StatusRepoInconsistencyError: ${message ?? defaultMessage}`);
    // Set the prototype explicitly.
    Object.setPrototypeOf(this, StatusRepoInconsistencyError.prototype);
  }
}
