/*!
 * Copyright (c) 2023 Digital Credentials Consortium. All rights reserved.
 */
import { VerifiableCredential } from '@digitalcredentials/vc-data-model';
import axios, { AxiosInstance } from 'axios';
import parseLinkHeader from 'parse-link-header';
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
} from './credential-status-manager-base.js';
import { DidMethod, decodeSystemData } from './helpers.js';

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

const REPOS_PER_PAGE = 100;

// Type definition for GitlabCredentialStatusManager constructor method input
export type GitlabCredentialStatusManagerOptions = {
  repoId: string;
  metaRepoId: string;
  repoOrgName: string;
  repoOrgId: string;
  repoVisibility: VisibilityLevel;
} & BaseCredentialStatusManagerOptions;

// Minimal set of options required for configuring GitlabCredentialStatusManager
const GITLAB_MANAGER_REQUIRED_OPTIONS = [
  'repoId',
  'metaRepoId',
  'repoOrgName',
  'repoOrgId',
  'repoVisibility'
].concat(BASE_MANAGER_REQUIRED_OPTIONS) as
  Array<keyof GitlabCredentialStatusManagerOptions & BaseCredentialStatusManagerOptions>;

// Implementation of BaseCredentialStatusManager for GitLab
export class GitlabCredentialStatusManager extends BaseCredentialStatusManager {
  private readonly repoId: string;
  private readonly metaRepoId: string;
  private readonly repoOrgName: string;
  private readonly repoOrgId: string;
  private readonly repoVisibility: VisibilityLevel;
  private client: AxiosInstance;

  constructor(options: GitlabCredentialStatusManagerOptions) {
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
    this.repoId = repoId;
    this.metaRepoId = metaRepoId;
    this.repoOrgName = repoOrgName;
    this.repoOrgId = repoOrgId;
    this.repoVisibility = repoVisibility;
    this.client = axios.create({
      baseURL: 'https://gitlab.com/api/v4',
      timeout: 6000,
      headers: {
        'Authorization': `Bearer ${accessToken}`
      }
    });
  }

  // ensures proper configuration of GitLab status manager
  ensureProperConfiguration(options: GitlabCredentialStatusManagerOptions): void {
    const missingOptions = [] as
      Array<keyof GitlabCredentialStatusManagerOptions & BaseCredentialStatusManagerOptions>;

    const isProperlyConfigured = GITLAB_MANAGER_REQUIRED_OPTIONS.every(
      (option: keyof GitlabCredentialStatusManagerOptions) => {
        if (!options[option]) {
          missingOptions.push();
        }
        return !!options[option];
      }
    );

    if (!isProperlyConfigured) {
      throw new Error(
        'You have neglected to set the following required options for the ' +
        'GitLab credential status manager: ' +
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

  // retrieves endpoint for tree
  treeEndpoint(repoId: string): string {
    return `/projects/${repoId}/repository/tree`;
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

  // checks if caller has authority to update status
  async hasStatusAuthority(accessToken: string): Promise<boolean> {
    this.resetClientAuthorization(accessToken);
    const repoRequestOptions = {
      params: {
        owned: true,
        simple: true
      }
    };
    let repos: any[] = [];
    let isFirstPage = true;
    let isLastPage = false;
    let repoEndpoint = `/projects?pagination=keyset&per_page=${REPOS_PER_PAGE}&order_by=id&sort=asc`;
    do {
      let repoResponse;
      if (isFirstPage) {
        repoResponse = await this.client.get(repoEndpoint, repoRequestOptions);
        isFirstPage = false;
      } else {
        repoResponse = await this.client.get(repoEndpoint, repoRequestOptions);
      }
      const repoSubset = repoResponse.data;
      repos = repos.concat(repoSubset);
      const parsedLinkHeader = parseLinkHeader(repoResponse.headers.link);
      repoEndpoint = parsedLinkHeader.next?.url;
      isLastPage = !parsedLinkHeader.next;
    } while (!isLastPage);
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
    let repos: any[] = [];
    let currentPage = 1;
    do {
      const repoEndpoint = `${this.reposInOrgEndpoint()}?per_page=${REPOS_PER_PAGE}&page=${currentPage}`;
      const repoSubset = (await this.client.get(repoEndpoint, repoRequestOptions)).data;
      repos = repos.concat(repoSubset);
      currentPage++;
    } while (repos.length === REPOS_PER_PAGE);
    return repos;
  }

  // checks if status repos exist
  async statusReposExist(): Promise<boolean> {
    const repos = await this.getReposInOrg();
    const statusRepoExists = repos.some((repo) => {
      return repo.name === this.repoName;
    });
    const metaStatusRepoExists = repos.some((repo) => {
      return repo.name === this.metaRepoName;
    });
    return statusRepoExists && metaStatusRepoExists;
  }

  // retrieves response from fetching status repo
  async readRepoResponse(): Promise<any> {
    const repoRequestOptions = {
      params: {
        ref: CREDENTIAL_STATUS_REPO_BRANCH_NAME
      }
    };
    const repoRequestEndpoint = this.treeEndpoint(this.repoId);
    const repoResponse = await this.client.get(repoRequestEndpoint, repoRequestOptions);
    return repoResponse.data;
  }

  // retrieves data from status repo
  async readRepoData(): Promise<any> {
    const repoResponse = await this.readRepoResponse();
    return decodeSystemData(repoResponse.content);
  }

  // retrieves response from fetching status metadata repo
  async readMetaRepoResponse(): Promise<any> {
    const metaRepoRequestOptions = {
      params: {
        ref: CREDENTIAL_STATUS_REPO_BRANCH_NAME
      }
    };
    const metaRepoRequestEndpoint = this.treeEndpoint(this.repoId);
    const metaRepoResponse = await this.client.get(metaRepoRequestEndpoint, metaRepoRequestOptions);
    return metaRepoResponse.data;
  }

  // retrieves data from status metadata repo
  async readMetaRepoData(): Promise<any> {
    const metaRepoResponse = await this.readMetaRepoResponse();
    return decodeSystemData(metaRepoResponse.content);
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
