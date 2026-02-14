import { Lock } from 'lucide-react'
import Link from 'next/link'

const AuthRequired = ({ featureAccess }: { featureAccess: string }) => {
    return (
        <div className="mt-32 flex justify-center">
            <div className="w-full max-w-md rounded-lg border border-neutral-800 bg-[#1b1b1b] shadow-2xl">
                <div className="space-y-6 p-8 text-center">
                    <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full border border-neutral-700 bg-neutral-800">
                        <Lock className="h-8 w-8 text-white" />
                    </div>
                    <div className="space-y-2">
                        <h1 className="text-2xl font-medium text-white">Authentication Required</h1>
                        <p className="text-sm leading-relaxed text-gray-400">Please sign in to access your {featureAccess}</p>
                    </div>
                </div>

                <div className="space-y-6 px-8 pb-8">
                    <Link href="/account/login-register" className="flex w-full items-center justify-center rounded border border-neutral-800 bg-black px-4 py-3 text-sm font-medium text-white transition-colors hover:border-neutral-700">
                        Sign In to Continue
                    </Link>

                    <p className="text-center text-xs text-gray-500">
                        {"Don't have an account? "}
                        <Link href="/account/login-register" className="text-orange-500 underline underline-offset-2 hover:text-orange-400">
                            Sign up here
                        </Link>
                    </p>
                </div>
            </div>
        </div>
    )
}

export default AuthRequired
