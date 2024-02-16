/*!
 * Copyright (c) 2023 Digital Credentials Consortium. All rights reserved.
 */
import { VerifiableCredential } from '@digitalcredentials/vc-data-model';
import { Octokit } from '@octokit/rest';
import {
  BASE_MANAGER_REQUIRED_OPTIONS,
  CREDENTIAL_STATUS_CONFIG_FILE,
  CREDENTIAL_STATUS_REPO_BRANCH_NAME,
  CREDENTIAL_STATUS_SNAPSHOT_FILE,
  BaseCredentialStatusManager,
  BaseCredentialStatusManagerOptions,
  Config,
  Snapshot
} from './credential-status-manager-base.js';
import { BadRequestError } from './errors.js';
import {
  DidMethod,
  decodeSystemData,
  deriveStatusCredentialId,
  encodeAsciiAsBase64,
  getDateString
} from './helpers.js';

// Type definition for GitHubCredentialStatusManager constructor method input
export type GitHubCredentialStatusManagerOptions = {
  ownerAccountName: string;
} & BaseCredentialStatusManagerOptions;

// Minimal set of options required for configuring GitHubCredentialStatusManager
const GITHUB_MANAGER_REQUIRED_OPTIONS = [
  'ownerAccountName'
].concat(BASE_MANAGER_REQUIRED_OPTIONS) as
  Array<keyof GitHubCredentialStatusManagerOptions & BaseCredentialStatusManagerOptions>;

// Implementation of BaseCredentialStatusManager for GitHub
export class GitHubCredentialStatusManager extends BaseCredentialStatusManager {
  private readonly ownerAccountName: string;
  private repoClient: Octokit;
  private metaRepoClient: Octokit;

