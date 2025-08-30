'use client'

 import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { useAuthStore } from '@/store/auth'
 import { useQuery, useQueryClient } from '@tanstack/react-query'
 import { getBoards } from '@/lib/boards'
 import type { Board } from '@/shared/types'
 import { Loader2, Crown, AlertCircle, Plus, Sparkles, TrendingUp, Users, Calendar } from 'lucide-react'
 import { toast } from 'react-hot-toast'
import { createBoard, type CreateBoardInput, getBoardTemplates, type BoardTemplate, BOARD_THEMES, BOARD_BACKGROUNDS } from '@/lib/boards'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useSettings } from '@/contexts/SettingsContext'

export default function BoardsPage() {
  const router = useRouter()
  const { token, user, fetchMe } = useAuthStore()
  const queryClient = useQueryClient()
  const { settings } = useSettings()
  const [ready, setReady] = useState(false)
  const [showCreate, setShowCreate] = useState(false)
  const [creating, setCreating] = useState(false)
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [color, setColor] = useState('#6366f1')
  const [background, setBackground] = useState('')
  const [theme, setTheme] = useState('default')
  const [isPrivate, setIsPrivate] = useState(false)
  const [selectedTemplate, setSelectedTemplate] = useState<string | null>(null)
  const [templates, setTemplates] = useState<BoardTemplate[]>([])
  const builtInTemplates = templates.filter((t) => !t.isCustom)
  const customTemplates = templates.filter((t) => t.isCustom)

  const getErrorMessage = (err: unknown, fallback: string) => {
    if (typeof err === 'object' && err !== null) {
      const e = err as { response?: { data?: { message?: string } }; message?: string }
      if (e.response?.data?.message) return e.response.data.message
      if (typeof e.message === 'string') return e.message
    }
    return fallback
  }

  useEffect(() => {
    const init = async () => {
      if (!token) await fetchMe()
      if (!useAuthStore.getState().token) {
        router.replace('/login')
        return
      }
      setReady(true)
      // Load templates
      try {
        const templatesData = await getBoardTemplates()
        setTemplates(templatesData)
      } catch (error) {
        console.error('Failed to load templates:', error)
      }
    }
    init()
  }, [token, fetchMe, router])

  const { data, isLoading, isError, error } = useQuery<Board[], Error>({
    queryKey: ['boards'],
    queryFn: getBoards,
    enabled: ready,
    // Always refetch on mount so list reflects latest boards
    refetchOnMount: 'always',
  })

  useEffect(() => {
    if (isError) {
      const msg = error instanceof Error ? error.message : 'Failed to load boards'
      toast.error(msg)
    }
  }, [isError, error])

  if (!ready) return null

  const boards = (data || []) as Board[]
  const maxFreeBoards = settings?.limits?.maxBoardsPerUser ?? 3
  const ownedCount = boards.filter((b) => b.ownerId === user?.id).length
  const atLimit = !user?.isPro && ownedCount >= maxFreeBoards

  const onCreate = async () => {
    if (!title.trim()) {
      toast.error('Please enter a board title')
      return
    }
    if (atLimit) {
      toast.error(`Free plan is limited to ${maxFreeBoards} boards. Please upgrade to Pro for unlimited boards.`)
      return
    }
    const payload: CreateBoardInput = { 
      title: title.trim(), 
      description: description.trim() || undefined, 
      color, 
      background: background || undefined,
      theme: theme || 'default',
      isPrivate,
      templateId: selectedTemplate || undefined
    }
    try {
      setCreating(true)
      const board = await createBoard(payload)
      toast.success('Board created')
      // Refresh boards list cache so it includes the new board
      queryClient.invalidateQueries({ queryKey: ['boards'] })
      setShowCreate(false)
      setTitle('')
      setDescription('')
      setSelectedTemplate(null)
      setBackground('')
      setTheme('default')
      router.push(`/boards/${board.id}`)
    } catch (e: unknown) {
      toast.error(getErrorMessage(e, 'Failed to create board'))
    } finally {
      setCreating(false)
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-100 dark:from-slate-900 dark:via-slate-800 dark:to-slate-900 relative overflow-hidden">
      {/* Animated Background Elements */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -right-40 w-80 h-80 bg-gradient-to-br from-blue-400/10 to-purple-600/10 rounded-full blur-3xl animate-pulse"></div>
        <div className="absolute -bottom-40 -left-40 w-80 h-80 bg-gradient-to-tr from-indigo-400/10 to-pink-600/10 rounded-full blur-3xl animate-pulse delay-1000"></div>
      </div>

      <div className="mx-auto max-w-7xl p-6 relative z-10">
        {/* Header Section */}
        <div className="mb-8">
          <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-6">
            <div className="space-y-2">
              <div className="inline-flex items-center gap-2 px-3 py-1 bg-white/80 dark:bg-slate-800/80 backdrop-blur-sm rounded-full border border-slate-200/60 dark:border-slate-600/60 text-xs font-medium text-slate-600 dark:text-slate-300 mb-2">
                <Sparkles className="h-3 w-3 text-yellow-500" />
                <span>Dashboard</span>
              </div>
              <h1 className="text-3xl lg:text-4xl font-bold bg-gradient-to-r from-slate-800 to-slate-600 dark:from-slate-100 dark:to-slate-300 bg-clip-text text-transparent">
                Your Workspace
              </h1>
              <p className="text-lg text-slate-600 dark:text-slate-300 max-w-2xl">
                Manage your projects, collaborate with your team, and track progress across all your boards
              </p>
            </div>
            
            <div className="flex flex-wrap gap-3 w-full lg:w-auto">
              <Button 
                variant="outline" 
                onClick={() => router.push('/')}
                className="glass-card border-slate-300/60 dark:border-slate-600/60 hover:bg-white/80 dark:hover:bg-slate-800/80 backdrop-blur-sm"
              >
                Home
              </Button>
              {user?.role === 'ADMIN' && (
                <Button 
                  variant="outline" 
                  onClick={() => router.push('/admin')}
                  className="glass-card border-slate-300/60 dark:border-slate-600/60 hover:bg-white/80 dark:hover:bg-slate-800/80 backdrop-blur-sm"
                >
                  Admin Dashboard
                </Button>
              )}
              {!user?.isPro && (
                <Button 
                  variant="outline" 
                  onClick={() => router.push('/billing')}
                  className="glass-card border-amber-300/60 dark:border-amber-600/60 hover:bg-amber-50/80 dark:hover:bg-amber-900/20 backdrop-blur-sm text-amber-700 dark:text-amber-300"
                >
                  <Crown className="h-4 w-4 mr-2" />
                  Upgrade
                </Button>
              )}
              <Button 
                onClick={() => setShowCreate((v) => !v)} 
                disabled={atLimit}
                className="bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white border-0 shadow-lg hover:shadow-xl transform hover:-translate-y-0.5 transition-all duration-300"
              >
                <Plus className="h-4 w-4 mr-2" />
                {showCreate ? 'Close' : 'New Board'}
              </Button>
            </div>
          </div>
        </div>

        {/* Stats Overview */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          <Card className="glass-card border-0 shadow-lg hover:shadow-xl transition-all duration-300 group">
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-slate-600 dark:text-slate-300">Total Boards</p>
                  <p className="text-2xl font-bold text-slate-800 dark:text-slate-100">{boards.length}</p>
                </div>
                <div className="w-12 h-12 bg-gradient-to-br from-blue-500 to-blue-600 rounded-xl flex items-center justify-center group-hover:scale-110 transition-transform duration-300">
                  <TrendingUp className="h-6 w-6 text-white" />
                </div>
              </div>
            </CardContent>
          </Card>
          
          <Card className="glass-card border-0 shadow-lg hover:shadow-xl transition-all duration-300 group">
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-slate-600 dark:text-slate-300">Team Members</p>
                  <p className="text-2xl font-bold text-slate-800 dark:text-slate-100">12</p>
                </div>
                <div className="w-12 h-12 bg-gradient-to-br from-green-500 to-green-600 rounded-xl flex items-center justify-center group-hover:scale-110 transition-transform duration-300">
                  <Users className="h-6 w-6 text-white" />
                </div>
              </div>
            </CardContent>
          </Card>
          
          <Card className="glass-card border-0 shadow-lg hover:shadow-xl transition-all duration-300 group">
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-slate-600 dark:text-slate-300">This Month</p>
                  <p className="text-2xl font-bold text-slate-800 dark:text-slate-100">47</p>
                </div>
                <div className="w-12 h-12 bg-gradient-to-br from-purple-500 to-purple-600 rounded-xl flex items-center justify-center group-hover:scale-110 transition-transform duration-300">
                  <Calendar className="h-6 w-6 text-white" />
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {!user?.isPro && (
          <Card className="mb-8 border-0 bg-gradient-to-r from-amber-50/80 to-orange-50/80 dark:from-amber-950/20 dark:to-orange-950/20 backdrop-blur-sm shadow-lg">
            <CardContent className="p-6">
              <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4">
                <div className="flex items-start gap-4">
                  <div className="w-12 h-12 bg-gradient-to-br from-amber-500 to-orange-500 rounded-xl flex items-center justify-center flex-shrink-0">
                    <Crown className="h-6 w-6 text-white" />
                  </div>
                  <div>
                    <div className="flex items-center gap-3 mb-2">
                      <Badge variant="secondary" className="bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300">Free Plan</Badge>
                      <span className="text-sm font-medium text-slate-600 dark:text-slate-300">{ownedCount}/{maxFreeBoards} boards used</span>
                    </div>
                    <h3 className="font-semibold text-slate-800 dark:text-slate-100 mb-1">
                      {atLimit ? 'Board Limit Reached' : 'Unlock Premium Features'}
                    </h3>
                    <p className="text-sm text-slate-600 dark:text-slate-300">
                      {atLimit
                        ? `You've reached the free limit of ${maxFreeBoards} boards. Upgrade to Pro for unlimited boards and advanced features.`
                        : 'Upgrade to Pro for unlimited boards, advanced analytics, priority support, and more.'}
                    </p>
                  </div>
                </div>
                <Button 
                  onClick={() => router.push('/billing')} 
                  className="bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white border-0 shadow-lg hover:shadow-xl transform hover:-translate-y-0.5 transition-all duration-300 whitespace-nowrap"
                >
                  <Crown className="h-4 w-4 mr-2" />
                  Upgrade to Pro
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {showCreate && (
          <Card className="mb-8 glass-card border-0 shadow-xl">
            <CardHeader className="pb-6">
              <div className="flex items-center gap-3 mb-2">
                <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-purple-500 rounded-xl flex items-center justify-center">
                  <Plus className="h-5 w-5 text-white" />
                </div>
                <div>
                  <CardTitle className="text-xl font-semibold">Create a new board</CardTitle>
                  <CardDescription className="text-slate-600 dark:text-slate-300">Choose a template and customize your board to get started</CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <Tabs defaultValue="basic" className="w-full">
                <TabsList className="grid w-full grid-cols-3 gap-1">
                  <TabsTrigger value="basic">Basic</TabsTrigger>
                  <TabsTrigger value="template">Template</TabsTrigger>
                  <TabsTrigger value="customize">Customize</TabsTrigger>
                </TabsList>
                
                <TabsContent value="basic" className="space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="title">Title</Label>
                      <Input id="title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Project Alpha" />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="color">Color</Label>
                      <Input id="color" type="color" value={color} onChange={(e) => setColor(e.target.value)} />
                    </div>
                    <div className="space-y-2 sm:col-span-2">
                      <Label htmlFor="desc">Description (optional)</Label>
                      <Input id="desc" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Short description" />
                    </div>
                    <div className="flex items-center gap-2 sm:col-span-2">
                      <input id="private" type="checkbox" checked={isPrivate} onChange={(e) => setIsPrivate(e.target.checked)} />
                      <Label htmlFor="private">Private board</Label>
                    </div>
                  </div>
                </TabsContent>

                <TabsContent value="template" className="space-y-4">
                  <div className="space-y-2">
                    <Label>Choose a template</Label>
                    {/* Built-in Templates */}
                    <div className="space-y-2">
                      <div className="text-xs uppercase tracking-wide text-muted-foreground">Built-in Templates</div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                        {builtInTemplates.map((template) => (
                          <div
                            key={template.id}
                            className={`p-4 glass-card border-0 cursor-pointer transition-all hover:shadow-lg hover:-translate-y-1 duration-300 ${
                              selectedTemplate === template.id ? 'ring-2 ring-blue-500 bg-blue-50/50 dark:bg-blue-950/20' : ''
                            }`}
                            onClick={() => setSelectedTemplate(template.id)}
                          >
                            <div className="flex items-center gap-2 mb-2">
                              <div className="w-3 h-3 rounded-full" style={{ backgroundColor: template.color as string }} />
                              <span className="font-medium text-sm">{template.name}</span>
                              <Badge variant="secondary" className="text-xs">Built-in</Badge>
                            </div>
                            <p className="text-xs text-muted-foreground mb-2">{template.description}</p>
                            <div className="flex gap-1 mt-1">
                              {template.lists.slice(0, 4).map((l, i) => (
                                <div key={i} className="flex-1 h-1 bg-gray-200 rounded-full" title={l.title} />
                              ))}
                              {template.lists.length > 4 && (
                                <span className="text-[10px] text-muted-foreground">+{template.lists.length - 4}</span>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Custom Templates */}
                    <div className="space-y-2">
                      <div className="text-xs uppercase tracking-wide text-muted-foreground">Your Templates</div>
                      {customTemplates.length === 0 ? (
                        <div
                          className="p-4 bg-muted/30 rounded-lg border-2 border-dashed text-sm text-muted-foreground"
                        >
                          You have no custom templates yet. Open any board and use &quot;Save as Template&quot; from the board menu.
                        </div>
                      ) : (
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                          {customTemplates.map((template) => (
                            <div
                              key={template.id}
                              className={`p-4 glass-card border-0 cursor-pointer transition-all hover:shadow-lg hover:-translate-y-1 duration-300 ${
                                selectedTemplate === template.id ? 'ring-2 ring-blue-500 bg-blue-50/50 dark:bg-blue-950/20' : ''
                              }`}
                              onClick={() => setSelectedTemplate(template.id)}
                            >
                              <div className="flex items-center gap-2 mb-2">
                                <div className="w-3 h-3 rounded-full" style={{ backgroundColor: template.color }} />
                                <span className="font-medium text-sm">{template.name}</span>
                                <Badge variant="secondary" className="text-xs">Custom</Badge>
                              </div>
                              <p className="text-xs text-muted-foreground mb-2">{template.description}</p>
                              <div className="flex gap-1 mt-1">
                                {template.lists.slice(0, 4).map((l, i) => (
                                  <div key={i} className="flex-1 h-1 bg-gray-200 rounded-full" title={l.title} />
                                ))}
                                {template.lists.length > 4 && (
                                  <span className="text-[10px] text-muted-foreground">+{template.lists.length - 4}</span>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </TabsContent>

                <TabsContent value="customize" className="space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Theme</Label>
                      <Select value={theme} onValueChange={setTheme}>
                        <SelectTrigger>
                          <SelectValue placeholder="Select a theme" />
                        </SelectTrigger>
                        <SelectContent>
                          {BOARD_THEMES.map((themeOption) => (
                            <SelectItem key={themeOption.id} value={themeOption.id}>
                              <div className="flex items-center gap-2">
                                <div className="w-3 h-3 rounded-full" style={{ backgroundColor: themeOption.colors.primary }} />
                                {themeOption.name}
                              </div>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>Background</Label>
                      <Select value={background} onValueChange={setBackground}>
                        <SelectTrigger>
                          <SelectValue placeholder="Select a background" />
                        </SelectTrigger>
                        <SelectContent>
                          {BOARD_BACKGROUNDS.map((bg) => (
                            <SelectItem key={bg.id} value={bg.id}>
                              {bg.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  {background && background !== 'none' && (
                    <div className="p-4 rounded-lg border" style={{ 
                      background: BOARD_BACKGROUNDS.find(bg => bg.id === background)?.url || 'transparent',
                      backgroundSize: background.includes('pattern') ? '20px 20px' : 'cover'
                    }}>
                      <div className="text-sm text-center py-2 bg-white/80 rounded">Preview</div>
                    </div>
                  )}
                </TabsContent>

                <div className="mt-6 pt-4 border-t">
                  {atLimit && (
                    <div className="mb-3 flex items-center gap-2 text-sm text-amber-600">
                      <AlertCircle className="h-4 w-4" />
                      Free plan limited to {maxFreeBoards} boards. Upgrade to Pro to create more.
                    </div>
                  )}
                  <Button onClick={onCreate} disabled={creating || atLimit}>
                    {creating && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}Create Board
                  </Button>
                </div>
              </Tabs>
            </CardContent>
          </Card>
        )}

        {/* Boards Section */}
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-semibold text-slate-800 dark:text-slate-100">Your Boards</h2>
            {boards.length > 0 && (
              <p className="text-sm text-slate-600 dark:text-slate-300">{boards.length} board{boards.length !== 1 ? 's' : ''}</p>
            )}
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {isLoading && (
              <Card className="col-span-full glass-card border-0 shadow-lg">
                <CardContent className="py-16 flex items-center justify-center text-slate-600 dark:text-slate-300">
                  <Loader2 className="h-6 w-6 mr-3 animate-spin" /> 
                  <span className="text-lg">Loading your boards...</span>
                </CardContent>
              </Card>
            )}

            {!isLoading && boards.length === 0 && (
              <Card className="col-span-full glass-card border-0 shadow-lg">
                <CardContent className="py-16 text-center">
                  <div className="space-y-4">
                    <div className="w-16 h-16 mx-auto bg-gradient-to-br from-slate-200 to-slate-300 dark:from-slate-700 dark:to-slate-600 rounded-2xl flex items-center justify-center">
                      <Plus className="h-8 w-8 text-slate-500 dark:text-slate-400" />
                    </div>
                    <div>
                      <h3 className="text-lg font-semibold text-slate-800 dark:text-slate-100 mb-2">No boards yet</h3>
                      <p className="text-slate-600 dark:text-slate-300 mb-4">Create your first board to start organizing your tasks</p>
                    </div>
                    <Button 
                      onClick={() => setShowCreate(true)}
                      className="bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white border-0 shadow-lg hover:shadow-xl transform hover:-translate-y-0.5 transition-all duration-300"
                    >
                      <Plus className="h-4 w-4 mr-2" />
                      Create your first board
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )}

            {boards.map((b) => (
              <Card 
                key={b.id} 
                className="glass-card border-0 shadow-lg hover:shadow-xl hover:-translate-y-1 transition-all duration-300 cursor-pointer group relative overflow-hidden" 
                onClick={() => { router.push(`/boards/${b.id}`) }}
              >
                <div className="absolute inset-0 bg-gradient-to-br from-white/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
                <CardHeader className="relative z-10 pb-4">
                  <div className="flex items-start justify-between mb-3">
                    <div 
                      className="w-4 h-4 rounded-full flex-shrink-0 shadow-sm" 
                      style={{ backgroundColor: b.color }}
                    />
                    <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse" title="Active"></div>
                  </div>
                  <CardTitle className="text-lg font-semibold text-slate-800 dark:text-slate-100 group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors duration-300 line-clamp-1">
                    {b.title}
                  </CardTitle>
                  {b.description && (
                    <CardDescription className="text-slate-600 dark:text-slate-300 line-clamp-2 text-sm">
                      {b.description}
                    </CardDescription>
                  )}
                </CardHeader>
                <CardContent className="relative z-10 pt-0">
                  <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
                    <span>Updated recently</span>
                    <span className="flex items-center gap-1">
                      <Users className="h-3 w-3" />
                      3
                    </span>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
