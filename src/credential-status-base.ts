import { createCredential, createList, decodeList } from '@digitalcredentials/vc-status-list';
import { CONTEXT_URL_V1 } from '@digitalbazaar/vc-status-list-context';
import { VerifiableCredential } from '@digitalcredentials/vc-data-model';
import {
  DidMethod,
  getSigningMaterial,
  signCredential
} from './helpers';

// Number of credentials tracked in a list
const CREDENTIAL_STATUS_LIST_SIZE = 100000;

// Credential status type
const CREDENTIAL_STATUS_TYPE = 'StatusList2021Entry';

// Name of credential status branch
export const CREDENTIAL_STATUS_REPO_BRANCH_NAME = 'main';

// Credential status resource names
export const CREDENTIAL_STATUS_CONFIG_FILE = 'config.json';
export const CREDENTIAL_STATUS_LOG_FILE = 'log.json';

// Type of credential status client
export enum CredentialStatusClientType {
  Github = 'github',
  Gitlab = 'gitlab'
}

// Level of visibility of credential status management repo
export enum VisibilityLevel {
  Public = 'public',
  Private = 'private'
}

// Actions applied to credentials and tracked in status log
export enum SystemFile {
  Config = 'config',
  Log = 'log',
  Status = 'status'
}

// States of credential resulting from issuer actions and tracked in status log
enum CredentialState {
  Issued = 'issued',
  Revoked = 'revoked',
  Suspended = 'suspended'
}

// Type definition for credential status config file
export interface CredentialStatusConfigData {
  credentialsIssued: number;
  latestList: string;
}

// Type definition for credential status log entry
interface CredentialStatusLogEntry {
  timestamp: string;
  credentialId: string;
  credentialIssuer: string;
  credentialSubject?: string;
  credentialState: CredentialState;
  verificationMethod: string;
  statusListId: string;
  statusListIndex: number;
}

// Type definition for credential status log
export type CredentialStatusLogData = CredentialStatusLogEntry[];

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
interface EmbedCredentialStatusResult {
  credential: any;
  newList: string | undefined;
}

// Type definition for updateStatus method input
interface UpdateStatusOptions {
  credentialId: string;
  credentialStatus: CredentialState;
}

// Type definition for BaseCredentialStatusClient constructor method input
export interface BaseCredentialStatusClientOptions {
  repoName: string;
  metaRepoName: string;
  accessToken: string;
  didMethod: DidMethod;
  didSeed: string;
  didWebUrl?: string;
  signUserCredential?: boolean;
  signStatusCredential?: boolean;
}

// Minimal set of options required for configuring BaseCredentialStatusClient
const BASE_CLIENT_REQUIRED_OPTIONS: Array<keyof BaseCredentialStatusClientOptions> = [
  'repoName',
  'metaRepoName',
  'accessToken',
  'didMethod',
  'didSeed'
];

// Base class for credential status clients
export abstract class BaseCredentialStatusClient {
  protected readonly repoName: string;
  protected readonly metaRepoName: string;
  protected readonly accessToken: string;
  protected readonly didMethod: DidMethod;
  protected readonly didSeed: string;
  protected readonly didWebUrl: string;
  protected readonly signUserCredential: boolean;
  protected readonly signStatusCredential: boolean;

  constructor(options: BaseCredentialStatusClientOptions) {
    this.ensureProperConfiguration(options);
    this.repoName = options.repoName;
    this.metaRepoName = options.metaRepoName;
    this.accessToken = options.accessToken;
    this.didMethod = options.didMethod;
    this.didSeed = options.didSeed;
    this.didWebUrl = options.didWebUrl ?? '';
    this.signUserCredential = options.signUserCredential ?? false;
    this.signStatusCredential = options.signUserCredential ?? false;
  }

  // ensures proper configuration of Base status client
  ensureProperConfiguration(options: BaseCredentialStatusClientOptions): void {
    const isProperlyConfigured = BASE_CLIENT_REQUIRED_OPTIONS.every(
      (option: keyof BaseCredentialStatusClientOptions) => {
        return !!options[option];
      }
    );
    if (!isProperlyConfigured) {
      throw new Error(
        'The following environment variables must be set for the ' +
        'Base credential status client: ' +
        `${BASE_CLIENT_REQUIRED_OPTIONS.map(o => `'${o}'`).join(', ')}.`
      );
    }
    if (this.didMethod === DidMethod.Web && !this.didWebUrl) {
      throw new Error(
        'The value of "didWebUrl" must be provided ' +
        'when using "didMethod" of type "web".'
      );
    }
  }

