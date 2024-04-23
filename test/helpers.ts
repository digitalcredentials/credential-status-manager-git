/*!
 * Copyright (c) 2023-2024 Digital Credentials Consortium. All rights reserved.
 */
import { expect } from 'chai';
import {
  BaseCredentialStatusManager,
  GitService,
  StatusPurpose
} from '../src/credential-status-manager-base.js';
import { DidMethod } from '../src/helpers.js';

const credentialId1 = 'https://university-xyz.edu/credentials/3732';
const credentialId2 = 'https://university-xyz.edu/credentials/6274';
const credentialId3 = 'https://university-xyz.edu/credentials/0285';
const credentialSubject = 'did:example:abcdef';
const issuerKey = 'z6MkhVTX9BF3NGYX6cc7jWpbNnR7cAjH8LUffabZP8Qu4ysC';
const issuerDid = `did:key:${issuerKey}`;

const unsignedCredential = {
  '@context': [
    'https://www.w3.org/ns/credentials/v2'
  ],
  type: [
    'VerifiableCredential'
  ],
  issuer: issuerDid,
  validFrom: '2020-03-10T04:24:12.164Z',
  credentialSubject: {
    id: credentialSubject
  }
};

export const unsignedCredential1 = {
  ...unsignedCredential,
  id: credentialId1
};

export const unsignedCredential2 = {
  ...unsignedCredential,
  id: credentialId2
};

export const unsignedCredential3 = {
  ...unsignedCredential,
  id: credentialId3
};

export const ownerAccountName = 'university-xyz';
export const repoName = 'credential-status';
export const repoId = '12345678';
export const metaRepoName = 'credential-status-metadata';
export const metaRepoId = '43215678';
export const repoAccessToken = 'abc123';
export const metaRepoAccessToken = 'def456';
export const didMethod = 'key' as DidMethod;
export const didSeed = 'DsnrHBHFQP0ab59dQELh3uEwy7i5ArcOTwxkwRO2hM87CBRGWBEChPO7AjmwkAZ2';

export function checkLocalCredentialStatus(
  credentialWithStatus: any,
  gitService: GitService
) {
  let statusCredentialUrlBase: string;
  switch (gitService) {
    case GitService.GitHub:
      statusCredentialUrlBase = `https://${ownerAccountName}.github.io/${repoName}`;
      break;
    case GitService.GitLab:
      statusCredentialUrlBase = `https://${ownerAccountName}.gitlab.io/${repoName}`;
      break;
  }
  expect(credentialWithStatus).to.have.property('credentialStatus');
  expect(credentialWithStatus.credentialStatus).to.have.property('id');
  expect(credentialWithStatus.credentialStatus).to.have.property('type');
  expect(credentialWithStatus.credentialStatus).to.have.property('statusPurpose');
  expect(credentialWithStatus.credentialStatus).to.have.property('statusListIndex');
  expect(credentialWithStatus.credentialStatus).to.have.property('statusListCredential');
  expect(credentialWithStatus.credentialStatus.type).to.equal('BitstringStatusListEntry');
  expect(credentialWithStatus.credentialStatus.statusPurpose).to.equal('revocation');
  expect(credentialWithStatus.credentialStatus.id.startsWith(statusCredentialUrlBase)).to.be.true;
  expect(credentialWithStatus.credentialStatus.statusListCredential.startsWith(statusCredentialUrlBase)).to.be.true;
}

export function checkRemoteCredentialStatus(
  credentialStatusInfo: any,
  valid: boolean
) {
  expect(credentialStatusInfo).to.have.property('revocation');
  expect(credentialStatusInfo.revocation).to.have.property('statusCredentialId');
  expect(credentialStatusInfo.revocation).to.have.property('statusListIndex');
  expect(credentialStatusInfo.revocation).to.have.property('valid');
  expect(credentialStatusInfo.revocation.valid).to.equal(valid);
}

