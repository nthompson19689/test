'use client';

import { useState } from 'react';
import type { SEOReport } from '@/lib/types';

interface ReportFormProps {
  onReportGenerated: (report: SEOReport) => void;
}

export default function ReportForm({ onReportGenerated }: ReportFormProps) {
  const [domain, setDomain] = useState('');
  const [valueProposition, setValueProposition] = useState('');
  const [dataforseoLogin, setDataforseoLogin] = useState('');
  const [dataforseoPassword, setDataforseoPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState({ step: '', pct: 0 });
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    setProgress({ step: 'Initializing...', pct: 0 });

    try {
      const res = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          domain,
          valueProposition,
          dataforseoLogin,
          dataforseoPassword,
        }),
      });

      if (!res.ok && !res.body) {
        const err = await res.json();
        throw new Error(err.error || 'Failed to start analysis');
      }

      const reader = res.body!.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          const dataLine = line.replace(/^data: /, '');
          if (!dataLine) continue;

          try {
            const parsed = JSON.parse(dataLine);
            if (parsed.type === 'progress') {
              setProgress({ step: parsed.step, pct: parsed.pct });
            } else if (parsed.type === 'complete') {
              onReportGenerated(parsed.report);
            } else if (parsed.type === 'error') {
              throw new Error(parsed.message);
            }
          } catch (parseErr) {
            if (parseErr instanceof Error && parseErr.message !== dataLine) {
              throw parseErr;
            }
          }
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Analysis failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
      <h2 className="text-lg font-semibold text-gray-900 mb-4">Generate SEO Report</h2>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label htmlFor="domain" className="block text-sm font-medium text-gray-700 mb-1">
            Client Domain
          </label>
          <input
            id="domain"
            type="text"
            value={domain}
            onChange={e => setDomain(e.target.value)}
            placeholder="example.com"
            required
            className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm"
          />
          <p className="text-xs text-gray-500 mt-1">Enter domain without http:// or trailing slash</p>
        </div>

        <div>
          <label htmlFor="valueProposition" className="block text-sm font-medium text-gray-700 mb-1">
            Value Proposition
          </label>
          <textarea
            id="valueProposition"
            value={valueProposition}
            onChange={e => setValueProposition(e.target.value)}
            placeholder="Describe what the client does, their target audience, key services/products, and what makes them unique..."
            required
            rows={4}
            className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm"
          />
          <p className="text-xs text-gray-500 mt-1">This helps the tool cluster keywords around relevant topics for hub &amp; spoke strategy</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label htmlFor="login" className="block text-sm font-medium text-gray-700 mb-1">
              DataForSEO Login
            </label>
            <input
              id="login"
              type="text"
              value={dataforseoLogin}
              onChange={e => setDataforseoLogin(e.target.value)}
              placeholder="your@email.com"
              required
              className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm"
            />
          </div>
          <div>
            <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-1">
              DataForSEO Password
            </label>
            <input
              id="password"
              type="password"
              value={dataforseoPassword}
              onChange={e => setDataforseoPassword(e.target.value)}
              placeholder="API password"
              required
              className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm"
            />
          </div>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-md p-3">
            <p className="text-sm text-red-700">{error}</p>
          </div>
        )}

        <button
          type="submit"
          disabled={loading}
          className="w-full bg-blue-600 text-white py-2.5 px-4 rounded-md font-medium hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-sm"
        >
          {loading ? 'Analyzing...' : 'Generate SEO Report'}
        </button>

        {loading && (
          <div className="space-y-2">
            <div className="flex justify-between text-sm text-gray-600">
              <span>{progress.step}</span>
              <span>{progress.pct}%</span>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-2">
              <div
                className="bg-blue-600 h-2 rounded-full transition-all duration-500"
                style={{ width: `${progress.pct}%` }}
              />
            </div>
          </div>
        )}
      </form>
    </div>
  );
}
