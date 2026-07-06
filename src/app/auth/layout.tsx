export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-blue-50 dark:bg-gray-900">
      {children}
    </div>
  );
}
