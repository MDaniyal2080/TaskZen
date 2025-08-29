'use client';

import { useEffect, useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuthStore } from '@/store/auth';
import { CalendarView } from '@/components/calendar/CalendarView';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Calendar, ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';

function CalendarInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const boardId = searchParams.get('boardId') || undefined;

  return (
    <>
      <div className="flex items-center gap-2 sm:gap-4 mb-6 sm:mb-8">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => router.back()}
          className="shrink-0"
        >
          <ArrowLeft className="h-4 w-4 sm:h-5 sm:w-5" />
        </Button>
        <div>
          <h1 className="text-xl sm:text-2xl md:text-3xl font-bold text-slate-900 dark:text-white">
            Calendar View
          </h1>
          <p className="text-xs sm:text-sm md:text-base text-slate-600 dark:text-slate-400 mt-1">
            {boardId ? 'View cards with due dates for this board' : 'View all cards with due dates across your workspace'}
          </p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Calendar className="h-5 w-5" />
            {boardId ? 'Board Calendar' : 'All Cards Calendar'}
          </CardTitle>
          <CardDescription>
            Cards are displayed on their due dates. Click any card to open its details.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <CalendarView boardId={boardId} />
        </CardContent>
      </Card>
    </>
  );
}

export default function CalendarPage() {
  const router = useRouter();
  const { token, fetchMe } = useAuthStore();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const init = async () => {
      if (!token) await fetchMe();
      if (!useAuthStore.getState().token) {
        router.replace('/login');
        return;
      }
      setReady(true);
    };
    init();
  }, [token, fetchMe, router]);

  if (!ready) return null;

  return (
    <div className="min-h-screen  from-slate-50 via-blue-50 to-indigo-100 dark:from-slate-900 dark:via-slate-800 dark:to-slate-900">
      <div className="container mx-auto px-4 sm:px-6 py-6 sm:py-8 max-w-7xl">
        <Suspense fallback={<div />}> 
          <CalendarInner />
        </Suspense>
      </div>
    </div>
  );
}
