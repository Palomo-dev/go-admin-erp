/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  eslint: {
    // Permite que el build en producción complete aunque haya errores de ESLint
    ignoreDuringBuilds: true,
  },
  typescript: {
    // Permite que el build en producción complete aunque haya errores de TypeScript
    ignoreBuildErrors: true,
  },
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'jgmgphmzusbluqhuqihj.supabase.co',
        port: '',
        pathname: '/storage/v1/object/public/**',
      },
    ],
  },
  // Add any other configurations here
}

module.exports = nextConfig
