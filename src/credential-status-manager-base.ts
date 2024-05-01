/*!
 * Copyright (c) 2023-2024 Digital Credentials Consortium. All rights reserved.
 */
import { createCredential, createList, decodeList } from '@digitalcredentials/vc-bitstring-status-list';
import { VerifiableCredential } from '@digitalcredentials/vc-data-model';
import { Mutex } from 'async-mutex';
import { v4 as uuid } from 'uuid';
import {
  BadRequestError,
  InvalidRepoStateError,
  NotFoundError,
  SnapshotExistsError
} from './errors.js';
import {
  DidMethod,
  MAX_CREDENTIAL_ID_LENGTH,
  getCredentialSubjectObject,
  getDateString,
  getSigningMaterial,
  isValidCredentialId,
  signCredential,
  validateCredential
} from './helpers.js';

// Number of credentials tracked in a status credential
const STATUS_CREDENTIAL_LIST_SIZE = 100000;

// Length of status credential ID
const STATUS_CREDENTIAL_ID_LENGTH = 20;

// Character set of status credential ID
const STATUS_CREDENTIAL_ID_CHAR_SET = '012ABCDEFGHIJKLMnopqrstuvwxyz3456abcdefghijklmNOPQRSTUVWXYZ789';

// Status credential type
const STATUS_CREDENTIAL_TYPE = 'BitstringStatusListCredential';

// Status credential subject type
const STATUS_CREDENTIAL_SUBJECT_TYPE = 'BitstringStatusList';

// Credential status type
const CREDENTIAL_STATUS_TYPE = 'BitstringStatusListEntry';

// Name of status credential repo branch
export const STATUS_CREDENTIAL_REPO_BRANCH_NAME = 'main';

// Git file paths
export const CONFIG_FILE_PATH = 'config.json';
export const SNAPSHOT_FILE_PATH = 'snapshot.json';

// Git encoded file paths
export const CONFIG_FILE_PATH_ENCODED = encodeURIComponent(CONFIG_FILE_PATH);
export const SNAPSHOT_FILE_PATH_ENCODED = encodeURIComponent(SNAPSHOT_FILE_PATH);

// Git service
export enum GitService {
  GitHub = 'github',
  GitLab = 'gitlab'
}

// Purpose of a status credential
export enum StatusPurpose {
  Revocation = 'revocation',
  Suspension = 'suspension'
}

// All supported status purposes
export const SUPPORTED_STATUS_PURPOSES = Object.values(StatusPurpose);

// Type definition for user credential metadata
interface CredentialInfo {
  id: string;
  issuer: string;
  subject?: string;
  statusInfo: CredentialStatusInfo;
}

// Type definition for credential status info
type CredentialStatusInfo = {
  [purpose in StatusPurpose]: {
    statusCredentialId: string;
    statusListIndex: number;
    valid: boolean;
  };
}

// Type definition for status credential info
export type StatusCredentialInfo = {
  [purpose in StatusPurpose]: {
    latestStatusCredentialId: string;
    latestCredentialsIssuedCounter: number;
    statusCredentialsCounter: number;
  };
}

// Type definition for event log entry
interface EventLogEntry {
  timestamp: string;
  credentialId: string;
  credentialIssuer: string;
  credentialSubject?: string;
  credentialStatusInfo: CredentialStatusInfo;
}

// Type definition for event log
type EventLog = EventLogEntry[];

// Type definition for config
export interface Config {
  credentialsIssuedCounter: number;
  statusCredentialIds: string[];
  statusCredentialInfo: StatusCredentialInfo;
  eventLog: EventLog;
}

// Type definition for snapshot
export type Snapshot = Config & {
  statusCredentials: Record<string, VerifiableCredential>;
};

// Type definition for composeStatusCredential function input
interface ComposeStatusCredentialOptions {
  issuerDid: string;
  credentialId: string;
  statusPurpose: StatusPurpose;
  statusList?: any;
}

// Type definition for attachCredentialStatus method input
interface AttachCredentialStatusOptions {
  credential: any;
  statusPurposes: StatusPurpose[];
}

// Type definition for attachCredentialStatus method output
type AttachCredentialStatusResult = Config & {
  credential: any;
  credentialStatusInfo: CredentialStatusInfo;
  newUserCredential: boolean;
  newStatusCredential: {
    [purpose in StatusPurpose]: boolean;
  };
};

// Type definition for allocateStatus method input
interface AllocateStatusOptions {
  credential: VerifiableCredential;
  statusPurposes: StatusPurpose[];
}

