'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import axios from 'axios'
import { Building2, ArrowRight, Check, AlertCircle } from 'lucide-react'
import { subscriptionPlans } from './types'
import { TEAM_ROLE_LABELS, TeamRole } from '@/features/teams/types/TeamTypes'

interface CompanySetupFormProps {
    userEmail: string
    userName: string
    userId: string
    accessToken: string
}

const CompanySetupForm: React.FC<CompanySetupFormProps> = ({ userEmail, userName, userId, accessToken }) => {
    const router = useRouter()

    const [step, setStep] = useState<'company' | 'subscription'>('company')
    const [formData, setFormData] = useState({
        companyName: '',
        companySize: '1-10' as '1-10' | '11-50' | '51-200' | '200+',
        industry: '',
        role: '' as TeamRole | '',
        subscriptionPlan: '',
        billingEmail: '',
        vatNumber: '',
        addressLine1: '',
        city: '',
        country: 'RO',
        dataRegion: 'eu-central' as 'eu-central' | 'us-east' | 'ap-south',
        dpaSigned: false
    })

    const [isLoading, setIsLoading] = useState(false)
    const [error, setError] = useState('')

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
                billingEmail: formData.billingEmail || userEmail,
                vatNumber: formData.vatNumber,
                addressLine1: formData.addressLine1,
                city: formData.city,
                country: formData.country,
                dataRegion: formData.dataRegion,
                dpaSigned: formData.dpaSigned,
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
                <div className="w-full max-w-2xl">
                    <div className="mb-8 text-center">
                        <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-orange-500/20">
                            <Building2 className="h-8 w-8 text-orange-500" />
                        </div>
                        <h1 className="mb-2 text-3xl font-bold text-white">Welcome, {userName}!</h1>
                        <p className="text-sm text-gray-400">Let's set up your company account</p>
                    </div>

                    <div className="rounded-lg border border-neutral-800 bg-[#1b1b1b] p-6 sm:p-8">
                        <form onSubmit={handleCompanySubmit} className="space-y-6">
                            {/* Company Information */}
                            <div>
                                <h2 className="mb-4 text-lg font-semibold text-white">Company Information</h2>
                                <div className="space-y-4">
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
                                        <select
                                            id="role"
                                            value={formData.role}
                                            onChange={e =>
                                                setFormData({
                                                    ...formData,
                                                    role: e.target.value as TeamRole
                                                })
                                            }
                                            required
                                            className="w-full rounded border border-neutral-800 bg-black px-4 py-3 text-white transition-colors focus:border-neutral-600 focus:outline-none"
                                        >
                                            <option value="" disabled>
                                                Select your role
                                            </option>
                                            {Object.values(TeamRole).map(role => (
                                                <option key={role} value={role}>
                                                    {TEAM_ROLE_LABELS[role]}
                                                </option>
                                            ))}
                                        </select>
                                    </div>

                                    <div className="grid gap-4 sm:grid-cols-2">
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
                                                Industry
                                            </label>
                                            <input
                                                type="text"
                                                id="industry"
                                                value={formData.industry}
                                                onChange={e => setFormData({ ...formData, industry: e.target.value })}
                                                placeholder="Software, Healthcare, etc."
                                                className="w-full rounded border border-neutral-800 bg-black px-4 py-3 text-white transition-colors focus:border-neutral-600 focus:outline-none"
                                            />
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* Billing Information */}
                            <div>
                                <h2 className="mb-4 text-lg font-semibold text-white">Billing Information</h2>
                                <div className="space-y-4">
                                    <div className="grid gap-4 sm:grid-cols-2">
                                        <div>
                                            <label htmlFor="billingEmail" className="mb-2 block text-sm font-medium text-white">
                                                Billing Email
                                            </label>
                                            <input
                                                type="email"
                                                id="billingEmail"
                                                value={formData.billingEmail}
                                                onChange={e => setFormData({ ...formData, billingEmail: e.target.value })}
                                                placeholder={userEmail}
                                                className="w-full rounded border border-neutral-800 bg-black px-4 py-3 text-white transition-colors focus:border-neutral-600 focus:outline-none"
                                            />
                                            <p className="mt-1 text-xs text-gray-500">Defaults to your account email</p>
                                        </div>

                                        <div>
                                            <label htmlFor="vatNumber" className="mb-2 block text-sm font-medium text-white">
                                                VAT Number
                                            </label>
                                            <input
                                                required
                                                type="text"
                                                id="vatNumber"
                                                value={formData.vatNumber}
                                                onChange={e => setFormData({ ...formData, vatNumber: e.target.value })}
                                                placeholder="RO12345678"
                                                className="w-full rounded border border-neutral-800 bg-black px-4 py-3 text-white transition-colors focus:border-neutral-600 focus:outline-none"
                                            />
                                        </div>
                                    </div>

                                    <div>
                                        <label htmlFor="addressLine1" className="mb-2 block text-sm font-medium text-white">
                                            Address
                                        </label>
                                        <input
                                            type="text"
                                            id="addressLine1"
                                            value={formData.addressLine1}
                                            onChange={e => setFormData({ ...formData, addressLine1: e.target.value })}
                                            placeholder="123 Main Street"
                                            className="w-full rounded border border-neutral-800 bg-black px-4 py-3 text-white transition-colors focus:border-neutral-600 focus:outline-none"
                                        />
                                    </div>

                                    <div className="grid gap-4 sm:grid-cols-2">
                                        <div>
                                            <label htmlFor="city" className="mb-2 block text-sm font-medium text-white">
                                                City
                                            </label>
                                            <input type="text" id="city" value={formData.city} onChange={e => setFormData({ ...formData, city: e.target.value })} placeholder="Bucharest" className="w-full rounded border border-neutral-800 bg-black px-4 py-3 text-white transition-colors focus:border-neutral-600 focus:outline-none" required />
                                        </div>

                                        <div>
                                            <label htmlFor="country" className="mb-2 block text-sm font-medium text-white">
                                                Country
                                            </label>
                                            <select id="country" value={formData.country} onChange={e => setFormData({ ...formData, country: e.target.value })} className="w-full cursor-pointer rounded border border-neutral-800 bg-black px-4 py-3 text-white transition-colors focus:border-neutral-600 focus:outline-none" required>
                                                <option value="RO">Romania</option>
                                                <option value="US">United States</option>
                                                <option value="GB">United Kingdom</option>
                                                <option value="DE">Germany</option>
                                                <option value="FR">France</option>
                                                <option value="IT">Italy</option>
                                                <option value="ES">Spain</option>
                                                <option value="NL">Netherlands</option>
                                                <option value="BE">Belgium</option>
                                                <option value="PL">Poland</option>
                                            </select>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            <div>
                                <h2 className="mb-4 text-lg font-semibold text-white">Data & Compliance</h2>
                                <div className="space-y-4">
                                    <div>
                                        <label htmlFor="dataRegion" className="mb-2 block text-sm font-medium text-white">
                                            Data Region
                                        </label>
                                        <select id="dataRegion" value={formData.dataRegion} onChange={e => setFormData({ ...formData, dataRegion: e.target.value as any })} className="w-full cursor-pointer rounded border border-neutral-800 bg-black px-4 py-3 text-white transition-colors focus:border-neutral-600 focus:outline-none">
                                            <option value="eu-central">EU Central (Frankfurt)</option>
                                            <option value="us-east">US East (Virginia)</option>
                                            <option value="ap-south">Asia Pacific (Singapore)</option>
                                        </select>
                                        <p className="mt-1 text-xs text-gray-500">Choose where your data will be stored</p>
                                    </div>

                                    <div className="flex items-start gap-3">
                                        <input type="checkbox" id="dpaSigned" checked={formData.dpaSigned} onChange={e => setFormData({ ...formData, dpaSigned: e.target.checked })} className="mt-1 h-4 w-4 cursor-pointer rounded border-neutral-800 bg-black text-orange-500 focus:ring-orange-500" required />
                                        <label htmlFor="dpaSigned" className="text-sm text-gray-300">
                                            I acknowledge and agree to the Data Processing Agreement (DPA)
                                        </label>
                                    </div>
                                </div>
                            </div>

                            <button type="submit" className="flex w-full cursor-pointer items-center justify-center gap-2 rounded bg-white py-3 font-medium text-black transition-colors hover:bg-gray-100">
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
                    <button onClick={handleFinalSubmit} disabled={isLoading || !formData.subscriptionPlan} className="flex cursor-pointer items-center gap-2 rounded bg-white px-6 py-3 font-medium text-black transition-colors hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-50">
                        {isLoading ? 'Setting up...' : 'Complete Setup'}
                        <ArrowRight className="h-4 w-4" />
                    </button>
                </div>
            </div>
        </div>
    )
}

export default CompanySetupForm
