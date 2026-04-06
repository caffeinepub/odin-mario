import { Button } from "@/components/ui/button";
import {
  AlertCircle,
  ExternalLink,
  Loader2,
  ShieldCheck,
  Wallet,
} from "lucide-react";
import { useEffect, useState } from "react";

interface WalletLoginProps {
  onSuccess: () => void;
}

type LoginState =
  | "idle"
  | "connecting"
  | "checking"
  | "insufficient"
  | "error"
  | "no_wallet";

type WalletType = "unisat" | "xverse" | "okx" | "plug" | null;

// Token requirements: ANY ONE of these is sufficient
const TOKEN_REQUIREMENTS = [
  { id: "2ip5", name: "ODINMARIO", min: 50000 },
  { id: "2rfi", name: "BABYODIN", min: 500 },
  { id: "2idg", name: "TEDY", min: 10000 },
];

function detectWallets(): WalletType[] {
  if (typeof window === "undefined") return [];
  const found: WalletType[] = [];
  if ((window as any).unisat) found.push("unisat");
  if ((window as any).XverseProviders?.BitcoinProvider) found.push("xverse");
  if ((window as any).okxwallet?.bitcoin) found.push("okx");
  if ((window as any).ic?.plug) found.push("plug");
  return found;
}

const WALLET_LABELS: Record<string, string> = {
  unisat: "Unisat",
  xverse: "Xverse",
  okx: "OKX Wallet",
  plug: "Plug",
};

async function getWalletAddress(wallet: WalletType): Promise<string> {
  if (wallet === "unisat") {
    const unisat = (window as any).unisat;
    const accounts: string[] = await unisat.requestAccounts();
    if (!accounts || accounts.length === 0)
      throw new Error("No account found in Unisat");
    return accounts[0];
  }
  if (wallet === "xverse") {
    const xverse = (window as any).XverseProviders?.BitcoinProvider;
    if (!xverse) throw new Error("Xverse provider not found");
    // wallet_connect must be called first to prompt user approval
    try {
      await xverse.request("wallet_connect", {
        purposes: ["payment", "ordinals"],
        message: "Connect to Odin Mario",
      });
    } catch (_connErr) {
      // May throw if already connected — continue anyway
    }
    let addresses: any[] | undefined;
    try {
      const r = await xverse.request("getAccounts", {
        purposes: ["payment", "ordinals"],
      });
      addresses = r?.result?.addresses;
    } catch (_e) {
      // ignore, try fallback
    }
    if (!addresses || addresses.length === 0) {
      try {
        const r2 = await xverse.request("getAddresses", {
          purposes: ["payment", "ordinals"],
        });
        addresses = r2?.result?.addresses;
      } catch (_e2) {
        // ignore
      }
    }
    if (!addresses || addresses.length === 0)
      throw new Error(
        "No account found in Xverse. Make sure Xverse is unlocked and has at least one account.",
      );
    return addresses[0].address;
  }
  if (wallet === "okx") {
    const okx = (window as any).okxwallet.bitcoin;
    const accounts = await okx.requestAccounts();
    if (!accounts || accounts.length === 0)
      throw new Error("No account found in OKX");
    return accounts[0];
  }
  if (wallet === "plug") {
    const plug = (window as any).ic.plug;
    await plug.requestConnect({ whitelist: [] });
    const principal = await plug.getPrincipal();
    return principal.toString();
  }
  throw new Error("Unknown wallet");
}

interface BalanceResult {
  hasAccess: boolean;
  matchedToken: string | null;
  matchedBalance: number;
  matchedMin: number;
  allBalances: { name: string; balance: number; min: number }[];
}