// Type definition for updateStatus method input
interface UpdateStatusOptions {
  credentialId: string;
  statusPurpose: StatusPurpose;
  invalidate: boolean;
}

// Type definition for shouldUpdateCredentialStatusInfo method input
interface ShouldUpdateCredentialStatusInfoOptions {
  statusInfo: CredentialStatusInfo;
  statusPurpose: StatusPurpose;
  invalidate: boolean;
}

// Type definition for getRepoState method output
interface GetRepoStateResult {
  valid: boolean;
  error?: InvalidRepoStateError;
}

// Type definition for BaseCredentialStatusManager constructor method input
export interface BaseCredentialStatusManagerOptions {
  repoName: string;
  metaRepoName: string;
  repoAccessToken: string;
  metaRepoAccessToken: string;
  didMethod: DidMethod;
  didSeed: string;
  didWebUrl?: string;
  signStatusCredential?: boolean;
  signUserCredential?: boolean;
}

// Minimal set of options required for configuring BaseCredentialStatusManager
export const BASE_MANAGER_REQUIRED_OPTIONS: Array<keyof BaseCredentialStatusManagerOptions> = [
  'repoName',
  'metaRepoName',
  'repoAccessToken',
  'metaRepoAccessToken',
  'didMethod',
  'didSeed'
];

// Base class for credential status managers
export abstract class BaseCredentialStatusManager {
  protected readonly repoName: string;
  protected readonly metaRepoName: string;
  protected readonly repoAccessToken: string;
  protected readonly metaRepoAccessToken: string;
  protected readonly didMethod: DidMethod;
  protected readonly didSeed: string;
  protected readonly didWebUrl: string;
  protected readonly signStatusCredential: boolean;
  protected readonly signUserCredential: boolean;
  protected readonly lock: Mutex;

  constructor(options: BaseCredentialStatusManagerOptions) {
    const {
      repoName,
      metaRepoName,
      repoAccessToken,
      metaRepoAccessToken,
      didMethod,
      didSeed,
      didWebUrl,
      signStatusCredential,
      signUserCredential
    } = options;
    this.repoName = repoName;
    this.metaRepoName = metaRepoName;
    this.repoAccessToken = repoAccessToken;
    this.metaRepoAccessToken = metaRepoAccessToken;
    this.didMethod = didMethod;
    this.didSeed = didSeed;
    this.didWebUrl = didWebUrl ?? '';
    this.signStatusCredential = signStatusCredential ?? true;
    this.signUserCredential = signUserCredential ?? false;
    this.lock = new Mutex();
  }

  // retrieves status repo name
  getRepoName(): string {
    return this.repoName;
  }

  // retrieves metadata status repo name
  getMetaRepoName(): string {
    return this.metaRepoName;
  }

  // generates new status credential ID
  // Note: We assume this method will never generate an ID that
  // has previously been generated for a status credential in this system
  generateStatusCredentialId(): string {
    let statusCredentialId = '';
    const charSetLength = STATUS_CREDENTIAL_ID_CHAR_SET.length;
    for (let i = 0; i < STATUS_CREDENTIAL_ID_LENGTH; i++) {
      statusCredentialId += STATUS_CREDENTIAL_ID_CHAR_SET.charAt(Math.floor(Math.random() * charSetLength));
    }
    return statusCredentialId;
  }

  // generates new user credential ID
  // Note: We assume this method will never generate an ID that
  // has previously been generated for a user credential in this system
  generateUserCredentialId(): string {
    return `urn:uuid:${uuid()}`;
  }

  // composes credentialStatus field of credential
  composeCredentialStatus(credentialStatusInfo: CredentialStatusInfo): any {
    let credentialStatus: any = [];
    for (const [statusPurpose, statusData] of Object.entries(credentialStatusInfo)) {
      const { statusCredentialId, statusListIndex } = statusData;
      const statusCredentialUrlBase = this.getStatusCredentialUrlBase();
      const statusCredentialUrl = `${statusCredentialUrlBase}/${statusCredentialId}`;
      const credentialStatusId = `${statusCredentialUrl}#${statusListIndex}`;
      credentialStatus.push({
        id: credentialStatusId,
        type: CREDENTIAL_STATUS_TYPE,
        statusPurpose,
        statusListCredential: statusCredentialUrl,
        statusListIndex: statusListIndex.toString()
      });
    }
    if (credentialStatus.length === 1) {
      credentialStatus = credentialStatus[0];
    }
    return credentialStatus;
  }

