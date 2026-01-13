'use client'

import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { Settings, Save, Phone, Store, DollarSign, Shield, Users, Key, Loader2, Check, AlertCircle, ExternalLink, Globe, ImageIcon, Type, FileText, Palette, Star } from 'lucide-react'
import { PageHeader, PageContainer, Button, Input, LoadingSpinner } from '@/components/UI'
import { ImageUpload } from '@/components/ImageUpload'
import { logActivity } from '@/lib/activityLog'
import { useAuth } from '@/lib/AuthContext'

interface StoreSettings {
  whatsapp_number: string
  store_name: string
  store_currency: string
  store_address: string
  store_email: string
  // Webshop settings
  store_description: string
  store_logo_url: string
  hero_title: string
  hero_subtitle: string
}

interface User {
  id: string
  email: string
  name: string | null
  role: string
  is_active: boolean
  created_at: string
  last_login_at: string | null
}

export default function SettingsPage() {
  const { user: currentUser } = useAuth()
  const [settings, setSettings] = useState<StoreSettings>({
    whatsapp_number: '',
    store_name: '',
    store_currency: 'SRD',
    store_address: '',
    store_email: '',
    // Webshop settings
    store_description: '',
    store_logo_url: '',
    hero_title: '',
    hero_subtitle: ''
  })
  const [users, setUsers] = useState<User[]>([])
  const [activeTab, setActiveTab] = useState<'store' | 'webshop' | 'users' | 'security'>('store')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saveSuccess, setSaveSuccess] = useState(false)

  // User form states
  const [showUserForm, setShowUserForm] = useState(false)
  const [editingUser, setEditingUser] = useState<User | null>(null)
  const [userForm, setUserForm] = useState({
    email: '',
    password: '',
    name: '',
    role: 'staff'
  })

  const loadSettings = async () => {
    setLoading(true)
    try {
      const { data } = await supabase.from('store_settings').select('*')
      if (data) {
        const settingsMap: Record<string, string> = {}
        data.forEach((s: { key: string; value: string }) => {
          settingsMap[s.key] = s.value
        })
        setSettings({
          whatsapp_number: settingsMap.whatsapp_number || '',
          store_name: settingsMap.store_name || '',
          store_currency: settingsMap.store_currency || 'SRD',
          store_address: settingsMap.store_address || '',
          store_email: settingsMap.store_email || '',
          // Webshop settings
          store_description: settingsMap.store_description || '',
          store_logo_url: settingsMap.store_logo_url || '',
          hero_title: settingsMap.hero_title || '',
          hero_subtitle: settingsMap.hero_subtitle || ''
        })
      }
    } catch (error) {
      console.error('Error loading settings:', error)
    }
    setLoading(false)
  }

  const loadUsers = async () => {
    try {
      const { data } = await supabase.from('users').select('*').order('created_at', { ascending: false })
      if (data) setUsers(data)
    } catch (error) {
      console.error('Error loading users:', error)
    }
  }

  useEffect(() => {
    loadSettings()
    loadUsers()
  }, [])

  const saveSettings = async () => {
    setSaving(true)
    try {
      const settingsToSave = [
        { key: 'whatsapp_number', value: settings.whatsapp_number },
        { key: 'store_name', value: settings.store_name },
        { key: 'store_currency', value: settings.store_currency },
        { key: 'store_address', value: settings.store_address },
        { key: 'store_email', value: settings.store_email },
        // Webshop settings
        { key: 'store_description', value: settings.store_description },
        { key: 'store_logo_url', value: settings.store_logo_url },
        { key: 'hero_title', value: settings.hero_title },
        { key: 'hero_subtitle', value: settings.hero_subtitle }
      ]

      for (const setting of settingsToSave) {
        await supabase
          .from('store_settings')
          .upsert({ key: setting.key, value: setting.value }, { onConflict: 'key' })
      }

      await logActivity({
        action: 'update',
        entityType: 'settings',
        entityName: 'Store Settings',
        details: 'Updated store settings'
      })

      setSaveSuccess(true)
      setTimeout(() => setSaveSuccess(false), 3000)
    } catch (error) {
      console.error('Error saving settings:', error)
    }
    setSaving(false)
  }

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    try {
      if (editingUser) {
        // Update existing user
        const updateData: Record<string, string> = {
          email: userForm.email,
          name: userForm.name,
          role: userForm.role
        }
        if (userForm.password) {
          updateData.password_hash = userForm.password // In production, hash this!
        }
        await supabase.from('users').update(updateData).eq('id', editingUser.id)
        await logActivity({
          action: 'update',
          entityType: 'seller', // Using seller as proxy for user
          entityId: editingUser.id,
          entityName: userForm.email,
          details: `Updated user: ${userForm.email}`
        })
      } else {
        // Create new user
        await supabase.from('users').insert({
          email: userForm.email,
          password_hash: userForm.password, // In production, hash this!
          name: userForm.name,
          role: userForm.role
        })
        await logActivity({
          action: 'create',
          entityType: 'seller',
          entityName: userForm.email,
          details: `Created user: ${userForm.email} (${userForm.role})`
        })
      }

      setShowUserForm(false)
      setEditingUser(null)
      setUserForm({ email: '', password: '', name: '', role: 'staff' })
      loadUsers()
    } catch (error) {
      console.error('Error saving user:', error)
    }
    setSaving(false)
  }

  const handleToggleUserActive = async (user: User) => {
    await supabase.from('users').update({ is_active: !user.is_active }).eq('id', user.id)
    loadUsers()
  }

  const handleDeleteUser = async (userId: string) => {
    if (userId === currentUser?.id) {
      alert('Cannot delete your own account')
      return
    }
    if (confirm('Are you sure you want to delete this user?')) {
      await supabase.from('users').delete().eq('id', userId)
      loadUsers()
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen">
        <PageHeader title="Settings" subtitle="Manage store settings and users" />
        <LoadingSpinner />
      </div>
    )
  }

  return (
    <div className="min-h-screen pb-20 lg:pb-0">
      <PageHeader 
        title="Settings" 
        subtitle="Manage store settings and users"
        icon={<Settings size={24} />}
      />

      <PageContainer>
        {/* Tabs */}
        <div className="flex gap-1 sm:gap-2 p-1 sm:p-1.5 bg-card rounded-2xl border border-border mb-4 sm:mb-6 overflow-x-auto scrollbar-none">
          <button
            onClick={() => setActiveTab('store')}
            className={`flex-1 min-w-fit px-3 sm:px-4 py-2.5 rounded-xl font-semibold text-xs sm:text-sm transition-all duration-200 flex items-center justify-center gap-1.5 sm:gap-2 min-h-[44px] ${
              activeTab === 'store'
                ? 'bg-primary text-white shadow-md'
                : 'text-muted-foreground hover:text-foreground hover:bg-muted'
            }`}
          >
            <Store size={16} className="sm:w-[18px] sm:h-[18px]" />
            <span>Store</span>
          </button>
          <button
            onClick={() => setActiveTab('webshop')}
            className={`flex-1 min-w-fit px-3 sm:px-4 py-2.5 rounded-xl font-semibold text-xs sm:text-sm transition-all duration-200 flex items-center justify-center gap-1.5 sm:gap-2 min-h-[44px] ${
              activeTab === 'webshop'
                ? 'bg-primary text-white shadow-md'
                : 'text-muted-foreground hover:text-foreground hover:bg-muted'
            }`}
          >
            <Globe size={16} className="sm:w-[18px] sm:h-[18px]" />
            <span>Webshop</span>
          </button>
          <button
            onClick={() => setActiveTab('users')}
            className={`flex-1 min-w-fit px-3 sm:px-4 py-2.5 rounded-xl font-semibold text-xs sm:text-sm transition-all duration-200 flex items-center justify-center gap-1.5 sm:gap-2 min-h-[44px] ${
              activeTab === 'users'
                ? 'bg-primary text-white shadow-md'
                : 'text-muted-foreground hover:text-foreground hover:bg-muted'
            }`}
          >
            <Users size={16} className="sm:w-[18px] sm:h-[18px]" />
            <span>Users</span>
          </button>
          <button
            onClick={() => setActiveTab('security')}
            className={`flex-1 min-w-fit px-3 sm:px-4 py-2.5 rounded-xl font-semibold text-xs sm:text-sm transition-all duration-200 flex items-center justify-center gap-1.5 sm:gap-2 min-h-[44px] ${
              activeTab === 'security'
                ? 'bg-primary text-white shadow-md'
                : 'text-muted-foreground hover:text-foreground hover:bg-muted'
            }`}
          >
            <Shield size={16} className="sm:w-[18px] sm:h-[18px]" />
            <span className="hidden sm:inline">Security</span>
            <span className="sm:hidden">Sec</span>
          </button>
        </div>

        {/* Store Settings Tab */}
        {activeTab === 'store' && (
          <div className="bg-card rounded-2xl border border-border p-4 sm:p-6 space-y-5 sm:space-y-6">
            <div>
              <h3 className="text-base sm:text-lg font-bold text-foreground mb-3 sm:mb-4">Store Information</h3>
              <div className="grid gap-3 sm:gap-4">
                <Input
                  label="Store Name"
                  value={settings.store_name}
                  onChange={(e) => setSettings({ ...settings, store_name: e.target.value })}
                  placeholder="My Store"
                />
                <Input
                  label="Store Address"
                  value={settings.store_address}
                  onChange={(e) => setSettings({ ...settings, store_address: e.target.value })}
                  placeholder="123 Main Street"
                />
                <Input
                  label="Store Email"
                  type="email"
                  value={settings.store_email}
                  onChange={(e) => setSettings({ ...settings, store_email: e.target.value })}
                  placeholder="contact@store.com"
                />
              </div>
            </div>

            <div className="border-t border-border pt-5 sm:pt-6">
              <h3 className="text-base sm:text-lg font-bold text-foreground mb-3 sm:mb-4 flex items-center gap-2">
                <Phone size={18} className="sm:w-5 sm:h-5 text-green-500" />
                WhatsApp Settings
              </h3>
              <div className="space-y-3 sm:space-y-4">
                <Input
                  label="WhatsApp Number"
                  type="tel"
                  inputMode="tel"
                  value={settings.whatsapp_number}
                  onChange={(e) => setSettings({ ...settings, whatsapp_number: e.target.value })}
                  placeholder="+597XXXXXXXX"
                />
                <p className="text-sm text-muted-foreground">
                  This number will be used for customer orders via WhatsApp on the public catalog.
                  Include country code (e.g., +597 for Suriname).
                </p>
                {settings.whatsapp_number && (
                  <a
                    href={`https://wa.me/${settings.whatsapp_number.replace(/[^0-9]/g, '')}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 text-green-500 hover:text-green-600"
                  >
                    <ExternalLink size={16} />
                    Test WhatsApp Link
                  </a>
                )}
              </div>
            </div>

            <div className="border-t border-border pt-5 sm:pt-6">
              <h3 className="text-base sm:text-lg font-bold text-foreground mb-3 sm:mb-4 flex items-center gap-2">
                <DollarSign size={18} className="sm:w-5 sm:h-5 text-primary" />
                Currency Settings
              </h3>
              <div className="space-y-3 sm:space-y-4">
                <div>
                  <label className="text-sm font-medium text-foreground mb-2 block">Default Currency</label>
                  <select
                    value={settings.store_currency}
                    onChange={(e) => setSettings({ ...settings, store_currency: e.target.value })}
                    className="select-field"
                  >
                    <option value="SRD">SRD - Surinamese Dollar</option>
                    <option value="USD">USD - US Dollar</option>
                  </select>
                </div>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row sm:justify-end gap-3 pt-4">
              <Button onClick={saveSettings} variant="primary" loading={saving} fullWidth className="sm:w-auto">
                {saveSuccess ? (
                  <>
                    <Check size={20} />
                    Saved!
                  </>
                ) : (
                  <>
                    <Save size={20} />
                    Save Settings
                  </>
                )}
              </Button>
            </div>
          </div>
        )}

        {/* Webshop Tab */}
        {activeTab === 'webshop' && (
          <div className="bg-card rounded-2xl border border-border p-4 sm:p-6 space-y-5 sm:space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h3 className="text-base sm:text-lg font-bold text-foreground mb-1">Webshop Content</h3>
                <p className="text-xs sm:text-sm text-muted-foreground">Manage the public catalog appearance</p>
              </div>
              <a
                href="/catalog"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 text-primary hover:text-primary/80 text-sm font-medium min-h-[44px] px-3 bg-primary/10 rounded-lg justify-center sm:justify-start"
              >
                <ExternalLink size={16} />
                Preview Webshop
              </a>
            </div>

            {/* Logo Section */}
            <div className="border-t border-border pt-5 sm:pt-6">
              <h3 className="text-base sm:text-lg font-bold text-foreground mb-3 sm:mb-4 flex items-center gap-2">
                <ImageIcon size={18} className="sm:w-5 sm:h-5 text-primary" />
                Store Logo
              </h3>
              <div className="space-y-3 sm:space-y-4">
                <ImageUpload
                  value={settings.store_logo_url}
                  onChange={(url) => setSettings({ ...settings, store_logo_url: url || '' })}
                  folder="store"
                  label="Store Logo"
                />
                <p className="text-sm text-muted-foreground">
                  Upload your store logo. For best results, use a PNG with transparent background (max 5MB).
                </p>
              </div>
            </div>

            {/* Hero Section */}
            <div className="border-t border-border pt-5 sm:pt-6">
              <h3 className="text-base sm:text-lg font-bold text-foreground mb-3 sm:mb-4 flex items-center gap-2">
                <Type size={18} className="sm:w-5 sm:h-5 text-primary" />
                Hero Section
              </h3>
              <div className="space-y-3 sm:space-y-4">
                <Input
                  label="Hero Title"
                  value={settings.hero_title}
                  onChange={(e) => setSettings({ ...settings, hero_title: e.target.value })}
                  placeholder="Welkom bij onze store"
                />
                <div>
                  <label className="text-sm font-medium text-foreground mb-2 block">Hero Subtitle</label>
                  <textarea
                    value={settings.hero_subtitle}
                    onChange={(e) => setSettings({ ...settings, hero_subtitle: e.target.value })}
                    placeholder="Ontdek ons assortiment van premium producten"
                    className="input-field min-h-[80px] sm:min-h-20 resize-y"
                    rows={3}
                  />
                </div>
                <p className="text-xs sm:text-sm text-muted-foreground">
                  The hero section is the first thing customers see when they visit your webshop.
                </p>
              </div>
            </div>

            {/* Store Description */}
            <div className="border-t border-border pt-5 sm:pt-6">
              <h3 className="text-base sm:text-lg font-bold text-foreground mb-3 sm:mb-4 flex items-center gap-2">
                <FileText size={18} className="sm:w-5 sm:h-5 text-primary" />
                Store Description
              </h3>
              <div className="space-y-3 sm:space-y-4">
                <div>
                  <label className="text-sm font-medium text-foreground mb-2 block">Description</label>
                  <textarea
                    value={settings.store_description}
                    onChange={(e) => setSettings({ ...settings, store_description: e.target.value })}
                    placeholder="Tell customers about your store, products, and what makes you unique..."
                    className="input-field min-h-[100px] sm:min-h-[120px] resize-y"
                    rows={4}
                  />
                </div>
                <p className="text-xs sm:text-sm text-muted-foreground">
                  This description can appear in various places on your webshop.
                </p>
              </div>
            </div>

            {/* Quick Tips */}
            <div className="border-t border-border pt-5 sm:pt-6">
              <h3 className="text-base sm:text-lg font-bold text-foreground mb-3 sm:mb-4 flex items-center gap-2">
                <AlertCircle size={18} className="sm:w-5 sm:h-5 text-yellow-500" />
                Webshop Tips
              </h3>
              <ul className="space-y-2 text-xs sm:text-sm text-muted-foreground">
                <li>• Mark items as &quot;Public&quot; in the Items page to show them on the webshop</li>
                <li>• Add descriptions to items to help customers understand your products</li>
                <li>• Make sure your WhatsApp number is correct for order notifications</li>
                <li>• Use high-quality product images for better customer engagement</li>
              </ul>
            </div>

            <div className="flex flex-col sm:flex-row sm:justify-end gap-3 pt-4">
              <Button onClick={saveSettings} variant="primary" loading={saving} fullWidth className="sm:w-auto">
                {saveSuccess ? (
                  <>
                    <Check size={20} />
                    Saved!
                  </>
                ) : (
                  <>
                    <Save size={20} />
                    Save Settings
                  </>
                )}
              </Button>
            </div>
          </div>
        )}

        {/* Users Tab */}
        {activeTab === 'users' && (
          <div className="space-y-4 sm:space-y-6">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
              <h3 className="text-base sm:text-lg font-bold text-foreground">Manage Users</h3>
              <Button 
                onClick={() => {
                  setEditingUser(null)
                  setUserForm({ email: '', password: '', name: '', role: 'staff' })
                  setShowUserForm(true)
                }} 
                variant="primary"
                fullWidth
                className="sm:w-auto"
              >
                Add User
              </Button>
            </div>

            <div className="bg-card rounded-2xl border border-border divide-y divide-border">
              {users.map((user) => (
                <div key={user.id} className="p-3 sm:p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="flex items-center gap-3 sm:gap-4">
                    <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                      <Users className="text-primary" size={20} />
                    </div>
                    <div className="min-w-0">
                      <p className="font-semibold text-foreground truncate">{user.name || user.email}</p>
                      <p className="text-xs sm:text-sm text-muted-foreground truncate">{user.email}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 sm:gap-3 flex-wrap pl-[52px] sm:pl-0">
                    <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                      user.role === 'admin' ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground'
                    }`}>
                      {user.role}
                    </span>
                    <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                      user.is_active ? 'bg-green-500/10 text-green-500' : 'bg-red-500/10 text-red-500'
                    }`}>
                      {user.is_active ? 'Active' : 'Inactive'}
                    </span>
                    <div className="flex gap-1 sm:gap-2 ml-auto sm:ml-0">
                      <button
                        onClick={() => {
                          setEditingUser(user)
                          setUserForm({
                            email: user.email,
                            password: '',
                            name: user.name || '',
                            role: user.role
                          })
                          setShowUserForm(true)
                        }}
                        className="text-primary hover:bg-primary/10 p-2 rounded-lg min-w-[44px] min-h-[44px] flex items-center justify-center text-sm"
                      >
                        Edit
                      </button>
                      {user.id !== currentUser?.id && (
                        <>
                          <button
                            onClick={() => handleToggleUserActive(user)}
                            className={`p-2 rounded-lg min-w-[44px] min-h-[44px] flex items-center justify-center text-sm ${
                              user.is_active ? 'text-yellow-500 hover:bg-yellow-500/10' : 'text-green-500 hover:bg-green-500/10'
                            }`}
                          >
                            {user.is_active ? 'Off' : 'On'}
                          </button>
                          <button
                            onClick={() => handleDeleteUser(user.id)}
                            className="text-red-500 hover:bg-red-500/10 p-2 rounded-lg min-w-[44px] min-h-[44px] flex items-center justify-center text-sm"
                          >
                            Del
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Security Tab */}
        {activeTab === 'security' && (
          <div className="bg-card rounded-2xl border border-border p-4 sm:p-6 space-y-5 sm:space-y-6">
            <div>
              <h3 className="text-base sm:text-lg font-bold text-foreground mb-3 sm:mb-4 flex items-center gap-2">
                <Key size={18} className="sm:w-5 sm:h-5" />
                Protected Routes
              </h3>
              <div className="space-y-2 sm:space-y-3">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between p-3 bg-muted/50 rounded-xl gap-2">
                  <div>
                    <p className="font-medium text-foreground text-sm sm:text-base">/catalog</p>
                    <p className="text-xs sm:text-sm text-muted-foreground">Public product catalog for customers</p>
                  </div>
                  <span className="px-3 py-1 rounded-full text-xs font-medium bg-green-500/10 text-green-500 w-fit">
                    Public
                  </span>
                </div>
                <div className="flex flex-col sm:flex-row sm:items-center justify-between p-3 bg-muted/50 rounded-xl gap-2">
                  <div>
                    <p className="font-medium text-foreground text-sm sm:text-base">All other routes</p>
                    <p className="text-xs sm:text-sm text-muted-foreground">Dashboard, Sales, Stock, etc.</p>
                  </div>
                  <span className="px-3 py-1 rounded-full text-xs font-medium bg-primary/10 text-primary w-fit">
                    Requires Login
                  </span>
                </div>
              </div>
            </div>

            <div className="border-t border-border pt-5 sm:pt-6">
              <h3 className="text-base sm:text-lg font-bold text-foreground mb-3 sm:mb-4 flex items-center gap-2">
                <AlertCircle size={18} className="sm:w-5 sm:h-5 text-yellow-500" />
                Security Notes
              </h3>
              <ul className="space-y-2 text-xs sm:text-sm text-muted-foreground">
                <li>• All admin routes require authentication</li>
                <li>• Only the catalog page (/catalog) is publicly accessible</li>
                <li>• User sessions are stored locally and validated on each request</li>
                <li>• For production, implement proper password hashing (bcrypt)</li>
                <li>• Consider adding rate limiting for login attempts</li>
              </ul>
            </div>
          </div>
        )}
      </PageContainer>

      {/* User Form Modal */}
      {showUserForm && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setShowUserForm(false)} />
          <div className="relative bg-card rounded-t-2xl sm:rounded-2xl shadow-xl max-w-md w-full p-4 sm:p-6 max-h-[90vh] overflow-y-auto">
            {/* Drag handle for mobile */}
            <div className="sm:hidden flex justify-center pb-2 -mt-1">
              <div className="w-10 h-1 bg-muted-foreground/30 rounded-full" />
            </div>
            <h2 className="text-lg sm:text-xl font-bold text-foreground mb-4">
              {editingUser ? 'Edit User' : 'Add User'}
            </h2>
            <form onSubmit={handleCreateUser} className="space-y-4">
              <Input
                label="Email"
                type="email"
                inputMode="email"
                autoComplete="email"
                value={userForm.email}
                onChange={(e) => setUserForm({ ...userForm, email: e.target.value })}
                required
              />
              <Input
                label={editingUser ? 'New Password (leave empty to keep current)' : 'Password'}
                type="password"
                autoComplete={editingUser ? 'new-password' : 'new-password'}
                value={userForm.password}
                onChange={(e) => setUserForm({ ...userForm, password: e.target.value })}
                required={!editingUser}
              />
              <Input
                label="Name"
                autoComplete="name"
                value={userForm.name}
                onChange={(e) => setUserForm({ ...userForm, name: e.target.value })}
              />
              <div>
                <label className="text-sm font-medium text-foreground mb-2 block">Role</label>
                <select
                  value={userForm.role}
                  onChange={(e) => setUserForm({ ...userForm, role: e.target.value })}
                  className="select-field"
                >
                  <option value="staff">Staff</option>
                  <option value="admin">Admin</option>
                </select>
              </div>
              <div className="flex flex-col sm:flex-row gap-3 pt-4">
                <Button type="submit" variant="primary" fullWidth loading={saving}>
                  {editingUser ? 'Update User' : 'Create User'}
                </Button>
                <Button type="button" variant="secondary" fullWidth onClick={() => setShowUserForm(false)}>
                  Cancel
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
