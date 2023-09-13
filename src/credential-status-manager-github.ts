/*!
 * Copyright (c) 2023 Digital Credentials Consortium. All rights reserved.
 */
import { VerifiableCredential } from '@digitalcredentials/vc-data-model';
import { Octokit } from '@octokit/rest';
import {
  BASE_MANAGER_REQUIRED_OPTIONS,
  CREDENTIAL_STATUS_CONFIG_FILE,
  CREDENTIAL_STATUS_LOG_FILE,
  CREDENTIAL_STATUS_REPO_BRANCH_NAME,
  BaseCredentialStatusManager,
  BaseCredentialStatusManagerOptions,
  CredentialStatusConfigData,
  CredentialStatusLogData
} from './credential-status-manager-base.js';
import {
  DidMethod,
  decodeSystemData,
  encodeAsciiAsBase64,
  getDateString
} from './helpers.js';

// Type definition for GithubCredentialStatusManager constructor method input
export type GithubCredentialStatusManagerOptions = {
  ownerAccountName: string;
} & BaseCredentialStatusManagerOptions;

// Minimal set of options required for configuring GithubCredentialStatusManager
const GITHUB_MANAGER_REQUIRED_OPTIONS = [
  'ownerAccountName'
].concat(BASE_MANAGER_REQUIRED_OPTIONS) as
  Array<keyof GithubCredentialStatusManagerOptions & BaseCredentialStatusManagerOptions>;

// Implementation of BaseCredentialStatusManager for GitHub
export class GithubCredentialStatusManager extends BaseCredentialStatusManager {
  private readonly ownerAccountName: string;
  private repoClient: Octokit;
  private readonly metaRepoClient: Octokit;

  constructor(options: GithubCredentialStatusManagerOptions) {
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
    this.ensureProperConfiguration(options);
    this.ownerAccountName = ownerAccountName;
    this.repoClient = new Octokit({ auth: repoAccessToken });
    this.metaRepoClient = new Octokit({ auth: metaRepoAccessToken });
  }

  // ensures proper configuration of GitHub status manager
  ensureProperConfiguration(options: GithubCredentialStatusManagerOptions): void {
    const missingOptions = [] as
      Array<keyof GithubCredentialStatusManagerOptions & BaseCredentialStatusManagerOptions>;

    const isProperlyConfigured = GITHUB_MANAGER_REQUIRED_OPTIONS.every(
      (option: keyof GithubCredentialStatusManagerOptions) => {
        if (!options[option]) {
          missingOptions.push(option);
        }
        return !!options[option];
      }
    );

    if (!isProperlyConfigured) {
      throw new Error(
        'You have neglected to set the following required options for the ' +
        'GitHub credential status manager: ' +
        `${missingOptions.map(o => `'${o}'`).join(', ')}.`
      );
    }

    if (this.didMethod === DidMethod.Web && !this.didWebUrl) {
      throw new Error(
        'The value of "didWebUrl" must be provided ' +
        'when using "didMethod" of type "web".'
      );
    }
  }

  // retrieves credential status URL
  getCredentialStatusUrl(): string {
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
  resetClientAuthorization(repoAccessToken: string): void {
    this.repoClient = new Octokit({ auth: repoAccessToken });
  }

  // checks if caller has authority to update status based on status repo access token
  async hasStatusAuthority(repoAccessToken: string): Promise<boolean> {
    this.resetClientAuthorization(repoAccessToken);
    let hasAccess: boolean;
    let hasScope: boolean;
    try {
      const repoResponse = await this.repoClient.repos.get({
        owner: this.ownerAccountName,
        repo: this.repoName
      });
      const repo = repoResponse.data;
      hasAccess = repo.full_name === `${this.ownerAccountName}/${this.repoName}`;
      hasScope = (repo.permissions?.admin &&
        repo.permissions?.push &&
        repo.permissions?.pull) as boolean;
    } catch (error) {
      hasAccess = false;
      hasScope = false;
    }
    return hasAccess && hasScope;
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
      await this.readRepoData();
    } catch (error: any) {
      // track that status repo is empty
      repoEmpty = true;
    }

    let metaRepoEmpty = false;
    try {
      // retrieve status metadata repo content
      await this.readMetaRepoData();
    } catch (error: any) {
      // track that status metadata repo is empty
      metaRepoEmpty = true;
    }

    // check if both status repos are empty
    return repoEmpty && metaRepoEmpty;
  }

  // retrieves data from status repo
  async readRepoData(): Promise<any> {
    const repoResponse = await this.repoClient.repos.getContent({
      owner: this.ownerAccountName,
      repo: this.repoName,
      path: ''
    });
    return repoResponse.data;
  }

  // retrieves data from status metadata repo
  async readMetaRepoData(): Promise<any> {
    const metaRepoResponse = await this.metaRepoClient.repos.getContent({
      owner: this.ownerAccountName,
      repo: this.metaRepoName,
      path: ''
    });
    return metaRepoResponse.data;
  }

