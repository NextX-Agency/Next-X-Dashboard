'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/lib/AuthContext'
import { 
  ChevronLeft, 
  Plus, 
  Mail, 
  Trash2, 
  Search,
  Download,
  UserPlus,
  Users,
  CheckCircle,
  XCircle,
  Calendar
} from 'lucide-react'
import Link from 'next/link'
import { PageContainer, LoadingSpinner, Modal } from '@/components/UI'
import { ConfirmDialog } from '@/components/ConfirmDialog'
import { useConfirmDialog } from '@/lib/useConfirmDialog'

interface Subscriber {
  id: string
  email: string
  name: string | null
  is_active: boolean
  subscribed_at: string
}

export default function SubscribersManagementPage() {
  const { user, loading: authLoading } = useAuth()
  const router = useRouter()
  const { dialogProps, confirm } = useConfirmDialog()
  const [subscribers, setSubscribers] = useState<Subscriber[]>([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [showAddModal, setShowAddModal] = useState(false)
  const [newSubscriber, setNewSubscriber] = useState({ email: '', name: '' })
  const [saving, setSaving] = useState(false)
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive'>('all')

  useEffect(() => {
    if (!authLoading && !user) {
      router.push('/login')
    }
  }, [user, authLoading, router])

  useEffect(() => {
    if (user) {
      loadSubscribers()
    }
  }, [user])

  const loadSubscribers = async () => {
    setLoading(true)
    try {
      const { data, error } = await supabase
        .from('subscribers')
        .select('*')
        .order('subscribed_at', { ascending: false })

      if (error) throw error
      setSubscribers(data || [])
    } catch (err) {
      console.error('Error loading subscribers:', err)
    } finally {
      setLoading(false)
    }
  }

  const addSubscriber = async () => {
    if (!newSubscriber.email.trim()) return
    setSaving(true)

    try {
      const { error } = await supabase
        .from('subscribers')
        .insert({
          email: newSubscriber.email.trim().toLowerCase(),
          name: newSubscriber.name.trim() || null,
          is_active: true
        })

      if (error) {
        if (error.code === '23505') {
          alert('This email is already subscribed')
        } else {
          throw error
        }
      } else {
        setShowAddModal(false)
        setNewSubscriber({ email: '', name: '' })
        loadSubscribers()
      }
    } catch (err) {
      console.error('Error adding subscriber:', err)
    } finally {
      setSaving(false)
    }
  }

  const toggleStatus = async (subscriber: Subscriber) => {
    try {
      const { error } = await supabase
        .from('subscribers')
        .update({ is_active: !subscriber.is_active })
        .eq('id', subscriber.id)
      if (error) throw error
      loadSubscribers()
    } catch (err) {
      console.error('Error toggling subscriber:', err)
    }
  }

  const deleteSubscriber = async (subscriber: Subscriber) => {
    const ok = await confirm({
      title: 'Remove Subscriber',
      message: 'This email will be removed from the subscriber list.',
      itemName: subscriber.email,
      itemDetails: subscriber.name || undefined,
      variant: 'danger',
      confirmLabel: 'Remove',
    })
    if (!ok) return

    try {
      const { error } = await supabase
        .from('subscribers')
        .delete()
        .eq('id', subscriber.id)
      if (error) throw error
      loadSubscribers()
    } catch (err) {
      console.error('Error deleting subscriber:', err)
    }
  }

  const exportSubscribers = () => {
    const activeSubscribers = subscribers.filter(s => s.is_active)
    const csv = [
      ['Email', 'Name', 'Subscribed Date'].join(','),
      ...activeSubscribers.map(s => [
        s.email,
        s.name || '',
        new Date(s.subscribed_at).toLocaleDateString()
      ].join(','))
    ].join('\n')

    const blob = new Blob([csv], { type: 'text/csv' })
    const url = window.URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `subscribers-${new Date().toISOString().split('T')[0]}.csv`
    a.click()
    window.URL.revokeObjectURL(url)
  }

  const filteredSubscribers = subscribers.filter(s => {
    const matchesSearch = 
      s.email.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (s.name && s.name.toLowerCase().includes(searchQuery.toLowerCase()))
    const matchesStatus = 
      statusFilter === 'all' ||
      (statusFilter === 'active' && s.is_active) ||
      (statusFilter === 'inactive' && !s.is_active)
    return matchesSearch && matchesStatus
  })

  const formatDate = (date: string) => {
    return new Date(date).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    })
  }

  if (authLoading || loading) {
    return (
      <PageContainer>
        <div className="flex items-center justify-center min-h-[60vh]">
          <LoadingSpinner />
        </div>
      </PageContainer>
    )
  }

  const activeCount = subscribers.filter(s => s.is_active).length
  const inactiveCount = subscribers.filter(s => !s.is_active).length

  return (
    <PageContainer>
      {/* Header */}
      <div className="flex items-center gap-3 lg:gap-4 mb-4 lg:mb-6">
        <Link href="/cms" className="p-2 rounded-lg bg-neutral-800 hover:bg-neutral-700 transition-colors active:scale-95">
          <ChevronLeft size={20} className="text-neutral-400" />
        </Link>
        <div className="flex-1 min-w-0">
          <h1 className="text-xl lg:text-2xl font-bold text-white truncate">Subscribers</h1>
          <p className="text-neutral-400 text-xs lg:text-sm hidden sm:block">Manage your email subscriber list</p>
        </div>
        <button
          onClick={exportSubscribers}
          className="p-2 lg:px-4 lg:py-2.5 rounded-xl bg-neutral-800 text-neutral-300 font-medium hover:bg-neutral-700 transition-colors active:scale-95"
          title="Export CSV"
        >
          <Download size={18} />
          <span className="hidden lg:inline ml-2">Export</span>
        </button>
        <button
          onClick={() => setShowAddModal(true)}
          className="flex items-center gap-1.5 lg:gap-2 px-3 lg:px-4 py-2 lg:py-2.5 rounded-xl bg-gradient-to-r from-orange-500 to-amber-500 text-white text-sm lg:text-base font-medium hover:shadow-lg hover:shadow-orange-500/25 transition-all active:scale-95"
        >
          <UserPlus size={16} className="lg:hidden" />
          <UserPlus size={18} className="hidden lg:block" />
          <span className="hidden sm:inline">Add</span>
        </button>
      </div>

      {/* Stats - Mobile Horizontal Scroll */}
      <div className="lg:hidden mb-4 -mx-4 px-4">
        <div className="flex gap-3 overflow-x-auto scrollbar-none pb-2">
          <div className="bg-neutral-900 rounded-xl p-3 border border-neutral-800 flex-shrink-0 w-[130px]">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-indigo-500/20 flex items-center justify-center">
                <Users size={16} className="text-indigo-400" />
              </div>
              <div>
                <p className="text-lg font-bold text-white">{subscribers.length}</p>
                <p className="text-[10px] text-neutral-500">Total</p>
              </div>
            </div>
          </div>
          <div className="bg-neutral-900 rounded-xl p-3 border border-neutral-800 flex-shrink-0 w-[130px]">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-emerald-500/20 flex items-center justify-center">
                <CheckCircle size={16} className="text-emerald-400" />
              </div>
              <div>
                <p className="text-lg font-bold text-white">{activeCount}</p>
                <p className="text-[10px] text-neutral-500">Active</p>
              </div>
            </div>
          </div>
          <div className="bg-neutral-900 rounded-xl p-3 border border-neutral-800 flex-shrink-0 w-[130px]">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-neutral-700/50 flex items-center justify-center">
                <XCircle size={16} className="text-neutral-400" />
              </div>
              <div>
                <p className="text-lg font-bold text-white">{inactiveCount}</p>
                <p className="text-[10px] text-neutral-500">Unsubscribed</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Stats - Desktop Grid */}
      <div className="hidden lg:grid grid-cols-2 md:grid-cols-3 gap-4 mb-6">
        <div className="bg-neutral-900 rounded-xl p-4 border border-neutral-800">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-indigo-500/20 flex items-center justify-center">
              <Users size={20} className="text-indigo-400" />
            </div>
            <div>
              <p className="text-2xl font-bold text-white">{subscribers.length}</p>
              <p className="text-xs text-neutral-500">Total Subscribers</p>
            </div>
          </div>
        </div>
        <div className="bg-neutral-900 rounded-xl p-4 border border-neutral-800">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-emerald-500/20 flex items-center justify-center">
              <CheckCircle size={20} className="text-emerald-400" />
            </div>
            <div>
              <p className="text-2xl font-bold text-white">{activeCount}</p>
              <p className="text-xs text-neutral-500">Active</p>
            </div>
          </div>
        </div>
        <div className="bg-neutral-900 rounded-xl p-4 border border-neutral-800">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-neutral-700/50 flex items-center justify-center">
              <XCircle size={20} className="text-neutral-400" />
            </div>
            <div>
              <p className="text-2xl font-bold text-white">{inactiveCount}</p>
              <p className="text-xs text-neutral-500">Unsubscribed</p>
            </div>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3 lg:gap-4 mb-4 lg:mb-6">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-500" size={18} />
          <input
            type="text"
            placeholder="Search subscribers..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full lg:max-w-md pl-10 pr-4 py-2.5 rounded-xl bg-neutral-800 border border-neutral-700 text-white placeholder-neutral-500 focus:outline-none focus:border-orange-500"
          />
        </div>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as 'all' | 'active' | 'inactive')}
          className="px-4 py-2.5 rounded-xl bg-neutral-800 border border-neutral-700 text-white focus:outline-none focus:border-orange-500"
        >
          <option value="all">All Status</option>
          <option value="active">Active</option>
          <option value="inactive">Unsubscribed</option>
        </select>
      </div>

      {/* Subscribers List */}
      {filteredSubscribers.length === 0 ? (
        <div className="text-center py-16 bg-neutral-900 rounded-2xl border border-neutral-800">
          <div className="w-16 h-16 rounded-2xl bg-neutral-800 flex items-center justify-center mx-auto mb-4">
            <Mail size={24} className="text-neutral-500" />
          </div>
          <h3 className="text-lg font-semibold text-white mb-2">
            {searchQuery || statusFilter !== 'all' ? 'No subscribers found' : 'No subscribers yet'}
          </h3>
          <p className="text-neutral-400 mb-4">
            {searchQuery || statusFilter !== 'all' 
              ? 'Try adjusting your search or filters' 
              : 'Add subscribers or enable newsletter signup on your store'}
          </p>
          {!searchQuery && statusFilter === 'all' && (
            <button
              onClick={() => setShowAddModal(true)}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-orange-500 text-white font-medium"
            >
              <UserPlus size={18} />
              Add First Subscriber
            </button>
          )}
        </div>
      ) : (
        <>
          {/* Mobile List View */}
          <div className="lg:hidden bg-neutral-900 rounded-xl border border-neutral-800 divide-y divide-neutral-800">
            {filteredSubscribers.map((subscriber) => (
              <div key={subscriber.id} className="p-3 hover:bg-neutral-800/30 transition-colors">
                <div className="flex items-start gap-3">
                  <div className="w-9 h-9 rounded-full bg-neutral-800 flex items-center justify-center flex-shrink-0">
                    <Mail size={14} className="text-neutral-500" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <span className="text-white font-medium text-sm truncate">{subscriber.email}</span>
                      <span className={`w-2 h-2 rounded-full flex-shrink-0 ${
                        subscriber.is_active ? 'bg-emerald-500' : 'bg-neutral-500'
                      }`} />
                    </div>
                    <p className="text-xs text-neutral-500">
                      {subscriber.name || 'No name'} • {formatDate(subscriber.subscribed_at)}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-1.5 mt-2 ml-12">
                  <button
                    onClick={() => toggleStatus(subscriber)}
                    className={`px-2 py-1 rounded-lg text-xs transition-colors active:scale-95 ${
                      subscriber.is_active
                        ? 'bg-emerald-500/20 text-emerald-400'
                        : 'bg-neutral-700 text-neutral-400'
                    }`}
                  >
                    {subscriber.is_active ? 'Active' : 'Inactive'}
                  </button>
                  <button
                    onClick={() => deleteSubscriber(subscriber)}
                    className="p-1.5 text-neutral-500 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors active:scale-95"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            ))}
          </div>

          {/* Desktop Table View */}
          <div className="hidden lg:block bg-neutral-900 rounded-2xl border border-neutral-800 overflow-hidden">
            <table className="w-full">
              <thead className="bg-neutral-800/50">
                <tr>
                  <th className="text-left px-5 py-3 text-xs font-semibold text-neutral-400 uppercase tracking-wider">
                    Email
                  </th>
                  <th className="text-left px-5 py-3 text-xs font-semibold text-neutral-400 uppercase tracking-wider">
                    Name
                  </th>
                  <th className="text-left px-5 py-3 text-xs font-semibold text-neutral-400 uppercase tracking-wider">
                    Date
                  </th>
                  <th className="text-left px-5 py-3 text-xs font-semibold text-neutral-400 uppercase tracking-wider">
                    Status
                  </th>
                  <th className="text-right px-5 py-3 text-xs font-semibold text-neutral-400 uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-800">
                {filteredSubscribers.map((subscriber) => (
                  <tr key={subscriber.id} className="hover:bg-neutral-800/30 transition-colors">
                    <td className="px-5 py-4">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-neutral-800 flex items-center justify-center flex-shrink-0">
                          <Mail size={14} className="text-neutral-500" />
                        </div>
                        <span className="text-white font-medium truncate">{subscriber.email}</span>
                      </div>
                    </td>
                    <td className="px-5 py-4 text-neutral-400">
                      {subscriber.name || '-'}
                    </td>
                    <td className="px-5 py-4 text-neutral-500 text-sm">
                      {formatDate(subscriber.subscribed_at)}
                  </td>
                  <td className="px-5 py-4">
                    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${
                      subscriber.is_active
                        ? 'bg-emerald-500/20 text-emerald-400'
                        : 'bg-neutral-700/50 text-neutral-400'
                    }`}>
                      {subscriber.is_active ? (
                        <>
                          <CheckCircle size={12} />
                          Active
                        </>
                      ) : (
                        <>
                          <XCircle size={12} />
                          Inactive
                        </>
                      )}
                    </span>
                  </td>
                  <td className="px-5 py-4">
                    <div className="flex items-center justify-end gap-2">
                      <button
                        onClick={() => toggleStatus(subscriber)}
                        className="p-2 rounded-lg bg-neutral-800 text-neutral-400 hover:text-white transition-colors"
                        title={subscriber.is_active ? 'Deactivate' : 'Activate'}
                      >
                        {subscriber.is_active ? <XCircle size={16} /> : <CheckCircle size={16} />}
                      </button>
                      <button
                        onClick={() => deleteSubscriber(subscriber)}
                        className="p-2 rounded-lg bg-neutral-800 text-neutral-400 hover:text-red-400 hover:bg-red-500/10 transition-colors"
                        title="Delete"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        </>
      )}

      {/* Add Subscriber Modal */}
      <Modal isOpen={showAddModal} onClose={() => setShowAddModal(false)} title="Add Subscriber">
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-neutral-300 mb-2">Email Address *</label>
            <input
              type="email"
              value={newSubscriber.email}
              onChange={(e) => setNewSubscriber(prev => ({ ...prev, email: e.target.value }))}
              placeholder="email@example.com"
              className="w-full px-4 py-2.5 rounded-xl bg-neutral-800 border border-neutral-700 text-white placeholder-neutral-500 focus:outline-none focus:border-orange-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-neutral-300 mb-2">Name (Optional)</label>
            <input
              type="text"
              value={newSubscriber.name}
              onChange={(e) => setNewSubscriber(prev => ({ ...prev, name: e.target.value }))}
              placeholder="Subscriber name"
              className="w-full px-4 py-2.5 rounded-xl bg-neutral-800 border border-neutral-700 text-white placeholder-neutral-500 focus:outline-none focus:border-orange-500"
            />
          </div>
        </div>

        <div className="flex items-center justify-end gap-3 mt-6 pt-4 border-t border-neutral-800">
          <button 
            onClick={() => setShowAddModal(false)} 
            className="px-4 py-2 text-neutral-400 hover:text-white transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={addSubscriber}
            disabled={saving || !newSubscriber.email.trim()}
            className="flex items-center gap-2 px-6 py-2.5 rounded-xl bg-gradient-to-r from-orange-500 to-amber-500 text-white font-medium disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {saving ? (
              <>
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                Adding...
              </>
            ) : (
              <>
                <UserPlus size={16} />
                Add Subscriber
              </>
            )}
          </button>
        </div>
      </Modal>
      <ConfirmDialog {...dialogProps} />
    </PageContainer>
  )
}
