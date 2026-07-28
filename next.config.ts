import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  // This app is meant to be used via `npm run dev`, so the floating dev badge
  // would sit on top of the sidebar controls for its whole life.
  devIndicators: false
}

export default nextConfig
