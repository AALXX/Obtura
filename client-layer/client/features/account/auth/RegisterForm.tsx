
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
        fullName: '',
        // GDPR fields
        acceptTerms: false,
        acceptPrivacy: false,
        marketingConsent: false,
        dataRegion: 'eu-central' as 'eu-central' | 'eu-west' | 'eu-north'
    })
    const [isLoading, setIsLoading] = useState(false)
    const [error, setError] = useState('')

    const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault()
        setError('')

        // Validate GDPR consent
        if (!formData.acceptTerms || !formData.acceptPrivacy) {
            setError('You must accept the Terms of Service and Privacy Policy to continue')
            return
        }

        setIsLoading(true)
        try {
            await handleEmailRegister(formData)
        } catch (error) {
            console.error('Register error:', error)
            setError('Registration failed. Please try again.')
        } finally {
            setIsLoading(false)
        }
    }

    return (
        <div className="space-y-5">
            <form onSubmit={handleSubmit} className="space-y-5">
                {/* Company Information */}
                <div>
                    <label htmlFor="companyName" className="mb-2 block text-sm font-medium text-white">
                        Company Name *
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

                {/* Personal Information */}
                <div>
                    <label htmlFor="fullName" className="mb-2 block text-sm font-medium text-white">
                        Full Name *
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
                        Work Email *
                    </label>
                    <input
                        type="email"
                        id="email"
                        value={formData.email}
                        onChange={e => setFormData({ ...formData, email: e.target.value })}
                        placeholder="you@company.com"
                        required
                        disabled={isLoading}
                        className="w-full rounded border border-neutral-800 bg-black px-4 py-3 text-white transition-colors focus:border-neutral-600 focus:outline-none disabled:opacity-50"
                    />
                </div>

                <div>
                    <label htmlFor="password" className="mb-2 block text-sm font-medium text-white">
                        Password *
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
                    <p className="mt-1 text-xs text-gray-400">Minimum 8 characters</p>
                </div>

                {/* Data Region Selection */}
                <div>
                    <label htmlFor="dataRegion" className="mb-2 block text-sm font-medium text-white">
                        Data Region *
                    </label>
                    <select id="dataRegion" value={formData.dataRegion} onChange={e => setFormData({ ...formData, dataRegion: e.target.value as any })} disabled={isLoading} className="w-full rounded border border-neutral-800 bg-black px-4 py-3 text-white transition-colors focus:border-neutral-600 focus:outline-none disabled:opacity-50">
                        <option value="eu-central">EU Central (Germany)</option>
                        <option value="eu-west">EU West (Ireland)</option>
                        <option value="eu-north">EU North (Sweden)</option>
                    </select>
                    <p className="mt-1 text-xs text-gray-400">Choose where your data will be stored</p>
                </div>

                {/* GDPR Consent Checkboxes */}
                <div className="space-y-3 rounded border border-neutral-800 bg-black p-4">
                    <div className="flex items-start gap-3">
                        <input type="checkbox" id="acceptTerms" checked={formData.acceptTerms} onChange={e => setFormData({ ...formData, acceptTerms: e.target.checked })} disabled={isLoading} className="mt-1 h-4 w-4 cursor-pointer rounded border-neutral-700 bg-neutral-800 text-orange-500 focus:ring-2 focus:ring-orange-500" />
                        <label htmlFor="acceptTerms" className="flex-1 text-xs text-gray-300">
                            I accept the{' '}
                            <Link href="/legal/terms" className="text-orange-500 hover:text-orange-400">
                                Terms of Service
                            </Link>{' '}
                            *
                        </label>
                    </div>

                    <div className="flex items-start gap-3">
                        <input type="checkbox" id="acceptPrivacy" checked={formData.acceptPrivacy} onChange={e => setFormData({ ...formData, acceptPrivacy: e.target.checked })} disabled={isLoading} className="mt-1 h-4 w-4 cursor-pointer rounded border-neutral-700 bg-neutral-800 text-orange-500 focus:ring-2 focus:ring-orange-500" />
                        <label htmlFor="acceptPrivacy" className="flex-1 text-xs text-gray-300">
                            I accept the{' '}
                            <Link href="/legal/privacy" className="text-orange-500 hover:text-orange-400">
                                Privacy Policy
                            </Link>{' '}
                            *
                        </label>
                    </div>

                    <div className="flex items-start gap-3">
                        <input type="checkbox" id="marketingConsent" checked={formData.marketingConsent} onChange={e => setFormData({ ...formData, marketingConsent: e.target.checked })} disabled={isLoading} className="mt-1 h-4 w-4 cursor-pointer rounded border-neutral-700 bg-neutral-800 text-orange-500 focus:ring-2 focus:ring-orange-500" />
                        <label htmlFor="marketingConsent" className="flex-1 text-xs text-gray-300">
                            I want to receive product updates and marketing communications (optional)
                        </label>
                    </div>
                </div>

                {error && <div className="rounded border border-red-800 bg-red-900/20 p-3 text-xs text-red-400">{error}</div>}

                <button type="submit" disabled={isLoading} className="w-full cursor-pointer rounded bg-white py-3 font-medium text-black transition-colors hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-50">
                    {isLoading ? 'Creating account...' : 'Create company account'}
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
