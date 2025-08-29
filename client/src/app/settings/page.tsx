'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { useAuthStore } from '@/store/auth'
import { useTheme } from 'next-themes'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { toast } from 'react-hot-toast'
import { 
  User, Settings, Bell, Shield, Palette, Moon, Sun, 
  Lock, Camera, Save, Crown, AlertCircle, 
  CheckCircle, Activity, Zap
} from 'lucide-react'
import { api } from '@/lib/api'
import { useSettings } from '@/contexts/SettingsContext'
import type { User as UserType, UiPreferences } from '@/shared/types'
import { Select, SelectTrigger, SelectContent, SelectItem, SelectValue } from '@/components/ui/select'

// Safely extract API error message
function extractErrorMessage(e: unknown, fallback: string) {
  if (
    e &&
    typeof e === 'object' &&
    'response' in e &&
    (e as { response?: { data?: { message?: unknown } } }).response
  ) {
    const msg = (e as { response?: { data?: { message?: unknown } } }).response?.data?.message
    if (typeof msg === 'string') return msg
  }
  return fallback
}

export default function SettingsPage() {
  const router = useRouter()
  const { user, fetchMe, setUser } = useAuthStore()
  const { theme, setTheme } = useTheme()
  const [loading, setLoading] = useState(false)
  const [mounted, setMounted] = useState(false)
  const { settings } = useSettings()
  const appName = settings?.siteName || 'TaskZen'
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const originalUserRef = useRef<UserType | null>(null)
  const hasSavedRef = useRef(false)
  
  // Form states
  const [profileData, setProfileData] = useState({
    firstName: '',
    lastName: '',
    username: '',
    email: '',
    avatar: ''
  })
  
  const [passwordData, setPasswordData] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: ''
  })
  
  const [notifications, setNotifications] = useState({
    emailNotifications: true,
    boardInvites: true,
    taskAssignments: true,
    taskDeadlines: true,
    comments: true,
    weeklyReport: false
  })

  const [uiPrefs, setUiPrefs] = useState<UiPreferences>({
    board: {
      compactCardView: false,
      labelDisplay: 'chips',
      enableAnimations: true,
    },
  })

  useEffect(() => {
    setMounted(true)
    if (user) {
      if (!originalUserRef.current) {
        originalUserRef.current = user
      }
      setProfileData({
        firstName: user.firstName || '',
        lastName: user.lastName || '',
        username: user.username || '',
        email: user.email || '',
        avatar: user.avatar || ''
      })
      // Initialize UI prefs from auth store to avoid flicker
      if (user.uiPreferences) {
        setUiPrefs((prev) => {
          const pBoard = prev.board ?? {}
          return {
            board: {
              compactCardView: user.uiPreferences?.board?.compactCardView ?? pBoard.compactCardView,
              labelDisplay: user.uiPreferences?.board?.labelDisplay ?? (typeof user.uiPreferences?.board?.alwaysShowLabels === 'boolean' ? (user.uiPreferences.board.alwaysShowLabels ? 'chips' : 'blocks') : pBoard.labelDisplay),
              enableAnimations: user.uiPreferences?.board?.enableAnimations ?? pBoard.enableAnimations,
            },
          }
        })
      }
      ;(async () => {
        try {
          const { data } = await api.get(`/users/${user.id}/notifications`)
          setNotifications((prev) => ({ ...prev, ...data }))
        } catch {
          // ignore; will use defaults
        }
        try {
          const { data: ui } = await api.get(`/users/${user.id}/ui-preferences`)
          setUiPrefs((prev) => {
            const pBoard = prev.board ?? {}
            return {
              board: {
                compactCardView: ui?.board?.compactCardView ?? pBoard.compactCardView,
                labelDisplay: ui?.board?.labelDisplay ?? (typeof ui?.board?.alwaysShowLabels === 'boolean' ? (ui.board.alwaysShowLabels ? 'chips' : 'blocks') : pBoard.labelDisplay),
                enableAnimations: ui?.board?.enableAnimations ?? pBoard.enableAnimations,
              },
            }
          })
        } catch {
          // ignore; will use defaults
        }
      })()
    }
  }, [user])

  // Revert optimistic UI-pref changes if user navigates away without saving
  useEffect(() => {
    return () => {
      if (!hasSavedRef.current && originalUserRef.current) {
        setUser(originalUserRef.current)
      }
    }
  }, [setUser])

  if (!mounted) return null

  const handleProfileUpdate = async () => {
    setLoading(true)
    try {
      const response = await api.put(`/users/${user?.id}` , profileData)
      
      if (response.data) {
        await fetchMe()
        toast.success('Profile updated successfully!')
      }
    } catch (error: unknown) {
      toast.error(extractErrorMessage(error, 'Failed to update profile'))
    } finally {
      setLoading(false)
    }
  }

  const handlePasswordChange = async () => {
    if (passwordData.newPassword !== passwordData.confirmPassword) {
      toast.error('Passwords do not match')
      return
    }
    
    if (passwordData.newPassword.length < 6) {
      toast.error('Password must be at least 6 characters')
      return
    }
    
    setLoading(true)
    try {
      await api.post('/users/change-password', {
        currentPassword: passwordData.currentPassword,
        newPassword: passwordData.newPassword
      })
      
      toast.success('Password changed successfully!')
      setPasswordData({
        currentPassword: '',
        newPassword: '',
        confirmPassword: ''
      })
    } catch (error: unknown) {
      toast.error(extractErrorMessage(error, 'Failed to change password'))
    } finally {
      setLoading(false)
    }
  }

  const handleNotificationUpdate = async () => {
    setLoading(true)
    try {
      await api.put(`/users/${user?.id}/notifications`, notifications)
      toast.success('Notification preferences updated!')
    } catch (error: unknown) {
      toast.error(extractErrorMessage(error, 'Failed to update notifications'))
    } finally {
      setLoading(false)
    }
  }

  const handleUiPreferencesUpdate = async () => {
    setLoading(true)
    try {
      await api.put(`/users/${user?.id}/ui-preferences`, uiPrefs)
      toast.success('Appearance preferences updated!')
      hasSavedRef.current = true
      await fetchMe()
    } catch (error: unknown) {
      toast.error(extractErrorMessage(error, 'Failed to update appearance preferences'))
    } finally {
      setLoading(false)
    }
  }

  const triggerAvatarPicker = () => {
    fileInputRef.current?.click()
  }

  const handleAvatarFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file || !user) return
    if (file.size > 2 * 1024 * 1024) {
      toast.error('Max file size is 2MB')
      return
    }
    const form = new FormData()
    form.append('file', file)
    setLoading(true)
    try {
      const res = await api.post(`/users/${user.id}/avatar`, form)
      if (res.data?.user) {
        await fetchMe()
        setProfileData((prev) => ({ ...prev, avatar: res.data.user.avatar || '' }))
        toast.success('Avatar updated!')
      }
    } catch (error: unknown) {
      toast.error(extractErrorMessage(error, 'Failed to upload avatar'))
    } finally {
      setLoading(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  return (
    <div className="min-h-screen  from-slate-50 via-white to-violet-50 dark:from-slate-950 dark:via-slate-900 dark:to-violet-950">
      <div className="container mx-auto px-4 py-8 max-w-6xl">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-2xl sm:text-3xl font-bold mb-2">Settings</h1>
          <p className="text-sm sm:text-base text-gray-600 dark:text-gray-400">
            Manage your account settings and preferences
          </p>
        </div>

        {/* Pro Status Card */}
        {user && (
          <Card className="mb-6 border-gradient-to-r from-violet-500 to-cyan-500">
            <CardContent className="p-4 sm:p-6">
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                <div className="flex items-center gap-4">
                  <div className={`p-3 rounded-xl ${user.isPro ? 'bg-gradient-to-r from-violet-600 to-cyan-600' : 'bg-gray-200 dark:bg-gray-800'}`}>
                    <Crown className={`w-6 h-6 ${user.isPro ? 'text-white' : 'text-gray-500'}`} />
                  </div>
                  <div>
                    <h3 className="font-semibold text-lg">
                      {user.isPro ? 'Pro Member' : 'Free Plan'}
                    </h3>
                    {user.isPro && user.proExpiresAt ? (
                      <p className="text-sm text-gray-600 dark:text-gray-400">
                        Expires: {new Date(user.proExpiresAt).toLocaleDateString()}
                      </p>
                    ) : (
                      <p className="text-sm text-gray-600 dark:text-gray-400">
                        Upgrade to unlock all features
                      </p>
                    )}
                  </div>
                </div>
                {user.isPro ? (
                  <Button 
                    variant="outline"
                    onClick={() => router.push('/billing')}
                  >
                    Manage Billing
                  </Button>
                ) : (
                  <Button 
                    onClick={() => router.push('/billing')}
                    className="bg-gradient-to-r from-violet-600 to-cyan-600 hover:from-violet-700 hover:to-cyan-700"
                  >
                    <Zap className="w-4 h-4 mr-2" />
                    Upgrade to Pro
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Settings Tabs */}
        <Tabs defaultValue="profile" className="space-y-6">
          <TabsList className="grid grid-cols-2 sm:grid-cols-4 w-full max-w-md gap-1">
            <TabsTrigger value="profile" className="text-xs sm:text-sm">
              <User className="w-3 h-3 sm:w-4 sm:h-4 mr-1 sm:mr-2" />
              Profile
            </TabsTrigger>
            <TabsTrigger value="appearance" className="text-xs sm:text-sm">
              <Palette className="w-3 h-3 sm:w-4 sm:h-4 mr-1 sm:mr-2" />
              Theme
            </TabsTrigger>
            <TabsTrigger value="notifications" className="text-xs sm:text-sm">
              <Bell className="w-3 h-3 sm:w-4 sm:h-4 mr-1 sm:mr-2" />
              Alerts
            </TabsTrigger>
            <TabsTrigger value="security" className="text-xs sm:text-sm">
              <Shield className="w-3 h-3 sm:w-4 sm:h-4 mr-1 sm:mr-2" />
              Security
            </TabsTrigger>
          </TabsList>

          {/* Profile Tab */}
          <TabsContent value="profile">
            <Card>
              <CardHeader>
                <CardTitle>Profile Information</CardTitle>
                <CardDescription>
                  Update your personal information and profile picture
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                {/* Avatar Upload */}
                <div className="flex items-center gap-6">
                  <Avatar className="w-24 h-24">
                    <AvatarImage src={profileData.avatar} />
                    <AvatarFallback>
                      {user?.username?.charAt(0).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <div>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={handleAvatarFileChange}
                    />
                    <Button variant="outline" size="sm" onClick={triggerAvatarPicker} disabled={loading}>
                      <Camera className="w-4 h-4 mr-2" />
                      Change Avatar
                    </Button>
                    <p className="text-xs text-gray-500 mt-2">
                      JPG, PNG, GIF or WEBP. Max size 2MB
                    </p>
                  </div>
                </div>

                {/* Form Fields */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="firstName">First Name</Label>
                    <Input
                      id="firstName"
                      value={profileData.firstName}
                      onChange={(e) => setProfileData({...profileData, firstName: e.target.value})}
                      placeholder="John"
                    />
                  </div>
                  <div>
                    <Label htmlFor="lastName">Last Name</Label>
                    <Input
                      id="lastName"
                      value={profileData.lastName}
                      onChange={(e) => setProfileData({...profileData, lastName: e.target.value})}
                      placeholder="Doe"
                    />
                  </div>
                </div>

                <div>
                  <Label htmlFor="username">Username</Label>
                  <Input
                    id="username"
                    value={profileData.username}
                    onChange={(e) => setProfileData({...profileData, username: e.target.value})}
                    placeholder="johndoe"
                  />
                </div>

                <div>
                  <Label htmlFor="email">Email</Label>
                  <Input
                    id="email"
                    type="email"
                    value={profileData.email}
                    onChange={(e) => setProfileData({...profileData, email: e.target.value})}
                    placeholder="john@example.com"
                  />
                </div>

                <Button 
                  onClick={handleProfileUpdate}
                  disabled={loading}
                  className="w-full sm:w-auto"
                >
                  <Save className="w-4 h-4 mr-2" />
                  Save Changes
                </Button>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Appearance Tab */}
          <TabsContent value="appearance">
            <Card>
              <CardHeader>
                <CardTitle>Appearance</CardTitle>
                <CardDescription>
                  Customize how {appName} looks on your device
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="space-y-1">
                      <Label>Theme</Label>
                      <p className="text-sm text-gray-500">
                        Select your preferred theme
                      </p>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        variant={theme === 'light' ? 'default' : 'outline'}
                        size="sm"
                        onClick={() => setTheme('light')}
                      >
                        <Sun className="w-4 h-4 mr-2" />
                        Light
                      </Button>
                      <Button
                        variant={theme === 'dark' ? 'default' : 'outline'}
                        size="sm"
                        onClick={() => setTheme('dark')}
                      >
                        <Moon className="w-4 h-4 mr-2" />
                        Dark
                      </Button>
                      <Button
                        variant={theme === 'system' ? 'default' : 'outline'}
                        size="sm"
                        onClick={() => setTheme('system')}
                      >
                        <Settings className="w-4 h-4 mr-2" />
                        System
                      </Button>
                    </div>
                  </div>

                  {/* More appearance settings */}
                  <div className="pt-4 border-t">
                    <h4 className="font-medium mb-4">Board Preferences</h4>
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <Label htmlFor="compact-view">Compact Card View</Label>
                        <Switch 
                          id="compact-view"
                          checked={!!uiPrefs.board?.compactCardView}
                          onCheckedChange={(checked) => {
                            setUiPrefs((prev) => ({
                              ...prev,
                              board: { ...prev.board, compactCardView: checked },
                            }))
                            if (user) {
                              setUser({
                                ...user,
                                uiPreferences: {
                                  ...(user.uiPreferences || {}),
                                  board: {
                                    ...(user.uiPreferences?.board || {}),
                                    compactCardView: checked,
                                  },
                                },
                              } as UserType)
                            }
                          }}
                        />
                      </div>
                      <div className="flex items-center justify-between">
                        <Label htmlFor="label-display">Label Display</Label>
                        <div className="w-56">
                          <Select
                            value={uiPrefs.board?.labelDisplay ?? (uiPrefs.board?.alwaysShowLabels ? 'chips' : 'blocks')}
                            onValueChange={(value: 'chips' | 'blocks' | 'hover') => {
                              setUiPrefs((prev) => ({
                                ...prev,
                                board: { ...prev.board, labelDisplay: value },
                              }))
                              if (user) {
                                setUser({
                                  ...user,
                                  uiPreferences: {
                                    ...(user.uiPreferences || {}),
                                    board: {
                                      ...(user.uiPreferences?.board || {}),
                                      labelDisplay: value,
                                      // keep boolean roughly in sync for legacy reads
                                      alwaysShowLabels: value === 'chips',
                                    },
                                  },
                                } as UserType)
                              }
                            }}
                          >
                            <SelectTrigger id="label-display">
                              <SelectValue placeholder="Select mode" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="chips">Chips (with text)</SelectItem>
                              <SelectItem value="blocks">Color blocks</SelectItem>
                              <SelectItem value="hover">Show labels on hover</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                      <div className="flex items-center justify-between">
                        <Label htmlFor="animations">Enable Animations</Label>
                        <Switch 
                          id="animations"
                          checked={!!uiPrefs.board?.enableAnimations}
                          onCheckedChange={(checked) => {
                            setUiPrefs((prev) => ({
                              ...prev,
                              board: { ...prev.board, enableAnimations: checked },
                            }))
                            if (user) {
                              setUser({
                                ...user,
                                uiPreferences: {
                                  ...(user.uiPreferences || {}),
                                  board: {
                                    ...(user.uiPreferences?.board || {}),
                                    enableAnimations: checked,
                                  },
                                },
                              } as UserType)
                            }
                          }}
                        />
                      </div>
                    </div>
                    <div className="pt-4">
                      <Button 
                        onClick={handleUiPreferencesUpdate}
                        disabled={loading}
                        className="w-full sm:w-auto"
                      >
                        <Save className="w-4 h-4 mr-2" />
                        Save Preferences
                      </Button>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Notifications Tab */}
          <TabsContent value="notifications">
            <Card>
              <CardHeader>
                <CardTitle>Notification Preferences</CardTitle>
                <CardDescription>
                  Choose what notifications you want to receive
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                      <Label htmlFor="email-notif">Email Notifications</Label>
                      <p className="text-sm text-gray-500">
                        Receive notifications via email
                      </p>
                    </div>
                    <Switch 
                      id="email-notif"
                      checked={notifications.emailNotifications}
                      onCheckedChange={(checked) => 
                        setNotifications({...notifications, emailNotifications: checked})
                      }
                    />
                  </div>

                  <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                      <Label htmlFor="board-invites">Board Invitations</Label>
                      <p className="text-sm text-gray-500">
                        When someone invites you to a board
                      </p>
                    </div>
                    <Switch 
                      id="board-invites"
                      checked={notifications.boardInvites}
                      onCheckedChange={(checked) => 
                        setNotifications({...notifications, boardInvites: checked})
                      }
                    />
                  </div>

                  <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                      <Label htmlFor="task-assign">Task Assignments</Label>
                      <p className="text-sm text-gray-500">
                        When you&apos;re assigned to a task
                      </p>
                    </div>
                    <Switch 
                      id="task-assign"
                      checked={notifications.taskAssignments}
                      onCheckedChange={(checked) => 
                        setNotifications({...notifications, taskAssignments: checked})
                      }
                    />
                  </div>

                  <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                      <Label htmlFor="deadlines">Deadline Reminders</Label>
                      <p className="text-sm text-gray-500">
                        Upcoming task deadlines
                      </p>
                    </div>
                    <Switch 
                      id="deadlines"
                      checked={notifications.taskDeadlines}
                      onCheckedChange={(checked) => 
                        setNotifications({...notifications, taskDeadlines: checked})
                      }
                    />
                  </div>

                  <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                      <Label htmlFor="comments">Comments</Label>
                      <p className="text-sm text-gray-500">
                        When someone comments on your tasks
                      </p>
                    </div>
                    <Switch 
                      id="comments"
                      checked={notifications.comments}
                      onCheckedChange={(checked) => 
                        setNotifications({...notifications, comments: checked})
                      }
                    />
                  </div>

                  <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                      <Label htmlFor="weekly">Weekly Reports</Label>
                      <p className="text-sm text-gray-500">
                        Weekly productivity summary
                      </p>
                    </div>
                    <Switch 
                      id="weekly"
                      checked={notifications.weeklyReport}
                      onCheckedChange={(checked) => 
                        setNotifications({...notifications, weeklyReport: checked})
                      }
                    />
                  </div>
                </div>

                <Button 
                  onClick={handleNotificationUpdate}
                  disabled={loading}
                  className="w-full sm:w-auto"
                >
                  <Save className="w-4 h-4 mr-2" />
                  Save Preferences
                </Button>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Security Tab */}
          <TabsContent value="security">
            <Card>
              <CardHeader>
                <CardTitle>Security Settings</CardTitle>
                <CardDescription>
                  Keep your account safe and secure
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="space-y-4">
                  <h4 className="font-medium">Change Password</h4>
                  
                  <div>
                    <Label htmlFor="current-password">Current Password</Label>
                    <Input
                      id="current-password"
                      type="password"
                      value={passwordData.currentPassword}
                      onChange={(e) => setPasswordData({...passwordData, currentPassword: e.target.value})}
                    />
                  </div>

                  <div>
                    <Label htmlFor="new-password">New Password</Label>
                    <Input
                      id="new-password"
                      type="password"
                      value={passwordData.newPassword}
                      onChange={(e) => setPasswordData({...passwordData, newPassword: e.target.value})}
                    />
                  </div>

                  <div>
                    <Label htmlFor="confirm-password">Confirm New Password</Label>
                    <Input
                      id="confirm-password"
                      type="password"
                      value={passwordData.confirmPassword}
                      onChange={(e) => setPasswordData({...passwordData, confirmPassword: e.target.value})}
                    />
                  </div>

                  <Button 
                    onClick={handlePasswordChange}
                    disabled={loading}
                    className="w-full sm:w-auto"
                  >
                    <Lock className="w-4 h-4 mr-2" />
                    Change Password
                  </Button>
                </div>

                {/* Recent Activity */}
                <div className="pt-6 border-t">
                  <h4 className="font-medium mb-4">Recent Activity</h4>
                  <div className="space-y-3">
                    <div className="flex items-center justify-between text-sm">
                      <div className="flex items-center gap-2">
                        <CheckCircle className="w-4 h-4 text-green-500" />
                        <span>Login from Chrome on Windows</span>
                      </div>
                      <span className="text-gray-500">2 hours ago</span>
                    </div>
                    <div className="flex items-center justify-between text-sm">
                      <div className="flex items-center gap-2">
                        <Activity className="w-4 h-4 text-blue-500" />
                        <span>Password changed</span>
                      </div>
                      <span className="text-gray-500">3 days ago</span>
                    </div>
                    <div className="flex items-center justify-between text-sm">
                      <div className="flex items-center gap-2">
                        <AlertCircle className="w-4 h-4 text-orange-500" />
                        <span>New device login</span>
                      </div>
                      <span className="text-gray-500">1 week ago</span>
                    </div>
                  </div>
                </div>

                {/* Two-Factor Authentication */}
                <div className="pt-6 border-t">
                  <div className="flex items-center justify-between">
                    <div>
                      <h4 className="font-medium">Two-Factor Authentication</h4>
                      <p className="text-sm text-gray-500 mt-1">
                        Add an extra layer of security to your account
                      </p>
                    </div>
                    <Button variant="outline">
                      Enable 2FA
                    </Button>
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
