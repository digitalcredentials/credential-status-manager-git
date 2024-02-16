/*!
 * Copyright (c) 2023 Digital Credentials Consortium. All rights reserved.
 */
import { VerifiableCredential } from '@digitalcredentials/vc-data-model';
import axios, { AxiosInstance } from 'axios';
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
  getDateString
} from './helpers.js';

const CREDENTIAL_STATUS_REPO_RESULTS_PER_PAGE = 100;

const CREDENTIAL_STATUS_CONFIG_PATH_ENCODED = encodeURIComponent(CREDENTIAL_STATUS_CONFIG_FILE);
const CREDENTIAL_STATUS_SNAPSHOT_PATH_ENCODED = encodeURIComponent(CREDENTIAL_STATUS_SNAPSHOT_FILE);

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

const CREDENTIAL_STATUS_WEBSITE_FILE_PATHS = [
  CREDENTIAL_STATUS_WEBSITE_HOME_PAGE_PATH,
  CREDENTIAL_STATUS_WEBSITE_CI_CONFIG_PATH,
  CREDENTIAL_STATUS_WEBSITE_GEMFILE_PATH
];

// Type definition for GitLabCredentialStatusManager constructor method input
export type GitLabCredentialStatusManagerOptions = {
  ownerAccountName: string;
  repoId: string;
  metaRepoId: string;
} & BaseCredentialStatusManagerOptions;

// Minimal set of options required for configuring GitLabCredentialStatusManager
const GITLAB_MANAGER_REQUIRED_OPTIONS = [
  'ownerAccountName',
  'repoId',
  'metaRepoId'
].concat(BASE_MANAGER_REQUIRED_OPTIONS) as
  Array<keyof GitLabCredentialStatusManagerOptions & BaseCredentialStatusManagerOptions>;

// Implementation of BaseCredentialStatusManager for GitLab
export class GitLabCredentialStatusManager extends BaseCredentialStatusManager {
  private readonly ownerAccountName: string;
  private readonly repoId: string;
  private readonly metaRepoId: string;
  private repoClient: AxiosInstance;
  private metaRepoClient: AxiosInstance;

