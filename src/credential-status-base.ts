import { createList, createCredential } from '@digitalbazaar/vc-status-list';
import { CONTEXT_URL_V1 } from '@digitalbazaar/vc-status-list-context';
import { VerifiableCredential } from '@digitalcredentials/vc-data-model';
import { DidMethod, doSignCredential, getSigningMaterial } from './helpers';

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

// Type definition for signCredential function options input
export type SignCredentialOptions = {
  verificationMethod: string;
  proofPurpose?: string;
  created?: string;
  domain?: string;
  challenge?: string;
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

// Type definition for allocateStatus method input
interface AllocateStatusOptions {
  credential: any;
  didMethod: DidMethod;
  didSeed: string;
  didWebUrl?: string;
  signCredential?: boolean;
  signStatusCredential?: boolean;
}

// Type definition for embedCredentialStatus method output
interface EmbedCredentialStatusResult {
  credential: any;
  newList: string | undefined;
}

// Base class for credential status clients
export abstract class BaseCredentialStatusClient {
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
  async allocateStatus({
    credential,
    didMethod,
    didSeed,
    didWebUrl,
    signCredential=false,
    signStatusCredential=false
  }: AllocateStatusOptions): Promise<VerifiableCredential> {
    // attach status to credential
    const {
      credential: credentialWithStatus,
      newList
    } = await this.embedCredentialStatus({ credential });

    // retrieve signing material
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
        statusCredentialData = await doSignCredential({
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
    if (signCredential) {
      // sign credential
      signedCredentialWithStatus = await doSignCredential({
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
    const statusListId = statusListCredential.split('/').slice(-1).pop(); // retrieve status list id from status credential url
    const statusLogEntry: CredentialStatusLogEntry = {
      timestamp: (new Date()).toISOString(),
      credentialId: credential.id || credentialStatusId,
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

    return signCredential ? signedCredentialWithStatus : credentialWithStatus;
  }

  // retrieves credential status url
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
