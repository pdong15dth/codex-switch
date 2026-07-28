import type { Metadata, Viewport } from 'next'
import { Geist, Geist_Mono } from 'next/font/google'
import './globals.css'

const sans = Geist({ subsets: ['latin'], variable: '--font-geist', display: 'swap' })
const mono = Geist_Mono({ subsets: ['latin'], variable: '--font-mono-geist', display: 'swap' })

export const metadata: Metadata = {
  title: 'Codex Switch',
  description: 'Lưu và chuyển nhanh giữa nhiều account Codex CLI và Claude Code.'
}

export const viewport: Viewport = {
  themeColor: '#0b0a09',
  colorScheme: 'dark'
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="vi" className={`${sans.variable} ${mono.variable} h-full antialiased`}>
      <body className="min-h-full">
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:absolute focus:top-3 focus:left-3 focus:z-50 focus:rounded-md focus:bg-raised focus:px-3 focus:py-2 focus:text-sm"
        >
          Bỏ qua, tới nội dung
        </a>
        {children}
      </body>
    </html>
  )
}