  // attaches status to credential
  async attachCredentialStatus({ credential, statusPurposes }: AttachCredentialStatusOptions): Promise<AttachCredentialStatusResult> {
    // copy credential and delete appropriate fields
    const credentialCopy = Object.assign({}, credential);
    delete credentialCopy.credentialStatus;
    delete credentialCopy.proof;

    // ensure that credential has ID
    let credentialContainsId = true;
    if (!credentialCopy.id) {
      credentialContainsId = false;
      // Note: This assumes that uuid will never generate an ID that
      // conflicts with an ID that has already been tracked in the log
      credentialCopy.id = this.generateUserCredentialId();
    } else {
      if (!isValidCredentialId(credentialCopy.id)) {
        throw new BadRequestError({
          message: 'The credential ID must be a URL, UUID, or DID ' +
            `that is no more than ${MAX_CREDENTIAL_ID_LENGTH} characters in length.`
        });
      }
    }

    // validate credential before attaching status
    validateCredential(credentialCopy);

    // retrieve config
    let {
      credentialsIssuedCounter,
      statusCredentialIds,
      statusCredentialInfo,
      eventLog
    } = await this.getConfig();

    // only search for credential if it was passed with an ID
    if (credentialContainsId) {
      // find latest relevant log entry for credential with given ID
      const eventLogEntry = eventLog.findLast((entry) => {
        return entry.credentialId === credentialCopy.id;
      });

      // do not allocate new entry if ID is already being tracked
      if (eventLogEntry) {
        // retrieve relevant log data
        const { credentialStatusInfo } = eventLogEntry;

        // compose credentialStatus field of credential
        const credentialStatus = this.composeCredentialStatus(credentialStatusInfo);

        // compose newStatusCredential, which determines whether to create
        // a new status credential by purpose
        const newStatusCredentialEntries =
          Object.keys(credentialStatusInfo).map(purpose => {
            return [purpose, false];
          });
        const newStatusCredential = Object.fromEntries(newStatusCredentialEntries);

        return {
          credential: {
            ...credentialCopy,
            credentialStatus
          },
          newStatusCredential,
          newUserCredential: false,
          credentialStatusInfo,
          credentialsIssuedCounter,
          statusCredentialIds,
          statusCredentialInfo,
          eventLog
        };
      }
    }

    // compose credentialStatus field of credential
    const credentialStatusInfo = {} as CredentialStatusInfo;
    const newStatusCredential = {} as { [purpose in StatusPurpose]: boolean };
    for (const statusPurpose of statusPurposes) {
      let {
        latestStatusCredentialId,
        latestCredentialsIssuedCounter,
        statusCredentialsCounter
      } = statusCredentialInfo[statusPurpose];

      // allocate new entry if ID is not yet being tracked
      newStatusCredential[statusPurpose] = false;
      if (latestCredentialsIssuedCounter >= STATUS_CREDENTIAL_LIST_SIZE) {
        newStatusCredential[statusPurpose] = true;
        latestCredentialsIssuedCounter = 0;
        latestStatusCredentialId = this.generateStatusCredentialId();
        statusCredentialIds.push(latestStatusCredentialId);
        statusCredentialsCounter++;
      }
      latestCredentialsIssuedCounter++;

      // update status credential info
      statusCredentialInfo[statusPurpose] = {
        latestStatusCredentialId,
        latestCredentialsIssuedCounter,
        statusCredentialsCounter
      };

      // update credential status info
      credentialStatusInfo[statusPurpose] = {
        statusCredentialId: latestStatusCredentialId,
        statusListIndex: latestCredentialsIssuedCounter,
        valid: true
      };
    }
    const credentialStatus = this.composeCredentialStatus(credentialStatusInfo);
    credentialsIssuedCounter++;

    return {
      credential: {
        ...credentialCopy,
        credentialStatus
      },
      newStatusCredential,
      newUserCredential: true,
      credentialStatusInfo,
      credentialsIssuedCounter,
      statusCredentialIds,
      statusCredentialInfo,
      eventLog
    };
  }

