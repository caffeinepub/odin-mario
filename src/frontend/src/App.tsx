import { useEffect, useState } from "react";
import BabyOdin from "./BabyOdin";
import Bear from "./Bear";
import Chess from "./Chess";
import ChessPvP from "./ChessPvP";
import Contra from "./Contra";
import Game from "./Game";
import Odin0401 from "./Odin0401";
import OdinSpace from "./OdinSpace";
import OdinWarrior from "./OdinWarrior";
import PacMan from "./PacMan";
import PenaltyShootoutPvP from "./PenaltyShootoutPvP";
import PvPFighting from "./PvPFighting";
import Snake from "./Snake";
import SoundCloudPlayer from "./SoundCloudPlayer";
import {
  fetchOdinUsername,
  getPrincipalFromBtcWallet,
  setXverseAddresses,
} from "./siwb";

type Screen =
  | "mario"
  | "pacman"
  | "contra"
  | "snake"
  | "chess"
  | "bear"
  | "odinwarrior"
  | "babyodin"
  | "odinspace"
  | "pvpfighting"
  | "chesspvp"
  | "penalty"
  | "odin0401";

type WalletType = "unisat" | "xverse" | "okx" | "plug" | null;

const WALLET_LABELS: Record<string, string> = {
  unisat: "Unisat",
  xverse: "Xverse",
  okx: "OKX Wallet",
  plug: "Plug",
};

function detectWallets(): WalletType[] {
  if (typeof window === "undefined") return [];
  const found: WalletType[] = [];
  if ((window as any).unisat) found.push("unisat");
  if ((window as any).XverseProviders?.BitcoinProvider) found.push("xverse");
  if ((window as any).okxwallet?.bitcoin) found.push("okx");
  if ((window as any).ic?.plug) found.push("plug");
  return found;
}

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
    setXverseAddresses(addresses);
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

function truncateAddress(addr: string): string {
  if (addr.length <= 12) return addr;
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
}

function getStoredWallet(): { address: string; walletType: string } | null {
  try {
    const stored = localStorage.getItem("odinmario_wallet");
    if (!stored) return null;
    return JSON.parse(stored);
  } catch {
    return null;
  }
}

