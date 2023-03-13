import 'mocha';
import { expect } from 'chai';
import { createSandbox, SinonStubbedInstance, SinonSpy } from 'sinon';
import { VerifiableCredential } from '@digitalcredentials/vc-data-model';
import * as OctokitClient from '@octokit/rest';
import * as AxiosClient from 'axios';
import { createStatusListManager } from '../src';
import * as CredentialStatus from '../src/credential-status-base';
import * as GithubCredentialStatus from '../src/credential-status-github';
import * as GitlabCredentialStatus from '../src/credential-status-gitlab';
import { DidMethod } from '../src/helpers';

const sandbox = createSandbox();

const accessToken = "abc";
const repoName = "credential-status";
const metaRepoName = "credential-status-metadata";
const repoOrgName = "university-xyz";
const repoOrgId = "87654321";
const repoVisibility = "public" as CredentialStatus.VisibilityLevel;
const didMethod = "key" as DidMethod;
const didSeed = "DsnrHBHFQP0ab59dQELh3uEwy7i5ArcOTwxkwRO2hM87CBRGWBEChPO7AjmwkAZ2";
const didWebUrl = "https://vc-issuer.example.com";
const statusListId = "V27UAUYPNR";
const statusListIndex = 3;

class MockGithubCredentialStatusClient extends GithubCredentialStatus.GithubCredentialStatusClient {
  private statusList: any;
  private statusConfig: CredentialStatus.CredentialStatusConfigData;
  private statusLog: CredentialStatus.CredentialStatusLogEntry[];

  constructor(options: GithubCredentialStatus.GithubCredentialStatusClientOptions) {
    const {
      repoName,
      metaRepoName,
      repoOrgName,
      repoVisibility,
      accessToken,
      didMethod,
      didSeed,
      didWebUrl
    } = options;
    super({
      repoName,
      metaRepoName,
      repoOrgName,
      repoVisibility,
      accessToken,
      didMethod,
      didSeed,
      didWebUrl
    });
    this.statusList = {};
    this.statusConfig = {} as CredentialStatus.CredentialStatusConfigData;
    this.statusLog = [];
  }

  // generates new status list ID
  generateStatusListId(): string {
    return statusListId;
  }

  // deploys website to host credential status management resources
  async deployCredentialStatusWebsite(): Promise<void> {}

  // checks if issuer client has access to status repo
  async hasStatusRepoAccess(accessToken: string): Promise<boolean> { return true; }

  // checks if status repo exists
  async statusRepoExists(): Promise<boolean> {
    return false;
  }

  // creates status repo
  async createStatusRepo(): Promise<void> {}

  // creates data in config file
  async createConfigData(data: CredentialStatus.CredentialStatusConfigData): Promise<void> {
    this.statusConfig = data;
  }

  // retrieves data from config file
  async readConfigData(): Promise<CredentialStatus.CredentialStatusConfigData> {
    return this.statusConfig;
  }

  // updates data in config file
  async updateConfigData(data: CredentialStatus.CredentialStatusConfigData): Promise<void> {
    this.statusConfig = data;
  }

  // creates data in log file
  async createLogData(data: CredentialStatus.CredentialStatusLogData): Promise<void> {
    this.statusLog = data;
  }

  // retrieves data from log file
  async readLogData(): Promise<CredentialStatus.CredentialStatusLogData> {
    return this.statusLog;
  }

  // updates data in log file
  async updateLogData(data: CredentialStatus.CredentialStatusLogData): Promise<void> {
    this.statusLog = data;
  }

  // creates data in status file
  async createStatusData(data: VerifiableCredential): Promise<void> {
    this.statusList = data;
  }

  // retrieves data from status file
  async readStatusData(): Promise<VerifiableCredential> {
    return this.statusList;
  }

  // updates data in status file
  async updateStatusData(data: VerifiableCredential): Promise<void> {
    this.statusList = data;
  }
}

class MockGitlabCredentialStatusClient extends GitlabCredentialStatus.GitlabCredentialStatusClient {
  private statusList: any;
  private statusConfig: CredentialStatus.CredentialStatusConfigData;
  private statusLog: CredentialStatus.CredentialStatusLogEntry[];

