'use client';

import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Search, X, Clock, FileText, Layout, Loader2, List as ListIcon } from 'lucide-react';
import { api } from '@/lib/api';
import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';

// Simple debounce utility
function debounce<TArgs extends unknown[]>(
  func: (...args: TArgs) => void,
  wait: number
): (...args: TArgs) => void {
  let timeout: ReturnType<typeof setTimeout> | null = null;
  return (...args: TArgs) => {
    if (timeout) clearTimeout(timeout);
    timeout = setTimeout(() => func(...args), wait);
  };
}

interface SearchResult {
  boards: Array<{
    id: string;
    title: string;
    description?: string;
    owner: {
      username: string;
      firstName?: string;
      lastName?: string;
    };
    _count: {
      lists: number;
      members: number;
    };
  }>;
  lists: Array<{
    id: string;
    title: string;
    board: {
      id: string;
      title: string;
    };
    _count: {
      cards: number;
    };
  }>;
  cards: Array<{
    id: string;
    title: string;
    description?: string;
    list: {
      id: string;
      title: string;
      board: {
        id: string;
        title: string;
      };
    };
    labels: Array<{
      id: string;
      name: string;
      color: string;
    }>;
    _count: {
      comments: number;
      attachments: number;
    };
  }>;
}

interface GlobalSearchProps {
  initialQuery?: string;
  autoFocus?: boolean;
}

