"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { Components } from "react-markdown";

// Map section heading keywords → visual style
const SECTION_STYLES: Record<string, { bg: string; border: string; icon: string; label: string }> = {
  "executive summary": {
    bg: "bg-indigo-50", border: "border-indigo-300",
    icon: "📋", label: "text-indigo-800",
  },
  "key findings": {
    bg: "bg-sky-50", border: "border-sky-300",
    icon: "🔍", label: "text-sky-800",
  },
  "financial highlights": {
    bg: "bg-emerald-50", border: "border-emerald-300",
    icon: "💰", label: "text-emerald-800",
  },
  "risk flags": {
    bg: "bg-red-50", border: "border-red-300",
    icon: "⚠️", label: "text-red-800",
  },
  "recommendations": {
    bg: "bg-amber-50", border: "border-amber-300",
    icon: "✅", label: "text-amber-800",
  },
};

function getSectionStyle(text: string) {
  const lower = text.toLowerCase();
  for (const [key, style] of Object.entries(SECTION_STYLES)) {
    if (lower.includes(key)) return style;
  }
  return { bg: "bg-slate-50", border: "border-slate-300", icon: "📌", label: "text-slate-800" };
}

// Detect if a text node looks like a currency / number highlight
function highlightNumbers(text: string): React.ReactNode {
  const parts = text.split(/(\$[\d,]+(?:\.\d+)?[KMB]?|\b\d{1,3}(?:,\d{3})+(?:\.\d+)?\b|\b\d+(?:\.\d+)?%)/g);
  if (parts.length === 1) return text;
  return parts.map((part, i) =>
    /(\$[\d,]+|[\d,]+(?:\.\d+)?%)/.test(part)
      ? <span key={i} className="font-semibold text-indigo-700 bg-indigo-50 px-1 rounded">{part}</span>
      : part
  );
}

const components: Components = {
  // H1 — main report title
  h1({ children }) {
    return (
      <h1 className="text-xl font-bold text-slate-900 border-b-2 border-indigo-200 pb-2 mb-4">
        {children}
      </h1>
    );
  },

  // H2 — section headings with coloured banners
  h2({ children }) {
    const text = String(children);
    const style = getSectionStyle(text);
    return (
      <div className={`flex items-center gap-2.5 px-4 py-2.5 rounded-lg border-l-4 ${style.bg} ${style.border} mt-6 mb-3`}>
        <span className="text-base">{style.icon}</span>
        <h2 className={`text-sm font-bold uppercase tracking-wide ${style.label}`}>{children}</h2>
      </div>
    );
  },

  // H3 — sub-headings
  h3({ children }) {
    return (
      <h3 className="text-sm font-semibold text-slate-700 mt-4 mb-1.5 flex items-center gap-1.5">
        <span className="w-1 h-4 rounded-full bg-indigo-400 inline-block" />
        {children}
      </h3>
    );
  },

  // Paragraph with number highlighting
  p({ children }) {
    return (
      <p className="text-sm text-slate-600 leading-relaxed mb-2.5">
        {typeof children === "string"
          ? highlightNumbers(children)
          : children}
      </p>
    );
  },

  // Unordered list
  ul({ children }) {
    return <ul className="space-y-1.5 mb-3 ml-1">{children}</ul>;
  },

  // Ordered list
  ol({ children }) {
    return <ol className="space-y-1.5 mb-3 ml-1 list-decimal list-inside">{children}</ol>;
  },

  // List item with custom bullet
  li({ children }) {
    return (
      <li className="flex items-start gap-2 text-sm text-slate-600">
        <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-indigo-400 flex-shrink-0" />
        <span className="flex-1 leading-relaxed">{children}</span>
      </li>
    );
  },

  // Strong / bold → highlighted pill
  strong({ children }) {
    return (
      <strong className="font-semibold text-slate-800">{children}</strong>
    );
  },

  // Inline code → styled badge
  code({ children, className }) {
    const isBlock = className?.includes("language-");
    if (isBlock) {
      return (
        <pre className="bg-slate-900 text-slate-100 text-xs rounded-xl p-4 overflow-x-auto my-3">
          <code>{children}</code>
        </pre>
      );
    }
    return (
      <code className="text-xs font-mono bg-slate-100 text-indigo-700 px-1.5 py-0.5 rounded border border-slate-200">
        {children}
      </code>
    );
  },

  // Blockquote → callout box
  blockquote({ children }) {
    return (
      <blockquote className="border-l-4 border-indigo-300 bg-indigo-50 rounded-r-xl px-4 py-3 my-3 text-sm text-indigo-800 italic">
        {children}
      </blockquote>
    );
  },

  // Table
  table({ children }) {
    return (
      <div className="overflow-x-auto rounded-xl border border-slate-200 my-4 shadow-sm">
        <table className="w-full text-sm border-collapse">{children}</table>
      </div>
    );
  },

  thead({ children }) {
    return <thead className="bg-slate-50 border-b border-slate-200">{children}</thead>;
  },

  tbody({ children }) {
    return <tbody className="divide-y divide-slate-100">{children}</tbody>;
  },

  tr({ children }) {
    return <tr className="hover:bg-slate-50/60 transition-colors">{children}</tr>;
  },

  th({ children }) {
    return (
      <th className="px-4 py-2.5 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider whitespace-nowrap">
        {children}
      </th>
    );
  },

  td({ children }) {
    const text = String(children ?? "");
    const isNumeric = /^\$?[\d,]+(\.\d+)?%?$/.test(text.trim());
    return (
      <td className={`px-4 py-2.5 text-sm whitespace-nowrap ${isNumeric ? "font-semibold text-indigo-700 tabular-nums" : "text-slate-600"}`}>
        {isNumeric ? highlightNumbers(text) : children}
      </td>
    );
  },

  // Horizontal rule → styled divider
  hr() {
    return <hr className="border-slate-200 my-5" />;
  },
};

interface Props {
  content: string;
}

export default function ReportRenderer({ content }: Props) {
  return (
    <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
      {content}
    </ReactMarkdown>
  );
}
