import { PublicKey } from "@solana/web3.js";

export interface TokenInfo {
  mint: string;
  name: string;
  symbol: string;
  description: string;
  image: string;
  marketCapSol: number;
  priceSOL: number;
  isGraduated: boolean;
  bondingCurveProgress: number;
  creator: string;
}

// Pump.fun bonding curve constants
const INITIAL_VIRTUAL_SOL = 30; // SOL — initial virtual reserve
const GRADUATION_SOL_THRESHOLD = 85; // SOL needed to graduate

/**
 * Fetch token info from Pump.fun public API.
 * Returns null if token doesn't exist or isn't a Pump.fun token.
 */
export async function getTokenInfo(mint: string): Promise<TokenInfo | null> {
  try {
    // Validate mint is a valid Solana address
    try {
      new PublicKey(mint);
    } catch {
      return null;
    }

    const res = await fetch(`https://frontend-api-v3.pump.fun/coins/${mint}`, {
      headers: { Accept: "application/json" },
      next: { revalidate: 10 },
    });

    if (!res.ok) return null;
    const data = await res.json();
    if (!data || !data.mint) return null;

    // Bonding curve progress — subtract initial virtual reserve
    const virtualSolReserves = data.virtual_sol_reserves
      ? Number(data.virtual_sol_reserves) / 1e9
      : 0;
    const realSolInCurve = Math.max(
      virtualSolReserves - INITIAL_VIRTUAL_SOL,
      0
    );
    const bondingCurveProgress = Math.min(
      (realSolInCurve / GRADUATION_SOL_THRESHOLD) * 100,
      100
    );

    // Graduation: since March 2025, tokens graduate to PumpSwap (not Raydium)
    // data.complete is the canonical flag; pool fields are secondary
    const isGraduated =
      data.complete === true ||
      !!data.raydium_pool || // old tokens (pre-March 2025)
      !!data.pumpswap_pool || // new tokens (post-March 2025)
      bondingCurveProgress >= 100;

    // Price in SOL per token — account for decimals
    // virtual_sol_reserves is in lamports (÷1e9), virtual_token_reserves is raw (÷1e6 for 6-decimal tokens)
    const priceSOL =
      data.virtual_sol_reserves && data.virtual_token_reserves
        ? (Number(data.virtual_sol_reserves) / 1e9) /
          (Number(data.virtual_token_reserves) / 1e6)
        : 0;

    return {
      mint: data.mint,
      name: data.name || "Unknown",
      symbol: data.symbol || "???",
      description: data.description || "",
      image: data.image_uri || data.uri || "",
      marketCapSol: data.market_cap ? Number(data.market_cap) / 1e9 : 0,
      priceSOL,
      isGraduated,
      bondingCurveProgress,
      creator: data.creator || "",
    };
  } catch (err) {
    console.error("getTokenInfo error:", err);
    return null;
  }
}
