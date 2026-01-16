'use client'

import React, { useState } from 'react'
import { CreditCard, Calendar, TrendingUp, AlertCircle, CheckCircle, XCircle, Download, FileText } from 'lucide-react'
import axios from 'axios'

interface Plan {
    id: string
    name: string
    max_users: number | null
    storage_gb: number
    description: string
    price_monthly: number
    max_projects: number | null
    max_deployments_per_month: number
    max_bandwidth_gb_per_month: number
    max_build_minutes_per_month: number
    max_concurrent_builds: number
    max_concurrent_deployments: number
    max_environments_per_project: number
    max_preview_environments: number
    max_custom_domains: number
    max_team_members: number
    max_api_keys: number
    max_webhooks: number
    max_database_storage_gb: number
    support_level: string
    features: any
}

interface Subscription {
    id: string
    status: string
    plan: Plan
    billing_cycle: string
    current_period_start: string
    current_period_end: string
    next_payment_at: string
    last_payment_at: string | null
    cancel_at_period_end: boolean
    canceled_at: string | null
    overage_charges: number
    current_users_count: number
    current_projects_count: number
    current_deployments_count: number
    current_deployments_this_month: number
    current_storage_used_gb: number
    current_bandwidth_used_gb: number
    current_builds_today: number
    current_builds_this_month: number
    bandwidth_reset_at: string
}

interface SubscriptionManagerProps {
    subscription: Subscription
    accessToken: string
}

