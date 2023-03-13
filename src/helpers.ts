import { decodeSecretKeySeed } from '@digitalcredentials/bnid';
import { Ed25519Signature2020 } from '@digitalcredentials/ed25519-signature-2020';
import { Ed25519VerificationKey2020 } from '@digitalcredentials/ed25519-verification-key-2020';
import { X25519KeyAgreementKey2020 } from '@digitalcredentials/x25519-key-agreement-key-2020';
import { securityLoader } from '@digitalcredentials/security-document-loader';
import { issue as sign } from '@digitalcredentials/vc';
import { VerifiableCredential } from '@digitalcredentials/vc-data-model';
import * as DidKey from '@digitalcredentials/did-method-key';
import * as DidWeb from '@interop/did-web-resolver';
import { CryptoLD } from '@digitalcredentials/crypto-ld';

// Crypto library for linked data
const cryptoLd = new CryptoLD();
cryptoLd.use(Ed25519VerificationKey2020);
cryptoLd.use(X25519KeyAgreementKey2020);

// DID drivers
const didWebDriver = DidWeb.driver({ cryptoLd }); 
const didKeyDriver = DidKey.driver();

// Document loader
const documentLoader = securityLoader().build();

// DID method used to sign credentials
export enum DidMethod {
  Key = 'key',
  Web = 'web'
}

// Type definition for signCredential method input
interface SignCredentialOptions {
  credential: any;
  didMethod: DidMethod;
  didSeed: string;
  didWebUrl?: string;
}

// Type definition for getSigningKeys method input
interface GetSigningKeysOptions {
  didMethod: DidMethod;
  didSeed: string;
  didWebUrl?: string;
}

// Type definition for getSigningKeys method output
interface GetSigningKeysResult {
  didDocument: any;
  issuerDid: string;
  keyPairs: Map<string, any>;
  verificationMethod: string;
}

// signs credential
export async function signCredential({
  credential,
  didMethod,
  didSeed,
  didWebUrl
}: SignCredentialOptions): Promise<VerifiableCredential> {
  const {
    keyPairs,
    verificationMethod
  } = await getSigningMaterial({
    didMethod,
    didSeed,
    didWebUrl
  });
  const key = keyPairs.get(verificationMethod);
  const date = (new Date()).toISOString();
  const suite = new Ed25519Signature2020({ key, date });
  return sign({
    credential,
    documentLoader,
    suite
  });
}

// retrieves signing material
export async function getSigningMaterial({
  didMethod,
  didSeed,
  didWebUrl
}: GetSigningKeysOptions)
: Promise<GetSigningKeysResult> {
  let didDocument;
  let keyPairs;
  const didSeedBytes = decodeSeed(didSeed);
  switch (didMethod) {
    case DidMethod.Key:
      ({ didDocument, keyPairs } = await didKeyDriver.generate({
        seed: didSeedBytes
      }));
      break;
    case DidMethod.Web:
      ({ didDocument, keyPairs } = await didWebDriver.generate({
        seed: didSeedBytes,
        url: didWebUrl
      }));
      break;
    default:
      throw new Error(
        '"didMethod" must be one of the following values: ' +
        `${Object.values(DidMethod).map(v => `'${v}'`).join(', ')}.`
      );
  }
  const issuerDid = didDocument.id;
  const verificationMethod = extractId(didDocument.assertionMethod[0]);
  return {
    didDocument,
    issuerDid,
    keyPairs,
    verificationMethod
  };
}

// decodes system data as JSON
export function decodeSystemData(text: string): any {
  return JSON.parse(decodeBase64AsAscii(text));
}

// encodes ASCII text as Bas64
export function encodeAsciiAsBase64(text: string): string {
  return Buffer.from(text).toString('base64');
}

// decodes Bas64 text as ASCII
function decodeBase64AsAscii(text: string): string {
  return Buffer.from(text, 'base64').toString('ascii');
}

// decodes DID seed
function decodeSeed(secretKeySeed: string): Uint8Array {
  let secretKeySeedBytes;
  if (secretKeySeed.startsWith('z')) {
    // This is a multibase-encoded seed
    secretKeySeedBytes = decodeSecretKeySeed({secretKeySeed});
  } else if (secretKeySeed.length >= 32) {
      secretKeySeedBytes = (new TextEncoder()).encode(secretKeySeed).slice(0, 32);
  } else {
    throw Error('"secretKeySeed" must be a multibase-encoded value with at least 32 bytes');
  }
  return secretKeySeedBytes;
}

// extracts ID from object or string
function extractId(objectOrString: any): string {
  if (typeof objectOrString === 'string') {
    return objectOrString;
  } 
  return objectOrString.id;
}
