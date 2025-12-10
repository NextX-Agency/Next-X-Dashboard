import { LucideIcon } from 'lucide-react'
import { ReactNode } from 'react'

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

export function StatCard({ title, value, icon: Icon, trend, color = 'orange' }: StatCardProps) {
  const iconBgClasses = {
    orange: 'bg-gradient-to-br from-orange-500/15 to-orange-600/10 border border-orange-500/25',
    blue: 'bg-gradient-to-br from-blue-500/15 to-blue-600/10 border border-blue-500/25',
    green: 'bg-gradient-to-br from-green-500/15 to-green-600/10 border border-green-500/25',
    purple: 'bg-gradient-to-br from-purple-500/15 to-purple-600/10 border border-purple-500/25',
    red: 'bg-gradient-to-br from-red-500/15 to-red-600/10 border border-red-500/25',
  }

  const iconColorClasses = {
    orange: 'text-orange-500',
    blue: 'text-blue-500',
    green: 'text-green-500',
    purple: 'text-purple-500',
    red: 'text-red-500',
  }

  return (
    <div className="group relative bg-card rounded-2xl p-5 lg:p-6 border border-border hover:border-[hsl(var(--border-hover))] shadow-sm hover:shadow-xl transition-all duration-300 overflow-hidden">
      {/* Subtle gradient overlay on hover */}
      <div className="absolute inset-0 opacity-0 group-hover:opacity-5 transition-opacity duration-300 bg-gradient-to-br from-orange-500 to-transparent" />
      
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

interface ChartCardProps {
  title: string
  subtitle?: string
  children: ReactNode
  action?: ReactNode
  icon?: ReactNode
}

export function ChartCard({ title, subtitle, children, action, icon }: ChartCardProps) {
  return (
    <div className="bg-card rounded-2xl p-5 lg:p-6 border border-border hover:border-[hsl(var(--border-hover))] shadow-sm hover:shadow-lg transition-all duration-300">
      <div className="flex items-start justify-between mb-5 lg:mb-6">
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

interface QuickActionCardProps {
  title: string
  icon: LucideIcon
  onClick: () => void
  color?: 'orange' | 'blue' | 'green' | 'purple' | 'red' | 'teal' | 'indigo'
}

export function QuickActionCard({ title, icon: Icon, onClick, color = 'orange' }: QuickActionCardProps) {
  const colorClasses = {
    orange: 'from-orange-500 via-orange-600 to-orange-700 hover:from-orange-600 hover:via-orange-700 hover:to-orange-800 shadow-orange-500/25 hover:shadow-orange-500/40',
    blue: 'from-blue-500 via-blue-600 to-blue-700 hover:from-blue-600 hover:via-blue-700 hover:to-blue-800 shadow-blue-500/25 hover:shadow-blue-500/40',
    green: 'from-green-500 via-green-600 to-green-700 hover:from-green-600 hover:via-green-700 hover:to-green-800 shadow-green-500/25 hover:shadow-green-500/40',
    purple: 'from-purple-500 via-purple-600 to-purple-700 hover:from-purple-600 hover:via-purple-700 hover:to-purple-800 shadow-purple-500/25 hover:shadow-purple-500/40',
    red: 'from-red-500 via-red-600 to-red-700 hover:from-red-600 hover:via-red-700 hover:to-red-800 shadow-red-500/25 hover:shadow-red-500/40',
    teal: 'from-teal-500 via-teal-600 to-teal-700 hover:from-teal-600 hover:via-teal-700 hover:to-teal-800 shadow-teal-500/25 hover:shadow-teal-500/40',
    indigo: 'from-indigo-500 via-indigo-600 to-indigo-700 hover:from-indigo-600 hover:via-indigo-700 hover:to-indigo-800 shadow-indigo-500/25 hover:shadow-indigo-500/40',
  }

  return (
    <button
      onClick={onClick}
      className={`relative overflow-hidden bg-gradient-to-br ${colorClasses[color]} text-white rounded-2xl p-5 lg:p-6 shadow-lg hover:shadow-xl transition-all duration-300 active:scale-[0.97] w-full text-left group border border-white/10`}
    >
      {/* Shine effect */}
      <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent translate-x-[-200%] group-hover:translate-x-[200%] transition-transform duration-700" />
      
      <div className="relative flex flex-col gap-3">
        <div className="w-11 h-11 bg-white/20 backdrop-blur-sm rounded-xl flex items-center justify-center group-hover:scale-110 transition-transform duration-200 border border-white/25">
          <Icon size={20} className="text-white" strokeWidth={2.5} />
        </div>
        <span className="font-bold text-sm lg:text-base tracking-tight">{title}</span>
      </div>
    </button>
  )
}

interface ActivityItemProps {
  icon: LucideIcon
  title: string
  time: string
  color?: 'orange' | 'blue' | 'green' | 'purple'
}

export function ActivityItem({ icon: Icon, title, time, color = 'orange' }: ActivityItemProps) {
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

