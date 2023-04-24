/*!
 * Copyright (c) 2023 Digital Credentials Consortium. All rights reserved.
 */
import 'mocha';
import { expect } from 'chai';
import { createSandbox } from 'sinon';
import { VerifiableCredential } from '@digitalcredentials/vc-data-model';
import * as AxiosClient from 'axios';
import { createStatusManager } from '../src/index.js';
import {
  BaseCredentialStatusManager,
  CredentialState,
  CredentialStatusConfigData,
  CredentialStatusLogData,
  CredentialStatusLogEntry,
  CredentialStatusManagerService
} from '../src/credential-status-manager-base.js';
import * as GitlabStatus from '../src/credential-status-manager-gitlab.js';
import {
  accessToken,
  checkLocalCredentialStatus,
  checkRemoteCredentialStatus,
  checkStatusCredential,
  didMethod,
  didSeed,
  metaRepoId,
  metaRepoName,
  repoId,
  repoName,
  repoOrgId,
  repoOrgName,
  repoVisibility,
  statusListId,
  unsignedCredential
} from './helpers.js';

const sandbox = createSandbox();

class MockGitlabCredentialStatusManager extends GitlabStatus.GitlabCredentialStatusManager {
  private statusList: any;
  private statusConfig: CredentialStatusConfigData;
  private statusLog: CredentialStatusLogEntry[];
  private repoData: any;
  private metaRepoData: any;

  constructor(options: GitlabStatus.GitlabCredentialStatusManagerOptions) {
    const {
      repoName,
      repoId,
      metaRepoName,
      metaRepoId,
      repoOrgName,
      repoOrgId,
      repoVisibility,
      accessToken,
      didMethod,
      didSeed
    } = options;
    super({
      repoName,
      repoId,
      metaRepoName,
      metaRepoId,
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
    this.repoData = {};
    this.metaRepoData = {};
  }

  // generates new status list ID
  generateStatusListId(): string {
    return statusListId;
  }

  // deploys website to host credential status management resources
  async deployCredentialStatusWebsite(): Promise<void> {}

  // checks if caller has authority to update status
  async hasStatusAuthority(accessToken: string): Promise<boolean> { return true; }

  // checks if status repos exist
  async statusReposExist(): Promise<boolean> { return true; }

  // retrieves data from status repo
  async readRepoData(): Promise<any> {
    throw new Error();
  }

  // retrieves data from status metadata repo
  async readMetaRepoData(): Promise<any> {
    throw new Error();
  }

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

describe('GitLab Credential Status Manager', () => {
  const service = 'gitlab' as CredentialStatusManagerService;
  let statusManager: GitlabStatus.GitlabCredentialStatusManager;
  sandbox.stub(AxiosClient.default, 'create').returnsThis();
  sandbox.stub(GitlabStatus, 'GitlabCredentialStatusManager').value(MockGitlabCredentialStatusManager);

  beforeEach(async () => {
    statusManager = await createStatusManager({
      service,
      repoName,
      repoId,
      metaRepoName,
      metaRepoId,
      repoOrgName,
      repoOrgId,
      repoVisibility,
      accessToken,
      didMethod,
      didSeed
    }) as GitlabStatus.GitlabCredentialStatusManager;
  });

  it('tests output of createStatusManager', async () => {
    expect(statusManager).to.be.instanceof(BaseCredentialStatusManager);
    expect(statusManager).to.be.instanceof(GitlabStatus.GitlabCredentialStatusManager);
  });

  it('tests allocateStatus', async () => {
    // allocate and check status for first credential
    const credentialWithStatus1 = await statusManager.allocateStatus(unsignedCredential) as any;
    checkLocalCredentialStatus(credentialWithStatus1, 1, service);

    // allocate and check status for second credential
    const credentialWithStatus2 = await statusManager.allocateStatus(unsignedCredential) as any;
    checkLocalCredentialStatus(credentialWithStatus2, 2, service);

    // allocate and check status for third credential
    const credentialWithStatus3 = await statusManager.allocateStatus(unsignedCredential) as any;
    checkLocalCredentialStatus(credentialWithStatus3, 3, service);
  });

  it('tests updateStatus and checkStatus', async () => {
    // allocate status for credential
    const credentialWithStatus = await statusManager.allocateStatus(unsignedCredential) as any;

    // update status of credential
    const statusCredential = await statusManager.updateStatus({
      credentialId: credentialWithStatus.id,
      credentialStatus: 'revoked' as CredentialState
    }) as any;

    // check status credential
    checkStatusCredential(statusCredential, service);

    // check status of credential
    const credentialStatus = await statusManager.checkStatus(credentialWithStatus.id);
    checkRemoteCredentialStatus(credentialStatus, 1);
  });
});
