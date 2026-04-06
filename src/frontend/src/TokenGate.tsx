import { useState } from "react";

interface TokenGateProps {
  onVerified: (principal: string) => void;
}

export default function TokenGate({ onVerified }: TokenGateProps) {
  const [address, setAddress] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<"balance" | "network" | null>(null);

  async function handleVerify() {
    const trimmed = address.trim();
    if (!trimmed) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `https://api.odin.fun/v1/user/${encodeURIComponent(trimmed)}/tokens?id_in=2ip5&limit=1`,
      );
      if (!res.ok) throw new Error("network");
      const json = await res.json();
      const item = Array.isArray(json.data)
        ? json.data.find((d: any) => d.token?.id === "2ip5" || d.id === "2ip5")
        : null;
      const balance = item?.balance ?? item?.amount ?? 0;
      if (balance >= 20000) {
        localStorage.setItem(
          "odinmario_access",
          JSON.stringify({ principal: trimmed, verified: true }),
        );
        onVerified(trimmed);
      } else {
        setError("balance");
      }
    } catch {
      setError("network");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div data-ocid="tokengate.panel" style={containerStyle}>
      {/* Pixel grid overlay */}
      <div style={pixelGridStyle} />

      <div style={cardStyle}>
        {/* Logo */}
        <div style={{ marginBottom: 16 }}>
          <img
            src="/assets/uploads/1993-3.jpeg"
            alt="Odin Mario Logo"
            style={logoStyle}
          />
        </div>

        {/* Title */}
        <h1 style={titleStyle}>ODIN MARIO</h1>
        <p style={subtitleStyle}>You need 20,000 ODINMARIO to play</p>

        {/* Divider */}
        <div style={dividerStyle} />

        {/* Input */}
        <label style={labelStyle} htmlFor="odinfun-address">
          Odinfun Address
        </label>
        <input
          data-ocid="tokengate.input"
          id="odinfun-address"
          type="text"
          value={address}
          onChange={(e) => setAddress(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleVerify()}
          placeholder="Enter your Odinfun Address"
          style={inputStyle}
          disabled={loading}
        />

        {/* Verify button */}
        <button
          type="button"
          data-ocid="tokengate.submit_button"
          onClick={handleVerify}
          disabled={loading || !address.trim()}
          style={{
            ...verifyBtnStyle,
            opacity: loading || !address.trim() ? 0.6 : 1,
            cursor: loading || !address.trim() ? "not-allowed" : "pointer",
          }}
        >
          {loading ? (
            <span
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                justifyContent: "center",
              }}
            >
              <span style={spinnerStyle} />
              VERIFYING...
            </span>
          ) : (
            "⚡ VERIFY"
          )}
        </button>

        {/* Errors */}
        {error === "balance" && (
          <div data-ocid="tokengate.error_state" style={errorBoxStyle}>
            <p style={{ margin: "0 0 8px", fontWeight: 700 }}>
              ❌ You need at least 20,000 ODINMARIO to access.
            </p>
            <a
              href="https://odin.fun/token/2ip5"
              target="_blank"
              rel="noopener noreferrer"
              style={getLinkStyle}
            >
              🛒 Get ODINMARIO on odin.fun →
            </a>
          </div>
        )}
        {error === "network" && (
          <div
            data-ocid="tokengate.error_state"
            style={{ ...errorBoxStyle, borderColor: "#f59e0b" }}
          >
            <p style={{ margin: 0, color: "#fbbf24" }}>
              ⚠️ Could not verify address. Please try again.
            </p>
          </div>
        )}

        <p style={hintStyle}>
          Your Odinfun Address is your principal ID from{" "}
          <a
            href="https://odin.fun"
            target="_blank"
            rel="noopener noreferrer"
            style={{ color: "#FFD700" }}
          >
            odin.fun
          </a>
        </p>
      </div>
    </div>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────

const containerStyle: React.CSSProperties = {
  minHeight: "100dvh",
  background: "linear-gradient(160deg, #0a0a1a 0%, #120820 50%, #0d1520 100%)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  position: "relative",
  overflow: "hidden",
  padding: "20px",
  fontFamily: "'Bricolage Grotesque', 'Press Start 2P', monospace",
};

const pixelGridStyle: React.CSSProperties = {
  position: "absolute",
  inset: 0,
  backgroundImage:
    "linear-gradient(rgba(255,215,0,0.03) 1px, transparent 1px), linear-gradient(90deg, rgba(255,215,0,0.03) 1px, transparent 1px)",
  backgroundSize: "32px 32px",
  pointerEvents: "none",
};

