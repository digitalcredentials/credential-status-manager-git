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
  InconsistentRepositoryError,
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

// Credential status manager source control service
export enum CredentialStatusManagerService {
  GitHub = 'github',
  GitLab = 'gitlab'
}

// States of credential resulting from caller actions and tracked in status log
export enum CredentialState {
  Active = 'active',
  Revoked = 'revoked'
}

// Type definition for credential status log entry
interface CredentialStatusLogEntry {
  timestamp: string;
  credentialId: string;
  credentialIssuer: string;
  credentialSubject?: string;
  credentialState: CredentialState;
  verificationMethod: string;
  statusCredentialId: string;
  credentialStatusIndex: number;
}

// Type definition for credential status log
type CredentialStatusLogData = CredentialStatusLogEntry[];

// Type definition for credential status config file
export interface CredentialStatusConfigData {
  latestStatusCredentialId: string;
  latestCredentialsIssuedCounter: number;
  statusCredentialIds: string[];
  eventLog: CredentialStatusLogData;
}

// Type definition for credential status snapshot file
export type CredentialStatusSnapshotData = CredentialStatusConfigData & {
  statusCredentials: Record<string, VerifiableCredential>;
};

// Type definition for composeStatusCredential function input
interface ComposeStatusCredentialOptions {
  issuerDid: string;
  credentialId: string;
  statusList?: any;
  statusPurpose?: string;
}

// Type definition for embedCredentialStatus method input
interface EmbedCredentialStatusOptions {
  credential: any;
  statusPurpose?: string;
}

// Type definition for embedCredentialStatus method output
type EmbedCredentialStatusResult = CredentialStatusConfigData & {
  credential: any;
  newStatusCredential: boolean;
};

// Type definition for updateStatus method input
interface UpdateStatusOptions {
  credentialId: string;
  credentialStatus: CredentialState;
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
  generateStatusCredentialId(): string {
    return Math.random().toString(36).substring(2, 12).toUpperCase();
  }

