import { auth } from '@/features/account/auth/auth'
import { redirect } from 'next/navigation'
import AuthRequired from '@/common-components/AuthRequredForm'
import { apiClient } from '@/lib/utils'
import GitHubOnboardingPage from '@/features/account/onboarding/GithubOnboarding'
import CompanyRequired from '@/common-components/CompayRequired'

const GitHubOnboardingPagePage: React.FC<{
    searchParams: {
        installation_id?: string
        setup_action?: string
        state?: string
    }
}> = async ({ searchParams }) => {
    const { installation_id, setup_action, state } = await searchParams

    const session = await auth()

    if (!session || !session.user) {
        return <AuthRequired featureAccess="account" />
    }

    console.log(installation_id, setup_action, state)

    const response = await apiClient.get<{ hasCompany: boolean }>(`${process.env.BACKEND_URL}/company-manager/check-company-status/${session.backendToken}`)

    if (!response.data.hasCompany) {
        return <CompanyRequired featureAccess="github onboarding" />
    }

    return <GitHubOnboardingPage installationId={installation_id!} setupAction={setup_action!} state={state!} />
}

export default GitHubOnboardingPagePage
