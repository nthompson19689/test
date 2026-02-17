import type { Metadata } from 'next';
import '../styles/globals.css';

export const metadata: Metadata = {
  title: 'SEO Ranking Comparison & Opportunity Report',
  description: 'Comprehensive SEO analysis with Hub & Spoke keyword strategy',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-gray-50">
        <header className="bg-white border-b border-gray-200">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
            <h1 className="text-xl font-bold text-gray-900">SEO Ranking Comparison Tool</h1>
            <p className="text-sm text-gray-500 mt-1">Powered by DataForSEO &middot; Hub &amp; Spoke Strategy</p>
          </div>
        </header>
        <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          {children}
        </main>
      </body>
    </html>
  );
}
