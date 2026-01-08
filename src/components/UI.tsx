export function PageHeader({ 
  title, 
  subtitle, 
  action,
  icon
}: { 
  title: string
  subtitle?: string
  action?: React.ReactNode
  icon?: React.ReactNode 
}) {
  return (
    <div className="bg-card/95 border-b border-border lg:sticky lg:top-0 z-10 backdrop-blur-sm">
      <div className="max-w-7xl mx-auto px-4 lg:px-8 py-3 lg:py-6">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            {icon && (
              <div className="hidden sm:flex w-10 h-10 rounded-xl bg-[hsl(var(--primary-muted))] items-center justify-center flex-shrink-0">
                <div className="text-primary">{icon}</div>
              </div>
            )}
            <div className="min-w-0">
              <h1 className="text-lg lg:text-2xl font-bold text-foreground tracking-tight truncate">{title}</h1>
              {subtitle && (
                <p className="text-xs lg:text-sm text-muted-foreground mt-0.5 truncate hidden sm:block">{subtitle}</p>
              )}
            </div>
          </div>
          {action && <div className="flex items-center gap-2 flex-shrink-0">{action}</div>}
        </div>
      </div>
    </div>
  )
}

export function PageContainer({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`max-w-7xl mx-auto px-4 lg:px-8 py-6 ${className}`}>
      {children}
    </div>
  )
}

export function EmptyState({ 
  icon: Icon, 
  title, 
  description,
  action
}: { 
  icon: React.ComponentType<{ size?: number; className?: string }>
  title: string
  description?: string
  action?: React.ReactNode
}) {
  return (
    <div className="empty-state">
      <Icon size={48} className="empty-state-icon" />
      <h3 className="empty-state-title">{title}</h3>
      {description && (
        <p className="empty-state-description">{description}</p>
      )}
      {action && <div className="mt-4">{action}</div>}
    </div>
  )
}

export function LoadingSpinner({ size = 'md' }: { size?: 'sm' | 'md' | 'lg' }) {
  const sizeClasses = {
    sm: 'w-4 h-4 border-2',
    md: 'w-8 h-8 border-2',
    lg: 'w-12 h-12 border-[3px]',
  }
  
  return (
    <div className="flex items-center justify-center py-12">
      <div className={`${sizeClasses[size]} border-muted-foreground/20 border-t-primary rounded-full animate-spin`} />
    </div>
  )
}

export function LoadingCard() {
  return (
    <div className="bg-card rounded-xl p-6 border border-border">
      <div className="shimmer h-4 w-24 rounded mb-3" />
      <div className="shimmer h-8 w-32 rounded mb-2" />
      <div className="shimmer h-3 w-20 rounded" />
    </div>
  )
}

export function Badge({ 
  children, 
  variant = 'default',
  className = ''
}: { 
  children: React.ReactNode
  variant?: 'default' | 'success' | 'warning' | 'danger' | 'info' | 'orange'
  className?: string
}) {
  const variants = {
    default: 'badge-neutral',
    success: 'badge-success',
    warning: 'badge-warning',
    danger: 'badge-danger',
    info: 'badge-info',
    orange: 'bg-[hsl(var(--primary-muted))] text-primary border border-primary/30',
  }

  return (
    <span className={`badge gap-1 ${variants[variant]} ${className}`}>
      {children}
    </span>
  )
}