export default function App() {
  const [screen, setScreen] = useState<Screen>("mario");
  const [walletInfo, setWalletInfo] = useState<{
    address: string;
    walletType: string;
  } | null>(getStoredWallet);
  const [showWalletPicker, setShowWalletPicker] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [connectStatus, setConnectStatus] = useState("");
  const [availableWallets, setAvailableWallets] = useState<WalletType[]>([]);
  const [connectError, setConnectError] = useState("");

  useEffect(() => {
    const timer = setTimeout(() => setAvailableWallets(detectWallets()), 600);
    return () => clearTimeout(timer);
  }, []);

  async function handleConnect(wallet: WalletType) {
    if (!wallet) return;
    setConnecting(true);
    setConnectError("");
    try {
      const address = await getWalletAddress(wallet);
      const info = { address, walletType: wallet };
      localStorage.setItem("odinmario_wallet", JSON.stringify(info));
      // Resolve odin.fun username from wallet address
      try {
        let odinUsername = "";
        const isPrincipal = /^[a-z0-9]{5}-[a-z0-9]/.test(address);
        if (isPrincipal) {
          // Plug wallet: address IS the principal
          const username = await fetchOdinUsername(address);
          odinUsername = username || address;
        } else {
          // BTC wallet: SIWB flow -> derive canonical odin.fun principal
          try {
            const principalId = await getPrincipalFromBtcWallet(
              address,
              wallet || "",
              setConnectStatus,
            );
            if (principalId) {
              setConnectStatus("Fetching odin.fun username...");
              const username = await fetchOdinUsername(principalId);
              odinUsername = username || principalId;
            }
          } catch {
            // ignore, fall through to truncateAddress
          }
        }
        if (odinUsername) {
          localStorage.setItem("odinmario_username", odinUsername);
        } else {
          localStorage.setItem("odinmario_username", truncateAddress(address));
        }
      } catch {
        localStorage.setItem("odinmario_username", truncateAddress(address));
      }
      setWalletInfo(info);
      setShowWalletPicker(false);
    } catch (err: any) {
      setConnectError(err?.message || "Connection failed");
    } finally {
      setConnecting(false);
      setConnectStatus("");
    }
  }

  function handleDisconnect() {
    localStorage.removeItem("odinmario_wallet");
    localStorage.removeItem("odinmario_auth");
    setWalletInfo(null);
    setShowWalletPicker(false);
  }

  // Wallet button in top-right corner
  const walletBtn = (
    <div
      style={{
        position: "fixed",
        top: 10,
        right: 10,
        zIndex: 9998,
        display: "flex",
        flexDirection: "column",
        alignItems: "flex-end",
        gap: 6,
      }}
    >
      {walletInfo ? (
        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
          <div
            style={{
              background: "rgba(0,0,0,0.7)",
              border: "1px solid rgba(251,146,60,0.5)",
              borderRadius: 8,
              color: "#fbbf24",
              fontSize: 11,
              padding: "4px 10px",
              fontFamily: "monospace",
            }}
          >
            🔗 {truncateAddress(walletInfo.address)}
          </div>
          <button
            type="button"
            data-ocid="app.secondary_button"
            onClick={handleDisconnect}
            style={{
              background: "rgba(0,0,0,0.6)",
              border: "1px solid rgba(255,100,0,0.4)",
              borderRadius: 8,
              color: "rgba(255,150,50,0.8)",
              fontSize: 11,
              padding: "4px 10px",
              cursor: "pointer",
              fontFamily: "monospace",
            }}
          >
            Disconnect
          </button>
        </div>
      ) : (
        <button
          type="button"
          data-ocid="app.primary_button"
          onClick={() => {
            setConnectError("");
            setShowWalletPicker((v) => !v);
          }}
          style={{
            background:
              "linear-gradient(180deg, #1a6fd4 0%, #2485e8 60%, #1e5fa8 100%)",
            border: "3px solid #fff",
            boxShadow: "0 0 0 2px #1a3a8a, 0 4px 12px rgba(0,0,0,0.5)",
            borderRadius: 8,
            color: "#fff",
            fontSize: 11,
            padding: "5px 12px",
            cursor: "pointer",
            fontFamily: "'Press Start 2P', 'Courier New', monospace",
            fontWeight: 700,
            textShadow: "1px 1px 0 #1a3a8a",
          }}
        >
          🔗 Connect Wallet
        </button>
      )}

      {showWalletPicker && !walletInfo && (
        <div
          style={{
            background:
              "linear-gradient(180deg, #1a6fd4 0%, #2485e8 60%, #1e5fa8 100%)",
            border: "4px solid #fff",
            borderRadius: 8,
            padding: "14px 14px 10px",
            width: 230,
            boxShadow: "0 0 0 3px #1a3a8a, 0 8px 32px rgba(0,0,0,0.7)",
            position: "relative",
            overflow: "hidden",
          }}
        >
          {/* pixel cloud decorations */}
          <div
            style={{
              position: "absolute",
              top: 6,
              left: 8,
              width: 28,
              height: 14,
              background: "#fff",
              borderRadius: 7,
              opacity: 0.5,
            }}
          />
          <div
            style={{
              position: "absolute",
              top: 3,
              left: 14,
              width: 22,
              height: 14,
              background: "#fff",
              borderRadius: 7,
              opacity: 0.5,
            }}
          />
          <div
            style={{
              position: "absolute",
              top: 6,
              right: 8,
              width: 24,
              height: 12,
              background: "#fff",
              borderRadius: 6,
              opacity: 0.4,
            }}
          />
          <div
            style={{
              position: "absolute",
              top: 3,
              right: 12,
              width: 18,
              height: 12,
              background: "#fff",
              borderRadius: 6,
              opacity: 0.4,
            }}
          />

          {/* title */}
          <div
            style={{
              color: "#fff",
              fontSize: 15,
              fontFamily: "'Press Start 2P', 'Courier New', monospace",
              marginBottom: 12,
              marginTop: 10,
              textAlign: "center",
              fontWeight: 900,
              textShadow: "2px 2px 0 #c43a00, 3px 3px 0 #7a1d00",
              letterSpacing: 1,
            }}
          >
            SELECT WALLET
          </div>

          {connecting ? (
            <div
              style={{
                color: "#ffe066",
                fontSize: 11,
                fontFamily: "'Press Start 2P', monospace",
                textAlign: "center",
                padding: "10px 0",
                textShadow: "1px 1px 0 #a06000",
              }}
            >
              {connectStatus || "Connecting..."}
            </div>
          ) : (
            (["xverse", "okx", "unisat", "plug"] as WalletType[]).map((w) => {
              const available = availableWallets.includes(w!);
              const walletLogoUrl: Record<string, string> = {
                xverse:
                  "/assets/uploads/20260328_051447-019d315e-d1dd-7135-a0b6-c71246cc44b7-1.jpg",
                okx: "/assets/uploads/20260328_051727-019d3160-5113-737f-ac2a-93ce28f5ee48-2.jpg",
                unisat:
                  "/assets/uploads/20260328_051739-019d3160-5121-748a-8aae-589b37bb70a1-3.jpg",
                plug: "https://plugwallet.ooo/favicon.ico",
              };
              return (
                <button
                  key={w!}
                  type="button"
                  disabled={!available}
                  onClick={() => available && handleConnect(w)}
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    width: "100%",
                    background: available
                      ? "linear-gradient(180deg, #f97316 0%, #ea580c 100%)"
                      : "rgba(0,0,0,0.25)",
                    border: available
                      ? "3px solid #fff"
                      : "2px solid rgba(255,255,255,0.2)",
                    borderRadius: 6,
                    color: available ? "#fff" : "rgba(255,255,255,0.3)",
                    fontSize: 10,
                    fontFamily: "'Press Start 2P', 'Courier New', monospace",
                    padding: "7px 10px",
                    cursor: available ? "pointer" : "not-allowed",
                    marginBottom: 6,
                    fontWeight: 700,
                    boxShadow: available
                      ? "0 3px 0 #7a2800, inset 0 1px 0 rgba(255,255,255,0.3)"
                      : "none",
                    textShadow: available
                      ? "1px 1px 0 rgba(0,0,0,0.4)"
                      : "none",
                    transition: "transform 0.1s",
                  }}
                >
                  <span
                    style={{ display: "flex", alignItems: "center", gap: 7 }}
                  >
                    <img
                      src={walletLogoUrl[w!]}
                      alt={WALLET_LABELS[w!]}
                      style={{
                        width: 20,
                        height: 20,
                        borderRadius: 4,
                        objectFit: "contain",
                        background: "#fff",
                        padding: 1,
                      }}
                      onError={(e) => {
                        (e.target as HTMLImageElement).style.display = "none";
                      }}
                    />
                    {WALLET_LABELS[w!]}
                  </span>
                  {available ? (
                    <span
                      style={{
                        color: "#a3f0a3",
                        fontSize: 10,
                        fontWeight: 900,
                      }}
                    >
                      ✓
                    </span>
                  ) : (
                    <span
                      style={{ color: "rgba(255,255,255,0.2)", fontSize: 10 }}
                    >
                      —
                    </span>
                  )}
                </button>
              );
            })
          )}
          {connectError && (
            <div
              style={{
                color: "#ff6b6b",
                fontSize: 9,
                fontFamily: "'Press Start 2P', monospace",
                textAlign: "center",
                marginTop: 4,
                textShadow: "1px 1px 0 #000",
              }}
            >
              {connectError}
            </div>
          )}
          <button
            type="button"
            onClick={() => setShowWalletPicker(false)}
            style={{
              color: "#ffe066",
              fontSize: 9,
              fontFamily: "'Press Start 2P', 'Courier New', monospace",
              background: "rgba(0,0,0,0.4)",
              border: "2px solid rgba(255,255,255,0.3)",
              borderRadius: 5,
              cursor: "pointer",
              width: "100%",
              textAlign: "center",
              marginTop: 4,
              padding: "5px 0",
              fontWeight: 700,
            }}
          >
            ✕ CANCEL
          </button>
        </div>
      )}
    </div>
  );

  // Determine screen content — SoundCloudPlayer stays mounted above all screens
  let screenContent: React.ReactNode;
  if (screen === "pacman") {
    screenContent = <PacMan onBack={() => setScreen("mario")} />;
  } else if (screen === "contra") {
    screenContent = <Contra onBack={() => setScreen("mario")} />;
  } else if (screen === "snake") {
    screenContent = <Snake onBack={() => setScreen("mario")} />;
  } else if (screen === "chess") {
    screenContent = <Chess onBack={() => setScreen("mario")} />;
  } else if (screen === "bear") {
    screenContent = <Bear onBack={() => setScreen("mario")} />;
  } else if (screen === "odinwarrior") {
    screenContent = <OdinWarrior onBack={() => setScreen("mario")} />;
  } else if (screen === "babyodin") {
    screenContent = <BabyOdin onBack={() => setScreen("mario")} />;
  } else if (screen === "pvpfighting") {
    screenContent = <PvPFighting onBack={() => setScreen("mario")} />;
  } else if (screen === "odinspace") {
    screenContent = <OdinSpace onBack={() => setScreen("mario")} />;
  } else if (screen === "chesspvp") {
    screenContent = (
      <ChessPvP
        onBack={() => setScreen("mario")}
        playerAddress={walletInfo?.address}
      />
    );
  } else if (screen === "penalty") {
    screenContent = (
      <PenaltyShootoutPvP
        onBack={() => setScreen("mario")}
        playerAddress={walletInfo?.address}
      />
    );
  } else if (screen === "odin0401") {
    screenContent = <Odin0401 onBack={() => setScreen("mario")} />;
  } else {
    screenContent = (
      <Game
        onLaunchPacMan={() => setScreen("pacman")}
        onLaunchContra={() => setScreen("contra")}
        onLaunchSnake={() => setScreen("snake")}
        onLaunchChess={() => setScreen("chess")}
        onLaunchBear={() => setScreen("bear")}
        onLaunchOdinWarrior={() => setScreen("odinwarrior")}
        onLaunchBabyOdin={() => setScreen("babyodin")}
        onLaunchOdinSpace={() => setScreen("odinspace")}
        onLaunchPvPFighting={() => setScreen("pvpfighting")}
        onLaunchChessPvP={() => setScreen("chesspvp")}
        onLaunchPenalty={() => setScreen("penalty")}
        onLaunchOdin0401={() => setScreen("odin0401")}
        onLogout={walletInfo ? handleDisconnect : undefined}
        walletAddress={walletInfo?.address}
      />
    );
  }

  return (
    <>
      {walletBtn}
      {/* Single SoundCloudPlayer instance — never unmounts on screen change */}
      <SoundCloudPlayer />
      {screenContent}
    </>
  );
}
