"use client";

import { useMemo, useState } from "react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend, AreaChart, Area,
  ScatterChart, Scatter, ZAxis,
  ComposedChart, Line,
  RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis,
} from "recharts";
import ReportRenderer from "./ReportRenderer";

type Row = Record<string, string>;

interface Props {
  headers: string[];
  rows: Row[];
  fileName: string;
}

const PALETTE = ["#6366f1","#8b5cf6","#06b6d4","#10b981","#f59e0b","#ef4444","#ec4899","#14b8a6","#f97316","#3b82f6"];

// ── helpers ───────────────────────────────────────────────────────────────────

function isNumericCol(rows: Row[], col: string) {
  const vals = rows.map((r) => r[col]).filter(Boolean);
  if (!vals.length) return false;
  return vals.filter((v) => !isNaN(parseFloat(v.replace(/[$,%\s]/g, "")))).length / vals.length > 0.8;
}

function isDateCol(rows: Row[], col: string) {
  const vals = rows.map((r) => r[col]).filter(Boolean).slice(0, 20);
  if (!vals.length) return false;
  return vals.filter((v) => !isNaN(Date.parse(v))).length / vals.length > 0.7;
}

function isCategoricalCol(rows: Row[], col: string) {
  const vals = rows.map((r) => r[col]).filter(Boolean);
  const unique = new Set(vals);
  return unique.size <= 20 && unique.size >= 2 && !isNumericCol(rows, col);
}

function toNum(v: string) {
  return parseFloat(v?.replace(/[$,%\s]/g, "") ?? "0") || 0;
}

function fmt(n: number) {
  if (Math.abs(n) >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  if (Math.abs(n) >= 1_000) return `$${(n / 1_000).toFixed(1)}K`;
  return `$${n.toFixed(2)}`;
}

function fmtNum(n: number) {
  return n.toLocaleString(undefined, { maximumFractionDigits: 2 });
}

// ── Sub-components ────────────────────────────────────────────────────────────

function KpiCard({ label, value, sub, color, delta }: {
  label: string; value: string; sub?: string; color: string; delta?: number;
}) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5 space-y-1.5">
      <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider truncate">{label}</p>
      <p className={`text-2xl font-bold ${color}`}>{value}</p>
      <div className="flex items-center gap-2">
        {delta !== undefined && (
          <span className={`text-xs font-medium px-1.5 py-0.5 rounded-full ${delta >= 0 ? "bg-emerald-50 text-emerald-600" : "bg-red-50 text-red-500"}`}>
            {delta >= 0 ? "▲" : "▼"} {Math.abs(delta).toFixed(1)}%
          </span>
        )}
        {sub && <p className="text-xs text-slate-400">{sub}</p>}
      </div>
    </div>
  );
}

function ChartTooltip({ active, payload, label }: {
  active?: boolean; payload?: { name: string; value: number; color?: string }[]; label?: string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white border border-slate-200 rounded-xl shadow-lg px-3.5 py-2.5 text-sm min-w-[120px]">
      {label && <p className="font-semibold text-slate-700 mb-1.5 border-b border-slate-100 pb-1">{label}</p>}
      {payload.map((p, i) => (
        <div key={i} className="flex items-center gap-1.5 text-slate-600">
          {p.color && <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: p.color }} />}
          <span className="font-medium">{p.name}:</span>
          <span>{fmtNum(p.value)}</span>
        </div>
      ))}
    </div>
  );
}

function ChartCard({ title, children, span = 1 }: { title: string; children: React.ReactNode; span?: 1 | 2 }) {
  return (
    <div className={`bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden ${span === 2 ? "xl:col-span-2" : ""}`}>
      <div className="px-5 py-3.5 border-b border-slate-100">
        <p className="text-sm font-semibold text-slate-700">{title}</p>
      </div>
      <div className="p-5">{children}</div>
    </div>
  );
}

