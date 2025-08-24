'use client'

 import Link from 'next/link'
 import { useRouter } from 'next/navigation'
 import { useEffect, useState } from 'react'
 import { useForm } from 'react-hook-form'
 import { z } from 'zod'
 import { zodResolver } from '@hookform/resolvers/zod'
 import { Button } from '@/components/ui/button'
 import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
 import { Input } from '@/components/ui/input'
 import { Label } from '@/components/ui/label'
 import { useAuthStore } from '@/store/auth'
 import type { RegisterRequest } from '@/shared/types'
 import { toast } from 'react-hot-toast'
 import { Eye, EyeOff, Loader2 } from 'lucide-react'
 import { useSettings } from '@/contexts/SettingsContext'

 const schema = z.object({
  email: z.string().email('Invalid email'),
  username: z.string().min(3, 'Min 3 chars').max(20, 'Max 20 chars'),
  password: z.string().min(6, 'Min 6 chars'),
  firstName: z.string().max(50, 'Max 50 chars').optional().or(z.literal('')),
  lastName: z.string().max(50, 'Max 50 chars').optional().or(z.literal('')),
 })
 
 type FormValues = z.infer<typeof schema>
 
 export default function RegisterPage() {
  const router = useRouter()
  const { register: doRegister, isLoading } = useAuthStore()
  const { settings } = useSettings()
  const appName = settings?.siteName || 'TaskZen'
  const [showPassword, setShowPassword] = useState(false)
 
  // Redirect away if already logged in
  useEffect(() => {
    const current = useAuthStore.getState().user
    if (current) {
      router.replace(current.role === 'ADMIN' ? '/admin' : '/boards')
    }
  }, [router])
 
  const { register, handleSubmit, formState: { errors } } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      email: '',
      username: '',
      password: '',
      firstName: '',
      lastName: '',
    },
  })
 
  const onSubmit = async (values: FormValues) => {
    const payload: RegisterRequest = {
      email: values.email,
      username: values.username,
      password: values.password,
      firstName: values.firstName || undefined,
      lastName: values.lastName || undefined,
    }
    try {
      const user = await doRegister(payload)
      toast.success('Account created!')

      // Redirect based on user role
      if (user.role === 'ADMIN') {
        router.replace('/admin')
      } else {
        router.replace('/boards')
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Registration failed'
      toast.error(message)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center  from-slate-50 via-emerald-50 to-indigo-100 dark:from-slate-900 dark:via-slate-800 dark:to-slate-900 p-4">
      <Card className="w-full max-w-md glass border-0 shadow-xl">
        <CardHeader className="text-center space-y-4">
          <div className="mx-auto w-16 h-16 bg-gradient-to-r from-primary to-secondary rounded-full flex items-center justify-center">
            <span className="text-2xl font-bold text-white">T</span>
          </div>
          <div>
            <CardTitle className="text-2xl font-bold">Create your account</CardTitle>
            <CardDescription>Join {appName} and start organizing your work</CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input id="email" type="email" placeholder="you@example.com" {...register('email')} disabled={isLoading} />
              {errors.email && <p className="text-sm text-red-600">{errors.email.message}</p>}
            </div>
            <div className="space-y-2">
              <Label htmlFor="username">Username</Label>
              <Input id="username" type="text" placeholder="yourname" {...register('username')} disabled={isLoading} />
              {errors.username && <p className="text-sm text-red-600">{errors.username.message}</p>}
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <div className="relative">
                <Input id="password" type={showPassword ? 'text' : 'password'} placeholder="Create a password" {...register('password')} disabled={isLoading} />
                <Button type="button" variant="ghost" size="sm" className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent" onClick={() => setShowPassword(!showPassword)} disabled={isLoading}>
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </Button>
              </div>
              {errors.password && <p className="text-sm text-red-600">{errors.password.message}</p>}
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="firstName">First name (optional)</Label>
                <Input id="firstName" type="text" placeholder="Jane" {...register('firstName')} disabled={isLoading} />
                {errors.firstName && <p className="text-sm text-red-600">{errors.firstName.message}</p>}
              </div>
              <div className="space-y-2">
                <Label htmlFor="lastName">Last name (optional)</Label>
                <Input id="lastName" type="text" placeholder="Doe" {...register('lastName')} disabled={isLoading} />
                {errors.lastName && <p className="text-sm text-red-600">{errors.lastName.message}</p>}
              </div>
            </div>
            <Button type="submit" className="w-full" disabled={isLoading}>
              {isLoading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Creating account...
                </>
              ) : (
                'Create account'
              )}
            </Button>
          </form>
          <div className="mt-6 text-center text-sm">
            <span className="text-muted-foreground">Already have an account? </span>
            <Link href="/login" className="text-primary hover:underline font-medium">Sign in</Link>
          </div>
        </CardContent>
      </Card>
    </div>
  )
 }
