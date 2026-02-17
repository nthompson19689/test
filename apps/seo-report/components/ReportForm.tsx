'use client';

import { useState, useEffect } from 'react';
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
  const [envCredsConfigured, setEnvCredsConfigured] = useState<boolean | null>(null);
  const [showManualCreds, setShowManualCreds] = useState(false);

  useEffect(() => {
    fetch('/api/config')
      .then(res => res.json())
      .then(data => setEnvCredsConfigured(data.hasCredentials))
      .catch(() => setEnvCredsConfigured(false));
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    setProgress({ step: 'Initializing...', pct: 0 });

    try {
      const payload: Record<string, string> = { domain, valueProposition };
      // Only send credentials if manually entered (server falls back to env vars)
      if (dataforseoLogin) payload.dataforseoLogin = dataforseoLogin;
      if (dataforseoPassword) payload.dataforseoPassword = dataforseoPassword;

      const res = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!res.ok && !res.body) {
        const err = await res.json();
        throw new Error(err.error || 'Failed to start analysis');
      }

      // Handle non-streaming error responses (e.g. missing credentials)
      const contentType = res.headers.get('content-type') || '';
      if (contentType.includes('application/json')) {
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

        {/* Credentials section */}
        {envCredsConfigured === null ? (
          <p className="text-xs text-gray-400">Checking API configuration...</p>
        ) : envCredsConfigured && !showManualCreds ? (
          <div className="bg-green-50 border border-green-200 rounded-md p-3 flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-green-800">DataForSEO API key configured</p>
              <p className="text-xs text-green-600">Using credentials from environment variables</p>
            </div>
            <button
              type="button"
              onClick={() => setShowManualCreds(true)}
              className="text-xs text-green-700 underline hover:text-green-900"
            >
              Override
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            {envCredsConfigured && (
              <button
                type="button"
                onClick={() => {
                  setShowManualCreds(false);
                  setDataforseoLogin('');
                  setDataforseoPassword('');
                }}
                className="text-xs text-blue-600 underline hover:text-blue-800"
              >
                Use environment variables instead
              </button>
            )}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label htmlFor="login" className="block text-sm font-medium text-gray-700 mb-1">
                  DataForSEO Login (email)
                </label>
                <input
                  id="login"
                  type="text"
                  value={dataforseoLogin}
                  onChange={e => setDataforseoLogin(e.target.value)}
                  placeholder="your@email.com"
                  required={!envCredsConfigured}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm"
                />
              </div>
              <div>
                <label htmlFor="apiKey" className="block text-sm font-medium text-gray-700 mb-1">
                  DataForSEO API Key
                </label>
                <input
                  id="apiKey"
                  type="password"
                  value={dataforseoPassword}
                  onChange={e => setDataforseoPassword(e.target.value)}
                  placeholder="Your API key from the DataForSEO dashboard"
                  required={!envCredsConfigured}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm"
                />
              </div>
            </div>
            <p className="text-xs text-gray-500">
              Find these in your <span className="font-medium">DataForSEO dashboard → API Access</span>.
              Or set <code className="bg-gray-100 px-1 rounded">DATAFORSEO_LOGIN</code> and <code className="bg-gray-100 px-1 rounded">DATAFORSEO_API_KEY</code> in your .env file.
            </p>
          </div>
        )}

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
