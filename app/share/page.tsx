"use client";

import { useState } from "react";

// Basic Solana address format check (base58, 32-44 chars)
function isValidSolanaAddress(addr: string): boolean {
  return /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(addr);
}

export default function SharePage() {
  const [mint, setMint] = useState("");
  const [wallet, setWallet] = useState("");
  const [link, setLink] = useState("");
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState("");

  function generate() {
    const trimmedMint = mint.trim();
    const trimmedWallet = wallet.trim();

    if (!trimmedMint) return;

    // Validate mint
    if (!isValidSolanaAddress(trimmedMint)) {
      setError("Invalid mint address format");
      return;
    }

    // Validate wallet if provided
    if (trimmedWallet && !isValidSolanaAddress(trimmedWallet)) {
      setError("Invalid wallet address format");
      return;
    }

    setError("");
    const base = `${window.location.origin}/buy/${trimmedMint}`;
    setLink(trimmedWallet ? `${base}?ref=${trimmedWallet}` : base);
    setCopied(false);
  }

  function copy() {
    navigator.clipboard.writeText(link);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  async function connectWallet() {
    try {
      const phantom = (window as any).phantom?.solana;
      if (!phantom) {
        setError("Phantom not found. Paste your wallet address manually.");
        return;
      }
      const resp = await phantom.connect();
      setWallet(resp.publicKey.toBase58());
      setError("");
    } catch (err) {
      console.error("Wallet connect failed:", err);
      setError("Wallet connection cancelled");
    }
  }

  return (
    <div style={S.page}>
      <div style={S.card}>
        <h1 style={S.title}>StarBlink</h1>
        <p style={S.subtitle}>
          Generate an affiliate link for any Pump.fun token.
          <br />
          Share it. Earn 0.2% on every buy.
        </p>

        <label style={S.label}>Token mint address</label>
        <input
          type="text"
          placeholder="Paste from pump.fun..."
          value={mint}
          onChange={(e) => { setMint(e.target.value); setError(""); }}
          style={S.input}
        />

        <label style={S.label}>Your wallet (receives 0.2%)</label>
        <div style={{ display: "flex", gap: 8 }}>
          <input
            type="text"
            placeholder="Your Solana wallet..."
            value={wallet}
            onChange={(e) => { setWallet(e.target.value); setError(""); }}
            style={{ ...S.input, flex: 1 }}
          />
          <button onClick={connectWallet} style={S.phantomBtn}>
            Phantom
          </button>
        </div>

        {error && (
          <p style={{ color: "#ff4466", fontSize: 12, margin: "-6px 0 10px" }}>
            {error}
          </p>
        )}

        <button
          onClick={generate}
          disabled={!mint.trim()}
          style={{ ...S.genBtn, opacity: mint.trim() ? 1 : 0.4 }}
        >
          Generate Link
        </button>

        {link && (
          <div style={S.result}>
            <div style={S.linkBox}>
              <code style={{ fontSize: 12, wordBreak: "break-all" as const, color: "#c8c8d8" }}>
                {link}
              </code>
            </div>
            <button onClick={copy} style={S.copyBtn}>
              {copied ? "Copied ✓" : "Copy Link"}
            </button>
            <p style={{ color: "#44445a", fontSize: 11, marginTop: 10 }}>
              Share on X, Telegram, Discord. You earn 0.2% on every purchase.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

const S: Record<string, React.CSSProperties> = {
  page: { minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 },
  card: { maxWidth: 440, width: "100%", padding: 24 },
  title: { fontSize: 22, fontWeight: 700, color: "#fff", margin: "0 0 6px" },
  subtitle: { color: "#6b6b80", fontSize: 13, margin: "0 0 28px", lineHeight: 1.5 },
  label: { display: "block", fontSize: 12, color: "#6b6b80", marginBottom: 6 },
  input: {
    width: "100%", padding: "11px 13px", fontSize: 13,
    backgroundColor: "#13131d", border: "1px solid #1e1e2e",
    borderRadius: 8, color: "#e0e0e8", outline: "none",
    marginBottom: 14, boxSizing: "border-box" as const,
  },
  phantomBtn: {
    padding: "11px 16px", fontSize: 12, fontWeight: 600,
    color: "#00dc82", backgroundColor: "transparent",
    border: "1px solid #1e1e2e", borderRadius: 8,
    cursor: "pointer", whiteSpace: "nowrap" as const, marginBottom: 14,
  },
  genBtn: {
    width: "100%", padding: "13px 0", fontSize: 15, fontWeight: 700,
    color: "#0d0d12", backgroundColor: "#00dc82",
    border: "none", borderRadius: 10, cursor: "pointer", marginTop: 4,
  },
  result: {
    marginTop: 20, padding: 14, backgroundColor: "#13131d",
    borderRadius: 10, border: "1px solid #1e1e2e",
  },
  linkBox: {
    padding: 10, backgroundColor: "#0d0d12",
    borderRadius: 6, marginBottom: 10,
  },
  copyBtn: {
    width: "100%", padding: "10px 0", fontSize: 13, fontWeight: 600,
    color: "#e0e0e8", backgroundColor: "#1e1e2e",
    border: "none", borderRadius: 8, cursor: "pointer",
  },
};
