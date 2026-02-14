import AuthRequired from "@/common-components/AuthRequredForm"
import Unauthorized from "@/common-components/UnauthorizedAcces"

export const getErrorComponent = (status: number, feature: string) => {
    switch (status) {
        case 401:
            return <AuthRequired featureAccess={feature} />
        case 403:
            return <Unauthorized featureAccess={feature} />
        default:
            return null
    }
}
