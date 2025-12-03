'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import axios from 'axios'
import { Building2, ArrowRight, Check, Zap, TrendingUp, Briefcase, Crown, AlertCircle } from 'lucide-react'
import { useAccountStore } from '@/lib/store/accountStore'

interface CompanySetupFormProps {
    userEmail: string
    userName: string
    userId: string
    accessToken: string
}

const subscriptionPlans = [
    {
        id: 'starter',
        name: 'Starter',
        price: 79,
        icon: Zap,
        description: 'Perfect for small teams starting with DevOps automation',
        features: ['8 team members', '5 projects', '100 deployments/month', '5 apps', '10 GB storage']
    },
    {
        id: 'team',
        name: 'Team',
        price: 299,
        icon: TrendingUp,
        description: 'For growing teams with multiple projects',
        popular: true,
        features: ['25 team members', '15 projects', '500 deployments/month', '10 apps', '50 GB storage']
    },
    {
        id: 'business',
        name: 'Business',
        price: 799,
        icon: Briefcase,
        description: 'For established SMEs with complex needs',
        features: ['50 team members', '30 projects', '1000 deployments/month', '25 apps', '3 TB storage']
    },
    {
        id: 'enterprise',
        name: 'Enterprise',
        price: 2199,
        icon: Crown,
        description: 'Custom limits for large organizations',
        features: ['Unlimited team members', 'Unlimited projects', 'Unlimited deployments', 'Unlimited apps', '5 TB storage']
    }
]

