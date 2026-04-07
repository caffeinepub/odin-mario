import { S as SignIdentity, h as hexToBytes, C as Cbor, u as uint8FromBufLike, b as bytesToUtf8, a as bytesToHex, r as randomBytes, w as wrapDER, D as DER_COSE_OID, E as Ed25519KeyIdentity } from "./index-B4gC7HIn.js";
import { c, d, e, f, g, i, j, P, k, l, m } from "./index-B4gC7HIn.js";
function _coseToDerEncodedBlob(cose) {
  return wrapDER(cose, DER_COSE_OID);
}
function _authDataToCose(authData) {
  const dataView = new DataView(new ArrayBuffer(2));
  const idLenBytes = authData.slice(53, 55);
  [...new Uint8Array(idLenBytes)].forEach((v, i2) => dataView.setUint8(i2, v));
  const credentialIdLength = dataView.getUint16(0);
  return authData.slice(55 + credentialIdLength);
}
class CosePublicKey {
  constructor(_cose) {
    this._cose = _cose;
    this._encodedKey = _coseToDerEncodedBlob(_cose);
  }
  toDer() {
    return this._encodedKey;
  }
  getCose() {
    return this._cose;
  }
}
function _createChallengeBuffer(challenge = "<ic0.app>") {
  if (typeof challenge === "string") {
    return Uint8Array.from(challenge, (c2) => c2.charCodeAt(0));
  } else {
    return challenge;
  }
}
async function _createCredential(credentialCreationOptions) {
  const creds = await navigator.credentials.create(credentialCreationOptions ?? {
    publicKey: {
      authenticatorSelection: {
        userVerification: "preferred"
      },
      attestation: "direct",
      challenge: _createChallengeBuffer(),
      pubKeyCredParams: [{ type: "public-key", alg: PubKeyCoseAlgo.ECDSA_WITH_SHA256 }],
      rp: {
        name: "Internet Identity Service"
      },
      user: {
        id: randomBytes(16),
        name: "Internet Identity",
        displayName: "Internet Identity"
      }
    }
  });
  if (creds === null) {
    return null;
  }
  return {
    // do _not_ use ...creds here, as creds is not enumerable in all cases
    id: creds.id,
    response: creds.response,
    type: creds.type,
    authenticatorAttachment: creds.authenticatorAttachment,
    getClientExtensionResults: creds.getClientExtensionResults,
    // Some password managers will return a Uint8Array, so we ensure we return an ArrayBuffer.
    rawId: creds.rawId,
    toJSON: creds.toJSON.bind(creds)
    // Ensure the toJSON method is included
  };
}
var PubKeyCoseAlgo;
(function(PubKeyCoseAlgo2) {
  PubKeyCoseAlgo2[PubKeyCoseAlgo2["ECDSA_WITH_SHA256"] = -7] = "ECDSA_WITH_SHA256";
})(PubKeyCoseAlgo || (PubKeyCoseAlgo = {}));
class WebAuthnIdentity extends SignIdentity {
  /**
   * Create an identity from a JSON serialization.
   * @param json - json to parse
   */
  static fromJSON(json) {
    const { publicKey, rawId } = JSON.parse(json);
    if (typeof publicKey !== "string" || typeof rawId !== "string") {
      throw new Error("Invalid JSON string.");
    }
    return new this(hexToBytes(rawId), hexToBytes(publicKey), void 0);
  }
  /**
   * Create an identity.
   * @param credentialCreationOptions an optional CredentialCreationOptions Challenge
   */
  static async create(credentialCreationOptions) {
    const creds = await _createCredential(credentialCreationOptions);
    if (!creds || creds.type !== "public-key") {
      throw new Error("Could not create credentials.");
    }
    const response = creds.response;
    if (response.attestationObject === void 0) {
      throw new Error("Was expecting an attestation response.");
    }
    const attObject = Cbor.decode(new Uint8Array(response.attestationObject));
    return new this(uint8FromBufLike(creds.rawId), _authDataToCose(attObject.authData), creds.authenticatorAttachment ?? void 0);
  }
  constructor(rawId, cose, authenticatorAttachment) {
    super();
    this.rawId = rawId;
    this.authenticatorAttachment = authenticatorAttachment;
    this._publicKey = new CosePublicKey(cose);
  }
  getPublicKey() {
    return this._publicKey;
  }
  /**
   * WebAuthn level 3 spec introduces a new attribute on successful WebAuthn interactions,
   * see https://w3c.github.io/webauthn/#dom-publickeycredential-authenticatorattachment.
   * This attribute is already implemented for Chrome, Safari and Edge.
   *
   * Given the attribute is only available after a successful interaction, the information is
   * provided opportunistically and might also be `undefined`.
   */
  getAuthenticatorAttachment() {
    return this.authenticatorAttachment;
  }
  async sign(blob) {
    const result = await navigator.credentials.get({
      publicKey: {
        allowCredentials: [
          {
            type: "public-key",
            id: this.rawId
          }
        ],
        challenge: blob,
        userVerification: "preferred"
      }
    });
    if (result.authenticatorAttachment !== null) {
      this.authenticatorAttachment = result.authenticatorAttachment;
    }
    const response = result.response;
    const encoded = Cbor.encode({
      authenticator_data: response.authenticatorData,
      client_data_json: bytesToUtf8(new Uint8Array(response.clientDataJSON)),
      signature: response.signature
    });
    if (!encoded) {
      throw new Error("failed to encode cbor");
    }
    Object.assign(encoded, {
      __signature__: void 0
    });
    return encoded;
  }
  /**
   * Allow for JSON serialization of all information needed to reuse this identity.
   */
  toJSON() {
    return {
      publicKey: bytesToHex(this._publicKey.getCose()),
      rawId: bytesToHex(this.rawId)
    };
  }
}
class Secp256k1KeyIdentity {
  constructor() {
    throw new Error("Secp256k1KeyIdentity has been moved to a new repo: @dfinity/identity-secp256k1");
  }
}
export {
  c as CryptoError,
  DER_COSE_OID,
  d as Delegation,
  e as DelegationChain,
  f as DelegationIdentity,
  g as ECDSAKeyIdentity,
  i as ED25519_OID,
  Ed25519KeyIdentity,
  j as Ed25519PublicKey,
  P as PartialDelegationIdentity,
  k as PartialIdentity,
  Secp256k1KeyIdentity,
  WebAuthnIdentity,
  l as isDelegationValid,
  m as unwrapDER,
  wrapDER
};
