'use client'

import { useState } from 'react'
import { handleGoogleSignIn, handleEmailSignIn } from '@/app/actions/auth'
import Link from 'next/link'

const LoginForm = () => {
    const [formData, setFormData] = useState({
        email: '',
        password: ''
    })
    const [isLoading, setIsLoading] = useState(false)

    const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault()
        setIsLoading(true)
        try {
            await handleEmailSignIn(formData.email, formData.password)
        } catch (error) {
            console.error('Sign in error:', error)
        } finally {
            setIsLoading(false)
        }
    }

    const handleGoogleAuth = async () => {
        setIsLoading(true)
        try {
            await handleGoogleSignIn()
        } catch (error) {
            console.error('Google auth error:', error)
            setIsLoading(false)
        }
    }

    return (
        <div className="space-y-5">
            <form onSubmit={handleSubmit} className="space-y-5">
                <div>
                    <label htmlFor="email" className="mb-2 block text-sm font-medium text-white">
                        Email
                    </label>
                    <input
                        type="email"
                        id="email"
                        value={formData.email}
                        onChange={e => setFormData({ ...formData, email: e.target.value })}
                        placeholder="you@example.com"
                        required
                        disabled={isLoading}
                        className="w-full rounded border border-neutral-800 bg-black px-4 py-3 text-white transition-colors focus:border-neutral-600 focus:outline-none disabled:opacity-50"
                    />
                </div>

                <div>
                    <label htmlFor="password" className="mb-2 block text-sm font-medium text-white">
                        Password
                    </label>
                    <input
                        type="password"
                        id="password"
                        value={formData.password}
                        onChange={e => setFormData({ ...formData, password: e.target.value })}
                        placeholder="••••••••"
                        required
                        disabled={isLoading}
                        className="w-full rounded border border-neutral-800 bg-black px-4 py-3 text-white transition-colors focus:border-neutral-600 focus:outline-none disabled:opacity-50"
                    />
                </div>

                <div className="text-right">
                    <Link href="/account/forgot-password" className="text-sm text-orange-500 transition-colors hover:text-orange-400">
                        Forgot password?
                    </Link>
                </div>

                <button type="submit" disabled={isLoading} className="w-full cursor-pointer rounded bg-white py-3 font-medium text-black transition-colors hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-50">
                    {isLoading ? 'Signing in...' : 'Sign in'}
                </button>
            </form>

            <div className="relative my-6">
                <div className="absolute inset-0 flex items-center">
                    <div className="w-full border-t border-neutral-800"></div>
                </div>
                <div className="relative flex justify-center text-sm">
                    <span className="bg-[#1b1b1b] px-2 text-xs text-gray-500 uppercase">Or continue with</span>
                </div>
            </div>

            <button onClick={handleGoogleAuth} disabled={isLoading} className="flex w-full cursor-pointer items-center justify-center gap-2 rounded border border-neutral-800 bg-black py-3 font-medium text-white transition-colors hover:border-neutral-700 disabled:cursor-not-allowed disabled:opacity-50">
                <svg className="h-5 w-5" viewBox="0 0 24 24">
                    <path fill="#fff" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                    <path fill="#fff" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                    <path fill="#fff" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                    <path fill="#fff" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
                </svg>
                {isLoading ? 'Connecting...' : 'Google'}
            </button>

            <div className="mt-6 text-center">
                <span className="text-sm text-gray-400">Don't have an account? </span>
                <Link href="/account/login-register?mode=register" className="text-sm font-medium text-orange-500 transition-colors hover:text-orange-400">
                    Sign up
                </Link>
            </div>
        </div>
    )
}

export default LoginForm