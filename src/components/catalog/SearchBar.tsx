'use client'

import { Search, X, Sparkles } from 'lucide-react'
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
      {/* Glowing border effect */}
      <div 
        className={`absolute -inset-[1px] bg-[#f97015] rounded-2xl transition-opacity duration-500 ${isFocused ? 'opacity-100' : 'opacity-0'}`} 
      />
      
      {/* Input container */}
      <div className={`relative flex items-center bg-neutral-900 border rounded-2xl transition-all duration-300 ${isFocused ? 'border-transparent shadow-2xl shadow-[#f97015]/20' : 'border-white/10 hover:border-white/20'}`}>
        {/* Search icon */}
        <div className="shrink-0 pl-5">
          <Search 
            size={20} 
            className={`transition-all duration-300 ${isFocused ? 'text-[#f97015] scale-110' : 'text-neutral-500'}`}
            strokeWidth={2}
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
          className="flex-1 bg-transparent py-4 px-4 text-sm text-white placeholder-neutral-500 focus:outline-none font-medium"
        />
        
        {/* Clear button / Keyboard shortcut */}
        <div className="shrink-0 pr-5 flex items-center gap-3">
          {value ? (
            <button
              onClick={() => onChange('')}
              className="p-2 rounded-xl bg-white/5 hover:bg-white/10 transition-colors"
            >
              <X size={14} className="text-neutral-400" />
            </button>
          ) : (
            <kbd className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 text-[11px] text-neutral-400 font-bold">
              <span>⌘</span>
              <span>K</span>
            </kbd>
          )}
        </div>
      </div>
    </div>
  )
}