export function Button({ 
  children, 
  variant = 'primary',
  size = 'md',
  onClick,
  type = 'button',
  disabled = false,
  loading = false,
  fullWidth = false,
  className = ''
}: { 
  children: React.ReactNode
  variant?: 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger' | 'success'
  size?: 'sm' | 'md' | 'lg'
  onClick?: () => void
  type?: 'button' | 'submit' | 'reset'
  disabled?: boolean
  loading?: boolean
  fullWidth?: boolean
  className?: string
}) {
  const variants = {
    primary: 'bg-primary hover:bg-[hsl(var(--primary-hover))] active:bg-[hsl(var(--primary-active))] text-white shadow-sm hover:shadow-md',
    secondary: 'bg-secondary hover:bg-[hsl(var(--secondary-hover))] text-foreground border border-border hover:border-[hsl(var(--border-hover))]',
    outline: 'border-2 border-primary text-primary hover:bg-primary hover:text-white',
    ghost: 'hover:bg-muted active:bg-[hsl(var(--muted-hover))] text-foreground',
    danger: 'bg-destructive hover:bg-[hsl(var(--destructive)/0.9)] active:bg-[hsl(var(--destructive)/0.8)] text-white shadow-sm hover:shadow-md',
    success: 'bg-[hsl(var(--success))] hover:bg-[hsl(var(--success)/0.9)] active:bg-[hsl(var(--success)/0.8)] text-white shadow-sm hover:shadow-md',
  }

  const sizes = {
    sm: 'px-3 py-1.5 text-xs gap-1.5',
    md: 'px-4 py-2.5 text-sm gap-2',
    lg: 'px-5 py-3 text-base gap-2',
  }

  const isDisabled = disabled || loading

  return (
    <button
      type={type}
      onClick={onClick}
      disabled={isDisabled}
      className={`
        inline-flex items-center justify-center
        ${variants[variant]}
        ${sizes[size]}
        ${fullWidth ? 'w-full' : ''}
        font-semibold rounded-xl
        transition-all duration-200
        active:scale-[0.97]
        disabled:opacity-50 disabled:cursor-not-allowed disabled:active:scale-100 disabled:hover:shadow-sm
        focus:outline-none focus:ring-2 focus:ring-primary/50 focus:ring-offset-2 focus:ring-offset-background
        ${className}
      `}
    >
      {loading && <div className="loading-spinner" style={{ width: '1rem', height: '1rem' }} />}
      {children}
    </button>
  )
}

export function Input({
  label,
  error,
  prefix,
  suffix,
  className = '',
  ...props
}: {
  label?: string
  error?: string
  prefix?: string
  suffix?: string
  className?: string
} & React.InputHTMLAttributes<HTMLInputElement>) {
  const hasAdornment = prefix || suffix
  
  return (
    <div className={className}>
      {label && <label className="input-label">{label}</label>}
      {hasAdornment ? (
        <div className="relative">
          {prefix && (
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground/60 text-xs font-medium pointer-events-none">
              {prefix}
            </span>
          )}
          <input
            {...props}
            className={`input-field ${prefix ? 'pl-16' : ''} ${suffix ? 'pr-14' : ''} ${error ? 'border-destructive focus:border-destructive focus:ring-destructive/15' : ''}`}
          />
          {suffix && (
            <span className="absolute right-4 top-1/2 -translate-y-1/2 text-muted-foreground font-medium pointer-events-none">
              {suffix}
            </span>
          )}
        </div>
      ) : (
        <input
          {...props}
          className={`input-field ${error ? 'border-destructive focus:border-destructive focus:ring-destructive/15' : ''}`}
        />
      )}
      {error && <p className="mt-1.5 text-sm text-destructive">{error}</p>}
    </div>
  )
}

export function Select({
  label,
  error,
  children,
  className = '',
  ...props
}: {
  label?: string
  error?: string
  children: React.ReactNode
  className?: string
} & React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <div className={className}>
      {label && <label className="input-label">{label}</label>}
      <select
        {...props}
        className={`select-field ${error ? 'border-destructive focus:border-destructive focus:ring-destructive/15' : ''}`}
      >
        {children}
      </select>
      {error && <p className="mt-1.5 text-sm text-destructive">{error}</p>}
    </div>
  )
}

export function Textarea({
  label,
  error,
  className = '',
  ...props
}: {
  label?: string
  error?: string
  className?: string
} & React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <div className={className}>
      {label && <label className="input-label">{label}</label>}
      <textarea
        {...props}
        className={`input-field resize-none ${error ? 'border-destructive focus:border-destructive focus:ring-destructive/15' : ''}`}
      />
      {error && <p className="mt-1.5 text-sm text-destructive">{error}</p>}
    </div>
  )
}

