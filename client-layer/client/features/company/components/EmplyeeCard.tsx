import { Building2, Mail, Phone } from 'lucide-react'
import { EmployeeData } from '../types/EmplyeesTypes'
import { getInitials } from '@/lib/utils'

const EmployeeCard: React.FC<EmployeeData> = ({ name, email, phone, id, rolename, teamname }) => {
    return (
        <div className="group rounded-lg border border-zinc-800 bg-[#1b1b1b] p-6 transition-all hover:border-zinc-700 hover:bg-[#222]">
            <div className="flex items-start gap-4">
                <div className="relative">
                    <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-orange-500/10 text-sm font-semibold text-orange-500">{getInitials(name)}</div>
                </div>

                <div className="flex-1">
                    <div className="mb-1 flex items-start justify-between">
                        <h3 className="text-lg font-semibold text-white">{name}</h3>
                    </div>

                    <p className="mb-3 text-sm font-medium text-orange-400">{rolename}</p>

                    <div className="space-y-2">
                        <div className="flex items-center gap-2 text-sm text-gray-400">
                            <Mail size={14} />
                            <span>{email}</span>
                        </div>

                        {phone && (
                            <div className="flex items-center gap-2 text-sm text-gray-400">
                                <Phone size={14} />
                                <span>{phone}</span>
                            </div>
                        )}

                        {teamname && (
                            <div className="flex items-center gap-2 text-sm text-gray-400">
                                <Building2 size={14} />
                                <span>{teamname}</span>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    )
}

export default EmployeeCard
