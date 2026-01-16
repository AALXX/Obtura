import { auth } from '@/features/account/auth/auth'
import { redirect } from 'next/navigation'
import CompanySetupForm from '@/features/account/onboarding/CompanySetupForm'
import AuthRequired from '@/common-components/AuthRequredForm'
import { apiClient } from '@/lib/utils'

const OnboardingPage = async () => {
    const session = await auth()

    if (!session || !session.user) {
        return <AuthRequired featureAccess="account" />
    }

    const response = await apiClient.get<{ hasCompany: boolean }>(`${process.env.BACKEND_URL}/company-manager/check-company-status/${session.backendToken}`)

    if (response.data.hasCompany) {
        redirect('/account')
    }

    return <CompanySetupForm userEmail={session.user.email!} userName={session.user.name!} accessToken={session.backendToken!} />
}

export default OnboardingPage
