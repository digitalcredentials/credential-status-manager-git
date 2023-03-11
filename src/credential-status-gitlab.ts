import { VerifiableCredential } from '@digitalcredentials/vc-data-model';
import axios, { AxiosInstance } from 'axios';
import {
  CREDENTIAL_STATUS_CONFIG_FILE,
  CREDENTIAL_STATUS_LOG_FILE,
  CREDENTIAL_STATUS_REPO_BRANCH_NAME,
  BaseCredentialStatusClient,
  BaseCredentialStatusClientOptions,
  CredentialStatusConfigData,
  CredentialStatusLogData,
  VisibilityLevel
} from './credential-status-base';
import { decodeSystemData } from './helpers';

const CREDENTIAL_STATUS_CONFIG_PATH_ENCODED = encodeURIComponent(CREDENTIAL_STATUS_CONFIG_FILE);
const CREDENTIAL_STATUS_LOG_PATH_ENCODED = encodeURIComponent(CREDENTIAL_STATUS_LOG_FILE);

const CREDENTIAL_STATUS_WEBSITE_HOME_PAGE_PATH = 'index.html';
const CREDENTIAL_STATUS_WEBSITE_HOME_PAGE =
`<html>
  <head>
    <title>Credential Status Management Service</title>
  </head>
  <body>
    <h1>
      We manage credential status for an instance of the
      <a href="https://w3c-ccg.github.io/vc-api">VC-API</a>
    </h1>
  </body>
</html>`;

const CREDENTIAL_STATUS_WEBSITE_CI_CONFIG_PATH = '.gitlab-ci.yml';
const CREDENTIAL_STATUS_WEBSITE_CI_CONFIG =
`image: ruby:2.7

pages:
  script:
    - gem install bundler
    - bundle install
    - bundle exec jekyll build -d public
  artifacts:
    paths:
      - public`;

const CREDENTIAL_STATUS_WEBSITE_GEMFILE_PATH = 'Gemfile';
const CREDENTIAL_STATUS_WEBSITE_GEMFILE =
`source "https://rubygems.org"

gem "jekyll"`;

// Type definition for GitlabCredentialStatusClient constructor method input
export type GitlabCredentialStatusClientOptions = {
  repoOrgName: string;
  repoOrgId: string;
  repoVisibility: VisibilityLevel;
} & BaseCredentialStatusClientOptions;

// Minimal set of options required for configuring GitlabCredentialStatusClient
const GITLAB_CLIENT_REQUIRED_OPTIONS: Array<keyof GitlabCredentialStatusClientOptions> = [
  'repoOrgName',
  'repoOrgId',
  'repoVisibility'
];

// Implementation of BaseCredentialStatusClient for GitLab
export class GitlabCredentialStatusClient extends BaseCredentialStatusClient {
  private repoId: string;
  private metaRepoId: string;
  private readonly repoOrgName: string;
  private readonly repoOrgId: string;
  private readonly repoVisibility: VisibilityLevel;
  private client: AxiosInstance;

