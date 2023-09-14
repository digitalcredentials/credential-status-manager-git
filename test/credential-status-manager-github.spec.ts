/*!
 * Copyright (c) 2023 Digital Credentials Consortium. All rights reserved.
 */
import 'mocha';
import { expect } from 'chai';
import { createSandbox } from 'sinon';
import { VerifiableCredential } from '@digitalcredentials/vc-data-model';
import * as OctokitClient from '@octokit/rest';
import { createStatusManager } from '../src/index.js';
import {
    BaseCredentialStatusManager,
    CredentialState,
    CredentialStatusConfigData,
    CredentialStatusLogData,
    CredentialStatusLogEntry,
    CredentialStatusManagerService
} from '../src/credential-status-manager-base.js';
import * as GithubStatus from '../src/credential-status-manager-github.js';
import {
    checkLocalCredentialStatus,
    checkRemoteCredentialStatus,
    checkStatusCredential,
    didMethod,
    didSeed,
    metaRepoAccessToken,
    metaRepoName,
    ownerAccountName,
    repoAccessToken,
    repoName,
    statusListId,
    unsignedCredential1,
    unsignedCredential2,
    unsignedCredential3
} from './helpers.js';

const sandbox = createSandbox();

class MockGithubCredentialStatusManager extends GithubStatus.GithubCredentialStatusManager {
    private statusCredential: VerifiableCredential;
    private statusConfig: CredentialStatusConfigData;
    private statusLog: CredentialStatusLogEntry[];

    constructor(options: GithubStatus.GithubCredentialStatusManagerOptions) {
        const {
            ownerAccountName,
            repoName,
            metaRepoName,
            repoAccessToken,
            metaRepoAccessToken,
            didMethod,
            didSeed
        } = options;
        super({
            ownerAccountName,
            repoName,
            metaRepoName,
            repoAccessToken,
            metaRepoAccessToken,
            didMethod,
            didSeed
        });
        this.statusCredential = {} as VerifiableCredential;
        this.statusConfig = {} as CredentialStatusConfigData;
        this.statusLog = [];
    }

    // generates new status list ID
    generateStatusListId(): string {
        return statusListId;
    }

    // deploys website to host credential status management resources
    async deployCredentialStatusWebsite(): Promise<void> { }

    // checks if caller has authority to update status based on status repo access token
    async hasStatusAuthority(repoAccessToken: string): Promise<boolean> { return true; }

    // checks if status repos exist
    async statusReposExist(): Promise<boolean> { return true; }

    // retrieves data from status repo
    async readRepoData(): Promise<any> {
        throw new Error();
    }

    // retrieves data from status metadata repo
    async readMetaRepoData(): Promise<any> {
        throw new Error();
    }

    // creates data in config file
    async createConfigData(data: CredentialStatusConfigData): Promise<void> {
        this.statusConfig = data;
    }

    // retrieves data from config file
    async readConfigData(): Promise<CredentialStatusConfigData> {
        return this.statusConfig;
    }

    // updates data in config file
    async updateConfigData(data: CredentialStatusConfigData): Promise<void> {
        this.statusConfig = data;
    }

    // creates data in log file
    async createLogData(data: CredentialStatusLogData): Promise<void> {
        this.statusLog = data;
    }

    // retrieves data from log file
    async readLogData(): Promise<CredentialStatusLogData> {
        return this.statusLog;
    }

    // updates data in log file
    async updateLogData(data: CredentialStatusLogData): Promise<void> {
        this.statusLog = data;
    }

    // creates data in status file
    async createStatusData(data: VerifiableCredential): Promise<void> {
        this.statusCredential = data;
    }

    // retrieves data from status file
    async readStatusData(): Promise<VerifiableCredential> {
        return this.statusCredential;
    }

    // updates data in status file
    async updateStatusData(data: VerifiableCredential): Promise<void> {
        this.statusCredential = data;
    }
}

describe('GitHub Credential Status Manager', () => {
    const service = 'github' as CredentialStatusManagerService;
    let statusManager: GithubStatus.GithubCredentialStatusManager;
    sandbox.stub(OctokitClient.Octokit.prototype, 'constructor').returns(null);
    sandbox.stub(GithubStatus, 'GithubCredentialStatusManager').value(MockGithubCredentialStatusManager);

    beforeEach(async () => {
        statusManager = await createStatusManager({
            service,
            ownerAccountName,
            repoName,
            metaRepoName,
            repoAccessToken,
            metaRepoAccessToken,
            didMethod,
            didSeed
        }) as GithubStatus.GithubCredentialStatusManager;
    });

    it('tests output of createStatusManager', async () => {
        expect(statusManager).to.be.instanceof(BaseCredentialStatusManager);
        expect(statusManager).to.be.instanceof(GithubStatus.GithubCredentialStatusManager);
    });

    it('tests allocateStatus', async () => {
        // allocate and check status for first credential
        const credentialWithStatus1 = await statusManager.allocateStatus(unsignedCredential1) as any;
        checkLocalCredentialStatus(credentialWithStatus1, '1', service);

        // allocate and check status for second credential
        const credentialWithStatus2 = await statusManager.allocateStatus(unsignedCredential2) as any;
        checkLocalCredentialStatus(credentialWithStatus2, '2', service);

        // allocate and check status for third credential
        const credentialWithStatus3 = await statusManager.allocateStatus(unsignedCredential3) as any;
        checkLocalCredentialStatus(credentialWithStatus3, '3', service);

        // attempt to allocate and check status for existing credential
        const credentialWithStatus2Copy = await statusManager.allocateStatus(unsignedCredential2) as any;
        checkLocalCredentialStatus(credentialWithStatus2Copy, '2', service);

        // check if status repos are properly configured
        expect(await statusManager.statusReposProperlyConfigured()).to.be.true;
    });

    it('tests updateStatus and checkStatus', async () => {
        // allocate status for credential
        const credentialWithStatus = await statusManager.allocateStatus(unsignedCredential1) as any;

        // update status of credential
        const statusCredential = await statusManager.updateStatus({
            credentialId: credentialWithStatus.id,
            credentialStatus: 'revoked' as CredentialState
        }) as any;

        // check status credential
        checkStatusCredential(statusCredential, service);

        // check status of credential
        const credentialStatus = await statusManager.checkStatus(credentialWithStatus.id);
        checkRemoteCredentialStatus(credentialStatus, credentialWithStatus.id, '1');

        // check if status repos are properly configured
        expect(await statusManager.statusReposProperlyConfigured()).to.be.true;
    });
});
