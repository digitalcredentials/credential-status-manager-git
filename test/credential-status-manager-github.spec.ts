/*!
 * Copyright (c) 2023-2024 Digital Credentials Consortium. All rights reserved.
 */
import 'mocha';
import { expect } from 'chai';
import { createSandbox } from 'sinon';
import { VerifiableCredential } from '@digitalcredentials/vc-data-model';
import { Octokit } from '@octokit/rest';
import { createStatusManager } from '../src/index.js';
import {
  BaseCredentialStatusManager,
  Config,
  GitService,
  Snapshot,
  StatusPurpose
} from '../src/credential-status-manager-base.js';
import * as GitHubStatus from '../src/credential-status-manager-github.js';
import { deriveStatusCredentialId } from '../src/helpers.js';
import {
  checkLocalCredentialStatus,
  checkRemoteCredentialStatus,
  checkSnapshot,
  checkStatusCredential,
  checkUserCredentialInfo,
  didMethod,
  didSeed,
  metaRepoAccessToken,
  metaRepoName,
  ownerAccountName,
  repoAccessToken,
  repoName,
  unsignedCredential1,
  unsignedCredential2,
  unsignedCredential3
} from './helpers.js';

const sandbox = createSandbox();

class MockOctokit extends Octokit {}

class MockGitHubCredentialStatusManager extends GitHubStatus.GitHubCredentialStatusManager {
  private statusCredentials: { [key: string]: VerifiableCredential };
  private config: Config;
  private snapshot: Snapshot;

  constructor(options: GitHubStatus.GitHubCredentialStatusManagerOptions) {
    super(options);
    this.statusCredentials = {} as { [id: string]: VerifiableCredential };
    this.config = {} as Config;
    this.snapshot = {} as Snapshot;
  }

  // retrieves Git service client
  getServiceClient(accessToken: string): Octokit {
    return new MockOctokit();
  }

  // deploys website to host status credentials
  async deployStatusCredentialWebsite(): Promise<void> {}

  // checks if caller has authority to update status based on status repo access token
  async hasAuthority(repoAccessToken: string, metaRepoAccessToken?: string): Promise<boolean> { return true; }

  // checks if status repos exist
  async statusReposExist(): Promise<boolean> {
    return true;
  }

  // retrieves content of status credential repo
  async getRepo(): Promise<any> {
    throw new Error();
  }

  async getRepoFilenames(): Promise<string[]> {
    return Object.keys(this.statusCredentials);
  }

  // retrieves content of credential status metadata repo
  async getMetaRepo(): Promise<any> {
    throw new Error();
  }

  // creates status credential
  async createStatusCredential(statusCredential: VerifiableCredential): Promise<void> {
    if (typeof statusCredential === 'string') {
      throw new Error();
    }
    const statusCredentialId = deriveStatusCredentialId(statusCredential.id!);
    this.statusCredentials[statusCredentialId] = statusCredential;
  }

  // retrieves status credential
  async getStatusCredential(statusCredentialId: string): Promise<VerifiableCredential> {
    return this.statusCredentials[statusCredentialId];
  }

  // updates status credential
  async updateStatusCredential(statusCredential: VerifiableCredential): Promise<void> {
    if (typeof statusCredential === 'string') {
      throw new Error();
    }
    const statusCredentialId = deriveStatusCredentialId(statusCredential.id!);
    this.statusCredentials[statusCredentialId] = statusCredential;
  }

  // deletes status credentials
  async deleteStatusCredentials(): Promise<void> {
    this.statusCredentials = {} as { [key: string]: VerifiableCredential };
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
      didSeed,
      signStatusCredential: true,
      signUserCredential: true
    }) as GitHubStatus.GitHubCredentialStatusManager;
  });

  it('tests output of createStatusManager', async () => {
    expect(statusManager).to.be.instanceof(BaseCredentialStatusManager);
    expect(statusManager).to.be.instanceof(GitHubStatus.GitHubCredentialStatusManager);
  });

  it('tests allocateRevocationStatus', async () => {
    // allocate and check status for first credential
    const credentialWithStatus1 = await statusManager.allocateRevocationStatus(unsignedCredential1) as any;
    checkLocalCredentialStatus(credentialWithStatus1, gitService);

    // allocate and check status for second credential
    const credentialWithStatus2 = await statusManager.allocateRevocationStatus(unsignedCredential2) as any;
    checkLocalCredentialStatus(credentialWithStatus2, gitService);

    // allocate and check status for third credential
    const credentialWithStatus3 = await statusManager.allocateRevocationStatus(unsignedCredential3) as any;
    checkLocalCredentialStatus(credentialWithStatus3, gitService);

    // attempt to allocate and check status for existing credential
    const credentialWithStatus2Copy = await statusManager.allocateRevocationStatus(unsignedCredential2) as any;
    checkLocalCredentialStatus(credentialWithStatus2Copy, gitService);

    // check if status repos have valid configuration
    const repoState = await statusManager.getRepoState();
    expect(repoState.valid).to.be.true;
  });

  it('tests allocateRevocationStatus and getCredentialInfo', async () => {
    // allocate status for credential
    const credentialWithStatus = await statusManager.allocateRevocationStatus(unsignedCredential1) as any;

    // check user credential info
    const credentialInfo = await statusManager.getCredentialInfo(credentialWithStatus.id);
    checkUserCredentialInfo(credentialWithStatus.id, credentialInfo, true);

    // check if status repos have valid configuration
    const repoState = await statusManager.getRepoState();
    expect(repoState.valid).to.be.true;
  });

  it('tests revokeCredential and getStatus', async () => {
    // allocate status for credential
    const credentialWithStatus = await statusManager.allocateRevocationStatus(unsignedCredential1) as any;

    // update status of credential
    const statusCredential = await statusManager.revokeCredential(credentialWithStatus.id) as any;

    // check status credential
    checkStatusCredential(statusCredential, gitService);

    // check status of credential
    const credentialStatusInfo = await statusManager.getStatus(credentialWithStatus.id);
    checkRemoteCredentialStatus(credentialStatusInfo, false);

    // check if status repos have valid configuration
    const repoState = await statusManager.getRepoState();
    expect(repoState.valid).to.be.true;
  });

  it('tests saveSnapshot and restoreSnapshot', async () => {
    // allocate status for credentials
    await statusManager.allocateRevocationStatus(unsignedCredential1) as any;
    const credentialWithStatus2 = await statusManager.allocateRevocationStatus(unsignedCredential2) as any;
    await statusManager.allocateRevocationStatus(unsignedCredential3) as any;

    // update status of credential
    await statusManager.revokeCredential(credentialWithStatus2.id) as any;

    // save snapshot of status repos
    await statusManager.saveSnapshot();

    // check snapshot
    await checkSnapshot(
      statusManager,
      {
        [StatusPurpose.Revocation]: 3,
        [StatusPurpose.Suspension]: 0
      }, {
        [StatusPurpose.Revocation]: 1,
        [StatusPurpose.Suspension]: 0
      }
    );

    // save snapshot of status repos
    await statusManager.restoreSnapshot();

    // check if status repos have valid configuration
    const repoState = await statusManager.getRepoState();
    expect(repoState.valid).to.be.true;
  });
});
