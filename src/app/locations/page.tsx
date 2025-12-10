'use client'

import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { Database } from '@/types/database.types'
import { Plus, MapPin } from 'lucide-react'
import { PageHeader, PageContainer, Button } from '@/components/UI'
import { LocationCard, Modal } from '@/components/PageCards'

type Location = Database['public']['Tables']['locations']['Row']
type Stock = Database['public']['Tables']['stock']['Row']

export default function LocationsPage() {
  const [locations, setLocations] = useState<Location[]>([])
  const [stock, setStock] = useState<Stock[]>([])
  const [showForm, setShowForm] = useState(false)
  const [editingLocation, setEditingLocation] = useState<Location | null>(null)
  const [formData, setFormData] = useState({
    name: '',
    address: ''
  })

  useEffect(() => {
    loadLocations()
    loadStock()
  }, [])

  const loadLocations = async () => {
    const { data } = await supabase.from('locations').select('*').order('name')
    if (data) setLocations(data)
  }

  const loadStock = async () => {
    const { data } = await supabase.from('stock').select('*')
    if (data) setStock(data)
  }

  const getLocationItemCount = (locationId: string) => {
    return stock.filter(s => s.location_id === locationId && s.quantity > 0).length
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const data = {
      name: formData.name,
      address: formData.address || null
    }

    if (editingLocation) {
      await supabase.from('locations').update(data).eq('id', editingLocation.id)
    } else {
      await supabase.from('locations').insert(data)
    }

    setFormData({ name: '', address: '' })
    setShowForm(false)
    setEditingLocation(null)
    loadLocations()
  }

  const handleEdit = (location: Location) => {
    setEditingLocation(location)
    setFormData({
      name: location.name,
      address: location.address || ''
    })
    setShowForm(true)
  }

  const handleDelete = async (id: string) => {
    if (confirm('Delete this location? This will also delete all associated stock.')) {
      await supabase.from('locations').delete().eq('id', id)
      loadLocations()
    }
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <PageHeader 
        title="Locations" 
        subtitle="Manage warehouse and store locations"
        action={
          <Button 
            onClick={() => {
              setEditingLocation(null)
              setFormData({ name: '', address: '' })
              setShowForm(true)
            }} 
            variant="primary"
          >
            <Plus size={20} />
            <span className="hidden sm:inline">New Location</span>
          </Button>
        }
      />

      <PageContainer>
        {locations.length === 0 ? (
          <div className="text-center py-12 text-gray-500">
            <MapPin size={48} className="mx-auto mb-4 opacity-50" />
            <p>No locations yet. Create your first location!</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {locations.map((location) => (
              <LocationCard
                key={location.id}
                name={location.name}
                address={location.address}
                itemCount={getLocationItemCount(location.id)}
                onEdit={() => handleEdit(location)}
                onDelete={() => handleDelete(location.id)}
              />
            ))}
          </div>
        )}
      </PageContainer>

      {/* Location Modal */}
      <Modal 
        isOpen={showForm} 
        onClose={() => {
          setShowForm(false)
          setEditingLocation(null)
        }} 
        title={editingLocation ? 'Edit Location' : 'Create Location'}
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Location Name</label>
            <input
              type="text"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              placeholder="Enter location name"
              className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-orange-500 focus:border-orange-500 transition"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Address (Optional)</label>
            <textarea
              value={formData.address}
              onChange={(e) => setFormData({ ...formData, address: e.target.value })}
              placeholder="Enter full address"
              className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-orange-500 focus:border-orange-500 transition"
              rows={3}
            />
          </div>
          <Button type="submit" variant="primary" fullWidth size="lg">
            {editingLocation ? 'Update Location' : 'Create Location'}
          </Button>
        </form>
      </Modal>
    </div>
  )
}
