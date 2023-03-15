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

const credentialId = 'http://example.gov/credentials/3732';
const credentialSubject = 'did:example:abcdef';
const issuerKey = 'z6MkhVTX9BF3NGYX6cc7jWpbNnR7cAjH8LUffabZP8Qu4ysC';
const issuerDid = `did:key:${issuerKey}`;
const verificationMethod = `${issuerDid}#${issuerKey}`

const unsignedCredential = {
  '@context': [
    'https://www.w3.org/2018/credentials/v1',
    'https://w3id.org/security/suites/ed25519-2020/v1'
  ],
  id: credentialId,
  type: [
    'VerifiableCredential'
  ],
  issuer: issuerDid,
  issuanceDate: '2020-03-10T04:24:12.164Z',
  credentialSubject: {
    id: credentialSubject
  }
};

const accessToken = 'abc';
const repoName = 'credential-status';
const metaRepoName = 'credential-status-metadata';
const repoOrgName = 'university-xyz';
const repoOrgId = '87654321';
const repoVisibility = 'public' as CredentialStatus.VisibilityLevel;
const didMethod = 'key' as DidMethod;
const didSeed = 'DsnrHBHFQP0ab59dQELh3uEwy7i5ArcOTwxkwRO2hM87CBRGWBEChPO7AjmwkAZ2';
const didWebUrl = 'https://vc-issuer.example.com';
const statusListId = 'V27UAUYPNR';

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

function checkLocalCredentialStatus(
  credentialWithStatus: any,
  statusListIndex: number,
  clientType: CredentialStatus.CredentialStatusClientType
) {
  let statusCredentialId;
  switch (clientType) {
    case CredentialStatus.CredentialStatusClientType.Github:
      statusCredentialId = `https://${repoOrgName}.github.io/${repoName}/${statusListId}`;
      break;
    case CredentialStatus.CredentialStatusClientType.Gitlab:
      statusCredentialId = `https://${repoOrgName}.gitlab.io/${repoName}/${statusListId}`;
      break;
  }
  expect(credentialWithStatus).to.have.property('credentialStatus');
  expect(credentialWithStatus.credentialStatus).to.have.property('id');
  expect(credentialWithStatus.credentialStatus).to.have.property('type');
  expect(credentialWithStatus.credentialStatus).to.have.property('statusPurpose');
  expect(credentialWithStatus.credentialStatus).to.have.property('statusListIndex');
  expect(credentialWithStatus.credentialStatus).to.have.property('statusListCredential');
  expect(credentialWithStatus.credentialStatus.type).to.equal('StatusList2021Entry');
  expect(credentialWithStatus.credentialStatus.statusPurpose).to.equal('revocation');
  expect(credentialWithStatus.credentialStatus.statusListIndex).to.equal(statusListIndex);
  expect(credentialWithStatus.credentialStatus.id.startsWith(statusCredentialId)).to.be.true;
  expect(credentialWithStatus.credentialStatus.statusListCredential.startsWith(statusCredentialId)).to.be.true;
}

function checkRemoteCredentialStatus(
  credentialStatus: any,
  statusListIndex: number
) {
  expect(credentialStatus).to.have.property('timestamp');
  expect(credentialStatus).to.have.property('credentialId');
  expect(credentialStatus).to.have.property('credentialIssuer');
  expect(credentialStatus).to.have.property('credentialSubject');
  expect(credentialStatus).to.have.property('credentialState');
  expect(credentialStatus).to.have.property('verificationMethod');
  expect(credentialStatus).to.have.property('statusListId');
  expect(credentialStatus).to.have.property('statusListIndex');
  expect(credentialStatus.credentialId).to.equal(credentialId);
  expect(credentialStatus.credentialIssuer).to.equal(issuerDid);
  expect(credentialStatus.credentialSubject).to.equal(credentialSubject);
  expect(credentialStatus.credentialState).to.equal('revoked');
  expect(credentialStatus.verificationMethod).to.equal(verificationMethod);
  expect(credentialStatus.statusListId).to.equal(statusListId);
  expect(credentialStatus.statusListIndex).to.equal(statusListIndex);
}

