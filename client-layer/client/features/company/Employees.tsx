'use client'
import React, { useState } from 'react'
import { Search, Users, Plus, Mail, Phone, Building2 } from 'lucide-react'
import { EmployeeData } from './types/EmplyeesTypes'
import EmployeeCard from './components/EmplyeeCard'

const CreateEmployeeDialog: React.FC<{ closeDialog: () => void }> = ({ closeDialog }) => {
    const handleSubmit = () => {
        // Handle form submission logic here
        closeDialog()
    }

    return (
        <div className="w-full max-w-md rounded-lg bg-[#1b1b1b] p-6">
            <h2 className="mb-4 text-2xl font-bold text-white">Add New Employee</h2>
            <div className="space-y-4">
                <div>
                    <label className="mb-1 block text-sm font-medium text-gray-300">Full Name</label>
                    <input type="text" className="w-full rounded-lg border border-zinc-800 bg-[#222] px-4 py-2 text-white focus:border-orange-500 focus:outline-none" placeholder="John Doe" />
                </div>

                <div>
                    <label className="mb-1 block text-sm font-medium text-gray-300">Email</label>
                    <input type="email" className="w-full rounded-lg border border-zinc-800 bg-[#222] px-4 py-2 text-white focus:border-orange-500 focus:outline-none" placeholder="john.doe@company.com" />
                </div>

                <div>
                    <label className="mb-1 block text-sm font-medium text-gray-300">Position</label>
                    <input type="text" className="w-full rounded-lg border border-zinc-800 bg-[#222] px-4 py-2 text-white focus:border-orange-500 focus:outline-none" placeholder="Software Engineer" />
                </div>

                <div>
                    <label className="mb-1 block text-sm font-medium text-gray-300">Department</label>
                    <select className="w-full rounded-lg border border-zinc-800 bg-[#222] px-4 py-2 text-white focus:border-orange-500 focus:outline-none">
                        <option>Engineering</option>
                        <option>Product</option>
                        <option>Design</option>
                        <option>Marketing</option>
                        <option>Sales</option>
                    </select>
                </div>

                <div className="flex gap-3 pt-4">
                    <button onClick={closeDialog} className="flex-1 rounded-lg border border-zinc-700 px-4 py-2 text-white transition-colors hover:bg-zinc-800">
                        Cancel
                    </button>
                    <button onClick={handleSubmit} className="flex-1 rounded-lg bg-orange-500 px-4 py-2 text-white transition-colors hover:bg-orange-600">
                        Add Employee
                    </button>
                </div>
            </div>
        </div>
    )
}

// Dialog Canvas Component
const DialogCanvas: React.FC<{ children: React.ReactNode; closeDialog: () => void }> = ({ children, closeDialog }) => {
    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={closeDialog}>
            <div onClick={e => e.stopPropagation()}>{children}</div>
        </div>
    )
}

const Employees: React.FC<{ employeesInitial: EmployeeData[] }> = ({ employeesInitial }) => {
    const [searchQuery, setSearchQuery] = useState('')
    const [employees] = useState<EmployeeData[]>(employeesInitial)
    const [showCreateDialog, setShowCreateDialog] = useState(false)

    const filteredEmployees = employees.filter(employee => employee.name.toLowerCase().includes(searchQuery.toLowerCase()) || employee.email.toLowerCase().includes(searchQuery.toLowerCase()) || employee.rolename.toLowerCase().includes(searchQuery.toLowerCase()) || employee.teamname!.toLowerCase().includes(searchQuery.toLowerCase()))

    return (
        <div className="min-h-screen ztext-white">
            <div className="container mx-auto px-4 py-6 sm:px-6 sm:py-8 lg:px-8 lg:py-10">
                <div className="mb-8 flex items-start justify-between">
                    <div>
                        <h1 className="mb-2 text-4xl font-bold">Employees</h1>
                        <p className="text-lg text-gray-400">Manage and organize your employees</p>
                    </div>
                    <button onClick={() => setShowCreateDialog(true)} className="flex cursor-pointer items-center gap-2 rounded-lg bg-orange-500 px-6 py-3 font-medium text-white transition-colors hover:bg-orange-600">
                        <Plus size={20} />
                        New Employee
                    </button>
                </div>

                <div className="relative mb-6">
                    <Search className="absolute top-1/2 left-4 -translate-y-1/2 transform text-gray-400" size={20} />
                    <input type="text" placeholder="Search employees..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)} className="w-full rounded-lg border border-zinc-800 bg-[#1b1b1b] py-3 pr-4 pl-12 text-white placeholder-gray-500 focus:border-zinc-700 focus:outline-none" />
                </div>

                {showCreateDialog && (
                    <DialogCanvas closeDialog={() => setShowCreateDialog(false)}>
                        <CreateEmployeeDialog closeDialog={() => setShowCreateDialog(false)} />
                    </DialogCanvas>
                )}

                <div className="space-y-4">
                    {filteredEmployees.map(employee => (
                        <EmployeeCard key={employee.id} {...employee} />
                    ))}

                    {filteredEmployees.length === 0 && (
                        <div className="py-12 text-center text-gray-400">
                            <Users size={48} className="mx-auto mb-4 opacity-50" />
                            <p className="text-lg">No employees found</p>
                        </div>
                    )}
                </div>
            </div>
        </div>
    )
}

export default Employees
