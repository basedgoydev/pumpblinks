import { Metadata } from "next";
import "@solana/wallet-adapter-react-ui/styles.css";

export const metadata: Metadata = {
  title: "StarBlink",
  description: "Buy any Pump.fun token via a shareable link",
  icons: {
    icon: "/favicon.jpg",
    apple: "/favicon.jpg",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          padding: 0,
          backgroundColor: "#0d0d12",
          color: "#e0e0e8",
          fontFamily:
            '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
          minHeight: "100vh",
        }}
      >
        {children}
      </body>
    </html>
  );
}
