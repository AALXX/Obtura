'use client'
import React, { useState } from 'react'
import { Search, Users, Plus, Mail, Phone, Building2 } from 'lucide-react'
import { EmployeeData } from './types/EmplyeesTypes'
import EmployeeCard from './components/EmplyeeCard'
import DialogCanvas from '@/common-components/DialogCanvas'
import InviteEmployeeDialog from './components/InviteEmployeeDialog'

const Employees: React.FC<{ employeesInitial: EmployeeData[]; accessToken: string }> = ({ employeesInitial, accessToken }) => {
    const [searchQuery, setSearchQuery] = useState('')
    const [employees] = useState<EmployeeData[]>(employeesInitial)
    const [showCreateDialog, setShowCreateDialog] = useState(false)

    const filteredEmployees = employees.filter(employee => employee.name.toLowerCase().includes(searchQuery.toLowerCase()) || employee.email.toLowerCase().includes(searchQuery.toLowerCase()) || employee.rolename.toLowerCase().includes(searchQuery.toLowerCase()) || employee.teamname!.toLowerCase().includes(searchQuery.toLowerCase()))

    return (
        <div className="min-h-screen text-white">
            <div className="container mx-auto px-4 py-5 sm:px-6 sm:py-6 lg:px-8 lg:py-7">
                <div className="mb-6 flex items-start justify-between">
                    <div>
                        <h1 className="mb-1.5 text-3xl font-bold">Employees</h1>
                        <p className="text-base text-gray-400">Manage and organize your employees</p>
                    </div>
                    <button onClick={() => setShowCreateDialog(true)} className="flex cursor-pointer items-center gap-2 rounded-lg bg-orange-500 px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-orange-600">
                        <Plus size={20} />
                        New Employee
                    </button>
                </div>

                <div className="relative mb-5">
                    <Search className="absolute top-1/2 left-3.5 -translate-y-1/2 transform text-gray-400" size={20} />
                    <input type="text" placeholder="Search employees..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)} className="w-full rounded-lg border border-zinc-800 bg-[#1b1b1b] py-2.5 pr-3.5 pl-11 text-sm text-white placeholder-gray-500 focus:border-zinc-700 focus:outline-none" />
                </div>

                {showCreateDialog && (
                    <DialogCanvas closeDialog={() => setShowCreateDialog(false)}>
                        <InviteEmployeeDialog accessToken={accessToken} />
                    </DialogCanvas>
                )}

                <div className="space-y-3">
                    {filteredEmployees.map(employee => (
                        <EmployeeCard key={employee.id} {...employee} accessToken={accessToken} />
                    ))}

                    {filteredEmployees.length === 0 && (
                        <div className="py-10 text-center text-gray-400">
                            <Users size={44} className="mx-auto mb-3 opacity-50" />
                            <p className="text-base">No employees found</p>
                        </div>
                    )}
                </div>
            </div>
        </div>
    )
}

export default Employees
