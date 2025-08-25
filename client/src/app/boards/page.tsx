'use client'

 import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { useAuthStore } from '@/store/auth'
 import { useQuery, useQueryClient } from '@tanstack/react-query'
 import { getBoards } from '@/lib/boards'
 import type { Board } from '@/shared/types'
 import { Loader2, Crown, AlertCircle } from 'lucide-react'
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
    <div className="min-h-screen p-6  from-slate-50 via-blue-50 to-indigo-100 dark:from-slate-900 dark:via-slate-800 dark:to-slate-900">
      <div className="mx-auto max-w-6xl">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold">Your Boards</h1>
            <p className="text-sm text-muted-foreground">Browse and open your boards</p>
          </div>
          <div className="flex gap-2">
            <Button onClick={() => router.push('/')}>Home</Button>
            {user?.role === 'ADMIN' && (
              <Button variant="outline" onClick={() => router.push('/admin')}>Admin Dashboard</Button>
            )}
            {!user?.isPro && (
              <Button variant="outline" onClick={() => router.push('/billing')}>Upgrade</Button>
            )}
            <Button onClick={() => setShowCreate((v) => !v)} disabled={atLimit}>{showCreate ? 'Close' : 'New Board'}</Button>
          </div>
        </div>

        {!user?.isPro && (
          <Card className="mb-6 border-dashed border-violet-300/60 bg-violet-50/50 dark:bg-violet-950/20">
            <CardContent className="py-4 flex items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <Crown className="h-5 w-5 text-violet-600" />
                <div>
                  <div className="flex items-center gap-2">
                    <Badge variant="secondary">Free plan</Badge>
                    <span className="text-sm text-muted-foreground">{ownedCount}/{maxFreeBoards} boards used</span>
                  </div>
                  <p className="text-sm mt-1">
                    {atLimit
                      ? `You've reached the free limit of ${maxFreeBoards} boards. Upgrade to create unlimited boards.`
                      : `Upgrade to Pro for unlimited boards and advanced features.`}
                  </p>
                </div>
              </div>
              <Button onClick={() => router.push('/billing')} className="whitespace-nowrap">Upgrade to Pro</Button>
            </CardContent>
          </Card>
        )}

        {showCreate && (
          <Card className="mb-6">
            <CardHeader>
              <CardTitle>Create a new board</CardTitle>
              <CardDescription>Choose a template and customize your board</CardDescription>
            </CardHeader>
            <CardContent>
              <Tabs defaultValue="basic" className="w-full">
                <TabsList className="grid w-full grid-cols-3">
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
                            className={`p-3 border rounded-lg cursor-pointer transition-all hover:shadow-md ${
                              selectedTemplate === template.id ? 'border-primary bg-primary/5' : 'border-gray-200'
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
                              className={`p-3 border rounded-lg cursor-pointer transition-all hover:shadow-md ${
                                selectedTemplate === template.id ? 'border-primary bg-primary/5' : 'border-gray-200'
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

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {isLoading && (
            <Card className="col-span-full">
              <CardContent className="py-10 flex items-center justify-center text-muted-foreground">
                <Loader2 className="h-5 w-5 mr-2 animate-spin" /> Loading boards...
              </CardContent>
            </Card>
          )}

          {!isLoading && boards.length === 0 && (
            <Card className="col-span-full">
              <CardContent className="py-10 text-center text-muted-foreground">
                <div className="space-y-3">
                  <div>You have no boards yet.</div>
                  <Button onClick={() => setShowCreate(true)}>Create your first board</Button>
                </div>
              </CardContent>
            </Card>
          )}

          {boards.map((b) => (
            <Card key={b.id} className="cursor-pointer hover:shadow-md transition" onClick={() => { router.push(`/boards/${b.id}`) }}>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <span className="inline-block w-3 h-3 rounded-full" style={{ backgroundColor: b.color }} />
                  {b.title}
                </CardTitle>
                {b.description && (
                  <CardDescription className="line-clamp-2">{b.description}</CardDescription>
                )}
              </CardHeader>
            </Card>
          ))}
        </div>
      </div>
    </div>
  )
}
