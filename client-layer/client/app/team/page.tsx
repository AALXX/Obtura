import { auth } from '@/features/account/auth/auth'
import AuthRequired from '@/common-components/AuthRequredForm'
import CompanyRequired from '@/common-components/CompayRequired'
import Teams from '@/features/teams/Teams'
import { TeamData } from '@/features/teams/types/TeamTypes'
import { apiClient } from '@/lib/utils'
import { getErrorComponent } from '@/lib/errorHandlers'

const Team = async () => {
    const session = await auth()

    try {
        if (!session || !session.user) {
            return <AuthRequired featureAccess="teams" />
        }
        const response = await apiClient.get<{ hasCompany: boolean }>(`${process.env.BACKEND_URL}/company-manager/check-company-status/${session.backendToken}`)

        const teamData = await apiClient.get<{ teams: TeamData[] }>(`${process.env.BACKEND_URL}/teams-manager/get-teams/${session.backendToken}`)
        if (!response.data.hasCompany) {
            return <CompanyRequired featureAccess="teams" />
        }

        const errorComponent = getErrorComponent(teamData.status, 'teams')
        if (errorComponent) return errorComponent

        return (
            <div>
                <Teams teams={teamData.data.teams} accessToken={session.backendToken!} />
            </div>
        )
    } catch (error) {
        return (
            <div>
                <h1>Something went wrong</h1>
            </div>
        )
    }
}

export default Team
