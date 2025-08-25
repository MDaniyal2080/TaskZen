'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Separator } from '@/components/ui/separator'
import { useAuthStore } from '@/store/auth'
import { toast } from 'react-hot-toast'
import {
  Settings, Shield, AlertTriangle,
  ToggleLeft, Save, Download, Upload,
  Wrench, CreditCard, Mail
} from 'lucide-react'
import { api } from '@/lib/api'
import { useSettings } from '@/contexts/SettingsContext'

interface SystemSettings {
  general: {
    siteName: string
    maxBoardsPerUser: number
    maxCardsPerBoard: number
    maxFileSize: number
  }
  features: {
    enableRegistration: boolean
    enableRealTimeUpdates: boolean
    enableFileUploads: boolean
    enableComments: boolean
    enablePublicBoards: boolean
    enableAnalytics: boolean
  }
  security: {
    requireEmailVerification: boolean
    enableTwoFactor: boolean
    sessionTimeout: number
    passwordMinLength: number
    maxLoginAttempts: number
    enableRateLimiting: boolean
    rateLimitRequests: number
    rateLimitWindow: number
  }
  maintenance: {
    enabled: boolean
    message: string
    scheduledAt?: string
    estimatedDuration?: number
  }
  email: {
    enabled: boolean
    provider: string
    fromEmail: string
    fromName: string
    smtpHost: string
    smtpPort: number
    smtpUser: string
    smtpPassword?: string
    templates: {
      welcome: boolean
      passwordReset: boolean
      emailVerification: boolean
      subscription: boolean
    }
  }
  payments: {
    enabled: boolean
    provider: string
    currency: string
    monthlyPrice: number
    yearlyPrice: number
    trialDays: number
  }
}

