import { Actor, HttpAgent } from "@dfinity/agent";

const SIWB_CANISTER_ID = "bcxqa-kqaaa-aaaak-qotba-cai";
const IC_HOST = "https://ic0.app";
const ODIN_API_URL = "https://api.odin.fun/v1";

// IDL factory matching docs exactly
const siwbIdlFactory = ({ IDL }: any) => {
  const PublicKey = IDL.Vec(IDL.Nat8);
  const SessionKey = PublicKey;
  const Timestamp = IDL.Nat64;
  const SiwbSignature = IDL.Text;
  const PublickeyHex = IDL.Text;
  const SignMessageType = IDL.Variant({
    Bip322Simple: IDL.Null,
    ECDSA: IDL.Null,
  });
  const LoginDetails = IDL.Record({
    user_canister_pubkey: PublicKey,
    expiration: Timestamp,
  });
  const LoginResponse = IDL.Variant({ Ok: LoginDetails, Err: IDL.Text });
  const PrepareLoginResponse = IDL.Variant({ Ok: IDL.Text, Err: IDL.Text });
  return IDL.Service({
    siwb_prepare_login: IDL.Func([IDL.Text], [PrepareLoginResponse], []),
    siwb_login: IDL.Func(
      [SiwbSignature, IDL.Text, PublickeyHex, SessionKey, SignMessageType],
      [LoginResponse],
      [],
    ),
  });
};

/**
 * Get wallet signature and public key.
 */
async function signWithWallet(
  walletType: string,
  btcAddress: string,
  message: string,
): Promise<{ signature: string; publicKey: string }> {
  if (walletType === "unisat") {
    const unisat = (window as any).unisat;
    if (!unisat) throw new Error("Unisat wallet not found");
    const [signature, publicKey] = await Promise.all([
      unisat.signMessage(message, "bip322-simple"),
      unisat.getPublicKey(),
    ]);
    return { signature, publicKey };
  }

  if (walletType === "xverse") {
    const xverse = (window as any).XverseProviders?.BitcoinProvider;
    if (!xverse) throw new Error("Xverse provider not found");

    const accountsResp = await xverse.request("getAccounts", {
      purposes: ["payment", "ordinals"],
    });
    const addresses: any[] =
      accountsResp?.result?.addresses || accountsResp?.result || [];
    const match = addresses.find((a: any) => a.address === btcAddress);
    const publicKey = match?.publicKey || "";
    if (!publicKey)
      throw new Error("Could not retrieve public key from Xverse");

    const signResp = await xverse.request("signMessage", {
      address: btcAddress,
      message,
      protocol: "BIP322",
    });
    const signature =
      signResp?.result?.signature ||
      (typeof signResp?.result === "string" ? signResp.result : "");
    if (!signature) throw new Error("Xverse did not return a signature");

    return { signature, publicKey };
  }

  if (walletType === "okx") {
    const okx = (window as any).okxwallet?.bitcoin;
    if (!okx) throw new Error("OKX wallet not found");
    const publicKey = await okx.getPublicKey().catch(() => "");
    const signature = await okx.signMessage(message, {
      from: btcAddress,
      type: "bip322-simple",
    });
    return { signature, publicKey: publicKey || "" };
  }

  throw new Error(`Unsupported wallet type: ${walletType}`);
}

/**
 * SIWB flow: prepare → sign → login → derive principal from user_canister_pubkey.
 * The canonical odin.fun principal is Principal.selfAuthenticating(user_canister_pubkey).
 * This matches what odin.fun shows for your wallet.
 *
 * @param onStatus - Callback to show step status in the UI (visible without DevTools)
 */
export async function getPrincipalFromBtcWallet(
  btcAddress: string,
  walletType: string,
  onStatus?: (msg: string) => void,
): Promise<string | null> {
  const status = (msg: string) => {
    if (onStatus) onStatus(msg);
  };

  try {
    status("[1/4] Connecting to odin.fun canister...");

    // Step 1: Create SIWB actor
    const agent = new HttpAgent({ host: IC_HOST });
    const siwbActor = Actor.createActor(siwbIdlFactory, {
      agent,
      canisterId: SIWB_CANISTER_ID,
    }) as any;

    // Step 2: siwb_prepare_login → get challenge message
    status("[2/4] Getting challenge from odin.fun...");
    const prepareResp = await siwbActor.siwb_prepare_login(btcAddress);
    if ("Err" in prepareResp)
      throw new Error(`Prepare failed: ${prepareResp.Err}`);
    const message: string = prepareResp.Ok;

    // Step 3: Sign message with wallet (Bip322Simple)
    status("[3/4] Please approve signature in your wallet...");
    const { signature, publicKey } = await signWithWallet(
      walletType,
      btcAddress,
      message,
    );
    if (!publicKey) throw new Error("Could not get public key from wallet");

    // Step 4: Generate a temporary session key for the login call
    const { Ed25519KeyIdentity } = await import("@dfinity/identity");
    const sessionIdentity = Ed25519KeyIdentity.generate();
    const sessionPublicKey = new Uint8Array(
      sessionIdentity.getPublicKey().toDer(),
    );

    // Step 5: siwb_login → returns user_canister_pubkey
    status("[4/4] Verifying with odin.fun...");
    const loginResp = await siwbActor.siwb_login(
      signature,
      btcAddress,
      publicKey,
      sessionPublicKey,
      { Bip322Simple: null },
    );
    if ("Err" in loginResp) throw new Error(`Login failed: ${loginResp.Err}`);

    const { user_canister_pubkey } = loginResp.Ok;

    // KEY STEP: Derive canonical principal directly from user_canister_pubkey.
    // This is the same computation odin.fun uses internally.
    // Principal.selfAuthenticating(derPublicKey) = SHA224(derPublicKey) + 0x02
    const { Principal } = await import("@dfinity/principal");
    const canonicalPrincipal = Principal.selfAuthenticating(
      new Uint8Array(user_canister_pubkey),
    ).toString();

    status(`Connected! Principal: ${canonicalPrincipal}`);
    return canonicalPrincipal;
  } catch (e: any) {
    status(`Error: ${e?.message || String(e)}`);
    return null;
  }
}

/**
 * Fetch odin.fun username for a given principal ID.
 */
export async function fetchOdinUsername(
  principalId: string,
): Promise<string | null> {
  try {
    const res = await fetch(
      `${ODIN_API_URL}/user/${encodeURIComponent(principalId)}`,
      { headers: { Accept: "application/json" } },
    );
    if (!res.ok) return null;
    const json = await res.json();
    const data = json?.data ?? json;
    return data?.username?.trim() || null;
  } catch {
    return null;
  }
}

// Legacy exports
export function setXverseAddresses(_addresses: any[]): void {}
export function getXverseAddresses(): any[] {
  return [];
}