  // create data in config file
  async createConfigData(data: CredentialStatusConfigData): Promise<void> {
    const timestamp = getDateString();
    const message = `[${timestamp}]: created status credential config`;
    const content = encodeAsciiAsBase64(JSON.stringify(data, null, 2));
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
  async readConfigResponse(): Promise<any> {
    const configResponse = await this.metaRepoClient.repos.getContent({
      owner: this.ownerAccountName,
      repo: this.metaRepoName,
      path: CREDENTIAL_STATUS_CONFIG_FILE
    });
    return configResponse.data;
  }

  // retrieves data from config file
  async readConfigData(): Promise<CredentialStatusConfigData> {
    const configResponse = await this.readConfigResponse();
    return decodeSystemData(configResponse.content);
  }

  // updates data in config file
  async updateConfigData(data: CredentialStatusConfigData): Promise<void> {
    const configResponse = await this.readConfigResponse();
    const { sha } = configResponse;
    const timestamp = getDateString();
    const message = `[${timestamp}]: updated status credential config`;
    const content = encodeAsciiAsBase64(JSON.stringify(data, null, 2));
    await this.metaRepoClient.repos.createOrUpdateFileContents({
      owner: this.ownerAccountName,
      repo: this.metaRepoName,
      path: CREDENTIAL_STATUS_CONFIG_FILE,
      message,
      content,
      sha
    });
  }

  // creates data in log file
  async createLogData(data: CredentialStatusLogData): Promise<void> {
    const timestamp = getDateString();
    const message = `[${timestamp}]: created status log`;
    const content = encodeAsciiAsBase64(JSON.stringify(data, null, 2));
    await this.metaRepoClient.repos.createOrUpdateFileContents({
      owner: this.ownerAccountName,
      repo: this.metaRepoName,
      branch: CREDENTIAL_STATUS_REPO_BRANCH_NAME,
      path: CREDENTIAL_STATUS_LOG_FILE,
      message,
      content
    });
  }

  // retrieves response from fetching log file
  async readLogResponse(): Promise<any> {
    const logResponse = await this.metaRepoClient.repos.getContent({
      owner: this.ownerAccountName,
      repo: this.metaRepoName,
      path: CREDENTIAL_STATUS_LOG_FILE
    });
    return logResponse.data;
  }

  // retrieves data from log file
  async readLogData(): Promise<CredentialStatusLogData> {
    const logResponse = await this.readLogResponse();
    return decodeSystemData(logResponse.content);
  }

  // updates data in log file
  async updateLogData(data: CredentialStatusLogData): Promise<void> {
    const logResponse = await this.readLogResponse();
    const { sha } = logResponse;
    const timestamp = getDateString();
    const message = `[${timestamp}]: updated status log`;
    const content = encodeAsciiAsBase64(JSON.stringify(data, null, 2));
    await this.metaRepoClient.repos.createOrUpdateFileContents({
      owner: this.ownerAccountName,
      repo: this.metaRepoName,
      path: CREDENTIAL_STATUS_LOG_FILE,
      message,
      content,
      sha
    });
  }

  // creates data in status file
  async createStatusData(data: VerifiableCredential): Promise<void> {
    const configData = await this.readConfigData();
    const { latestList } = configData;
    const timestamp = getDateString();
    const message = `[${timestamp}]: created status credential`;
    const content = encodeAsciiAsBase64(JSON.stringify(data, null, 2));
    await this.repoClient.repos.createOrUpdateFileContents({
      owner: this.ownerAccountName,
      repo: this.repoName,
      branch: CREDENTIAL_STATUS_REPO_BRANCH_NAME,
      path: latestList,
      message,
      content
    });
  }

  // retrieves response from fetching status file
  async readStatusResponse(): Promise<any> {
    const configData = await this.readConfigData();
    const { latestList } = configData;
    const statusResponse = await this.repoClient.repos.getContent({
      owner: this.ownerAccountName,
      repo: this.repoName,
      path: latestList
    });
    return statusResponse.data;
  }

  // retrieves data from status file
  async readStatusData(): Promise<VerifiableCredential> {
    const statusResponse = await this.readStatusResponse();
    return decodeSystemData(statusResponse.content);
  }

  // updates data in status file
  async updateStatusData(data: VerifiableCredential): Promise<void> {
    const configData = await this.readConfigData();
    const { latestList } = configData;
    const statusResponse = await this.readStatusResponse();
    const { sha } = statusResponse;
    const timestamp = getDateString();
    const message = `[${timestamp}]: updated status credential`;
    const content = encodeAsciiAsBase64(JSON.stringify(data, null, 2));
    await this.repoClient.repos.createOrUpdateFileContents({
      owner: this.ownerAccountName,
      repo: this.repoName,
      path: latestList,
      message,
      content,
      sha
    });
  }
}
