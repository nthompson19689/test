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

  // Business Context Brief — Product Definition
  const [productCategory, setProductCategory] = useState('');
  const [products, setProducts] = useState('');

  // Business Context Brief — Buyer Definition
  const [primaryBuyer, setPrimaryBuyer] = useState('');
  const [buyingTriggers, setBuyingTriggers] = useState('');
  const [competitors, setCompetitors] = useState('');

  // Business Context Brief — Boundary Definition
  const [productIsNot, setProductIsNot] = useState('');
  const [ambiguousTerms, setAmbiguousTerms] = useState('');
  const [negativeKeywords, setNegativeKeywords] = useState('');

  // Project management
  const [projectList, setProjectList] = useState<SavedProject[]>([]);
  const [activeProjectId, setActiveProjectId] = useState<string | null>(null);
  const [projectName, setProjectName] = useState('');
  const [showSaveDialog, setShowSaveDialog] = useState(false);

  // UI state
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

  useEffect(() => {
    setProjectList(loadProjects());
  }, []);

  const loadProjectIntoForm = useCallback((project: SavedProject) => {
    setDomain(project.domain);
    setValueProposition(project.valueProposition);
    setProductCategory(project.productCategory || '');
    setProducts(project.products.join(', '));
    setPrimaryBuyer(project.primaryBuyer || '');
    setBuyingTriggers(project.buyingTriggers || '');
    setCompetitors(project.competitors?.join(', ') || '');
    setProductIsNot(project.productIsNot || '');
    setAmbiguousTerms(project.ambiguousTerms || '');
    setNegativeKeywords(project.negativeKeywords.join(', '));
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
      productCategory,
      products: products.split(',').map(s => s.trim()).filter(Boolean),
      primaryBuyer,
      buyingTriggers,
      competitors: competitors.split(',').map(s => s.trim()).filter(Boolean),
      productIsNot,
      ambiguousTerms,
      negativeKeywords: negativeKeywords.split(',').map(s => s.trim()).filter(Boolean),
      createdAt: activeProjectId
        ? projectList.find(p => p.id === activeProjectId)?.createdAt || new Date().toISOString()
        : new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    saveProject(project);
    setProjectList(loadProjects());
    setActiveProjectId(project.id);
    setShowSaveDialog(false);
  };

  const handleDeleteProject = (id: string) => {
    deleteProject(id);
    setProjectList(loadProjects());
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
      if (productCategory) payload.productCategory = productCategory;
      if (primaryBuyer) payload.primaryBuyer = primaryBuyer;
      if (buyingTriggers) payload.buyingTriggers = buyingTriggers;
      if (productIsNot) payload.productIsNot = productIsNot;
      if (ambiguousTerms) payload.ambiguousTerms = ambiguousTerms;

      const prodList = products.split(',').map(s => s.trim()).filter(Boolean);
      if (prodList.length > 0) payload.products = prodList;

      const compList = competitors.split(',').map(s => s.trim()).filter(Boolean);
      if (compList.length > 0) payload.competitors = compList;

      const negKw = negativeKeywords.split(',').map(s => s.trim()).filter(Boolean);
      if (negKw.length > 0) payload.negativeKeywords = negKw;

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
      {projectList.length > 0 && (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
          <h3 className="text-sm font-semibold text-gray-900 mb-3">Saved Projects</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
            {projectList.map(p => (
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
              <button type="button" onClick={handleSaveProject}
                className="px-3 py-1.5 text-sm bg-blue-600 text-white rounded-md hover:bg-blue-700">Save</button>
              <button type="button" onClick={() => setShowSaveDialog(false)}
                className="px-3 py-1.5 text-sm bg-gray-100 text-gray-600 rounded-md hover:bg-gray-200">Cancel</button>
            </div>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-5">
          {/* Domain */}
          <div>
            <label htmlFor="domain" className="block text-sm font-medium text-gray-700 mb-1">Client Domain</label>
            <input id="domain" type="text" value={domain} onChange={e => setDomain(e.target.value)}
              placeholder="example.com" required
              className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm" />
            <p className="text-xs text-gray-500 mt-1">Without http:// or trailing slash</p>
          </div>

          {/* Value Proposition */}
          <div>
            <label htmlFor="valueProposition" className="block text-sm font-medium text-gray-700 mb-1">Value Proposition</label>
            <textarea id="valueProposition" value={valueProposition} onChange={e => setValueProposition(e.target.value)}
              placeholder="What the client does, their target audience, key services/products, what makes them unique..."
              required rows={3}
              className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm" />
          </div>

          {/* ═══ BUSINESS CONTEXT BRIEF ═══ */}
          <div className="border border-gray-200 rounded-lg overflow-hidden">
            <div className="bg-gray-50 px-4 py-3 border-b border-gray-200">
              <h3 className="text-sm font-semibold text-gray-900">Business Context Brief</h3>
              <p className="text-xs text-gray-500 mt-0.5">
                The more detail you provide, the better the noise filter works. The &ldquo;What this product is NOT&rdquo; field is the single most impactful field for filtering irrelevant keywords.
              </p>
            </div>

            <div className="p-4 space-y-4">
              {/* Section 1: Product Definition */}
              <div>
                <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Product Definition</h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div>
                    <label htmlFor="productCategory" className="block text-sm font-medium text-gray-700 mb-1">Product Category</label>
                    <input id="productCategory" type="text" value={productCategory} onChange={e => setProductCategory(e.target.value)}
                      placeholder="e.g. B2B webinar and virtual events platform"
                      className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-1 focus:ring-blue-500" />
                    <p className="text-xs text-gray-400 mt-0.5">Be specific — &ldquo;B2B webinar platform&rdquo; not &ldquo;events&rdquo;</p>
                  </div>
                  <div>
                    <label htmlFor="products" className="block text-sm font-medium text-gray-700 mb-1">Key Products / Services</label>
                    <input id="products" type="text" value={products} onChange={e => setProducts(e.target.value)}
                      placeholder="e.g. live webinars, on-demand video, virtual events"
                      className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-1 focus:ring-blue-500" />
                    <p className="text-xs text-gray-400 mt-0.5">Comma-separated</p>
                  </div>
                </div>
              </div>

              {/* Section 2: Buyer Definition */}
              <div>
                <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Buyer Definition</h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div>
                    <label htmlFor="primaryBuyer" className="block text-sm font-medium text-gray-700 mb-1">Primary Buyer</label>
                    <input id="primaryBuyer" type="text" value={primaryBuyer} onChange={e => setPrimaryBuyer(e.target.value)}
                      placeholder="e.g. VP of Marketing at B2B enterprise companies"
                      className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-1 focus:ring-blue-500" />
                    <p className="text-xs text-gray-400 mt-0.5">Job title + function, not &ldquo;marketers&rdquo;</p>
                  </div>
                  <div>
                    <label htmlFor="competitors" className="block text-sm font-medium text-gray-700 mb-1">Competitors / Alternatives</label>
                    <input id="competitors" type="text" value={competitors} onChange={e => setCompetitors(e.target.value)}
                      placeholder="e.g. Zoom Webinars, GoTo Webinar, ON24"
                      className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-1 focus:ring-blue-500" />
                    <p className="text-xs text-gray-400 mt-0.5">Comma-separated — used to filter competitor navigational queries</p>
                  </div>
                </div>
                <div className="mt-3">
                  <label htmlFor="buyingTriggers" className="block text-sm font-medium text-gray-700 mb-1">Buying Triggers</label>
                  <input id="buyingTriggers" type="text" value={buyingTriggers} onChange={e => setBuyingTriggers(e.target.value)}
                    placeholder="e.g. Need to host customer webinars, scale virtual events, replace in-person conferences"
                    className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-1 focus:ring-blue-500" />
                </div>
              </div>

              {/* Section 3: Boundary Definition — THE CRITICAL SECTION */}
              <div>
                <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Boundary Definition</h4>
                <div className="bg-amber-50 border border-amber-200 rounded-md p-3 mb-3">
                  <p className="text-xs text-amber-800">
                    <strong>This is the most important section.</strong> Be thorough about what the product is NOT. List every adjacent category, tool, or concept that shares vocabulary with your product but serves a different buyer. This is your primary noise filter.
                  </p>
                </div>

                <div>
                  <label htmlFor="productIsNot" className="block text-sm font-medium text-gray-700 mb-1">What This Product is NOT</label>
                  <textarea id="productIsNot" value={productIsNot} onChange={e => setProductIsNot(e.target.value)}
                    placeholder={"Example for a B2B webinar platform called Sequel:\n\nThis is NOT a consumer streaming service, NOT a video conferencing tool for internal meetings, NOT an event venue or ticketing platform, NOT a virtual reality product, NOT a database or programming language (SQL), NOT an entertainment franchise or movie sequel."}
                    rows={4}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-1 focus:ring-blue-500" />
                </div>

                <div className="mt-3">
                  <label htmlFor="ambiguousTerms" className="block text-sm font-medium text-gray-700 mb-1">Ambiguous Terms</label>
                  <textarea id="ambiguousTerms" value={ambiguousTerms} onChange={e => setAmbiguousTerms(e.target.value)}
                    placeholder={"sequel = company name, not movie sequels or SQL databases;\nvirtual events = online B2B marketing events, not VR or virtual assistants;\nlive = live-streamed business events, not live sports or live music"}
                    rows={3}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-1 focus:ring-blue-500" />
                  <p className="text-xs text-gray-400 mt-0.5">Format: term = correct meaning, not wrong meaning (semicolon-separated)</p>
                </div>

                <div className="mt-3">
                  <label htmlFor="negativeKeywords" className="block text-sm font-medium text-gray-700 mb-1">Negative Keywords</label>
                  <input id="negativeKeywords" type="text" value={negativeKeywords} onChange={e => setNegativeKeywords(e.target.value)}
                    placeholder="e.g. movie, film, cinema, recipe, sql query"
                    className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-1 focus:ring-blue-500" />
                  <p className="text-xs text-gray-400 mt-0.5">Comma-separated — any keyword containing these terms will be excluded</p>
                </div>
              </div>
            </div>
          </div>

          {/* Credentials */}
          {envCredsConfigured === null ? (
            <p className="text-xs text-gray-400">Checking API configuration...</p>
          ) : envCredsConfigured && !showManualCreds ? (
            <div className="bg-green-50 border border-green-200 rounded-md p-3 flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-green-800">DataForSEO API key configured</p>
                <p className="text-xs text-green-600">Using credentials from environment variables</p>
              </div>
              <button type="button" onClick={() => setShowManualCreds(true)}
                className="text-xs text-green-700 underline hover:text-green-900">Override</button>
            </div>
          ) : (
            <div className="space-y-3">
              {envCredsConfigured && (
                <button type="button" onClick={() => { setShowManualCreds(false); setDataforseoLogin(''); setDataforseoPassword(''); }}
                  className="text-xs text-blue-600 underline hover:text-blue-800">Use environment variables instead</button>
              )}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label htmlFor="login" className="block text-sm font-medium text-gray-700 mb-1">DataForSEO Login (email)</label>
                  <input id="login" type="text" value={dataforseoLogin} onChange={e => setDataforseoLogin(e.target.value)}
                    placeholder="your@email.com" required={!envCredsConfigured}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm" />
                </div>
                <div>
                  <label htmlFor="apiKey" className="block text-sm font-medium text-gray-700 mb-1">DataForSEO API Key</label>
                  <input id="apiKey" type="password" value={dataforseoPassword} onChange={e => setDataforseoPassword(e.target.value)}
                    placeholder="Your API key" required={!envCredsConfigured}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm" />
                </div>
              </div>
              <p className="text-xs text-gray-500">
                Or set <code className="bg-gray-100 px-1 rounded">DATAFORSEO_LOGIN</code> and <code className="bg-gray-100 px-1 rounded">DATAFORSEO_API_KEY</code> in your .env file.
              </p>
            </div>
          )}

          {error && (
            <div className="bg-red-50 border border-red-200 rounded-md p-3">
              <p className="text-sm text-red-700">{error}</p>
            </div>
          )}

          <button type="submit" disabled={loading}
            className="w-full bg-blue-600 text-white py-2.5 px-4 rounded-md font-medium hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-sm">
            {loading ? 'Analyzing...' : 'Generate SEO Report'}
          </button>

          {loading && (
            <div className="space-y-2">
              <div className="flex justify-between text-sm text-gray-600">
                <span>{progress.step}</span>
                <span>{progress.pct}%</span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-2">
                <div className="bg-blue-600 h-2 rounded-full transition-all duration-500" style={{ width: `${progress.pct}%` }} />
              </div>
            </div>
          )}
        </form>
      </div>
    </div>
  );
}
