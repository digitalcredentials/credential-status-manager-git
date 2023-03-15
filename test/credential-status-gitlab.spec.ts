import 'mocha';
import { expect } from 'chai';
import { createSandbox } from 'sinon';
import { VerifiableCredential } from '@digitalcredentials/vc-data-model';
import * as AxiosClient from 'axios';
import { createStatusListManager } from '../src';
import {
  BaseCredentialStatusClient,
  CredentialState,
  CredentialStatusClientType,
  CredentialStatusConfigData,
  CredentialStatusLogData,
  CredentialStatusLogEntry
} from '../src/credential-status-base';
import * as GitlabCredentialStatus from '../src/credential-status-gitlab';
import {
  accessToken,
  checkLocalCredentialStatus,
  checkRemoteCredentialStatus,
  checkStatusCredential,
  didMethod,
  didSeed,
  metaRepoName,
  repoName,
  repoOrgId,
  repoOrgName,
  repoVisibility,
  statusListId,
  unsignedCredential
} from './helpers';

const sandbox = createSandbox();

class MockGitlabCredentialStatusClient extends GitlabCredentialStatus.GitlabCredentialStatusClient {
  private statusList: any;
  private statusConfig: CredentialStatusConfigData;
  private statusLog: CredentialStatusLogEntry[];

  constructor(options: GitlabCredentialStatus.GitlabCredentialStatusClientOptions) {
    const {
      repoName,
      metaRepoName,
      repoOrgName,
      repoOrgId,
      repoVisibility,
      accessToken,
      didMethod,
      didSeed
    } = options;
    super({
      repoName,
      metaRepoName,
      repoOrgName,
      repoOrgId,
      repoVisibility,
      accessToken,
      didMethod,
      didSeed
    });
    this.statusList = {};
    this.statusConfig = {} as CredentialStatusConfigData;
    this.statusLog = [];
  }

  // generates new status list ID
  generateStatusListId(): string {
    return statusListId;
  }

  // deploys website to host credential status management resources
  async deployCredentialStatusWebsite(): Promise<void> {}

  // checks if issuer client has access to status repo
  async hasStatusRepoAccess(accessToken: string): Promise<boolean> { return true; }

  // checks if status repo exists
  async statusRepoExists(): Promise<boolean> {
    return false;
  }

  // creates status repo
  async createStatusRepo(): Promise<void> {}

  // creates data in config file
  async createConfigData(data: CredentialStatusConfigData): Promise<void> {
    this.statusConfig = data;
  }

  // retrieves data from config file
  async readConfigData(): Promise<CredentialStatusConfigData> {
    return this.statusConfig;
  }

  // updates data in config file
  async updateConfigData(data: CredentialStatusConfigData): Promise<void> {
    this.statusConfig = data;
  }

  // creates data in log file
  async createLogData(data: CredentialStatusLogData): Promise<void> {
    this.statusLog = data;
  }

  // retrieves data from log file
  async readLogData(): Promise<CredentialStatusLogData> {
    return this.statusLog;
  }

  // updates data in log file
  async updateLogData(data: CredentialStatusLogData): Promise<void> {
    this.statusLog = data;
  }

  // creates data in status file
  async createStatusData(data: VerifiableCredential): Promise<void> {
    this.statusList = data;
  }

  // retrieves data from status file
  async readStatusData(): Promise<VerifiableCredential> {
    return this.statusList;
  }

  // updates data in status file
  async updateStatusData(data: VerifiableCredential): Promise<void> {
    this.statusList = data;
  }
}

describe('GitLab Status Client', () => {
  const clientType = 'gitlab' as CredentialStatusClientType;
  let statusClient: GitlabCredentialStatus.GitlabCredentialStatusClient;
  sandbox.stub(AxiosClient.default, 'create').returnsThis();
  sandbox.stub(GitlabCredentialStatus, 'GitlabCredentialStatusClient').value(MockGitlabCredentialStatusClient);

  beforeEach(async () => {
    statusClient = await createStatusListManager({
      clientType,
      repoName,
      metaRepoName,
      repoOrgName,
      repoOrgId,
      repoVisibility,
      accessToken,
      didMethod,
      didSeed
    }) as GitlabCredentialStatus.GitlabCredentialStatusClient;
  });

  it('tests output of createStatusListManager', async () => {
    expect(statusClient).to.be.instanceof(BaseCredentialStatusClient);
    expect(statusClient).to.be.instanceof(GitlabCredentialStatus.GitlabCredentialStatusClient);
  });

  it('tests allocateStatus', async () => {
    // allocate and check status for first credential
    const credentialWithStatus1 = await statusClient.allocateStatus(unsignedCredential) as any;
    checkLocalCredentialStatus(credentialWithStatus1, 1, clientType);

    // allocate and check status for second credential
    const credentialWithStatus2 = await statusClient.allocateStatus(unsignedCredential) as any;
    checkLocalCredentialStatus(credentialWithStatus2, 2, clientType);

    // allocate and check status for third credential
    const credentialWithStatus3 = await statusClient.allocateStatus(unsignedCredential) as any;
    checkLocalCredentialStatus(credentialWithStatus3, 3, clientType);
  });

  it('tests updateStatus and checkStatus', async () => {
    // allocate status for credential
    const credentialWithStatus = await statusClient.allocateStatus(unsignedCredential) as any;

    // update status of credential
    const statusCredential = await statusClient.updateStatus({
      credentialId: credentialWithStatus.id,
      credentialStatus: 'revoked' as CredentialState
    }) as any;

    // check status credential
    checkStatusCredential(statusCredential, clientType);

    // check status of credential
    const credentialStatus = await statusClient.checkStatus(credentialWithStatus.id);
    checkRemoteCredentialStatus(credentialStatus, 1);
  });
});
