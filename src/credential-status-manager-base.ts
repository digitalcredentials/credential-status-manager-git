/*!
 * Copyright (c) 2023 Digital Credentials Consortium. All rights reserved.
 */
import { CONTEXT_URL_V1 } from '@digitalbazaar/vc-status-list-context';
import { VerifiableCredential } from '@digitalcredentials/vc-data-model';
import { createCredential, createList, decodeList } from '@digitalcredentials/vc-status-list';
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
  deriveStatusCredentialId,
  getDateString,
  getSigningMaterial,
  signCredential
} from './helpers.js';

// Number of credentials tracked in a list
const CREDENTIAL_STATUS_LIST_SIZE = 100000;

// Credential status type
const CREDENTIAL_STATUS_TYPE = 'StatusList2021Entry';

// Name of credential status branch
export const CREDENTIAL_STATUS_REPO_BRANCH_NAME = 'main';

// Credential status resource names
export const CREDENTIAL_STATUS_CONFIG_FILE = 'config.json';
export const CREDENTIAL_STATUS_SNAPSHOT_FILE = 'snapshot.json';

// Credential status manager Git service
export enum GitService {
  GitHub = 'github',
  GitLab = 'gitlab'
}

// States of credential resulting from caller actions and tracked in event log
export enum CredentialState {
  Active = 'active',
  Revoked = 'revoked'
}

// Type definition for event log entry
interface EventLogEntry {
  timestamp: string;
  credentialId: string;
  credentialIssuer: string;
  credentialSubject?: string;
  credentialState: CredentialState;
  verificationMethod: string;
  statusCredentialId: string;
  credentialStatusIndex: number;
}

// Type definition for event log
type EventLog = EventLogEntry[];

// Type definition for config
export interface Config {
  latestStatusCredentialId: string;
  latestCredentialsIssuedCounter: number;
  allCredentialsIssuedCounter: number;
  statusCredentialIds: string[];
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
  statusList?: any;
  statusPurpose?: string;
}

// Type definition for attachCredentialStatus method input
interface AttachCredentialStatusOptions {
  credential: any;
  statusPurpose?: string;
}

// Type definition for attachCredentialStatus method output
type AttachCredentialStatusResult = Config & {
  credential: any;
  newUserCredential: boolean;
  newStatusCredential: boolean;
};