function Section({ title, icon, children }: { title: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <div className="flex items-center justify-center w-7 h-7 rounded-lg bg-indigo-50 text-indigo-600">{icon}</div>
        <h2 className="text-base font-semibold text-slate-800">{title}</h2>
      </div>
      {children}
    </div>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────

export default function ReportView({ headers, rows, fileName }: Props) {
  const [narrative, setNarrative] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [narrativeError, setNarrativeError] = useState<string | null>(null);

  const analysis = useMemo(() => {
    const numericCols  = headers.filter((h) => isNumericCol(rows, h));
    const dateCols     = headers.filter((h) => isDateCol(rows, h));
    const categoricalCols = headers.filter((h) => isCategoricalCol(rows, h));

    // KPI stats
    const kpis = numericCols.slice(0, 6).map((col) => {
      const vals = rows.map((r) => toNum(r[col]));
      const sum  = vals.reduce((a, b) => a + b, 0);
      const avg  = sum / vals.length;
      const max  = Math.max(...vals);
      const min  = Math.min(...vals);
      // mock delta using first-half vs second-half avg
      const mid  = Math.floor(vals.length / 2);
      const h1   = vals.slice(0, mid).reduce((a, b) => a + b, 0) / (mid || 1);
      const h2   = vals.slice(mid).reduce((a, b) => a + b, 0) / (vals.length - mid || 1);
      const delta = h1 !== 0 ? ((h2 - h1) / Math.abs(h1)) * 100 : 0;
      return { col, sum, avg, max, min, delta };
    });

    // 1. Vertical bar — top cat by num[0]
    const barData = (() => {
      if (!categoricalCols.length || !numericCols.length) return null;
      const grouped: Record<string, number> = {};
      rows.forEach((r) => {
        const k = r[categoricalCols[0]] || "Unknown";
        grouped[k] = (grouped[k] ?? 0) + toNum(r[numericCols[0]]);
      });
      return Object.entries(grouped)
        .map(([name, value]) => ({ name, value: +value.toFixed(2) }))
        .sort((a, b) => b.value - a.value).slice(0, 10);
    })();

    // 2. Horizontal bar — same data flipped (easier to read long names)
    const hBarData = barData ? [...barData].reverse() : null;

    // 3. Area trend — num[0] over time (monthly)
    const trendData = (() => {
      if (!dateCols.length || !numericCols.length) return null;
      const grouped: Record<string, number> = {};
      rows.forEach((r) => {
        const d = new Date(r[dateCols[0]]);
        if (isNaN(d.getTime())) return;
        const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
        grouped[key] = (grouped[key] ?? 0) + toNum(r[numericCols[0]]);
      });
      return Object.entries(grouped).sort(([a], [b]) => a.localeCompare(b))
        .map(([date, value]) => ({ date, value: +value.toFixed(2) }));
    })();

    // 4. Multi-line trend — num[0] + num[1] over time
    const multiTrendData = (() => {
      if (!dateCols.length || numericCols.length < 2) return null;
      const grouped: Record<string, { a: number; b: number }> = {};
      rows.forEach((r) => {
        const d = new Date(r[dateCols[0]]);
        if (isNaN(d.getTime())) return;
        const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
        if (!grouped[key]) grouped[key] = { a: 0, b: 0 };
        grouped[key].a += toNum(r[numericCols[0]]);
        grouped[key].b += toNum(r[numericCols[1]]);
      });
      return Object.entries(grouped).sort(([a], [b]) => a.localeCompare(b))
        .map(([date, v]) => ({ date, [numericCols[0]]: +v.a.toFixed(2), [numericCols[1]]: +v.b.toFixed(2) }));
    })();

    // 5. Donut — count by categorical[0]
    const donutData = (() => {
      if (!categoricalCols.length) return null;
      const grouped: Record<string, number> = {};
      rows.forEach((r) => {
        const k = r[categoricalCols[0]] || "Unknown";
        grouped[k] = (grouped[k] ?? 0) + 1;
      });
      return Object.entries(grouped)
        .map(([name, value]) => ({ name, value }))
        .sort((a, b) => b.value - a.value).slice(0, 8);
    })();

    // 6. Composed chart — bar num[0] + line num[1] by cat[0]
    const composedData = (() => {
      if (!categoricalCols.length || numericCols.length < 2) return null;
      const grouped: Record<string, { a: number; b: number }> = {};
      rows.forEach((r) => {
        const k = r[categoricalCols[0]] || "Unknown";
        if (!grouped[k]) grouped[k] = { a: 0, b: 0 };
        grouped[k].a += toNum(r[numericCols[0]]);
        grouped[k].b += toNum(r[numericCols[1]]);
      });
      return Object.entries(grouped)
        .map(([name, v]) => ({ name, [numericCols[0]]: +v.a.toFixed(2), [numericCols[1]]: +v.b.toFixed(2) }))
        .sort((a, b) => (b[numericCols[0]] as number) - (a[numericCols[0]] as number)).slice(0, 10);
    })();

    // 9. Grouped bar — num[0] + num[1] side-by-side per category
    const groupedBarData = (() => {
      if (!categoricalCols.length || numericCols.length < 2) return null;
      const grouped: Record<string, { a: number; b: number }> = {};
      rows.forEach((r) => {
        const k = r[categoricalCols[0]] || "Unknown";
        if (!grouped[k]) grouped[k] = { a: 0, b: 0 };
        grouped[k].a += toNum(r[numericCols[0]]);
        grouped[k].b += toNum(r[numericCols[1]]);
      });
      return Object.entries(grouped)
        .map(([name, v]) => ({ name, [numericCols[0]]: +v.a.toFixed(2), [numericCols[1]]: +v.b.toFixed(2) }))
        .sort((a, b) => (b[numericCols[0]] as number) - (a[numericCols[0]] as number)).slice(0, 8);
    })();

    // 10. Stacked bar — cat[0] by categories of cat[1]
    const stackedBarData = (() => {
      if (categoricalCols.length < 2 || !numericCols.length) return null;
      const cat0 = categoricalCols[0];
      const cat1 = categoricalCols[1];
      const numCol = numericCols[0];
      const subCats = [...new Set(rows.map((r) => r[cat1] || "Unknown"))].slice(0, 6);
      const grouped: Record<string, Record<string, number>> = {};
      rows.forEach((r) => {
        const k = r[cat0] || "Unknown";
        const sub = r[cat1] || "Unknown";
        if (!subCats.includes(sub)) return;
        if (!grouped[k]) grouped[k] = {};
        grouped[k][sub] = (grouped[k][sub] ?? 0) + toNum(r[numCol]);
      });
      const result = Object.entries(grouped)
        .map(([name, subs]) => ({ name, ...Object.fromEntries(subCats.map((s) => [s, +(subs[s] ?? 0).toFixed(2)])) }))
        .sort((a, b) => {
          const ta = subCats.reduce((s, sc) => s + ((a as Record<string,number>)[sc] ?? 0), 0);
          const tb = subCats.reduce((s, sc) => s + ((b as Record<string,number>)[sc] ?? 0), 0);
          return tb - ta;
        }).slice(0, 8);
      return { data: result, subCats, cat0, cat1, numCol };
    })();

    // 11. Bar by cat[1] — num[0] total per second categorical
    const bar3Data = (() => {
      if (categoricalCols.length < 2 || !numericCols.length) return null;
      const grouped: Record<string, number> = {};
      rows.forEach((r) => {
        const k = r[categoricalCols[1]] || "Unknown";
        grouped[k] = (grouped[k] ?? 0) + toNum(r[numericCols[0]]);
      });
      return Object.entries(grouped)
        .map(([name, value]) => ({ name, value: +value.toFixed(2) }))
        .sort((a, b) => b.value - a.value).slice(0, 10);
    })();

    // 12. Pie by numeric total — cat[0] by sum of num[0]
    const pieByValueData = (() => {
      if (!categoricalCols.length || !numericCols.length) return null;
      const grouped: Record<string, number> = {};
      rows.forEach((r) => {
        const k = r[categoricalCols[0]] || "Unknown";
        grouped[k] = (grouped[k] ?? 0) + toNum(r[numericCols[0]]);
      });
      return Object.entries(grouped)
        .map(([name, value]) => ({ name, value: +value.toFixed(2) }))
        .sort((a, b) => b.value - a.value).slice(0, 8);
    })();

    // 13. Pie by cat[1] count
    const pie2Data = (() => {
      if (categoricalCols.length < 2) return null;
      const grouped: Record<string, number> = {};
      rows.forEach((r) => {
        const k = r[categoricalCols[1]] || "Unknown";
        grouped[k] = (grouped[k] ?? 0) + 1;
      });
      return Object.entries(grouped)
        .map(([name, value]) => ({ name, value }))
        .sort((a, b) => b.value - a.value).slice(0, 8);
    })();

    // 14. Pie by cat[1] numeric total
    const pie3Data = (() => {
      if (categoricalCols.length < 2 || !numericCols.length) return null;
      const grouped: Record<string, number> = {};
      rows.forEach((r) => {
        const k = r[categoricalCols[1]] || "Unknown";
        grouped[k] = (grouped[k] ?? 0) + toNum(r[numericCols[0]]);
      });
      return Object.entries(grouped)
        .map(([name, value]) => ({ name, value: +value.toFixed(2) }))
        .sort((a, b) => b.value - a.value).slice(0, 8);
    })();

    // 7. Scatter — num[0] vs num[1]
    const scatterData = (() => {
      if (numericCols.length < 2) return null;
      return rows.slice(0, 200).map((r) => ({
        x: toNum(r[numericCols[0]]),
        y: toNum(r[numericCols[1]]),
        z: numericCols[2] ? toNum(r[numericCols[2]]) : 1,
      })).filter((p) => p.x !== 0 || p.y !== 0);
    })();

    // 8. Radar — average of each numeric col (normalised to 0-100)
    const radarData = (() => {
      if (numericCols.length < 3) return null;
      const cols = numericCols.slice(0, 6);
      const maxes = cols.map((c) => Math.max(...rows.map((r) => toNum(r[c]))));
      return cols.map((col, i) => {
        const avg = rows.reduce((s, r) => s + toNum(r[col]), 0) / rows.length;
        const norm = maxes[i] ? (avg / maxes[i]) * 100 : 0;
        return { col, value: +norm.toFixed(1) };
      });
    })();

    return { kpis, numericCols, dateCols, categoricalCols, barData, hBarData, trendData, multiTrendData, donutData, composedData, scatterData, radarData, groupedBarData, stackedBarData, bar3Data, pieByValueData, pie2Data, pie3Data };
  }, [headers, rows]);

  const generateNarrative = async () => {
    setIsGenerating(true);
    setNarrativeError(null);
    try {
      const prompt = `You are a senior accountant preparing a professional financial report.

Dataset: "${fileName}"
Rows: ${rows.length} | Columns: ${headers.join(", ")}

Numeric columns summary:
${analysis.kpis.map((k) => `- ${k.col}: Total=${fmtNum(k.sum)}, Avg=${fmtNum(k.avg)}, Max=${fmtNum(k.max)}, Min=${fmtNum(k.min)}`).join("\n")}

Categorical columns: ${analysis.categoricalCols.join(", ")}
Date columns: ${analysis.dateCols.join(", ")}

Write a professional accounting report with these sections in markdown:
1. **Executive Summary** — 2-3 sentences
2. **Key Findings** — bullet points with specific numbers
3. **Financial Highlights** — use a markdown table
4. **Risk Flags** — outliers, missing data, concentration risk
5. **Recommendations** — 3 actionable next steps`;

      const res = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: prompt, headers, rows }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "API error");
      setNarrative(json.answer);
    } catch (err) {
      setNarrativeError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setIsGenerating(false);
    }
  };

  const { kpis, numericCols, categoricalCols, barData, hBarData, trendData, multiTrendData, donutData, composedData, scatterData, radarData, groupedBarData, stackedBarData, bar3Data, pieByValueData, pie2Data, pie3Data } = analysis;

  return (
    <div className="space-y-10">

      {/* ── KPI Cards ── */}
      {kpis.length > 0 && (
        <Section title="Key Metrics" icon={
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" />
          </svg>
        }>
          <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-4">
            {kpis.map((k, i) => (
              <KpiCard
                key={k.col} label={k.col} value={fmt(k.sum)}
                sub={`Avg ${fmt(k.avg)}`} delta={k.delta}
                color={["text-indigo-600","text-violet-600","text-cyan-600","text-emerald-600","text-amber-600","text-pink-600"][i % 6]}
              />
            ))}
            <KpiCard label="Total Rows" value={rows.length.toLocaleString()} sub={`${headers.length} columns`} color="text-slate-700" />
          </div>
        </Section>
      )}

      {/* ── Charts Row 1: Bar + Donut ── */}
      <Section title="Volume &amp; Distribution" icon={
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 14.25v2.25m3-4.5v4.5m3-6.75v6.75m3-9v9M6 20.25h12A2.25 2.25 0 0020.25 18V6A2.25 2.25 0 0018 3.75H6A2.25 2.25 0 003.75 6v12A2.25 2.25 0 006 20.25z" />
        </svg>
      }>
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
          {barData && barData.length > 0 && (
            <ChartCard title={`${numericCols[0]} by ${categoricalCols[0]} (top 10)`}>
              <ResponsiveContainer width="100%" height={270}>
                <BarChart data={barData} margin={{ top: 4, right: 8, bottom: 44, left: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis dataKey="name" tick={{ fontSize: 10, fill: "#94a3b8" }} angle={-40} textAnchor="end" interval={0} />
                  <YAxis tick={{ fontSize: 10, fill: "#94a3b8" }} tickFormatter={fmtNum} width={60} />
                  <Tooltip content={<ChartTooltip />} />
                  <Bar dataKey="value" name={numericCols[0]} radius={[4, 4, 0, 0]}>
                    {barData.map((_, i) => <Cell key={i} fill={PALETTE[i % PALETTE.length]} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>
          )}

          {donutData && donutData.length > 0 && (
            <ChartCard title={`Count distribution — ${categoricalCols[0]}`}>
              <ResponsiveContainer width="100%" height={270}>
                <PieChart>
                  <Pie data={donutData} dataKey="value" nameKey="name"
                    cx="50%" cy="50%" innerRadius={65} outerRadius={105}
                    paddingAngle={2}
                    label={({ name, percent }) => percent > 0.06 ? `${(percent * 100).toFixed(0)}%` : ""}
                    labelLine={false}>
                    {donutData.map((_, i) => <Cell key={i} fill={PALETTE[i % PALETTE.length]} />)}
                  </Pie>
                  <Tooltip formatter={(v: number) => v.toLocaleString()} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                </PieChart>
              </ResponsiveContainer>
            </ChartCard>
          )}
        </div>
      </Section>

      {/* ── Charts Row 2: Trend(s) ── */}
      {(trendData && trendData.length > 1) && (
        <Section title="Trends Over Time" icon={
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 18L9 11.25l4.306 4.307a11.95 11.95 0 015.814-5.519l2.74-1.22m0 0l-5.94-2.28m5.94 2.28l-2.28 5.941" />
          </svg>
        }>
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
            <ChartCard title={`${numericCols[0]} — monthly trend`}>
              <ResponsiveContainer width="100%" height={260}>
                <AreaChart data={trendData} margin={{ top: 4, right: 8, bottom: 28, left: 8 }}>
                  <defs>
                    <linearGradient id="g1" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#6366f1" stopOpacity={0.18} />
                      <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis dataKey="date" tick={{ fontSize: 10, fill: "#94a3b8" }} angle={-25} textAnchor="end" />
                  <YAxis tick={{ fontSize: 10, fill: "#94a3b8" }} tickFormatter={fmtNum} width={60} />
                  <Tooltip content={<ChartTooltip />} />
                  <Area type="monotone" dataKey="value" name={numericCols[0]}
                    stroke="#6366f1" strokeWidth={2} fill="url(#g1)"
                    dot={{ r: 3, fill: "#6366f1", strokeWidth: 0 }} />
                </AreaChart>
              </ResponsiveContainer>
            </ChartCard>

            {multiTrendData && multiTrendData.length > 1 && (
              <ChartCard title={`${numericCols[0]} vs ${numericCols[1]} — over time`}>
                <ResponsiveContainer width="100%" height={260}>
                  <ComposedChart data={multiTrendData} margin={{ top: 4, right: 8, bottom: 28, left: 8 }}>
                    <defs>
                      <linearGradient id="g2" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.15} />
                        <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                    <XAxis dataKey="date" tick={{ fontSize: 10, fill: "#94a3b8" }} angle={-25} textAnchor="end" />
                    <YAxis tick={{ fontSize: 10, fill: "#94a3b8" }} tickFormatter={fmtNum} width={60} />
                    <Tooltip content={<ChartTooltip />} />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                    <Area type="monotone" dataKey={numericCols[0]} stroke="#6366f1" strokeWidth={2} fill="url(#g2)" dot={false} />
                    <Line type="monotone" dataKey={numericCols[1]} stroke="#10b981" strokeWidth={2} dot={{ r: 3, fill: "#10b981" }} />
                  </ComposedChart>
                </ResponsiveContainer>
              </ChartCard>
            )}
          </div>
        </Section>
      )}

      {/* ── Charts Row 3: Horizontal bar + Composed ── */}
      {(hBarData || composedData) && (
        <Section title="Comparative Analysis" icon={
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M3 7.5L7.5 3m0 0L12 7.5M7.5 3v13.5m13.5 3L16.5 21m0 0L12 16.5m4.5 4.5V7.5" />
          </svg>
        }>
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
            {hBarData && hBarData.length > 0 && (
              <ChartCard title={`${numericCols[0]} ranked (horizontal)`}>
                <ResponsiveContainer width="100%" height={280}>
                  <BarChart data={hBarData} layout="vertical" margin={{ top: 4, right: 24, bottom: 4, left: 8 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" horizontal={false} />
                    <XAxis type="number" tick={{ fontSize: 10, fill: "#94a3b8" }} tickFormatter={fmtNum} />
                    <YAxis type="category" dataKey="name" tick={{ fontSize: 10, fill: "#64748b" }} width={90} />
                    <Tooltip content={<ChartTooltip />} />
                    <Bar dataKey="value" name={numericCols[0]} radius={[0, 4, 4, 0]}>
                      {hBarData.map((_, i) => <Cell key={i} fill={PALETTE[(hBarData.length - 1 - i) % PALETTE.length]} />)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </ChartCard>
            )}

            {composedData && composedData.length > 0 && (
              <ChartCard title={`${numericCols[0]} (bars) + ${numericCols[1]} (line) by ${categoricalCols[0]}`}>
                <ResponsiveContainer width="100%" height={280}>
                  <ComposedChart data={composedData} margin={{ top: 4, right: 24, bottom: 44, left: 8 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                    <XAxis dataKey="name" tick={{ fontSize: 10, fill: "#94a3b8" }} angle={-35} textAnchor="end" interval={0} />
                    <YAxis tick={{ fontSize: 10, fill: "#94a3b8" }} tickFormatter={fmtNum} width={60} />
                    <Tooltip content={<ChartTooltip />} />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                    <Bar dataKey={numericCols[0]} fill="#6366f1" radius={[4, 4, 0, 0]} opacity={0.85} />
                    <Line type="monotone" dataKey={numericCols[1]} stroke="#f59e0b" strokeWidth={2.5}
                      dot={{ r: 4, fill: "#f59e0b", strokeWidth: 0 }} />
                  </ComposedChart>
                </ResponsiveContainer>
              </ChartCard>
            )}
          </div>
        </Section>
      )}

      {/* ── Bar Charts Section ── */}
      {(groupedBarData || stackedBarData || bar3Data) && (
        <Section title="Bar Charts" icon={
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" />
          </svg>
        }>
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">

            {/* Grouped bar */}
            {groupedBarData && groupedBarData.length > 0 && (
              <ChartCard title={`${numericCols[0]} vs ${numericCols[1]} — grouped by ${categoricalCols[0]}`}>
                <ResponsiveContainer width="100%" height={280}>
                  <BarChart data={groupedBarData} margin={{ top: 4, right: 8, bottom: 44, left: 8 }} barCategoryGap="20%">
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                    <XAxis dataKey="name" tick={{ fontSize: 10, fill: "#94a3b8" }} angle={-35} textAnchor="end" interval={0} />
                    <YAxis tick={{ fontSize: 10, fill: "#94a3b8" }} tickFormatter={fmtNum} width={60} />
                    <Tooltip content={<ChartTooltip />} />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                    <Bar dataKey={numericCols[0]} fill="#6366f1" radius={[4, 4, 0, 0]} />
                    <Bar dataKey={numericCols[1]} fill="#10b981" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </ChartCard>
            )}

            {/* Bar for second categorical */}
            {bar3Data && bar3Data.length > 0 && (
              <ChartCard title={`${numericCols[0]} by ${categoricalCols[1]} (top 10)`}>
                <ResponsiveContainer width="100%" height={280}>
                  <BarChart data={bar3Data} margin={{ top: 4, right: 8, bottom: 44, left: 8 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                    <XAxis dataKey="name" tick={{ fontSize: 10, fill: "#94a3b8" }} angle={-35} textAnchor="end" interval={0} />
                    <YAxis tick={{ fontSize: 10, fill: "#94a3b8" }} tickFormatter={fmtNum} width={60} />
                    <Tooltip content={<ChartTooltip />} />
                    <Bar dataKey="value" name={numericCols[0]} radius={[4, 4, 0, 0]}>
                      {bar3Data.map((_, i) => <Cell key={i} fill={PALETTE[(i + 2) % PALETTE.length]} />)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </ChartCard>
            )}

            {/* Stacked bar — full width */}
            {stackedBarData && stackedBarData.data.length > 0 && (
              <ChartCard title={`${stackedBarData.numCol} stacked by ${stackedBarData.cat1} per ${stackedBarData.cat0}`} span={2}>
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={stackedBarData.data} margin={{ top: 4, right: 16, bottom: 44, left: 8 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                    <XAxis dataKey="name" tick={{ fontSize: 10, fill: "#94a3b8" }} angle={-35} textAnchor="end" interval={0} />
                    <YAxis tick={{ fontSize: 10, fill: "#94a3b8" }} tickFormatter={fmtNum} width={60} />
                    <Tooltip content={<ChartTooltip />} />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                    {stackedBarData.subCats.map((sc, i) => (
                      <Bar key={sc} dataKey={sc} stackId="a" fill={PALETTE[i % PALETTE.length]}
                        radius={i === stackedBarData.subCats.length - 1 ? [4, 4, 0, 0] : [0, 0, 0, 0]} />
                    ))}
                  </BarChart>
                </ResponsiveContainer>
              </ChartCard>
            )}
          </div>
        </Section>
      )}

      {/* ── Pie Charts Section ── */}
      {(pieByValueData || pie2Data || pie3Data) && (
        <Section title="Pie Charts" icon={
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 6a7.5 7.5 0 107.5 7.5h-7.5V6z" />
            <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 10.5H21A7.5 7.5 0 0013.5 3v7.5z" />
          </svg>
        }>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">

            {/* Standard pie — numeric totals */}
            {pieByValueData && pieByValueData.length > 0 && (
              <ChartCard title={`${numericCols[0]} share by ${categoricalCols[0]}`}>
                <ResponsiveContainer width="100%" height={280}>
                  <PieChart>
                    <Pie data={pieByValueData} dataKey="value" nameKey="name"
                      cx="50%" cy="46%" outerRadius={95}
                      label={({ percent }) => percent > 0.05 ? `${(percent * 100).toFixed(0)}%` : ""}
                      labelLine={{ stroke: "#cbd5e1", strokeWidth: 1 }}>
                      {pieByValueData.map((_, i) => <Cell key={i} fill={PALETTE[i % PALETTE.length]} />)}
                    </Pie>
                    <Tooltip formatter={(v: number) => fmtNum(v)} />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                  </PieChart>
                </ResponsiveContainer>
              </ChartCard>
            )}

            {/* Pie — cat[1] count */}
            {pie2Data && pie2Data.length > 0 && (
              <ChartCard title={`Row count by ${categoricalCols[1]}`}>
                <ResponsiveContainer width="100%" height={280}>
                  <PieChart>
                    <Pie data={pie2Data} dataKey="value" nameKey="name"
                      cx="50%" cy="46%" outerRadius={95}
                      label={({ percent }) => percent > 0.05 ? `${(percent * 100).toFixed(0)}%` : ""}
                      labelLine={{ stroke: "#cbd5e1", strokeWidth: 1 }}>
                      {pie2Data.map((_, i) => <Cell key={i} fill={PALETTE[(i + 3) % PALETTE.length]} />)}
                    </Pie>
                    <Tooltip formatter={(v: number) => v.toLocaleString()} />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                  </PieChart>
                </ResponsiveContainer>
              </ChartCard>
            )}

            {/* Pie — cat[1] by numeric total */}
            {pie3Data && pie3Data.length > 0 && (
              <ChartCard title={`${numericCols[0]} share by ${categoricalCols[1]}`}>
                <ResponsiveContainer width="100%" height={280}>
                  <PieChart>
                    <Pie data={pie3Data} dataKey="value" nameKey="name"
                      cx="50%" cy="46%" innerRadius={50} outerRadius={95}
                      paddingAngle={3}
                      label={({ percent }) => percent > 0.05 ? `${(percent * 100).toFixed(0)}%` : ""}
                      labelLine={{ stroke: "#cbd5e1", strokeWidth: 1 }}>
                      {pie3Data.map((_, i) => <Cell key={i} fill={PALETTE[(i + 5) % PALETTE.length]} />)}
                    </Pie>
                    <Tooltip formatter={(v: number) => fmtNum(v)} />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                  </PieChart>
                </ResponsiveContainer>
              </ChartCard>
            )}
          </div>
        </Section>
      )}

      {/* ── Charts Row 4: Scatter + Radar ── */}
      {(scatterData || radarData) && (
        <Section title="Advanced Analytics" icon={
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
          </svg>
        }>
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
            {scatterData && scatterData.length > 0 && (
              <ChartCard title={`Correlation — ${numericCols[0]} vs ${numericCols[1]}`}>
                <ResponsiveContainer width="100%" height={270}>
                  <ScatterChart margin={{ top: 8, right: 16, bottom: 16, left: 8 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                    <XAxis type="number" dataKey="x" name={numericCols[0]}
                      tick={{ fontSize: 10, fill: "#94a3b8" }} tickFormatter={fmtNum}
                      label={{ value: numericCols[0], position: "insideBottom", offset: -8, fontSize: 10, fill: "#94a3b8" }} />
                    <YAxis type="number" dataKey="y" name={numericCols[1]}
                      tick={{ fontSize: 10, fill: "#94a3b8" }} tickFormatter={fmtNum} width={60}
                      label={{ value: numericCols[1], angle: -90, position: "insideLeft", fontSize: 10, fill: "#94a3b8" }} />
                    <ZAxis type="number" dataKey="z" range={[20, 200]} />
                    <Tooltip cursor={{ strokeDasharray: "3 3" }} content={({ active, payload }) => {
                      if (!active || !payload?.length) return null;
                      const d = payload[0].payload;
                      return (
                        <div className="bg-white border border-slate-200 rounded-xl shadow-lg px-3.5 py-2.5 text-sm">
                          <p className="text-slate-600"><span className="font-medium">{numericCols[0]}:</span> {fmtNum(d.x)}</p>
                          <p className="text-slate-600"><span className="font-medium">{numericCols[1]}:</span> {fmtNum(d.y)}</p>
                        </div>
                      );
                    }} />
                    <Scatter data={scatterData} fill="#6366f1" fillOpacity={0.6} />
                  </ScatterChart>
                </ResponsiveContainer>
              </ChartCard>
            )}

            {radarData && radarData.length >= 3 && (
              <ChartCard title="Metric profile — avg (normalised 0–100)">
                <ResponsiveContainer width="100%" height={270}>
                  <RadarChart data={radarData} margin={{ top: 12, right: 24, bottom: 12, left: 24 }}>
                    <PolarGrid stroke="#e2e8f0" />
                    <PolarAngleAxis dataKey="col" tick={{ fontSize: 10, fill: "#64748b" }} />
                    <PolarRadiusAxis angle={30} domain={[0, 100]} tick={{ fontSize: 9, fill: "#94a3b8" }} />
                    <Radar dataKey="value" name="Avg (normalised)" stroke="#6366f1" fill="#6366f1" fillOpacity={0.18} strokeWidth={2} />
                    <Tooltip formatter={(v: number) => `${v}%`} />
                  </RadarChart>
                </ResponsiveContainer>
              </ChartCard>
            )}
          </div>
        </Section>
      )}

      {/* ── Statistical Summary Table ── */}
      {kpis.length > 0 && (
        <Section title="Statistical Summary" icon={
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M3.375 19.5h17.25m-17.25 0a1.125 1.125 0 01-1.125-1.125M3.375 19.5h1.5C5.496 19.5 6 18.996 6 18.375m-3.75 0V5.625m0 12.75v-1.5c0-.621.504-1.125 1.125-1.125m18.375 2.625V5.625m0 12.75c0 .621-.504 1.125-1.125 1.125m1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125m0 3.75h-1.5A1.125 1.125 0 0118 18.375M20.625 4.5H3.375m17.25 0c.621 0 1.125.504 1.125 1.125M20.625 4.5h-1.5C18.504 4.5 18 5.004 18 5.625m3.75 0v1.5c0 .621-.504 1.125-1.125 1.125M3.375 4.5c-.621 0-1.125.504-1.125 1.125M3.375 4.5h1.5C5.496 4.5 6 5.004 6 5.625m-3.75 0v1.5c0 .621.504 1.125 1.125 1.125m0 0h1.5m-1.5 0c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125m1.5-3.75C6.504 8.25 7 8.754 7 9.375v1.5c0 .621-.496 1.125-1.125 1.125m-1.5-3.75c.621 0 1.125.504 1.125 1.125v1.5c0 .621-.504 1.125-1.125 1.125m0 0h1.5m0 0c.621 0 1.125.504 1.125 1.125v1.5c0 .621-.504 1.125-1.125 1.125H9m1.5-3.75c.621 0 1.125.504 1.125 1.125v1.5c0 .621-.504 1.125-1.125 1.125m0 0h-1.5" />
          </svg>
        }>
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200">
                  {["Column", "Total", "Average", "Min", "Max", "Trend"].map((h) => (
                    <th key={h} className="px-5 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {kpis.map((k, i) => (
                  <tr key={k.col} className={i % 2 === 0 ? "bg-white" : "bg-slate-50/40"}>
                    <td className="px-5 py-3 font-medium text-slate-700">{k.col}</td>
                    <td className="px-5 py-3 text-indigo-600 font-semibold">{fmtNum(k.sum)}</td>
                    <td className="px-5 py-3 text-slate-600">{fmtNum(k.avg)}</td>
                    <td className="px-5 py-3 text-emerald-600">{fmtNum(k.min)}</td>
                    <td className="px-5 py-3 text-amber-600">{fmtNum(k.max)}</td>
                    <td className="px-5 py-3">
                      <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${k.delta >= 0 ? "bg-emerald-50 text-emerald-600" : "bg-red-50 text-red-500"}`}>
                        {k.delta >= 0 ? "▲" : "▼"} {Math.abs(k.delta).toFixed(1)}%
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Section>
      )}

      {/* ── AI Narrative Report ── */}
      <Section title="AI-Generated Accountant Report" icon={
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
        </svg>
      }>
        {!narrative && !isGenerating && (
          <div className="bg-white rounded-xl border border-dashed border-indigo-300 p-8 flex flex-col items-center gap-4 text-center">
            <div className="w-14 h-14 rounded-full bg-indigo-50 flex items-center justify-center">
              <svg className="w-7 h-7 text-indigo-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
              </svg>
            </div>
            <div>
              <p className="font-semibold text-slate-700">Generate a full accountant report</p>
              <p className="text-sm text-slate-400 mt-1">Executive summary · Key findings · Risk flags · Recommendations</p>
            </div>
            <button onClick={generateNarrative}
              className="flex items-center gap-2 px-5 py-2.5 bg-indigo-600 text-white text-sm font-semibold rounded-xl hover:bg-indigo-700 transition-colors shadow-sm">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
              </svg>
              Generate Report
            </button>
          </div>
        )}

        {isGenerating && (
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-10 flex flex-col items-center gap-4">
            <svg className="w-8 h-8 text-indigo-500 animate-spin" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
            </svg>
            <p className="text-sm text-slate-500">Analysing your data with Groq AI…</p>
          </div>
        )}

        {narrativeError && (
          <div className="flex items-center gap-3 p-4 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm">
            <svg className="w-5 h-5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
            </svg>
            {narrativeError}
          </div>
        )}

        {narrative && (
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            {/* Report header bar */}
            <div className="flex items-center justify-between px-6 py-4 bg-gradient-to-r from-indigo-600 to-violet-600">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-white/20 flex items-center justify-center">
                  <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
                  </svg>
                </div>
                <div>
                  <p className="text-sm font-bold text-white">Financial Report</p>
                  <p className="text-xs text-indigo-200">
                    {fileName} · {new Date().toLocaleDateString("en-AU", { dateStyle: "long" })}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs px-2.5 py-1 bg-white/20 text-white rounded-full font-medium">
                  AI Generated
                </span>
                <button onClick={generateNarrative}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white border border-white/30 rounded-lg hover:bg-white/20 transition-colors">
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99" />
                  </svg>
                  Regenerate
                </button>
              </div>
            </div>

            {/* Section legend */}
            <div className="flex flex-wrap gap-2 px-6 py-3 bg-slate-50 border-b border-slate-100">
              {[
                { color: "bg-indigo-400", label: "Executive Summary" },
                { color: "bg-sky-400",    label: "Key Findings" },
                { color: "bg-emerald-400",label: "Financial Highlights" },
                { color: "bg-red-400",    label: "Risk Flags" },
                { color: "bg-amber-400",  label: "Recommendations" },
              ].map(({ color, label }) => (
                <span key={label} className="flex items-center gap-1.5 text-xs text-slate-500">
                  <span className={`w-2 h-2 rounded-full ${color}`} />
                  {label}
                </span>
              ))}
            </div>

            {/* Report body */}
            <div className="px-6 py-5">
              <ReportRenderer content={narrative} />
            </div>
          </div>
        )}
      </Section>
    </div>
  );
}
