'use client'

import { useState } from 'react'
import { handleGoogleSignIn, handleEmailRegister } from '@/app/actions/auth'
import Link from 'next/link'
import { GoogleSignInButton } from '@/common-components/GoogleLoginButton'

const RegisterForm = () => {
    const [formData, setFormData] = useState({
        email: '',
        password: '',
        companyName: '',
        fullName: ''
    })
    const [isLoading, setIsLoading] = useState(false)

    const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault()
        setIsLoading(true)
        try {
            await handleEmailRegister(formData)
        } catch (error) {
            console.error('Register error:', error)
        } finally {
            setIsLoading(false)
        }
    }

    return (
        <div className="space-y-5">
            <form onSubmit={handleSubmit} className="space-y-5">
                <div>
                    <label htmlFor="companyName" className="mb-2 block text-sm font-medium text-white">
                        Company Name
                    </label>
                    <input
                        type="text"
                        id="companyName"
                        value={formData.companyName}
                        onChange={e => setFormData({ ...formData, companyName: e.target.value })}
                        placeholder="Acme Inc."
                        required
                        disabled={isLoading}
                        className="w-full rounded border border-neutral-800 bg-black px-4 py-3 text-white transition-colors focus:border-neutral-600 focus:outline-none disabled:opacity-50"
                    />
                </div>

                <div>
                    <label htmlFor="fullName" className="mb-2 block text-sm font-medium text-white">
                        Full Name
                    </label>
                    <input
                        type="text"
                        id="fullName"
                        value={formData.fullName}
                        onChange={e => setFormData({ ...formData, fullName: e.target.value })}
                        placeholder="John Doe"
                        required
                        disabled={isLoading}
                        className="w-full rounded border border-neutral-800 bg-black px-4 py-3 text-white transition-colors focus:border-neutral-600 focus:outline-none disabled:opacity-50"
                    />
                </div>

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
                        minLength={8}
                        className="w-full rounded border border-neutral-800 bg-black px-4 py-3 text-white transition-colors focus:border-neutral-600 focus:outline-none disabled:opacity-50"
                    />
                </div>

                <button type="submit" disabled={isLoading} className="w-full cursor-pointer rounded bg-white py-3 font-medium text-black transition-colors hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-50">
                    {isLoading ? 'Creating account...' : 'Create account'}
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

            <GoogleSignInButton />

            <div className="mt-6 text-center">
                <span className="text-sm text-gray-400">Already have an account? </span>
                <Link href="/account/login-register?mode=login" className="text-sm font-medium text-orange-500 transition-colors hover:text-orange-400">
                    Sign in
                </Link>
            </div>
        </div>
    )
}

export default RegisterForm
