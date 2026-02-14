import { auth } from '@/features/account/auth/auth'
import AuthRequired from '@/common-components/AuthRequredForm'
import axios from 'axios'
import CompanyRequired from '@/common-components/CompayRequired'
import CompanyInvitation from '@/features/company/components/CompanyInvitation'
import { AlertCircle } from 'lucide-react'
import jwt from 'jsonwebtoken'
import { apiClient } from '@/lib/utils'
import { InvitationData } from '@/features/company/types/InvitationTypes'

interface InvitationPageProps {
    params: {
        InvitationId: string
    }
}

const Invitation = async ({ params }: InvitationPageProps) => {
    const { InvitationId } = await params
    const session = await auth()

    try {
        if (!session || !session.user) {
            return <AuthRequired featureAccess="invitations" />
        }

        const response = await apiClient.get<{ hasCompany: boolean }>(`${process.env.BACKEND_URL}/account-manager/check-company-status/${session.backendToken}`)

        const invitationData = jwt.verify(InvitationId, process.env.TEAM_INVITATION_SECRET as string)
        
        if (response.data.hasCompany) {
            return <CompanyRequired featureAccess="invitations" />
        }

        return (
            <div>
                <CompanyInvitation invitationData={invitationData as InvitationData} accessToken={session.backendToken!} />
            </div>
        )
    } catch (error) {
        const isJWTError = error instanceof Error && (error.name === 'JsonWebTokenError' || error.name === 'TokenExpiredError' || error.name === 'NotBeforeError')

        const errorMessage = isJWTError ? (error instanceof Error ? error.message : 'Invalid signature') : 'Unable to load invitation. Please try again later.'
        return (
            <div className="flex min-h-screen items-center justify-center p-8">
                <div className="w-full max-w-md rounded-lg border border-zinc-800 bg-[#1b1b1b] p-8 text-center">
                    <AlertCircle className="mx-auto mb-4 h-16 w-16 text-red-500" />
                    <h1 className="mb-2 text-2xl font-bold text-white">{isJWTError ? 'Invalid Invitation' : 'Something went wrong'}</h1>
                </div>
            </div>
        )
    }
}

export default Invitation
