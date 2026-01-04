'use client'

import { useState, useRef, useEffect } from 'react'
import Image from 'next/image'
import { Upload, X, Loader2, ImageIcon } from 'lucide-react'
import { Button } from './UI'

interface ImageUploadProps {
  value?: string | null
  onChange: (url: string | null) => void
  folder?: string
  label?: string
  className?: string
}

export function ImageUpload({ value, onChange, folder = 'items', label = 'Product Image', className = '' }: ImageUploadProps) {
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [preview, setPreview] = useState<string | null>(value || null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Sync preview with value prop when it changes (important for editing existing items)
  useEffect(() => {
    setPreview(value || null)
  }, [value])

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    setError(null)
    
    // Validate file size (5MB max)
    const maxSize = 5 * 1024 * 1024
    if (file.size > maxSize) {
      setError('File size must be less than 5MB')
      return
    }

    // Validate file type
    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif']
    if (!allowedTypes.includes(file.type)) {
      setError('Only JPEG, PNG, WebP, and GIF images are allowed')
      return
    }

    // Show preview
    const reader = new FileReader()
    reader.onloadend = () => {
      setPreview(reader.result as string)
    }
    reader.readAsDataURL(file)

    // Upload to Vercel Blob
    setUploading(true)
    try {
      const formData = new FormData()
      formData.append('file', file)
      formData.append('folder', folder)

      const response = await fetch('/api/upload', {
        method: 'POST',
        body: formData,
      })

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || 'Failed to upload image')
      }

      const data = await response.json()
      onChange(data.url)
      setPreview(data.url)
    } catch (err) {
      console.error('Upload error:', err)
      setError(err instanceof Error ? err.message : 'Failed to upload image')
      setPreview(null)
    } finally {
      setUploading(false)
    }
  }

  const handleRemove = () => {
    setPreview(null)
    onChange(null)
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }

  const handleClick = () => {
    fileInputRef.current?.click()
  }

  return (
    <div className={`space-y-2 ${className}`}>
      <label className="block text-sm font-semibold text-foreground mb-2">{label}</label>
      
      <div className="relative">
        {preview ? (
          <div className="relative w-full aspect-video rounded-xl overflow-hidden border-2 border-border bg-muted group">
            <Image
              src={preview}
              alt="Preview"
              fill
              className="object-cover"
              unoptimized
            />
            <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
              <Button
                type="button"
                onClick={handleClick}
                variant="secondary"
                size="sm"
                disabled={uploading}
              >
                <Upload size={16} />
                Change
              </Button>
              <Button
                type="button"
                onClick={handleRemove}
                variant="ghost"
                size="sm"
                className="text-destructive hover:text-destructive hover:bg-destructive/10"
                disabled={uploading}
              >
                <X size={16} />
                Remove
              </Button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            onClick={handleClick}
            disabled={uploading}
            className="w-full aspect-video rounded-xl border-2 border-dashed border-border hover:border-primary/50 bg-muted hover:bg-muted/80 transition-all flex flex-col items-center justify-center gap-3 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed group"
          >
            {uploading ? (
              <>
                <Loader2 className="animate-spin text-primary" size={32} />
                <p className="text-sm text-muted-foreground">Uploading...</p>
              </>
            ) : (
              <>
                <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center group-hover:bg-primary/20 transition-colors">
                  <ImageIcon className="text-primary" size={24} />
                </div>
                <div className="text-center">
                  <p className="text-sm font-semibold text-foreground">Click to upload image</p>
                  <p className="text-xs text-muted-foreground mt-1">PNG, JPG, WebP or GIF (max 5MB)</p>
                </div>
              </>
            )}
          </button>
        )}
        
        <input
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/gif"
          onChange={handleFileSelect}
          className="hidden"
          disabled={uploading}
        />
      </div>

      {error && (
        <div className="flex items-center gap-2 p-3 rounded-lg bg-destructive/10 border border-destructive/20">
          <X className="text-destructive flex-shrink-0" size={16} />
          <p className="text-sm text-destructive">{error}</p>
        </div>
      )}
    </div>
  )
}
