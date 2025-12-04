import { auth } from '@/features/account/auth/auth'
import AuthRequired from '@/common-components/AuthRequredForm'
import axios from 'axios'
import { UserResponse } from '@/features/account/types/AccoutTypes'
import UserProjects from '@/features/projects/UserProjects'
import CompanyRequired from '@/common-components/CompayRequired'
import Teams from '@/features/teams/Teams'
import { TeamData } from '@/features/teams/types/TeamTypes'

const getCompanyTeams = async ({ accessToken }: { accessToken: string }): Promise<{ teams: TeamData[] }> => {
    try {
        const response = await axios.get<{ teams: TeamData[] }>(`${process.env.BACKEND_URL}/teams-manager/get-teams/${accessToken}`)
        return response.data
    } catch (error) {
        console.error('Error getting company teams:', error)
        throw error
    }
}

const Team = async () => {
    const session = await auth()

    try {
        if (!session || !session.user) {
            return <AuthRequired featureAccess="projects" />
        }
        const response = await axios.get<{ hasCompany: boolean }>(`${process.env.BACKEND_URL}/account-manager/check-company-status/${session.backendToken}`)

        const teamData = await getCompanyTeams({ accessToken: session.backendToken! })
        if (!response.data.hasCompany) {
            return <CompanyRequired featureAccess="projects" />
        }

        return (
            <div>
                <Teams teams={teamData.teams} accessToken={session.backendToken!} />
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
