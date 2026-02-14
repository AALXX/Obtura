'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { CheckCircle2, XCircle, Github, ArrowRight, AlertCircle } from 'lucide-react'
import axios from 'axios'

const GitHubOnboardingPage: React.FC<{ installationId: string; setupAction: string; state: string }> = ({ installationId, setupAction, state }) => {
    const router = useRouter()
    const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading')
    const [message, setMessage] = useState('Setting up GitHub integration...')

    useEffect(() => {
        const setupGitHub = async () => {
            try {
                if (!installationId || !state) {
                    throw new Error('Missing required parameters')
                }

                const resp = await axios.get(`${process.env.NEXT_PUBLIC_BACKEND_URL}/github/installation/callback?installationId=${installationId}&setupAction=${setupAction}&state=${state}`)

                if (resp.status === 200) {
                    setStatus('success')
                    setMessage('GitHub App installed successfully!')

                    setTimeout(() => {
                        router.push('/projects')
                    }, 2000)
                } else {
                    throw new Error('Failed to setup GitHub integration')
                }
            } catch (error: any) {
                console.error('GitHub setup error:', error)
                setStatus('error')
                setMessage(error.message || 'Failed to setup GitHub integration')
            }
        }

        setupGitHub()
    }, [installationId, setupAction, state, router])

    return (
        <div className="min-h-screen  text-white">
            <div className="flex min-h-screen items-center justify-center px-6">
                <div className="w-full max-w-md">
                    {status === 'loading' && (
                        <div className="rounded-lg border border-zinc-800 bg-[#1b1b1b] p-8">
                            <div className="flex flex-col items-center text-center">
                                <div className="mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-orange-500/10">
                                    <div className="h-8 w-8 animate-spin rounded-full border-2 border-orange-500 border-t-transparent"></div>
                                </div>

                                <div className="mb-4 flex items-center gap-2">
                                    <Github className="text-zinc-400" size={24} />
                                    <h2 className="text-2xl font-bold">Setting up GitHub</h2>
                                </div>

                                <p className="text-zinc-400">{message}</p>

                                <div className="mt-6 w-full">
                                    <div className="space-y-3">
                                        <div className="flex items-center gap-3 text-sm">
                                            <div className="h-2 w-2 animate-pulse rounded-full bg-orange-500"></div>
                                            <span className="text-zinc-400">Verifying installation</span>
                                        </div>
                                        <div className="flex items-center gap-3 text-sm">
                                            <div className="h-2 w-2 rounded-full bg-zinc-700"></div>
                                            <span className="text-zinc-500">Configuring permissions</span>
                                        </div>
                                        <div className="flex items-center gap-3 text-sm">
                                            <div className="h-2 w-2 rounded-full bg-zinc-700"></div>
                                            <span className="text-zinc-500">Syncing repositories</span>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

                    {status === 'success' && (
                        <div className="rounded-lg border border-green-900/50 bg-green-500/5 p-8">
                            <div className="flex flex-col items-center text-center">
                                <div className="mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-green-500/10">
                                    <CheckCircle2 className="text-green-500" size={32} />
                                </div>

                                <h2 className="mb-2 text-2xl font-bold">Success!</h2>
                                <p className="mb-4 text-zinc-400">{message}</p>

                                <div className="mb-6 w-full rounded-lg border border-zinc-800 bg-[#1b1b1b] p-4">
                                    <div className="space-y-2">
                                        <div className="flex items-center gap-2 text-sm">
                                            <CheckCircle2 className="text-green-500" size={16} />
                                            <span className="text-zinc-300">Installation verified</span>
                                        </div>
                                        <div className="flex items-center gap-2 text-sm">
                                            <CheckCircle2 className="text-green-500" size={16} />
                                            <span className="text-zinc-300">Permissions configured</span>
                                        </div>
                                        <div className="flex items-center gap-2 text-sm">
                                            <CheckCircle2 className="text-green-500" size={16} />
                                            <span className="text-zinc-300">Ready to deploy</span>
                                        </div>
                                    </div>
                                </div>

                                <div className="flex items-center gap-2 text-sm text-zinc-400">
                                    <div className="h-1.5 w-1.5 animate-pulse rounded-full bg-orange-500"></div>
                                    <span>Redirecting to your projects...</span>
                                </div>
                            </div>
                        </div>
                    )}

                    {status === 'error' && (
                        <div className="rounded-lg border border-red-900/50 bg-red-500/5 p-8">
                            <div className="flex flex-col items-center text-center">
                                <div className="mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-red-500/10">
                                    <XCircle className="text-red-500" size={32} />
                                </div>

                                <h2 className="mb-2 text-2xl font-bold text-red-500">Installation Failed</h2>
                                <p className="mb-6 text-zinc-400">{message}</p>

                                <div className="mb-6 w-full rounded-lg border border-zinc-800 bg-[#1b1b1b] p-4">
                                    <div className="flex items-start gap-3">
                                        <AlertCircle className="mt-0.5 text-yellow-500" size={16} />
                                        <div className="text-left text-sm text-zinc-400">
                                            <p className="mb-2 font-medium text-zinc-300">Troubleshooting steps:</p>
                                            <ul className="list-inside list-disc space-y-1">
                                                <li>Check your GitHub permissions</li>
                                                <li>Ensure the app is authorized</li>
                                                <li>Try installing the app again</li>
                                            </ul>
                                        </div>
                                    </div>
                                </div>

                                <button onClick={() => router.push('/dashboard')} className="flex items-center gap-2 rounded-lg bg-orange-500 px-6 py-3 text-sm font-medium text-white transition-colors hover:bg-orange-600">
                                    Back to Dashboard
                                    <ArrowRight size={16} />
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    )
}

export default GitHubOnboardingPage