// Type definition for updateStatus method input
interface UpdateStatusOptions {
  credentialId: string;
  credentialStatus: CredentialState;
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
  signUserCredential?: boolean;
  signStatusCredential?: boolean;
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
  protected readonly signUserCredential: boolean;
  protected readonly signStatusCredential: boolean;
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
      signUserCredential,
      signStatusCredential
    } = options;
    this.repoName = repoName;
    this.metaRepoName = metaRepoName;
    this.repoAccessToken = repoAccessToken;
    this.metaRepoAccessToken = metaRepoAccessToken;
    this.didMethod = didMethod;
    this.didSeed = didSeed;
    this.didWebUrl = didWebUrl ?? '';
    this.signUserCredential = signUserCredential ?? false;
    this.signStatusCredential = signStatusCredential ?? false;
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
  // has never been generated for a status credential in this system
  generateStatusCredentialId(): string {
    return Math.random().toString(36).substring(2, 12).toUpperCase();
  }

  // attaches status to credential
  async attachCredentialStatus({ credential, statusPurpose = 'revocation' }: AttachCredentialStatusOptions): Promise<AttachCredentialStatusResult> {
    // ensure that credential has ID
    if (!credential.id) {
      // Note: This assumes that uuid will never generate an ID that
      // conflicts with an ID that has already been tracked in the log
      credential.id = uuid();
    }

    // ensure that credential contains valid status credential context
    if (!credential['@context'].includes(CONTEXT_URL_V1)) {
      credential['@context'].push(CONTEXT_URL_V1);
    }

    // retrieve config
    let {
      latestStatusCredentialId,
      latestCredentialsIssuedCounter,
      allCredentialsIssuedCounter,
      statusCredentialIds,
      eventLog
    } = await this.getConfig();

    // find latest relevant log entry for credential with given ID
    eventLog.reverse();
    const eventLogEntry = eventLog.find((entry) => {
      return entry.credentialId === credential.id;
    });
    eventLog.reverse();

    // do not allocate new entry if ID is already being tracked
    if (eventLogEntry) {
      // retrieve relevant log entry
      const { statusCredentialId, credentialStatusIndex } = eventLogEntry;

      // attach credential status
      const statusCredentialUrlBase = this.getStatusCredentialUrlBase();
      const statusCredentialUrl = `${statusCredentialUrlBase}/${statusCredentialId}`;
      const credentialStatusId = `${statusCredentialUrl}#${credentialStatusIndex}`;
      const credentialStatus = {
        id: credentialStatusId,
        type: CREDENTIAL_STATUS_TYPE,
        statusPurpose,
        statusListIndex: credentialStatusIndex.toString(),
        statusListCredential: statusCredentialUrl
      };

      return {
        credential: {
          ...credential,
          credentialStatus
        },
        newUserCredential: false,
        newStatusCredential: false,
        latestStatusCredentialId,
        latestCredentialsIssuedCounter,
        allCredentialsIssuedCounter,
        statusCredentialIds,
        eventLog
      };
    }

    // allocate new entry if ID is not yet being tracked
    let newStatusCredential = false;
    if (latestCredentialsIssuedCounter >= CREDENTIAL_STATUS_LIST_SIZE) {
      newStatusCredential = true;
      latestCredentialsIssuedCounter = 0;
      latestStatusCredentialId = this.generateStatusCredentialId();
      statusCredentialIds.push(latestStatusCredentialId);
    }
    allCredentialsIssuedCounter++;
    latestCredentialsIssuedCounter++;

    // attach credential status
    const statusCredentialUrlBase = this.getStatusCredentialUrlBase();
    const statusCredentialUrl = `${statusCredentialUrlBase}/${latestStatusCredentialId}`;
    const credentialStatusIndex = latestCredentialsIssuedCounter;
    const credentialStatusId = `${statusCredentialUrl}#${credentialStatusIndex}`;
    const credentialStatus = {
      id: credentialStatusId,
      type: CREDENTIAL_STATUS_TYPE,
      statusPurpose,
      statusListIndex: credentialStatusIndex.toString(),
      statusListCredential: statusCredentialUrl
    };

    return {
      credential: {
        ...credential,
        credentialStatus
      },
      newUserCredential: true,
      newStatusCredential,
      latestStatusCredentialId,
      latestCredentialsIssuedCounter,
      allCredentialsIssuedCounter,
      statusCredentialIds,
      eventLog
    };
  }

  // allocates status for credential in race-prone manner
  async allocateStatusUnsafe(credential: VerifiableCredential): Promise<VerifiableCredential> {
    // report error for compact JWT credentials
    if (typeof credential === 'string') {
      throw new BadRequestError({
        message: 'This library does not support compact JWT credentials.'
      });
    }

    // attach status to credential
    let {
      credential: credentialWithStatus,
      newUserCredential,
      newStatusCredential,
      latestStatusCredentialId,
      eventLog,
      ...attachCredentialStatusResultRest
    } = await this.attachCredentialStatus({ credential });

    // retrieve signing material
    const {
      didMethod,
      didSeed,
      didWebUrl,
      signUserCredential,
      signStatusCredential
    } = this;
    const {
      issuerDid,
      verificationMethod
    } = await getSigningMaterial({
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

    // return credential without updating database resources
    // if we are already accounting for this credential
    if (!newUserCredential) {
      return credentialWithStatus;
    }

    // create new status credential only if the last one has reached capacity
    if (newStatusCredential) {
      // create status credential
      const statusCredentialUrlBase = this.getStatusCredentialUrlBase();
      const statusCredentialUrl = `${statusCredentialUrlBase}/${latestStatusCredentialId}`;
      let statusCredential = await composeStatusCredential({
        issuerDid,
        credentialId: statusCredentialUrl
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

    // extract relevant data from credential status
    const {
      statusListCredential: statusCredentialUrl,
      statusListIndex
    } = credentialWithStatus.credentialStatus;

    // retrieve status credential ID from status credential URL
    const statusCredentialId = deriveStatusCredentialId(statusCredentialUrl);

    // add new entry to event log
    const eventLogEntry: EventLogEntry = {
      timestamp: getDateString(),
      credentialId: credential.id as string,
      credentialIssuer: issuerDid,
      credentialSubject: credential.credentialSubject?.id,
      credentialState: CredentialState.Active,
      verificationMethod,
      statusCredentialId,
      credentialStatusIndex: parseInt(statusListIndex)
    };
    eventLog.push(eventLogEntry);

    // persist updates to config
    await this.updateConfig({
      latestStatusCredentialId,
      eventLog,
      ...attachCredentialStatusResultRest
    });

    return credentialWithStatus;
  }

  // allocates status for credential in thread-safe manner
  async allocateStatus(credential: VerifiableCredential): Promise<VerifiableCredential> {
    const release = await this.lock.acquire();
    try {
      await this.cleanupSnapshot();
      await this.saveSnapshot();
      const result = await this.allocateStatusUnsafe(credential);
      return result;
    } catch(error) {
      if (!(error instanceof InvalidRepoStateError)) {
        return this.allocateStatus(credential);
      } else {
        throw error;
      }
    } finally {
      await this.cleanupSnapshot();
      release();
    }
  }

  // updates status of credential in race-prone manner
  async updateStatusUnsafe({
    credentialId,
    credentialStatus
  }: UpdateStatusOptions): Promise<VerifiableCredential> {
    // find latest relevant log entry for credential with given ID
    const { eventLog, ...configRest } = await this.getConfig();
    eventLog.reverse();
    const eventLogEntryBefore = eventLog.find((entry) => {
      return entry.credentialId === credentialId;
    });
    eventLog.reverse();

    // unable to find credential with given ID
    if (!eventLogEntryBefore) {
      throw new NotFoundError({
        message: `Unable to find credential with ID "${credentialId}".`
      });
    }

    // retrieve relevant log entry
    const {
      credentialSubject,
      statusCredentialId,
      credentialStatusIndex
    } = eventLogEntryBefore;

    // retrieve signing material
    const {
      didMethod,
      didSeed,
      didWebUrl,
      signStatusCredential
    } = this;
    const {
      issuerDid,
      verificationMethod
    } = await getSigningMaterial({
      didMethod,
      didSeed,
      didWebUrl
    });

    // retrieve status credential
    const statusCredentialBefore = await this.getStatusCredential(statusCredentialId);

    // report error for compact JWT credentials
    if (typeof statusCredentialBefore === 'string') {
      throw new BadRequestError({
        message: 'This library does not support compact JWT credentials.'
      });
    }

    // update status credential
    const statusCredentialListEncodedBefore = statusCredentialBefore.credentialSubject.encodedList;
    const statusCredentialListDecoded = await decodeList({
      encodedList: statusCredentialListEncodedBefore
    });
    switch (credentialStatus) {
      case CredentialState.Active:
        // active credential is represented as 0 bit
        statusCredentialListDecoded.setStatus(credentialStatusIndex, false);
        break;
      case CredentialState.Revoked:
        // revoked credential is represented as 1 bit
        statusCredentialListDecoded.setStatus(credentialStatusIndex, true);
        break;
      default:
        throw new BadRequestError({
          message:
            '"credentialStatus" must be one of the following values: ' +
            `${Object.values(CredentialState).map(s => `"${s}"`).join(', ')}.`
        });
    }
    const statusCredentialUrlBase = this.getStatusCredentialUrlBase();
    const statusCredentialUrl = `${statusCredentialUrlBase}/${statusCredentialId}`;
    let statusCredential = await composeStatusCredential({
      issuerDid,
      credentialId: statusCredentialUrl,
      statusList: statusCredentialListDecoded
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
      timestamp: getDateString(),
      credentialId,
      credentialIssuer: issuerDid,
      credentialSubject,
      credentialState: credentialStatus,
      verificationMethod,
      statusCredentialId,
      credentialStatusIndex
    };
    eventLog.push(eventLogEntryAfter);
    await this.updateConfig({ eventLog, ...configRest });

    return statusCredential;
  }

  // updates status of credential in thread-safe manner
  async updateStatus({
    credentialId,
    credentialStatus
  }: UpdateStatusOptions): Promise<VerifiableCredential> {
    const release = await this.lock.acquire();
    try {
      await this.cleanupSnapshot();
      await this.saveSnapshot();
      const result = await this.updateStatusUnsafe({ credentialId, credentialStatus });
      return result;
    } catch(error) {
      if (!(error instanceof InvalidRepoStateError)) {
        return this.updateStatus({
          credentialId,
          credentialStatus
        });
      } else {
        throw error;
      }
    } finally {
      await this.cleanupSnapshot();
      release();
    }
  }

  // checks status of credential with given ID
  async checkStatus(credentialId: string): Promise<EventLogEntry> {
    // find latest relevant log entry for credential with given ID
    const { eventLog } = await this.getConfig();
    eventLog.reverse();
    const eventLogEntry = eventLog.find((entry) => {
      return entry.credentialId === credentialId;
    }) as EventLogEntry;

    // unable to find credential with given ID
    if (!eventLogEntry) {
      throw new NotFoundError({
        message: `Unable to find credential with ID "${credentialId}".`
      });
    }

    return eventLogEntry;
  }

  // retrieves status credential base URL
  abstract getStatusCredentialUrlBase(): string;

  // deploys website to host credential status management resources
  async deployCredentialStatusWebsite(): Promise<void> {};

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
        latestStatusCredentialId,
        latestCredentialsIssuedCounter,
        allCredentialsIssuedCounter,
        statusCredentialIds,
        eventLog
      } = await this.getConfig();
      const statusCredentialUrlBase = this.getStatusCredentialUrlBase();
      const statusCredentialUrl = `${statusCredentialUrlBase}/${latestStatusCredentialId}`;

      // ensure that status is consistent
      let hasLatestStatusCredentialId = false;
      const invalidStatusCredentialIds = [];
      for (const statusCredentialId of statusCredentialIds) {
        // retrieve status credential
        const statusCredential = await this.getStatusCredential(statusCredentialId);

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
        hasLatestStatusCredentialId = hasLatestStatusCredentialId || (statusCredential.id?.endsWith(latestStatusCredentialId) ?? false);
        const hasValidStatusCredentialType = statusCredential.type.includes('StatusList2021Credential');
        const hasValidStatusCredentialSubId = statusCredential.credentialSubject.id?.startsWith(statusCredentialUrl) ?? false;
        const hasValidStatusCredentialSubType = statusCredential.credentialSubject.type === 'StatusList2021';
        const hasValidStatusCredentialSubStatusPurpose = statusCredential.credentialSubject.statusPurpose === 'revocation';
        const hasValidStatusCredentialFormat = hasValidStatusCredentialType &&
                                               hasValidStatusCredentialSubId &&
                                               hasValidStatusCredentialSubType &&
                                               hasValidStatusCredentialSubStatusPurpose;
        if (!hasValidStatusCredentialFormat) {
          invalidStatusCredentialIds.push(statusCredential.id);
        }
      }
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

      // ensure that latest status credential is being tracked in the config
      if (!hasLatestStatusCredentialId) {
        return {
          valid: false,
          error: new InvalidRepoStateError({
            message: `Latest status credential ("${latestStatusCredentialId}") ` +
              'is not being tracked in config.'
          })
        };
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
        // includes more status credentials than we are tracking in config.
        // While the repo should not reach this state, it is relatively harmless.
      }

      // ensure that event log has valid type
      const hasValidEventLogType = Array.isArray(eventLog);
      if (!hasValidEventLogType) {
        return {
          valid: false,
          error: new InvalidRepoStateError({
            message: 'Event log must be an array.'
          })
        };
      }

      // ensure that event log is well formed
      const credentialIds = eventLog.map((value) => {
        return value.credentialId;
      });
      const credentialIdsUnique = credentialIds.filter((value, index, array) => {
        return array.indexOf(value) === index;
      });
      const credentialIdsUniqueCounter = credentialIdsUnique.length;
      const credentialsIssuedCounter = (statusCredentialIds.length - 1) *
                                       CREDENTIAL_STATUS_LIST_SIZE +
                                       latestCredentialsIssuedCounter;
      const hasValidEventsLogToConfig = credentialIdsUniqueCounter === allCredentialsIssuedCounter;
      const hasValidEventsConfigToReality = allCredentialsIssuedCounter === credentialsIssuedCounter;

      if (!hasValidEventsLogToConfig) {
        return {
          valid: false,
          error: new InvalidRepoStateError({
            message: 'There is a mismatch between the credentials tracked ' +
              `in the event log (${credentialIdsUniqueCounter}) ` +
              'and the credentials tracked ' +
              `in the config (${allCredentialsIssuedCounter}).`
          })
        };
      }

      if (!hasValidEventsConfigToReality) {
        return {
          valid: false,
          error: new InvalidRepoStateError({
            message: 'There is a mismatch between the credentials tracked ' +
              `in the config (${allCredentialsIssuedCounter}) ` +
              'and the credentials tracked ' +
              `in reality (${credentialsIssuedCounter}).`
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
  abstract getStatusCredential(statusCredentialId?: string): Promise<VerifiableCredential>;

  // updates status credential
  abstract updateStatusCredential(statusCredential: VerifiableCredential): Promise<void>;

  // deletes status credentials
  abstract deleteStatusCredentials(): Promise<void>;

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

// composes StatusList2021Credential
export async function composeStatusCredential({
  issuerDid,
  credentialId,
  statusList,
  statusPurpose = 'revocation'
}: ComposeStatusCredentialOptions): Promise<any> {
  // determine whether or not to create a new status credential
  if (!statusList) {
    statusList = await createList({ length: CREDENTIAL_STATUS_LIST_SIZE });
  }

  // create status credential
  const issuanceDate = getDateString();
  let credential = await createCredential({
    id: credentialId,
    list: statusList,
    statusPurpose
  });
  credential = {
    ...credential,
    issuer: issuerDid,
    issuanceDate
  };

  return credential;
}