  constructor(options: GitLabCredentialStatusManagerOptions) {
    const {
      ownerAccountName,
      repoName,
      repoId,
      metaRepoName,
      metaRepoId,
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
    this.validateConfiguration(options);
    this.ownerAccountName = ownerAccountName;
    this.repoId = repoId;
    this.metaRepoId = metaRepoId;
    this.repoClient = axios.create({
      baseURL: 'https://gitlab.com/api/v4',
      timeout: 10000,
      headers: {
        'Authorization': `Bearer ${repoAccessToken}`
      }
    });
    this.metaRepoClient = axios.create({
      baseURL: 'https://gitlab.com/api/v4',
      timeout: 10000,
      headers: {
        'Authorization': `Bearer ${metaRepoAccessToken}`
      }
    });
  }

  // ensures valid configuration of GitLab status manager
  validateConfiguration(options: GitLabCredentialStatusManagerOptions): void {
    const missingOptions = [] as
      Array<keyof GitLabCredentialStatusManagerOptions & BaseCredentialStatusManagerOptions>;

    const hasValidConfiguration = GITLAB_MANAGER_REQUIRED_OPTIONS.every(
      (option: keyof GitLabCredentialStatusManagerOptions) => {
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
          'GitLab credential status manager: ' +
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

  // retrieves endpoint for files
  filesEndpoint(repoId: string, path: string): string {
    return `/projects/${repoId}/repository/files/${path}`;
  }

  // retrieves endpoint for commits
  commitsEndpoint(repoId: string): string {
    return `/projects/${repoId}/repository/commits`;
  }

  // retrieves endpoint for repo
  repoEndpoint(repoId: string): string {
    return `/projects/${repoId}`;
  }

  // retrieves endpoint for repo
  repoTreeEndpoint(repoId: string): string {
    return `/projects/${repoId}/repository/tree`;
  }

  // retrieves status credential base URL
  getStatusCredentialUrlBase(): string {
    return `https://${this.ownerAccountName}.gitlab.io/${this.repoName}`;
  }

  // deploys website to host credential status management resources
  async deployCredentialStatusWebsite(): Promise<void> {
    const timestamp = getDateString();
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
    const websiteRequestEndpoint = this.commitsEndpoint(this.repoId);
    await this.repoClient.post(websiteRequestEndpoint, websiteRequestOptions);
  }

  // resets client authorization
  resetClientAuthorization(repoAccessToken: string, metaRepoAccessToken?: string): void {
    this.repoClient = axios.create({
      baseURL: 'https://gitlab.com/api/v4',
      timeout: 6000,
      headers: {
        'Authorization': `Bearer ${repoAccessToken}`
      }
    });
    if (metaRepoAccessToken) {
      this.metaRepoClient = axios.create({
        baseURL: 'https://gitlab.com/api/v4',
        timeout: 6000,
        headers: {
          'Authorization': `Bearer ${metaRepoAccessToken}`
        }
      });
    }
  }

  // checks if caller has authority to update status based on status repo access token
  async hasStatusAuthority(repoAccessToken: string, metaRepoAccessToken?: string): Promise<boolean> {
    this.resetClientAuthorization(repoAccessToken, metaRepoAccessToken);

    let hasRepoAccess = true;
    try {
      await this.getRepo();
    } catch (error: any) {
      hasRepoAccess = false;
    }

    let hasMetaRepoAccess = true;
    try {
      await this.getMetaRepo();
    } catch (error: any) {
      hasMetaRepoAccess = false;
    }

    return hasRepoAccess && hasMetaRepoAccess;
  }

  // checks if status repos exist
  async statusReposExist(): Promise<boolean> {
    try {
      await this.getRepo();
      await this.getMetaRepo();
    } catch (error) {
      return false;
    }
    return true;
  }

  // checks if status repos are empty
  async statusReposEmpty(): Promise<boolean> {
    let repoEmpty = false;
    try {
      // retrieve status repo emptiness state
      const repo = await this.getRepo();
      repoEmpty = repo.empty_repo;
    } catch (error: any) {
      // track that status repo is empty
      repoEmpty = true;
    }

    let metaRepoEmpty = false;
    try {
      // retrieve status metadata repo emptiness state
      const metaRepo = await this.getMetaRepo();
      metaRepoEmpty = metaRepo.empty_repo;
    } catch (error: any) {
      // track that status metadata repo is empty
      metaRepoEmpty = true;
    }

    // check if both status repos are empty
    return repoEmpty && metaRepoEmpty;
  }

  // retrieves content of status credential repo
  async getRepo(): Promise<any> {
    const repoRequestOptions = {
      params: {
        ref: CREDENTIAL_STATUS_REPO_BRANCH_NAME
      }
    };
    const repoRequestEndpoint = this.repoEndpoint(this.repoId);
    const repoResponse = await this.repoClient.get(repoRequestEndpoint, repoRequestOptions);
    return repoResponse.data;
  }

  // retrieves content of status credential repo tree
  async getRepoTree(): Promise<any> {
    let repo: any[] = [];
    let page = 1;
    const repoRequestOptions = {
      params: {
        ref: CREDENTIAL_STATUS_REPO_BRANCH_NAME
      }
    };
    while (true) {
      const repoRequestEndpoint = this.repoTreeEndpoint(this.repoId);
      const repoPartial = (await this.repoClient.get(
        `${repoRequestEndpoint}?per_page=${CREDENTIAL_STATUS_REPO_RESULTS_PER_PAGE}&page=${page}`,
        repoRequestOptions
      )).data;
      if (repoPartial.length === 0) {
        break;
      }
      const repoPartialFiltered = repoPartial.filter((file: any) => {
        return !CREDENTIAL_STATUS_WEBSITE_FILE_PATHS.includes(file.name);
      });
      repo = repo.concat(repoPartialFiltered);
      page++;
    }
    return repo;
  }

  // retrieves filenames of status credential repo content
  async getRepoFilenames(): Promise<string[]> {
    const repo = await this.getRepoTree();
    return repo.map((file: any) => file.name);
  }

  // retrieves content of credential status metadata repo
  async getMetaRepo(): Promise<any> {
    const metaRepoRequestOptions = {
      params: {
        ref: CREDENTIAL_STATUS_REPO_BRANCH_NAME
      }
    };
    const metaRepoRequestEndpoint = this.repoEndpoint(this.metaRepoId);
    const metaRepoResponse = await this.metaRepoClient.get(metaRepoRequestEndpoint, metaRepoRequestOptions);
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
    const content = JSON.stringify(statusCredential, null, 2);
    const statusRequestOptions = {
      branch: CREDENTIAL_STATUS_REPO_BRANCH_NAME,
      commit_message: message,
      content
    };
    const statusPath = encodeURIComponent(statusCredentialId);
    const statusRequestEndpoint = this.filesEndpoint(this.repoId, statusPath);
    await this.repoClient.post(statusRequestEndpoint, statusRequestOptions);
  }

  // retrieves response from fetching status file
  async getStatusCredentialResponse(statusCredentialId?: string): Promise<any> {
    let statusCredentialFinal;
    if (statusCredentialId) {
      statusCredentialFinal = statusCredentialId;
    } else {
      ({ latestStatusCredentialId: statusCredentialFinal } = await this.getConfig());
    }
    const statusRequestOptions = {
      params: {
        ref: CREDENTIAL_STATUS_REPO_BRANCH_NAME
      }
    };
    const statusPath = encodeURIComponent(statusCredentialFinal);
    const statusRequestEndpoint = this.filesEndpoint(this.repoId, statusPath);
    const statusResponse = await this.repoClient.get(statusRequestEndpoint, statusRequestOptions);
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
    const timestamp = getDateString();
    const message = `[${timestamp}]: updated status credential`;
    const content = JSON.stringify(statusCredential, null, 2);
    const statusRequestOptions = {
      branch: CREDENTIAL_STATUS_REPO_BRANCH_NAME,
      commit_message: message,
      content
    };
    const statusPath = encodeURIComponent(statusCredentialId);
    const statusRequestEndpoint = this.filesEndpoint(this.repoId, statusPath);
    await this.repoClient.put(statusRequestEndpoint, statusRequestOptions);
  }

  // deletes status credentials
  async deleteStatusCredentials(): Promise<void> {
    const repoFilenames = await this.getRepoFilenames();
    const actions = repoFilenames.map((repoFilename) => {
      return {
        action: 'delete',
        file_path: repoFilename
      };
    });
    const timestamp = getDateString();
    const message = `[${timestamp}]: deleted status credential data: ${repoFilenames.join(', ')}`;
    const statusRequestOptions = {
      branch: CREDENTIAL_STATUS_REPO_BRANCH_NAME,
      commit_message: message,
      actions
    };
    const statusRequestEndpoint = this.commitsEndpoint(this.repoId);
    await this.repoClient.post(statusRequestEndpoint, statusRequestOptions);
  }

  // creates config
  async createConfig(config: Config): Promise<void> {
    const timestamp = getDateString();
    const message = `[${timestamp}]: created status credential config`;
    const content = JSON.stringify(config, null, 2);
    const configRequestOptions = {
      branch: CREDENTIAL_STATUS_REPO_BRANCH_NAME,
      commit_message: message,
      content
    };
    const configRequestEndpoint = this.filesEndpoint(
      this.metaRepoId,
      CREDENTIAL_STATUS_CONFIG_PATH_ENCODED
    );
    await this.metaRepoClient.post(configRequestEndpoint, configRequestOptions);
  }

  // retrieves response from fetching config file
  async getConfigResponse(): Promise<any> {
    const configRequestOptions = {
      params: {
        ref: CREDENTIAL_STATUS_REPO_BRANCH_NAME
      }
    };
    const configRequestEndpoint = this.filesEndpoint(
      this.metaRepoId,
      CREDENTIAL_STATUS_CONFIG_PATH_ENCODED
    );
    const configResponse = await this.metaRepoClient.get(configRequestEndpoint, configRequestOptions);
    return configResponse.data;
  }

  // retrieves config
  async getConfig(): Promise<Config> {
    const configResponse = await this.getConfigResponse();
    return decodeSystemData(configResponse.content);
  }

  // updates config
  async updateConfig(config: Config): Promise<void> {
    const timestamp = getDateString();
    const message = `[${timestamp}]: updated status credential config`;
    const content = JSON.stringify(config, null, 2);
    const configRequestOptions = {
      branch: CREDENTIAL_STATUS_REPO_BRANCH_NAME,
      commit_message: message,
      content
    };
    const configRequestEndpoint = this.filesEndpoint(
      this.metaRepoId,
      CREDENTIAL_STATUS_CONFIG_PATH_ENCODED
    );
    await this.metaRepoClient.put(configRequestEndpoint, configRequestOptions);
  }

  // deletes config
  async deleteConfig(): Promise<void> {
    const timestamp = getDateString();
    const message = `[${timestamp}]: deleted config data`;
    const configRequestOptions = {
      data: {
        branch: CREDENTIAL_STATUS_REPO_BRANCH_NAME,
        commit_message: message
      }
    };
    const configRequestEndpoint = this.filesEndpoint(
      this.metaRepoId,
      CREDENTIAL_STATUS_CONFIG_PATH_ENCODED
    );
    await this.metaRepoClient.delete(configRequestEndpoint, configRequestOptions);
  }

  // creates snapshot
  async createSnapshot(snapshot: Snapshot): Promise<void> {
    const timestamp = getDateString();
    const message = `[${timestamp}]: created status credential snapshot`;
    const content = JSON.stringify(snapshot, null, 2);
    const snapshotRequestOptions = {
      branch: CREDENTIAL_STATUS_REPO_BRANCH_NAME,
      commit_message: message,
      content
    };
    const snapshotRequestEndpoint = this.filesEndpoint(
      this.metaRepoId,
      CREDENTIAL_STATUS_SNAPSHOT_PATH_ENCODED
    );
    await this.metaRepoClient.post(snapshotRequestEndpoint, snapshotRequestOptions);
  }

  // retrieves response from fetching snapshot file
  async getSnapshotResponse(): Promise<any> {
    const snapshotRequestOptions = {
      params: {
        ref: CREDENTIAL_STATUS_REPO_BRANCH_NAME
      }
    };
    const snapshotRequestEndpoint = this.filesEndpoint(
      this.metaRepoId,
      CREDENTIAL_STATUS_SNAPSHOT_PATH_ENCODED
    );
    const snapshotResponse = await this.metaRepoClient.get(snapshotRequestEndpoint, snapshotRequestOptions);
    return snapshotResponse.data;
  }

  // retrieves snapshot
  async getSnapshot(): Promise<Snapshot> {
    const snapshotResponse = await this.getSnapshotResponse();
    return decodeSystemData(snapshotResponse.content);
  }

  // deletes snapshot
  async deleteSnapshot(): Promise<void> {
    const timestamp = getDateString();
    const message = `[${timestamp}]: deleted snapshot data`;
    const snapshotRequestOptions = {
      data: {
        branch: CREDENTIAL_STATUS_REPO_BRANCH_NAME,
        commit_message: message
      }
    };
    const snapshotRequestEndpoint = this.filesEndpoint(
      this.metaRepoId,
      CREDENTIAL_STATUS_SNAPSHOT_PATH_ENCODED
    );
    await this.metaRepoClient.delete(snapshotRequestEndpoint, snapshotRequestOptions);
  }

  // checks if snapshot exists
  async snapshotExists(): Promise<boolean> {
    try {
      const snapshotRequestOptions = {
        params: {
          ref: CREDENTIAL_STATUS_REPO_BRANCH_NAME
        }
      };
      const snapshotRequestEndpoint = this.filesEndpoint(
        this.metaRepoId,
        CREDENTIAL_STATUS_SNAPSHOT_PATH_ENCODED
      );
      await this.metaRepoClient.get(snapshotRequestEndpoint, snapshotRequestOptions);
    } catch (error) {
      return false;
    }
    return true;
  }
}
