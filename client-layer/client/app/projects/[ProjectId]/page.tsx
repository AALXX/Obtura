import { auth } from '@/features/account/auth/auth'
import AuthRequired from '@/common-components/AuthRequredForm'
import UserProjects from '@/features/projects/UserProjects'
import CompanyRequired from '@/common-components/CompayRequired'
import { apiClient } from '@/lib/utils'
import { ProjectData } from '@/features/projects/Types/ProjectTypes'
import { getErrorComponent } from '@/lib/errorHandlers'
import ProjectDetails from '@/features/projects/ProjectDetails'

const ProjectPage = async ({ params }: { params: { ProjectId: string } }) => {
    const session = await auth()

    const { ProjectId } = await params

    try {
        if (!session || !session.user) {
            return <AuthRequired featureAccess="projects" />
        }
        const response = await apiClient.get<{ hasCompany: boolean }>(`${process.env.BACKEND_URL}/company-manager/check-company-status/${session.backendToken}`)

        if (!response.data.hasCompany) {
            return <CompanyRequired featureAccess="projects" />
        }

        const projectData = await apiClient.get<{ project: ProjectData }>(`${process.env.BACKEND_URL}/projects-manager/get-project-details/${ProjectId}/${session.backendToken}`)
        const projectEnvVariables = await apiClient.get<{ services: { service_name: string; env_vars: Record<string, string> }[] }>(`${process.env.BACKEND_URL}/projects-manager/get-project-environment-variables/${ProjectId}/${session.backendToken}`)

        const errorComponent = getErrorComponent(projectData.status, 'projects')
        if (errorComponent) return errorComponent

        return (
            <div>
                <ProjectDetails projectData={projectData.data.project} accessToken={session.backendToken!} services={projectEnvVariables.data.services} />
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

export default ProjectPage
