import { auth } from '@/features/account/auth/auth'
import AuthRequired from '@/common-components/AuthRequredForm'
import UserAccount from '@/features/account/UserAccount'
import { UserResponse } from '@/features/account/types/AccoutTypes'
import { apiClient } from '@/lib/utils'
import { getErrorComponent } from '@/lib/errorHandlers'

const Account = async () => {
    const session = await auth()

    try {
        if (!session || !session.user) {
            return <AuthRequired featureAccess="account" />
        }

        const resp = await apiClient.get<UserResponse>(`${process.env.BACKEND_URL}/account-manager/get-account-data/${session.backendToken}`)
        const errorComponent = getErrorComponent(resp.status, 'account')
        if (errorComponent) return errorComponent
        return (
            <div>
                <UserAccount
                    userAccessToken={session.backendToken!}
                    accountType={resp.data.accountType}
                    email={resp.data.email}
                    name={resp.data.name}
                    memberSince={resp.data.memberSince}
                    activeSessions={resp.data.activeSessions}
                    userSubscription={resp.data.userSubscription}
                    companyName={resp.data.companyName}
                    companyRole={resp.data.companyRole}
                    userImg={session.user.image}
                    hasCompany={resp.data.hasCompany}
                />
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

export default Account
