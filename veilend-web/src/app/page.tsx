'use client'

import * as React from "react"
import Link from "next/link"
import { 
  Shield, 
  Layers, 
  Coins, 
  ArrowRight, 
  Lock, 
  EyeOff, 
  Cpu, 
  Users, 
  CheckCircle2, 
  ChevronRight,
  TrendingUp,
  Terminal
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"

export default function VeilLendLandingPage() {
  // Simulated Live Campaign Metrics for the contributor block
  const [totalContributed, setTotalContributed] = React.useState<number>(642850)
  
  React.useEffect(() => {
    const interval = setInterval(() => {
      setTotalContributed(prev => prev + Math.floor(Math.random() * 45) + 5)
    }, 4000)
    return () => clearInterval(interval)
  }, [])

  return (
    <div className="min-h-screen bg-[#030712] text-slate-100 overflow-x-hidden selection:bg-emerald-500/30 selection:text-emerald-300">
      
      {/* Decorative Cyber Grid Background & Radial Ambient Glows */}
      <div className="absolute inset-0 bg-[linear-gradient(to_right,#1f293710_1px,transparent_1px),linear-gradient(to_bottom,#1f293710_1px,transparent_1px)] bg-[size:4rem_4rem] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_0%,#000_70%,transparent_100%)] pointer-events-none" />
      <div className="absolute top-0 left-1/4 w-[500px] h-[500px] bg-indigo-500/10 rounded-full blur-[120px] pointer-events-none animate-pulse duration-[8s]" />
      <div className="absolute top-1/3 right-1/4 w-[600px] h-[600px] bg-emerald-500/5 rounded-full blur-[160px] pointer-events-none animate-pulse duration-[12s]" />

      {/* --- HERO SECTION --- */}
      <header className="relative max-w-7xl mx-auto px-6 pt-24 pb-20 sm:pt-32 sm:pb-28 text-center space-y-8">
        <div className="flex justify-center">
          <Badge variant="outline" className="bg-slate-900/80 border-slate-800 text-slate-300 px-3 py-1 flex items-center gap-2 backdrop-blur-sm shadow-sm">
            <span className="flex h-2 w-2 rounded-full bg-emerald-500 animate-ping" />
            <span className="font-semibold font-mono text-xs text-emerald-400">VeilLend Contributor Campaign Is Live</span>
          </Badge>
        </div>

        <h1 className="text-4xl sm:text-6xl lg:text-7xl font-black tracking-tight max-w-5xl mx-auto leading-[1.1] bg-clip-text text-transparent bg-gradient-to-b from-white via-slate-200 to-slate-500">
          The Next Generation of <span className="text-transparent bg-clip-text bg-gradient-to-r from-emerald-400 via-teal-400 to-indigo-500">Private Liquidity</span> on Stellar
        </h1>

        <p className="text-base sm:text-xl text-slate-400 max-w-3xl mx-auto font-medium leading-relaxed">
          VeilLend bridges standard Soroban smart contracts with advanced zero-knowledge primitives. Borrow, lend, and deploy capital seamlessly with absolute balance protection and uncompromised regulatory readiness.
        </p>

        <div className="flex flex-col sm:flex-row items-center justify-center gap-4 pt-4">
          <Button asChild size="lg" className="bg-emerald-600 hover:bg-emerald-500 text-slate-950 font-bold px-8 shadow-lg shadow-emerald-600/20 w-full sm:w-auto transition-all duration-200 hover:scale-[1.02]">
            <Link href="/campaign">Join Campaign <ArrowRight className="ml-2 h-5 w-5" /></Link>
          </Button>
          <Button asChild size="lg" variant="outline" className="border-slate-800 bg-slate-900/40 hover:bg-slate-900 text-slate-200 hover:text-white px-8 backdrop-blur-sm w-full sm:w-auto">
            <Link href="#features">Explore Architecture</Link>
          </Button>
        </div>

        {/* Dynamic Abstract Code Terminal Frame Mockup */}
        <div className="max-w-4xl mx-auto mt-16 rounded-xl border border-slate-800 bg-slate-950/60 backdrop-blur-md shadow-2xl overflow-hidden p-1 text-left hidden sm:block">
          <div className="flex items-center justify-between px-4 py-2 bg-slate-900/40 border-b border-slate-900 text-slate-500 font-mono text-xs">
            <div className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-rose-500/40" />
              <span className="w-2.5 h-2.5 rounded-full bg-amber-500/40" />
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500/40" />
              <span className="ml-2 text-slate-400 font-medium">soroban_client_initialization.rs</span>
            </div>
            <Terminal className="h-3.5 w-3.5" />
          </div>
          <div className="p-4 font-mono text-xs md:text-sm text-slate-400 space-y-1 overflow-x-auto leading-relaxed">
            <p><span className="text-indigo-400">use</span> soroban_sdk::{"{Env, Address, symbol_short};"}</p>
            <p><span className="text-indigo-400">use</span> veillend_zk_proofs::{"{verify_proof, FixedPointMath};"}</p>
            <p className="text-slate-600">// Initialize shielded vault interface configurations</p>
            <p><span className="text-emerald-400">pub fn</span> <span className="text-amber-300">execute_shielded_deposit</span>(env: Env, contributor: Address, commitment: i128) {"{"}</p>
            <p className="pl-4">assert_minimum_stroop_threshold!(commitment);</p>
            <p className="pl-4 text-teal-400">let proof_is_valid = verify_proof(&env, &contributor);</p>
            <p className="pl-4">env.storage().instance().set(&symbol_short!(<span className="text-orange-300">"status"</span>), &proof_is_valid);</p>
            <p>{"}"}</p>
          </div>
        </div>
      </header>

      {/* --- LIVE CAMPAIGN METRICS PANEL --- */}
      <section className="max-w-7xl mx-auto px-6 py-8 relative">
        <div className="bg-gradient-to-r from-slate-950 via-[#0b1329] to-slate-950 border border-slate-800/80 rounded-2xl p-8 shadow-xl grid grid-cols-1 md:grid-cols-3 gap-8 items-center text-center md:text-left">
          <div className="space-y-2">
            <div className="flex items-center justify-center md:justify-start gap-2 text-emerald-400 font-mono text-sm font-bold uppercase tracking-wider">
              <TrendingUp className="h-4 w-4" /> Live Statistics
            </div>
            <h3 className="text-xl font-bold text-slate-200">Contributor Campaign Pool</h3>
            <p className="text-sm text-slate-400">Early participants anchor the root liquidity metrics for matching asset pools.</p>
          </div>
          <div className="space-y-1 md:border-l md:border-slate-800 md:pl-8">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-widest">Total Seeded Assets</span>
            <div className="text-3xl font-black text-slate-100 font-mono">${totalContributed.toLocaleString()} <span className="text-sm font-normal text-slate-400">USDC</span></div>
          </div>
          <div className="space-y-1 md:border-l md:border-slate-800 md:pl-8">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-widest">Active Guard Handshakes</span>
            <div className="text-3xl font-black text-slate-100 font-mono">1,482 <span className="text-sm font-normal text-slate-400">Wallets</span></div>
          </div>
        </div>
      </section>

      {/* --- CORE FEATURES MATRIX --- */}
      <section id="features" className="max-w-7xl mx-auto px-6 py-20 sm:py-28 space-y-16">
        <div className="text-center space-y-4">
          <h2 className="text-3xl sm:text-5xl font-black tracking-tight">Engineered for Absolute Confidentiality</h2>
          <p className="text-slate-400 max-w-2xl mx-auto text-sm sm:text-base">
            VeilLend introduces modern mathematical structures directly into standard Soroban transactions, optimizing throughput speed while prioritizing enterprise-grade compliance layers.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Feature Card 1 */}
          <Card className="bg-slate-950/40 border-slate-800/80 backdrop-blur-sm shadow-sm hover:border-slate-700 transition-colors group">
            <CardContent className="p-8 space-y-4">
              <div className="p-3 bg-slate-900 border border-slate-800 rounded-xl text-emerald-400 w-fit group-hover:text-emerald-300 transition-colors">
                <EyeOff className="h-6 w-6" />
              </div>
              <h3 className="text-lg font-bold text-slate-200">Shielded Positions</h3>
              <p className="text-sm text-slate-400 leading-relaxed">
                Execute lending allocations and capture compounding interest rates without broadcasting your capital sizing variables or personal treasury parameters to public ledger scanners.
              </p>
            </CardContent>
          </Card>

          {/* Feature Card 2 */}
          <Card className="bg-slate-950/40 border-slate-800/80 backdrop-blur-sm shadow-sm hover:border-slate-700 transition-colors group">
            <CardContent className="p-8 space-y-4">
              <div className="p-3 bg-slate-900 border border-slate-800 rounded-xl text-indigo-400 w-fit group-hover:text-indigo-300 transition-colors">
                <Cpu className="h-6 w-6" />
              </div>
              <h3 className="text-lg font-bold text-slate-200">Soroban Optimizations</h3>
              <p className="text-sm text-slate-400 leading-relaxed">
                Built natively inside the Stellar virtual machine layer. Take advantage of deterministic transaction compute consumption fees, millisecond transaction settlement loops, and ultra-low storage footprints.
              </p>
            </CardContent>
          </Card>

          {/* Feature Card 3 */}
          <Card className="bg-slate-950/40 border-slate-800/80 backdrop-blur-sm shadow-sm hover:border-slate-700 transition-colors group">
            <CardContent className="p-8 space-y-4">
              <div className="p-3 bg-slate-900 border border-slate-800 rounded-xl text-teal-400 w-fit group-hover:text-teal-300 transition-colors">
                <Shield className="h-6 w-6" />
              </div>
              <h3 className="text-lg font-bold text-slate-200">Compliant by Design</h3>
              <p className="text-sm text-slate-400 leading-relaxed">
                Utilize view-key architecture options to effortlessly share cryptographically verifiable position tracking records with tax advisors, compliance managers, or internal regulatory systems.
              </p>
            </CardContent>
          </Card>
        </div>
      </section>

      {/* --- PROTOCOL ROADMAP MILESTONES --- */}
      <section className="max-w-5xl mx-auto px-6 py-16 sm:py-24 space-y-16">
        <div className="text-center space-y-4">
          <h2 className="text-3xl sm:text-4xl font-black tracking-tight">Development Timeline</h2>
          <p className="text-slate-400 max-w-xl mx-auto text-sm">
            Track our execution trajectory as we deploy privacy-preserving smart contract infrastructure.
          </p>
        </div>

        <div className="relative border-l border-slate-800 pl-6 ml-4 space-y-12">
          {/* Milestone item 1 */}
          <div className="relative space-y-2">
            <div className="absolute -left-[31px] top-0 p-1 bg-[#030712] rounded-full text-emerald-500">
              <CheckCircle2 className="h-5 w-5 bg-[#030712]" />
            </div>
            <div className="flex items-center gap-2">
              <span className="font-mono text-xs text-emerald-400 font-bold uppercase tracking-wider">Phase 1</span>
              <Badge variant="secondary" className="bg-emerald-500/10 text-emerald-400 border-none font-mono text-[10px]">Completed</Badge>
            </div>
            <h4 className="text-md font-bold text-slate-200">Foundational Infrastructure Core</h4>
            <p className="text-sm text-slate-400 max-w-2xl leading-relaxed">
              Established core virtual workspaces, fixed-point precision math processing engines, and early zero-knowledge circuits testing profiles.
            </p>
          </div>

          {/* Milestone item 2 */}
          <div className="relative space-y-2">
            <div className="absolute -left-[31px] top-0 p-1 bg-[#030712] rounded-full text-indigo-400">
              <span className="flex h-5 w-5 items-center justify-center rounded-full border border-indigo-500 bg-slate-950 font-mono text-[10px] font-bold text-indigo-400">2</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="font-mono text-xs text-indigo-400 font-bold uppercase tracking-wider">Phase 2</span>
              <Badge variant="secondary" className="bg-indigo-500/10 text-indigo-400 border-none font-mono text-[10px]">Active Track</Badge>
            </div>
            <h4 className="text-md font-bold text-slate-200">Contributor Campaign Launch</h4>
            <p className="text-sm text-slate-400 max-w-2xl leading-relaxed">
              Opening public interfaces to aggregate initial seed commitments for testing structural load boundaries under realistic market configurations.
            </p>
          </div>

          {/* Milestone item 3 */}
          <div className="relative space-y-2">
            <div className="absolute -left-[31px] top-0 p-1 bg-[#030712] rounded-full text-slate-600">
              <span className="flex h-5 w-5 items-center justify-center rounded-full border border-slate-800 bg-slate-950 font-mono text-[10px] font-bold text-slate-500">3</span>
            </div>
            <span className="font-mono text-xs text-slate-500 font-bold uppercase tracking-wider">Phase 3</span>
            <h4 className="text-md font-bold text-slate-400">Mainnet Smart Contract Deployment</h4>
            <p className="text-sm text-slate-500 max-w-2xl leading-relaxed">
              Full external code auditing integration tracking, public multi-asset vault provisioning, and official open liquidity governance controls initialization.
            </p>
          </div>
        </div>
      </section>

      {/* --- CTA CLOSING SUMMARY --- */}
      <section className="max-w-6xl mx-auto px-6 py-20 text-center relative">
        <div className="absolute inset-0 bg-gradient-to-t from-emerald-500/5 via-transparent to-transparent rounded-3xl pointer-events-none" />
        <div className="border border-slate-800/80 bg-slate-950/20 backdrop-blur-md rounded-3xl p-12 space-y-6 max-w-4xl mx-auto shadow-xl">
          <h2 className="text-3xl sm:text-4xl font-black tracking-tight">Ready to Secure Your Yield Pipeline?</h2>
          <p className="text-slate-400 max-w-xl mx-auto text-sm sm:text-base">
            Secure early platform allocation status metrics, qualify for priority liquidity distribution brackets, and support privacy-first decentralization.
          </p>
          <div className="pt-4">
            <Button asChild size="lg" className="bg-slate-100 hover:bg-white text-slate-950 font-bold px-8 shadow-md">
              <Link href="/campaign">Enter Contributor Dashboard <ChevronRight className="ml-1 h-4 w-4" /></Link>
            </Button>
          </div>
        </div>
      </section>

      {/* --- VISUAL FOOTER --- */}
      <footer className="max-w-7xl mx-auto px-6 py-12 border-t border-slate-900 text-center sm:text-left flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 text-xs font-mono text-slate-500">
        <div>&copy; 2026 VeilLend Protocol Ecosystem. All rights reserved.</div>
        <div className="flex justify-center gap-6">
          <Link href="#features" className="hover:text-slate-300 transition-colors">Architecture</Link>
          <a href="https://stellar.org" target="_blank" rel="noreferrer" className="hover:text-slate-300 transition-colors">Stellar Foundation</a>
          <Link href="/terms" className="hover:text-slate-300 transition-colors">Security Disclosures</Link>
        </div>
      </footer>
    </div>
  )
}