import { Building2, AlertCircle } from 'lucide-react'
import Link from 'next/link'

const CompanyRequired = ({ featureAccess }: { featureAccess: string }) => {
    return (
        <div className="mt-32 flex justify-center px-4">
            <div className="w-full max-w-md rounded-lg border border-neutral-800 bg-[#1b1b1b] shadow-2xl">
                <div className="space-y-6 p-8 text-center">
                    <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full border border-orange-900/30 bg-orange-950/20">
                        <Building2 className="h-8 w-8 text-orange-500" />
                    </div>
                    <div className="space-y-2">
                        <h1 className="text-2xl font-medium text-white">Company Account Required</h1>
                        <p className="text-sm leading-relaxed text-gray-400">To access {featureAccess}, you must be part of a company with an active subscription plan.</p>
                    </div>
                </div>

                <div className="space-y-6 px-8 pb-8">
                    <div className="rounded-lg border border-orange-900/30 bg-orange-950/20 p-4">
                        <div className="flex items-start gap-3">
                            <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-orange-500" />
                            <div className="space-y-2 text-left">
                                <p className="text-xs font-medium text-orange-400">What you need:</p>
                                <ul className="space-y-1 text-xs text-gray-400">
                                    <li>• Be a member of a company that works with us</li>
                                    <li>• Company must have an active paying subscription</li>
                                    <li>• Contact your company admin to get access</li>
                                </ul>
                            </div>
                        </div>
                    </div>

                    <div className="space-y-3">
                        <Link href="/onboarding" className="flex w-full items-center justify-center rounded bg-white px-4 py-3 text-sm font-medium text-black transition-colors hover:bg-gray-100">
                            Set Up Company Account
                        </Link>

                        <Link href="/account" className="flex w-full items-center justify-center rounded border border-neutral-800 bg-black px-4 py-3 text-sm font-medium text-white transition-colors hover:border-neutral-700">
                            Back to Account
                        </Link>
                    </div>

                    <p className="text-center text-xs text-gray-500">
                        Need help?{' '}
                        <Link href="/contact" className="text-orange-500 underline underline-offset-2 hover:text-orange-400">
                            Contact support
                        </Link>
                    </p>
                </div>
            </div>
        </div>
    )
}

export default CompanyRequired
