'use client'
import { User, Mail, Calendar, LogOut, Settings } from 'lucide-react'
import { UserResponse } from './types/AccoutTypes'
import Image from 'next/image'
import { useState } from 'react'
import DialogCanvas from '@/common-components/DialogCanvas'
import AccountSettings from './components/AcccountSettings'
import { signOut } from 'next-auth/react'

const UserAccount: React.FC<UserResponse & { userAccessToken: string; userImg: string | undefined | null }> = ({ error, email, name, accountType, memberSince, activeSessions, userSubscription, userImg, userAccessToken }) => {
    const [showSettings, setShowSettings] = useState(false)

    const handleSignOut = async () => {
        try {
            const resp = await axios.post<any>(`${process.env.NEXT_PUBLIC_BACKEND_SERVER}/api/user-account-manager/logout`, {
                userAccessToken
            })

            if (resp.data.error) {
                console.error('Error during sign out:', resp.data.error)
                return
            }

            await signOut({ callbackUrl: '/account/login-register' })
        } catch (error) {
            console.error('Error during sign out:', error)
        }
    }

    return (
        <main className="container mx-auto max-w-4xl px-4 py-6 sm:px-6 sm:py-8 lg:px-8 lg:py-10">
            <div className="space-y-5 sm:space-y-6">
                <div>
                    <h2 className="text-2xl font-bold tracking-tight text-white sm:text-3xl">Account Details</h2>
                    <p className="mt-1 text-xs text-gray-400 sm:text-sm">Manage your account information</p>
                </div>

                <div className="border-t border-neutral-800"></div>

                {showSettings && (
                    <DialogCanvas closeDialog={() => setShowSettings(false)}>
                        <AccountSettings email={email} name={name} image={userImg || ''} userSessionToken={''} />
                    </DialogCanvas>
                )}

                <div className="space-y-4">
                    <div>
                        <h3 className="text-base font-semibold text-white sm:text-lg">Profile Information</h3>
                        <p className="text-xs text-gray-400 sm:text-sm">Your personal details and account information</p>
                    </div>
                    <div className="space-y-5 rounded border border-neutral-800 bg-[#1b1b1b] p-4 sm:space-y-6 sm:p-6">
                        <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-center">
                            <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-neutral-800 sm:h-20 sm:w-20">
                                {accountType === 'google' ? <Image alt="User Avatar" width={100} height={100} src={userImg!} className="h-full w-full rounded-full sm:h-full sm:w-full" /> : <User className="h-8 w-8 text-white sm:h-10 sm:w-10" />}
                            </div>
                            <div className="flex w-full text-center sm:text-left">
                                <h3 className="text-base font-semibold text-white sm:text-lg">{name}</h3>
                                <Settings className="h-4 w-4 shrink-0 cursor-pointer self-center text-gray-400 sm:h-5 sm:w-5 md:ml-auto" onClick={() => setShowSettings(!showSettings)} />
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

                <div className="space-y-4">
                    <div>
                        <h3 className="text-base font-semibold text-white sm:text-lg">Subscription</h3>
                        <p className="text-xs text-gray-400 sm:text-sm">Your current plan and billing information</p>
                    </div>
                    <div className="rounded border border-neutral-800 bg-[#1b1b1b] p-4 sm:p-6">
                        <div className="flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
                            <div className="flex-1">
                                <p className="text-sm font-semibold text-white sm:text-base">{userSubscription?.plan.name} Plan</p>
                                <p className="mt-1 text-xs text-gray-400 sm:text-sm">
                                    €{userSubscription?.plan.price_monthly}/month · {userSubscription?.plan.max_users === null ? 'unlimited' : userSubscription?.plan.max_users} users · {userSubscription?.plan.max_projects === null ? 'unlimited' : userSubscription?.plan.max_projects} projects
                                </p>
                            </div>
                            <button className="w-full rounded bg-white px-4 py-2 text-xs font-medium text-black transition-colors hover:bg-gray-100 sm:w-auto sm:text-sm">Manage</button>
                        </div>
                    </div>
                </div>

                <div className="border-t border-neutral-800 pt-4">
                    <button className="flex cursor-pointer items-center gap-2 text-xs font-medium text-orange-500 transition-colors hover:text-orange-400 sm:text-sm" onClick={handleSignOut}>
                        <LogOut className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                        Sign out
                    </button>
                </div>
            </div>
        </main>
    )
}

export default UserAccount
