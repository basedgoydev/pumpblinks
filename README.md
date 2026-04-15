# PumpBlinks

Open-source protocol for buying any Pump.fun token via a shareable link with built-in affiliate tracking.

**Blinks is dead. This is what comes next.**

## How it works

1. Caller goes to `pumpblinks.xyz/share`, pastes a token mint, gets a link with their wallet as referrer
2. Shares the link on X, Telegram, Discord
3. Buyer clicks → connects wallet (Phantom/Solflare/Backpack) → reviews transaction → signs → done
4. Caller earns 0.2% on every purchase, on-chain, in their wallet

## Trust model

- Uses Pump.fun's official program — same as buying on pump.fun directly
- Transaction preview shows exact fees before signing — nothing hidden
- All fees verifiable on Solscan
- Open source — audit the code yourself
- No token approvals, no persistent wallet access

## Fee structure

| On 1 SOL buy | Split |
|---|---|
| 0.003 SOL (0.3%) | Platform |
| 0.002 SOL (0.2%) | Referrer |
| 0.995 SOL (99.5%) | Swap → token |

No referrer in URL → platform gets 0.5%.

## Stack

- Next.js 14+ / TypeScript / Vercel
- Solana Wallet Adapter (Phantom, Solflare, Backpack)
- Jupiter Swap API (auto-routes through Pump.fun bonding curve or PumpSwap)
- Helius RPC (free tier)
- next/og for Twitter Card images

## Setup

```bash
git clone https://github.com/YOUR_USERNAME/pumpblinks.git
cd pumpblinks
npm install
cp .env.example .env.local
# Edit .env.local: add Helius API key + platform wallet
npm run dev
```

## Deploy

1. Push to GitHub
2. Import on [vercel.com](https://vercel.com)
3. Add env vars: `HELIUS_RPC_URL`, `NEXT_PUBLIC_HELIUS_RPC_URL`, `PLATFORM_WALLET`, `NEXT_PUBLIC_URL`, `NEXT_PUBLIC_GITHUB_URL`
4. Deploy

## API

**GET** `/api/buy/{MINT}?ref={WALLET}` → Token metadata + fee info + trust links

**POST** `/api/buy/{MINT}?amount=0.5&ref={WALLET}` → Serialized VersionedTransaction + simulation data
```json
{ "account": "BUYER_WALLET" }
```

**GET** `/api/og/{MINT}` → Dynamic PNG image for Twitter Card previews

## License

MIT
