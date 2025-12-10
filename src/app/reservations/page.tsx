'use client'

import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { Database } from '@/types/database.types'
import { Plus, Check, X, User } from 'lucide-react'

type Client = Database['public']['Tables']['clients']['Row']
type Item = Database['public']['Tables']['items']['Row']
type Location = Database['public']['Tables']['locations']['Row']
type Reservation = Database['public']['Tables']['reservations']['Row']

interface ReservationWithDetails extends Reservation {
  clients?: Client
  items?: Item
  locations?: Location
}

export default function ReservationsPage() {
  const [clients, setClients] = useState<Client[]>([])
  const [items, setItems] = useState<Item[]>([])
  const [locations, setLocations] = useState<Location[]>([])
  const [reservations, setReservations] = useState<ReservationWithDetails[]>([])
  const [showClientForm, setShowClientForm] = useState(false)
  const [showReservationForm, setShowReservationForm] = useState(false)
  const [clientForm, setClientForm] = useState({ name: '', phone: '', email: '', notes: '' })
  const [reservationForm, setReservationForm] = useState({
    client_id: '',
    item_id: '',
    location_id: '',
    quantity: '',
    notes: ''
  })

  useEffect(() => {
    loadData()
  }, [])

  const loadData = async () => {
    const [clientsRes, itemsRes, locationsRes, reservationsRes] = await Promise.all([
      supabase.from('clients').select('*').order('name'),
      supabase.from('items').select('*').order('name'),
      supabase.from('locations').select('*').order('name'),
      supabase.from('reservations').select('*, clients(*), items(*), locations(*)').order('created_at', { ascending: false })
    ])
    
    if (clientsRes.data) setClients(clientsRes.data)
    if (itemsRes.data) setItems(itemsRes.data)
    if (locationsRes.data) setLocations(locationsRes.data)
    if (reservationsRes.data) setReservations(reservationsRes.data as any)
  }

  const handleCreateClient = async (e: React.FormEvent) => {
    e.preventDefault()
    await supabase.from('clients').insert({
      name: clientForm.name,
      phone: clientForm.phone || null,
      email: clientForm.email || null,
      notes: clientForm.notes || null
    })
    setClientForm({ name: '', phone: '', email: '', notes: '' })
    setShowClientForm(false)
    loadData()
  }

  const handleCreateReservation = async (e: React.FormEvent) => {
    e.preventDefault()
    await supabase.from('reservations').insert({
      client_id: reservationForm.client_id,
      item_id: reservationForm.item_id,
      location_id: reservationForm.location_id,
      quantity: parseInt(reservationForm.quantity),
      notes: reservationForm.notes || null,
      status: 'pending'
    })
    setReservationForm({ client_id: '', item_id: '', location_id: '', quantity: '', notes: '' })
    setShowReservationForm(false)
    loadData()
  }

  const handleUpdateStatus = async (id: string, status: 'completed' | 'cancelled') => {
    await supabase.from('reservations').update({ status }).eq('id', id)
    loadData()
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'pending': return 'bg-yellow-100 text-yellow-800'
      case 'completed': return 'bg-green-100 text-green-800'
      case 'cancelled': return 'bg-red-100 text-red-800'
      default: return 'bg-gray-100 text-gray-800'
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 pb-20">
      <div className="bg-white border-b sticky top-0 z-10">
        <div className="px-4 py-4">
          <h1 className="text-2xl font-bold">Reservations</h1>
        </div>
      </div>

      <div className="p-4 space-y-6">
        <div>
          <div className="flex justify-between items-center mb-3">
            <h2 className="text-lg font-semibold">Clients</h2>
            <button
              onClick={() => setShowClientForm(true)}
              className="bg-blue-500 text-white p-3 rounded-full shadow-lg active:scale-95 transition"
            >
              <Plus size={24} />
            </button>
          </div>

          {showClientForm && (
            <form onSubmit={handleCreateClient} className="bg-white p-4 rounded-lg shadow mb-4">
              <input
                type="text"
                value={clientForm.name}
                onChange={(e) => setClientForm({ ...clientForm, name: e.target.value })}
                placeholder="Client name"
                className="w-full p-3 border rounded-lg mb-3 text-lg"
                required
              />
              <input
                type="tel"
                value={clientForm.phone}
                onChange={(e) => setClientForm({ ...clientForm, phone: e.target.value })}
                placeholder="Phone"
                className="w-full p-3 border rounded-lg mb-3 text-lg"
              />
              <input
                type="email"
                value={clientForm.email}
                onChange={(e) => setClientForm({ ...clientForm, email: e.target.value })}
                placeholder="Email"
                className="w-full p-3 border rounded-lg mb-3 text-lg"
              />
              <textarea
                value={clientForm.notes}
                onChange={(e) => setClientForm({ ...clientForm, notes: e.target.value })}
                placeholder="Notes"
                className="w-full p-3 border rounded-lg mb-3 text-lg"
                rows={2}
              />
              <div className="flex gap-2">
                <button type="submit" className="flex-1 bg-blue-500 text-white py-3 rounded-lg font-medium">
                  Save
                </button>
                <button
                  type="button"
                  onClick={() => setShowClientForm(false)}
                  className="flex-1 bg-gray-200 py-3 rounded-lg font-medium"
                >
                  Cancel
                </button>
              </div>
            </form>
          )}

          <div className="grid grid-cols-2 gap-2">
            {clients.slice(0, 4).map((client) => (
              <div key={client.id} className="bg-white p-3 rounded-lg shadow">
                <div className="flex items-center gap-2 mb-1">
                  <User size={16} className="text-blue-500" />
                  <span className="font-semibold text-sm">{client.name}</span>
                </div>
                {client.phone && <p className="text-xs text-gray-600">{client.phone}</p>}
              </div>
            ))}
          </div>
        </div>

        <div>
          <div className="flex justify-between items-center mb-3">
            <h2 className="text-lg font-semibold">Reservations</h2>
            <button
              onClick={() => setShowReservationForm(true)}
              className="bg-green-500 text-white p-3 rounded-full shadow-lg active:scale-95 transition"
            >
              <Plus size={24} />
            </button>
          </div>

          {showReservationForm && (
            <form onSubmit={handleCreateReservation} className="bg-white p-4 rounded-lg shadow mb-4">
              <select
                value={reservationForm.client_id}
                onChange={(e) => setReservationForm({ ...reservationForm, client_id: e.target.value })}
                className="w-full p-3 border rounded-lg mb-3 text-lg"
                required
              >
                <option value="">Select Client</option>
                {clients.map((client) => (
                  <option key={client.id} value={client.id}>
                    {client.name}
                  </option>
                ))}
              </select>
              <select
                value={reservationForm.item_id}
                onChange={(e) => setReservationForm({ ...reservationForm, item_id: e.target.value })}
                className="w-full p-3 border rounded-lg mb-3 text-lg"
                required
              >
                <option value="">Select Item</option>
                {items.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
              </select>
              <select
                value={reservationForm.location_id}
                onChange={(e) => setReservationForm({ ...reservationForm, location_id: e.target.value })}
                className="w-full p-3 border rounded-lg mb-3 text-lg"
                required
              >
                <option value="">Select Location</option>
                {locations.map((loc) => (
                  <option key={loc.id} value={loc.id}>
                    {loc.name}
                  </option>
                ))}
              </select>
              <input
                type="number"
                value={reservationForm.quantity}
                onChange={(e) => setReservationForm({ ...reservationForm, quantity: e.target.value })}
                placeholder="Quantity"
                className="w-full p-3 border rounded-lg mb-3 text-lg"
                required
                min="1"
              />
              <textarea
                value={reservationForm.notes}
                onChange={(e) => setReservationForm({ ...reservationForm, notes: e.target.value })}
                placeholder="Notes"
                className="w-full p-3 border rounded-lg mb-3 text-lg"
                rows={2}
              />
              <div className="flex gap-2">
                <button type="submit" className="flex-1 bg-green-500 text-white py-3 rounded-lg font-medium">
                  Reserve
                </button>
                <button
                  type="button"
                  onClick={() => setShowReservationForm(false)}
                  className="flex-1 bg-gray-200 py-3 rounded-lg font-medium"
                >
                  Cancel
                </button>
              </div>
            </form>
          )}

          <div className="space-y-2">
            {reservations.map((reservation) => (
              <div key={reservation.id} className="bg-white p-4 rounded-lg shadow">
                <div className="flex justify-between items-start mb-2">
                  <div className="flex-1">
                    <h3 className="font-semibold">{reservation.items?.name}</h3>
                    <p className="text-sm text-gray-600">Client: {reservation.clients?.name}</p>
                    <p className="text-sm text-gray-600">Location: {reservation.locations?.name}</p>
                    <p className="text-sm text-gray-600">Quantity: {reservation.quantity}</p>
                    {reservation.notes && <p className="text-sm text-gray-600 mt-1">{reservation.notes}</p>}
                  </div>
                  <span className={`text-xs px-2 py-1 rounded ${getStatusColor(reservation.status)}`}>
                    {reservation.status}
                  </span>
                </div>
                {reservation.status === 'pending' && (
                  <div className="flex gap-2 mt-3">
                    <button
                      onClick={() => handleUpdateStatus(reservation.id, 'completed')}
                      className="flex-1 bg-green-500 text-white py-2 rounded-lg flex items-center justify-center gap-2 active:scale-95 transition"
                    >
                      <Check size={16} />
                      Complete
                    </button>
                    <button
                      onClick={() => handleUpdateStatus(reservation.id, 'cancelled')}
                      className="flex-1 bg-red-500 text-white py-2 rounded-lg flex items-center justify-center gap-2 active:scale-95 transition"
                    >
                      <X size={16} />
                      Cancel
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
