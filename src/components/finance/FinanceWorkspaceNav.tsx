import Link from 'next/link'
import { CheckSquare2, Landmark, ListChecks, ShoppingCart } from 'lucide-react'

type FinanceWorkspaceNavProps = {
  active: 'overview' | 'review' | 'close'
}

const ITEMS = [
  { id: 'purchases', href: '/purchasing', label: 'Purchases', help: 'Purchase orders and commitments', icon: ShoppingCart },
  { id: 'overview', href: '/finance', label: 'Money overview', help: 'Cash and movement', icon: Landmark },
  { id: 'review', href: '/finance/review', label: 'Resolve issues', help: 'Exceptions to fix', icon: ListChecks },
  { id: 'close', href: '/finance/close', label: 'Close month', help: 'Checklist and lock', icon: CheckSquare2 },
] as const

export function FinanceWorkspaceNav({ active }: FinanceWorkspaceNavProps) {
  return <nav aria-label="Finance workflow" className="grid gap-1 rounded-2xl border border-white/[0.08] bg-white/[0.025] p-1 sm:grid-cols-2 xl:grid-cols-4">
    {ITEMS.map((item) => {
      const Icon = item.icon
      const selected = item.id === active
      return <Link key={item.id} href={item.href} aria-current={selected ? 'page' : undefined} className={`flex items-center gap-3 rounded-xl px-3 py-2.5 transition ${selected ? 'bg-orange-400 text-[#17100b]' : 'text-slate-400 hover:bg-white/[0.06] hover:text-white'}`}>
        <Icon size={17} strokeWidth={selected ? 2.5 : 2} />
        <span><span className="block text-xs font-bold">{item.label}</span><span className={`mt-0.5 block text-[10px] ${selected ? 'text-[#17100b]/65' : 'text-slate-500'}`}>{item.help}</span></span>
      </Link>
    })}
  </nav>
}
