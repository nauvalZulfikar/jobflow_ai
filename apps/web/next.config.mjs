/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "standalone",
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: 'avatars.githubusercontent.com' },
      { protocol: 'https', hostname: 'lh3.googleusercontent.com' },
    ],
  },
  async rewrites() {
    const apiUrl = process.env.NODE_ENV === 'production'
      ? (process.env.API_URL ?? 'http://localhost:3001')
      : 'http://localhost:3001'
    return [
      {
        source: '/api/:path((?!auth).*)',
        destination: `${apiUrl}/api/:path*`,
      },
    ]
  },
}

export default nextConfig
