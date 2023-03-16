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
  CredentialStatusLogData,
  VisibilityLevel
} from './credential-status-manager-base';
import { DidMethod, decodeSystemData, encodeAsciiAsBase64 } from './helpers';

// Type definition for GithubCredentialStatusManager constructor method input
export type GithubCredentialStatusManagerOptions = {
  repoOrgName: string;
  repoVisibility: VisibilityLevel;
} & BaseCredentialStatusManagerOptions;

// Minimal set of options required for configuring GithubCredentialStatusManager
const GITHUB_MANAGER_REQUIRED_OPTIONS = [
  'repoOrgName',
  'repoVisibility'
].concat(BASE_MANAGER_REQUIRED_OPTIONS) as
  Array<keyof GithubCredentialStatusManagerOptions & BaseCredentialStatusManagerOptions>;

// Implementation of BaseCredentialStatusManager for GitHub
export class GithubCredentialStatusManager extends BaseCredentialStatusManager {
  private readonly repoOrgName: string;
  private readonly repoVisibility: VisibilityLevel;
  private client: Octokit;

  constructor(options: GithubCredentialStatusManagerOptions) {
    const {
      repoName,
      metaRepoName,
      repoOrgName,
      repoVisibility,
      accessToken,
      didMethod,
      didSeed,
      didWebUrl,
      signUserCredential,
      signStatusCredential
    } = options;
    super({
      repoName,
      metaRepoName,
      accessToken,
      didMethod,
      didSeed,
      didWebUrl,
      signUserCredential,
      signStatusCredential
    });
    this.ensureProperConfiguration(options);
    this.repoOrgName = repoOrgName;
    this.repoVisibility = repoVisibility;
    this.client = new Octokit({ auth: accessToken });
  }

  // ensures proper configuration of GitHub status manager
  ensureProperConfiguration(options: GithubCredentialStatusManagerOptions): void {
    const missingOptions = [] as
      Array<keyof GithubCredentialStatusManagerOptions & BaseCredentialStatusManagerOptions>;

    const isProperlyConfigured = GITHUB_MANAGER_REQUIRED_OPTIONS.every(
      (option: keyof GithubCredentialStatusManagerOptions) => {
        if (!options[option]) {
          missingOptions.push();
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

  // checks if caller has authority to update status
  async hasStatusAuthority(accessToken: string): Promise<boolean> {
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
