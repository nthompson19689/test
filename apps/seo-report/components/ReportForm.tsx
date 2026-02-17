'use client';

import { useState, useEffect, useCallback } from 'react';
import type { SEOReport, SavedProject } from '@/lib/types';
import { loadProjects, saveProject, deleteProject, generateProjectId } from '@/lib/projects';

interface ReportFormProps {
  onReportGenerated: (report: SEOReport) => void;
}

export default function ReportForm({ onReportGenerated }: ReportFormProps) {
  // Core fields
  const [domain, setDomain] = useState('');
  const [valueProposition, setValueProposition] = useState('');
  const [dataforseoLogin, setDataforseoLogin] = useState('');
  const [dataforseoPassword, setDataforseoPassword] = useState('');

  // Brand context fields
  const [industry, setIndustry] = useState('');
  const [negativeKeywords, setNegativeKeywords] = useState('');
  const [products, setProducts] = useState('');
  const [targetAudience, setTargetAudience] = useState('');

  // Project management
  const [projects, setProjects] = useState<SavedProject[]>([]);
  const [activeProjectId, setActiveProjectId] = useState<string | null>(null);
  const [projectName, setProjectName] = useState('');
  const [showSaveDialog, setShowSaveDialog] = useState(false);

  // UI state
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState({ step: '', pct: 0 });
  const [error, setError] = useState('');
  const [envCredsConfigured, setEnvCredsConfigured] = useState<boolean | null>(null);
  const [showManualCreds, setShowManualCreds] = useState(false);
  const [showBrandContext, setShowBrandContext] = useState(true);

  useEffect(() => {
    fetch('/api/config')
      .then(res => res.json())
      .then(data => setEnvCredsConfigured(data.hasCredentials))
      .catch(() => setEnvCredsConfigured(false));
  }, []);

  // Load projects from localStorage on mount
  useEffect(() => {
    setProjects(loadProjects());
  }, []);

  const loadProjectIntoForm = useCallback((project: SavedProject) => {
    setDomain(project.domain);
    setValueProposition(project.valueProposition);
    setIndustry(project.industry);
    setNegativeKeywords(project.negativeKeywords.join(', '));
    setProducts(project.products.join(', '));
    setTargetAudience(project.targetAudience);
    setActiveProjectId(project.id);
    setProjectName(project.name);
  }, []);

  const handleSaveProject = () => {
    const name = projectName.trim() || `${domain} - ${new Date().toLocaleDateString()}`;
    const project: SavedProject = {
      id: activeProjectId || generateProjectId(),
      name,
      domain,
      valueProposition,
      industry,
      negativeKeywords: negativeKeywords.split(',').map(s => s.trim()).filter(Boolean),
      products: products.split(',').map(s => s.trim()).filter(Boolean),
      targetAudience,
      createdAt: activeProjectId
        ? projects.find(p => p.id === activeProjectId)?.createdAt || new Date().toISOString()
        : new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    saveProject(project);
    setProjects(loadProjects());
    setActiveProjectId(project.id);
    setShowSaveDialog(false);
  };

  const handleDeleteProject = (id: string) => {
    deleteProject(id);
    setProjects(loadProjects());
    if (activeProjectId === id) setActiveProjectId(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    setProgress({ step: 'Initializing...', pct: 0 });

    try {
      const payload: Record<string, unknown> = { domain, valueProposition };
      if (dataforseoLogin) payload.dataforseoLogin = dataforseoLogin;
      if (dataforseoPassword) payload.dataforseoPassword = dataforseoPassword;
      if (industry) payload.industry = industry;
      if (targetAudience) payload.targetAudience = targetAudience;

      const negKw = negativeKeywords.split(',').map(s => s.trim()).filter(Boolean);
      if (negKw.length > 0) payload.negativeKeywords = negKw;

      const prodList = products.split(',').map(s => s.trim()).filter(Boolean);
      if (prodList.length > 0) payload.products = prodList;

      const res = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!res.ok && !res.body) {
        const err = await res.json();
        throw new Error(err.error || 'Failed to start analysis');
      }

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
    <div className="space-y-4">
      {/* Saved Projects */}
      {projects.length > 0 && (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
          <h3 className="text-sm font-semibold text-gray-900 mb-3">Saved Projects</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
            {projects.map(p => (
              <div
                key={p.id}
                className={`border rounded-md p-3 cursor-pointer transition-colors ${
                  activeProjectId === p.id
                    ? 'border-blue-500 bg-blue-50'
                    : 'border-gray-200 hover:border-gray-400'
                }`}
              >
                <div className="flex items-start justify-between">
                  <button
                    type="button"
                    onClick={() => loadProjectIntoForm(p)}
                    className="text-left flex-1"
                  >
                    <span className="text-sm font-medium text-gray-900 block">{p.name}</span>
                    <span className="text-xs text-gray-500 block">{p.domain}</span>
                    <span className="text-[10px] text-gray-400 block mt-1">
                      Updated {new Date(p.updatedAt).toLocaleDateString()}
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDeleteProject(p.id)}
                    className="text-gray-400 hover:text-red-500 text-xs ml-2 p-1"
                    title="Delete project"
                  >
                    &times;
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Main Form */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-gray-900">
            {activeProjectId ? `Project: ${projectName}` : 'Generate SEO Report'}
          </h2>
          {domain && (
            <button
              type="button"
              onClick={() => setShowSaveDialog(true)}
              className="text-sm text-blue-600 hover:text-blue-800 font-medium"
            >
              {activeProjectId ? 'Update Project' : 'Save as Project'}
            </button>
          )}
        </div>

        {/* Save dialog */}
        {showSaveDialog && (
          <div className="mb-4 bg-blue-50 border border-blue-200 rounded-md p-3">
            <label className="block text-sm font-medium text-gray-700 mb-1">Project Name</label>
            <div className="flex gap-2">
              <input
                type="text"
                value={projectName}
                onChange={e => setProjectName(e.target.value)}
                placeholder={`${domain} - SEO Report`}
                className="flex-1 px-3 py-1.5 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
              <button
                type="button"
                onClick={handleSaveProject}
                className="px-3 py-1.5 text-sm bg-blue-600 text-white rounded-md hover:bg-blue-700"
              >
                Save
              </button>
              <button
                type="button"
                onClick={() => setShowSaveDialog(false)}
                className="px-3 py-1.5 text-sm bg-gray-100 text-gray-600 rounded-md hover:bg-gray-200"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

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
          </div>

          {/* Brand Context Section */}
          <div className="border border-gray-200 rounded-md">
            <button
              type="button"
              onClick={() => setShowBrandContext(!showBrandContext)}
              className="w-full flex items-center justify-between px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              <span>Brand Context &amp; Noise Filtering</span>
              <span className="text-gray-400 text-xs">
                {showBrandContext ? 'Hide' : 'Show'} {industry || negativeKeywords || products || targetAudience ? '(configured)' : '(recommended)'}
              </span>
            </button>
            {showBrandContext && (
              <div className="px-4 pb-4 space-y-3 border-t border-gray-200 pt-3">
                <p className="text-xs text-gray-500">
                  These fields help filter out irrelevant keywords. For example, if your client is a webinar platform called &ldquo;Sequel&rdquo;,
                  add &ldquo;movie&rdquo;, &ldquo;film&rdquo;, &ldquo;cinema&rdquo; as negative keywords to exclude movie sequel results.
                </p>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div>
                    <label htmlFor="industry" className="block text-sm font-medium text-gray-700 mb-1">
                      Industry / Niche
                    </label>
                    <input
                      id="industry"
                      type="text"
                      value={industry}
                      onChange={e => setIndustry(e.target.value)}
                      placeholder="e.g. webinar platform, B2B SaaS, e-commerce"
                      className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-1 focus:ring-blue-500 text-sm"
                    />
                  </div>
                  <div>
                    <label htmlFor="targetAudience" className="block text-sm font-medium text-gray-700 mb-1">
                      Target Audience
                    </label>
                    <input
                      id="targetAudience"
                      type="text"
                      value={targetAudience}
                      onChange={e => setTargetAudience(e.target.value)}
                      placeholder="e.g. marketing teams, enterprise companies, small businesses"
                      className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-1 focus:ring-blue-500 text-sm"
                    />
                  </div>
                </div>

                <div>
                  <label htmlFor="products" className="block text-sm font-medium text-gray-700 mb-1">
                    Key Products / Services
                  </label>
                  <input
                    id="products"
                    type="text"
                    value={products}
                    onChange={e => setProducts(e.target.value)}
                    placeholder="e.g. live webinars, on-demand video, virtual events (comma separated)"
                    className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-1 focus:ring-blue-500 text-sm"
                  />
                  <p className="text-xs text-gray-500 mt-0.5">Comma-separated list</p>
                </div>

                <div>
                  <label htmlFor="negativeKeywords" className="block text-sm font-medium text-gray-700 mb-1">
                    Negative Keywords
                  </label>
                  <input
                    id="negativeKeywords"
                    type="text"
                    value={negativeKeywords}
                    onChange={e => setNegativeKeywords(e.target.value)}
                    placeholder="e.g. movie, film, cinema, recipe (comma separated)"
                    className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-1 focus:ring-blue-500 text-sm"
                  />
                  <p className="text-xs text-gray-500 mt-0.5">Terms that indicate irrelevant results — keywords matching these will be excluded</p>
                </div>
              </div>
            )}
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
                Find these in your <span className="font-medium">DataForSEO dashboard &rarr; API Access</span>.
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
    </div>
  );
}
