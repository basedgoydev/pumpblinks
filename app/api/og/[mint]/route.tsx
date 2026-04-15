import { NextRequest } from "next/server";
import { ImageResponse } from "next/og";

export const runtime = "edge";

// Pump.fun bonding curve constants (must match token.ts)
const INITIAL_VIRTUAL_SOL = 30;
const GRADUATION_SOL_THRESHOLD = 85;

/**
 * Lightweight token fetch for edge runtime — no @solana/web3.js dependency.
 */
async function fetchTokenMeta(mint: string) {
  try {
    const res = await fetch(`https://frontend-api-v3.pump.fun/coins/${mint}`, {
      headers: { Accept: "application/json" },
    });
    if (!res.ok) return null;
    const d = await res.json();
    if (!d?.mint) return null;
    const vsr = d.virtual_sol_reserves ? Number(d.virtual_sol_reserves) / 1e9 : 0;
    const realSol = Math.max(vsr - INITIAL_VIRTUAL_SOL, 0);
    const progress = Math.min((realSol / GRADUATION_SOL_THRESHOLD) * 100, 100);

    // Fetch and convert image to base64 for OG image rendering
    let imageData: string | null = null;
    if (d.image_uri) {
      try {
        const imgRes = await fetch(d.image_uri);
        if (imgRes.ok) {
          const arrayBuffer = await imgRes.arrayBuffer();
          const base64 = Buffer.from(arrayBuffer).toString("base64");
          const contentType = imgRes.headers.get("content-type") || "image/png";
          imageData = `data:${contentType};base64,${base64}`;
        }
      } catch {
        // Image fetch failed, continue without image
      }
    }

    return {
      symbol: d.symbol || "???",
      name: d.name || "Unknown",
      image: imageData,
      progress,
      graduated:
        d.complete === true ||
        !!d.raydium_pool ||
        !!d.pumpswap_pool ||
        progress >= 100,
    };
  } catch {
    return null;
  }
}

export async function GET(
  request: NextRequest,
  { params }: { params: { mint: string } }
) {
  const { mint } = params;

  try {
    const token = await fetchTokenMeta(mint);
    const symbol = token?.symbol || "???";
    const name = token?.name || "Unknown Token";
    const image = token?.image || null;
    const progress = token?.progress?.toFixed(0) || "0";
    const status = token?.graduated ? "Graduated" : `${progress}% bonding curve`;
    const mintShort = `${mint.slice(0, 6)}...${mint.slice(-4)}`;

    return new ImageResponse(
      (
        <div style={{ width: "100%", height: "100%", display: "flex", justifyContent: "space-between", alignItems: "center", padding: "60px 80px", background: "linear-gradient(135deg, #0d0d12 0%, #1a1a2e 100%)" }}>
          <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 4, background: "linear-gradient(90deg, #00dc82, #00dc82)" }} />

          {/* Left side - Token info */}
          <div style={{ display: "flex", flexDirection: "column", flex: 1 }}>
            <div style={{ fontSize: 80, fontWeight: 800, color: "white", lineHeight: 1 }}>${symbol}</div>
            <div style={{ fontSize: 28, color: "#8b8b9e", marginTop: 12 }}>{name}</div>
            <div style={{ fontSize: 24, color: "#00dc82", marginTop: 20 }}>{status}</div>
            <div style={{ fontSize: 18, color: "#44445a", marginTop: 12 }}>{mintShort}</div>
            <div style={{ display: "flex", gap: 12, marginTop: 32 }}>
              {["0.1 SOL", "0.5 SOL", "1 SOL"].map((l) => (
                <div key={l} style={{ padding: "12px 28px", backgroundColor: "#00dc82", borderRadius: 10, fontSize: 18, fontWeight: 700, color: "#0d0d12" }}>{l}</div>
              ))}
            </div>
          </div>

          {/* Right side - Token image */}
          {image && (
            <div style={{ display: "flex", marginLeft: 40 }}>
              <img
                src={image}
                width={280}
                height={280}
                style={{ borderRadius: 24, border: "4px solid #2a2a3e" }}
              />
            </div>
          )}

          <div style={{ position: "absolute", bottom: 30, left: 80, right: 80, display: "flex", justifyContent: "space-between", fontSize: 16, color: "#44445a" }}>
            <span>via Pump.fun</span>
            <span>pumpblinks.xyz</span>
          </div>
        </div>
      ),
      { width: 1200, height: 630 }
    );
  } catch {
    return new ImageResponse(
      (
        <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", backgroundColor: "#0d0d12" }}>
          <div style={{ fontSize: 48, fontWeight: 800, color: "white" }}>StarBlink</div>
          <div style={{ fontSize: 24, color: "#00dc82", marginTop: 16 }}>Buy any Pump.fun token</div>
        </div>
      ),
      { width: 1200, height: 630 }
    );
  }
}
