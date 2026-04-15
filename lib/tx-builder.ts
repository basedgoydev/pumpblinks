import {
  Connection,
  PublicKey,
  SystemProgram,
  LAMPORTS_PER_SOL,
  TransactionInstruction,
  TransactionMessage,
  VersionedTransaction,
  AddressLookupTableAccount,
} from "@solana/web3.js";
import {
  PLATFORM_WALLET,
  PLATFORM_FEE_BPS,
  REFERRER_FEE_BPS,
  RPC_URL,
} from "./constants";
import { getTokenInfo } from "./token";

const connection = new Connection(RPC_URL, "confirmed");

interface BuildTxParams {
  mint: string;
  buyer: string;
  amountSOL: number;
  referrer?: string;
}

export interface BuildTxResult {
  transaction: string; // base64
  message: string;
  lastValidBlockHeight: number;
  simulation: {
    tokenSymbol: string;
    solIn: number;
    platformFee: number;
    referrerFee: number;
    swapAmount: number;
  };
}

/**
 * Build the atomic transaction:
 * 1. Compute budget (from Jupiter)
 * 2. Platform fee transfer (0.3%)
 * 3. Referrer fee transfer (0.2%) — if valid referrer
 * 4. Swap via Jupiter (routes through Pump.fun bonding curve or PumpSwap)
 */
export async function buildBuyTransaction(
  params: BuildTxParams
): Promise<BuildTxResult> {
  const { mint, buyer, amountSOL, referrer } = params;

  // Validate addresses
  const buyerPubkey = new PublicKey(buyer);
  const mintPubkey = new PublicKey(mint);
  const amountLamports = Math.floor(amountSOL * LAMPORTS_PER_SOL);

  // Validate referrer — if invalid or self-referral, silently ignore
  let validReferrer: string | undefined;
  if (referrer) {
    try {
      new PublicKey(referrer);
      if (referrer === buyer) {
        console.warn(`Self-referral blocked: ${buyer}`);
      } else {
        validReferrer = referrer;
      }
    } catch {
      console.warn(`Invalid referrer: ${referrer}, ignoring`);
    }
  }

  // Calculate fees
  let platformFeeLamports: number;
  let referrerFeeLamports = 0;

  if (validReferrer) {
    platformFeeLamports = Math.floor(
      (amountLamports * PLATFORM_FEE_BPS) / 10000
    );
    referrerFeeLamports = Math.floor(
      (amountLamports * REFERRER_FEE_BPS) / 10000
    );
  } else {
    // No referrer → platform gets full 0.5%
    platformFeeLamports = Math.floor(
      (amountLamports * (PLATFORM_FEE_BPS + REFERRER_FEE_BPS)) / 10000
    );
  }

  const swapLamports =
    amountLamports - platformFeeLamports - referrerFeeLamports;

  // Verify token exists
  const tokenInfo = await getTokenInfo(mint);
  if (!tokenInfo) throw new Error("Token not found on Pump.fun");

  // Build instructions
  const instructions: TransactionInstruction[] = [];

  // NOTE: No manual ComputeBudgetProgram here.
  // Jupiter handles compute budget via dynamicComputeUnitLimit: true

  // Fee: platform
  instructions.push(
    SystemProgram.transfer({
      fromPubkey: buyerPubkey,
      toPubkey: PLATFORM_WALLET,
      lamports: platformFeeLamports,
    })
  );

  // Fee: referrer
  if (validReferrer && referrerFeeLamports > 0) {
    instructions.push(
      SystemProgram.transfer({
        fromPubkey: buyerPubkey,
        toPubkey: new PublicKey(validReferrer),
        lamports: referrerFeeLamports,
      })
    );
  }

  // Swap via Jupiter (auto-routes through Pump.fun bonding curve or PumpSwap)
  const { swapInstructions, addressLookupTableAccounts } =
    await getJupiterSwapData(buyerPubkey, mintPubkey, swapLamports);
  instructions.push(...swapInstructions);

  // Build VersionedTransaction
  const { blockhash, lastValidBlockHeight } =
    await connection.getLatestBlockhash("confirmed");

  const messageV0 = new TransactionMessage({
    payerKey: buyerPubkey,
    recentBlockhash: blockhash,
    instructions,
  }).compileToV0Message(addressLookupTableAccounts);

  const tx = new VersionedTransaction(messageV0);
  const serialized = Buffer.from(tx.serialize()).toString("base64");

  return {
    transaction: serialized,
    message: `Buy $${tokenInfo.symbol} with ${amountSOL} SOL`,
    lastValidBlockHeight,
    simulation: {
      tokenSymbol: tokenInfo.symbol,
      solIn: amountSOL,
      platformFee: platformFeeLamports / LAMPORTS_PER_SOL,
      referrerFee: referrerFeeLamports / LAMPORTS_PER_SOL,
      swapAmount: swapLamports / LAMPORTS_PER_SOL,
    },
  };
}

