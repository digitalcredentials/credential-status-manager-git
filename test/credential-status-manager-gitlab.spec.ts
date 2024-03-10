/*!
 * Copyright (c) 2023-2024 Digital Credentials Consortium. All rights reserved.
 */
import 'mocha';
import { expect } from 'chai';
import { createSandbox } from 'sinon';
import { VerifiableCredential } from '@digitalcredentials/vc-data-model';
import * as Axios from 'axios';
import { createStatusManager } from '../src/index.js';
import {
  BaseCredentialStatusManager,
  Config,
  GitService,
  Snapshot
} from '../src/credential-status-manager-base.js';
import * as GitLabStatus from '../src/credential-status-manager-gitlab.js';
import {
  checkLocalCredentialStatus,
  checkRemoteCredentialStatus,
  checkSnapshot,
  checkStatusCredential,
  didMethod,
  didSeed,
  metaRepoAccessToken,
  metaRepoId,
  metaRepoName,
  ownerAccountName,
  repoAccessToken,
  repoId,
  repoName,
  statusCredentialId,
  unsignedCredential1,
  unsignedCredential2,
  unsignedCredential3
} from './helpers.js';

const sandbox = createSandbox();

class MockGitLabCredentialStatusManager extends GitLabStatus.GitLabCredentialStatusManager {
  private statusCredential: VerifiableCredential;
  private config: Config;
  private snapshot: Snapshot;

  constructor(options: GitLabStatus.GitLabCredentialStatusManagerOptions) {
    super(options);
    this.statusCredential = {} as VerifiableCredential;
    this.config = {} as Config;
    this.snapshot = {} as Snapshot;
  }

  // generates new status credential ID
  generateStatusCredentialId(): string {
    return statusCredentialId;
  }

  // deploys website to host credential status management resources
  async deployCredentialStatusWebsite(): Promise<void> {}

  // checks if caller has authority to update status based on status repo access token
  async hasAuthority(repoAccessToken: string, metaRepoAccessToken?: string): Promise<boolean> { return true; }

  // checks if status repos exist
  async statusReposExist(): Promise<boolean> { return true; }

  // retrieves content of status credential repo
  async getRepo(): Promise<any> {
    throw new Error();
  }

  // retrieves filenames of status credential repo content
  async getRepoFilenames(): Promise<string[]> {
    return [statusCredentialId];
  }

  // retrieves content of credential status metadata repo
  async getMetaRepo(): Promise<any> {
    throw new Error();
  }

  // creates status credential
  async createStatusCredential(statusCredential: VerifiableCredential): Promise<void> {
    this.statusCredential = statusCredential;
  }

  // retrieves status credential
  async getStatusCredential(statusCredentialId?: string): Promise<VerifiableCredential> {
    return this.statusCredential;
  }

  // updates status credential
  async updateStatusCredential(statusCredential: VerifiableCredential): Promise<void> {
    this.statusCredential = statusCredential;
  }

  // deletes status credentials
  async deleteStatusCredentials(): Promise<void> {
    this.statusCredential = {} as VerifiableCredential;
  }

  // creates config
  async createConfig(config: Config): Promise<void> {
    this.config = config;
  }

  // retrieves config
  async getConfig(): Promise<Config> {
    return this.config;
  }

  // updates config
  async updateConfig(config: Config): Promise<void> {
    this.config = config;
  }

  // deletes config
  async deleteConfig(): Promise<void> {
    this.config = {} as Config;
  }

  // creates snapshot
  async createSnapshot(snapshot: Snapshot): Promise<void> {
    this.snapshot = snapshot;
  }

  // retrieves snapshot
  async getSnapshot(): Promise<Snapshot> {
    return this.snapshot;
  }

  // deletes snapshot
  async deleteSnapshot(): Promise<void> {
    this.snapshot = {} as Snapshot;
  }

  // checks if snapshot exists
  async snapshotExists(): Promise<boolean> {
    return Object.entries(this.snapshot).length !== 0;
  }
}

describe('GitLab Credential Status Manager', () => {
  const gitService = 'gitlab' as GitService;
  let statusManager: GitLabStatus.GitLabCredentialStatusManager;
  sandbox.stub(Axios.default, 'create').returnsThis();
  sandbox.stub(GitLabStatus, 'GitLabCredentialStatusManager').value(MockGitLabCredentialStatusManager);

  beforeEach(async () => {
    statusManager = await createStatusManager({
      gitService,
      ownerAccountName,
      repoName,
      repoId,
      metaRepoName,
      metaRepoId,
      repoAccessToken,
      metaRepoAccessToken,
      didMethod,
      didSeed,
      signStatusCredential: true,
      signUserCredential: true
    }) as GitLabStatus.GitLabCredentialStatusManager;
  });

  it('tests output of createStatusManager', async () => {
    expect(statusManager).to.be.instanceof(BaseCredentialStatusManager);
    expect(statusManager).to.be.instanceof(GitLabStatus.GitLabCredentialStatusManager);
  });

  it('tests allocateStatus', async () => {
    // allocate and check status for first credential
    const credentialWithStatus1 = await statusManager.allocateRevocationStatus(unsignedCredential1) as any;
    checkLocalCredentialStatus(credentialWithStatus1, 1, gitService);

    // allocate and check status for second credential
    const credentialWithStatus2 = await statusManager.allocateRevocationStatus(unsignedCredential2) as any;
    checkLocalCredentialStatus(credentialWithStatus2, 2, gitService);

    // allocate and check status for third credential
    const credentialWithStatus3 = await statusManager.allocateRevocationStatus(unsignedCredential3) as any;
    checkLocalCredentialStatus(credentialWithStatus3, 3, gitService);

    // attempt to allocate and check status for existing credential
    const credentialWithStatus2Copy = await statusManager.allocateRevocationStatus(unsignedCredential2) as any;
    checkLocalCredentialStatus(credentialWithStatus2Copy, 2, gitService);

    // check if status repos have valid configuration
    const repoState = await statusManager.getRepoState();
    expect(repoState.valid).to.be.true;
  });

  it('tests updateStatus and checkStatus', async () => {
    // allocate status for credential
    const credentialWithStatus = await statusManager.allocateRevocationStatus(unsignedCredential1) as any;

    // update status of credential
    const statusCredential = await statusManager.revokeCredential(credentialWithStatus.id) as any;

    // check status credential
    checkStatusCredential(statusCredential, gitService);

    // check status of credential
    const credentialStatus = await statusManager.checkStatus(credentialWithStatus.id);
    checkRemoteCredentialStatus(credentialStatus, credentialWithStatus.id, 1);

    // check if status repos have valid configuration
    const repoState = await statusManager.getRepoState();
    expect(repoState.valid).to.be.true;
  });

  it('tests saveSnapshot and restoreSnapshot', async () => {
    // allocate status for credentials
    await statusManager.allocateRevocationStatus(unsignedCredential1) as any;
    const credentialWithStatus2 = await statusManager.allocateRevocationStatus(unsignedCredential2) as any;
    await statusManager.allocateRevocationStatus(unsignedCredential3) as any;
    // update status of one credential
    await statusManager.revokeCredential(credentialWithStatus2.id) as any;

    // save snapshot of status repos
    await statusManager.saveSnapshot();

    // check snapshot
    await checkSnapshot(statusManager, 3, 1);

    // save snapshot of status repos
    await statusManager.restoreSnapshot();

    // check if status repos have valid configuration
    const repoState = await statusManager.getRepoState();
    expect(repoState.valid).to.be.true;
  });
});
