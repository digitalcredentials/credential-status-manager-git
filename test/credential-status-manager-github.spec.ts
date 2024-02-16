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
  Config,
  GitService,
  Snapshot
} from '../src/credential-status-manager-base.js';
import * as GitHubStatus from '../src/credential-status-manager-github.js';
import {
  checkLocalCredentialStatus,
  checkRemoteCredentialStatus,
  checkSnapshot,
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

class MockGitHubCredentialStatusManager extends GitHubStatus.GitHubCredentialStatusManager {
  private statusCredential: VerifiableCredential;
  private config: Config;
  private snapshot: Snapshot;

  constructor(options: GitHubStatus.GitHubCredentialStatusManagerOptions) {
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
  async hasStatusAuthority(repoAccessToken: string, metaRepoAccessToken?: string): Promise<boolean> { return true; }

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

describe('GitHub Credential Status Manager', () => {
  const gitService = 'github' as GitService;
  let statusManager: GitHubStatus.GitHubCredentialStatusManager;
  sandbox.stub(OctokitClient.Octokit.prototype, 'constructor').returns(null);
  sandbox.stub(GitHubStatus, 'GitHubCredentialStatusManager').value(MockGitHubCredentialStatusManager);

  beforeEach(async () => {
    statusManager = await createStatusManager({
      gitService,
      ownerAccountName,
      repoName,
      metaRepoName,
      repoAccessToken,
      metaRepoAccessToken,
      didMethod,
      didSeed
    }) as GitHubStatus.GitHubCredentialStatusManager;
  });

  it('tests output of createStatusManager', async () => {
    expect(statusManager).to.be.instanceof(BaseCredentialStatusManager);
    expect(statusManager).to.be.instanceof(GitHubStatus.GitHubCredentialStatusManager);
  });

  it('tests allocateStatus', async () => {
    // allocate and check status for first credential
    const credentialWithStatus1 = await statusManager.allocateStatus(unsignedCredential1) as any;
    checkLocalCredentialStatus(credentialWithStatus1, 1, gitService);

    // allocate and check status for second credential
    const credentialWithStatus2 = await statusManager.allocateStatus(unsignedCredential2) as any;
    checkLocalCredentialStatus(credentialWithStatus2, 2, gitService);

    // allocate and check status for third credential
    const credentialWithStatus3 = await statusManager.allocateStatus(unsignedCredential3) as any;
    checkLocalCredentialStatus(credentialWithStatus3, 3, gitService);

    // attempt to allocate and check status for existing credential
    const credentialWithStatus2Copy = await statusManager.allocateStatus(unsignedCredential2) as any;
    checkLocalCredentialStatus(credentialWithStatus2Copy, 2, gitService);

    // check if status repos have valid configuration
    const repoState = await statusManager.getRepoState();
    expect(repoState.valid).to.be.true;
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
    await statusManager.allocateStatus(unsignedCredential1) as any;
    const credentialWithStatus2 = await statusManager.allocateStatus(unsignedCredential2) as any;
    await statusManager.allocateStatus(unsignedCredential3) as any;
    // update status of one credential
    await statusManager.updateStatus({
      credentialId: credentialWithStatus2.id,
      credentialStatus: 'revoked' as CredentialState
    }) as any;

    // save snapshot of status repos
    await statusManager.saveSnapshot();

    // check status credential
    await checkSnapshot(statusManager, 3, 1);

    // save snapshot of status repos
    await statusManager.restoreSnapshot();

    // check if status repos have valid configuration
    const repoState = await statusManager.getRepoState();
    expect(repoState.valid).to.be.true;
  });
});
