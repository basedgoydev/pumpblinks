import { PublicKey } from "@solana/web3.js";

// ===== FEES (basis points, 100 bps = 1%) =====
export const PLATFORM_FEE_BPS = Number(process.env.PLATFORM_FEE_BPS || 30);
export const REFERRER_FEE_BPS = Number(process.env.REFERRER_FEE_BPS || 20);

// ===== WALLETS =====
const platformWalletStr = process.env.PLATFORM_WALLET;
if (!platformWalletStr) {
  throw new Error(
    "FATAL: PLATFORM_WALLET env var not set. Fees would be burned. Set it in .env.local"
  );
}
export const PLATFORM_WALLET = new PublicKey(platformWalletStr);

// ===== RPC =====
const heliusRpcUrl = process.env.HELIUS_RPC_URL;
if (!heliusRpcUrl) {
  throw new Error(
    "FATAL: HELIUS_RPC_URL not set. Server-side TX building requires a reliable RPC."
  );
}
export const RPC_URL = heliusRpcUrl;

// ===== PUMP.FUN PROGRAM (for trust verification) =====
export const PUMP_PROGRAM_ID = "6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P";

// ===== APP =====
export const APP_URL = process.env.NEXT_PUBLIC_URL || "http://localhost:3000";
export const GITHUB_URL =
  process.env.NEXT_PUBLIC_GITHUB_URL || "https://github.com/pumpblinks/pumpblinks";