  // allocates status for credential in race-prone manner
  async allocateStatusUnsafe({ credential, statusPurposes }: AllocateStatusOptions): Promise<VerifiableCredential> {
    // report error for compact JWT credentials
    if (typeof credential === 'string') {
      throw new BadRequestError({
        message: 'This library does not support compact JWT credentials.'
      });
    }

    // attach status to credential
    let {
      credential: credentialWithStatus,
      newStatusCredential,
      newUserCredential,
      credentialStatusInfo,
      statusCredentialInfo,
      eventLog,
      ...attachCredentialStatusResultRest
    } = await this.attachCredentialStatus({ credential, statusPurposes });

    // retrieve signing material
    const {
      didMethod,
      didSeed,
      didWebUrl,
      signStatusCredential,
      signUserCredential
    } = this;
    const { issuerDid } = await getSigningMaterial({
      didMethod,
      didSeed,
      didWebUrl
    });

    // sign credential if necessary
    if (signUserCredential) {
      credentialWithStatus = await signCredential({
        credential: credentialWithStatus,
        didMethod,
        didSeed,
        didWebUrl
      });
    }

    // return credential without updating status repos
    // if we are already accounting for this credential
    if (!newUserCredential) {
      return credentialWithStatus;
    }

    // create status credential for each purpose
    for (const [statusPurpose, newStatusCred] of Object.entries(newStatusCredential)) {
      // compose new status credential only if the last one has reached capacity
      const { latestStatusCredentialId } = statusCredentialInfo[statusPurpose as StatusPurpose];
      if (newStatusCred) {
        const statusCredentialUrlBase = this.getStatusCredentialUrlBase();
        const statusCredentialUrl = `${statusCredentialUrlBase}/${latestStatusCredentialId}`;
        let statusCredential = await composeStatusCredential({
          issuerDid,
          credentialId: statusCredentialUrl,
          statusPurpose: statusPurpose as StatusPurpose
        });

        // sign status credential if necessary
        if (signStatusCredential) {
          statusCredential = await signCredential({
            credential: statusCredential,
            didMethod,
            didSeed,
            didWebUrl
          });
        }

        // create and persist status credential
        await this.createStatusCredential(statusCredential);
      }
    }

    // add new entry to event log
    const credentialSubjectObject = getCredentialSubjectObject(credentialWithStatus);
    const eventLogEntry: EventLogEntry = {
      timestamp: getDateString(),
      credentialId: credentialWithStatus.id as string,
      credentialIssuer: issuerDid,
      credentialSubject: credentialSubjectObject?.id,
      credentialStatusInfo
    };
    eventLog.push(eventLogEntry);

    // persist updates to config
    await this.updateConfig({
      ...attachCredentialStatusResultRest,
      statusCredentialInfo,
      eventLog
    });

    return credentialWithStatus;
  }

  // allocates status for credential in thread-safe manner
  async allocateStatus({ credential, statusPurposes }: AllocateStatusOptions): Promise<VerifiableCredential> {
    const release = await this.lock.acquire();
    try {
      await this.cleanupSnapshot();
      await this.saveSnapshot();
      const result = await this.allocateStatusUnsafe({ credential, statusPurposes });
      return result;
    } catch(error) {
      if (!(error instanceof InvalidRepoStateError)) {
        return this.allocateStatus({ credential, statusPurposes });
      } else {
        throw error;
      }
    } finally {
      await this.cleanupSnapshot();
      release();
    }
  }

  // allocates revocation status for credential
  async allocateRevocationStatus(credential: VerifiableCredential): Promise<VerifiableCredential> {
    return this.allocateStatus({ credential, statusPurposes: [StatusPurpose.Revocation] });
  }

  // allocates suspension status for credential
  async allocateSuspensionStatus(credential: VerifiableCredential): Promise<VerifiableCredential> {
    return this.allocateStatus({ credential, statusPurposes: [StatusPurpose.Suspension] });
  }

  // allocates all supported statuses for credential
  async allocateSupportedStatuses(credential: VerifiableCredential): Promise<VerifiableCredential> {
    return this.allocateStatus({ credential, statusPurposes: SUPPORTED_STATUS_PURPOSES });
  }

  // determines if credential status info should be updated
  shouldUpdateCredentialStatusInfo({
    statusInfo, statusPurpose, invalidate
  }: ShouldUpdateCredentialStatusInfoOptions): boolean {
    // prevent activation of credentials that have been revoked
    const revoked = !statusInfo[StatusPurpose.Revocation].valid;
    if (revoked && !(statusPurpose === StatusPurpose.Revocation && invalidate)) {
      throw new BadRequestError({
        message:
          `This credential cannot be activated for any purpose, since it has been revoked.`
      });
    }

    // determine if the status action would lead to a change in state
    const invokedStatusInfo = statusInfo[statusPurpose];
    const { valid } = invokedStatusInfo;
    return valid === invalidate;
  }

