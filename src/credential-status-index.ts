import { VerifiableCredential } from '@digitalcredentials/vc-data-model';
import {
  BaseCredentialStatusClient,
  CredentialStatusClientType,
  CredentialStatusConfigData,
  CredentialStatusLogData,
  SignCredentialOptions,
  composeStatusCredential
} from './credential-status-base';
import {
  GithubCredentialStatusClient,
  GithubCredentialStatusClientOptions
} from './credential-status-github';
import {
  GitlabCredentialStatusClient,
  GitlabCredentialStatusClientOptions
} from './credential-status-gitlab';

// Type definition for createStatusListManager function input
type StatusListManagerOptions = {
  clientType: CredentialStatusClientType;
  issuerDid: string;
  signCredentialOptions: SignCredentialOptions;
  signCredential: (credential: VerifiableCredential, options: SignCredentialOptions) => Promise<VerifiableCredential>;
} & GithubCredentialStatusClientOptions & GitlabCredentialStatusClientOptions;

// creates credential status list manager
export async function createStatusListManager(
  options: StatusListManagerOptions
): Promise<BaseCredentialStatusClient> {
  const {
    clientType,
    issuerDid,
    signCredentialOptions,
    signCredential,
    repoName,
    metaRepoName,
    repoOrgName,
    repoOrgId,
    repoVisibility,
    accessToken
  } = options;
  let credStatusClient: BaseCredentialStatusClient;
  switch (clientType) {
    case CredentialStatusClientType.Github:
      credStatusClient = new GithubCredentialStatusClient({
        repoName,
        metaRepoName,
        repoOrgName,
        repoVisibility,
        accessToken
      });
      break;
    case CredentialStatusClientType.Gitlab:
      credStatusClient = new GitlabCredentialStatusClient({
        repoName,
        metaRepoName,
        repoOrgName,
        repoOrgId,
        repoVisibility,
        accessToken
      });
      break;
    default:
      throw new Error(
        '"clientType" must be one of the following values: ' +
        `${Object.values(CredentialStatusClientType).map(v => `'${v}'`).join(', ')}.`
      );
  }

  // setup status credential
  const credentialStatusUrl = credStatusClient.getCredentialStatusUrl();
  const repoExists = await credStatusClient.statusRepoExists();
  if (!repoExists) {
    // create status repo
    await credStatusClient.createStatusRepo();

    // create and persist status config
    const listId = credStatusClient.generateStatusListId();
    const configData: CredentialStatusConfigData = {
      credentialsIssued: 0,
      latestList: listId
    };
    await credStatusClient.createConfigData(configData);

    // create and persist status log
    const logData: CredentialStatusLogData = [];
    await credStatusClient.createLogData(logData);

    // create and sign status credential
    const credentialId = `${credentialStatusUrl}/${listId}`;
    const statusCredentialDataUnsigned = await composeStatusCredential({ issuerDid, credentialId });
    const statusCredentialData = await signCredential(statusCredentialDataUnsigned, signCredentialOptions);

    // create and persist status data
    await credStatusClient.createStatusData(statusCredentialData);

    // setup credential status website
    await credStatusClient.deployCredentialStatusWebsite();
  } else {
    // sync status repo state
    await credStatusClient.syncStatusRepoState();
  }

  return credStatusClient;
}
