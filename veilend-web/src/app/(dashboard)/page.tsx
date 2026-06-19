'use client'

import * as React from "react"
import { 
  Wallet, 
  ShieldAlert, 
  ArrowUpRight, 
  ArrowDownLeft, 
  Layers, 
  Coins, 
  Activity, 
  RefreshCw, 
  Info
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Progress } from "@/components/ui/progress"
import { Skeleton } from "@/components/ui/skeleton"

export default function VeilLendDashboard() {
  // Global simulation states to demonstrate acceptance criteria loading/empty loops
  const [isLoading, setIsLoading] = React.useState<boolean>(false)
  const [isEmpty, setIsEmpty] = React.useState<boolean>(false)

  const handleRefreshSimulation = () => {
    setIsLoading(true)
    setTimeout(() => setIsLoading(false), 1200)
  }

  return (
    <div className="p-4 sm:p-8 space-y-8 max-w-7xl mx-auto text-slate-100 min-h-screen">
      
      {/* Dashboard Top Management Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b border-slate-800 pb-6">
        <div>
          <h1 className="text-2xl sm:text-3xl font-black tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-white via-slate-200 to-slate-400">
            Privacy Vault Command
          </h1>
          <p className="text-sm text-slate-400 mt-1">
            Monitor shield variables, collateral ratios, and active Soroban smart credit allocations.
          </p>
        </div>
        
        {/* Interactive Simulation Controls Area */}
        <div className="flex flex-wrap items-center gap-2 bg-slate-950/60 p-1.5 border border-slate-800 rounded-xl backdrop-blur-sm">
          <Button 
            variant="ghost" 
            size="sm" 
            onClick={() => setIsEmpty(!isEmpty)}
            className={`text-xs font-mono transition-colors ${isEmpty ? 'bg-amber-500/10 text-amber-400' : 'text-slate-400'}`}
          >
            Toggle Empty State
          </Button>
          <Button 
            variant="outline" 
            size="sm" 
            onClick={handleRefreshSimulation}
            disabled={isLoading}
            className="border-slate-800 bg-slate-900/40 text-xs font-mono h-8"
          >
            <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${isLoading ? 'animate-spin' : ''}`} />
            Sync Ledger
          </Button>
        </div>
      </div>

      {/* --- LAYER 1: PROTOCOL RISK ENGINE OVERVIEW --- */}
      {!isEmpty && !isLoading && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card className="bg-slate-950/40 border-slate-800/80 shadow-sm backdrop-blur-sm">
            <CardHeader className="pb-2">
              <CardDescription className="text-xs uppercase font-mono tracking-widest text-slate-500">Net Account Value</CardDescription>
              <CardTitle className="text-2xl font-black font-mono text-emerald-400">$124,500.00 <span className="text-xs font-normal text-slate-400">USDC</span></CardTitle>
            </CardHeader>
          </Card>
          <Card className="bg-slate-950/40 border-slate-800/80 shadow-sm backdrop-blur-sm">
            <CardHeader className="pb-2">
              <CardDescription className="text-xs uppercase font-mono tracking-widest text-slate-500">Collateral Factor Health</CardDescription>
              <CardTitle className="text-2xl font-black font-mono text-indigo-400">78.4%</CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              {/* Uses arbitrary nested selection [&>div]: to style inner Radix progress indicators directly */}
              <Progress value={78.4} className="h-1.5 bg-slate-900 [&>div]:bg-indigo-500" />
            </CardContent>
          </Card>
          <Card className="bg-slate-950/40 border-slate-800/80 shadow-sm backdrop-blur-sm">
            <CardHeader className="pb-2">
              <CardDescription className="text-xs uppercase font-mono tracking-widest text-slate-500">Current Borrow Limit Utilization</CardDescription>
              <CardTitle className="text-2xl font-black font-mono text-amber-500">42.1%</CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              {/* Uses arbitrary nested selection [&>div]: to style inner Radix progress indicators directly */}
              <Progress value={42.1} className="h-1.5 bg-slate-900 [&>div]:bg-amber-500" />
            </CardContent>
          </Card>
        </div>
      )}

      {/* --- LAYER 2: PRIMARY DATA GRIDS --- */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        
        {/* SECTION A: SHIELDED ASSET BALANCES */}
        <Card className="bg-slate-950/20 border-slate-800 backdrop-blur-sm">
          <CardHeader className="border-b border-slate-900 pb-4">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base font-bold flex items-center gap-2">
                <Coins className="h-4 w-4 text-emerald-400" /> Shielded Liquidity Balances
              </CardTitle>
              <Badge variant="outline" className="font-mono text-[10px] bg-slate-900 border-slate-800 text-slate-400">USDC / XLM Only</Badge>
            </div>
            <CardDescription className="text-xs">Your current unencumbered assets residing within zero-knowledge layers.</CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            {isLoading ? (
              <div className="p-6 space-y-4">
                <Skeleton className="h-12 w-full bg-slate-900" />
                <Skeleton className="h-12 w-full bg-slate-900" />
              </div>
            ) : isEmpty ? (
              <div className="p-12 text-center space-y-3">
                <div className="mx-auto w-10 h-10 rounded-full bg-slate-900 flex items-center justify-center text-slate-600 border border-slate-800">
                  <Wallet className="h-5 w-5" />
                </div>
                <p className="text-xs text-slate-500 max-w-xs mx-auto">No shielded assets detected. Initialize a private transfer payload sequence to populate your balance limits.</p>
              </div>
            ) : (
              <div className="divide-y divide-slate-900">
                <div className="p-4 sm:p-6 flex items-center justify-between hover:bg-slate-900/10 transition-colors">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400 font-mono text-xs font-bold">U</div>
                    <div>
                      <div className="text-sm font-bold text-slate-200">USD Coin (Stellar Asset)</div>
                      <div className="text-xs font-mono text-slate-500">USDC</div>
                    </div>
                  </div>
                  <div className="text-right font-mono">
                    <div className="text-sm font-bold text-slate-200">150,000.00</div>
                    <div className="text-xs text-slate-500">$150,000.00</div>
                  </div>
                </div>
                <div className="p-4 sm:p-6 flex items-center justify-between hover:bg-slate-900/10 transition-colors">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400 font-mono text-xs font-bold">X</div>
                    <div>
                      <div className="text-sm font-bold text-slate-200">Native Lumens</div>
                      <div className="text-xs font-mono text-slate-500">XLM</div>
                    </div>
                  </div>
                  <div className="text-right font-mono">
                    <div className="text-sm font-bold text-slate-200">85,400.00</div>
                    <div className="text-xs text-slate-500">$11,102.00</div>
                  </div>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* SECTION B: COLLATERAL & CREDIT BORROWING TRACKS */}
        <Card className="bg-slate-950/20 border-slate-800 backdrop-blur-sm">
          <CardHeader className="border-b border-slate-900 pb-4">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base font-bold flex items-center gap-2">
                <Layers className="h-4 w-4 text-indigo-400" /> Debt & Collateralized Ratios
              </CardTitle>
              <Badge variant="outline" className="font-mono text-[10px] bg-slate-900 border-slate-800 text-slate-400">Risk Engine</Badge>
            </div>
            <CardDescription className="text-xs">Active debt obligations measured against locked credit collateral pools.</CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            {isLoading ? (
              <div className="p-6 space-y-4">
                <Skeleton className="h-28 w-full bg-slate-900" />
              </div>
            ) : isEmpty ? (
              <div className="p-12 text-center space-y-3">
                <div className="mx-auto w-10 h-10 rounded-full bg-slate-900 flex items-center justify-center text-slate-600 border border-slate-800">
                  <ShieldAlert className="h-5 w-5" />
                </div>
                <p className="text-xs text-slate-500 max-w-xs mx-auto">No current leverage parameters active. Lock collateral into a private Soroban contract framework to open lines of credit.</p>
              </div>
            ) : (
              <div className="p-4 sm:p-6 space-y-6">
                <div className="bg-slate-950/60 border border-slate-900 rounded-xl p-4 flex justify-between items-center">
                  <div className="space-y-1">
                    <span className="text-[11px] uppercase font-mono font-bold text-slate-500 tracking-wider">Total Collateral Deposited</span>
                    <div className="text-lg font-black font-mono text-slate-200">$50,000.00</div>
                  </div>
                  <div className="space-y-1 text-right">
                    <span className="text-[11px] uppercase font-mono font-bold text-slate-500 tracking-wider">Active Borrowed Liabilities</span>
                    <div className="text-lg font-black font-mono text-slate-300">$21,050.00</div>
                  </div>
                </div>

                <div className="space-y-3">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-slate-400 flex items-center gap-1.5 font-medium">
                      <Info className="h-3.5 w-3.5 text-slate-500" /> Liquidation Point Safeguard Matrix
                    </span>
                    <span className="font-mono font-bold text-rose-400">85.00% Max Threshold</span>
                  </div>
                  <div className="relative">
                    {/* Employs a linear gradient across child elements using an arbitrary utility chain */}
                    <Progress value={42.1} className="h-2 bg-slate-900 [&>div]:bg-gradient-to-r [&>div]:from-emerald-500 [&>div]:to-amber-500" />
                    <div className="absolute left-[85%] top-[-4px] h-4 w-[2px] bg-rose-500/80 z-10" title="Liquidation Bar" />
                  </div>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* --- LAYER 3: REAL-TIME CRYPTOGRAPHIC ACTIVITY LOGS --- */}
      <Card className="bg-slate-950/20 border-slate-800 backdrop-blur-sm">
        <CardHeader className="border-b border-slate-900 pb-4">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base font-bold flex items-center gap-2">
              <Activity className="h-4 w-4 text-teal-400" /> Cryptographic Ledger Audit Log
            </CardTitle>
            <span className="text-xs font-mono text-slate-500">Live Handshakes Stream</span>
          </div>
          <CardDescription className="text-xs">Real-time status tracking of structural interactions across the VeilLend core.</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-6 space-y-3">
              <Skeleton className="h-8 w-full bg-slate-900" />
              <Skeleton className="h-8 w-full bg-slate-900" />
            </div>
          ) : isEmpty ? (
            <div className="p-12 text-center space-y-2 text-xs text-slate-500 font-medium">
              No historical zero-knowledge proof evaluations or balance mutations exist on this account scope.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm border-collapse">
                <thead>
                  <tr className="bg-slate-950/40 font-mono text-[11px] font-bold text-slate-500 uppercase tracking-wider border-b border-slate-900">
                    <th className="p-4 pl-6">Operation Action</th>
                    <th className="p-4">Execution Status</th>
                    <th className="p-4 font-mono text-right pr-6">Block Sequence</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-900/60 font-medium text-xs">
                  <tr className="hover:bg-slate-900/10 transition-colors">
                    <td className="p-4 pl-6 flex items-center gap-2 text-slate-300">
                      <ArrowDownLeft className="h-3.5 w-3.5 text-emerald-500" /> Shielded Balance Allocation Inbound
                    </td>
                    <td className="p-4">
                      <Badge className="bg-emerald-500/10 hover:bg-emerald-500/10 border-none text-emerald-400 font-mono text-[10px] font-bold">ZK_PROOF_VERIFIED</Badge>
                    </td>
                    <td className="p-4 font-mono text-right text-slate-500 pr-6">#5829141</td>
                  </tr>
                  <tr className="hover:bg-slate-900/10 transition-colors">
                    <td className="p-4 pl-6 flex items-center gap-2 text-slate-300">
                      <ArrowUpRight className="h-3.5 w-3.5 text-indigo-400" /> Collateral Lock Allocation Call
                    </td>
                    <td className="p-4">
                      <Badge className="bg-indigo-500/10 hover:bg-indigo-500/10 border-none text-indigo-400 font-mono text-[10px] font-bold">SOROBAN_SUCCESS</Badge>
                    </td>
                    <td className="p-4 font-mono text-right text-slate-500 pr-6">#5829023</td>
                  </tr>
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}