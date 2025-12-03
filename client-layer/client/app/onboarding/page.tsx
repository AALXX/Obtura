import { auth } from '@/features/account/auth/auth'
import { redirect    } from 'next/navigation'
import CompanySetupForm from '@/features/account/onboarding/CompanySetupForm'
import axios from 'axios'
import AuthRequired from '@/common-components/AuthRequredForm'

const OnboardingPage = async () => {
    const session = await auth()

    if (!session || !session.user) {
        return <AuthRequired featureAccess="account" />
    }

    const response = await axios.get<any>(`${process.env.BACKEND_URL}/account-manager/check-company-status/${session.backendToken}`)

    if (response.data.hasCompany) {
        redirect('/account')
    }

    return <CompanySetupForm userEmail={session.user.email!} userName={session.user.name!} userId={session.userId!} accessToken={session.backendToken!} />
}

export default OnboardingPage