  // updates status of credential in race-prone manner
  async updateStatusUnsafe({
    credentialId,
    statusPurpose,
    invalidate
  }: UpdateStatusOptions): Promise<VerifiableCredential> {
    // find latest relevant log entry for credential with given ID
    const { eventLog, ...configRest } = await this.getConfig();
    const eventLogEntryBefore = eventLog.findLast((entry) => {
      return entry.credentialId === credentialId;
    });

    // unable to find credential with given ID
    if (!eventLogEntryBefore) {
      throw new NotFoundError({
        message: `Unable to find credential with ID "${credentialId}".`
      });
    }

    // retrieve relevant log entry
    const { credentialStatusInfo, ...eventLogEntryBeforeRest } = eventLogEntryBefore;

    // report error when caller attempts to allocate for an unavailable purpose
    const availablePurposes = Object.keys(credentialStatusInfo) as StatusPurpose[];
    if (!availablePurposes.includes(statusPurpose)) {
      throw new BadRequestError({
        message:
          `This credential does not contain ${statusPurpose} status info.`
      });
    }

    // retrieve relevant credential status info
    const { statusCredentialId, statusListIndex, valid } = credentialStatusInfo[statusPurpose];

    // retrieve status credential
    const statusCredentialBefore = await this.getStatusCredential(statusCredentialId);

    // report error for compact JWT credentials
    if (typeof statusCredentialBefore === 'string') {
      throw new BadRequestError({
        message: 'This library does not support compact JWT credentials.'
      });
    }

    // determine if credential status info should be updated
    const shouldUpdate = this.shouldUpdateCredentialStatusInfo({
      statusInfo: credentialStatusInfo, statusPurpose, invalidate
    });

    // if no update is required, report status credential to caller as is
    if (!shouldUpdate) {
      return statusCredentialBefore;
    }

    // retrieve signing material
    const {
      didMethod,
      didSeed,
      didWebUrl,
      signStatusCredential
    } = this;
    const { issuerDid } = await getSigningMaterial({
      didMethod,
      didSeed,
      didWebUrl
    });

    // update status credential
    const statusCredentialSubjectObjectBefore = getCredentialSubjectObject(statusCredentialBefore);
    const statusCredentialListEncodedBefore = statusCredentialSubjectObjectBefore.encodedList;
    const statusCredentialListDecoded = await decodeList({
      encodedList: statusCredentialListEncodedBefore
    });
    statusCredentialListDecoded.setStatus(statusListIndex, invalidate);
    const statusCredentialUrlBase = this.getStatusCredentialUrlBase();
    const statusCredentialUrl = `${statusCredentialUrlBase}/${statusCredentialId}`;
    let statusCredential = await composeStatusCredential({
      issuerDid,
      credentialId: statusCredentialUrl,
      statusList: statusCredentialListDecoded,
      statusPurpose
    });

    // sign status credential if necessary
    if (signStatusCredential) {
      statusCredential = await signCredential({
        credential: statusCredential,
        didMethod,
        didSeed,
        didWebUrl
      });
    }

    // persist status credential
    await this.updateStatusCredential(statusCredential);

    // add new entries to event log
    const eventLogEntryAfter: EventLogEntry = {
      credentialStatusInfo: {
        ...credentialStatusInfo,
        [statusPurpose]: {
          ...credentialStatusInfo[statusPurpose],
          valid: !valid
        }
      },
      ...eventLogEntryBeforeRest,
      timestamp: getDateString()
    };
    eventLog.push(eventLogEntryAfter);
    await this.updateConfig({ ...configRest, eventLog });

    return statusCredential;
  }

  // updates status of credential in thread-safe manner
  async updateStatus({
    credentialId,
    statusPurpose,
    invalidate
  }: UpdateStatusOptions): Promise<VerifiableCredential> {
    const release = await this.lock.acquire();
    try {
      await this.cleanupSnapshot();
      await this.saveSnapshot();
      const result = await this.updateStatusUnsafe({
        credentialId,
        statusPurpose,
        invalidate
      });
      return result;
    } catch(error) {
      if (!(error instanceof InvalidRepoStateError)) {
        return this.updateStatus({
          credentialId,
          statusPurpose,
          invalidate
        });
      } else {
        throw error;
      }
    } finally {
      await this.cleanupSnapshot();
      release();
    }
  }

  // revokes credential
  async revokeCredential(credentialId: string): Promise<VerifiableCredential> {
    return this.updateStatus({
      credentialId,
      statusPurpose: StatusPurpose.Revocation,
      invalidate: true
    });
  }