  constructor(options: GitHubCredentialStatusManagerOptions) {
    const {
      ownerAccountName,
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
    super({
      repoName,
      metaRepoName,
      repoAccessToken,
      metaRepoAccessToken,
      didMethod,
      didSeed,
      didWebUrl,
      signUserCredential,
      signStatusCredential
    });
    this.ensureValidConfiguration(options);
    this.ownerAccountName = ownerAccountName;
    this.repoClient = new Octokit({ auth: repoAccessToken });
    this.metaRepoClient = new Octokit({ auth: metaRepoAccessToken });
  }

  // ensures valid configuration of GitHub status manager
  ensureValidConfiguration(options: GitHubCredentialStatusManagerOptions): void {
    const missingOptions = [] as
      Array<keyof GitHubCredentialStatusManagerOptions & BaseCredentialStatusManagerOptions>;

    const hasValidConfiguration = GITHUB_MANAGER_REQUIRED_OPTIONS.every(
      (option: keyof GitHubCredentialStatusManagerOptions) => {
        if (!options[option]) {
          missingOptions.push(option as any);
        }
        return !!options[option];
      }
    );

    if (!hasValidConfiguration) {
      throw new BadRequestError({
        message:
          'You have neglected to set the following required options for the ' +
          'GitHub credential status manager: ' +
          `${missingOptions.map(o => `"${o}"`).join(', ')}.`
      });
    }

    if (this.didMethod === DidMethod.Web && !this.didWebUrl) {
      throw new BadRequestError({
        message:
          'The value of "didWebUrl" must be provided ' +
          'when using "didMethod" of type "web".'
      });
    }
  }

  // retrieves status credential base URL
  getStatusCredentialUrlBase(): string {
    return `https://${this.ownerAccountName}.github.io/${this.repoName}`;
  }

  // deploys website to host credential status management resources
  async deployCredentialStatusWebsite(): Promise<void> {
    await this.repoClient.repos.createPagesSite({
      owner: this.ownerAccountName,
      repo: this.repoName,
      source: { branch: CREDENTIAL_STATUS_REPO_BRANCH_NAME }
    });
  }

  // resets client authorization
  resetClientAuthorization(repoAccessToken: string, metaRepoAccessToken?: string): void {
    this.repoClient = new Octokit({ auth: repoAccessToken });
    if (metaRepoAccessToken) {
      this.metaRepoClient = new Octokit({ auth: metaRepoAccessToken });
    }
  }

  // checks if caller has authority to update status based on status repo access token
  async hasStatusAuthority(repoAccessToken: string, metaRepoAccessToken?: string): Promise<boolean> {
    this.resetClientAuthorization(repoAccessToken, metaRepoAccessToken);

    let hasRepoAccess: boolean;
    let hasRepoScope: boolean;
    try {
      const repoResponse = await this.repoClient.repos.get({
        owner: this.ownerAccountName,
        repo: this.repoName
      });
      const repo = repoResponse.data;
      hasRepoAccess = repo.full_name === `${this.ownerAccountName}/${this.repoName}`;
      hasRepoScope = (repo.permissions?.admin &&
        repo.permissions?.push &&
        repo.permissions?.pull) as boolean;
    } catch (error) {
      hasRepoAccess = false;
      hasRepoScope = false;
    }

    let hasMetaRepoAccess: boolean;
    let hasMetaRepoScope: boolean;
    try {
      const metaRepoResponse = await this.metaRepoClient.repos.get({
        owner: this.ownerAccountName,
        repo: this.repoName
      });
      const metaRepo = metaRepoResponse.data;
      hasMetaRepoAccess = metaRepo.full_name === `${this.ownerAccountName}/${this.metaRepoName}`;
      hasMetaRepoScope = (metaRepo.permissions?.admin &&
        metaRepo.permissions?.push &&
        metaRepo.permissions?.pull) as boolean;
    } catch (error) {
      hasMetaRepoAccess = false;
      hasMetaRepoScope = false;
    }

    return hasRepoAccess && hasRepoScope && hasMetaRepoAccess && hasMetaRepoScope;
  }

  // checks if status repos exist
  async statusReposExist(): Promise<boolean> {
    try {
      await this.repoClient.repos.get({
        owner: this.ownerAccountName,
        repo: this.repoName
      });
      await this.metaRepoClient.repos.get({
        owner: this.ownerAccountName,
        repo: this.metaRepoName
      });
    } catch (error) {
      return false;
    }
    return true;
  }

  // checks if status repos are empty
  async statusReposEmpty(): Promise<boolean> {
    let repoEmpty = false;
    try {
      // retrieve status repo content
      await this.getRepo();
    } catch (error: any) {
      // track that status repo is empty
      repoEmpty = true;
    }

    let metaRepoEmpty = false;
    try {
      // retrieve status metadata repo content
      await this.getMetaRepo();
    } catch (error: any) {
      // track that status metadata repo is empty
      metaRepoEmpty = true;
    }

    // check if both status repos are empty
    return repoEmpty && metaRepoEmpty;
  }

  // retrieves content of status credential repo
  async getRepo(): Promise<any> {
    const repoResponse = await this.repoClient.repos.getContent({
      owner: this.ownerAccountName,
      repo: this.repoName,
      path: ''
    });
    return repoResponse.data;
  }

  // retrieves filenames of status credential repo content
  async getRepoFilenames(): Promise<string[]> {
    const repo = await this.getRepo();
    return repo.map((file: any) => file.name);
  }

  // retrieves content of credential status metadata repo
  async getMetaRepo(): Promise<any> {
    const metaRepoResponse = await this.metaRepoClient.repos.getContent({
      owner: this.ownerAccountName,
      repo: this.metaRepoName,
      path: ''
    });
    return metaRepoResponse.data;
  }

  // creates status credential
  async createStatusCredential(statusCredential: VerifiableCredential): Promise<void> {
    if (typeof statusCredential === 'string') {
      throw new BadRequestError({
        message: 'This library does not support compact JWT credentials.'
      });
    }
    const statusCredentialId = deriveStatusCredentialId(statusCredential.id as string);
    const timestamp = getDateString();
    const message = `[${timestamp}]: created status credential`;
    const content = encodeAsciiAsBase64(JSON.stringify(statusCredential, null, 2));
    await this.repoClient.repos.createOrUpdateFileContents({
      owner: this.ownerAccountName,
      repo: this.repoName,
      branch: CREDENTIAL_STATUS_REPO_BRANCH_NAME,
      path: statusCredentialId,
      message,
      content
    });
  }

  // retrieves response from fetching status file
  async getStatusCredentialResponse(statusCredentialId?: string): Promise<any> {
    let statusCredentialPath;
    if (statusCredentialId) {
      statusCredentialPath = statusCredentialId;
    } else {
      ({ latestStatusCredentialId: statusCredentialPath } = await this.getConfig());
    }
    const statusResponse = await this.repoClient.repos.getContent({
      owner: this.ownerAccountName,
      repo: this.repoName,
      path: statusCredentialPath
    });
    return statusResponse.data;
  }

  // retrieves status credential
  async getStatusCredential(statusCredentialId?: string): Promise<VerifiableCredential> {
    const statusResponse = await this.getStatusCredentialResponse(statusCredentialId);
    return decodeSystemData(statusResponse.content);
  }

  // updates status credential
  async updateStatusCredential(statusCredential: VerifiableCredential): Promise<void> {
    if (typeof statusCredential === 'string') {
      throw new BadRequestError({
        message: 'This library does not support compact JWT credentials.'
      });
    }
    const statusCredentialId = deriveStatusCredentialId(statusCredential.id as string);
    const statusResponse = await this.getStatusCredentialResponse();
    const { sha } = statusResponse;
    const timestamp = getDateString();
    const message = `[${timestamp}]: updated status credential`;
    const content = encodeAsciiAsBase64(JSON.stringify(statusCredential, null, 2));
    await this.repoClient.repos.createOrUpdateFileContents({
      owner: this.ownerAccountName,
      repo: this.repoName,
      path: statusCredentialId,
      message,
      content,
      sha
    });
  }

  // deletes status credentials
  async deleteStatusCredentials(): Promise<void> {
    const repoFilenames = await this.getRepoFilenames();
    for (const repoFilename of repoFilenames) {
      const { sha } = await this.getStatusCredentialResponse(repoFilename);
      const timestamp = getDateString();
      const message = `[${timestamp}]: deleted status credential data: ${repoFilename}`;
      await this.repoClient.repos.deleteFile({
        owner: this.ownerAccountName,
        repo: this.repoName,
        path: repoFilename,
        message,
        sha
      });
    }
  }

  // create data in config file
  async createConfig(config: Config): Promise<void> {
    const timestamp = getDateString();
    const message = `[${timestamp}]: created status credential config`;
    const content = encodeAsciiAsBase64(JSON.stringify(config, null, 2));
    await this.metaRepoClient.repos.createOrUpdateFileContents({
      owner: this.ownerAccountName,
      repo: this.metaRepoName,
      branch: CREDENTIAL_STATUS_REPO_BRANCH_NAME,
      path: CREDENTIAL_STATUS_CONFIG_FILE,
      message,
      content
    });
  }

  // retrieves response from fetching config file
  async getConfigResponse(): Promise<any> {
    const configResponse = await this.metaRepoClient.repos.getContent({
      owner: this.ownerAccountName,
      repo: this.metaRepoName,
      path: CREDENTIAL_STATUS_CONFIG_FILE
    });
    return configResponse.data;
  }

  // retrieves config
  async getConfig(): Promise<Config> {
    const configResponse = await this.getConfigResponse();
    return decodeSystemData(configResponse.content);
  }

  // updates config
  async updateConfig(config: Config): Promise<void> {
    const configResponse = await this.getConfigResponse();
    const { sha } = configResponse;
    const timestamp = getDateString();
    const message = `[${timestamp}]: updated status credential config`;
    const content = encodeAsciiAsBase64(JSON.stringify(config, null, 2));
    await this.metaRepoClient.repos.createOrUpdateFileContents({
      owner: this.ownerAccountName,
      repo: this.metaRepoName,
      path: CREDENTIAL_STATUS_CONFIG_FILE,
      message,
      content,
      sha
    });
  }

  // deletes config
  async deleteConfig(): Promise<void> {
    const { sha } = await this.getConfigResponse();
    const timestamp = getDateString();
    const message = `[${timestamp}]: deleted config data`;
    await this.metaRepoClient.repos.deleteFile({
      owner: this.ownerAccountName,
      repo: this.metaRepoName,
      path: CREDENTIAL_STATUS_CONFIG_FILE,
      message,
      sha
    });
  }

  // creates snapshot
  async createSnapshot(snapshot: Snapshot): Promise<void> {
    const timestamp = getDateString();
    const message = `[${timestamp}]: created status credential snapshot`;
    const content = encodeAsciiAsBase64(JSON.stringify(snapshot, null, 2));
    await this.metaRepoClient.repos.createOrUpdateFileContents({
      owner: this.ownerAccountName,
      repo: this.metaRepoName,
      branch: CREDENTIAL_STATUS_REPO_BRANCH_NAME,
      path: CREDENTIAL_STATUS_SNAPSHOT_FILE,
      message,
      content
    });
  }

  // retrieves response from fetching snapshot file
  async getSnapshotResponse(): Promise<any> {
    const snapshotResponse = await this.metaRepoClient.repos.getContent({
      owner: this.ownerAccountName,
      repo: this.metaRepoName,
      path: CREDENTIAL_STATUS_SNAPSHOT_FILE
    });
    return snapshotResponse.data;
  }

  // retrieves snapshot
  async getSnapshot(): Promise<Snapshot> {
    const snapshotResponse = await this.getSnapshotResponse();
    return decodeSystemData(snapshotResponse.content);
  }

  // deletes snapshot
  async deleteSnapshot(): Promise<void> {
    const { sha } = await this.getSnapshotResponse();
    const timestamp = getDateString();
    const message = `[${timestamp}]: deleted snapshot data`;
    await this.metaRepoClient.repos.deleteFile({
      owner: this.ownerAccountName,
      repo: this.metaRepoName,
      path: CREDENTIAL_STATUS_SNAPSHOT_FILE,
      message,
      sha
    });
  }

  // checks if snapshot exists
  async snapshotExists(): Promise<boolean> {
    try {
      await this.metaRepoClient.repos.getContent({
        owner: this.ownerAccountName,
        repo: this.metaRepoName,
        path: CREDENTIAL_STATUS_SNAPSHOT_FILE
      });
    } catch (error) {
      return false;
    }
    return true;
  }
}
