import { auth } from '@/features/account/auth/auth'
import AuthRequired from '@/common-components/AuthRequredForm'
import UserProjects from '@/features/projects/UserProjects'
import CompanyRequired from '@/common-components/CompayRequired'
import { apiClient } from '@/lib/utils'
import { ProjectResponse } from '@/features/projects/Types/ProjectTypes'
import { getErrorComponent } from '@/lib/errorHandlers'

const Projects = async () => {
    const session = await auth()

    try {
        if (!session || !session.user) {
            return <AuthRequired featureAccess="projects" />
        }
        const response = await apiClient.get<{ hasCompany: boolean }>(`${process.env.BACKEND_URL}/company-manager/check-company-status/${session.backendToken}`)

        if (!response.data.hasCompany) {
            return <CompanyRequired featureAccess="projects" />
        }

        const projectData = await apiClient.get<{ projects: ProjectResponse[] }>(`${process.env.BACKEND_URL}/projects-manager/get-projects/${session.backendToken}`)

        const errorComponent = getErrorComponent(projectData.status, 'projects')
        if (errorComponent) return errorComponent

        return (
            <div>
                <UserProjects accessToken={session.backendToken!} projects={projectData.data.projects}  />
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

export default Projects
