import { VerifiableCredential } from '@digitalcredentials/vc-data-model';
import { Octokit } from '@octokit/rest';
import {
  CREDENTIAL_STATUS_CONFIG_FILE,
  CREDENTIAL_STATUS_LOG_FILE,
  CREDENTIAL_STATUS_REPO_BRANCH_NAME,
  BaseCredentialStatusClient,
  CredentialStatusConfigData,
  CredentialStatusLogData,
  VisibilityLevel
} from './credential-status-base';
import { DidMethod, decodeSystemData, encodeAsciiAsBase64 } from './helpers';

// Type definition for GithubCredentialStatusClient constructor method input
export interface GithubCredentialStatusClientOptions {
  repoName: string;
  metaRepoName: string;
  repoOrgName: string;
  repoVisibility: VisibilityLevel;
  accessToken: string;
  didMethod: DidMethod;
  didSeed: string;
  didWebUrl?: string;
  signUserCredential?: boolean;
  signStatusCredential?: boolean;
}

// Minimal set of options required for configuring GithubCredentialStatusClient
const GITHUB_CLIENT_REQUIRED_OPTIONS: Array<keyof GithubCredentialStatusClientOptions> = [
  'repoOrgName',
  'accessToken'
];

// Implementation of BaseCredentialStatusClient for GitHub
export class GithubCredentialStatusClient extends BaseCredentialStatusClient {
  private readonly repoName: string;
  private readonly metaRepoName: string;
  private readonly repoOrgName: string;
  private readonly repoVisibility: VisibilityLevel;
  private client: Octokit;

  constructor(options: GithubCredentialStatusClientOptions) {
    const {
      didMethod,
      didSeed,
      didWebUrl,
      signUserCredential,
      signStatusCredential
    } = options;
    super({
      didMethod,
      didSeed,
      didWebUrl,
      signUserCredential,
      signStatusCredential
    });
    this.ensureProperConfiguration(options);
    this.repoName = options.repoName;
    this.metaRepoName = options.metaRepoName;
    this.repoOrgName = options.repoOrgName;
    this.repoVisibility = options.repoVisibility;
    this.client = new Octokit({ auth: options.accessToken });
  }

  // ensures proper configuration of GitHub status client
  ensureProperConfiguration(options: GithubCredentialStatusClientOptions): void {
    const isProperlyConfigured = GITHUB_CLIENT_REQUIRED_OPTIONS.every(
      (option: keyof GithubCredentialStatusClientOptions) => {
        return !!options[option];
      }
    );
    if (!isProperlyConfigured) {
      throw new Error(
        'The following environment variables must be set for the ' +
        'GitHub credential status client: ' +
        `${GITHUB_CLIENT_REQUIRED_OPTIONS.map(o => `'${o}'`).join(', ')}.`
      );
    }
  }

  // retrieves credential status URL
  getCredentialStatusUrl(): string {
    return `https://${this.repoOrgName}.github.io/${this.repoName}`;
  }

  // deploys website to host credential status management resources
  async deployCredentialStatusWebsite(): Promise<void> {
    await this.client.repos.createPagesSite({
      owner: this.repoOrgName,
      repo: this.repoName,
      source: { branch: CREDENTIAL_STATUS_REPO_BRANCH_NAME }
    });
  }

  // resets client authorization
  resetClientAuthorization(accessToken: string): void {
    this.client = new Octokit({ auth: accessToken });
  }

  // checks if issuer client has access to status repo
  async hasStatusRepoAccess(accessToken: string): Promise<boolean> {
    this.resetClientAuthorization(accessToken);
    const repos = (await this.client.repos.listForOrg({ org: this.repoOrgName })).data;
    return repos.some((repo) => {
      const hasAccess = repo.full_name === `${this.repoOrgName}/${this.repoName}`;
      const hasScope = repo.permissions?.admin &&
        repo.permissions?.push &&
        repo.permissions?.pull;
      return hasAccess && hasScope;
    });
  }

