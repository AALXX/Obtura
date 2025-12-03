import { auth } from '@/features/account/auth/auth'
import AuthRequired from '@/common-components/AuthRequredForm'
import axios from 'axios'
import { UserResponse } from '@/features/account/types/AccoutTypes'
import UserProjects from '@/features/projects/UserProjects'
import CompanyRequired from '@/common-components/CompayRequired'
import { useAccountStore } from '@/lib/store/accountStore'

const Projects = async () => {
    const session = await auth()

    try {
        if (!session || !session.user) {
            return <AuthRequired featureAccess="projects" />
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
