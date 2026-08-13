import { LucideIcon } from 'lucide-react'
import { ReactNode, memo } from 'react'

interface StatCardProps {
  title: string
  value: string | number
  icon: LucideIcon
  trend?: {
    value: string
    isPositive: boolean
  }
  color?: 'orange' | 'blue' | 'green' | 'purple' | 'red'
}

function StatCardComponent({ title, value, icon: Icon, trend, color = 'orange' }: StatCardProps) {
  const iconBgClasses = {
    orange: 'bg-orange-400/10 border border-orange-400/20',
    blue: 'bg-sky-400/10 border border-sky-400/20',
    green: 'bg-emerald-400/10 border border-emerald-400/20',
    purple: 'bg-violet-400/10 border border-violet-400/20',
    red: 'bg-rose-400/10 border border-rose-400/20',
  }

  const iconColorClasses = {
    orange: 'text-orange-300',
    blue: 'text-sky-300',
    green: 'text-emerald-300',
    purple: 'text-violet-300',
    red: 'text-rose-300',
  }

  return (
    <div className="group relative bg-card rounded-2xl p-4 lg:p-5 border border-border hover:border-[hsl(var(--border-hover))] shadow-[0_12px_30px_rgba(0,0,0,0.12)] transition-all duration-300 overflow-hidden">
      <div className="absolute inset-x-5 top-0 h-px bg-white/0 transition group-hover:bg-orange-300/40" />
      
      <div className="relative flex items-start justify-between">
        <div className="flex-1 min-w-0">
          <p className="text-xs text-muted-foreground font-semibold mb-2 tracking-wide uppercase">{title}</p>
          <h3 className="text-2xl lg:text-3xl font-bold text-foreground mb-2.5 tracking-tight">{value}</h3>
          {trend && (
            <div className="flex items-center gap-2">
              <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-bold ${trend.isPositive ? 'bg-green-950/50 text-green-400 border border-green-800' : 'bg-red-950/50 text-red-400 border border-red-800'}`}>
                {trend.isPositive ? '↑' : '↓'} {trend.value}
              </span>
              <span className="text-xs text-muted-foreground font-medium hidden sm:inline">vs last period</span>
            </div>
          )}
        </div>
        <div className={`w-12 h-12 lg:w-14 lg:h-14 rounded-2xl ${iconBgClasses[color]} flex items-center justify-center shadow-sm flex-shrink-0 ml-3 group-hover:scale-105 transition-transform`}>
          <Icon size={24} className={iconColorClasses[color]} strokeWidth={2} />
        </div>
      </div>
    </div>
  )
}

export const StatCard = memo(StatCardComponent)

interface ChartCardProps {
  title: string
  subtitle?: string
  children: ReactNode
  action?: ReactNode
  icon?: ReactNode
}

function ChartCardComponent({ title, subtitle, children, action, icon }: ChartCardProps) {
  return (
    <div className="bg-card rounded-2xl p-4 lg:p-5 border border-border hover:border-[hsl(var(--border-hover))] shadow-[0_12px_30px_rgba(0,0,0,0.12)] transition-all duration-300">
      <div className="flex items-start justify-between mb-4 lg:mb-5">
        <div className="flex items-center gap-3">
          {icon && (
            <div className="w-10 h-10 rounded-xl bg-[hsl(var(--primary-muted))] flex items-center justify-center">
              <div className="text-primary">{icon}</div>
            </div>
          )}
          <div>
            <h3 className="text-lg font-bold text-foreground tracking-tight">{title}</h3>
            {subtitle && <p className="text-sm text-muted-foreground mt-0.5">{subtitle}</p>}
          </div>
        </div>
        {action}
      </div>
      <div>{children}</div>
    </div>
  )
}

export const ChartCard = memo(ChartCardComponent)

interface QuickActionCardProps {
  title: string
  icon: LucideIcon
  onClick: () => void
  color?: 'orange' | 'blue' | 'green' | 'purple' | 'red' | 'teal' | 'indigo'
}

function QuickActionCardComponent({ title, icon: Icon, onClick, color = 'orange' }: QuickActionCardProps) {
  const colorClasses = {
    orange: 'bg-orange-400 hover:bg-orange-300 text-[#17100b] shadow-orange-500/15 hover:shadow-orange-500/25',
    blue: 'bg-sky-500 hover:bg-sky-400 text-white shadow-sky-500/15 hover:shadow-sky-500/25',
    green: 'bg-emerald-500 hover:bg-emerald-400 text-white shadow-emerald-500/15 hover:shadow-emerald-500/25',
    purple: 'bg-violet-500 hover:bg-violet-400 text-white shadow-violet-500/15 hover:shadow-violet-500/25',
    red: 'bg-rose-500 hover:bg-rose-400 text-white shadow-rose-500/15 hover:shadow-rose-500/25',
    teal: 'bg-teal-500 hover:bg-teal-400 text-white shadow-teal-500/15 hover:shadow-teal-500/25',
    indigo: 'bg-indigo-500 hover:bg-indigo-400 text-white shadow-indigo-500/15 hover:shadow-indigo-500/25',
  }

  return (
    <button
      onClick={onClick}
      className={`relative overflow-hidden ${colorClasses[color]} rounded-2xl p-4 lg:p-5 shadow-lg hover:shadow-xl transition-all duration-300 active:scale-[0.97] w-full text-left group border border-white/10`}
    >
      {/* Shine effect */}
      <div className="absolute inset-x-5 top-0 h-px bg-white/40" />
      
      <div className="relative flex flex-col gap-3">
        <div className="w-11 h-11 bg-white/20 backdrop-blur-sm rounded-xl flex items-center justify-center group-hover:scale-110 transition-transform duration-200 border border-white/25">
          <Icon size={20} className="text-white" strokeWidth={2.5} />
        </div>
        <span className="font-bold text-sm lg:text-base tracking-tight">{title}</span>
      </div>
    </button>
  )
}

export const QuickActionCard = memo(QuickActionCardComponent)

interface ActivityItemProps {
  icon: LucideIcon
  title: string
  time: string
  color?: 'orange' | 'blue' | 'green' | 'purple'
}

function ActivityItemComponent({ icon: Icon, title, time, color = 'orange' }: ActivityItemProps) {
  const colorClasses = {
    orange: 'bg-orange-950/50 text-orange-400 border border-orange-800/50',
    blue: 'bg-blue-950/50 text-blue-400 border border-blue-800/50',
    green: 'bg-green-950/50 text-green-400 border border-green-800/50',
    purple: 'bg-purple-950/50 text-purple-400 border border-purple-800/50',
  }

  return (
    <div className="flex items-center gap-3 p-3 hover:bg-muted/50 rounded-xl transition-colors group cursor-default">
      <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${colorClasses[color]} group-hover:scale-105 transition-transform`}>
        <Icon size={16} />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-foreground truncate">{title}</p>
        <p className="text-xs text-muted-foreground">{time}</p>
      </div>
    </div>
  )
}

export const ActivityItem = memo(ActivityItemComponent)