  // checks if status repo exists
  async statusRepoExists(): Promise<boolean> {
    const repos = (await this.client.repos.listForOrg({ org: this.repoOrgName })).data;
    return repos.some((repo) => {
      return repo.name === this.repoName;
    });
  }

  // creates status repo
  async createStatusRepo(): Promise<void> {
    // create status repo
    await this.client.repos.createInOrg({
      org: this.repoOrgName,
      name: this.repoName,
      visibility: this.repoVisibility,
      description: 'Manages credential status for instance of VC-API'
    });

    // create status metadata repo
    await this.client.repos.createInOrg({
      org: this.repoOrgName,
      name: this.metaRepoName,
      visibility: VisibilityLevel.Private,
      description: 'Manages credential status metadata for instance of VC-API'
    });
  }

  // create data in config file
  async createConfigData(data: CredentialStatusConfigData): Promise<void> {
    const timestamp = (new Date()).toISOString();
    const message = `[${timestamp}]: created status credential config`;
    const content = encodeAsciiAsBase64(JSON.stringify(data, null, 2));
    await this.client.repos.createOrUpdateFileContents({
      owner: this.repoOrgName,
      repo: this.metaRepoName,
      branch: CREDENTIAL_STATUS_REPO_BRANCH_NAME,
      path: CREDENTIAL_STATUS_CONFIG_FILE,
      message,
      content
    });
  }

  // retrieves response from fetching config file
  async readConfigResponse(): Promise<any> {
    const configResponse = await this.client.repos.getContent({
      owner: this.repoOrgName,
      repo: this.metaRepoName,
      path: CREDENTIAL_STATUS_CONFIG_FILE
    });
    return configResponse.data as any;
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
    const timestamp = (new Date()).toISOString();
    const message = `[${timestamp}]: updated status credential config`;
    const content = encodeAsciiAsBase64(JSON.stringify(data, null, 2));
    await this.client.repos.createOrUpdateFileContents({
      owner: this.repoOrgName,
      repo: this.metaRepoName,
      path: CREDENTIAL_STATUS_CONFIG_FILE,
      message,
      content,
      sha
    });
  }

  // creates data in log file
  async createLogData(data: CredentialStatusLogData): Promise<void> {
    const timestamp = (new Date()).toISOString();
    const message = `[${timestamp}]: created status log`;
    const content = encodeAsciiAsBase64(JSON.stringify(data, null, 2));
    await this.client.repos.createOrUpdateFileContents({
      owner: this.repoOrgName,
      repo: this.metaRepoName,
      branch: CREDENTIAL_STATUS_REPO_BRANCH_NAME,
      path: CREDENTIAL_STATUS_LOG_FILE,
      message,
      content
    });
  }

  // retrieves response from fetching log file
  async readLogResponse(): Promise<any> {
    const logResponse = await this.client.repos.getContent({
      owner: this.repoOrgName,
      repo: this.metaRepoName,
      path: CREDENTIAL_STATUS_LOG_FILE
    });
    return logResponse.data as any;
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
    const timestamp = (new Date()).toISOString();
    const message = `[${timestamp}]: updated status log`;
    const content = encodeAsciiAsBase64(JSON.stringify(data, null, 2));
    await this.client.repos.createOrUpdateFileContents({
      owner: this.repoOrgName,
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
    const timestamp = (new Date()).toISOString();
    const message = `[${timestamp}]: created status credential`;
    const content = encodeAsciiAsBase64(JSON.stringify(data, null, 2));
    await this.client.repos.createOrUpdateFileContents({
      owner: this.repoOrgName,
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
    const statusResponse = await this.client.repos.getContent({
      owner: this.repoOrgName,
      repo: this.repoName,
      path: latestList
    });
    return statusResponse.data as any;
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
    const timestamp = (new Date()).toISOString();
    const message = `[${timestamp}]: updated status credential`;
    const content = encodeAsciiAsBase64(JSON.stringify(data, null, 2));
    await this.client.repos.createOrUpdateFileContents({
      owner: this.repoOrgName,
      repo: this.repoName,
      path: latestList,
      message,
      content,
      sha
    });
  }
}
