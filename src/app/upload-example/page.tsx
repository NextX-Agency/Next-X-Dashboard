'use client'

import { useState } from 'react'
import { ImageUpload } from '@/components/ImageUpload'
import { Button } from '@/components/UI'

/**
 * Example component showing how to integrate Vercel Blob image upload
 * You can use this pattern in any page that needs file uploads
 */
export default function ImageUploadExample() {
  const [imageUrl, setImageUrl] = useState<string | null>(null)
  const [productName, setProductName] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSubmitting(true)

    try {
      // Here you would save to your database
      const data = {
        name: productName,
        image_url: imageUrl,
      }

      console.log('Saving:', data)
      
      // Example: Save to Supabase
      // await supabase.from('products').insert(data)
      
      alert('Product saved successfully!')
      
      // Reset form
      setProductName('')
      setImageUrl(null)
    } catch (error) {
      console.error('Error saving:', error)
      alert('Failed to save product')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="min-h-screen p-8 bg-background">
      <div className="max-w-2xl mx-auto">
        <div className="bg-card rounded-2xl border border-border p-8 shadow-lg">
          <h1 className="text-3xl font-bold text-foreground mb-2">
            Image Upload Example
          </h1>
          <p className="text-muted-foreground mb-8">
            This example shows how to use Vercel Blob for file uploads
          </p>

          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Product Name Input */}
            <div>
              <label className="block text-sm font-semibold text-foreground mb-2">
                Product Name
              </label>
              <input
                type="text"
                value={productName}
                onChange={(e) => setProductName(e.target.value)}
                placeholder="Enter product name"
                required
                className="w-full px-4 py-3 rounded-xl border border-border bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent transition-all"
              />
            </div>

            {/* Image Upload Component */}
            <ImageUpload
              value={imageUrl}
              onChange={setImageUrl}
              folder="products"
              label="Product Image"
            />

            {/* Current Image URL Display */}
            {imageUrl && (
              <div className="p-4 rounded-xl bg-muted border border-border">
                <p className="text-sm font-semibold text-foreground mb-2">
                  Uploaded Image URL:
                </p>
                <code className="text-xs text-muted-foreground break-all">
                  {imageUrl}
                </code>
              </div>
            )}

            {/* Submit Button */}
            <Button
              type="submit"
              variant="primary"
              fullWidth
              size="lg"
              disabled={submitting || !imageUrl}
            >
              {submitting ? 'Saving...' : 'Save Product'}
            </Button>
          </form>

          {/* Integration Code Example */}
          <div className="mt-8 p-6 rounded-xl bg-muted/50 border border-border">
            <h3 className="text-lg font-bold text-foreground mb-4">
              Integration Code
            </h3>
            <pre className="text-xs text-muted-foreground overflow-x-auto">
{`import { ImageUpload } from '@/components/ImageUpload'

// In your component
const [imageUrl, setImageUrl] = useState<string | null>(null)

// In your JSX
<ImageUpload
  value={imageUrl}
  onChange={setImageUrl}
  folder="products"
  label="Product Image"
/>`}
            </pre>
          </div>

          {/* Features List */}
          <div className="mt-6 grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="p-4 rounded-xl bg-primary/5 border border-primary/20">
              <div className="text-2xl mb-2">🔒</div>
              <h4 className="font-semibold text-foreground text-sm mb-1">Secure</h4>
              <p className="text-xs text-muted-foreground">Token-based auth</p>
            </div>
            <div className="p-4 rounded-xl bg-primary/5 border border-primary/20">
              <div className="text-2xl mb-2">⚡</div>
              <h4 className="font-semibold text-foreground text-sm mb-1">Fast CDN</h4>
              <p className="text-xs text-muted-foreground">Global delivery</p>
            </div>
            <div className="p-4 rounded-xl bg-primary/5 border border-primary/20">
              <div className="text-2xl mb-2">✅</div>
              <h4 className="font-semibold text-foreground text-sm mb-1">Validated</h4>
              <p className="text-xs text-muted-foreground">5MB max, images only</p>
            </div>
            <div className="p-4 rounded-xl bg-primary/5 border border-primary/20">
              <div className="text-2xl mb-2">🎨</div>
              <h4 className="font-semibold text-foreground text-sm mb-1">Preview</h4>
              <p className="text-xs text-muted-foreground">Live image preview</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
