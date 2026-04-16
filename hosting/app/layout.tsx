import type React from "react"
import type { Metadata, Viewport } from "next"
import { Geist, Geist_Mono } from "next/font/google"
import { Analytics } from "@vercel/analytics/next"
import "./globals.css"

const _geist = Geist({ subsets: ["latin"] })
const _geistMono = Geist_Mono({ subsets: ["latin"] })
const shouldRenderAnalytics = Boolean(process.env.VERCEL || process.env.VERCEL_ENV)

export const metadata: Metadata = {
  title: "Quantum Computing Lab",
  description: "Interactive 3D visualization of discrete elliptic curve fields y² = x³ + 7 (mod p)"
}

export const viewport: Viewport = {
  themeColor: "#0d1117",
  width: "device-width",
  initialScale: 1,
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en">
      <body className={`font-sans antialiased`}>
        {children}
        {shouldRenderAnalytics ? <Analytics /> : null}
      </body>
    </html>
  )
}