const CompanySetupForm: React.FC<CompanySetupFormProps> = ({ userEmail, userName, userId, accessToken }) => {
    const router = useRouter()
    const { user, status, fetchAccount } = useAccountStore()

    const [step, setStep] = useState<'company' | 'subscription'>('company')
    const [formData, setFormData] = useState({
        companyName: '',
        companySize: '1-10' as '1-10' | '11-50' | '51-200' | '200+',
        industry: '',
        role: '',
        subscriptionPlan: ''
    })
    const [isLoading, setIsLoading] = useState(false)
    const [error, setError] = useState('')

    useEffect(() => {
        if (status === 'idle') {
            fetchAccount()
        }
    }, [status, fetchAccount])

    if (user?.hasCompany) {
        // router.push('/account')
    }

    const handleCompanySubmit = (e: React.FormEvent) => {
        e.preventDefault()
        setStep('subscription')
    }

    const handleFinalSubmit = async () => {
        if (!formData.subscriptionPlan) {
            setError('Please select a subscription plan to continue')
            return
        }

        setError('')
        setIsLoading(true)

        try {
            const response = await axios.post(`${process.env.NEXT_PUBLIC_BACKEND_URL}/account-manager/complete-company-setup`, {
                userId,
                companyName: formData.companyName,
                companySize: formData.companySize,
                industry: formData.industry,
                userRole: formData.role,
                subscriptionPlan: formData.subscriptionPlan,
                accessToken
            })

            if (response.status === 200) {
                router.push('/account')
            }
        } catch (err: any) {
            setError(err.response?.data?.message || 'Failed to setup company')
        } finally {
            setIsLoading(false)
        }
    }

    if (step === 'company') {
        return (
            <div className="flex min-h-screen items-center justify-center px-4 py-8">
                <div className="w-full max-w-md">
                    <div className="mb-8 text-center">
                        <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-orange-500/20">
                            <Building2 className="h-8 w-8 text-orange-500" />
                        </div>
                        <h1 className="mb-2 text-3xl font-bold text-white">Welcome, {userName}!</h1>
                        <p className="text-sm text-gray-400">Let's set up your company account</p>
                    </div>

                    <div className="rounded-lg border border-neutral-800 bg-[#1b1b1b] p-6 sm:p-8">
                        <form onSubmit={handleCompanySubmit} className="space-y-5">
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
                                    className="w-full rounded border border-neutral-800 bg-black px-4 py-3 text-white transition-colors focus:border-neutral-600 focus:outline-none"
                                />
                            </div>

                            <div>
                                <label htmlFor="role" className="mb-2 block text-sm font-medium text-white">
                                    Your Role *
                                </label>
                                <input type="text" id="role" value={formData.role} onChange={e => setFormData({ ...formData, role: e.target.value })} placeholder="CEO, CTO, Developer, etc." required className="w-full rounded border border-neutral-800 bg-black px-4 py-3 text-white transition-colors focus:border-neutral-600 focus:outline-none" />
                            </div>

                            <div>
                                <label htmlFor="companySize" className="mb-2 block text-sm font-medium text-white">
                                    Company Size *
                                </label>
                                <select id="companySize" value={formData.companySize} onChange={e => setFormData({ ...formData, companySize: e.target.value as any })} className="w-full rounded border border-neutral-800 bg-black px-4 py-3 text-white transition-colors focus:border-neutral-600 focus:outline-none">
                                    <option value="1-10">1-10 employees</option>
                                    <option value="11-50">11-50 employees</option>
                                    <option value="51-200">51-200 employees</option>
                                    <option value="200+">200+ employees</option>
                                </select>
                            </div>

                            <div>
                                <label htmlFor="industry" className="mb-2 block text-sm font-medium text-white">
                                    Industry (Optional)
                                </label>
                                <input
                                    type="text"
                                    id="industry"
                                    value={formData.industry}
                                    onChange={e => setFormData({ ...formData, industry: e.target.value })}
                                    placeholder="Software, Healthcare, Finance, etc."
                                    className="w-full rounded border border-neutral-800 bg-black px-4 py-3 text-white transition-colors focus:border-neutral-600 focus:outline-none"
                                />
                            </div>

                            <button type="submit" className="flex w-full items-center justify-center gap-2 rounded bg-white py-3 font-medium text-black transition-colors hover:bg-gray-100">
                                Continue to Subscription
                                <ArrowRight className="h-4 w-4" />
                            </button>
                        </form>
                    </div>

                    <p className="mt-4 text-center text-xs text-gray-500">Your account email: {userEmail}</p>
                </div>
            </div>
        )
    }

    return (
        <div className="flex min-h-screen items-center justify-center px-4 py-8">
            <div className="w-full max-w-6xl">
                <div className="mb-8 text-center">
                    <h1 className="mb-2 text-3xl font-bold text-white">Choose Your Plan</h1>
                    <p className="text-sm text-gray-400">Select the plan that best fits your team's needs</p>
                </div>

                <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
                    {subscriptionPlans.map(plan => {
                        const Icon = plan.icon
                        const isSelected = formData.subscriptionPlan === plan.id

                        return (
                            <div key={plan.id} onClick={() => setFormData({ ...formData, subscriptionPlan: plan.id })} className={`relative cursor-pointer rounded-lg border p-6 transition-all ${isSelected ? 'border-orange-500 bg-orange-500/10' : 'border-neutral-800 bg-[#1b1b1b] hover:border-neutral-700'}`}>
                                {plan.popular && <div className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-orange-500 px-3 py-1 text-xs font-medium text-white">Most Popular</div>}

                                <div className="mb-4 flex items-center justify-between">
                                    <Icon className={`h-8 w-8 ${isSelected ? 'text-orange-500' : 'text-gray-400'}`} />
                                    {isSelected && (
                                        <div className="flex h-6 w-6 items-center justify-center rounded-full bg-orange-500">
                                            <Check className="h-4 w-4 text-white" />
                                        </div>
                                    )}
                                </div>

                                <h3 className="mb-1 text-xl font-bold text-white">{plan.name}</h3>
                                <div className="mb-3">
                                    <span className="text-3xl font-bold text-white">€{plan.price}</span>
                                    <span className="text-sm text-gray-400">/month</span>
                                </div>
                                <p className="mb-4 text-sm text-gray-400">{plan.description}</p>

                                <ul className="space-y-2">
                                    {plan.features.map((feature, index) => (
                                        <li key={index} className="flex items-start gap-2 text-sm text-gray-300">
                                            <Check className="mt-0.5 h-4 w-4 shrink-0 text-orange-500" />
                                            <span>{feature}</span>
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        )
                    })}
                </div>

                {!formData.subscriptionPlan && (
                    <div className="mt-6 rounded-lg border border-orange-900/30 bg-orange-950/20 p-4">
                        <div className="flex items-start gap-3">
                            <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-orange-500" />
                            <p className="text-sm text-orange-400">Please select a subscription plan to continue</p>
                        </div>
                    </div>
                )}

                {error && <div className="mt-6 rounded border border-red-800 bg-red-900/20 p-3 text-center text-sm text-red-400">{error}</div>}

                <div className="mt-8 flex justify-center gap-4">
                    <button onClick={() => setStep('company')} disabled={isLoading} className="rounded border border-neutral-800 bg-[#1b1b1b] px-6 py-3 font-medium text-white transition-colors hover:bg-neutral-900 disabled:opacity-50">
                        Back
                    </button>
                    <button onClick={handleFinalSubmit} disabled={isLoading || !formData.subscriptionPlan} className="flex items-center gap-2 rounded bg-white px-6 py-3 font-medium text-black transition-colors hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-50">
                        {isLoading ? 'Setting up...' : 'Complete Setup'}
                        <ArrowRight className="h-4 w-4" />
                    </button>
                </div>
            </div>
        </div>
    )
}

export default CompanySetupForm
