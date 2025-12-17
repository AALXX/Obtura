'use client'
import { ShieldAlert } from 'lucide-react'

const Unauthorized = ({ featureAccess }: { featureAccess: string }) => {
    return (
        <div className="mt-32 flex justify-center">
            <div className="w-full max-w-md rounded-lg border border-red-900/30 bg-[#1b1b1b] shadow-2xl">
                <div className="space-y-6 p-8 text-center">
                    <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full border border-red-800/50 bg-red-950/30">
                        <ShieldAlert className="h-8 w-8 text-red-500" />
                    </div>
                    <div className="space-y-2">
                        <h1 className="text-2xl font-medium text-white">Access Denied</h1>
                        <p className="text-sm leading-relaxed text-gray-400">You don't have permission to access {featureAccess}</p>
                    </div>
                </div>

                <div className="space-y-6 px-8 pb-8">
                    <button onClick={() => window.history.back()} className="flex w-full items-center justify-center rounded border border-neutral-800 bg-black px-4 py-3 text-sm font-medium text-white transition-colors hover:border-neutral-700">
                        Go Back
                    </button>

                    <p className="text-center text-xs text-gray-500">
                        Need access?{' '}
                        <a href="/contact" className="text-orange-500 underline underline-offset-2 hover:text-orange-400">
                            Contact support
                        </a>
                    </p>
                </div>
            </div>
        </div>
    )
}

export default Unauthorized
