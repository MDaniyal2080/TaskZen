'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { useAuthStore } from '@/store/auth'
import { api } from '@/lib/api'
import { toast } from 'react-hot-toast'
import { format } from 'date-fns'
import axios from 'axios'
import {
  Search,
  MoreHorizontal,
  Eye,
  Trash2,
  Users,
  Layout,
  RefreshCw,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react'
import { InlineSpinner } from '@/components/loading/LoadingStates'

// Types based on Admin API response
type AdminBoard = {
  id: string
  title: string | null
  description: string | null
  backgroundColor: string | null
  backgroundImage: string | null
  isPublic: boolean
  createdAt: string
  updatedAt: string
  ownerId: string
  owner: {
    id: string
    username: string | null
    email: string
  }
  _count: {
    members: number
    lists: number
  }
}

export default function BoardsManagementPage() {
  const router = useRouter()
  const queryClient = useQueryClient()
  const { fetchMe } = useAuthStore()
  const [ready, setReady] = useState(false)

  // Search and filter states
  const [searchQuery, setSearchQuery] = useState('')
  const [filterVisibility, setFilterVisibility] = useState<'all' | 'public' | 'private'>('all')
  const [sortBy, setSortBy] = useState<'created' | 'updated' | 'title' | 'lists'>('created')
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc')

  // Pagination
  const [currentPage, setCurrentPage] = useState(1)
  const itemsPerPage = 10

  // Dialog states
  const [showDeleteDialog, setShowDeleteDialog] = useState(false)
  const [selectedBoard, setSelectedBoard] = useState<AdminBoard | null>(null)
  const [showBoardDetails, setShowBoardDetails] = useState(false)

  // Check auth on mount
  useEffect(() => {
    fetchMe().then(() => setReady(true))
  }, [fetchMe])

  // Fetch boards
  const { data: boards = [], isLoading, error, refetch } = useQuery({
    queryKey: ['admin-boards'],
    queryFn: async () => {
      const response = await api.get('/admin/boards')
      return response.data as AdminBoard[]
    },
    enabled: ready,
  })

  // Delete board mutation
  const deleteBoardMutation = useMutation({
    mutationFn: async (boardId: string) => {
      await api.delete(`/admin/boards/${boardId}`)
    },
    onSuccess: () => {
      toast.success('Board deleted successfully')
      queryClient.invalidateQueries({ queryKey: ['admin-boards'] })
      setShowDeleteDialog(false)
      setSelectedBoard(null)
    },
    onError: (error: unknown) => {
      const message = axios.isAxiosError(error)
        ? (error.response?.data as { message?: string } | undefined)?.message
        : error instanceof Error
          ? error.message
          : undefined
      toast.error(message || 'Failed to delete board')
    },
  })

  // Filter and sort boards
  const filteredBoards = boards
    .filter(board => {
      const matchesSearch = 
        board.title?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        board.owner.username?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        board.owner.email.toLowerCase().includes(searchQuery.toLowerCase())
      
      const matchesVisibility = 
        filterVisibility === 'all' ||
        (filterVisibility === 'public' && board.isPublic) ||
        (filterVisibility === 'private' && !board.isPublic)
      
      return matchesSearch && matchesVisibility
    })
    .sort((a, b) => {
      let comparison = 0
      switch (sortBy) {
        case 'title':
          comparison = (a.title || '').localeCompare(b.title || '')
          break
        case 'lists':
          comparison = a._count.lists - b._count.lists
          break
        case 'updated':
          comparison = new Date(a.updatedAt).getTime() - new Date(b.updatedAt).getTime()
          break
        case 'created':
        default:
          comparison = new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
      }
      return sortOrder === 'asc' ? comparison : -comparison
    })

  // Pagination
  const totalPages = Math.ceil(filteredBoards.length / itemsPerPage)
  const paginatedBoards = filteredBoards.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  )

  // Stats
  const totalBoards = boards.length
  const publicBoards = boards.filter(b => b.isPublic).length
  const totalLists = boards.reduce((sum, b) => sum + b._count.lists, 0)
  const avgListsPerBoard = totalBoards > 0 ? (totalLists / totalBoards).toFixed(1) : '0'
  const totalMembers = boards.reduce((sum, b) => sum + b._count.members, 0)

  if (!ready) {
    return <div className="flex items-center justify-center h-full">Loading...</div>
  }

  if (error) {
    return (
      <div className="p-6">
        <Card>
          <CardContent className="p-6">
            <p className="text-red-500">Error loading boards. Please try again.</p>
            <Button onClick={() => refetch()} className="mt-4">
              <RefreshCw className="h-4 w-4 mr-2" />
              Retry
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold">Board Management</h1>
          <p className="text-muted-foreground mt-2">
            Manage all boards, view details, and control access
          </p>
        </div>
        <Button onClick={() => refetch()} variant="outline">
          <RefreshCw className="h-4 w-4 mr-2" />
          Refresh
        </Button>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Total Boards
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalBoards}</div>
            <p className="text-xs text-muted-foreground mt-1">
              All boards in system
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Public Boards
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{publicBoards}</div>
            <p className="text-xs text-muted-foreground mt-1">
              Visible to everyone
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Avg Lists/Board
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{avgListsPerBoard}</div>
            <p className="text-xs text-muted-foreground mt-1">
              Average list count
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Total Members
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalMembers}</div>
            <p className="text-xs text-muted-foreground mt-1">
              Across all boards
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Filters and Search */}
      <Card>
        <CardHeader>
          <CardTitle>Boards</CardTitle>
          <CardDescription>
            View and manage all boards in the system
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col sm:flex-row gap-4 mb-6">
            <div className="flex-1">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search by title, owner..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9"
                />
              </div>
            </div>
            <Select value={filterVisibility} onValueChange={(v) => setFilterVisibility(v as 'all' | 'public' | 'private')}>
              <SelectTrigger className="w-full sm:w-[150px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Boards</SelectItem>
                <SelectItem value="public">Public</SelectItem>
                <SelectItem value="private">Private</SelectItem>
              </SelectContent>
            </Select>
            <Select value={sortBy} onValueChange={(v) => setSortBy(v as 'created' | 'updated' | 'title' | 'lists')}>
              <SelectTrigger className="w-full sm:w-[150px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="created">Created Date</SelectItem>
                <SelectItem value="updated">Updated Date</SelectItem>
                <SelectItem value="title">Title</SelectItem>
                <SelectItem value="lists">List Count</SelectItem>
              </SelectContent>
            </Select>
            <Button
              variant="outline"
              size="icon"
              onClick={() => setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc')}
            >
              {sortOrder === 'asc' ? '↑' : '↓'}
            </Button>
          </div>

          {/* Boards Table */}
          <div className="rounded-md border overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Board</TableHead>
                  <TableHead>Owner</TableHead>
                  <TableHead>Visibility</TableHead>
                  <TableHead>Lists</TableHead>
                  <TableHead>Members</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead>Updated</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center py-8">
                      <div className="flex items-center justify-center gap-2 text-muted-foreground">
                        <InlineSpinner />
                        <span>Loading boards...</span>
                      </div>
                    </TableCell>
                  </TableRow>
                ) : paginatedBoards.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center py-8">
                      No boards found
                    </TableCell>
                  </TableRow>
                ) : (
                  paginatedBoards.map((board) => (
                    <TableRow key={board.id}>
                      <TableCell>
                        <div>
                          <p className="font-medium">
                            {board.title || 'Untitled Board'}
                          </p>
                          {board.description && (
                            <p className="text-xs text-muted-foreground truncate max-w-[60vw] sm:max-w-[200px]">
                              {board.description}
                            </p>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div>
                          <p className="text-sm">
                            {board.owner.username || 'No username'}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {board.owner.email}
                          </p>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant={board.isPublic ? 'default' : 'secondary'}>
                          {board.isPublic ? 'Public' : 'Private'}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          <Layout className="h-3 w-3 text-muted-foreground" />
                          {board._count.lists}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          <Users className="h-3 w-3 text-muted-foreground" />
                          {board._count.members}
                        </div>
                      </TableCell>
                      <TableCell>
                        <span className="text-sm text-muted-foreground">
                          {format(new Date(board.createdAt), 'MMM d, yyyy')}
                        </span>
                      </TableCell>
                      <TableCell>
                        <span className="text-sm text-muted-foreground">
                          {format(new Date(board.updatedAt), 'MMM d, yyyy')}
                        </span>
                      </TableCell>
                      <TableCell className="text-right">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon">
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuLabel>Actions</DropdownMenuLabel>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              onClick={() => {
                                setSelectedBoard(board)
                                setShowBoardDetails(true)
                              }}
                            >
                              <Eye className="h-4 w-4 mr-2" />
                              View Details
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onClick={() => router.push(`/board/${board.id}`)}
                            >
                              <Layout className="h-4 w-4 mr-2" />
                              Open Board
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              className="text-red-600"
                              onClick={() => {
                                setSelectedBoard(board)
                                setShowDeleteDialog(true)
                              }}
                            >
                              <Trash2 className="h-4 w-4 mr-2" />
                              Delete Board
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between mt-4">
              <p className="text-sm text-muted-foreground">
                Showing {(currentPage - 1) * itemsPerPage + 1} to{' '}
                {Math.min(currentPage * itemsPerPage, filteredBoards.length)} of{' '}
                {filteredBoards.length} boards
              </p>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                  disabled={currentPage === 1}
                >
                  <ChevronLeft className="h-4 w-4" />
                  Previous
                </Button>
                <div className="flex items-center gap-1">
                  {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                    let pageNum
                    if (totalPages <= 5) {
                      pageNum = i + 1
                    } else if (currentPage <= 3) {
                      pageNum = i + 1
                    } else if (currentPage >= totalPages - 2) {
                      pageNum = totalPages - 4 + i
                    } else {
                      pageNum = currentPage - 2 + i
                    }
                    return (
                      <Button
                        key={pageNum}
                        variant={currentPage === pageNum ? 'default' : 'outline'}
                        size="sm"
                        onClick={() => setCurrentPage(pageNum)}
                      >
                        {pageNum}
                      </Button>
                    )
                  })}
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                  disabled={currentPage === totalPages}
                >
                  Next
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Delete Confirmation Dialog */}
      <Dialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Board</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete this board? This action cannot be undone.
              All lists, cards, and associated data will be permanently deleted.
            </DialogDescription>
          </DialogHeader>
          {selectedBoard && (
            <div className="space-y-2 py-4">
              <p><strong>Board:</strong> {selectedBoard.title || 'Untitled Board'}</p>
              <p><strong>Owner:</strong> {selectedBoard.owner.email}</p>
              <p><strong>Lists:</strong> {selectedBoard._count.lists}</p>
              <p><strong>Members:</strong> {selectedBoard._count.members}</p>
            </div>
          )}
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowDeleteDialog(false)}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => selectedBoard && deleteBoardMutation.mutate(selectedBoard.id)}
              disabled={deleteBoardMutation.isPending}
            >
              {deleteBoardMutation.isPending ? 'Deleting...' : 'Delete Board'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Board Details Dialog */}
      <Dialog open={showBoardDetails} onOpenChange={setShowBoardDetails}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Board Details</DialogTitle>
          </DialogHeader>
          {selectedBoard && (
            <div className="space-y-4 py-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="text-muted-foreground">Title</Label>
                  <p className="font-medium">{selectedBoard.title || 'Untitled Board'}</p>
                </div>
                <div>
                  <Label className="text-muted-foreground">Board ID</Label>
                  <p className="font-mono text-sm">{selectedBoard.id}</p>
                </div>
                <div>
                  <Label className="text-muted-foreground">Owner</Label>
                  <p>{selectedBoard.owner.username || selectedBoard.owner.email}</p>
                </div>
                <div>
                  <Label className="text-muted-foreground">Visibility</Label>
                  <Badge variant={selectedBoard.isPublic ? 'default' : 'secondary'}>
                    {selectedBoard.isPublic ? 'Public' : 'Private'}
                  </Badge>
                </div>
                <div>
                  <Label className="text-muted-foreground">Lists</Label>
                  <p>{selectedBoard._count.lists}</p>
                </div>
                <div>
                  <Label className="text-muted-foreground">Members</Label>
                  <p>{selectedBoard._count.members}</p>
                </div>
                <div>
                  <Label className="text-muted-foreground">Created</Label>
                  <p>{format(new Date(selectedBoard.createdAt), 'PPpp')}</p>
                </div>
                <div>
                  <Label className="text-muted-foreground">Last Updated</Label>
                  <p>{format(new Date(selectedBoard.updatedAt), 'PPpp')}</p>
                </div>
              </div>
              {selectedBoard.description && (
                <div>
                  <Label className="text-muted-foreground">Description</Label>
                  <p className="mt-1">{selectedBoard.description}</p>
                </div>
              )}
              {selectedBoard.backgroundColor && (
                <div>
                  <Label className="text-muted-foreground">Background Color</Label>
                  <div className="flex items-center gap-2 mt-1">
                    <div
                      className="w-6 h-6 rounded border"
                      style={{ backgroundColor: selectedBoard.backgroundColor }}
                    />
                    <span className="font-mono text-sm">{selectedBoard.backgroundColor}</span>
                  </div>
                </div>
              )}
            </div>
          )}
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => router.push(`/board/${selectedBoard?.id}`)}
            >
              <Layout className="h-4 w-4 mr-2" />
              Open Board
            </Button>
            <Button onClick={() => setShowBoardDetails(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