function checkStatusCredential(
  statusCredential: any,
  clientType: CredentialStatus.CredentialStatusClientType
) {
  let statusListCredentialId;
  switch (clientType) {
    case CredentialStatus.CredentialStatusClientType.Github:
      statusListCredentialId = `https://${repoOrgName}.github.io/${repoName}/${statusListId}`;
      break;
    case CredentialStatus.CredentialStatusClientType.Gitlab:
      statusListCredentialId = `https://${repoOrgName}.gitlab.io/${repoName}/${statusListId}`;
      break;
  }
  expect(statusCredential).to.have.property('id');
  expect(statusCredential).to.have.property('type');
  expect(statusCredential).to.have.property('credentialSubject');
  expect(statusCredential.credentialSubject).to.have.property('id');
  expect(statusCredential.credentialSubject).to.have.property('type');
  expect(statusCredential.credentialSubject).to.have.property('encodedList');
  expect(statusCredential.credentialSubject).to.have.property('statusPurpose');
  expect(statusCredential.id).to.equal(statusListCredentialId);
  expect(statusCredential.type).to.include('StatusList2021Credential');
  expect(statusCredential.credentialSubject.id.startsWith(statusListCredentialId)).to.be.true;
  expect(statusCredential.credentialSubject.type).to.equal('StatusList2021');
  expect(statusCredential.credentialSubject.statusPurpose).to.equal('revocation');
}

describe('Credential Status List Manager', () => {
  describe('GitHub status client', () => {
    const clientType = 'github' as CredentialStatus.CredentialStatusClientType;
    let statusClient: GithubCredentialStatus.GithubCredentialStatusClient;
    sandbox.stub(OctokitClient.Octokit.prototype, 'constructor').returns(null);
    sandbox.stub(GithubCredentialStatus, 'GithubCredentialStatusClient').value(MockGithubCredentialStatusClient);

    beforeEach(async () => {
      statusClient = await createStatusListManager({
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
      expect(statusClient).to.be.instanceof(CredentialStatus.BaseCredentialStatusClient);
      expect(statusClient).to.be.instanceof(GithubCredentialStatus.GithubCredentialStatusClient);
    });

    it('tests allocateStatus', async () => {
      // allocate and check status for first credential
      const credentialWithStatus1 = await statusClient.allocateStatus(unsignedCredential) as any;
      checkLocalCredentialStatus(credentialWithStatus1, 1, clientType);

      // allocate and check status for second credential
      const credentialWithStatus2 = await statusClient.allocateStatus(unsignedCredential) as any;
      checkLocalCredentialStatus(credentialWithStatus2, 2, clientType);

      // allocate and check status for third credential
      const credentialWithStatus3 = await statusClient.allocateStatus(unsignedCredential) as any;
      checkLocalCredentialStatus(credentialWithStatus3, 3, clientType);
    });

    it('tests updateStatus and checkStatus', async () => {
      // allocate status for credential
      const credentialWithStatus = await statusClient.allocateStatus(unsignedCredential) as any;

      // update status of credential
      const statusCredential = await statusClient.updateStatus({
        credentialId: credentialWithStatus.id,
        credentialStatus: 'revoked' as CredentialStatus.CredentialState
      }) as any;

      // check status credential
      checkStatusCredential(statusCredential, clientType);

      // check status of credential
      const credentialStatus = await statusClient.checkStatus(credentialWithStatus.id);
      checkRemoteCredentialStatus(credentialStatus, 1);
    });
  });

  describe('GitLab status client', () => {
    const clientType = 'gitlab' as CredentialStatus.CredentialStatusClientType;
    let statusClient: GitlabCredentialStatus.GitlabCredentialStatusClient;
    sandbox.stub(AxiosClient.default, 'create').returnsThis();
    sandbox.stub(GitlabCredentialStatus, 'GitlabCredentialStatusClient').value(MockGitlabCredentialStatusClient);

    beforeEach(async () => {
      statusClient = await createStatusListManager({
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
      expect(statusClient).to.be.instanceof(CredentialStatus.BaseCredentialStatusClient);
      expect(statusClient).to.be.instanceof(GitlabCredentialStatus.GitlabCredentialStatusClient);
    });

    it('tests allocateStatus', async () => {
      // allocate and check status for first credential
      const credentialWithStatus1 = await statusClient.allocateStatus(unsignedCredential) as any;
      checkLocalCredentialStatus(credentialWithStatus1, 1, clientType);

      // allocate and check status for second credential
      const credentialWithStatus2 = await statusClient.allocateStatus(unsignedCredential) as any;
      checkLocalCredentialStatus(credentialWithStatus2, 2, clientType);

      // allocate and check status for third credential
      const credentialWithStatus3 = await statusClient.allocateStatus(unsignedCredential) as any;
      checkLocalCredentialStatus(credentialWithStatus3, 3, clientType);
    });

    it('tests updateStatus and checkStatus', async () => {
      // allocate status for credential
      const credentialWithStatus = await statusClient.allocateStatus(unsignedCredential) as any;

      // update status of credential
      const statusCredential = await statusClient.updateStatus({
        credentialId: credentialWithStatus.id,
        credentialStatus: 'revoked' as CredentialStatus.CredentialState
      }) as any;

      // check status credential
      checkStatusCredential(statusCredential, clientType);

      // check status of credential
      const credentialStatus = await statusClient.checkStatus(credentialWithStatus.id);
      checkRemoteCredentialStatus(credentialStatus, 1);
    });
  });
});