  // generates new status list ID
  generateStatusListId(): string {
    return Math.random().toString(36).substring(2,12).toUpperCase();
  }

  // embeds status into credential
  async embedCredentialStatus({ credential, statusPurpose = 'revocation' }: EmbedCredentialStatusOptions): Promise<EmbedCredentialStatusResult> {
    // retrieve status config
    const configData = await this.readConfigData();

    let { credentialsIssued, latestList } = configData;
    let newList;
    if (credentialsIssued >= CREDENTIAL_STATUS_LIST_SIZE) {
      // update status config data
      latestList = this.generateStatusListId();
      newList = latestList;
      credentialsIssued = 0;
    }
    credentialsIssued++;

    // update status config
    configData.credentialsIssued = credentialsIssued;
    configData.latestList = latestList;
    await this.updateConfigData(configData);

    // attach credential status
    const statusUrl = this.getCredentialStatusUrl();
    const statusListCredential = `${statusUrl}/${latestList}`;
    const statusListIndex = credentialsIssued;
    const statusListId = `${statusListCredential}#${statusListIndex}`;
    const credentialStatus = {
      id: statusListId,
      type: CREDENTIAL_STATUS_TYPE,
      statusPurpose,
      statusListIndex,
      statusListCredential
    };
    return {
      credential: {
        ...credential,
        credentialStatus,
        '@context': [...credential['@context'], CONTEXT_URL_V1]
      },
      newList
    };
  }

  // allocates status for credential
  async allocateStatus(credential: VerifiableCredential): Promise<VerifiableCredential> {
    // report error for compact JWT credentials
    if (typeof credential === 'string') {
      throw new Error('This library does not support compact JWT credentials.');
    }

    // attach status to credential
    const {
      credential: credentialWithStatus,
      newList
    } = await this.embedCredentialStatus({ credential });

    // retrieve signing material
    const {
      didMethod,
      didSeed,
      didWebUrl,
      signUserCredential,
      signStatusCredential
    } = this;
    const { issuerDid, verificationMethod } = await getSigningMaterial({
      didMethod,
      didSeed,
      didWebUrl
    });

    // create new status credential only if a new list was created
    if (newList) {
      // create status credential
      const credentialStatusUrl = this.getCredentialStatusUrl();
      const statusCredentialId = `${credentialStatusUrl}/${newList}`;
      let statusCredentialData = await composeStatusCredential({
        issuerDid,
        credentialId: statusCredentialId
      });

      // sign status credential if necessary
      if (signStatusCredential) {
        statusCredentialData = await signCredential({
          credential: statusCredentialData,
          didMethod,
          didSeed,
          didWebUrl
        });
      }

      // create and persist status data
      await this.createStatusData(statusCredentialData);
    }

    let signedCredentialWithStatus;
    if (signUserCredential) {
      // sign credential
      signedCredentialWithStatus = await signCredential({
        credential: credentialWithStatus,
        didMethod,
        didSeed,
        didWebUrl
      });
    }

    // add new entry to status log
    const {
      id: credentialStatusId,
      statusListCredential,
      statusListIndex
    } = credentialWithStatus.credentialStatus;
    // retrieve status list ID from status credential URL
    const statusListId = statusListCredential.split('/').slice(-1).pop();
    const statusLogEntry: CredentialStatusLogEntry = {
      timestamp: (new Date()).toISOString(),
      credentialId: credential.id ?? credentialStatusId,
      credentialIssuer: issuerDid,
      credentialSubject: credential.credentialSubject?.id,
      credentialState: CredentialState.Issued,
      verificationMethod,
      statusListId,
      statusListIndex
    };
    const statusLogData = await this.readLogData();
    statusLogData.push(statusLogEntry);
    await this.updateLogData(statusLogData);

    return signUserCredential ? signedCredentialWithStatus : credentialWithStatus;
  }