const SubscriptionManager: React.FC<SubscriptionManagerProps> = ({ subscription, accessToken }) => {
    const [activeTab, setActiveTab] = useState<'overview' | 'usage' | 'billing' | 'invoices'>('overview')
    const [isLoading, setIsLoading] = useState(false)

    const getStatusIcon = (status: string) => {
        switch (status) {
            case 'active':
                return <CheckCircle className="h-5 w-5 text-green-500" />
            case 'trialing':
                return <TrendingUp className="h-5 w-5 text-blue-500" />
            case 'past_due':
                return <AlertCircle className="h-5 w-5 text-yellow-500" />
            default:
                return <XCircle className="h-5 w-5 text-red-500" />
        }
    }

    const getStatusColor = (status: string) => {
        switch (status) {
            case 'active':
                return 'text-green-500'
            case 'trialing':
                return 'text-blue-500'
            case 'past_due':
                return 'text-yellow-500'
            default:
                return 'text-red-500'
        }
    }

    const handleCancelSubscription = async () => {
        if (!confirm('Are you sure you want to cancel your subscription? You will continue to have access until the end of your billing period.')) {
            return
        }

        setIsLoading(true)
        try {
            const resp = await axios.post(`${process.env.NEXT_PUBLIC_BACKEND_URL}/subscription/cancel`, {
                accessToken
            })

            if (resp.status === 200) {
                alert('Subscription cancelled successfully. You will have access until the end of your billing period.')
                window.location.reload()
            }
        } catch (error) {
            console.error('Error cancelling subscription:', error)
            alert('Failed to cancel subscription. Please try again.')
        } finally {
            setIsLoading(false)
        }
    }

    const handleReactivateSubscription = async () => {
        setIsLoading(true)
        try {
            const resp = await axios.post(`${process.env.NEXT_PUBLIC_BACKEND_URL}/subscription/reactivate`, {
                accessToken
            })

            if (resp.status === 200) {
                alert('Subscription reactivated successfully!')
                window.location.reload()
            }
        } catch (error) {
            console.error('Error reactivating subscription:', error)
            alert('Failed to reactivate subscription. Please try again.')
        } finally {
            setIsLoading(false)
        }
    }

    const formatDate = (dateString: string) => {
        return new Date(dateString).toLocaleDateString('en-US', {
            month: 'long',
            day: 'numeric',
            year: 'numeric'
        })
    }

    return (
        <div className="h-full w-full">
            <div className="h-full text-white">
                {/* Header */}
                <div className="pb-4">
                    <div className="flex items-center gap-2 text-2xl font-bold text-white">
                        <CreditCard className="h-6 w-6" />
                        Subscription Management
                    </div>
                    <p className="text-gray-300">Manage your subscription, billing, and usage</p>
                </div>

                {/* Tabs */}
                <div className="mt-6">
                    <div className="mb-6 border-b border-neutral-800 px-6">
                        <div className="flex gap-6">
                            <button onClick={() => setActiveTab('overview')} className={`relative cursor-pointer py-3 text-sm font-medium transition-colors ${activeTab === 'overview' ? 'text-white' : 'text-gray-400 hover:text-white'}`}>
                                Overview
                                {activeTab === 'overview' && <div className="absolute right-0 bottom-0 left-0 h-0.5 bg-orange-500"></div>}
                            </button>
                            <button onClick={() => setActiveTab('usage')} className={`relative cursor-pointer py-3 text-sm font-medium transition-colors ${activeTab === 'usage' ? 'text-white' : 'text-gray-400 hover:text-white'}`}>
                                Usage & Limits
                                {activeTab === 'usage' && <div className="absolute right-0 bottom-0 left-0 h-0.5 bg-orange-500"></div>}
                            </button>
                            <button onClick={() => setActiveTab('billing')} className={`relative cursor-pointer py-3 text-sm font-medium transition-colors ${activeTab === 'billing' ? 'text-white' : 'text-gray-400 hover:text-white'}`}>
                                Billing
                                {activeTab === 'billing' && <div className="absolute right-0 bottom-0 left-0 h-0.5 bg-orange-500"></div>}
                            </button>
                            <button onClick={() => setActiveTab('invoices')} className={`relative cursor-pointer py-3 text-sm font-medium transition-colors ${activeTab === 'invoices' ? 'text-white' : 'text-gray-400 hover:text-white'}`}>
                                Invoices
                                {activeTab === 'invoices' && <div className="absolute right-0 bottom-0 left-0 h-0.5 bg-orange-500"></div>}
                            </button>
                        </div>
                    </div>

                    {/* Overview Tab */}
                    {activeTab === 'overview' && (
                        <div className="space-y-6">
                            {/* Status Card */}
                            <div className="rounded-lg border border-neutral-800 bg-[#0a0a0a] p-6">
                                <div className="flex items-start justify-between">
                                    <div>
                                        <div className="mb-2 flex items-center gap-2">
                                            {getStatusIcon(subscription.status)}
                                            <h3 className="text-lg font-semibold text-white">Subscription Status</h3>
                                        </div>
                                        <p className={`text-2xl font-bold capitalize ${getStatusColor(subscription.status)}`}>{subscription.status}</p>
                                        {subscription.cancel_at_period_end && <p className="mt-2 text-sm text-yellow-500">Cancels on {formatDate(subscription.current_period_end)}</p>}
                                    </div>
                                    <div className="text-right">
                                        <p className="text-sm text-gray-400">Current Plan</p>
                                        <p className="text-xl font-bold text-white">{subscription.plan.name}</p>
                                        <p className="text-sm text-gray-400">€{subscription.plan.price_monthly}/month</p>
                                    </div>
                                </div>
                            </div>

                            {/* Billing Period */}
                            <div className="rounded-lg border border-neutral-800 bg-[#0a0a0a] p-6">
                                <div className="mb-4 flex items-center gap-2">
                                    <Calendar className="h-5 w-5 text-white" />
                                    <h3 className="text-lg font-semibold text-white">Billing Period</h3>
                                </div>
                                <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                                    <div>
                                        <p className="text-sm text-gray-400">Period Start</p>
                                        <p className="font-medium text-white">{formatDate(subscription.current_period_start)}</p>
                                    </div>
                                    <div>
                                        <p className="text-sm text-gray-400">Period End</p>
                                        <p className="font-medium text-white">{formatDate(subscription.current_period_end)}</p>
                                    </div>
                                    <div>
                                        <p className="text-sm text-gray-400">Next Payment</p>
                                        <p className="font-medium text-white">{formatDate(subscription.next_payment_at)}</p>
                                    </div>
                                </div>
                            </div>

                            {/* Quick Stats */}
                            <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
                                <div className="rounded-lg border border-neutral-800 bg-[#0a0a0a] p-4">
                                    <p className="text-sm text-gray-400">Team Members</p>
                                    <p className="mt-1 text-2xl font-bold text-white">{subscription.current_users_count}</p>
                                    <p className="mt-1 text-xs text-gray-500">of {subscription.plan.max_users || '∞'} limit</p>
                                </div>
                                <div className="rounded-lg border border-neutral-800 bg-[#0a0a0a] p-4">
                                    <p className="text-sm text-gray-400">Active Projects</p>
                                    <p className="mt-1 text-2xl font-bold text-white">{subscription.current_projects_count}</p>
                                    <p className="mt-1 text-xs text-gray-500">of {subscription.plan.max_projects || '∞'} limit</p>
                                </div>
                                <div className="rounded-lg border border-neutral-800 bg-[#0a0a0a] p-4">
                                    <p className="text-sm text-gray-400">Deployments</p>
                                    <p className="mt-1 text-2xl font-bold text-white">{subscription.current_deployments_this_month}</p>
                                    <p className="mt-1 text-xs text-gray-500">of {subscription.plan.max_deployments_per_month} this month</p>
                                </div>
                                <div className="rounded-lg border border-neutral-800 bg-[#0a0a0a] p-4">
                                    <p className="text-sm text-gray-400">Storage Used</p>
                                    <p className="mt-1 text-2xl font-bold text-white">{subscription.current_storage_used_gb.toFixed(1)} GB</p>
                                    <p className="mt-1 text-xs text-gray-500">of {subscription.plan.storage_gb} GB</p>
                                </div>
                            </div>

                            {/* Actions */}
                            <div className="space-y-3">
                                <button className="w-full rounded-md bg-white px-4 py-3 font-medium text-black transition-colors hover:bg-gray-100">Upgrade Plan</button>
                                {subscription.cancel_at_period_end ? (
                                    <button onClick={handleReactivateSubscription} disabled={isLoading} className="w-full rounded-md border border-green-500 bg-green-500/10 px-4 py-3 font-medium text-green-500 transition-colors hover:bg-green-500/20">
                                        {isLoading ? 'Processing...' : 'Reactivate Subscription'}
                                    </button>
                                ) : (
                                    <button onClick={handleCancelSubscription} disabled={isLoading} className="w-full rounded-md border border-red-500 px-4 py-3 font-medium text-red-500 transition-colors hover:bg-red-500/10">
                                        {isLoading ? 'Processing...' : 'Cancel Subscription'}
                                    </button>
                                )}
                            </div>
                        </div>
                    )}
                    {/* Usage Tab */}
                    {activeTab === 'usage' && (
                        <div className="space-y-6">
                            <div className="rounded-lg border border-neutral-800 bg-[#0a0a0a] p-6">
                                <h3 className="mb-4 text-lg font-semibold text-white">Resource Usage</h3>
                                <div className="space-y-4">
                                    {/* Storage */}
                                    <div>
                                        <div className="mb-2 flex items-center justify-between">
                                            <span className="text-sm font-medium text-white">Storage</span>
                                            <span className="text-sm text-gray-400">
                                                {subscription.current_storage_used_gb.toFixed(2)} / {subscription.plan.storage_gb} GB
                                            </span>
                                        </div>
                                        <div className="h-2 w-full rounded-full bg-neutral-800">
                                            <div
                                                className="h-2 rounded-full bg-gradient-to-r from-blue-500 to-blue-400"
                                                style={{
                                                    width: `${Math.min((subscription.current_storage_used_gb / subscription.plan.storage_gb) * 100, 100)}%`
                                                }}
                                            />
                                        </div>
                                    </div>

                                    {/* Bandwidth */}
                                    <div>
                                        <div className="mb-2 flex items-center justify-between">
                                            <span className="text-sm font-medium text-white">Bandwidth (this month)</span>
                                            <span className="text-sm text-gray-400">
                                                {subscription.current_bandwidth_used_gb.toFixed(2)} / {subscription.plan.max_bandwidth_gb_per_month} GB
                                            </span>
                                        </div>
                                        <div className="h-2 w-full rounded-full bg-neutral-800">
                                            <div
                                                className="h-2 rounded-full bg-gradient-to-r from-purple-500 to-purple-400"
                                                style={{
                                                    width: `${Math.min((subscription.current_bandwidth_used_gb / subscription.plan.max_bandwidth_gb_per_month) * 100, 100)}%`
                                                }}
                                            />
                                        </div>
                                        <p className="mt-1 text-xs text-gray-500">Resets on {formatDate(subscription.bandwidth_reset_at)}</p>
                                    </div>

                                    {/* Builds Today */}
                                    <div>
                                        <div className="mb-2 flex items-center justify-between">
                                            <span className="text-sm font-medium text-white">Builds (today)</span>
                                            <span className="text-sm text-gray-400">{subscription.current_builds_today} builds</span>
                                        </div>
                                    </div>

                                    {/* Builds This Month */}
                                    <div>
                                        <div className="mb-2 flex items-center justify-between">
                                            <span className="text-sm font-medium text-white">Builds (this month)</span>
                                            <span className="text-sm text-gray-400">
                                                {subscription.current_builds_this_month} / {subscription.plan.max_build_minutes_per_month} minutes
                                            </span>
                                        </div>
                                        <div className="h-2 w-full rounded-full bg-neutral-800">
                                            <div
                                                className="h-2 rounded-full bg-gradient-to-r from-green-500 to-green-400"
                                                style={{
                                                    width: `${Math.min((subscription.current_builds_this_month / subscription.plan.max_build_minutes_per_month) * 100, 100)}%`
                                                }}
                                            />
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* Plan Limits */}
                            <div className="rounded-lg border border-neutral-800 bg-[#0a0a0a] p-6">
                                <h3 className="mb-4 text-lg font-semibold text-white">Plan Limits</h3>
                                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                                    <div className="flex items-center justify-between border-b border-neutral-800 pb-2">
                                        <span className="text-sm text-gray-400">Max Users</span>
                                        <span className="font-medium text-white">{subscription.plan.max_users || 'Unlimited'}</span>
                                    </div>
                                    <div className="flex items-center justify-between border-b border-neutral-800 pb-2">
                                        <span className="text-sm text-gray-400">Max Projects</span>
                                        <span className="font-medium text-white">{subscription.plan.max_projects || 'Unlimited'}</span>
                                    </div>
                                    <div className="flex items-center justify-between border-b border-neutral-800 pb-2">
                                        <span className="text-sm text-gray-400">Concurrent Builds</span>
                                        <span className="font-medium text-white">{subscription.plan.max_concurrent_builds}</span>
                                    </div>
                                    <div className="flex items-center justify-between border-b border-neutral-800 pb-2">
                                        <span className="text-sm text-gray-400">Concurrent Deployments</span>
                                        <span className="font-medium text-white">{subscription.plan.max_concurrent_deployments}</span>
                                    </div>
                                    <div className="flex items-center justify-between border-b border-neutral-800 pb-2">
                                        <span className="text-sm text-gray-400">Custom Domains</span>
                                        <span className="font-medium text-white">{subscription.plan.max_custom_domains}</span>
                                    </div>
                                    <div className="flex items-center justify-between border-b border-neutral-800 pb-2">
                                        <span className="text-sm text-gray-400">API Keys</span>
                                        <span className="font-medium text-white">{subscription.plan.max_api_keys}</span>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Billing Tab */}
                    {activeTab === 'billing' && (
                        <div className="space-y-6">
                            <div className="rounded-lg border border-neutral-800 bg-[#0a0a0a] p-6">
                                <h3 className="mb-4 text-lg font-semibold text-white">Billing Information</h3>
                                <div className="space-y-4">
                                    <div className="flex items-center justify-between">
                                        <span className="text-gray-400">Billing Cycle</span>
                                        <span className="font-medium text-white capitalize">{subscription.billing_cycle}</span>
                                    </div>
                                    <div className="flex items-center justify-between">
                                        <span className="text-gray-400">Monthly Price</span>
                                        <span className="font-medium text-white">€{subscription.plan.price_monthly}</span>
                                    </div>
                                    <div className="flex items-center justify-between">
                                        <span className="text-gray-400">Overage Charges</span>
                                        <span className="font-medium text-white">€{subscription.overage_charges.toFixed(2)}</span>
                                    </div>
                                    {subscription.last_payment_at && (
                                        <div className="flex items-center justify-between">
                                            <span className="text-gray-400">Last Payment</span>
                                            <span className="font-medium text-white">{formatDate(subscription.last_payment_at)}</span>
                                        </div>
                                    )}
                                    <div className="flex items-center justify-between">
                                        <span className="text-gray-400">Next Payment</span>
                                        <span className="font-medium text-white">{formatDate(subscription.next_payment_at)}</span>
                                    </div>
                                </div>
                            </div>

                            <button className="w-full rounded-md border border-white px-4 py-3 font-medium text-white transition-colors hover:bg-[#ffffff1a]">Update Payment Method</button>
                        </div>
                    )}

                    {/* Invoices Tab */}
                    {activeTab === 'invoices' && (
                        <div className="space-y-6">
                            <div className="rounded-lg border border-neutral-800 bg-[#0a0a0a] p-6">
                                <div className="mb-4 flex items-center gap-2">
                                    <FileText className="h-5 w-5 text-white" />
                                    <h3 className="text-lg font-semibold text-white">Invoice History</h3>
                                </div>
                                <div className="py-8 text-center">
                                    <p className="text-gray-400">No invoices available yet</p>
                                    <p className="mt-2 text-sm text-gray-500">Your invoices will appear here once payments are processed</p>
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    )
}
export default SubscriptionManager
