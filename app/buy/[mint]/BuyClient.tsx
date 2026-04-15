"use client";

import { useState, useCallback, useEffect } from "react";
import { useWallet, useConnection } from "@solana/wallet-adapter-react";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";
import { VersionedTransaction } from "@solana/web3.js";
import AppWalletProvider from "@/components/WalletProvider";

interface TokenData {
  mint: string;
  symbol: string;
  name: string;
  image: string;
  isGraduated: boolean;
  bondingCurveProgress: number;
  priceSOL: number;
  marketCapSol: number;
}

interface Props {
  mint: string;
  referrer?: string;
  token: TokenData | null;
}

const AMOUNTS = [0.1, 0.5, 1];
const PUMP_PROGRAM = "6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P";
const GITHUB_URL =
  process.env.NEXT_PUBLIC_GITHUB_URL ||
  "https://github.com/pumpblinks/pumpblinks";

// ===== MAIN COMPONENT (wrapped in wallet provider) =====
export default function BuyClient(props: Props) {
  return (
    <AppWalletProvider>
      <BuyWidget {...props} />
    </AppWalletProvider>
  );
}

// ===== BUY WIDGET =====
type Status = "idle" | "simulating" | "signing" | "success" | "error";

interface SimData {
  tokenSymbol: string;
  solIn: number;
  platformFee: number;
  referrerFee: number;
  swapAmount: number;
  txBase64: string;
  lastValidBlockHeight: number;
}