  // suspends credential
  async suspendCredential(credentialId: string): Promise<VerifiableCredential> {
    return this.updateStatus({
      credentialId,
      statusPurpose: StatusPurpose.Suspension,
      invalidate: true
    });
  }

  // lifts suspension from credential
  async unsuspendCredential(credentialId: string): Promise<VerifiableCredential> {
    return this.updateStatus({
      credentialId,
      statusPurpose: StatusPurpose.Suspension,
      invalidate: false
    });
  }

  // retrieves status of credential with given ID
  async getStatus(credentialId: string): Promise<CredentialStatusInfo> {
    // find latest relevant log entry for credential with given ID
    const { eventLog } = await this.getConfig();
    const eventLogEntry = eventLog.findLast((entry) => {
      return entry.credentialId === credentialId;
    }) as EventLogEntry;

    // unable to find credential with given ID
    if (!eventLogEntry) {
      throw new NotFoundError({
        message: `Unable to find credential with ID "${credentialId}".`
      });
    }

    return eventLogEntry.credentialStatusInfo;
  }

  // retrieves status credential base URL
  abstract getStatusCredentialUrlBase(): string;

  // deploys website to host status credentials
  async deployStatusCredentialWebsite(): Promise<void> {};

  // checks if caller has authority to update status based on status repo access token
  abstract hasAuthority(repoAccessToken: string, metaRepoAccessToken?: string): Promise<boolean>;

  // checks if status repos exist
  abstract statusReposExist(): Promise<boolean>;

  // checks if status repos are empty
  abstract statusReposEmpty(): Promise<boolean>;