/**
 * Jupiter swap: quote + instructions + address lookup tables.
 * Jupiter auto-routes through Pump.fun bonding curve for non-graduated tokens.
 */
async function getJupiterSwapData(
  buyer: PublicKey,
  mint: PublicKey,
  amountLamports: number
): Promise<{
  swapInstructions: TransactionInstruction[];
  addressLookupTableAccounts: AddressLookupTableAccount[];
}> {
  const SOL_MINT = "So11111111111111111111111111111111111111112";

  // Quote
  const quoteUrl = new URL("https://api.jup.ag/swap/v1/quote");
  quoteUrl.searchParams.set("inputMint", SOL_MINT);
  quoteUrl.searchParams.set("outputMint", mint.toBase58());
  quoteUrl.searchParams.set("amount", amountLamports.toString());
  quoteUrl.searchParams.set("slippageBps", "500");

  const quoteRes = await fetch(quoteUrl.toString());
  if (!quoteRes.ok) {
    const errorText = await quoteRes.text();
    console.error("Jupiter quote error:", errorText);
    throw new Error("Swap quote failed — no route found for this token");
  }
  const quote = await quoteRes.json();

  // Swap instructions
  const swapRes = await fetch("https://api.jup.ag/swap/v1/swap-instructions", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      quoteResponse: quote,
      userPublicKey: buyer.toBase58(),
      dynamicComputeUnitLimit: true,
      dynamicSlippage: true,
      // Priority fee: "auto" estimates based on recent network fees
      // Capped at 1M lamports (0.001 SOL) to keep user costs low
      prioritizationFeeLamports: {
        priorityLevelWithMaxLamports: {
          maxLamports: 1_000_000,
          priorityLevel: "high",
        },
      },
    }),
  });

  if (!swapRes.ok) {
    const errorText = await swapRes.text();
    console.error("Jupiter swap-instructions error:", errorText);
    throw new Error("Swap instruction build failed — try again");
  }
  const swapData = await swapRes.json();
  if (swapData.error) {
    console.error("Jupiter swap error:", swapData.error);
    throw new Error("Swap routing error — try again");
  }

  // Deserialize instructions — compute budget MUST come first
  const instructions: TransactionInstruction[] = [];

  // Compute budget instructions (from Jupiter's dynamicComputeUnitLimit)
  if (swapData.computeBudgetInstructions) {
    swapData.computeBudgetInstructions.forEach((ix: any) =>
      instructions.push(deserializeIx(ix))
    );
  }

  // Setup instructions (ATA creation, WSOL wrapping, etc.)
  if (swapData.setupInstructions) {
    swapData.setupInstructions.forEach((ix: any) =>
      instructions.push(deserializeIx(ix))
    );
  }
  // The swap itself
  if (swapData.swapInstruction) {
    instructions.push(deserializeIx(swapData.swapInstruction));
  }
  // Cleanup (unwrap WSOL, close accounts)
  if (swapData.cleanupInstruction) {
    instructions.push(deserializeIx(swapData.cleanupInstruction));
  }

  // Load address lookup tables
  const addressLookupTableAccounts: AddressLookupTableAccount[] = [];
  if (swapData.addressLookupTableAddresses?.length) {
    const results = await Promise.all(
      swapData.addressLookupTableAddresses.map((addr: string) =>
        connection.getAddressLookupTable(new PublicKey(addr))
      )
    );
    results.forEach((r) => {
      if (r.value) addressLookupTableAccounts.push(r.value);
    });
  }

  return { swapInstructions: instructions, addressLookupTableAccounts };
}

function deserializeIx(ix: any): TransactionInstruction {
  return new TransactionInstruction({
    programId: new PublicKey(ix.programId),
    keys: ix.accounts.map((a: any) => ({
      pubkey: new PublicKey(a.pubkey),
      isSigner: a.isSigner,
      isWritable: a.isWritable,
    })),
    data: Buffer.from(ix.data, "base64"),
  });
}