  constructor(options: GitlabCredentialStatus.GitlabCredentialStatusClientOptions) {
    const {
      repoName,
      metaRepoName,
      repoOrgName,
      repoOrgId,
      repoVisibility,
      accessToken,
      didMethod,
      didSeed,
      didWebUrl
    } = options;
    super({
      repoName,
      metaRepoName,
      repoOrgName,
      repoOrgId,
      repoVisibility,
      accessToken,
      didMethod,
      didSeed,
      didWebUrl
    });
    this.statusList = {};
    this.statusConfig = {} as CredentialStatus.CredentialStatusConfigData;
    this.statusLog = [];
  }

  // generates new status list ID
  generateStatusListId(): string {
    return statusListId;
  }

  // deploys website to host credential status management resources
  async deployCredentialStatusWebsite(): Promise<void> {}

  // checks if issuer client has access to status repo
  async hasStatusRepoAccess(accessToken: string): Promise<boolean> { return true; }

  // checks if status repo exists
  async statusRepoExists(): Promise<boolean> {
    return false;
  }

  // creates status repo
  async createStatusRepo(): Promise<void> {}

  // creates data in config file
  async createConfigData(data: CredentialStatus.CredentialStatusConfigData): Promise<void> {
    this.statusConfig = data;
  }

  // retrieves data from config file
  async readConfigData(): Promise<CredentialStatus.CredentialStatusConfigData> {
    return this.statusConfig;
  }

  // updates data in config file
  async updateConfigData(data: CredentialStatus.CredentialStatusConfigData): Promise<void> {
    this.statusConfig = data;
  }

  // creates data in log file
  async createLogData(data: CredentialStatus.CredentialStatusLogData): Promise<void> {
    this.statusLog = data;
  }

  // retrieves data from log file
  async readLogData(): Promise<CredentialStatus.CredentialStatusLogData> {
    return this.statusLog;
  }

  // updates data in log file
  async updateLogData(data: CredentialStatus.CredentialStatusLogData): Promise<void> {
    this.statusLog = data;
  }

  // creates data in status file
  async createStatusData(data: VerifiableCredential): Promise<void> {
    this.statusList = data;
  }

  // retrieves data from status file
  async readStatusData(): Promise<VerifiableCredential> {
    return this.statusList;
  }

  // updates data in status file
  async updateStatusData(data: VerifiableCredential): Promise<void> {
    this.statusList = data;
  }
}

describe('Credential Status List Manager', () => {
  describe('GitHub status client', () => {
    const clientType = "github" as CredentialStatus.CredentialStatusClientType;
    let githubStatusClient: GithubCredentialStatus.GithubCredentialStatusClient;
    before(async () => {
      sandbox.stub(OctokitClient.Octokit.prototype, 'constructor').returns(null);
      sandbox.stub(GithubCredentialStatus, 'GithubCredentialStatusClient').value(MockGithubCredentialStatusClient);
      githubStatusClient = await createStatusListManager({
        clientType,
        repoName,
        metaRepoName,
        repoOrgName,
        repoVisibility,
        accessToken,
        didMethod,
        didSeed,
        didWebUrl
      }) as GithubCredentialStatus.GithubCredentialStatusClient;
    });

    it('tests output of createStatusListManager', async () => {
      expect(githubStatusClient).to.be.instanceof(CredentialStatus.BaseCredentialStatusClient);
      expect(githubStatusClient).to.be.instanceof(GithubCredentialStatus.GithubCredentialStatusClient);
    });
  });

  describe('GitLab status client', () => {
    const clientType = "gitlab" as CredentialStatus.CredentialStatusClientType;
    let gitlabStatusClient: GitlabCredentialStatus.GitlabCredentialStatusClient;
    before(async () => {
      sandbox.stub(AxiosClient.default, 'create').returnsThis();
      sandbox.stub(GitlabCredentialStatus, 'GitlabCredentialStatusClient').value(MockGitlabCredentialStatusClient);
      gitlabStatusClient = await createStatusListManager({
        clientType,
        repoName,
        metaRepoName,
        repoOrgName,
        repoOrgId,
        repoVisibility,
        accessToken,
        didMethod,
        didSeed,
        didWebUrl
      }) as GitlabCredentialStatus.GitlabCredentialStatusClient;
    });

    it('tests output of createStatusListManager', async () => {
      expect(gitlabStatusClient).to.be.instanceof(CredentialStatus.BaseCredentialStatusClient);
      expect(gitlabStatusClient).to.be.instanceof(GitlabCredentialStatus.GitlabCredentialStatusClient);
    });
  });
});
