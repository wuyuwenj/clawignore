"use client";

import { useState } from "react";
import Script from "next/script";
import { Icon } from "./components/Icon";

export default function Home() {
  const [copied, setCopied] = useState(false);

  const copyCode = () => {
    navigator.clipboard.writeText("npx clawignore");
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <>
      <Script src="https://code.iconify.design/iconify-icon/1.0.7/iconify-icon.min.js" />

      {/* Background Effects */}
      <div className="fixed inset-0 pointer-events-none z-0">
        <div className="absolute inset-0 bg-grid opacity-[0.07]"></div>
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full max-w-3xl h-[500px] bg-claw-glow blur-[120px] rounded-full opacity-40"></div>
      </div>

      {/* Navigation */}
      <nav className="fixed top-0 w-full z-50 border-b border-white/5 bg-surface/80 backdrop-blur-md">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          {/* Logo */}
          <a href="#" className="flex items-center gap-3 group">
            <span className="text-2xl group-hover:scale-110 transition-transform duration-300">🦞</span>
            <span className="font-medium text-lg tracking-tight text-white group-hover:text-claw transition-colors">Clawignore</span>
          </a>

          {/* Links */}
          <div className="flex items-center gap-6 text-sm font-medium">
            <span className="hidden sm:flex items-center gap-2 text-slate-500 cursor-not-allowed">
              <Icon icon="solar:book-bookmark-linear" width={18} />
              Docs
            </span>
            <a href="https://github.com/wuyuwenj/clawignore" target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 hover:text-white transition-colors">
              <Icon icon="mdi:github" width={18} />
              <span className="hidden sm:inline">GitHub</span>
            </a>
            <a href="https://www.npmjs.com/package/clawignore" target="_blank" rel="noopener noreferrer" className="hidden sm:flex items-center gap-2 hover:text-white transition-colors">
              <Icon icon="solar:box-linear" width={18} />
              NPM
            </a>
          </div>
        </div>
      </nav>

      <main className="relative z-10 flex flex-col items-center justify-center pt-32 pb-20 px-6 max-w-7xl mx-auto">

        {/* Hero Section */}
        <div className="text-center max-w-3xl mx-auto space-y-6 animate-fade-in">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-claw/20 bg-claw/5 text-claw text-xs font-medium tracking-wide mb-2">
            <Icon icon="solar:shield-check-linear" width={16} />
            SECURE YOUR AGENTS
          </div>

          <h1 className="text-5xl md:text-7xl font-semibold tracking-tight text-white leading-[1.1]">
            Block sensitive files from <br className="hidden md:block" />
            <span className="bg-clip-text text-transparent bg-gradient-to-r from-white via-slate-200 to-slate-500">AI agent access.</span>
          </h1>

          <p className="text-lg md:text-xl text-slate-400 max-w-2xl mx-auto leading-relaxed">
            Protect your API keys, company data, and credentials from OpenClaw with an interactive, Docker-enforced security wizard.
          </p>

          {/* CTA: Code Copy */}
          <div className="mt-10 flex flex-col items-center gap-4">
            <div className="relative group cursor-pointer" onClick={copyCode}>
              <div className="absolute -inset-0.5 bg-gradient-to-r from-claw/50 to-purple-600/50 rounded-lg blur opacity-20 group-hover:opacity-60 transition duration-500"></div>
              <div className="relative flex items-center bg-black border border-white/10 rounded-lg px-4 py-3 min-w-[300px] md:min-w-[400px]">
                <span className="text-claw mr-3 select-none">$</span>
                <code className="font-mono text-sm text-slate-200 flex-1 text-left">npx clawignore</code>
                <button className="ml-4 text-slate-500 group-hover:text-white transition-colors" aria-label="Copy to clipboard">
                  {copied ? (
                    <Icon icon="solar:check-circle-linear" width={20} className="text-green-400" />
                  ) : (
                    <Icon icon="solar:copy-linear" width={20} />
                  )}
                </button>
              </div>
            </div>
            <span className="text-xs text-slate-500 font-mono">v1.0.0 • MIT License</span>
          </div>
        </div>

        {/* Terminal Section */}
        <div className="w-full mt-20 md:mt-28 relative">
          {/* Glow behind terminal */}
          <div className="absolute inset-0 bg-claw blur-[100px] opacity-10 rounded-full scale-75 z-0"></div>

          <div className="relative z-10 w-full max-w-3xl mx-auto rounded-xl overflow-hidden shadow-2xl border border-white/10 bg-[#0F0F0F]">
            {/* Terminal Header */}
            <div className="flex items-center px-4 py-3 bg-[#1A1A1A] border-b border-white/5">
              <div className="flex gap-2">
                <div className="w-3 h-3 rounded-full bg-[#FF5F56]"></div>
                <div className="w-3 h-3 rounded-full bg-[#FFBD2E]"></div>
                <div className="w-3 h-3 rounded-full bg-[#27C93F]"></div>
              </div>
              <div className="flex-1 text-center text-xs text-slate-500 font-medium font-sans opacity-60">clawignore — zsh — 80x24</div>
            </div>

            {/* Terminal Body */}
            <div className="p-6 font-mono text-xs md:text-sm text-slate-300 leading-relaxed overflow-x-auto terminal-scroll">
              <div className="whitespace-pre">
                <span className="text-claw font-bold">🦞 Clawignore Setup</span>
                {"\n"}
                <span className="text-slate-600">────────────────────────────────────────────────────────────</span>
                {"\n"}
                <span className="text-slate-400">Select files/folders to HIDE from OpenClaw:</span>
                {"\n"}
                <span className="text-slate-500">  (Selected items will NOT be accessible to the AI)</span>
                {"\n"}
                <span className="text-yellow-500">  ⚠️  17 sensitive files auto-detected and pre-selected</span>
                {"\n"}
                <span className="text-slate-600 text-[10px] mt-1 block mb-4">↑/↓ navigate • space toggle • → expand • ← collapse • enter confirm</span>
                {"\n\n"}
                <span className="text-blue-400 font-bold">📁 /Users/joedoe</span>
                {"\n\n"}
                <span className="text-slate-600"> ↑ more above</span>
                {"\n"}
                <span className="text-slate-500">◯ 📁 qqq/</span>
                {"\n"}
                <span className="text-slate-500">◯ 📁 settings/</span>
                {"\n"}
                <span className="text-slate-500">◯ 📁 venv/</span>
                {"\n"}
                <span className="text-claw font-bold">◉ 📄 .gitconfig</span>
                <span className="text-red-500 font-bold bg-red-500/10 px-1 rounded ml-2">[SENSITIVE]</span>
                {"\n"}
                <span className="text-slate-500">◯ 📄 package.json</span>
                {"\n"}
                <span className="text-claw font-bold">◉ 📄 company-financials-2024.xlsx</span>
                <span className="text-red-500 font-bold bg-red-500/10 px-1 rounded ml-2">[SENSITIVE]</span>
                {"\n\n"}
                <span className="text-claw mt-2 block">18 hidden from OpenClaw</span>
                {"\n\n"}
                <span className="animate-pulse text-slate-500">Press enter to confirm</span>
                <span className="animate-blink bg-slate-500 w-2 h-4 inline-block align-middle ml-1"></span>
                {"\n\n"}
                <span className="text-slate-600 block mt-4">│</span>
                {"\n"}
                <span className="text-green-400">◆  14 folders will be accessible to OpenClaw</span>
                {"\n"}
                <span className="text-slate-600">│</span>
                {"\n"}
                <span className="text-red-400">◆  17 items will be HIDDEN</span>
                {"\n"}
                <span className="text-slate-600">│</span>
                {"\n"}
                <span className="text-blue-400">◇  Docker configuration generated</span>
                {"\n"}
                <span className="text-slate-600">│</span>
                {"\n"}
                <span className="text-claw">└  Your secrets are now protected!</span>
              </div>
            </div>
          </div>
        </div>

        {/* Features Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-24 md:mt-32 w-full">

          {/* Feature 1 */}
          <div className="group p-8 rounded-2xl bg-white/[0.02] border border-white/5 hover:border-claw/30 hover:bg-white/[0.04] transition-all duration-300">
            <div className="w-12 h-12 rounded-lg bg-claw/10 flex items-center justify-center text-claw mb-6 group-hover:scale-110 transition-transform">
              <Icon icon="solar:magnifer-linear" width={24} />
            </div>
            <h3 className="text-lg font-medium text-white mb-3 tracking-tight">Auto-Detects Secrets</h3>
            <p className="text-slate-400 text-sm leading-relaxed">
              Instantly finds environment files, private keys, and credentials on your machine before the AI can read them.
            </p>
          </div>

          {/* Feature 2 */}
          <div className="group p-8 rounded-2xl bg-white/[0.02] border border-white/5 hover:border-claw/30 hover:bg-white/[0.04] transition-all duration-300">
            <div className="w-12 h-12 rounded-lg bg-claw/10 flex items-center justify-center text-claw mb-6 group-hover:scale-110 transition-transform">
              <Icon icon="solar:shield-keyhole-linear" width={24} />
            </div>
            <h3 className="text-lg font-medium text-white mb-3 tracking-tight">Docker Enforced</h3>
            <p className="text-slate-400 text-sm leading-relaxed">
              Modifies <code className="bg-white/10 px-1 py-0.5 rounded text-xs font-mono">docker-compose.yml</code> to ensure blocked files are never mounted into the AI&apos;s container runtime.
            </p>
          </div>

          {/* Feature 3 */}
          <div className="group p-8 rounded-2xl bg-white/[0.02] border border-white/5 hover:border-claw/30 hover:bg-white/[0.04] transition-all duration-300">
            <div className="w-12 h-12 rounded-lg bg-claw/10 flex items-center justify-center text-claw mb-6 group-hover:scale-110 transition-transform">
              <Icon icon="solar:tuning-square-2-linear" width={24} />
            </div>
            <h3 className="text-lg font-medium text-white mb-3 tracking-tight">Interactive UI</h3>
            <p className="text-slate-400 text-sm leading-relaxed">
              Easily toggle files and folders with an intuitive arrow-key interface. Re-run anytime to update your configuration.
            </p>
          </div>

        </div>

      </main>

      {/* Footer */}
      <footer className="border-t border-white/5 mt-20 bg-surface">
        <div className="max-w-7xl mx-auto px-6 py-12 flex flex-col md:flex-row items-center justify-between gap-6">
          <div className="flex flex-col md:items-start items-center gap-2">
            <div className="flex items-center gap-2">
              <span className="text-xl">🦞</span>
              <span className="text-sm font-medium text-white">Clawignore</span>
            </div>
            <p className="text-xs text-slate-500">Security for the age of AI agents.</p>
          </div>

          <div className="flex items-center gap-6">
            <span className="text-xs text-slate-600">Built for OpenClaw</span>
            <span className="text-xs text-slate-600">© 2026</span>
          </div>
        </div>
      </footer>
    </>
  );
}
