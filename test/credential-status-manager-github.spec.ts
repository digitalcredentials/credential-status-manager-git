/*!
 * Copyright (c) 2023 Digital Credentials Consortium. All rights reserved.
 */
import 'mocha';
import { expect } from 'chai';
import { createSandbox } from 'sinon';
import { VerifiableCredential } from '@digitalcredentials/vc-data-model';
import * as OctokitClient from '@octokit/rest';
import { createStatusManager } from '../src/index.js';
import {
  BaseCredentialStatusManager,
  CredentialState,
  CredentialStatusConfigData,
  CredentialStatusManagerService,
  CredentialStatusSnapshotData
} from '../src/credential-status-manager-base.js';
import * as GithubStatus from '../src/credential-status-manager-github.js';
import {
  checkLocalCredentialStatus,
  checkRemoteCredentialStatus,
  checkSnapshotData,
  checkStatusCredential,
  didMethod,
  didSeed,
  metaRepoAccessToken,
  metaRepoName,
  ownerAccountName,
  repoAccessToken,
  repoName,
  statusCredentialId,
  unsignedCredential1,
  unsignedCredential2,
  unsignedCredential3
} from './helpers.js';

const sandbox = createSandbox();

class MockGithubCredentialStatusManager extends GithubStatus.GithubCredentialStatusManager {
  private statusCredential: VerifiableCredential;
  private config: CredentialStatusConfigData;
  private snapshot: CredentialStatusSnapshotData;

  constructor(options: GithubStatus.GithubCredentialStatusManagerOptions) {
    const {
      ownerAccountName,
      repoName,
      metaRepoName,
      repoAccessToken,
      metaRepoAccessToken,
      didMethod,
      didSeed
    } = options;
    super({
      ownerAccountName,
      repoName,
      metaRepoName,
      repoAccessToken,
      metaRepoAccessToken,
      didMethod,
      didSeed
    });
    this.statusCredential = {} as VerifiableCredential;
    this.config = {} as CredentialStatusConfigData;
    this.snapshot = {} as CredentialStatusSnapshotData;
  }

  // generates new status credential ID
  generateStatusCredentialId(): string {
    return statusCredentialId;
  }

  // deploys website to host credential status management resources
  async deployCredentialStatusWebsite(): Promise<void> {}

  // checks if caller has authority to update status based on status repo access token
  async hasStatusAuthority(repoAccessToken: string): Promise<boolean> { return true; }

  // checks if status repos exist
  async statusReposExist(): Promise<boolean> { return true; }

  // retrieves data from status repo
  async readRepoData(): Promise<any> {
    throw new Error();
  }

  // retrieves file names from repo data
  async readRepoFilenames(): Promise<string[]> {
    return [statusCredentialId];
  }

  // retrieves data from status metadata repo
  async readMetaRepoData(): Promise<any> {
    throw new Error();
  }

  // creates data in status file
  async createStatusData(data: VerifiableCredential): Promise<void> {
    this.statusCredential = data;
  }

  // retrieves data from status file
  async readStatusData(statusCredentialId?: string): Promise<VerifiableCredential> {
    return this.statusCredential;
  }

  // updates data in status file
  async updateStatusData(data: VerifiableCredential): Promise<void> {
    this.statusCredential = data;
  }

  // deletes data in status files
  async deleteStatusData(): Promise<void> {
    this.statusCredential = {} as VerifiableCredential;
  }

  // creates data in config file
  async createConfigData(data: CredentialStatusConfigData): Promise<void> {
    this.config = data;
  }

  // retrieves data from config file
  async readConfigData(): Promise<CredentialStatusConfigData> {
    return this.config;
  }

  // updates data in config file
  async updateConfigData(data: CredentialStatusConfigData): Promise<void> {
    this.config = data;
  }

  // deletes data in config file
  async deleteConfigData(): Promise<void> {
    this.config = {} as CredentialStatusConfigData;
  }

  // creates data in snapshot file
  async createSnapshotData(data: CredentialStatusSnapshotData): Promise<void> {
    this.snapshot = data;
  }