function BuyWidget({ mint, referrer, token }: Props) {
  const { publicKey, signTransaction, connected } = useWallet();
  const { connection } = useConnection();

  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState("");
  const [selectedAmount, setSelectedAmount] = useState<number | null>(null);
  const [simData, setSimData] = useState<SimData | null>(null);
  const [txSignature, setTxSignature] = useState("");

  // Reset simulation if wallet changes or disconnects
  const walletKey = publicKey?.toBase58() || null;
  useEffect(() => {
    setSimData(null);
    setStatus("idle");
    setError("");
    setTxSignature("");
    setSelectedAmount(null);
  }, [walletKey]);

  // Step 1: User picks an amount → fetch TX + show simulation
  const handleSelectAmount = useCallback(
    async (amount: number) => {
      if (!connected || !publicKey) return;

      setSelectedAmount(amount);
      setStatus("simulating");
      setError("");
      setSimData(null);

      try {
        const url = `/api/buy/${mint}?amount=${amount}${referrer ? `&ref=${referrer}` : ""}`;
        const res = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ account: publicKey.toBase58() }),
        });

        if (!res.ok) {
          const data = await res.json();
          throw new Error(data.error || "Failed to build transaction");
        }

        const data = await res.json();
        setSimData({
          ...data.simulation,
          txBase64: data.transaction,
          lastValidBlockHeight: data.lastValidBlockHeight,
        });
        setStatus("idle");
      } catch (err: any) {
        setError(err.message || "Something went wrong");
        setStatus("error");
      }
    },
    [connected, publicKey, mint, referrer]
  );

  // Step 2: User reviews simulation → confirms → sign & send
  const handleConfirm = useCallback(async () => {
    if (!simData || !publicKey || !signTransaction) return;

    setStatus("signing");
    setError("");

    try {
      // Deserialize
      const txBytes = Uint8Array.from(atob(simData.txBase64), (c) =>
        c.charCodeAt(0)
      );
      const tx = VersionedTransaction.deserialize(txBytes);

      // Sign
      const signed = await signTransaction(tx);

      // Send
      const signature = await connection.sendRawTransaction(
        signed.serialize(),
        { skipPreflight: false, maxRetries: 3 }
      );

      // Confirm with modern API (proper blockhash expiry detection)
      await connection.confirmTransaction(
        {
          signature,
          blockhash: tx.message.recentBlockhash,
          lastValidBlockHeight: simData.lastValidBlockHeight,
        },
        "confirmed"
      );

      setTxSignature(signature);
      setStatus("success");
    } catch (err: any) {
      const msg = err.message || "Transaction failed";
      // Detect blockhash expiry for better UX
      if (msg.includes("block height exceeded") || msg.includes("Blockhash not found")) {
        setError("Transaction expired. Click 'Try again' to get a fresh quote.");
      } else {
        setError(msg);
      }
      setStatus("error");
    }
  }, [simData, publicKey, signTransaction, connection]);

  // Reset
  const handleReset = () => {
    setSelectedAmount(null);
    setSimData(null);
    setStatus("idle");
    setError("");
    setTxSignature("");
  };

  // ===== TOKEN NOT FOUND =====
  if (!token) {
    return (
      <div style={S.page}>
        <div style={S.card}>
          <p style={{ color: "#ff4466", fontSize: 16 }}>Token not found on Pump.fun</p>
          <p style={{ color: "#555", fontSize: 13 }}>Check the mint address</p>
        </div>
      </div>
    );
  }

  const refShort = referrer
    ? `${referrer.slice(0, 4)}...${referrer.slice(-4)}`
    : null;

  // Dynamic routing label
  const routingLabel = token.isGraduated
    ? "Routed via Jupiter (PumpSwap / DEX)"
    : "Routed via Pump.fun bonding curve";

  return (
    <div style={S.page}>
      <div style={S.card}>
        {/* ===== TOKEN HEADER ===== */}
        <div style={S.tokenRow}>
          {token.image && (
            <img
              src={token.image}
              alt=""
              style={S.tokenImg}
              onError={(e) => {
                (e.target as HTMLImageElement).style.display = "none";
              }}
            />
          )}
          <div>
            <div style={S.symbol}>${token.symbol}</div>
            <div style={S.name}>{token.name}</div>
            <div style={S.badge}>
              {token.isGraduated
                ? "Graduated ✓"
                : `${token.bondingCurveProgress.toFixed(0)}% bonding curve`}
            </div>
          </div>
        </div>

        {/* ===== SUCCESS STATE ===== */}
        {status === "success" && txSignature && (
          <div style={S.successBox}>
            <div style={{ fontSize: 18, fontWeight: 600, color: "#00dc82" }}>
              ✓ Transaction confirmed
            </div>
            <a
              href={`https://solscan.io/tx/${txSignature}`}
              target="_blank"
              rel="noopener"
              style={S.txLink}
            >
              View on Solscan →
            </a>
            <button onClick={handleReset} style={S.resetBtn}>
              Buy more
            </button>
          </div>
        )}

        {/* ===== WALLET NOT CONNECTED ===== */}
        {status !== "success" && !connected && (
          <>
            <p style={{ color: "#8b8b9e", fontSize: 13, margin: "0 0 16px" }}>
              Connect your wallet to buy
            </p>
            <div style={S.walletBtnWrap}>
              <WalletMultiButton />
            </div>
          </>
        )}

        {/* ===== AMOUNT SELECTION ===== */}
        {status !== "success" && connected && !simData && (
          <>
            <div style={S.amountRow}>
              {AMOUNTS.map((a) => (
                <button
                  key={a}
                  onClick={() => handleSelectAmount(a)}
                  disabled={status === "simulating"}
                  style={{
                    ...S.amountBtn,
                    opacity: status === "simulating" ? 0.5 : 1,
                  }}
                >
                  {status === "simulating" && selectedAmount === a
                    ? "..."
                    : `${a} SOL`}
                </button>
              ))}
            </div>
          </>
        )}

        {/* ===== SIMULATION PREVIEW ===== */}
        {status !== "success" && connected && simData && (
          <div style={S.simBox}>
            <div style={S.simTitle}>Transaction preview</div>

            <div style={S.simRow}>
              <span style={S.simLabel}>You send</span>
              <span style={S.simValue}>{simData.solIn} SOL</span>
            </div>
            <div style={S.simRow}>
              <span style={S.simLabel}>Swap amount</span>
              <span style={S.simValue}>
                {simData.swapAmount.toFixed(6)} SOL → ${simData.tokenSymbol}
              </span>
            </div>
            <div style={S.simRow}>
              <span style={S.simLabel}>
                Platform fee ({simData.referrerFee > 0 ? "0.3%" : "0.5%"})
              </span>
              <span style={S.simValue}>
                {simData.platformFee.toFixed(6)} SOL
              </span>
            </div>
            {simData.referrerFee > 0 && (
              <div style={S.simRow}>
                <span style={S.simLabel}>Referrer fee (0.2%)</span>
                <span style={S.simValue}>
                  {simData.referrerFee.toFixed(6)} SOL
                </span>
              </div>
            )}
            <div
              style={{ ...S.simRow, borderTop: "1px solid #2a2a3a", paddingTop: 8, marginTop: 4 }}
            >
              <span style={{ ...S.simLabel, color: "#8b8b9e" }}>
                {routingLabel}
              </span>
            </div>

            <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
              <button onClick={handleReset} style={S.cancelBtn}>
                Cancel
              </button>
              <button
                onClick={handleConfirm}
                disabled={status === "signing"}
                style={{
                  ...S.confirmBtn,
                  opacity: status === "signing" ? 0.6 : 1,
                }}
              >
                {status === "signing" ? "Signing..." : "Confirm & Sign"}
              </button>
            </div>
          </div>
        )}

        {/* ===== ERROR ===== */}
        {error && (
          <div style={S.errorBox}>
            <span>{error}</span>
            <button onClick={handleReset} style={S.errorRetry}>
              Try again
            </button>
          </div>
        )}

        {/* ===== TRUST BLOCK ===== */}
        {status !== "success" && (
          <div style={S.trustBlock}>
            <div style={S.trustTitle}>Verify everything</div>
            <div style={S.trustRow}>
              <span style={S.trustLabel}>Program</span>
              <a
                href={`https://solscan.io/account/${PUMP_PROGRAM}`}
                target="_blank"
                rel="noopener"
                style={S.trustLink}
              >
                Pump.fun ✓
              </a>
            </div>
            <div style={S.trustRow}>
              <span style={S.trustLabel}>Token</span>
              <a
                href={`https://pump.fun/${mint}`}
                target="_blank"
                rel="noopener"
                style={S.trustLink}
              >
                View on pump.fun →
              </a>
            </div>
            <div style={S.trustRow}>
              <span style={S.trustLabel}>Contract</span>
              <a
                href={`https://solscan.io/token/${mint}`}
                target="_blank"
                rel="noopener"
                style={S.trustLink}
              >
                {mint.slice(0, 4)}...{mint.slice(-4)}
              </a>
            </div>
            {refShort && (
              <div style={S.trustRow}>
                <span style={S.trustLabel}>Referrer</span>
                <a
                  href={`https://solscan.io/account/${referrer}`}
                  target="_blank"
                  rel="noopener"
                  style={S.trustLink}
                >
                  {refShort}
                </a>
              </div>
            )}
            <div style={S.trustRow}>
              <span style={S.trustLabel}>Fees</span>
              <span style={S.trustValue}>
                {referrer ? "0.5% total (0.3% platform + 0.2% referrer)" : "0.5% total (platform)"}
              </span>
            </div>
            <div style={S.trustRow}>
              <span style={S.trustLabel}>Source</span>
              <a
                href={GITHUB_URL}
                target="_blank"
                rel="noopener"
                style={S.trustLink}
              >
                Open source ↗
              </a>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ===== STYLES =====
const S: Record<string, React.CSSProperties> = {
  page: {
    minHeight: "100vh",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: 16,
  },
  card: {
    maxWidth: 400,
    width: "100%",
    padding: 24,
  },
  // Token header
  tokenRow: {
    display: "flex",
    alignItems: "center",
    gap: 14,
    marginBottom: 24,
  },
  tokenImg: {
    width: 52,
    height: 52,
    borderRadius: 10,
    objectFit: "cover" as const,
  },
  symbol: { fontSize: 26, fontWeight: 700, color: "#fff" },
  name: { fontSize: 13, color: "#6b6b80", marginTop: 2 },
  badge: {
    fontSize: 12,
    color: "#00dc82",
    marginTop: 3,
  },
  // Wallet
  walletBtnWrap: {
    display: "flex",
    justifyContent: "center",
    marginBottom: 20,
  },
  // Amount buttons
  amountRow: {
    display: "flex",
    gap: 10,
    marginBottom: 20,
  },
  amountBtn: {
    flex: 1,
    padding: "14px 0",
    fontSize: 16,
    fontWeight: 700,
    color: "#0d0d12",
    backgroundColor: "#00dc82",
    border: "none",
    borderRadius: 10,
    cursor: "pointer",
  },
  // Simulation
  simBox: {
    backgroundColor: "#13131d",
    borderRadius: 12,
    padding: 16,
    marginBottom: 20,
    border: "1px solid #1e1e2e",
  },
  simTitle: {
    fontSize: 13,
    fontWeight: 600,
    color: "#8b8b9e",
    marginBottom: 12,
    textTransform: "uppercase" as const,
    letterSpacing: 0.5,
  },
  simRow: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 6,
  },
  simLabel: { fontSize: 13, color: "#6b6b80" },
  simValue: { fontSize: 13, color: "#c8c8d8", fontFamily: "monospace" },
  cancelBtn: {
    flex: 1,
    padding: "12px 0",
    fontSize: 14,
    fontWeight: 600,
    color: "#8b8b9e",
    backgroundColor: "#1e1e2e",
    border: "none",
    borderRadius: 8,
    cursor: "pointer",
  },
  confirmBtn: {
    flex: 2,
    padding: "12px 0",
    fontSize: 14,
    fontWeight: 700,
    color: "#0d0d12",
    backgroundColor: "#00dc82",
    border: "none",
    borderRadius: 8,
    cursor: "pointer",
  },
  // Success
  successBox: {
    textAlign: "center" as const,
    padding: "24px 0",
  },
  txLink: {
    display: "block",
    color: "#00dc82",
    fontSize: 14,
    marginTop: 12,
    textDecoration: "none",
  },
  resetBtn: {
    marginTop: 16,
    padding: "10px 24px",
    fontSize: 14,
    fontWeight: 600,
    color: "#c8c8d8",
    backgroundColor: "#1e1e2e",
    border: "none",
    borderRadius: 8,
    cursor: "pointer",
  },
  // Error
  errorBox: {
    backgroundColor: "#1e0a0e",
    border: "1px solid #3d1520",
    borderRadius: 10,
    padding: 14,
    marginBottom: 16,
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    fontSize: 13,
    color: "#ff4466",
  },
  errorRetry: {
    padding: "6px 14px",
    fontSize: 12,
    fontWeight: 600,
    color: "#ff4466",
    backgroundColor: "transparent",
    border: "1px solid #3d1520",
    borderRadius: 6,
    cursor: "pointer",
  },
  // Trust block
  trustBlock: {
    borderTop: "1px solid #1e1e2e",
    paddingTop: 16,
    marginTop: 8,
  },
  trustTitle: {
    fontSize: 11,
    fontWeight: 600,
    color: "#44445a",
    marginBottom: 10,
    textTransform: "uppercase" as const,
    letterSpacing: 0.8,
  },
  trustRow: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 6,
  },
  trustLabel: { fontSize: 12, color: "#44445a" },
  trustValue: { fontSize: 12, color: "#6b6b80" },
  trustLink: {
    fontSize: 12,
    color: "#6b6b80",
    textDecoration: "none",
  },
};
