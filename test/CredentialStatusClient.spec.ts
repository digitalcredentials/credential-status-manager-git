import { expect } from 'chai';
import { createStatusListManager } from '../src';
import { BaseCredentialStatusClient, CredentialStatusClientType } from '../src/credential-status-base';

describe('Credential Status list manager', () => {
  it('tests createStatusListManager with GitHub client type', async () => {
    // const statusListManager = new createStatusListManager({
    //   clientType: CredentialStatusClientType.Github,
    //   ...options
    // });
    // expect(statusListManager).to.be.instanceof(BaseCredentialStatusClient);
  });

  it('tests createStatusListManager with GitLab client type', async () => {
    // const statusListManager = new createStatusListManager({
    //   clientType: CredentialStatusClientType.Gitlab,
    //   ...options
    // });
    // expect(statusListManager).to.be.instanceof(BaseCredentialStatusClient);
  });
});