export function GlobalSearch({ initialQuery = '', autoFocus = false }: GlobalSearchProps = {}) {
  const [isOpen, setIsOpen] = useState(autoFocus);
  const [query, setQuery] = useState(initialQuery);
  const [results, setResults] = useState<SearchResult | null>(null);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [recentSearches, setRecentSearches] = useState<Array<{ query: string; timestamp: string }>>([]);
  const [loading, setLoading] = useState(false);
  const searchRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  // Close on click outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Cmd/Ctrl + K to open search
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setIsOpen(true);
        setTimeout(() => inputRef.current?.focus(), 100);
      }

      // Escape to close
      if (e.key === 'Escape' && isOpen) {
        setIsOpen(false);
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen]);

  // Fetch recent searches when opened
  useEffect(() => {
    if (isOpen && !query) {
      fetchRecentSearches();
    }
  }, [isOpen, query]);
 
  // Debounced search (declare before first usage)
  const debouncedSearch = useMemo(
    () =>
      debounce(async (searchQuery: string) => {
        if (!searchQuery || searchQuery.length < 2) {
          setResults(null);
          setSuggestions([]);
          return;
        }
 
        setLoading(true);
        try {
          const [searchRes, suggestionsRes] = await Promise.all([
            api.get('/search', { params: { q: searchQuery } }),
            api.get('/search/suggestions', { params: { q: searchQuery } }),
          ]);
          setResults(searchRes.data);
          setSuggestions(suggestionsRes.data);
        } catch (error) {
          console.error('Search failed:', error);
          toast.error('Search failed');
        } finally {
          setLoading(false);
        }
      }, 300),
    []
  );
  
  // Auto-focus and search initial query
  useEffect(() => {
    if (autoFocus && initialQuery) {
      setIsOpen(true);
      setTimeout(() => {
        inputRef.current?.focus();
        debouncedSearch(initialQuery);
      }, 100);
    }
  }, [autoFocus, initialQuery, debouncedSearch]);

  const fetchRecentSearches = async () => {
    try {
      const response = await api.get('/search/recent');
      setRecentSearches(response.data);
    } catch (error) {
      console.error('Failed to fetch recent searches:', error);
    }
  };

  

  useEffect(() => {
    debouncedSearch(query);
  }, [query, debouncedSearch]);

  const handleResultClick = (type: 'board' | 'list' | 'card', id: string, boardId?: string) => {
    setIsOpen(false);
    setQuery('');
    
    if (type === 'board') {
      router.push(`/boards/${id}`);
    } else if (type === 'list' && boardId) {
      // Navigate to the list's board (optionally include list param for future deep-linking)
      router.push(`/boards/${boardId}?list=${id}`);
    } else if (type === 'card' && boardId) {
      router.push(`/boards/${boardId}?card=${id}`);
    }
  };

  const handleSuggestionClick = (suggestion: string) => {
    setQuery(suggestion);
    inputRef.current?.focus();
  };

  const getTotalResults = () => {
    if (!results) return 0;
    return (results.boards?.length || 0) + (results.lists?.length || 0) + (results.cards?.length || 0);
  };

  return (
    <>
      {/* Search Trigger Button */}
      <button
        onClick={() => {
          setIsOpen(true);
          setTimeout(() => inputRef.current?.focus(), 100);
        }}
        className="flex items-center gap-2 px-3 py-1.5 text-sm text-gray-600 dark:text-gray-400 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-lg transition-colors"
      >
        <Search className="h-4 w-4" />
        <span className="hidden md:inline">Search...</span>
        <kbd className="hidden md:inline-flex items-center gap-1 px-1.5 py-0.5 text-xs bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-600 rounded">
          ⌘K
        </kbd>
      </button>

      {/* Search Modal */}
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-start justify-center pt-20 bg-black/50">
          <div
            ref={searchRef}
            className="w-full max-w-2xl bg-white dark:bg-gray-900 rounded-lg shadow-xl overflow-hidden"
          >
            {/* Search Input */}
            <div className="flex items-center gap-3 p-4 border-b border-gray-200 dark:border-gray-700">
              <Search className="h-5 w-5 text-gray-400" />
              <input
                ref={inputRef}
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search boards, lists, cards..."
                className="flex-1 text-base bg-transparent outline-none placeholder-gray-400"
              />
              {loading && <Loader2 className="h-4 w-4 animate-spin text-gray-400" />}
              {query && (
                <button
                  onClick={() => setQuery('')}
                  className="p-1 hover:bg-gray-100 dark:hover:bg-gray-800 rounded"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>

            {/* Results */}
            <div className="max-h-[60vh] overflow-y-auto">
              {/* Recent Searches */}
              {!query && recentSearches.length > 0 && (
                <div className="p-4">
                  <div className="flex items-center gap-2 mb-3 text-xs text-gray-500 dark:text-gray-400">
                    <Clock className="h-3 w-3" />
                    Recent Searches
                  </div>
                  {recentSearches.map((recent, idx) => (
                    <button
                      key={idx}
                      onClick={() => setQuery(recent.query)}
                      className="block w-full text-left px-3 py-2 text-sm hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg"
                    >
                      {recent.query}
                    </button>
                  ))}
                </div>
              )}

              {/* Suggestions */}
              {query && suggestions.length > 0 && (
                <div className="p-4 border-b border-gray-200 dark:border-gray-700">
                  <div className="text-xs text-gray-500 dark:text-gray-400 mb-2">Suggestions</div>
                  <div className="flex flex-wrap gap-2">
                    {suggestions.map((suggestion, idx) => (
                      <button
                        key={idx}
                        onClick={() => handleSuggestionClick(suggestion)}
                        className="px-2 py-1 text-xs bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-full"
                      >
                        {suggestion}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Search Results */}
              {results && getTotalResults() > 0 && (
                <>
                  {/* Boards */}
                  {results.boards && results.boards.length > 0 && (
                    <div className="p-4">
                      <div className="flex items-center gap-2 mb-3 text-xs text-gray-500 dark:text-gray-400">
                        <Layout className="h-3 w-3" />
                        Boards
                      </div>
                      {results.boards.map((board) => (
                        <button
                          key={board.id}
                          onClick={() => handleResultClick('board', board.id)}
                          className="block w-full text-left px-3 py-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg"
                        >
                          <div className="font-medium text-sm">{board.title}</div>
                          {board.description && (
                            <div className="text-xs text-gray-500 dark:text-gray-400 truncate">
                              {board.description}
                            </div>
                          )}
                          <div className="flex items-center gap-3 mt-1 text-xs text-gray-400">
                            <span>{board._count.lists} lists</span>
                            <span>{board._count.members} members</span>
                          </div>
                        </button>
                      ))}
                    </div>
                  )}

                  {/* Lists */}
                  {results.lists && results.lists.length > 0 && (
                    <div className="p-4">
                      <div className="flex items-center gap-2 mb-3 text-xs text-gray-500 dark:text-gray-400">
                        <ListIcon className="h-3 w-3" />
                        Lists
                      </div>
                      {results.lists.map((list) => (
                        <button
                          key={list.id}
                          onClick={() => handleResultClick('list', list.id, list.board.id)}
                          className="block w-full text-left px-3 py-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg"
                        >
                          <div className="font-medium text-sm">{list.title}</div>
                          <div className="text-xs text-gray-500 dark:text-gray-400">
                            {list.board.title}
                          </div>
                          <div className="flex items-center gap-2 mt-2 text-xs text-gray-400">
                            <span>{list._count.cards} cards</span>
                          </div>
                        </button>
                      ))}
                    </div>
                  )}

                  {/* Cards */}
                  {results.cards && results.cards.length > 0 && (
                    <div className="p-4">
                      <div className="flex items-center gap-2 mb-3 text-xs text-gray-500 dark:text-gray-400">
                        <FileText className="h-3 w-3" />
                        Cards
                      </div>
                      {results.cards.map((card) => (
                        <button
                          key={card.id}
                          onClick={() => handleResultClick('card', card.id, card.list.board.id)}
                          className="block w-full text-left px-3 py-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg"
                        >
                          <div className="font-medium text-sm">{card.title}</div>
                          <div className="text-xs text-gray-500 dark:text-gray-400">
                            {card.list.board.title} → {card.list.title}
                          </div>
                          <div className="flex items-center gap-2 mt-2">
                            {card.labels.map((label) => (
                              <span
                                key={label.id}
                                className="inline-flex items-center px-2 py-0.5 rounded-full text-xs text-white"
                                style={{ backgroundColor: label.color }}
                              >
                                {label.name}
                              </span>
                            ))}
                            {card._count.comments > 0 && (
                              <span className="text-xs text-gray-400">
                                {card._count.comments} comments
                              </span>
                            )}
                            {card._count.attachments > 0 && (
                              <span className="text-xs text-gray-400">
                                {card._count.attachments} files
                              </span>
                            )}
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                </>
              )}

              {/* No Results */}
              {query && results && getTotalResults() === 0 && (
                <div className="p-8 text-center text-sm text-gray-500 dark:text-gray-400">
                  No results found for &quot;{query}&quot;
                </div>
              )}

              {/* Empty State */}
              {!query && recentSearches.length === 0 && (
                <div className="p-8 text-center text-sm text-gray-500 dark:text-gray-400">
                  Start typing to search...
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="p-3 border-t border-gray-200 dark:border-gray-700 flex items-center justify-between text-xs text-gray-500 dark:text-gray-400">
              <div className="flex items-center gap-4">
                <span>↑↓ Navigate</span>
                <span>↵ Select</span>
                <span>ESC Close</span>
              </div>
              {results && getTotalResults() > 0 && (
                <span>{getTotalResults()} results</span>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