async function checkTokenBalances(address: string): Promise<BalanceResult> {
  const allBalances: { name: string; balance: number; min: number }[] = [];
  let hasAccess = false;
  let matchedToken: string | null = null;
  let matchedBalance = 0;
  let matchedMin = 0;

  // Try to fetch all user tokens from odin.fun public API
  const endpoints = [
    `https://api.odin.fun/v1/user/${encodeURIComponent(address)}/tokens`,
    `https://api.odin.fun/v1/user/${encodeURIComponent(address)}/tokens?limit=100`,
  ];

  let tokens: any[] = [];
  for (const url of endpoints) {
    try {
      const res = await fetch(url, {
        headers: { Accept: "application/json" },
        signal: AbortSignal.timeout(8000),
      });
      if (!res.ok) continue;
      const json = await res.json();
      // Handle various response shapes
      if (Array.isArray(json)) tokens = json;
      else if (Array.isArray(json.data)) tokens = json.data;
      else if (Array.isArray(json.tokens)) tokens = json.tokens;
      else if (Array.isArray(json.items)) tokens = json.items;
      if (tokens.length > 0) break;
    } catch {
      // continue to next endpoint
    }
  }

  for (const req of TOKEN_REQUIREMENTS) {
    const found = tokens.find((t: any) => {
      const tid = t?.token?.id ?? t?.id ?? t?.token_id ?? "";
      return tid === req.id;
    });

    let balance = 0;
    if (found) {
      const raw: number =
        found.balance ??
        found.amount ??
        found.holdings ??
        found.token?.balance ??
        0;
      // odin.fun balances are stored with 8 decimal places
      balance = raw > 1e9 ? raw / 1e8 : raw;
    }

    allBalances.push({ name: req.name, balance, min: req.min });

    if (!hasAccess && balance >= req.min) {
      hasAccess = true;
      matchedToken = req.name;
      matchedBalance = balance;
      matchedMin = req.min;
    }
  }

  return { hasAccess, matchedToken, matchedBalance, matchedMin, allBalances };
}

