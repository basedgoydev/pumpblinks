import { Metadata } from "next";
import { APP_URL } from "@/lib/constants";
import { getTokenInfo } from "@/lib/token";
import BuyClient from "./BuyClient";

interface PageProps {
  params: { mint: string };
  searchParams: { ref?: string };
}

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const token = await getTokenInfo(params.mint);
  const title = token
    ? `$${token.symbol} — Buy via Pump.fun`
    : "StarBlink";
  const description = token
    ? `${token.name} · ${token.isGraduated ? "Graduated" : `${token.bondingCurveProgress.toFixed(0)}%`} · Buy now`
    : "Buy any Pump.fun token";
  const ogImage = `${APP_URL}/api/og/${params.mint}`;

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      images: [{ url: ogImage, width: 1200, height: 630 }],
      type: "website",
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [ogImage],
    },
  };
}

export default async function BuyPage({ params, searchParams }: PageProps) {
  const token = await getTokenInfo(params.mint);

  // Serialize token data for client component
  const tokenData = token
    ? {
        mint: token.mint,
        symbol: token.symbol,
        name: token.name,
        image: token.image,
        isGraduated: token.isGraduated,
        bondingCurveProgress: token.bondingCurveProgress,
        priceSOL: token.priceSOL,
        marketCapSol: token.marketCapSol,
      }
    : null;

  return (
    <BuyClient
      mint={params.mint}
      referrer={searchParams.ref}
      token={tokenData}
    />
  );
}
