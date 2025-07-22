/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '*.supabase.co',
      },
      {
        protocol: 'https', 
        hostname: 'jgmgphmzusbluqhuqihj.supabase.co',
      },
    ],
  },
  // Add any other configurations here
}

module.exports = nextConfig
