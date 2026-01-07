"use client";

import { useState } from "react";

interface AssetDisplayProps {
  asset: {
    id: string;
    name: string | null;
    outputJson: {
      linkedin_posts: string[];
      blog_outline: string;
      newsletter: string;
      hooks: string[];
    };
    createdAt: Date;
  };
}

export function AssetDisplay({ asset }: AssetDisplayProps) {
  const [activeTab, setActiveTab] = useState<"linkedin" | "blog" | "newsletter" | "hooks">(
    "linkedin"
  );
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);

  const output = asset.outputJson;

  async function copyToClipboard(text: string, index?: number) {
    try {
      await navigator.clipboard.writeText(text);
      if (index !== undefined) {
        setCopiedIndex(index);
        setTimeout(() => setCopiedIndex(null), 2000);
      }
    } catch (err) {
      console.error("Failed to copy:", err);
    }
  }

  function CopyButton({ text, index }: { text: string; index?: number }) {
    const isCopied = index !== undefined && copiedIndex === index;

    return (
      <button
        onClick={() => copyToClipboard(text, index)}
        className="px-3 py-1 text-xs bg-gray-100 hover:bg-gray-200 rounded transition-colors"
      >
        {isCopied ? "✓ Copied" : "Copy"}
      </button>
    );
  }

  return (
    <div className="bg-white rounded-lg shadow">
      <div className="border-b border-gray-200 px-6 py-4">
        <h3 className="text-lg font-semibold">
          {asset.name || "Generated Assets"}
        </h3>
        <p className="text-sm text-gray-500 mt-1">
          Created {new Date(asset.createdAt).toLocaleDateString()}
        </p>
      </div>

      <div className="border-b border-gray-200">
        <div className="flex gap-1 px-6">
          <button
            onClick={() => setActiveTab("linkedin")}
            className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
              activeTab === "linkedin"
                ? "border-blue-600 text-blue-600"
                : "border-transparent text-gray-600 hover:text-gray-900"
            }`}
          >
            LinkedIn Posts ({output.linkedin_posts.length})
          </button>
          <button
            onClick={() => setActiveTab("blog")}
            className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
              activeTab === "blog"
                ? "border-blue-600 text-blue-600"
                : "border-transparent text-gray-600 hover:text-gray-900"
            }`}
          >
            Blog Outline
          </button>
          <button
            onClick={() => setActiveTab("newsletter")}
            className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
              activeTab === "newsletter"
                ? "border-blue-600 text-blue-600"
                : "border-transparent text-gray-600 hover:text-gray-900"
            }`}
          >
            Newsletter
          </button>
          <button
            onClick={() => setActiveTab("hooks")}
            className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
              activeTab === "hooks"
                ? "border-blue-600 text-blue-600"
                : "border-transparent text-gray-600 hover:text-gray-900"
            }`}
          >
            Hooks ({output.hooks.length})
          </button>
        </div>
      </div>

      <div className="p-6">
        {activeTab === "linkedin" && (
          <div className="space-y-6">
            {output.linkedin_posts.map((post, index) => (
              <div key={index} className="border border-gray-200 rounded-lg p-4">
                <div className="flex justify-between items-start mb-3">
                  <h4 className="font-semibold text-gray-900">Post {index + 1}</h4>
                  <CopyButton text={post} index={index} />
                </div>
                <p className="text-gray-700 whitespace-pre-wrap leading-relaxed">{post}</p>
                <div className="mt-3 pt-3 border-t border-gray-100 text-xs text-gray-500">
                  {post.length} characters
                </div>
              </div>
            ))}
          </div>
        )}

        {activeTab === "blog" && (
          <div className="prose max-w-none">
            <div className="flex justify-end mb-4">
              <CopyButton text={output.blog_outline} />
            </div>
            <div className="border border-gray-200 rounded-lg p-6 bg-gray-50">
              <pre className="whitespace-pre-wrap font-sans text-sm text-gray-800 leading-relaxed">
                {output.blog_outline}
              </pre>
            </div>
          </div>
        )}

        {activeTab === "newsletter" && (
          <div>
            <div className="flex justify-end mb-4">
              <CopyButton text={output.newsletter} />
            </div>
            <div className="border border-gray-200 rounded-lg p-6 bg-gray-50">
              <p className="text-gray-800 whitespace-pre-wrap leading-relaxed">
                {output.newsletter}
              </p>
            </div>
          </div>
        )}

        {activeTab === "hooks" && (
          <div className="space-y-3">
            {output.hooks.map((hook, index) => (
              <div
                key={index}
                className="flex items-start justify-between gap-4 p-4 border border-gray-200 rounded-lg hover:bg-gray-50"
              >
                <div className="flex-1">
                  <span className="inline-block w-6 h-6 rounded-full bg-blue-100 text-blue-700 text-xs font-semibold flex items-center justify-center mr-3">
                    {index + 1}
                  </span>
                  <span className="text-gray-800">{hook}</span>
                </div>
                <CopyButton text={hook} index={index} />
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