  // retrieves repo state
  async getRepoState(): Promise<GetRepoStateResult> {
    try {
      // retrieve config
      const {
        credentialsIssuedCounter,
        statusCredentialIds,
        statusCredentialInfo,
        eventLog
      } = await this.getConfig();

      // examine info for all status purposes
      const statusPurposes = Object.keys(statusCredentialInfo) as StatusPurpose[];
      // Note: This is the number of credentials that would be issued if
      // every credential is assigned to every status purpose, but it is
      // possible to assign a credential to fewer purposes than the total
      // number of supported purposes in a given deployment
      let maxCredentialsIssuedCounter = 0;
      for (const statusPurpose of statusPurposes) {
        // retrieve info for latest status credential
        const {
          latestStatusCredentialId,
          latestCredentialsIssuedCounter,
          statusCredentialsCounter
        } = statusCredentialInfo[statusPurpose];
        const statusCredentialUrlBase = this.getStatusCredentialUrlBase();
        const statusCredentialUrl = `${statusCredentialUrlBase}/${latestStatusCredentialId}`;

        // ensure that status is consistent
        const statusCredentials = await this.getAllStatusCredentialsByPurpose(statusPurpose);
        let hasLatestStatusCredentialId = false;
        const invalidStatusCredentialIds = [];
        for (const statusCredential of statusCredentials) {
          // ensure that status credential has valid type
          if (typeof statusCredential === 'string') {
            return {
              valid: false,
              error: new InvalidRepoStateError({
                message: 'This library does not support compact JWT ' +
                  `status credentials: ${statusCredential}`
              })
            };
          }

          // ensure that status credential is well formed
          const statusCredentialSubjectObject = getCredentialSubjectObject(statusCredential);
          const statusPurpose = statusCredentialSubjectObject.statusPurpose as StatusPurpose;
          hasLatestStatusCredentialId = hasLatestStatusCredentialId || (statusCredential.id?.endsWith(latestStatusCredentialId) ?? false);
          const hasValidStatusCredentialType = statusCredential.type.includes(STATUS_CREDENTIAL_TYPE);
          const hasValidStatusCredentialSubId = statusCredentialSubjectObject.id?.startsWith(statusCredentialUrl) ?? false;
          const hasValidStatusCredentialSubType = statusCredentialSubjectObject.type === STATUS_CREDENTIAL_SUBJECT_TYPE;
          const hasValidStatusCredentialSubStatusPurpose = Object.values(statusPurposes).includes(statusPurpose);
          const hasValidStatusCredentialFormat = hasValidStatusCredentialType &&
                                                 hasValidStatusCredentialSubId &&
                                                 hasValidStatusCredentialSubType &&
                                                 hasValidStatusCredentialSubStatusPurpose;
          if (!hasValidStatusCredentialFormat) {
            invalidStatusCredentialIds.push(statusCredential.id);
          }
        }

        // ensure that all status credentials for this purpose are valid
        if (invalidStatusCredentialIds.length !== 0) {
          return {
            valid: false,
            error: new InvalidRepoStateError({
              message: 'Status credentials with the following IDs ' +
                'have an invalid format: ' +
                `${invalidStatusCredentialIds.map(id => `"${id as string}"`).join(', ')}`
            })
          };
        }

        // ensure that the latest status credential for this purpose is being tracked in the config
        if (!hasLatestStatusCredentialId) {
          return {
            valid: false,
            error: new InvalidRepoStateError({
              message: `Latest status credential for the ${statusPurpose} purpose ` +
                `("${latestStatusCredentialId}") is not being tracked in the config.`
            })
          };
        }

        // accumulate credential issuance counter from all status purposes
        maxCredentialsIssuedCounter += (statusCredentialsCounter - 1) *
                                       STATUS_CREDENTIAL_LIST_SIZE +
                                       latestCredentialsIssuedCounter;
      }

      // ensure that all status credentials are being tracked in the config
      const repoFilenames = await this.getRepoFilenames();
      if (repoFilenames.length !== statusCredentialIds.length) {
        const missingStatusCredentialIds = [];
        for (const statusCredentialId of statusCredentialIds) {
          if (!repoFilenames.includes(statusCredentialId)) {
            missingStatusCredentialIds.push(statusCredentialId);
          }
        }

        if (missingStatusCredentialIds.length !== 0) {
          return {
            valid: false,
            error: new InvalidRepoStateError({
              message: 'Status credentials with the following IDs ' +
                'are missing in the status credential repo: ' +
                `${missingStatusCredentialIds.map(id => `"${id}"`).join(', ')}`
            })
          };
        }

        // Note: If the code reaches this point, the status credential repo
        // includes more status credentials than we are tracking in the config.
        // While the repo should not reach this state, it is relatively harmless.
      }

      // ensure that the event log has valid type
      const hasValidEventLogType = Array.isArray(eventLog);
      if (!hasValidEventLogType) {
        return {
          valid: false,
          error: new InvalidRepoStateError({
            message: 'Event log must be an array.'
          })
        };
      }

      // ensure that the event log is well formed
      const credentialIdsRedundant = eventLog.map((value) => {
        return value.credentialId;
      });
      const credentialIds = credentialIdsRedundant.filter((value, index, array) => {
        return array.indexOf(value) === index;
      });
      const credentialIdsCounter = credentialIds.length;
      const hasValidIssuedCounterLogToConfig = credentialIdsCounter === credentialsIssuedCounter;
      const hasValidIssuedCounterConfigToMax = credentialsIssuedCounter <= maxCredentialsIssuedCounter;

      // ensure alignment between the number of credentials
      // tracked in the event log and the number of credentials
      // tracked in the config
      if (!hasValidIssuedCounterLogToConfig) {
        return {
          valid: false,
          error: new InvalidRepoStateError({
            message: 'There is a mismatch between the credentials tracked ' +
              `in the event log (${credentialIdsCounter}) ` +
              'and the credentials tracked ' +
              `in the config (${credentialsIssuedCounter}).`
          })
        };
      }

      // ensure that the number of credentials does not exceed the max
      // number of credentials that can be issued in this deployment
      if (!hasValidIssuedCounterConfigToMax) {
        return {
          valid: false,
          error: new InvalidRepoStateError({
            message: 'The number of credentials tracked ' +
              `in the config (${credentialsIssuedCounter}) ` +
              'exceeds the max number of credentials that could have ' +
              `been issued in this deployment (${maxCredentialsIssuedCounter}).`
          })
        };
      }

      // ensure that all checks pass
      return { valid: true };
    } catch (error: any) {
      return {
        valid: false,
        error: new InvalidRepoStateError({ message: error.message })
      };
    }
  }

  // retrieves content of status credential repo
  abstract getRepo(): Promise<any>;

  // retrieves filenames of status credential repo content
  abstract getRepoFilenames(): Promise<string[]>;

  // retrieves content of credential status metadata repo
  abstract getMetaRepo(): Promise<any>;

  // creates status credential
  abstract createStatusCredential(statusCredential: VerifiableCredential): Promise<void>;

  // retrieves status credential
  abstract getStatusCredential(statusCredentialId: string): Promise<VerifiableCredential>;

  // updates status credential
  abstract updateStatusCredential(statusCredential: VerifiableCredential): Promise<void>;

  // deletes status credentials
  abstract deleteStatusCredentials(): Promise<void>;