export default function AdminSettingsPage() {
  const router = useRouter()
  const queryClient = useQueryClient()
  const { user } = useAuthStore()
  const { refreshSettings } = useSettings()
  const [settings, setSettings] = useState<SystemSettings | null>(null)
  const [activeTab, setActiveTab] = useState('general')
  const [hasChanges, setHasChanges] = useState(false)
  // Change Password form state
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmNewPassword, setConfirmNewPassword] = useState('')

  useEffect(() => {
    if (user && user.role !== 'ADMIN') {
      toast.error('Admin access required')
      router.replace('/boards')
    }
  }, [user, router])

  // Fetch system settings
  const { data: systemSettings, isLoading } = useQuery({
    queryKey: ['admin', 'settings'],
    queryFn: async () => {
      const response = await api.get('/admin/settings')
      return response.data as SystemSettings
    },
    enabled: user?.role === 'ADMIN',
  })

  // Change password mutation
  const changePasswordMutation = useMutation({
    mutationFn: async (payload: { currentPassword: string; newPassword: string }) => {
      return api.post('/users/change-password', payload)
    },
    onSuccess: () => {
      toast.success('Password updated successfully')
      setCurrentPassword('')
      setNewPassword('')
      setConfirmNewPassword('')
    },
    onError: (error: unknown) => {
      let msg: string = 'Failed to update password'
      if (error && typeof error === 'object' && 'response' in error) {
        const resp = (error as { response?: { data?: unknown } }).response
        const data = resp?.data as { message?: unknown } | undefined
        const m = data?.message
        if (Array.isArray(m) && typeof m[0] === 'string') msg = m[0]
        else if (typeof m === 'string') msg = m
      }
      toast.error(msg)
    }
  })

  // Sync settings state when query data changes
  useEffect(() => {
    if (systemSettings) {
      setSettings(sanitizeSettings(systemSettings))
    }
  }, [systemSettings])

  // Save settings mutation
  const saveSettingsMutation = useMutation({
    mutationFn: async (updatedSettings: SystemSettings) => {
      return api.put('/admin/settings', updatedSettings)
    },
    onSuccess: async () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'settings'] })
      // Refresh the global settings context to update site name everywhere
      await refreshSettings()
      toast.success('Settings saved successfully')
      setHasChanges(false)
    },
    onError: () => {
      toast.error('Failed to save settings')
    }
  })

  // Toggle maintenance mode
  const toggleMaintenanceMutation = useMutation({
    mutationFn: async (enabled: boolean) => {
      return api.post('/admin/maintenance', { enabled })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'settings'] })
      toast.success('Maintenance mode updated')
    },
    onError: () => {
      toast.error('Failed to toggle maintenance mode')
    }
  })

  // Export settings
  const exportSettings = () => {
    if (!settings) return
    
    const dataStr = JSON.stringify(settings, null, 2)
    const dataUri = 'data:application/json;charset=utf-8,'+ encodeURIComponent(dataStr)
    
    const exportFileDefaultName = `taskzen-settings-${Date.now()}.json`
    
    const linkElement = document.createElement('a')
    linkElement.setAttribute('href', dataUri)
    linkElement.setAttribute('download', exportFileDefaultName)
    linkElement.click()
    
    toast.success('Settings exported')
  }

  // Import settings
  const importSettings = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return
    
    const reader = new FileReader()
    reader.onload = (e) => {
      try {
        const imported = sanitizeSettings(JSON.parse(e.target?.result as string))
        setSettings(imported)
        setHasChanges(true)
        toast.success('Settings imported successfully')
      } catch {
        toast.error('Invalid settings file')
      }
    }
    reader.readAsText(file)
  }

  const sanitizeSettings = (s: SystemSettings): SystemSettings => {
    return {
      general: {
        siteName: s.general.siteName,
        maxBoardsPerUser: s.general.maxBoardsPerUser,
        maxCardsPerBoard: s.general.maxCardsPerBoard,
        maxFileSize: s.general.maxFileSize,
      },
      features: {
        enableRegistration: s.features.enableRegistration,
        enableRealTimeUpdates: s.features.enableRealTimeUpdates,
        enableFileUploads: s.features.enableFileUploads,
        enableComments: s.features.enableComments,
        enablePublicBoards: s.features.enablePublicBoards,
        enableAnalytics: s.features.enableAnalytics,
      },
      security: {
        requireEmailVerification: s.security.requireEmailVerification,
        enableTwoFactor: s.security.enableTwoFactor,
        sessionTimeout: s.security.sessionTimeout,
        passwordMinLength: s.security.passwordMinLength,
        maxLoginAttempts: s.security.maxLoginAttempts,
        enableRateLimiting: s.security.enableRateLimiting,
        rateLimitRequests: s.security.rateLimitRequests,
        rateLimitWindow: s.security.rateLimitWindow,
      },
      maintenance: {
        enabled: s.maintenance.enabled,
        message: s.maintenance.message,
        scheduledAt: s.maintenance.scheduledAt,
        estimatedDuration: s.maintenance.estimatedDuration,
      },
      email: {
        enabled: s.email.enabled,
        provider: s.email.provider,
        fromEmail: s.email.fromEmail,
        fromName: s.email.fromName,
        smtpHost: s.email.smtpHost,
        smtpPort: s.email.smtpPort,
        smtpUser: s.email.smtpUser,
        smtpPassword: s.email.smtpPassword,
        templates: {
          welcome: s.email.templates.welcome,
          passwordReset: s.email.templates.passwordReset,
          emailVerification: s.email.templates.emailVerification,
          subscription: s.email.templates.subscription,
        },
      },
      payments: {
        enabled: s.payments.enabled,
        provider: s.payments.provider,
        currency: s.payments.currency,
        monthlyPrice: s.payments.monthlyPrice,
        yearlyPrice: s.payments.yearlyPrice,
        trialDays: s.payments.trialDays,
      },
    }
  }

  const updateSetting = (category: keyof SystemSettings, key: string, value: unknown) => {
    if (!settings) return
    
    setSettings({
      ...settings,
      [category]: {
        ...(settings[category] as Record<string, unknown>),
        [key]: value,
      } as SystemSettings[typeof category],
    })
    setHasChanges(true)
  }

  const updateEmailTemplate = (templateKey: keyof SystemSettings['email']['templates'], value: boolean) => {
    if (!settings) return
    setSettings({
      ...settings,
      email: {
        ...settings.email,
        templates: {
          ...settings.email.templates,
          [templateKey]: value,
        },
      },
    })
    setHasChanges(true)
  }

  const handleSave = () => {
    if (settings) {
      saveSettingsMutation.mutate(sanitizeSettings(settings))
    }
  }

  if (isLoading || !settings) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-violet-600"></div>
      </div>
    )
  }

  return (
    <div className="min-h-screen  from-slate-50 via-white to-violet-50 dark:from-slate-950 dark:via-slate-900 dark:to-violet-950">
      <div className="container mx-auto px-4 py-8">
        {/* Header */}
        <div className="flex justify-between items-center mb-8">
          <div>
            <h1 className="text-3xl font-bold mb-2">System Settings</h1>
            <p className="text-gray-600 dark:text-gray-400">
              Configure system-wide settings and feature flags
            </p>
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={() => document.getElementById('import-settings')?.click()}
            >
              <Upload className="w-4 h-4 mr-2" />
              Import
            </Button>
            <input
              id="import-settings"
              type="file"
              accept=".json"
              className="hidden"
              onChange={importSettings}
            />
            <Button variant="outline" onClick={exportSettings}>
              <Download className="w-4 h-4 mr-2" />
              Export
            </Button>
            <Button
              onClick={handleSave}
              disabled={!hasChanges || saveSettingsMutation.isPending}
            >
              <Save className="w-4 h-4 mr-2" />
              Save Changes
            </Button>
          </div>
        </div>

        {/* Maintenance Mode Alert */}
        {settings.maintenance.enabled && (
          <Card className="mb-6 border-yellow-500 bg-yellow-50 dark:bg-yellow-950">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <AlertTriangle className="w-5 h-5 text-yellow-600" />
                  <div>
                    <p className="font-semibold text-yellow-900 dark:text-yellow-100">
                      Maintenance Mode Active
                    </p>
                    <p className="text-sm text-yellow-700 dark:text-yellow-300">
                      {settings.maintenance.message || 'Site is under maintenance'}
                    </p>
                  </div>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => toggleMaintenanceMutation.mutate(false)}
                >
                  Disable
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Settings Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="grid grid-cols-6 w-full">
            <TabsTrigger value="general">
              <Settings className="w-4 h-4 mr-2" />
              General
            </TabsTrigger>
            <TabsTrigger value="features">
              <ToggleLeft className="w-4 h-4 mr-2" />
              Features
            </TabsTrigger>
            <TabsTrigger value="security">
              <Shield className="w-4 h-4 mr-2" />
              Security
            </TabsTrigger>
            <TabsTrigger value="email">
              <Mail className="w-4 h-4 mr-2" />
              Email
            </TabsTrigger>
            <TabsTrigger value="payments">
              <CreditCard className="w-4 h-4 mr-2" />
              Payments
            </TabsTrigger>
            <TabsTrigger value="maintenance">
              <Wrench className="w-4 h-4 mr-2" />
              Maintenance
            </TabsTrigger>
          </TabsList>

          {/* General Settings */}
          <TabsContent value="general" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>General Configuration</CardTitle>
                <CardDescription>
                  Basic system settings and limits
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>Site Name</Label>
                    <Input
                      value={settings.general.siteName}
                      onChange={(e) => updateSetting('general', 'siteName', e.target.value)}
                    />
                  </div>
                  <div>
                    <Label>Max File Size (MB)</Label>
                    <Input
                      type="number"
                      value={settings.general.maxFileSize}
                      onChange={(e) => updateSetting('general', 'maxFileSize', parseInt(e.target.value))}
                    />
                  </div>
                </div>
                
                <Separator />
                
                <div>
                  <h4 className="font-semibold mb-3">User Limits</h4>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label>Max Boards per User (Free)</Label>
                      <Input
                        type="number"
                        value={settings.general.maxBoardsPerUser}
                        onChange={(e) => updateSetting('general', 'maxBoardsPerUser', parseInt(e.target.value))}
                      />
                    </div>
                    <div>
                      <Label>Max Cards per Board</Label>
                      <Input
                        type="number"
                        value={settings.general.maxCardsPerBoard}
                        onChange={(e) => updateSetting('general', 'maxCardsPerBoard', parseInt(e.target.value))}
                      />
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Change Password */}
            <Card>
              <CardHeader>
                <CardTitle>Change Password</CardTitle>
                <CardDescription>Update the admin account password</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <Label>Current Password</Label>
                    <Input
                      type="password"
                      value={currentPassword}
                      onChange={(e) => setCurrentPassword(e.target.value)}
                    />
                  </div>
                  <div>
                    <Label>New Password</Label>
                    <Input
                      type="password"
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                    />
                  </div>
                  <div>
                    <Label>Confirm New Password</Label>
                    <Input
                      type="password"
                      value={confirmNewPassword}
                      onChange={(e) => setConfirmNewPassword(e.target.value)}
                    />
                  </div>
                </div>
                <div className="flex justify-end">
                  <Button
                    onClick={() => {
                      if (!currentPassword || !newPassword || !confirmNewPassword) {
                        toast.error('Please fill in all fields')
                        return
                      }
                      if (newPassword.length < (settings?.security?.passwordMinLength || 6)) {
                        toast.error(`Password must be at least ${settings?.security?.passwordMinLength || 6} characters`)
                        return
                      }
                      if (newPassword !== confirmNewPassword) {
                        toast.error('New passwords do not match')
                        return
                      }
                      changePasswordMutation.mutate({ currentPassword, newPassword })
                    }}
                    disabled={changePasswordMutation.isPending}
                  >
                    {changePasswordMutation.isPending ? 'Updating...' : 'Update Password'}
                  </Button>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Feature Flags */}
          <TabsContent value="features" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Feature Flags</CardTitle>
                <CardDescription>
                  Enable or disable application features
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {Object.entries(settings.features)
                    .filter(([key]) => key !== 'enableGoogleAuth' && key !== 'enableEmailNotifications')
                    .map(([key, value]) => (
                    <div key={key} className="flex items-center justify-between">
                      <div className="flex-1">
                        <Label className="text-base">
                          {key.replace(/([A-Z])/g, ' $1').replace(/^enable /, 'Enable ')}
                        </Label>
                        <p className="text-sm text-gray-500">
                          {getFeatureDescription(key)}
                        </p>
                      </div>
                      <Switch
                        checked={value}
                        onCheckedChange={(checked) => updateSetting('features', key, checked)}
                      />
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Security Settings */}
          <TabsContent value="security" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Security Configuration</CardTitle>
                <CardDescription>
                  Authentication and security settings
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="flex-1">
                      <Label>Enable Rate Limiting</Label>
                      <p className="text-sm text-gray-500">
                        Limit API requests to prevent abuse
                      </p>
                    </div>
                    <Switch
                      checked={settings.security.enableRateLimiting}
                      onCheckedChange={(checked) => updateSetting('security', 'enableRateLimiting', checked)}
                    />
                  </div>
                </div>
                
                <Separator />
                
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>Session Timeout (minutes)</Label>
                    <Input
                      type="number"
                      value={settings.security.sessionTimeout}
                      onChange={(e) => updateSetting('security', 'sessionTimeout', parseInt(e.target.value))}
                    />
                  </div>
                  <div>
                    <Label>Password Min Length</Label>
                    <Input
                      type="number"
                      value={settings.security.passwordMinLength}
                      onChange={(e) => updateSetting('security', 'passwordMinLength', parseInt(e.target.value))}
                    />
                  </div>
                  <div>
                    <Label>Max Login Attempts</Label>
                    <Input
                      type="number"
                      value={settings.security.maxLoginAttempts}
                      onChange={(e) => updateSetting('security', 'maxLoginAttempts', parseInt(e.target.value))}
                    />
                  </div>
                  {settings.security.enableRateLimiting && (
                    <>
                      <div>
                        <Label>Rate Limit (requests)</Label>
                        <Input
                          type="number"
                          value={settings.security.rateLimitRequests}
                          onChange={(e) => updateSetting('security', 'rateLimitRequests', parseInt(e.target.value))}
                        />
                      </div>
                      <div>
                        <Label>Rate Limit Window (seconds)</Label>
                        <Input
                          type="number"
                          value={settings.security.rateLimitWindow}
                          onChange={(e) => updateSetting('security', 'rateLimitWindow', parseInt(e.target.value))}
                        />
                      </div>
                    </>
                  )}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Email Settings */}
          <TabsContent value="email" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Email Configuration</CardTitle>
                <CardDescription>SMTP provider and templates</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex-1">
                    <Label>Enable Email</Label>
                    <p className="text-sm text-gray-500">Allow the app to send transactional emails</p>
                  </div>
                  <Switch
                    checked={settings.email.enabled}
                    onCheckedChange={(checked) => updateSetting('email', 'enabled', checked)}
                  />
                </div>
                
                {settings.email.enabled && (
                  <>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <Label>Email Provider</Label>
                        <select
                          value={settings.email.provider}
                          onChange={(e) => updateSetting('email', 'provider', e.target.value)}
                          className="w-full px-3 py-2 border rounded-lg dark:bg-slate-800"
                        >
                          <option value="smtp">SMTP</option>
                        </select>
                      </div>
                      <div>
                        <Label>From Email</Label>
                        <Input
                          value={settings.email.fromEmail}
                          onChange={(e) => updateSetting('email', 'fromEmail', e.target.value)}
                        />
                      </div>
                      <div>
                        <Label>From Name</Label>
                        <Input
                          value={settings.email.fromName}
                          onChange={(e) => updateSetting('email', 'fromName', e.target.value)}
                        />
                      </div>
                      <div>
                        <Label>SMTP Host</Label>
                        <Input
                          value={settings.email.smtpHost}
                          onChange={(e) => updateSetting('email', 'smtpHost', e.target.value)}
                        />
                      </div>
                      <div>
                        <Label>SMTP Port</Label>
                        <Input
                          type="number"
                          value={settings.email.smtpPort}
                          onChange={(e) => updateSetting('email', 'smtpPort', parseInt(e.target.value))}
                        />
                      </div>
                      <div>
                        <Label>SMTP User</Label>
                        <Input
                          value={settings.email.smtpUser}
                          onChange={(e) => updateSetting('email', 'smtpUser', e.target.value)}
                        />
                      </div>
                      <div>
                        <Label>SMTP Password</Label>
                        <Input
                          type="password"
                          value={settings.email.smtpPassword || ''}
                          onChange={(e) => updateSetting('email', 'smtpPassword', e.target.value)}
                        />
                      </div>
                    </div>
                    
                    <Separator />
                    
                    <div className="space-y-4">
                      <h4 className="font-semibold">Email Templates</h4>
                      <div className="space-y-3">
                        <div className="flex items-center justify-between">
                          <div className="flex-1">
                            <Label>Welcome Email</Label>
                            <p className="text-sm text-gray-500">Send a welcome email after registration</p>
                          </div>
                          <Switch
                            checked={settings.email.templates.welcome}
                            onCheckedChange={(checked) => updateEmailTemplate('welcome', checked)}
                          />
                        </div>
                        <div className="flex items-center justify-between">
                          <div className="flex-1">
                            <Label>Password Reset</Label>
                            <p className="text-sm text-gray-500">Send password reset emails</p>
                          </div>
                          <Switch
                            checked={settings.email.templates.passwordReset}
                            onCheckedChange={(checked) => updateEmailTemplate('passwordReset', checked)}
                          />
                        </div>
                        <div className="flex items-center justify-between">
                          <div className="flex-1">
                            <Label>Email Verification</Label>
                            <p className="text-sm text-gray-500">Send verification emails when needed</p>
                          </div>
                          <Switch
                            checked={settings.email.templates.emailVerification}
                            onCheckedChange={(checked) => updateEmailTemplate('emailVerification', checked)}
                          />
                        </div>
                        <div className="flex items-center justify-between">
                          <div className="flex-1">
                            <Label>Subscription</Label>
                            <p className="text-sm text-gray-500">Send subscription-related emails</p>
                          </div>
                          <Switch
                            checked={settings.email.templates.subscription}
                            onCheckedChange={(checked) => updateEmailTemplate('subscription', checked)}
                          />
                        </div>
                      </div>
                    </div>
                  </>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Payment Settings */}
          <TabsContent value="payments" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Payment Configuration</CardTitle>
                <CardDescription>
                  Subscription and payment gateway settings
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex-1">
                    <Label>Enable Payments</Label>
                    <p className="text-sm text-gray-500">
                      Allow users to subscribe to Pro plans
                    </p>
                  </div>
                  <Switch
                    checked={settings.payments.enabled}
                    onCheckedChange={(checked) => updateSetting('payments', 'enabled', checked)}
                  />
                </div>
                
                {settings.payments.enabled && (
                  <>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <Label>Payment Provider</Label>
                        <select
                          value={settings.payments.provider}
                          onChange={(e) => updateSetting('payments', 'provider', e.target.value)}
                          className="w-full px-3 py-2 border rounded-lg dark:bg-slate-800"
                        >
                          <option value="stripe">Stripe</option>
                          <option value="paypal">PayPal</option>
                          <option value="paddle">Paddle</option>
                        </select>
                      </div>
                      <div>
                        <Label>Currency</Label>
                        <select
                          value={settings.payments.currency}
                          onChange={(e) => updateSetting('payments', 'currency', e.target.value)}
                          className="w-full px-3 py-2 border rounded-lg dark:bg-slate-800"
                        >
                          <option value="USD">USD</option>
                          <option value="EUR">EUR</option>
                          <option value="GBP">GBP</option>
                        </select>
                      </div>
                      <div>
                        <Label>Monthly Price</Label>
                        <Input
                          type="number"
                          step="0.01"
                          value={settings.payments.monthlyPrice}
                          onChange={(e) => updateSetting('payments', 'monthlyPrice', parseFloat(e.target.value))}
                        />
                      </div>
                      <div>
                        <Label>Yearly Price</Label>
                        <Input
                          type="number"
                          step="0.01"
                          value={settings.payments.yearlyPrice}
                          onChange={(e) => updateSetting('payments', 'yearlyPrice', parseFloat(e.target.value))}
                        />
                      </div>
                      <div>
                        <Label>Trial Days</Label>
                        <Input
                          type="number"
                          value={settings.payments.trialDays}
                          onChange={(e) => updateSetting('payments', 'trialDays', parseInt(e.target.value))}
                        />
                      </div>
                    </div>
                  </>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Maintenance Mode */}
          <TabsContent value="maintenance" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Maintenance Mode</CardTitle>
                <CardDescription>
                  Schedule and configure maintenance periods
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex-1">
                    <Label>Enable Maintenance Mode</Label>
                    <p className="text-sm text-gray-500">
                      Restrict access to the application
                    </p>
                  </div>
                  <Switch
                    checked={settings.maintenance.enabled}
                    onCheckedChange={(checked) => {
                      updateSetting('maintenance', 'enabled', checked)
                      toggleMaintenanceMutation.mutate(checked)
                    }}
                  />
                </div>
                
                <div>
                  <Label>Maintenance Message</Label>
                  <textarea
                    className="w-full px-3 py-2 border rounded-lg dark:bg-slate-800"
                    rows={3}
                    value={settings.maintenance.message}
                    onChange={(e) => updateSetting('maintenance', 'message', e.target.value)}
                    placeholder="We're currently performing maintenance..."
                  />
                </div>
                
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>Scheduled At</Label>
                    <Input
                      type="datetime-local"
                      value={settings.maintenance.scheduledAt || ''}
                      onChange={(e) => updateSetting('maintenance', 'scheduledAt', e.target.value)}
                    />
                  </div>
                  <div>
                    <Label>Estimated Duration (hours)</Label>
                    <Input
                      type="number"
                      value={settings.maintenance.estimatedDuration || ''}
                      onChange={(e) => updateSetting('maintenance', 'estimatedDuration', parseInt(e.target.value))}
                    />
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  )
}

function getFeatureDescription(feature: string): string {
  const descriptions: Record<string, string> = {
    enableRegistration: 'Allow new users to register accounts',
    enableRealTimeUpdates: 'Enable real-time board updates via WebSocket',
    enableFileUploads: 'Allow users to upload attachments',
    enableComments: 'Enable commenting on cards',
    enablePublicBoards: 'Allow boards to be made public',
    enableAnalytics: 'Track user analytics and usage metrics'
  }
  return descriptions[feature] || 'Configure this feature'
}