  // embeds status into credential
  async embedCredentialStatus({ credential, statusPurpose = 'revocation' }: EmbedCredentialStatusOptions): Promise<EmbedCredentialStatusResult> {
    // ensure that credential has ID
    if (!credential.id) {
      // Note: This assumes that uuid will never generate an ID that
      // conflicts with an ID that has already been tracked in the log
      credential.id = uuid();
    }

    // retrieve status config data
    let {
      latestStatusCredentialId,
      latestCredentialsIssuedCounter,
      statusCredentialIds,
      eventLog
    } = await this.readConfigData();

    // find latest relevant log entry for credential with given ID
    eventLog.reverse();
    const logEntry = eventLog.find((entry) => {
      return entry.credentialId === credential.id;
    });
    eventLog.reverse();

    // do not allocate new entry if ID is already being tracked
    if (logEntry) {
      // retrieve relevant log data
      const { statusCredentialId, credentialStatusIndex } = logEntry;

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
          credentialStatus,
          '@context': ensureStatusCredentialContext(credential['@context'])
        },
        newStatusCredential: false,
        latestStatusCredentialId,
        latestCredentialsIssuedCounter,
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
        credentialStatus,
        '@context': ensureStatusCredentialContext(credential['@context'])
      },
      newStatusCredential,
      latestStatusCredentialId,
      latestCredentialsIssuedCounter,
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
      newStatusCredential,
      latestStatusCredentialId,
      eventLog,
      ...embedCredentialStatusResultRest
    } = await this.embedCredentialStatus({ credential });

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

      // create and persist status data
      await this.createStatusData(statusCredential);
    }

    // sign credential if necessary
    if (signUserCredential) {
      credentialWithStatus = await signCredential({
        credential: credentialWithStatus,
        didMethod,
        didSeed,
        didWebUrl
      });
    }

    // extract relevant data from credential status
    const {
      statusListCredential: statusCredentialUrl,
      statusListIndex
    } = credentialWithStatus.credentialStatus;

    // retrieve status credential ID from status credential URL
    const statusCredentialId = deriveStatusCredentialId(statusCredentialUrl);

    // add new entry to status log
    const statusLogEntry: CredentialStatusLogEntry = {
      timestamp: getDateString(),
      credentialId: credential.id as string,
      credentialIssuer: issuerDid,
      credentialSubject: credential.credentialSubject?.id,
      credentialState: CredentialState.Active,
      verificationMethod,
      statusCredentialId,
      credentialStatusIndex: parseInt(statusListIndex)
    };
    eventLog.push(statusLogEntry);

    // persist updates to config data
    await this.updateConfigData({
      latestStatusCredentialId,
      eventLog,
      ...embedCredentialStatusResultRest
    });

    return credentialWithStatus;
  }

  // allocates status for credential in thread-safe manner
  async allocateStatus(credential: VerifiableCredential): Promise<VerifiableCredential> {
    const release = await this.lock.acquire();
    try {
      await this.cleanupSnapshotData();
      await this.saveSnapshotData();
      const result = await this.allocateStatusUnsafe(credential);
      return result;
    } catch(error) {
      if (!(error instanceof InconsistentRepositoryError)) {
        return this.allocateStatus(credential);
      } else {
        throw error;
      }
    } finally {
      await this.cleanupSnapshotData();
      release();
    }
  }

  // updates status of credential in race-prone manner
  async updateStatusUnsafe({
    credentialId,
    credentialStatus
  }: UpdateStatusOptions): Promise<VerifiableCredential> {
    // find latest relevant log entry for credential with given ID
    const { eventLog, ...configRest } = await this.readConfigData();
    eventLog.reverse();
    const logEntry = eventLog.find((entry) => {
      return entry.credentialId === credentialId;
    });
    eventLog.reverse();

    // unable to find credential with given ID
    if (!logEntry) {
      throw new BadRequestError({
        message: `Unable to find credential with given ID "${credentialId}".`
      });
    }

    // retrieve relevant log data
    const {
      credentialSubject,
      statusCredentialId,
      credentialStatusIndex
    } = logEntry;

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
    const statusCredentialBefore = await this.readStatusData(statusCredentialId);

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
        statusCredentialListDecoded.setStatus(credentialStatusIndex, false); // active credential is represented as 0 bit
        break;
      case CredentialState.Revoked:
        statusCredentialListDecoded.setStatus(credentialStatusIndex, true); // revoked credential is represented as 1 bit
        break;
      default:
        throw new BadRequestError({
          message:
            '"credentialStatus" must be one of the following values: ' +
            `${Object.values(CredentialState).map(v => `'${v}'`).join(', ')}.`
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
    await this.updateStatusData(statusCredential);

    // add new entries to status log
    const statusLogEntry: CredentialStatusLogEntry = {
      timestamp: getDateString(),
      credentialId,
      credentialIssuer: issuerDid,
      credentialSubject,
      credentialState: credentialStatus,
      verificationMethod,
      statusCredentialId,
      credentialStatusIndex
    };
    eventLog.push(statusLogEntry);
    await this.updateConfigData({ eventLog, ...configRest });

    return statusCredential;
  }

  // updates status of credential in thread-safe manner
  async updateStatus({
    credentialId,
    credentialStatus
  }: UpdateStatusOptions): Promise<VerifiableCredential> {
    const release = await this.lock.acquire();
    try {
      await this.cleanupSnapshotData();
      await this.saveSnapshotData();
      const result = await this.updateStatusUnsafe({ credentialId, credentialStatus });
      return result;
    } catch(error) {
      if (!(error instanceof InconsistentRepositoryError)) {
        return this.updateStatus({
          credentialId,
          credentialStatus
        });
      } else {
        throw error;
      }
    } finally {
      await this.cleanupSnapshotData();
      release();
    }
  }

  // checks status of credential
  async checkStatus(credentialId: string): Promise<CredentialStatusLogEntry> {
    // find latest relevant log entry for credential with given ID
    const { eventLog } = await this.readConfigData();
    eventLog.reverse();
    const logEntry = eventLog.find((entry) => {
      return entry.credentialId === credentialId;
    }) as CredentialStatusLogEntry;

    // unable to find credential with given ID
    if (!logEntry) {
      throw new BadRequestError({
        message: `Unable to find credential with given ID "${credentialId}".`
      });
    }

    return logEntry;
  }

  // retrieves credential status URL
  abstract getStatusCredentialUrlBase(): string;

  // deploys website to host credential status management resources
  async deployCredentialStatusWebsite(): Promise<void> {};

  // checks if caller has authority to update status based on status repo access token
  abstract hasStatusAuthority(repoAccessToken: string, metaRepoAccessToken?: string): Promise<boolean>;

  // checks if status repos exist
  abstract statusReposExist(): Promise<boolean>;

  // checks if status repos are empty
  abstract statusReposEmpty(): Promise<boolean>;

  // checks if status repos are properly configured
  async statusReposProperlyConfigured(): Promise<boolean> {
    try {
      // retrieve config data
      const {
        latestStatusCredentialId,
        latestCredentialsIssuedCounter,
        statusCredentialIds,
        eventLog
      } = await this.readConfigData();
      const statusCredentialUrlBase = this.getStatusCredentialUrlBase();
      const statusCredentialUrl = `${statusCredentialUrlBase}/${latestStatusCredentialId}`;

      // ensure status data is consistent
      let hasLatestStatusCredentialId = false;
      for (const statusCredentialId of statusCredentialIds) {
        // retrieve status credential
        const statusData = await this.readStatusData(statusCredentialId);

        // ensure status data has proper type
        if (typeof statusData === 'string') {
          return false;
        }

        // ensure status credential is well formed
        hasLatestStatusCredentialId = hasLatestStatusCredentialId || (statusData.id?.endsWith(latestStatusCredentialId) ?? false);
        const hasProperStatusCredentialType = statusData.type.includes('StatusList2021Credential');
        const hasProperStatusCredentialSubId = statusData.credentialSubject.id?.startsWith(statusCredentialUrl) ?? false;
        const hasProperStatusCredentialSubType = statusData.credentialSubject.type === 'StatusList2021';
        const hasProperStatusCredentialSubStatusPurpose = statusData.credentialSubject.statusPurpose === 'revocation';
        const hasProperStatusFormat = hasProperStatusCredentialType &&
                                      hasProperStatusCredentialSubId &&
                                      hasProperStatusCredentialSubType &&
                                      hasProperStatusCredentialSubStatusPurpose;
        if (!hasProperStatusFormat) {
          return false;
        }
      }
      // ensure that latest status credential is being tracked in the config
      if (!hasLatestStatusCredentialId) {
        return false;
      }

      // ensure that all status credentials are being tracked in the config
      const repoFilenames = await this.readRepoFilenames();
      if (repoFilenames.length !== statusCredentialIds.length) {
        return false;
      }
      repoFilenames.sort();
      statusCredentialIds.sort();
      const hasAllStatusCredentialIds = repoFilenames.every((value, index) => {
        return value === statusCredentialIds[index];
      });
      if (!hasAllStatusCredentialIds) {
        return false;
      }

      // ensure log data is well formed
      const hasProperLogDataType = Array.isArray(eventLog);
      const credentialIds = eventLog.map((value) => {
        return value.credentialId;
      });
      const credentialIdsUnique = credentialIds.filter((value, index, array) => {
        return array.indexOf(value) === index;
      });
      const hasProperLogEntries = credentialIdsUnique.length === latestCredentialsIssuedCounter;

      // ensure that all checks pass
      return hasProperLogDataType && hasProperLogEntries;
    } catch (error) {
      return false;
    }
  }

  // retrieves data from status repo
  abstract readRepoData(): Promise<any>;

  // retrieves file names from repo data
  abstract readRepoFilenames(): Promise<string[]>;

  // retrieves data from status metadata repo
  abstract readMetaRepoData(): Promise<any>;

  // creates data in status file
  abstract createStatusData(data: VerifiableCredential): Promise<void>;

  // retrieves data from status file
  abstract readStatusData(statusCredentialId?: string): Promise<VerifiableCredential>;

  // updates data in status file
  abstract updateStatusData(data: VerifiableCredential): Promise<void>;

  // deletes data in status files
  abstract deleteStatusData(): Promise<void>;

  // creates data in config file
  abstract createConfigData(data: CredentialStatusConfigData): Promise<void>;

  // retrieves data from config file
  abstract readConfigData(): Promise<CredentialStatusConfigData>;

  // updates data in config file
  abstract updateConfigData(data: CredentialStatusConfigData): Promise<void>;

  // deletes data in config file
  abstract deleteConfigData(): Promise<void>;

  // creates data in snapshot file
  abstract createSnapshotData(data: CredentialStatusSnapshotData): Promise<void>;

  // retrieves data from snapshot file
  abstract readSnapshotData(): Promise<CredentialStatusSnapshotData>;

  // deletes data in snapshot file
  abstract deleteSnapshotData(): Promise<void>;

  // checks if snapshot data exists
  abstract snapshotDataExists(): Promise<boolean>;

  // saves snapshot of status repos
  async saveSnapshotData(): Promise<void> {
    // ensure that snapshot data does not exist
    const snapshotExists = await this.snapshotDataExists();
    if (snapshotExists) {
      throw new SnapshotExistsError();
    }

    // retrieve status config data
    const {
      statusCredentialIds,
      ...configRest
    } = await this.readConfigData();

    // retrieve status credential data
    const statusCredentials: Record<string, VerifiableCredential> = {};
    for (const statusCredentialId of statusCredentialIds) {
      statusCredentials[statusCredentialId] = await this.readStatusData(statusCredentialId);
    }

    // create snapshot data
    const snapshotData: CredentialStatusSnapshotData = {
      statusCredentialIds,
      statusCredentials,
      ...configRest
    };
    await this.createSnapshotData(snapshotData);
  }

  // restores snapshot of status repos
  async restoreSnapshotData(): Promise<void> {
    // retrieve snapshot data
    const {
      statusCredentials,
      ...configData
    } = await this.readSnapshotData();

    // this is necssary for cases in which a transactional operation such as
    // allocateStatus results in a new status credential file but must be
    // reversed because of an intermittent interruption
    await this.deleteStatusData();
    await this.deleteConfigData();

    // restore status credential data
    for (const [, statusCredential] of Object.entries(statusCredentials)) {
      await this.createStatusData(statusCredential);
    }

    // restore status config data
    await this.createConfigData(configData);

    // delete snapshot data
    await this.deleteSnapshotData();
  }

  async cleanupSnapshotData(): Promise<void> {
    const reposProperlyConfigured = await this.statusReposProperlyConfigured();
    const snapshotExists = await this.snapshotDataExists();
    if (!reposProperlyConfigured) {
      if (snapshotExists) {
        await this.restoreSnapshotData();
      } else {
        throw new InconsistentRepositoryError({ statusManager: this });
      }
    } else {
      if (snapshotExists) {
        await this.deleteSnapshotData();
      }
    }
  }
}

// ensures that the proper status credential context is included
const ensureStatusCredentialContext = (currentContext: any[]): void => {
  if (!currentContext.includes(CONTEXT_URL_V1)) {
    currentContext.push(CONTEXT_URL_V1);
  }
};

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
