import { auth } from '@/features/account/auth/auth'
import AuthRequired from '@/common-components/AuthRequredForm'
import axios from 'axios'
import UserProjects from '@/features/projects/UserProjects'
import CompanyRequired from '@/common-components/CompayRequired'

const Projects = async () => {
    const session = await auth()

    try {
        if (!session || !session.user) {
            return <AuthRequired featureAccess="projects" />
        }
        const response = await axios.get<{ hasCompany: boolean }>(`${process.env.BACKEND_URL}/company-manager/check-company-status/${session.backendToken}`)

        if (!response.data.hasCompany) {
            return <CompanyRequired featureAccess="projects" />
        }

        return (
            <div>
                <UserProjects />
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