export function checkStatusCredential(
  statusCredential: any,
  gitService: GitService
) {
  let statusCredentialUrlBase: string;
  switch (gitService) {
    case GitService.GitHub:
      statusCredentialUrlBase = `https://${ownerAccountName}.github.io/${repoName}`;
      break;
    case GitService.GitLab:
      statusCredentialUrlBase = `https://${ownerAccountName}.gitlab.io/${repoName}`;
      break;
  }
  expect(statusCredential).to.have.property('id');
  expect(statusCredential).to.have.property('type');
  expect(statusCredential).to.have.property('credentialSubject');
  expect(statusCredential.credentialSubject).to.have.property('id');
  expect(statusCredential.credentialSubject).to.have.property('type');
  expect(statusCredential.credentialSubject).to.have.property('encodedList');
  expect(statusCredential.credentialSubject).to.have.property('statusPurpose');
  expect(statusCredential.id.startsWith(statusCredentialUrlBase)).to.be.true;
  expect(statusCredential.type).to.include('BitstringStatusListCredential');
  expect(statusCredential.credentialSubject.id.startsWith(statusCredentialUrlBase)).to.be.true;
  expect(statusCredential.credentialSubject.type).to.equal('BitstringStatusList');
  expect(statusCredential.credentialSubject.statusPurpose).to.equal('revocation');
}

export function checkUserCredentialInfo(
  credentialId: string,
  credentialInfo: any,
  valid: boolean
) {
  expect(credentialInfo).to.have.property('id');
  expect(credentialInfo).to.have.property('issuer');
  expect(credentialInfo).to.have.property('subject');
  expect(credentialInfo).to.have.property('statusInfo');
  expect(credentialInfo.id).to.equal(credentialId);
  expect(credentialInfo.issuer).to.equal(issuerDid);
  expect(credentialInfo.subject).to.equal(credentialSubject);
  checkRemoteCredentialStatus(credentialInfo.statusInfo, valid);
}

const getNumberArraySum = (numberArray: number[]) => {
  return numberArray.reduce(
    (accumulator, currentValue) => accumulator + currentValue, 0
  );
}

export async function checkSnapshot(
  statusManager: BaseCredentialStatusManager,
  allocateCounts: { [purpose in StatusPurpose]: number },
  updateCounts: { [purpose in StatusPurpose]: number }
) {
  const snapshot = await statusManager.getSnapshot();
  const config = await statusManager.getConfig();
  const statusPurposes = Object.keys(config.statusCredentialInfo) as StatusPurpose[];
  for (const statusPurpose of statusPurposes) {
    const {
      latestStatusCredentialId: latestStatusCredentialIdConfig,
      latestCredentialsIssuedCounter: latestCredentialsIssuedCounterConfig,
      statusCredentialsCounter: statusCredentialsCounterConfig
    } = config.statusCredentialInfo[statusPurpose];
    const {
      latestStatusCredentialId: latestStatusCredentialIdSnapshot,
      latestCredentialsIssuedCounter: latestCredentialsIssuedCounterSnapshot,
      statusCredentialsCounter: statusCredentialsCounterSnapshot
    } = snapshot.statusCredentialInfo[statusPurpose];
    const statusCredential = await statusManager.getStatusCredential(latestStatusCredentialIdConfig);
    const eventCounter =
      getNumberArraySum(Object.values(allocateCounts)) +
      getNumberArraySum(Object.values(updateCounts))
    expect(snapshot.eventLog.length).to.equal(eventCounter);
    expect(latestCredentialsIssuedCounterSnapshot).to.equal(allocateCounts[statusPurpose]);
    // report error for compact JWT credentials
    if (typeof statusCredential === 'string') {
      expect(true).to.equal(false);
      return;
    }
    expect(statusCredential.id?.endsWith(latestStatusCredentialIdSnapshot)).to.be.true;
    expect(snapshot.statusCredentialIds.length).to.equal(Object.entries(snapshot.statusCredentials).length);
    expect(snapshot.statusCredentialIds).to.contain(latestStatusCredentialIdSnapshot);
    expect(snapshot.eventLog.length).to.equal(config.eventLog.length);
    expect(latestCredentialsIssuedCounterSnapshot).to.equal(latestCredentialsIssuedCounterConfig);
    expect(latestStatusCredentialIdSnapshot).to.equal(latestStatusCredentialIdConfig);
    expect(statusCredentialsCounterSnapshot).to.equal(statusCredentialsCounterConfig);
    expect(snapshot.statusCredentialIds.length).to.equal(config.statusCredentialIds.length);
  }
}