export function CurrencyToggle({
  value,
  onChange,
  className = ''
}: {
  value: 'SRD' | 'USD'
  onChange: (currency: 'SRD' | 'USD') => void
  className?: string
}) {
  return (
    <div className={`currency-toggle ${className}`}>
      <button
        type="button"
        onClick={() => onChange('SRD')}
        className={`currency-toggle-btn ${value === 'SRD' ? 'active' : ''}`}
      >
        SRD
      </button>
      <button
        type="button"
        onClick={() => onChange('USD')}
        className={`currency-toggle-btn ${value === 'USD' ? 'active' : ''}`}
      >
        USD
      </button>
    </div>
  )
}

export function Card({
  children,
  className = '',
  padding = true
}: {
  children: React.ReactNode
  className?: string
  padding?: boolean
}) {
  return (
    <div className={`bg-card rounded-xl border border-border ${padding ? 'p-4 lg:p-6' : ''} ${className}`}>
      {children}
    </div>
  )
}

export function StatBox({
  label,
  value,
  icon: Icon,
  trend,
  variant = 'default'
}: {
  label: string
  value: string | number
  icon?: React.ComponentType<{ size?: number; className?: string }> | React.ReactNode
  trend?: { value: string; positive: boolean }
  variant?: 'default' | 'primary' | 'success' | 'warning' | 'danger'
}) {
  const variants = {
    default: 'bg-card border-border',
    primary: 'bg-[hsl(var(--primary-muted))] border-primary/20',
    success: 'bg-[hsl(var(--success-muted))] border-success/20',
    warning: 'bg-[hsl(var(--warning-muted))] border-warning/20',
    danger: 'bg-[hsl(var(--destructive-muted))] border-destructive/20',
  }

  const iconVariants = {
    default: 'text-muted-foreground',
    primary: 'text-primary',
    success: 'text-success',
    warning: 'text-warning',
    danger: 'text-destructive',
  }

  const renderIcon = () => {
    if (!Icon) return null
    // Check if it's a component type (has a name property or is a function)
    if (typeof Icon === 'function') {
      return <Icon size={24} className={iconVariants[variant]} />
    }
    // Otherwise treat as ReactNode
    return Icon
  }

  return (
    <div className={`${variants[variant]} border rounded-xl p-4 lg:p-5`}>
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm text-muted-foreground mb-1">{label}</p>
          <p className="text-2xl lg:text-3xl font-bold text-foreground">{value}</p>
          {trend && (
            <p className={`text-xs mt-1 ${trend.positive ? 'text-success' : 'text-destructive'}`}>
              {trend.positive ? '↑' : '↓'} {trend.value}
            </p>
          )}
        </div>
        {Icon && <div>{renderIcon()}</div>}
      </div>
    </div>
  )
}

// Modal component
export function Modal({ 
  isOpen, 
  onClose, 
  title, 
  children,
  size = 'lg'
}: { 
  isOpen: boolean
  onClose: () => void
  title?: string
  children: React.ReactNode
  size?: 'sm' | 'md' | 'lg' | 'xl' | 'full'
}) {
  if (!isOpen) return null

  const sizeClasses = {
    sm: 'max-w-md',
    md: 'max-w-2xl',
    lg: 'max-w-[96vw]',
    xl: 'max-w-[98vw]',
    full: 'max-w-[99vw]'
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
      />
      
      {/* Modal */}
      <div className={`relative w-full ${sizeClasses[size]} max-h-[90vh] overflow-auto bg-card rounded-2xl shadow-xl border border-border`}>
        {title && (
          <div className="flex items-center justify-between p-4 lg:p-6 border-b border-border">
            <h2 className="text-lg font-semibold text-foreground">{title}</h2>
            <button
              onClick={onClose}
              className="p-2 rounded-lg hover:bg-muted transition-colors"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="18" y1="6" x2="6" y2="18"></line>
                <line x1="6" y1="6" x2="18" y2="18"></line>
              </svg>
            </button>
          </div>
        )}
        <div className={title ? 'p-4 lg:p-6' : 'p-4 lg:p-6'}>
          {children}
        </div>
      </div>
    </div>
  )
}

