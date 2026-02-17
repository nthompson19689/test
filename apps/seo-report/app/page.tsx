'use client';

import { useState } from 'react';
import type { SEOReport } from '@/lib/types';
import type { AnalysisWarning } from '@/lib/analyzer';

type ReportWithWarnings = SEOReport & { warnings?: AnalysisWarning[] };
import ReportForm from '@/components/ReportForm';
import SummaryCards from '@/components/SummaryCards';
import RankingsTable from '@/components/RankingsTable';
import CompetitorTable from '@/components/CompetitorTable';
import OpportunitiesTable from '@/components/OpportunitiesTable';
import RefreshSuggestions from '@/components/RefreshSuggestions';
import HubSpokeView from '@/components/HubSpokeView';
import ExportButton from '@/components/ExportButton';

type Tab = 'summary' | 'rankings' | 'competitors' | 'opportunities' | 'refresh' | 'hub-spoke';

export default function HomePage() {
  const [report, setReport] = useState<ReportWithWarnings | null>(null);
  const [activeTab, setActiveTab] = useState<Tab>('summary');

  const tabs: { key: Tab; label: string; count?: number }[] = report ? [
    { key: 'summary', label: 'Summary' },
    { key: 'rankings', label: 'Current Rankings', count: report.currentRankings.length },
    { key: 'competitors', label: 'Competitors', count: report.competitors.length },
    { key: 'opportunities', label: 'Net New Opportunities', count: report.netNewOpportunities.length },
    { key: 'refresh', label: 'Content Refresh', count: report.contentRefreshSuggestions.length },
    { key: 'hub-spoke', label: 'Hub & Spoke', count: report.hubAndSpoke.length },
  ] : [];

  return (
    <div className="space-y-6">
      {!report && <ReportForm onReportGenerated={setReport} />}

      {report && (
        <>
          {/* Header with export and new report */}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div>
              <h2 className="text-xl font-bold text-gray-900">SEO Report: {report.domain}</h2>
              <p className="text-sm text-gray-500">Generated {new Date(report.generatedAt).toLocaleString()}</p>
            </div>
            <div className="flex gap-2 items-center">
              <ExportButton report={report} />
              <button
                onClick={() => setReport(null)}
                className="px-3 py-1.5 text-sm bg-gray-100 text-gray-700 rounded-md hover:bg-gray-200"
              >
                New Report
              </button>
            </div>
          </div>

          {/* Warnings */}
          {report.warnings && report.warnings.length > 0 && (
            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
              <h3 className="text-sm font-semibold text-yellow-800 mb-1">Warnings during analysis</h3>
              <ul className="text-sm text-yellow-700 space-y-1">
                {report.warnings.map((w, i) => (
                  <li key={i}><span className="font-medium">[{w.step}]</span> {w.message}</li>
                ))}
              </ul>
            </div>
          )}

          {/* Tabs */}
          <div className="border-b border-gray-200">
            <nav className="flex gap-0 -mb-px overflow-x-auto">
              {tabs.map(tab => (
                <button
                  key={tab.key}
                  onClick={() => setActiveTab(tab.key)}
                  className={`px-4 py-2.5 text-sm font-medium whitespace-nowrap border-b-2 transition-colors ${
                    activeTab === tab.key
                      ? 'border-blue-600 text-blue-600'
                      : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                  }`}
                >
                  {tab.label}
                  {tab.count !== undefined && (
                    <span className={`ml-1.5 px-1.5 py-0.5 rounded-full text-[10px] ${
                      activeTab === tab.key ? 'bg-blue-100 text-blue-600' : 'bg-gray-100 text-gray-500'
                    }`}>
                      {tab.count}
                    </span>
                  )}
                </button>
              ))}
            </nav>
          </div>

          {/* Tab content */}
          <div>
            {activeTab === 'summary' && (
              <div className="space-y-6">
                <SummaryCards summary={report.summary} domain={report.domain} />
                <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
                  <h3 className="text-base font-semibold text-gray-900 mb-2">Value Proposition</h3>
                  <p className="text-sm text-gray-600">{report.valueProposition}</p>
                </div>
                {/* Quick wins */}
                <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
                  <h3 className="text-base font-semibold text-gray-900 mb-3">Quick Wins</h3>
                  <div className="space-y-2">
                    {report.contentRefreshSuggestions
                      .filter(s => s.priority === 'high')
                      .slice(0, 5)
                      .map((s, i) => (
                        <div key={i} className="flex items-center justify-between text-sm">
                          <span className="text-gray-700">
                            <span className="font-medium">{s.keyword}</span>
                            <span className="text-gray-400 mx-2">→</span>
                            Move from #{s.currentPosition} to top 3
                          </span>
                          <span className="text-green-600 font-medium">+{s.potentialTraffic.toLocaleString()} visits/mo</span>
                        </div>
                      ))}
                  </div>
                </div>
                {/* Top hub opportunities */}
                <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
                  <h3 className="text-base font-semibold text-gray-900 mb-3">Top Hub &amp; Spoke Opportunities</h3>
                  <div className="space-y-3">
                    {report.hubAndSpoke.slice(0, 5).map((hub, i) => (
                      <div key={i} className="flex items-center justify-between">
                        <div>
                          <span className="text-sm font-medium text-gray-900">{hub.hubKeyword}</span>
                          <span className="text-xs text-gray-500 ml-2">
                            {hub.spokeKeywords.length} spokes &middot; Vol: {hub.totalOpportunityVolume.toLocaleString()}
                          </span>
                        </div>
                        <span className="text-sm text-green-600 font-medium">
                          +{hub.estimatedTrafficPotential.toLocaleString()} est. traffic
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
            {activeTab === 'rankings' && <RankingsTable rankings={report.currentRankings} />}
            {activeTab === 'competitors' && (
              <CompetitorTable
                competitors={report.competitors}
                competitorKeywords={report.competitorKeywords}
                clientDomain={report.domain}
              />
            )}
            {activeTab === 'opportunities' && <OpportunitiesTable opportunities={report.netNewOpportunities} />}
            {activeTab === 'refresh' && <RefreshSuggestions suggestions={report.contentRefreshSuggestions} />}
            {activeTab === 'hub-spoke' && <HubSpokeView hubs={report.hubAndSpoke} />}
          </div>
        </>
      )}
    </div>
  );
}
