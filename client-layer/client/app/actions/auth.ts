'use server'

import { signIn } from '@/features/account/auth/auth'
import { redirect } from 'next/navigation'

export async function handleGoogleSignIn() {
    await signIn('google', { redirectTo: '/account' })
}

export async function handleEmailSignIn(email: string, password: string) {
    // Send to your backend
    const response = await fetch(`${process.env.BACKEND_URL}/auth/signin`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
    })

    if (!response.ok) {
        throw new Error('Invalid credentials')
    }

    const data = await response.json()

    redirect('/account')
}

export async function handleEmailRegister(formData: { email: string; password: string; companyName: string; fullName: string }) {
    // Send to your backend
    const response = await fetch(`${process.env.BACKEND_URL}/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData)
    })

    if (!response.ok) {
        const error = await response.json()
        throw new Error(error.message || 'Registration failed')
    }

    const data = await response.json()

    redirect('/account')
}
