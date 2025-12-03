import { auth } from '@/features/account/auth/auth'
import AuthRequired from '@/common-components/AuthRequredForm'
import UserAccount from '@/features/account/UserAccount'
import axios from 'axios'
import { UserResponse } from '@/features/account/types/AccoutTypes'

const Account = async () => {
    const session = await auth()

    try {
        if (!session || !session.user) {
            return <AuthRequired featureAccess="account" />
        }

        const resp = await axios.get<UserResponse>(`${process.env.BACKEND_URL}/account-manager/get-account-data/${session.backendToken}`)
        if (resp.status !== 200) {
            return <AuthRequired featureAccess="account" />
        }

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
