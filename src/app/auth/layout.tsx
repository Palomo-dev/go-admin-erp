import { MarketingTags } from '@/components/marketing/MarketingTags'

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      <MarketingTags />
      <div className="min-h-screen bg-gradient-to-br from-blue-50 via-indigo-50 to-blue-100 dark:from-gray-900 dark:via-gray-800 dark:to-gray-900">
        {children}
      </div>
    </>
  );
}