export default function WalletLogin({ onSuccess }: WalletLoginProps) {
  const [state, setState] = useState<LoginState>("idle");
  const [errorMsg, setErrorMsg] = useState("");
  const [availableWallets, setAvailableWallets] = useState<WalletType[]>([]);
  const [balanceInfo, setBalanceInfo] = useState<BalanceResult | null>(null);
  const [selectedWallet, setSelectedWallet] = useState<WalletType>(null);
  const [showWalletPicker, setShowWalletPicker] = useState(false);
  const [tokenStats, setTokenStats] = useState<{
    price: string;
    holders: string;
    mcap: string;
  } | null>(null);

  useEffect(() => {
    const timer = setTimeout(() => {
      setAvailableWallets(detectWallets());
    }, 600);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    async function fetchStats() {
      try {
        const [tokenRes, btcRes] = await Promise.all([
          fetch("https://api.odin.fun/v1/token/2ip5"),
          fetch(
            "https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd",
          ),
        ]);
        const tokenData = await tokenRes.json();
        const btcData = await btcRes.json();
        const td = tokenData?.data ?? tokenData;
        const btcPrice = btcData?.bitcoin?.usd ?? 0;
        const rawPrice = td?.price ?? td?.last_price ?? 0;
        const rawMcap = td?.marketcap ?? td?.market_cap ?? td?.mcap ?? 0;
        const holders = td?.holder_count ?? td?.holders ?? td?.holderCount ?? 0;
        const priceSats = (Number(rawPrice) / 1000).toFixed(3);
        const mcapUsd =
          btcPrice > 0
            ? `$${Math.round((Number(rawMcap) / 1e11) * btcPrice).toLocaleString()}`
            : "$0";
        setTokenStats({
          price: `${priceSats} sats`,
          holders: Number(holders).toLocaleString(),
          mcap: mcapUsd,
        });
      } catch (_e) {
        /* silent */
      }
    }
    fetchStats();
    const interval = setInterval(fetchStats, 10000);
    return () => clearInterval(interval);
  }, []);

  async function handleConnect(wallet: WalletType) {
    if (!wallet) return;
    setSelectedWallet(wallet);
    setShowWalletPicker(false);
    setState("connecting");
    setErrorMsg("");

    try {
      const address = await getWalletAddress(wallet);

      setState("checking");
      const result = await checkTokenBalances(address);
      setBalanceInfo(result);

      if (!result.hasAccess) {
        setState("insufficient");
        return;
      }

      localStorage.setItem(
        "odinmario_auth",
        JSON.stringify({
          address,
          wallet,
          expiresAt: Date.now() + 24 * 3600 * 1000,
        }),
      );
      onSuccess();
    } catch (err: any) {
      console.error("Wallet connect error:", err);
      setErrorMsg(err?.message || "Connection failed. Please try again.");
      setState("error");
    }
  }

  const isLoading = state === "connecting" || state === "checking";

  return (
    <div
      className="min-h-screen flex items-center justify-center relative overflow-hidden"
      style={{
        backgroundImage: `url('/assets/uploads/20013_11zon-1.png')`,
        backgroundSize: "cover",
        backgroundPosition: "center",
        imageRendering: "pixelated",
      }}
    >
      <div className="absolute inset-0 bg-black/60" />

      <div
        className="relative z-10 w-full max-w-md mx-4 rounded-2xl border-2 border-yellow-500/60 shadow-2xl"
        style={{
          background:
            "linear-gradient(160deg, #1a0a00 0%, #0d0d1a 60%, #1a0a00 100%)",
          boxShadow:
            "0 0 40px rgba(251,146,60,0.3), 0 0 80px rgba(251,146,60,0.1)",
        }}
      >
        {/* Header */}
        <div className="flex flex-col items-center pt-8 pb-4 px-6">
          <div className="relative w-20 h-20 mb-4">
            <img
              src="/assets/uploads/20343-019d2d15-6888-76d9-8307-7d83f2025351-1.jpg"
              alt="ODINMARIO"
              className="w-20 h-20 rounded-full border-2 border-yellow-500 object-cover"
            />
            <div
              className="absolute inset-0 rounded-full animate-pulse"
              style={{ boxShadow: "0 0 20px rgba(251,146,60,0.6)" }}
            />
          </div>

          <h1
            className="text-4xl font-black tracking-wider text-yellow-400 mb-1"
            style={{
              textShadow: "0 0 20px rgba(251,146,60,0.8), 2px 2px 0 #000",
            }}
          >
            ODIN MARIO
          </h1>
          <p className="text-orange-300 text-sm font-semibold tracking-widest uppercase mb-2">
            Holders Only Platform
          </p>

          {/* Live Token Stats */}
          {tokenStats && (
            <div className="w-full flex gap-2 mb-3">
              <div className="flex-1 bg-black/30 border border-yellow-500/20 rounded-lg px-2 py-1.5 text-center">
                <div className="text-gray-400 text-[9px] uppercase tracking-wider">
                  Price
                </div>
                <div className="text-yellow-300 text-xs font-bold">
                  {tokenStats.price}
                </div>
              </div>
              <div className="flex-1 bg-black/30 border border-yellow-500/20 rounded-lg px-2 py-1.5 text-center">
                <div className="text-gray-400 text-[9px] uppercase tracking-wider">
                  Holders
                </div>
                <div className="text-yellow-300 text-xs font-bold">
                  {tokenStats.holders}
                </div>
              </div>
              <div className="flex-1 bg-black/30 border border-yellow-500/20 rounded-lg px-2 py-1.5 text-center">
                <div className="text-gray-400 text-[9px] uppercase tracking-wider">
                  MCap
                </div>
                <div className="text-yellow-300 text-xs font-bold">
                  {tokenStats.mcap}
                </div>
              </div>
            </div>
          )}

          {/* Token requirements */}
          <div className="w-full space-y-1.5 mb-2">
            {TOKEN_REQUIREMENTS.map((req) => (
              <div
                key={req.id}
                className="flex items-center justify-between bg-yellow-500/10 border border-yellow-500/20 rounded-lg px-3 py-1.5"
              >
                <div className="flex items-center gap-2">
                  <ShieldCheck className="w-3.5 h-3.5 text-yellow-400" />
                  <span className="text-yellow-300 text-xs font-bold">
                    {req.name}
                  </span>
                </div>
                <span className="text-yellow-200 text-xs">
                  min {req.min.toLocaleString()}
                </span>
              </div>
            ))}
          </div>
          <p className="text-gray-500 text-xs text-center">
            Any one token is sufficient for access
          </p>
        </div>

        <div className="h-px bg-gradient-to-r from-transparent via-yellow-500/40 to-transparent mx-6" />

        {/* Content */}
        <div className="px-6 py-6">
          {/* IDLE */}
          {state === "idle" && !showWalletPicker && (
            <div className="flex flex-col gap-3">
              <p className="text-center text-gray-300 text-sm mb-1">
                Connect your wallet to verify your token balance.
              </p>
              <Button
                data-ocid="wallet.primary_button"
                className="w-full h-12 text-base font-bold rounded-xl"
                style={{
                  background:
                    "linear-gradient(135deg, #f97316 0%, #ea580c 100%)",
                  border: "1px solid rgba(251,146,60,0.5)",
                  boxShadow: "0 4px 15px rgba(249,115,22,0.4)",
                }}
                onClick={() =>
                  availableWallets.length === 1
                    ? handleConnect(availableWallets[0])
                    : setShowWalletPicker(true)
                }
              >
                <Wallet className="w-5 h-5 mr-2" />
                Connect Wallet
              </Button>
              <p className="text-center text-gray-500 text-xs">
                Supports Xverse, OKX, Unisat and Plug
              </p>
            </div>
          )}

          {/* WALLET PICKER */}
          {state === "idle" && showWalletPicker && (
            <div className="flex flex-col gap-3">
              <p className="text-center text-gray-300 text-sm mb-1 font-semibold">
                Select your wallet
              </p>
              {(["xverse", "okx", "unisat", "plug"] as WalletType[]).map(
                (w) => {
                  const available = availableWallets.includes(w);
                  return (
                    <button
                      key={w!}
                      type="button"
                      disabled={!available}
                      onClick={() => available && handleConnect(w)}
                      className="w-full h-12 rounded-xl font-bold text-sm flex items-center justify-between px-4 transition-all"
                      style={{
                        background: available
                          ? "linear-gradient(135deg, rgba(249,115,22,0.15) 0%, rgba(234,88,12,0.15) 100%)"
                          : "rgba(255,255,255,0.03)",
                        border: available
                          ? "1px solid rgba(251,146,60,0.5)"
                          : "1px solid rgba(255,255,255,0.08)",
                        color: available ? "#fde68a" : "rgba(255,255,255,0.25)",
                        cursor: available ? "pointer" : "not-allowed",
                      }}
                    >
                      <span>{WALLET_LABELS[w!]}</span>
                      {available ? (
                        <span className="text-xs text-green-400 font-normal">
                          Detected ✓
                        </span>
                      ) : (
                        <span className="text-xs text-gray-600 font-normal">
                          Not found
                        </span>
                      )}
                    </button>
                  );
                },
              )}
              <button
                type="button"
                className="text-gray-500 text-xs text-center mt-1 hover:text-gray-300"
                onClick={() => setShowWalletPicker(false)}
              >
                Cancel
              </button>
            </div>
          )}

          {/* LOADING */}
          {isLoading && (
            <div className="flex flex-col items-center gap-4 py-4">
              <Loader2 className="w-10 h-10 text-orange-400 animate-spin" />
              <p className="text-orange-300 font-semibold text-sm text-center">
                {state === "connecting"
                  ? `Connecting to ${WALLET_LABELS[selectedWallet!] ?? "wallet"}...`
                  : "Checking token balance..."}
              </p>
              {state === "connecting" && (
                <p className="text-gray-400 text-xs text-center">
                  Please approve the connection in your wallet.
                </p>
              )}
            </div>
          )}

          {/* INSUFFICIENT */}
          {state === "insufficient" && balanceInfo && (
            <div className="flex flex-col gap-4">
              <div className="bg-red-900/20 border border-red-500/40 rounded-xl p-4">
                <p className="text-red-300 font-bold text-center mb-1 text-sm">
                  Access Denied
                </p>
                <p className="text-gray-400 text-xs text-center mb-3">
                  Your wallet does not contain any of the required tokens.
                  Please make sure your wallet holds at least one of the tokens
                  below:
                </p>
                {balanceInfo.allBalances.map((b) => (
                  <div
                    key={b.name}
                    className="flex justify-between text-xs mb-1.5"
                  >
                    <span className="text-gray-400">{b.name}:</span>
                    <span
                      className={
                        b.balance >= b.min
                          ? "text-green-400 font-bold"
                          : "text-red-300 font-bold"
                      }
                    >
                      {b.balance.toLocaleString(undefined, {
                        maximumFractionDigits: 0,
                      })}{" "}
                      / {b.min.toLocaleString()}
                    </span>
                  </div>
                ))}
              </div>
              <div className="flex flex-col gap-2">
                {TOKEN_REQUIREMENTS.map((req) => (
                  <a
                    key={req.id}
                    href={`https://odin.fun/token/${req.id}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center justify-center gap-2 text-xs text-yellow-400 hover:text-yellow-300 border border-yellow-500/30 rounded-lg py-2 px-3 bg-yellow-500/5 hover:bg-yellow-500/10 transition-colors"
                  >
                    <ExternalLink className="w-3 h-3" />
                    Buy {req.name} on odin.fun
                  </a>
                ))}
              </div>
              <Button
                variant="ghost"
                className="text-gray-400 text-sm"
                onClick={() => {
                  setState("idle");
                  setShowWalletPicker(false);
                }}
              >
                Try Different Wallet
              </Button>
            </div>
          )}

          {/* NO WALLET */}
          {state === "no_wallet" && (
            <div className="flex flex-col gap-4">
              <div className="flex items-center gap-3 bg-red-900/30 border border-red-500/40 rounded-xl p-4">
                <AlertCircle className="w-5 h-5 text-red-400 flex-shrink-0" />
                <p className="text-red-300 text-sm">
                  No supported wallet detected.
                </p>
              </div>
              <div className="grid grid-cols-2 gap-2">
                {[
                  { name: "Xverse", url: "https://www.xverse.app" },
                  { name: "OKX", url: "https://www.okx.com/web3" },
                  { name: "Unisat", url: "https://unisat.io" },
                  { name: "Plug", url: "https://plugwallet.ooo" },
                ].map((w) => (
                  <a
                    key={w.name}
                    href={w.url}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <Button
                      variant="outline"
                      className="w-full h-9 text-xs border-orange-500/40 text-orange-300 hover:bg-orange-500/10"
                    >
                      <ExternalLink className="w-3 h-3 mr-1" />
                      {w.name}
                    </Button>
                  </a>
                ))}
              </div>
              <Button
                variant="ghost"
                className="text-gray-400 text-sm"
                onClick={() => setState("idle")}
              >
                Try Again
              </Button>
            </div>
          )}

          {/* ERROR */}
          {state === "error" && (
            <div className="flex flex-col gap-4">
              <div className="flex items-start gap-3 bg-red-900/30 border border-red-500/40 rounded-xl p-4">
                <AlertCircle className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-red-300 font-semibold text-sm">
                    Connection Error
                  </p>
                  <p className="text-gray-400 text-xs mt-1 break-words">
                    {errorMsg}
                  </p>
                </div>
              </div>
              <Button
                data-ocid="wallet.primary_button"
                className="w-full h-12 font-bold rounded-xl"
                style={{
                  background:
                    "linear-gradient(135deg, #f97316 0%, #ea580c 100%)",
                  boxShadow: "0 4px 15px rgba(249,115,22,0.4)",
                }}
                onClick={() => {
                  setState("idle");
                  setShowWalletPicker(false);
                }}
              >
                Try Again
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
