import { auth } from '@/features/account/auth/auth'
import AuthRequired from '@/common-components/AuthRequredForm'
import CompanyRequired from '@/common-components/CompayRequired'
import { apiClient } from '@/lib/utils'
import Employees from '@/features/company/Employees'
import { getErrorComponent } from '@/lib/errorHandlers'
import { EmployeeData } from '@/features/company/types/EmplyeesTypes'

const EmployeesPage = async () => {
    const session = await auth()

    try {
        if (!session || !session.user) {
            return <AuthRequired featureAccess="teams" />
        }
        const response = await apiClient.get<{ hasCompany: boolean }>(`${process.env.BACKEND_URL}/company-manager/check-company-status/${session.backendToken}`)
        if (!response.data.hasCompany) {
            return <CompanyRequired featureAccess="teams" />
        }

        const employeeData = await apiClient.get<{ employees: EmployeeData[] }>(`${process.env.BACKEND_URL}/company-manager/get-employees/${session.backendToken}`)

        const errorComponent = getErrorComponent(employeeData.status, 'teams')
        if (errorComponent) return errorComponent

        return (
            <div>
                <Employees employeesInitial={employeeData.data.employees} />
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

export default EmployeesPage