  // updates status for credential
  async updateStatus({
    credentialId,
    credentialStatus
  }: UpdateStatusOptions): Promise<VerifiableCredential> {
    // find relevant log entry for credential with given ID
    const logData: CredentialStatusLogData = await this.readLogData();
    const logEntry = logData.find((entry) => {
      return entry.credentialId === credentialId;
    });

    // unable to find credential with given ID
    if (!logEntry) {
      throw new Error(`Unable to find credential with given ID "${credentialId}"`);
    }

    // retrieve signing material
    const {
      didMethod,
      didSeed,
      didWebUrl,
      signStatusCredential
    } = this;
    const { issuerDid, verificationMethod } = await getSigningMaterial({
      didMethod,
      didSeed,
      didWebUrl
    });

    // retrieve status credential
    const statusCredentialDataBefore = await this.readStatusData();

    // report error for compact JWT credentials
    if (typeof statusCredentialDataBefore === 'string') {
      throw new Error('This library does not support compact JWT credentials.');
    }

    // update status credential
    const statusCredentialListEncodedBefore = statusCredentialDataBefore.credentialSubject.encodedList;
    const statusCredentialListDecoded = await decodeList({
      encodedList: statusCredentialListEncodedBefore
    });
    const { statusListId, statusListIndex } = logEntry;
    statusCredentialListDecoded.setStatus(statusListIndex, true);
    const credentialStatusUrl = this.getCredentialStatusUrl();
    const statusCredentialId = `${credentialStatusUrl}/${statusListId}`;
    let statusCredentialData = await composeStatusCredential({
      issuerDid,
      credentialId: statusCredentialId,
      statusList: statusCredentialListDecoded
    });

    // sign status credential if necessary
    if (signStatusCredential) {
      statusCredentialData = await signCredential({
        credential: statusCredentialData,
        didMethod,
        didSeed,
        didWebUrl
      });
    }

    // persist status credential
    await this.updateStatusData(statusCredentialData);

    // add new entries to status log
    const statusLogData = await this.readLogData();
    const statusLogEntry: CredentialStatusLogEntry = {
      timestamp: (new Date()).toISOString(),
      credentialId,
      credentialIssuer: issuerDid,
      credentialState: credentialStatus,
      verificationMethod,
      statusListId,
      statusListIndex
    };
    statusLogData.push(statusLogEntry);
    await this.updateLogData(statusLogData);

    return statusCredentialData;
  }

  // retrieves credential status URL
  abstract getCredentialStatusUrl(): string;

  // deploys website to host credential status management resources
  async deployCredentialStatusWebsite(): Promise<void> {};

  // checks if issuer client has access to status repo
  abstract hasStatusRepoAccess(accessToken: string): Promise<boolean>;

  // checks if status repo exists
  abstract statusRepoExists(): Promise<boolean>;

  // creates status repo
  abstract createStatusRepo(): Promise<void>;

  // syncs status repo state
  async syncStatusRepoState(): Promise<void> {};

  // creates data in config file
  abstract createConfigData(data: CredentialStatusConfigData): Promise<void>;

  // retrieves data from config file
  abstract readConfigData(): Promise<CredentialStatusConfigData>;

  // updates data in config file
  abstract updateConfigData(data: CredentialStatusConfigData): Promise<void>;

  // creates data in log file
  abstract createLogData(data: CredentialStatusLogData): Promise<void>;

  // retrieves data from log file
  abstract readLogData(): Promise<CredentialStatusLogData>;

  // updates data in log file
  abstract updateLogData(data: CredentialStatusLogData): Promise<void>;

  // creates data in status file
  abstract createStatusData(data: VerifiableCredential): Promise<void>;

  // retrieves data from status file
  abstract readStatusData(): Promise<VerifiableCredential>;

  // updates data in status file
  abstract updateStatusData(data: VerifiableCredential): Promise<void>;
}

// composes StatusList2021Credential
export async function composeStatusCredential({
  issuerDid,
  credentialId,
  statusList,
  statusPurpose = 'revocation'
}: ComposeStatusCredentialOptions): Promise<any> {
  if (!statusList) {
    statusList = await createList({ length: CREDENTIAL_STATUS_LIST_SIZE });
  }
  const issuanceDate = (new Date()).toISOString();
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
