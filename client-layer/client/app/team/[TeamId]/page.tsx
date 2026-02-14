import { auth } from '@/features/account/auth/auth'
import AuthRequired from '@/common-components/AuthRequredForm'
import axios from 'axios'
import CompanyRequired from '@/common-components/CompayRequired'
import { TeamData, TeamMemberData } from '@/features/teams/types/TeamTypes'
import TeamDetails from '@/features/teams/TeamDetails'
import Unauthorized from '@/common-components/UnauthorizedAcces'
import { apiClient } from '@/lib/utils'
import { getErrorComponent } from '@/lib/errorHandlers'

const TeamDetailsPage: React.FC<{ params: { TeamId: string } }> = async ({ params }) => {
    const session = await auth()
    const { TeamId } = await params

    try {
        if (!session || !session.user) {
            return <AuthRequired featureAccess="teams" />
        }
        const companyStatus = await apiClient.get<{ hasCompany: boolean }>(`${process.env.BACKEND_URL}/company-manager/check-company-status/${session.backendToken}`)


        if (!companyStatus.data.hasCompany) {
            return <CompanyRequired featureAccess="projects" />
        }

        const teamData = await apiClient.get<{ members: TeamMemberData[] }>(`${process.env.BACKEND_URL}/teams-manager/get-team-data/${session.backendToken}/${TeamId}`)
        const errorComponent = getErrorComponent(teamData.status, 'teams')
        if (errorComponent) return errorComponent

        return (
            <div>
                <TeamDetails members={teamData.data.members} accessToken={session.backendToken!} teamId={TeamId} teamName={teamData.data.members[0].teamname} />
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

export default TeamDetailsPage
