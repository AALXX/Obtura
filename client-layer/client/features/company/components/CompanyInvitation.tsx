'use client'
import React, { useState, useEffect } from 'react'
import { Users, Mail, CheckCircle, XCircle, Loader2, AlertCircle, Shield, AtSign } from 'lucide-react'
import axios from 'axios'
import { InvitationData } from '../types/InvitationTypes'

const CompanyInvitation: React.FC<{ invitationData: InvitationData; accessToken?: string }> = ({ invitationData: invitationData, accessToken }) => {
    const [error, setError] = useState<string | null>(null)
    const [accepting, setAccepting] = useState(false)
    const [success, setSuccess] = useState(false)
    const [declined, setDeclined] = useState(false)

    const handleAccept = async () => {
        setAccepting(true)
        try {
            const resp = await axios.post(`${process.env.NEXT_PUBLIC_BACKEND_URL}/company-manager/accept-invitation`, {
                accessToken: accessToken,
                companyId: invitationData?.companyId
            })

            if (resp.status !== 200) {
                setError('Failed to accept invitation. Please try again.')
                return
            }

            setSuccess(true)
            setTimeout(() => {
                window.location.href = `/team`
            }, 2000)
        } catch (err) {
            setError('Failed to accept invitation. Please try again.')
        } finally {
            setAccepting(false)
        }
    }

    const handleDecline = () => {
        setDeclined(true)
        setTimeout(() => {
            window.location.href = '/teams'
        }, 2000)
    }

    if (error && !invitationData) {
        return (
            <div className="flex min-h-screen items-center justify-center p-8">
                <div className="w-full max-w-md rounded-lg border border-zinc-800 bg-[#1b1b1b] p-8 text-center">
                    <XCircle className="mx-auto mb-4 h-16 w-16 text-red-500" />
                    <h2 className="mb-2 text-2xl font-bold text-white">Invalid Invitation</h2>
                    <p className="mb-6 text-gray-400">{error}</p>
                    <button onClick={() => (window.location.href = '/teams')} className="rounded-lg bg-zinc-800 px-6 py-2.5 font-medium text-white transition-colors hover:bg-zinc-700">
                        Go to Teams
                    </button>
                </div>
            </div>
        )
    }

    if (success) {
        return (
            <div className="flex min-h-screen items-center justify-center p-8">
                <div className="w-full max-w-md rounded-lg border border-zinc-800 bg-[#1b1b1b] p-8 text-center">
                    <CheckCircle className="mx-auto mb-4 h-16 w-16 text-green-500" />
                    <h2 className="mb-2 text-2xl font-bold text-white">Invitation Accepted!</h2>
                    <p className="mb-6 text-gray-400">Redirecting you to the team...</p>
                </div>
            </div>
        )
    }

    if (declined) {
        return (
            <div className="flex min-h-screen items-center justify-center p-8">
                <div className="w-full max-w-md rounded-lg border border-zinc-800 bg-[#1b1b1b] p-8 text-center">
                    <XCircle className="mx-auto mb-4 h-16 w-16 text-gray-400" />
                    <h2 className="mb-2 text-2xl font-bold text-white">Invitation Declined</h2>
                    <p className="mb-6 text-gray-400">Redirecting you to teams...</p>
                </div>
            </div>
        )
    }

    return (
        <div className="flex min-h-screen items-center justify-center p-8">
            <div className="w-full max-w-md">
                <div className="mb-8 text-center">
                    <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-lg bg-orange-500/10">
                        <Users className="h-8 w-8 text-orange-500" />
                    </div>
                    <h1 className="mb-2 text-3xl font-bold text-white">{invitationData?.companyName} Invitation</h1>
                    <p className="text-gray-400">You've been invited to join a company</p>
                </div>

                <div className="rounded-lg border border-zinc-800 bg-[#1b1b1b] p-8">
                    <div className="mb-6 space-y-4">
                        <div className="flex items-start gap-3">
                            <Mail className="mt-1 h-5 w-5 text-gray-400" />
                            <div>
                                <p className="text-sm text-gray-400">Invited to</p>
                                <p className="font-medium text-white">{invitationData?.companyName}</p>
                            </div>
                        </div>

                        <div className="flex items-start gap-3">
                            <Users className="mt-1 h-5 w-5 text-gray-400" />
                            <div>
                                <p className="text-sm text-gray-400">Invited by</p>
                                <p className="font-medium text-white">{invitationData?.invitedBy}</p>
                            </div>
                        </div>

                        <div className="flex items-start gap-3">
                            <Shield className="mt-1 h-5 w-5 text-gray-400" />
                            <div>
                                <p className="text-sm text-gray-400">Role</p>
                                <span className={`inline-block rounded-lg bg-orange-500 px-3 py-1 text-sm font-medium text-white`}>{invitationData?.role}</span>
                            </div>
                        </div>

                        <div className="flex items-start gap-3">
                            <AtSign className="mt-1 h-5 w-5 text-gray-400" />
                            <div>
                                <p className="text-sm text-gray-400">Email</p>
                                <p className="font-medium text-white">{invitationData?.invitedEmail}</p>
                            </div>
                        </div>
                    </div>

                    {error && <div className="mb-4 rounded-lg border border-red-500/20 bg-red-500/10 p-3 text-sm text-red-500">{error}</div>}

                    <div className="flex gap-3">
                        <button onClick={handleDecline} disabled={accepting} className="flex-1 cursor-pointer rounded-lg border border-zinc-700 bg-transparent px-6 py-2.5 font-medium text-white transition-colors hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-50">
                            Decline
                        </button>
                        <button onClick={handleAccept} disabled={accepting} className="flex flex-1 cursor-pointer items-center justify-center gap-2 rounded-lg bg-orange-500 px-6 py-2.5 font-medium text-white transition-colors hover:bg-orange-600 disabled:cursor-not-allowed disabled:opacity-50">
                            {accepting ? (
                                <>
                                    <Loader2 className="h-4 w-4 animate-spin" />
                                    Accepting...
                                </>
                            ) : (
                                'Accept Invitation'
                            )}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    )
}
export default CompanyInvitation
