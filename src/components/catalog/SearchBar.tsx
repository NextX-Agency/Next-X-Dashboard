'use client'

import { Search, X } from 'lucide-react'
import { useRef, useEffect, useState } from 'react'

interface SearchBarProps {
  value: string
  onChange: (value: string) => void
  placeholder?: string
}

export function SearchBar({ value, onChange, placeholder = 'Zoek producten...' }: SearchBarProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [isFocused, setIsFocused] = useState(false)

  // Keyboard shortcut: Cmd/Ctrl + K
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        inputRef.current?.focus()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  return (
    <div className="relative group">
      {/* Glow effect on focus */}
      <div 
        className={`absolute -inset-0.5 bg-gradient-to-r from-orange-500/20 to-orange-600/20 rounded-2xl blur-lg transition-opacity duration-300 ${
          isFocused ? 'opacity-100' : 'opacity-0'
        }`} 
      />
      
      {/* Input container */}
      <div className={`relative flex items-center bg-white/[0.04] border rounded-2xl transition-all duration-300 ${
        isFocused 
          ? 'border-orange-500/30 bg-white/[0.06]' 
          : 'border-white/[0.08] hover:border-white/[0.12] hover:bg-white/[0.05]'
      }`}>
        {/* Search icon */}
        <div className="flex-shrink-0 pl-5">
          <Search 
            size={18} 
            className={`transition-colors duration-300 ${
              isFocused ? 'text-orange-500' : 'text-neutral-500'
            }`}
            strokeWidth={1.5}
          />
        </div>
        
        {/* Input */}
        <input
          ref={inputRef}
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onFocus={() => setIsFocused(true)}
          onBlur={() => setIsFocused(false)}
          placeholder={placeholder}
          className="flex-1 bg-transparent py-4 px-4 text-sm text-white placeholder-neutral-500 focus:outline-none"
        />
        
        {/* Clear button / Keyboard shortcut */}
        <div className="flex-shrink-0 pr-4 flex items-center gap-2">
          {value ? (
            <button
              onClick={() => onChange('')}
              className="p-1.5 rounded-lg hover:bg-white/[0.06] transition-colors"
            >
              <X size={14} className="text-neutral-500" />
            </button>
          ) : (
            <kbd className="hidden sm:flex items-center gap-1 px-2 py-1 rounded-lg bg-white/[0.04] border border-white/[0.06] text-[10px] text-neutral-500 font-medium">
              <span>⌘</span>
              <span>K</span>
            </kbd>
          )}
        </div>
      </div>
    </div>
  )
}
