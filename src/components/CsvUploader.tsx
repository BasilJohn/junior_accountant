"use client";

import { useCallback, useRef, useState } from "react";
import Papa from "papaparse";
import ReactMarkdown from "react-markdown";
import ReportView from "./ReportView";

type Tab = "data" | "report";

type Row = Record<string, string>;

interface ParsedData {
  headers: string[];
  rows: Row[];
  fileName: string;
}

interface Message {
  role: "user" | "assistant";
  content: string;
  model?: string;
  fallback?: boolean;
}

const SUGGESTED_QUESTIONS = [
  "Summarise this dataset in a few sentences.",
  "What are the top 5 rows by the largest numeric value?",
  "Are there any missing or blank values?",
  "What trends or patterns do you see?",
  "Give me a financial summary of this data.",
];

export default function CsvUploader() {
  const [data, setData] = useState<ParsedData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [activeTab, setActiveTab] = useState<Tab>("data");
  const [messages, setMessages] = useState<Message[]>([]);
  const [question, setQuestion] = useState("");
  const [isAnalysing, setIsAnalysing] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const rowsPerPage = 20;
  const inputRef = useRef<HTMLInputElement>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const parseFile = useCallback((file: File) => {
    if (!file.name.endsWith(".csv")) {
      setError("Please upload a valid .csv file.");
      return;
    }
    setIsLoading(true);
    setError(null);

    Papa.parse<Row>(file, {
      header: true,
      skipEmptyLines: true,
      complete(results) {
        const headers = results.meta.fields ?? [];
        setData({ headers, rows: results.data, fileName: file.name });
        setMessages([]);
        setCurrentPage(1);
        setSearch("");
        setIsLoading(false);
      },
      error(err) {
        setError(`Failed to parse CSV: ${err.message}`);
        setIsLoading(false);
      },
    });
  }, []);

  const handleFile = useCallback(
    (file: File | null | undefined) => {
      if (!file) return;
      parseFile(file);
    },
    [parseFile]
  );

  const onDrop = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      setIsDragging(false);
      handleFile(e.dataTransfer.files[0]);
    },
    [handleFile]
  );

  const sendQuestion = useCallback(
    async (q: string) => {
      if (!data || !q.trim() || isAnalysing) return;
      const trimmed = q.trim();
      setQuestion("");
      setAiError(null);
      setMessages((prev) => [...prev, { role: "user", content: trimmed }]);
      setIsAnalysing(true);

      try {
        const res = await fetch("/api/analyze", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ question: trimmed, headers: data.headers, rows: data.rows }),
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error ?? "API error");
        setMessages((prev) => [
          ...prev,
          { role: "assistant", content: json.answer, model: json.model, fallback: json.fallback },
        ]);
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Unknown error";
        setAiError(msg);
      } finally {
        setIsAnalysing(false);
        setTimeout(() => chatEndRef.current?.scrollIntoView({ behavior: "smooth" }), 100);
      }
    },
    [data, isAnalysing]
  );

  const filteredRows = data
    ? data.rows.filter((row) =>
        Object.values(row).some((val) =>
          val.toLowerCase().includes(search.toLowerCase())
        )
      )
    : [];

  const totalPages = Math.max(1, Math.ceil(filteredRows.length / rowsPerPage));
  const paginatedRows = filteredRows.slice(
    (currentPage - 1) * rowsPerPage,
    currentPage * rowsPerPage
  );

  const handleReset = () => {
    setData(null);
    setError(null);
    setSearch("");
    setCurrentPage(1);
    setMessages([]);
    setQuestion("");
    setAiError(null);
    setActiveTab("data");
    if (inputRef.current) inputRef.current.value = "";
  };

  return (
    <div className="w-full max-w-7xl mx-auto px-4 py-10 space-y-8">
      {/* Header */}
      <header className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-indigo-600 text-white shadow-md">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 11h.01M12 11h.01M15 11h.01M4 19h16a2 2 0 002-2V7a2 2 0 00-2-2H4a2 2 0 00-2 2v10a2 2 0 002 2z" />
            </svg>
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-900 leading-tight">Junior Accountant</h1>
            <p className="text-sm text-slate-500">Upload your CSV and ask AI anything about it</p>
          </div>
        </div>
        {data && (
          <button
            onClick={handleReset}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-slate-600 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 hover:border-slate-300 transition-colors shadow-sm"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            Upload new file
          </button>
        )}
      </header>

      {/* Upload zone */}
      {!data && (
        <div
          onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={onDrop}
          onClick={() => inputRef.current?.click()}
          className={`relative flex flex-col items-center justify-center gap-4 p-14 rounded-2xl border-2 border-dashed cursor-pointer transition-all
            ${isDragging
              ? "border-indigo-500 bg-indigo-50 scale-[1.01]"
              : "border-slate-300 bg-white hover:border-indigo-400 hover:bg-indigo-50/30"
            }`}
        >
          <input
            ref={inputRef}
            type="file"
            accept=".csv"
            className="hidden"
            onChange={(e) => handleFile(e.target.files?.[0])}
          />
          <div className={`flex items-center justify-center w-16 h-16 rounded-full transition-colors ${isDragging ? "bg-indigo-100" : "bg-slate-100"}`}>
            {isLoading ? (
              <svg className="w-8 h-8 text-indigo-500 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
              </svg>
            ) : (
              <svg className={`w-8 h-8 transition-colors ${isDragging ? "text-indigo-500" : "text-slate-400"}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
              </svg>
            )}
          </div>
          <div className="text-center">
            <p className="text-base font-semibold text-slate-700">
              {isDragging ? "Drop your CSV here" : "Drag & drop your CSV file"}
            </p>
            <p className="text-sm text-slate-400 mt-1">or click to browse — .csv files only</p>
          </div>
          <span className="px-4 py-1.5 text-xs font-medium text-indigo-600 bg-indigo-50 border border-indigo-200 rounded-full">
            CSV
          </span>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="flex items-center gap-3 p-4 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm">
          <svg className="w-5 h-5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
          </svg>
          {error}
        </div>
      )}

      {/* Main content after CSV loaded */}
      {data && (
        <div className="space-y-6">

          {/* Tab bar */}
          <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-xl w-fit">
            {(["data", "report"] as Tab[]).map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg transition-all ${
                  activeTab === tab
                    ? "bg-white text-indigo-600 shadow-sm"
                    : "text-slate-500 hover:text-slate-700"
                }`}
              >
                {tab === "data" ? (
                  <>
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M3.375 19.5h17.25m-17.25 0a1.125 1.125 0 01-1.125-1.125M3.375 19.5h1.5C5.496 19.5 6 18.996 6 18.375m-3.75 0V5.625m0 12.75v-1.5c0-.621.504-1.125 1.125-1.125m18.375 2.625V5.625m0 12.75c0 .621-.504 1.125-1.125 1.125m1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125m0 3.75h-1.5A1.125 1.125 0 0118 18.375M20.625 4.5H3.375m17.25 0c.621 0 1.125.504 1.125 1.125M20.625 4.5h-1.5C18.504 4.5 18 5.004 18 5.625m3.75 0v1.5c0 .621-.504 1.125-1.125 1.125M3.375 4.5c-.621 0-1.125.504-1.125 1.125M3.375 4.5h1.5C5.496 4.5 6 5.004 6 5.625m-3.75 0v1.5c0 .621.504 1.125 1.125 1.125m0 0h1.5m-1.5 0c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125m1.5-3.75C6.504 8.25 7 8.754 7 9.375v1.5c0 .621-.496 1.125-1.125 1.125m-1.5-3.75c.621 0 1.125.504 1.125 1.125v1.5c0 .621-.504 1.125-1.125 1.125m0 0h1.5" />
                    </svg>
                    Data Table
                  </>
                ) : (
                  <>
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" />
                    </svg>
                    Report & Charts
                  </>
                )}
              </button>
            ))}
          </div>

          {/* Report tab */}
          {activeTab === "report" && (
            <ReportView headers={data.headers} rows={data.rows} fileName={data.fileName} />
          )}

          {/* Data tab */}
          {activeTab === "data" && (
        <div className="grid grid-cols-1 xl:grid-cols-[1fr_420px] gap-6 items-start">

          {/* LEFT — Table panel */}
          <div className="space-y-4">
            {/* File info bar */}
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex items-center gap-2 px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-sm text-slate-600 shadow-sm">
                <svg className="w-4 h-4 text-indigo-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
                </svg>
                <span className="font-medium text-slate-800">{data.fileName}</span>
              </div>
              <div className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-50 border border-emerald-200 rounded-lg text-sm text-emerald-700">
                <span className="font-semibold">{data.rows.length.toLocaleString()}</span> rows
              </div>
              <div className="flex items-center gap-1.5 px-3 py-1.5 bg-sky-50 border border-sky-200 rounded-lg text-sm text-sky-700">
                <span className="font-semibold">{data.headers.length}</span> columns
              </div>
              {search && (
                <div className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-700">
                  <span className="font-semibold">{filteredRows.length.toLocaleString()}</span> results
                </div>
              )}
            </div>

            {/* Search */}
            <div className="relative">
              <svg className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 15.803a7.5 7.5 0 0010.607 10.607z" />
              </svg>
              <input
                type="text"
                placeholder="Search across all columns…"
                value={search}
                onChange={(e) => { setSearch(e.target.value); setCurrentPage(1); }}
                className="w-full pl-10 pr-4 py-2.5 text-sm bg-white border border-slate-200 rounded-xl shadow-sm placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:border-transparent transition"
              />
              {search && (
                <button
                  onClick={() => { setSearch(""); setCurrentPage(1); }}
                  className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              )}
            </div>

            {/* Table */}
            <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200">
                      <th className="px-4 py-3 text-left text-xs font-semibold text-slate-400 uppercase tracking-wider w-12">#</th>
                      {data.headers.map((h) => (
                        <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider whitespace-nowrap">
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {paginatedRows.length === 0 ? (
                      <tr>
                        <td colSpan={data.headers.length + 1} className="px-4 py-12 text-center text-slate-400">
                          No rows match your search.
                        </td>
                      </tr>
                    ) : (
                      paginatedRows.map((row, i) => (
                        <tr key={i} className="hover:bg-slate-50/70 transition-colors">
                          <td className="px-4 py-2.5 text-slate-400 text-xs font-mono">
                            {(currentPage - 1) * rowsPerPage + i + 1}
                          </td>
                          {data.headers.map((h) => (
                            <td key={h} className="px-4 py-2.5 text-slate-700 whitespace-nowrap max-w-[220px] truncate" title={row[h]}>
                              {row[h] ?? "—"}
                            </td>
                          ))}
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between text-sm text-slate-500">
                <span>
                  Page <span className="font-semibold text-slate-700">{currentPage}</span> of{" "}
                  <span className="font-semibold text-slate-700">{totalPages}</span>
                </span>
                <div className="flex gap-2">
                  <button
                    onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                    disabled={currentPage === 1}
                    className="px-3 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                  >
                    ← Prev
                  </button>
                  <button
                    onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                    disabled={currentPage === totalPages}
                    className="px-3 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                  >
                    Next →
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* RIGHT — AI Chat panel */}
          <div className="flex flex-col bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden xl:sticky xl:top-6" style={{ maxHeight: "80vh" }}>
            {/* Chat header */}
            <div className="flex items-center gap-3 px-4 py-3.5 border-b border-slate-100 bg-gradient-to-r from-indigo-600 to-violet-600">
              <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-white/20">
                <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
                </svg>
              </div>
              <div>
                <p className="text-sm font-semibold text-white">AI Analysis</p>
                <p className="text-xs text-indigo-200">Powered by Groq</p>
              </div>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4 min-h-0">
              {messages.length === 0 && (
                <div className="space-y-3">
                  <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Suggested questions</p>
                  {SUGGESTED_QUESTIONS.map((q) => (
                    <button
                      key={q}
                      onClick={() => sendQuestion(q)}
                      disabled={isAnalysing}
                      className="w-full text-left px-3 py-2.5 text-sm text-slate-600 bg-slate-50 border border-slate-200 rounded-xl hover:bg-indigo-50 hover:border-indigo-300 hover:text-indigo-700 transition-colors disabled:opacity-50"
                    >
                      {q}
                    </button>
                  ))}
                </div>
              )}

              {messages.map((msg, i) => (
                <div key={i} className={`flex gap-2.5 ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                  {msg.role === "assistant" && (
                    <div className="flex-shrink-0 w-7 h-7 rounded-full bg-indigo-100 flex items-center justify-center mt-0.5">
                      <svg className="w-3.5 h-3.5 text-indigo-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
                      </svg>
                    </div>
                  )}
                  <div className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed ${
                    msg.role === "user"
                      ? "bg-indigo-600 text-white rounded-tr-sm"
                      : "bg-slate-50 border border-slate-200 text-slate-700 rounded-tl-sm"
                  }`}>
                    {msg.role === "assistant" ? (
                      <div className="prose prose-sm prose-slate max-w-none">
                        <ReactMarkdown>{msg.content}</ReactMarkdown>
                      </div>
                    ) : (
                      msg.content
                    )}
                    {msg.role === "assistant" && msg.model && (
                      <div className="mt-1.5 flex items-center gap-1.5">
                        <p className="text-xs text-slate-400 font-mono">{msg.model}</p>
                        {msg.fallback && (
                          <span className="text-xs px-1.5 py-0.5 bg-amber-100 text-amber-600 rounded font-medium">fallback</span>
                        )}
                      </div>
                    )}
                  </div>
                  {msg.role === "user" && (
                    <div className="flex-shrink-0 w-7 h-7 rounded-full bg-indigo-600 flex items-center justify-center mt-0.5">
                      <svg className="w-3.5 h-3.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
                      </svg>
                    </div>
                  )}
                </div>
              ))}

              {isAnalysing && (
                <div className="flex gap-2.5 justify-start">
                  <div className="flex-shrink-0 w-7 h-7 rounded-full bg-indigo-100 flex items-center justify-center mt-0.5">
                    <svg className="w-3.5 h-3.5 text-indigo-600 animate-spin" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                    </svg>
                  </div>
                  <div className="bg-slate-50 border border-slate-200 rounded-2xl rounded-tl-sm px-3.5 py-2.5">
                    <div className="flex gap-1 items-center h-5">
                      <span className="w-1.5 h-1.5 bg-indigo-400 rounded-full animate-bounce" style={{ animationDelay: "0ms" }} />
                      <span className="w-1.5 h-1.5 bg-indigo-400 rounded-full animate-bounce" style={{ animationDelay: "150ms" }} />
                      <span className="w-1.5 h-1.5 bg-indigo-400 rounded-full animate-bounce" style={{ animationDelay: "300ms" }} />
                    </div>
                  </div>
                </div>
              )}

              {aiError && (
                <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-xl text-red-600 text-xs">
                  <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
                  </svg>
                  {aiError}
                </div>
              )}
              <div ref={chatEndRef} />
            </div>

            {/* Input */}
            <div className="p-3 border-t border-slate-100 bg-slate-50/50">
              <div className="flex gap-2 items-end">
                <textarea
                  ref={textareaRef}
                  value={question}
                  onChange={(e) => setQuestion(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      sendQuestion(question);
                    }
                  }}
                  placeholder="Ask anything about this data…"
                  rows={1}
                  disabled={isAnalysing}
                  className="flex-1 resize-none text-sm px-3.5 py-2.5 bg-white border border-slate-200 rounded-xl placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:border-transparent transition disabled:opacity-50"
                  style={{ maxHeight: "120px" }}
                />
                <button
                  onClick={() => sendQuestion(question)}
                  disabled={!question.trim() || isAnalysing}
                  className="flex-shrink-0 w-10 h-10 flex items-center justify-center bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 12L3.269 3.126A59.768 59.768 0 0121.485 12 59.77 59.77 0 013.27 20.876L5.999 12zm0 0h7.5" />
                  </svg>
                </button>
              </div>
              <p className="mt-1.5 text-xs text-slate-400 text-center">Enter to send · Shift+Enter for new line</p>
            </div>
          </div>
        </div>
          )}
        </div>
      )}
    </div>
  );
}