  // retrieves data from snapshot file
  async readSnapshotData(): Promise<CredentialStatusSnapshotData> {
    return this.snapshot;
  }

  // deletes data in snapshot file
  async deleteSnapshotData(): Promise<void> {
    this.snapshot = {} as CredentialStatusSnapshotData;
  }

  // checks if snapshot data exists
  async snapshotDataExists(): Promise<boolean> {
    return Object.entries(this.snapshot).length !== 0;
  }
}

describe('GitHub Credential Status Manager', () => {
  const service = 'github' as CredentialStatusManagerService;
  let statusManager: GithubStatus.GithubCredentialStatusManager;
  sandbox.stub(OctokitClient.Octokit.prototype, 'constructor').returns(null);
  sandbox.stub(GithubStatus, 'GithubCredentialStatusManager').value(MockGithubCredentialStatusManager);

  beforeEach(async () => {
    statusManager = await createStatusManager({
      service,
      ownerAccountName,
      repoName,
      metaRepoName,
      repoAccessToken,
      metaRepoAccessToken,
      didMethod,
      didSeed
    }) as GithubStatus.GithubCredentialStatusManager;
  });

  it('tests output of createStatusManager', async () => {
    expect(statusManager).to.be.instanceof(BaseCredentialStatusManager);
    expect(statusManager).to.be.instanceof(GithubStatus.GithubCredentialStatusManager);
  });

  it('tests allocateStatus', async () => {
    // allocate and check status for first credential
    const credentialWithStatus1 = await statusManager.allocateStatus(unsignedCredential1) as any;
    checkLocalCredentialStatus(credentialWithStatus1, 1, service);

    // allocate and check status for second credential
    const credentialWithStatus2 = await statusManager.allocateStatus(unsignedCredential2) as any;
    checkLocalCredentialStatus(credentialWithStatus2, 2, service);

    // allocate and check status for third credential
    const credentialWithStatus3 = await statusManager.allocateStatus(unsignedCredential3) as any;
    checkLocalCredentialStatus(credentialWithStatus3, 3, service);

    // attempt to allocate and check status for existing credential
    const credentialWithStatus2Copy = await statusManager.allocateStatus(unsignedCredential2) as any;
    checkLocalCredentialStatus(credentialWithStatus2Copy, 2, service);

    // check if status repos are properly configured
    expect(await statusManager.statusReposProperlyConfigured()).to.be.true;
  });

  it('tests updateStatus and checkStatus', async () => {
    // allocate status for credential
    const credentialWithStatus = await statusManager.allocateStatus(unsignedCredential1) as any;

    // update status of credential
    const statusCredential = await statusManager.updateStatus({
      credentialId: credentialWithStatus.id,
      credentialStatus: 'revoked' as CredentialState
    }) as any;

    // check status credential
    checkStatusCredential(statusCredential, service);

    // check status of credential
    const credentialStatus = await statusManager.checkStatus(credentialWithStatus.id);
    checkRemoteCredentialStatus(credentialStatus, credentialWithStatus.id, 1);

    // check if status repos are properly configured
    expect(await statusManager.statusReposProperlyConfigured()).to.be.true;
  });

  it('tests saveSnapshotData and restoreSnapshotData', async () => {
    // allocate status for credentials
    await statusManager.allocateStatus(unsignedCredential1) as any;
    const credentialWithStatus2 = await statusManager.allocateStatus(unsignedCredential2) as any;
    await statusManager.allocateStatus(unsignedCredential3) as any;
    // update status of one credential
    await statusManager.updateStatus({
      credentialId: credentialWithStatus2.id,
      credentialStatus: 'revoked' as CredentialState
    }) as any;

    // save snapshot of status repos
    await statusManager.saveSnapshotData();

    // check status credential
    await checkSnapshotData(statusManager, 3, 1);

    // save snapshot of status repos
    await statusManager.restoreSnapshotData();

    // check if status repos are properly configured
    expect(await statusManager.statusReposProperlyConfigured()).to.be.true;
  });
});