const cardStyle: React.CSSProperties = {
  background:
    "linear-gradient(145deg, rgba(20,10,50,0.97) 0%, rgba(10,30,60,0.97) 100%)",
  border: "3px solid #FFD700",
  borderRadius: 20,
  padding: "clamp(24px, 5vw, 48px) clamp(20px, 5vw, 48px)",
  textAlign: "center",
  boxShadow:
    "0 0 80px rgba(255,215,0,0.2), 0 0 20px rgba(255,100,0,0.1), 0 24px 60px rgba(0,0,0,0.8)",
  width: "min(460px, 96vw)",
  position: "relative",
  zIndex: 1,
};

const logoStyle: React.CSSProperties = {
  width: 100,
  height: 100,
  borderRadius: "50%",
  border: "3px solid #FFD700",
  objectFit: "cover",
  boxShadow: "0 0 30px rgba(255,215,0,0.4)",
};

const titleStyle: React.CSSProperties = {
  margin: "0 0 6px",
  fontSize: "clamp(1.6rem, 5vw, 2.4rem)",
  fontWeight: 900,
  color: "#FFD700",
  letterSpacing: 6,
  textShadow: "0 0 20px rgba(255,215,0,0.5), 2px 2px 0 #8B6000",
  fontFamily: "'Bricolage Grotesque', monospace",
};

const subtitleStyle: React.CSSProperties = {
  margin: "0 0 4px",
  fontSize: "clamp(0.75rem, 2vw, 0.9rem)",
  color: "rgba(255,255,255,0.75)",
  letterSpacing: 1,
};

const dividerStyle: React.CSSProperties = {
  height: 1,
  background: "linear-gradient(90deg, transparent, #FFD700, transparent)",
  margin: "16px 0",
  opacity: 0.5,
};

const labelStyle: React.CSSProperties = {
  display: "block",
  textAlign: "left",
  fontSize: "0.75rem",
  fontWeight: 700,
  color: "#FFD700",
  letterSpacing: 2,
  marginBottom: 8,
  textTransform: "uppercase" as const,
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "12px 16px",
  background: "rgba(255,255,255,0.06)",
  border: "2px solid rgba(255,215,0,0.4)",
  borderRadius: 10,
  color: "#fff",
  fontSize: "0.9rem",
  fontFamily: "monospace",
  outline: "none",
  boxSizing: "border-box" as const,
  marginBottom: 14,
  transition: "border-color 0.2s",
};

const verifyBtnStyle: React.CSSProperties = {
  width: "100%",
  padding: "14px",
  background: "linear-gradient(180deg, #FF8C00 0%, #D62B1E 100%)",
  border: "3px solid #FFD700",
  borderRadius: 12,
  color: "#fff",
  fontSize: "1rem",
  fontWeight: 900,
  letterSpacing: 3,
  boxShadow: "0 6px 0 #7a0e00, 0 8px 24px rgba(0,0,0,0.5)",
  transition: "transform 0.1s",
  marginBottom: 16,
  fontFamily: "'Bricolage Grotesque', monospace",
};

const spinnerStyle: React.CSSProperties = {
  display: "inline-block",
  width: 16,
  height: 16,
  border: "2px solid rgba(255,255,255,0.3)",
  borderTopColor: "#fff",
  borderRadius: "50%",
  animation: "spin 0.7s linear infinite",
};

const errorBoxStyle: React.CSSProperties = {
  background: "rgba(220,30,30,0.15)",
  border: "1.5px solid rgba(220,80,80,0.5)",
  borderRadius: 10,
  padding: "12px 16px",
  marginBottom: 14,
  color: "#ff8888",
  fontSize: "0.85rem",
};

const getLinkStyle: React.CSSProperties = {
  display: "inline-block",
  marginTop: 4,
  color: "#FFD700",
  fontWeight: 700,
  fontSize: "0.85rem",
  textDecoration: "none",
  border: "1.5px solid #FFD700",
  borderRadius: 8,
  padding: "6px 14px",
  background: "rgba(255,215,0,0.08)",
};

const hintStyle: React.CSSProperties = {
  margin: 0,
  fontSize: "0.72rem",
  color: "rgba(255,255,255,0.4)",
  lineHeight: 1.5,
};