  constructor(options: GitlabCredentialStatusClientOptions) {
    const {
      repoName,
      metaRepoName,
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
    this.repoId = ''; // This value is set in createStatusRepo
    this.metaRepoId = ''; // This value is set in createStatusRepo
    this.repoOrgName = options.repoOrgName;
    this.repoOrgId = options.repoOrgId;
    this.repoVisibility = options.repoVisibility;
    this.client = axios.create({
      baseURL: 'https://gitlab.com/api/v4',
      timeout: 6000,
      headers: {
        'Authorization': `Bearer ${accessToken}`
      }
    });
  }

  // ensures proper configuration of GitLab status client
  ensureProperConfiguration(options: GitlabCredentialStatusClientOptions): void {
    const isProperlyConfigured = GITLAB_CLIENT_REQUIRED_OPTIONS.every(
      (option: keyof GitlabCredentialStatusClientOptions) => {
        return !!options[option];
      }
    );
    if (!isProperlyConfigured) {
      throw new Error(
        'The following environment variables must be set for the ' +
        'GitLab credential status client: ' +
        `${GITLAB_CLIENT_REQUIRED_OPTIONS.map(o => `'${o}'`).join(', ')}.`
      );
    }
  }

  // retrieves endpoint for repos in org
  reposInOrgEndpoint(): string {
    return `/groups/${this.repoOrgId}/projects`;
  }

  // retrieves endpoint for repos
  reposEndpoint(): string {
    return '/projects';
  }

  // retrieves endpoint for files
  filesEndpoint(repoId: string, path: string): string {
    return `/projects/${repoId}/repository/files/${path}`;
  }

  // retrieves endpoint for commits
  commitsEndpoint(repoId: string): string {
    return `/projects/${repoId}/repository/commits`;
  }

  // retrieves credential status URL
  getCredentialStatusUrl(): string {
    return `https://${this.repoOrgName}.gitlab.io/${this.repoName}`;
  }

  // deploys website to host credential status management resources
  async deployCredentialStatusWebsite(): Promise<void> {
    const timestamp = (new Date()).toISOString();
    const message = `[${timestamp}]: deployed status website`;
    const websiteRequestOptions = {
      branch: CREDENTIAL_STATUS_REPO_BRANCH_NAME,
      commit_message: message,
      actions: [
        {
          action: 'create',
          file_path: CREDENTIAL_STATUS_WEBSITE_HOME_PAGE_PATH,
          content: CREDENTIAL_STATUS_WEBSITE_HOME_PAGE
        },
        {
          action: 'create',
          file_path: CREDENTIAL_STATUS_WEBSITE_CI_CONFIG_PATH,
          content: CREDENTIAL_STATUS_WEBSITE_CI_CONFIG
        },
        {
          action: 'create',
          file_path: CREDENTIAL_STATUS_WEBSITE_GEMFILE_PATH,
          content: CREDENTIAL_STATUS_WEBSITE_GEMFILE
        }
      ]
    };
    await this.client.post(this.commitsEndpoint(this.repoId), websiteRequestOptions);
  }

  // resets client authorization
  resetClientAuthorization(accessToken: string): void {
    this.client = axios.create({
      baseURL: 'https://gitlab.com/api/v4',
      timeout: 6000,
      headers: {
        'Authorization': `Bearer ${accessToken}`
      }
    });
  }

  // checks if issuer client has access to status repo
  async hasStatusRepoAccess(accessToken: string): Promise<boolean> {
    this.resetClientAuthorization(accessToken);
    const repoRequestOptions = {
      params: {
        owned: true,
        simple: true
      }
    };
    const repos = (await this.client.get(`/projects`, repoRequestOptions)).data;
    return repos.some((repo: any) => {
      return repo.path_with_namespace === `${this.repoOrgName}/${this.repoName}`;
    });
  }

  // retrieves list of repos in org
  async getReposInOrg(): Promise<any[]> {
    const repoRequestOptions = {
      params: {
        owned: true,
        simple: true
      }
    };
    const repoResponse = await this.client.get(this.reposInOrgEndpoint(), repoRequestOptions);
    return repoResponse.data as any[];
  }

  // checks if status repo exists
  async statusRepoExists(): Promise<boolean> {
    const repos = await this.getReposInOrg();
    return repos.some((repo) => {
      return repo.name === this.repoName;
    });
  }

  // creates status repo
  async createStatusRepo(): Promise<void> {
    // create status repo
    const repoRequestOptions = {
      name: this.repoName,
      namespace_id: this.repoOrgId,
      visibility: this.repoVisibility,
      pages_access_level: 'public',
      description: 'Manages credential status for instance of VC-API'
    };
    const statusRepo = (await this.client.post(this.reposEndpoint(), repoRequestOptions)).data;
    this.repoId = statusRepo.id;

    // create status metadata repo
    const metaRepoRequestOptions = {
      name: this.metaRepoName,
      namespace_id: this.repoOrgId,
      visibility: VisibilityLevel.Private,
      description: 'Manages credential status metadata for instance of VC-API'
    };
    const metaRepo = (await this.client.post(this.reposEndpoint(), metaRepoRequestOptions)).data;
    this.metaRepoId = metaRepo.id;
  }

  // syncs status repo state
  async syncStatusRepoState(): Promise<void> {
    const repos = await this.getReposInOrg();
    const repo = repos.find((r) => {
      return r.name === this.repoName;
    });
    this.repoId = repo.id;

    const metaRepo = repos.find((r) => {
      return r.name === this.metaRepoName;
    });
    this.metaRepoId = metaRepo.id;
  }

  // creates data in config file
  async createConfigData(data: CredentialStatusConfigData): Promise<void> {
    const timestamp = (new Date()).toISOString();
    const message = `[${timestamp}]: created status credential config`;
    const content = JSON.stringify(data, null, 2);
    const configRequestOptions = {
      branch: CREDENTIAL_STATUS_REPO_BRANCH_NAME,
      commit_message: message,
      content
    };
    const configRequestEndpoint = this.filesEndpoint(
      this.metaRepoId,
      CREDENTIAL_STATUS_CONFIG_PATH_ENCODED
    );
    await this.client.post(configRequestEndpoint, configRequestOptions);
  }

  // retrieves response from fetching config file
  async readConfigResponse(): Promise<any> {
    const configRequestOptions = {
      params: {
        ref: CREDENTIAL_STATUS_REPO_BRANCH_NAME
      }
    };
    const configRequestEndpoint = this.filesEndpoint(
      this.metaRepoId,
      CREDENTIAL_STATUS_CONFIG_PATH_ENCODED
    );
    const configResponse = await this.client.get(configRequestEndpoint, configRequestOptions);
    return configResponse.data;
  }

  // retrieves data from config file
  async readConfigData(): Promise<CredentialStatusConfigData> {
    const configResponse = await this.readConfigResponse();
    return decodeSystemData(configResponse.content);
  }

  // updates data in config file
  async updateConfigData(data: CredentialStatusConfigData): Promise<void> {
    const timestamp = (new Date()).toISOString();
    const message = `[${timestamp}]: updated status credential config`;
    const content = JSON.stringify(data, null, 2);
    const configRequestOptions = {
      branch: CREDENTIAL_STATUS_REPO_BRANCH_NAME,
      commit_message: message,
      content
    };
    const configRequestEndpoint = this.filesEndpoint(
      this.metaRepoId,
      CREDENTIAL_STATUS_CONFIG_PATH_ENCODED
    );
    await this.client.put(configRequestEndpoint, configRequestOptions);
  }

  // creates data in log file
  async createLogData(data: CredentialStatusLogData): Promise<void> {
    const timestamp = (new Date()).toISOString();
    const message = `[${timestamp}]: created status log`;
    const content = JSON.stringify(data, null, 2);
    const logRequestOptions = {
      branch: CREDENTIAL_STATUS_REPO_BRANCH_NAME,
      commit_message: message,
      content
    };
    const logRequestEndpoint = this.filesEndpoint(
      this.metaRepoId,
      CREDENTIAL_STATUS_LOG_PATH_ENCODED
    );
    await this.client.post(logRequestEndpoint, logRequestOptions);
  }

  // retrieves response from fetching log file
  async readLogResponse(): Promise<any> {
    const logRequestOptions = {
      params: {
        ref: CREDENTIAL_STATUS_REPO_BRANCH_NAME
      }
    };
    const logRequestEndpoint = this.filesEndpoint(
      this.metaRepoId,
      CREDENTIAL_STATUS_LOG_PATH_ENCODED
    );
    const logResponse = await this.client.get(logRequestEndpoint, logRequestOptions);
    return logResponse.data;
  }

  // retrieves data from log file
  async readLogData(): Promise<CredentialStatusLogData> {
    const logResponse = await this.readLogResponse();
    return decodeSystemData(logResponse.content);
  }

  // updates data in log file
  async updateLogData(data: CredentialStatusLogData): Promise<void> {
    const timestamp = (new Date()).toISOString();
    const message = `[${timestamp}]: updated status log`;
    const content = JSON.stringify(data, null, 2);
    const logRequestOptions = {
      branch: CREDENTIAL_STATUS_REPO_BRANCH_NAME,
      commit_message: message,
      content
    };
    const logRequestEndpoint = this.filesEndpoint(
      this.metaRepoId,
      CREDENTIAL_STATUS_LOG_PATH_ENCODED
    );
    await this.client.put(logRequestEndpoint, logRequestOptions);
  }

  // creates data in status file
  async createStatusData(data: VerifiableCredential): Promise<void> {
    const configData = await this.readConfigData();
    const { latestList } = configData;
    const timestamp = (new Date()).toISOString();
    const message = `[${timestamp}]: created status credential`;
    const content = JSON.stringify(data, null, 2);
    const statusRequestOptions = {
      branch: CREDENTIAL_STATUS_REPO_BRANCH_NAME,
      commit_message: message,
      content
    };
    const statusPath = encodeURIComponent(latestList);
    const statusRequestEndpoint = this.filesEndpoint(this.repoId, statusPath);
    await this.client.post(statusRequestEndpoint, statusRequestOptions);
  }

  // retrieves response from fetching status file
  async readStatusResponse(): Promise<any> {
    const configData = await this.readConfigData();
    const { latestList } = configData;
    const statusRequestOptions = {
      params: {
        ref: CREDENTIAL_STATUS_REPO_BRANCH_NAME
      }
    };
    const statusPath = encodeURIComponent(latestList);
    const statusRequestEndpoint = this.filesEndpoint(this.repoId, statusPath);
    const statusResponse = await this.client.get(statusRequestEndpoint, statusRequestOptions);
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
    const timestamp = (new Date()).toISOString();
    const message = `[${timestamp}]: updated status credential`;
    const content = JSON.stringify(data, null, 2);
    const statusRequestOptions = {
      branch: CREDENTIAL_STATUS_REPO_BRANCH_NAME,
      commit_message: message,
      content
    };
    const statusPath = encodeURIComponent(latestList);
    const statusRequestEndpoint = this.filesEndpoint(this.repoId, statusPath);
    await this.client.put(statusRequestEndpoint, statusRequestOptions);
  }
}
