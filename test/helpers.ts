/*!
 * Copyright (c) 2023 Digital Credentials Consortium. All rights reserved.
 */
import { expect } from 'chai';
import { CredentialStatusManagerService } from '../src/credential-status-manager-base.js';
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
export const statusListId = 'V27UAUYPNR';

export function checkLocalCredentialStatus(
  credentialWithStatus: any,
  statusListIndex: number,
  service: CredentialStatusManagerService
) {
  let statusCredentialId;
  switch (service) {
    case CredentialStatusManagerService.Github:
      statusCredentialId = `https://${ownerAccountName}.github.io/${repoName}/${statusListId}`;
      break;
    case CredentialStatusManagerService.Gitlab:
      statusCredentialId = `https://${ownerAccountName}.gitlab.io/${repoName}/${statusListId}`;
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

export function checkRemoteCredentialStatus(
  credentialStatus: any,
  credentialId: string,
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

export function checkStatusCredential(
  statusCredential: any,
  service: CredentialStatusManagerService
) {
  let statusCredentialId;
  switch (service) {
    case CredentialStatusManagerService.Github:
      statusCredentialId = `https://${ownerAccountName}.github.io/${repoName}/${statusListId}`;
      break;
    case CredentialStatusManagerService.Gitlab:
      statusCredentialId = `https://${ownerAccountName}.gitlab.io/${repoName}/${statusListId}`;
      break;
  }
  expect(statusCredential).to.have.property('id');
  expect(statusCredential).to.have.property('type');
  expect(statusCredential).to.have.property('credentialSubject');
  expect(statusCredential.credentialSubject).to.have.property('id');
  expect(statusCredential.credentialSubject).to.have.property('type');
  expect(statusCredential.credentialSubject).to.have.property('encodedList');
  expect(statusCredential.credentialSubject).to.have.property('statusPurpose');
  expect(statusCredential.id).to.equal(statusCredentialId);
  expect(statusCredential.type).to.include('StatusList2021Credential');
  expect(statusCredential.credentialSubject.id.startsWith(statusCredentialId)).to.be.true;
  expect(statusCredential.credentialSubject.type).to.equal('StatusList2021');
  expect(statusCredential.credentialSubject.statusPurpose).to.equal('revocation');
}
