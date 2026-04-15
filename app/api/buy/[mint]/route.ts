import { NextRequest, NextResponse } from "next/server";
import { PublicKey } from "@solana/web3.js";
import { getTokenInfo } from "@/lib/token";
import { buildBuyTransaction } from "@/lib/tx-builder";
import {
  PLATFORM_FEE_BPS,
  REFERRER_FEE_BPS,
  PUMP_PROGRAM_ID,
  GITHUB_URL,
} from "@/lib/constants";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

// Validate a Solana address, return false if invalid
function isValidAddress(addr: string): boolean {
  try {
    new PublicKey(addr);
    return true;
  } catch {
    return false;
  }
}

/**
 * GET /api/buy/[mint]?ref=WALLET
 * Returns token metadata + fee breakdown for the UI.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { mint: string } }
) {
  const { mint } = params;
  const rawRef = request.nextUrl.searchParams.get("ref") || undefined;
  // Validate referrer — only honor if it's a valid Solana address
  const ref = rawRef && isValidAddress(rawRef) ? rawRef : undefined;

  if (!isValidAddress(mint)) {
    return NextResponse.json({ error: "Invalid mint address" }, { status: 400, headers: CORS });
  }

  try {
    const token = await getTokenInfo(mint);
    if (!token) {
      return NextResponse.json({ error: "Token not found" }, { status: 404, headers: CORS });
    }

    const totalBps = PLATFORM_FEE_BPS + REFERRER_FEE_BPS;
    // Platform gets the full 0.5% when there's no valid referrer
    const effectivePlatformBps = ref ? PLATFORM_FEE_BPS : totalBps;
    const effectiveReferrerBps = ref ? REFERRER_FEE_BPS : 0;

    return NextResponse.json(
      {
        token,
        fees: {
          platformBps: effectivePlatformBps,
          referrerBps: effectiveReferrerBps,
          totalBps,
          referrerWallet: ref || null,
        },
        trust: {
          pumpProgram: PUMP_PROGRAM_ID,
          pumpProgramUrl: `https://solscan.io/account/${PUMP_PROGRAM_ID}`,
          tokenUrl: `https://pump.fun/${mint}`,
          solscanUrl: `https://solscan.io/token/${mint}`,
          githubUrl: GITHUB_URL,
          referrerUrl: ref ? `https://solscan.io/account/${ref}` : null,
        },
      },
      { headers: CORS }
    );
  } catch (err) {
    console.error("GET /api/buy error:", err);
    return NextResponse.json({ error: "Failed to fetch token" }, { status: 500, headers: CORS });
  }
}

/**
 * POST /api/buy/[mint]?amount=0.5&ref=WALLET
 * Body: { account: "BUYER_WALLET" }
 * Returns: serialized TX + simulation breakdown
 */
export async function POST(
  request: NextRequest,
  { params }: { params: { mint: string } }
) {
  const { mint } = params;

  try {
    const body = await request.json();
    const buyer = body.account;

    if (!buyer) {
      return NextResponse.json({ error: "Missing buyer wallet" }, { status: 400, headers: CORS });
    }

    if (!isValidAddress(buyer)) {
      return NextResponse.json({ error: "Invalid buyer wallet" }, { status: 400, headers: CORS });
    }

    if (!isValidAddress(mint)) {
      return NextResponse.json({ error: "Invalid mint address" }, { status: 400, headers: CORS });
    }

    const amount = Number(request.nextUrl.searchParams.get("amount") || "0.5");
    const ref = request.nextUrl.searchParams.get("ref") || undefined;

    // NaN check + range validation
    if (isNaN(amount) || amount < 0.001 || amount > 100) {
      return NextResponse.json(
        { error: "Amount must be between 0.001 and 100 SOL" },
        { status: 400, headers: CORS }
      );
    }

    const result = await buildBuyTransaction({
      mint,
      buyer,
      amountSOL: amount,
      referrer: ref,
    });

    return NextResponse.json(
      {
        transaction: result.transaction,
        message: result.message,
        lastValidBlockHeight: result.lastValidBlockHeight,
        simulation: result.simulation,
      },
      { headers: CORS }
    );
  } catch (err: any) {
    console.error("POST /api/buy error:", err);
    // Sanitize error — don't leak internal details to client
    const userMessage =
      err.message?.includes("not found")
        ? "Token not found on Pump.fun"
        : err.message?.includes("route")
        ? "No swap route found for this token"
        : err.message?.startsWith("Swap")
        ? err.message // already sanitized in tx-builder
        : "Transaction build failed. Try again.";
    return NextResponse.json(
      { error: userMessage },
      { status: 500, headers: CORS }
    );
  }
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS });
}
