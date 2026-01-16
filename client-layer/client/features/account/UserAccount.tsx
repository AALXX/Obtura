'use client'
import { User, Mail, Calendar, LogOut, Settings, Building2, CreditCard, TrendingUp } from 'lucide-react'
import { UserResponse } from './types/AccoutTypes'
import Image from 'next/image'
import { useState } from 'react'
import DialogCanvas from '@/common-components/DialogCanvas'
import AccountSettings from './components/AcccountSettings'
import { signOut } from 'next-auth/react'
import axios from 'axios'
import SubscriptionManager from './components/SubscriptionManager'

const UserAccount: React.FC<UserResponse & { userAccessToken: string; userImg: string | undefined | null }> = ({ error, email, name, accountType, memberSince, activeSessions, userSubscription, companyName, companyRole, userImg, userAccessToken, hasCompany }) => {
    const [showSettings, setShowSettings] = useState(false)
    const [showSubscriptionManager, setShowSubscriptionManager] = useState(false)

    const handleSignOut = async () => {
        try {
            const resp = await axios.post(`${process.env.NEXT_PUBLIC_BACKEND_URL}/account-manager/logout`, {
                accessToken: userAccessToken
            })

            if (resp.status !== 200) {
                window.alert('Failed to sign out. Please try again.')
                return
            }

            await signOut({ callbackUrl: '/account/login-register' })
        } catch (error) {
            console.error('Error during sign out:', error)
        }
    }

    const getStatusColor = (status: string) => {
        switch (status) {
            case 'active':
                return 'bg-green-500/20 text-green-500 border-green-500/30'
            case 'trialing':
                return 'bg-blue-500/20 text-blue-500 border-blue-500/30'
            case 'past_due':
                return 'bg-yellow-500/20 text-yellow-500 border-yellow-500/30'
            default:
                return 'bg-red-500/20 text-red-500 border-red-500/30'
        }
    }

    return (
        <div className="container mx-auto max-w-4xl px-4 py-6 sm:px-6 sm:py-8 lg:px-8 lg:py-10">
            <div className="space-y-5 sm:space-y-6">
                {/* Header */}
                <div>
                    <h2 className="text-2xl font-bold tracking-tight text-white sm:text-3xl">Account Details</h2>
                    <p className="mt-1 text-xs text-gray-400 sm:text-sm">Manage your account and company information</p>
                </div>

                <div className="border-t border-neutral-800"></div>

                {/* Dialogs */}
                {showSettings && (
                    <DialogCanvas closeDialog={() => setShowSettings(false)}>
                        <AccountSettings email={email} name={name} image={userImg || ''} accessToken={userAccessToken} activeSessions={activeSessions.length} />
                    </DialogCanvas>
                )}

                {showSubscriptionManager && userSubscription && (
                    <DialogCanvas closeDialog={() => setShowSubscriptionManager(false)}>
                        <SubscriptionManager subscription={userSubscription} accessToken={userAccessToken} />
                    </DialogCanvas>
                )}

                {/* Profile Information */}
                <div className="space-y-4">
                    <div>
                        <h3 className="text-base font-semibold text-white sm:text-lg">Profile Information</h3>
                        <p className="text-xs text-gray-400 sm:text-sm">Your personal details and account information</p>
                    </div>
                    <div className="space-y-5 rounded border border-neutral-800 bg-[#1b1b1b] p-4 sm:space-y-6 sm:p-6">
                        <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-center">
                            <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-neutral-800 sm:h-20 sm:w-20">{accountType === 'google' && userImg ? <Image alt="User Avatar" width={100} height={100} src={userImg} className="h-full w-full rounded-full" /> : <User className="h-8 w-8 text-white sm:h-10 sm:w-10" />}</div>
                            <div className="flex w-full text-center sm:text-left">
                                <h3 className="text-base font-semibold text-white sm:text-lg">{name}</h3>
                                <Settings className="h-4 w-4 shrink-0 cursor-pointer self-center text-gray-400 transition-colors hover:text-white sm:h-5 sm:w-5 md:ml-auto" onClick={() => setShowSettings(!showSettings)} />
                            </div>
                        </div>

                        <div className="border-t border-neutral-800"></div>

                        <div className="space-y-4">
                            <div className="flex items-start gap-3 sm:items-center">
                                <Mail className="mt-0.5 h-4 w-4 shrink-0 text-gray-400 sm:mt-0 sm:h-5 sm:w-5" />
                                <div className="min-w-0 flex-1">
                                    <p className="text-xs font-medium text-white sm:text-sm">Email</p>
                                    <p className="text-xs break-all text-gray-400 sm:text-sm">{email}</p>
                                </div>
                            </div>

                            <div className="flex items-start gap-3 sm:items-center">
                                <Calendar className="mt-0.5 h-4 w-4 shrink-0 text-gray-400 sm:mt-0 sm:h-5 sm:w-5" />
                                <div>
                                    <p className="text-xs font-medium text-white sm:text-sm">Member since</p>
                                    <p className="text-xs text-gray-400 sm:text-sm">{memberSince}</p>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Company Information - Enhanced */}
                {hasCompany && companyName && (
                    <div className="space-y-4">
                        <div>
                            <h3 className="text-base font-semibold text-white sm:text-lg">Company</h3>
                            <p className="text-xs text-gray-400 sm:text-sm">Your company details and role</p>
                        </div>
                        <div className="rounded border border-neutral-800 bg-[#1b1b1b] p-4 sm:p-6">
                            <div className="space-y-4">
                                <div className="flex items-start gap-3 sm:items-center">
                                    <Building2 className="mt-0.5 h-5 w-5 shrink-0 text-orange-500 sm:mt-0" />
                                    <div className="flex-1">
                                        <p className="text-xs font-medium text-white sm:text-sm">Company Name</p>
                                        <p className="text-base font-semibold text-white sm:text-lg">{companyName}</p>
                                    </div>
                                </div>

                                {companyRole && (
                                    <>
                                        <div className="border-t border-neutral-800"></div>
                                        <div className="flex items-center justify-between">
                                            <div>
                                                <p className="text-xs font-medium text-gray-400">Your Role</p>
                                                <p className="text-sm text-white">{companyRole.display_name}</p>
                                            </div>
                                            <span className="rounded-full border border-orange-500/30 bg-orange-500/20 px-3 py-1 text-xs font-medium text-orange-500">Level {companyRole.hierarchy_level}</span>
                                        </div>
                                    </>
                                )}
                            </div>
                        </div>
                    </div>
                )}

                {/* Subscription - Enhanced */}
                {userSubscription && (
                    <div className="space-y-4">
                        <div className="flex items-center justify-between">
                            <div>
                                <h3 className="text-base font-semibold text-white sm:text-lg">Subscription</h3>
                                <p className="text-xs text-gray-400 sm:text-sm">Your current plan and usage</p>
                            </div>
                            <button onClick={() => setShowSubscriptionManager(true)} className="flex items-center gap-2 rounded bg-white px-3 py-1.5 text-xs font-medium text-black transition-colors hover:bg-gray-100 sm:px-4 sm:py-2 sm:text-sm">
                                <CreditCard className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                                Manage
                            </button>
                        </div>
                        <div className="rounded border border-neutral-800 bg-[#1b1b1b] p-4 sm:p-6">
                            <div className="space-y-5">
                                {/* Plan Header */}
                                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                                    <div className="flex-1">
                                        <div className="flex flex-wrap items-center gap-2">
                                            <p className="text-lg font-bold text-white sm:text-xl">{userSubscription.plan.name} Plan</p>
                                            <span className={`rounded-full border px-2.5 py-0.5 text-xs font-medium ${getStatusColor(userSubscription.status)}`}>{userSubscription.status}</span>
                                        </div>
                                        <p className="mt-1 text-xs text-gray-400 sm:text-sm">€{userSubscription.plan.price_monthly}/month</p>
                                    </div>
                                    <div className="text-left sm:text-right">
                                        <p className="text-xs text-gray-400">Next payment</p>
                                        <p className="text-sm font-medium text-white">
                                            {new Date(userSubscription.next_payment_at).toLocaleDateString('en-US', {
                                                month: 'short',
                                                day: 'numeric',
                                                year: 'numeric'
                                            })}
                                        </p>
                                    </div>
                                </div>

                                <div className="border-t border-neutral-800"></div>

                                {/* Quick Stats Grid */}
                                <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                                    <div className="rounded bg-neutral-800/50 p-3">
                                        <p className="text-xs text-gray-400">Users</p>
                                        <p className="mt-1 text-lg font-semibold text-white">
                                            {userSubscription.current_users_count}/{userSubscription.plan.max_users || '∞'}
                                        </p>
                                    </div>
                                    <div className="rounded bg-neutral-800/50 p-3">
                                        <p className="text-xs text-gray-400">Projects</p>
                                        <p className="mt-1 text-lg font-semibold text-white">
                                            {userSubscription.current_projects_count}/{userSubscription.plan.max_projects || '∞'}
                                        </p>
                                    </div>
                                    <div className="rounded bg-neutral-800/50 p-3">
                                        <p className="text-xs text-gray-400">Deployments</p>
                                        <p className="mt-1 text-lg font-semibold text-white">
                                            {userSubscription.current_deployments_count}/{userSubscription.plan.max_deployments_per_month}
                                        </p>
                                    </div>
                                    <div className="rounded bg-neutral-800/50 p-3">
                                        <p className="text-xs text-gray-400">Storage</p>
                                        <p className="mt-1 text-lg font-semibold text-white">
                                            {userSubscription.current_storage_used_gb.toFixed(1)}/{userSubscription.plan.storage_gb} GB
                                        </p>
                                    </div>
                                </div>

                                {/* Detailed Usage Bars */}
                                <div className="space-y-4">
                                    <div>
                                        <div className="mb-1.5 flex items-center justify-between">
                                            <p className="text-xs font-medium text-gray-400">Team Members</p>
                                            <p className="text-xs text-white">
                                                {userSubscription.current_users_count} / {userSubscription.plan.max_users || '∞'}
                                            </p>
                                        </div>
                                        <div className="h-2 w-full rounded-full bg-neutral-800">
                                            <div
                                                className="h-2 rounded-full bg-gradient-to-r from-orange-500 to-orange-400"
                                                style={{
                                                    width: `${userSubscription.plan.max_users ? Math.min((userSubscription.current_users_count / userSubscription.plan.max_users) * 100, 100) : 0}%`
                                                }}
                                            />
                                        </div>
                                    </div>

                                    <div>
                                        <div className="mb-1.5 flex items-center justify-between">
                                            <p className="text-xs font-medium text-gray-400">Storage Used</p>
                                            <p className="text-xs text-white">
                                                {userSubscription.current_storage_used_gb.toFixed(2)} / {userSubscription.plan.storage_gb} GB
                                            </p>
                                        </div>
                                        <div className="h-2 w-full rounded-full bg-neutral-800">
                                            <div
                                                className="h-2 rounded-full bg-gradient-to-r from-blue-500 to-blue-400"
                                                style={{
                                                    width: `${Math.min((userSubscription.current_storage_used_gb / userSubscription.plan.storage_gb) * 100, 100)}%`
                                                }}
                                            />
                                        </div>
                                    </div>

                                    <div>
                                        <div className="mb-1.5 flex items-center justify-between">
                                            <p className="text-xs font-medium text-gray-400">Deployments This Month</p>
                                            <p className="text-xs text-white">
                                                {userSubscription.current_deployments_this_month} / {userSubscription.plan.max_deployments_per_month}
                                            </p>
                                        </div>
                                        <div className="h-2 w-full rounded-full bg-neutral-800">
                                            <div
                                                className="h-2 rounded-full bg-gradient-to-r from-green-500 to-green-400"
                                                style={{
                                                    width: `${Math.min((userSubscription.current_deployments_this_month / userSubscription.plan.max_deployments_per_month) * 100, 100)}%`
                                                }}
                                            />
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                <div className="border-t border-neutral-800 pt-4">
                    <button className="flex cursor-pointer items-center gap-2 text-xs font-medium text-orange-500 transition-colors hover:text-orange-400 sm:text-sm" onClick={handleSignOut}>
                        <LogOut className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                        Sign out
                    </button>
                </div>
            </div>
        </div>
    )
}

export default UserAccount
