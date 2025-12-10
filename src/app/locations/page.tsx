'use client'

import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { Database } from '@/types/database.types'
import { Plus, Edit2, Trash2, MapPin } from 'lucide-react'

type Location = Database['public']['Tables']['locations']['Row']

export default function LocationsPage() {
  const [locations, setLocations] = useState<Location[]>([])
  const [showForm, setShowForm] = useState(false)
  const [editingLocation, setEditingLocation] = useState<Location | null>(null)
  const [formData, setFormData] = useState({
    name: '',
    address: ''
  })

  useEffect(() => {
    loadLocations()
  }, [])

  const loadLocations = async () => {
    const { data } = await supabase.from('locations').select('*').order('name')
    if (data) setLocations(data)
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
    <div className="min-h-screen bg-gray-50 pb-20">
      {/* Header */}
      <div className="bg-white border-b sticky top-0 z-10">
        <div className="px-4 py-4">
          <h1 className="text-2xl font-bold">Locations</h1>
        </div>
      </div>

      <div className="p-4">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-lg font-semibold">Manage Locations</h2>
          <button
            onClick={() => {
              setEditingLocation(null)
              setFormData({ name: '', address: '' })
              setShowForm(true)
            }}
            className="bg-blue-500 text-white p-3 rounded-full shadow-lg active:scale-95 transition"
          >
            <Plus size={24} />
          </button>
        </div>

        {showForm && (
          <form onSubmit={handleSubmit} className="bg-white p-4 rounded-lg shadow mb-4">
            <input
              type="text"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              placeholder="Location name"
              className="w-full p-3 border rounded-lg mb-3 text-lg"
              required
            />
            <textarea
              value={formData.address}
              onChange={(e) => setFormData({ ...formData, address: e.target.value })}
              placeholder="Address (optional)"
              className="w-full p-3 border rounded-lg mb-3 text-lg"
              rows={3}
            />
            <div className="flex gap-2">
              <button type="submit" className="flex-1 bg-blue-500 text-white py-3 rounded-lg font-medium">
                {editingLocation ? 'Update' : 'Create'}
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowForm(false)
                  setEditingLocation(null)
                }}
                className="flex-1 bg-gray-200 py-3 rounded-lg font-medium"
              >
                Cancel
              </button>
            </div>
          </form>
        )}

        <div className="space-y-2">
          {locations.map((location) => (
            <div key={location.id} className="bg-white p-4 rounded-lg shadow">
              <div className="flex justify-between items-start">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <MapPin size={20} className="text-blue-500" />
                    <h3 className="text-lg font-semibold">{location.name}</h3>
                  </div>
                  {location.address && (
                    <p className="text-sm text-gray-600 ml-7">{location.address}</p>
                  )}
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => handleEdit(location)}
                    className="text-blue-500 p-2 active:scale-95 transition"
                  >
                    <Edit2 size={20} />
                  </button>
                  <button
                    onClick={() => handleDelete(location.id)}
                    className="text-red-500 p-2 active:scale-95 transition"
                  >
                    <Trash2 size={20} />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>

        {locations.length === 0 && !showForm && (
          <div className="text-center py-12 text-gray-500">
            <MapPin size={48} className="mx-auto mb-2 opacity-50" />
            <p>No locations yet</p>
            <p className="text-sm">Tap the + button to add one</p>
          </div>
        )}
      </div>
    </div>
  )
}
