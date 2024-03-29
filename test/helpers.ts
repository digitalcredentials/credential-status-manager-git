/*!
 * Copyright (c) 2023 Digital Credentials Consortium. All rights reserved.
 */
import { expect } from 'chai';
import {
  BaseCredentialStatusManager,
  CredentialStatusManagerService
} from '../src/credential-status-manager-base.js';
import { DidMethod } from '../src/helpers.js';

const credentialId1 = 'https://university-xyz.edu/credentials/3732';
const credentialId2 = 'https://university-xyz.edu/credentials/6274';
const credentialId3 = 'https://university-xyz.edu/credentials/0285';
const credentialSubject = 'did:example:abcdef';
const issuerKey = 'z6MkhVTX9BF3NGYX6cc7jWpbNnR7cAjH8LUffabZP8Qu4ysC';
const issuerDid = `did:key:${issuerKey}`;
const verificationMethod = `${issuerDid}#${issuerKey}`;

const unsignedCredential = {
  '@context': [
    'https://www.w3.org/2018/credentials/v1',
    'https://w3id.org/security/suites/ed25519-2020/v1'
  ],
  type: [
    'VerifiableCredential'
  ],
  issuer: issuerDid,
  issuanceDate: '2020-03-10T04:24:12.164Z',
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
export const statusCredentialId = 'V27UAUYPNR';

export function checkLocalCredentialStatus(
  credentialWithStatus: any,
  credentialStatusIndex: number,
  service: CredentialStatusManagerService
) {
  let statusCredentialUrl;
  switch (service) {
    case CredentialStatusManagerService.GitHub:
      statusCredentialUrl = `https://${ownerAccountName}.github.io/${repoName}/${statusCredentialId}`;
      break;
    case CredentialStatusManagerService.GitLab:
      statusCredentialUrl = `https://${ownerAccountName}.gitlab.io/${repoName}/${statusCredentialId}`;
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
  expect(credentialWithStatus.credentialStatus.statusListIndex).to.equal(credentialStatusIndex.toString());
  expect(credentialWithStatus.credentialStatus.id.startsWith(statusCredentialUrl)).to.be.true;
  expect(credentialWithStatus.credentialStatus.statusListCredential.startsWith(statusCredentialUrl)).to.be.true;
}

export function checkRemoteCredentialStatus(
  credentialStatus: any,
  credentialId: string,
  credentialStatusIndex: number
) {
  expect(credentialStatus).to.have.property('timestamp');
  expect(credentialStatus).to.have.property('credentialId');
  expect(credentialStatus).to.have.property('credentialIssuer');
  expect(credentialStatus).to.have.property('credentialSubject');
  expect(credentialStatus).to.have.property('credentialState');
  expect(credentialStatus).to.have.property('verificationMethod');
  expect(credentialStatus).to.have.property('statusCredentialId');
  expect(credentialStatus).to.have.property('credentialStatusIndex');
  expect(credentialStatus.credentialId).to.equal(credentialId);
  expect(credentialStatus.credentialIssuer).to.equal(issuerDid);
  expect(credentialStatus.credentialSubject).to.equal(credentialSubject);
  expect(credentialStatus.credentialState).to.equal('revoked');
  expect(credentialStatus.verificationMethod).to.equal(verificationMethod);
  expect(credentialStatus.statusCredentialId).to.equal(statusCredentialId);
  expect(credentialStatus.credentialStatusIndex).to.equal(credentialStatusIndex);
}

export function checkStatusCredential(
  statusCredential: any,
  service: CredentialStatusManagerService
) {
  let statusCredentialUrl;
  switch (service) {
    case CredentialStatusManagerService.GitHub:
      statusCredentialUrl = `https://${ownerAccountName}.github.io/${repoName}/${statusCredentialId}`;
      break;
    case CredentialStatusManagerService.GitLab:
      statusCredentialUrl = `https://${ownerAccountName}.gitlab.io/${repoName}/${statusCredentialId}`;
      break;
  }
  expect(statusCredential).to.have.property('id');
  expect(statusCredential).to.have.property('type');
  expect(statusCredential).to.have.property('credentialSubject');
  expect(statusCredential.credentialSubject).to.have.property('id');
  expect(statusCredential.credentialSubject).to.have.property('type');
  expect(statusCredential.credentialSubject).to.have.property('encodedList');
  expect(statusCredential.credentialSubject).to.have.property('statusPurpose');
  expect(statusCredential.id).to.equal(statusCredentialUrl);
  expect(statusCredential.type).to.include('StatusList2021Credential');
  expect(statusCredential.credentialSubject.id.startsWith(statusCredentialUrl)).to.be.true;
  expect(statusCredential.credentialSubject.type).to.equal('StatusList2021');
  expect(statusCredential.credentialSubject.statusPurpose).to.equal('revocation');
}

export async function checkSnapshotData(
  statusManager: BaseCredentialStatusManager,
  allocateCount: number,
  updateCount: number
) {
  const snapshot = await statusManager.readSnapshotData();
  const config = await statusManager.readConfigData();
  const statusCredential = await statusManager.readStatusData();
  expect(snapshot.eventLog.length).to.equal(allocateCount + updateCount);
  expect(snapshot.latestCredentialsIssuedCounter).to.equal(allocateCount);
  // report error for compact JWT credentials
  if (typeof statusCredential === 'string') {
    expect(true).to.equal(false);
    return;
  }
  expect(statusCredential.id?.endsWith(snapshot.latestStatusCredentialId)).to.be.true;
  expect(snapshot.statusCredentialIds.length).to.equal(Object.entries(snapshot.statusCredentials).length);
  expect(snapshot.statusCredentialIds).to.contain(snapshot.latestStatusCredentialId);
  expect(snapshot.eventLog.length).to.equal(config.eventLog.length);
  expect(snapshot.latestCredentialsIssuedCounter).to.equal(config.latestCredentialsIssuedCounter);
  expect(snapshot.latestStatusCredentialId).to.equal(config.latestStatusCredentialId);
  expect(snapshot.statusCredentialIds.length).to.equal(config.statusCredentialIds.length);
}