  // retrieves all status credentials by purpose
  async getAllStatusCredentialsByPurpose(purpose: StatusPurpose): Promise<VerifiableCredential[]> {
    const { statusCredentialIds } = await this.getConfig();
    const statusCredentials = [];
    for (const statusCredentialId of statusCredentialIds) {
      const statusCredential = await this.getStatusCredential(statusCredentialId);
      const statusCredentialSubjectObject = getCredentialSubjectObject(statusCredential);
      const statusPurpose = statusCredentialSubjectObject.statusPurpose as StatusPurpose;
      if (statusPurpose === purpose) {
        statusCredentials.push(statusCredential);
      }
    }
    return statusCredentials;
  }

  // retrieves credential metadata
  async getCredentialInfo(credentialId: string): Promise<CredentialInfo> {
    const { eventLog } = await this.getConfig();
    const eventLogEntry = eventLog.findLast((entry) => {
      return entry.credentialId === credentialId;
    });

    // unable to find credential with given ID
    if (!eventLogEntry) {
      throw new NotFoundError({
        message: `Unable to find credential with ID "${credentialId}".`
      });
    }

    return {
      id: credentialId,
      issuer: eventLogEntry.credentialIssuer,
      subject: eventLogEntry.credentialSubject,
      statusInfo: eventLogEntry.credentialStatusInfo
    }
  }

  // creates config
  abstract createConfig(config: Config): Promise<void>;

  // retrieves config
  abstract getConfig(): Promise<Config>;

  // updates config
  abstract updateConfig(config: Config): Promise<void>;

  // deletes config
  abstract deleteConfig(): Promise<void>;

  // creates snapshot
  abstract createSnapshot(snapshot: Snapshot): Promise<void>;

  // retrieves snapshot
  abstract getSnapshot(): Promise<Snapshot>;

  // deletes snapshot
  abstract deleteSnapshot(): Promise<void>;

  // checks if snapshot exists
  abstract snapshotExists(): Promise<boolean>;

  // saves snapshot
  async saveSnapshot(): Promise<void> {
    // ensure that snapshot does not exist
    const snapExists = await this.snapshotExists();
    if (snapExists) {
      throw new SnapshotExistsError();
    }

    // retrieve config
    const {
      statusCredentialIds,
      ...configRest
    } = await this.getConfig();

    // retrieve status credential
    const statusCredentials: Record<string, VerifiableCredential> = {};
    for (const statusCredentialId of statusCredentialIds) {
      statusCredentials[statusCredentialId] = await this.getStatusCredential(statusCredentialId);
    }

    // create snapshot
    const snapshot: Snapshot = {
      statusCredentialIds,
      statusCredentials,
      ...configRest
    };
    await this.createSnapshot(snapshot);
  }

  // restores snapshot
  async restoreSnapshot(): Promise<void> {
    // retrieve snapshot
    const {
      statusCredentials,
      ...config
    } = await this.getSnapshot();

    // this is necessary for cases in which a transactional operation such as
    // allocateStatus results in a new status credential file but must be
    // reversed because of an intermittent interruption
    await this.deleteStatusCredentials();
    await this.deleteConfig();

    // restore status credential
    for (const [, statusCredential] of Object.entries(statusCredentials)) {
      await this.createStatusCredential(statusCredential);
    }

    // restore config
    await this.createConfig(config);

    // delete snapshot
    await this.deleteSnapshot();
  }

  // cleans up snapshot
  async cleanupSnapshot(): Promise<void> {
    const repoState = await this.getRepoState();
    const snapExists = await this.snapshotExists();
    if (!repoState.valid) {
      if (snapExists) {
        await this.restoreSnapshot();
      } else {
        throw repoState.error as InvalidRepoStateError;
      }
    } else {
      if (snapExists) {
        await this.deleteSnapshot();
      }
    }
  }
}

// composes BitstringStatusListCredential
export async function composeStatusCredential({
  issuerDid,
  credentialId,
  statusList,
  statusPurpose = StatusPurpose.Revocation
}: ComposeStatusCredentialOptions): Promise<any> {
  // determine whether or not to create a new status credential
  if (!statusList) {
    statusList = await createList({ length: STATUS_CREDENTIAL_LIST_SIZE });
  }

  // create status credential
  let credential = await createCredential({
    id: credentialId,
    list: statusList,
    statusPurpose
  });
  credential = {
    ...credential,
    issuer: issuerDid,
    validFrom: getDateString()
  };

  return credential;
}
