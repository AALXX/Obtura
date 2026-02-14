import { useState, useRef, useEffect } from 'react'
import { Building2, Mail, Phone, MoreHorizontal, Shield, Users, Trash2, UserCog, CheckCircle, XCircle, AlertCircle } from 'lucide-react'
import { EmployeeData } from '../types/EmplyeesTypes'
import { getInitials } from '@/lib/utils'
import DialogCanvas from '@/common-components/DialogCanvas'
import ConfirmDialog from '@/common-components/ConfirmDialog'
import axios from 'axios'

type ToastType = 'success' | 'error' | 'info'

interface Toast {
    id: number
    type: ToastType
    message: string
}

interface EmployeeCardProps extends EmployeeData {
    accessToken?: string
}

const EmployeeCard: React.FC<EmployeeCardProps> = ({ name, email, phone, id, rolename, teamname, accessToken }) => {
    const [showMenu, setShowMenu] = useState(false)
    const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
    const [showRoleDialog, setShowRoleDialog] = useState(false)
    const [showTeamDialog, setShowTeamDialog] = useState(false)
    const [isDeleting, setIsDeleting] = useState(false)
    const [toasts, setToasts] = useState<Toast[]>([])
    const menuRef = useRef<HTMLDivElement>(null)

    const showToast = (type: ToastType, message: string) => {
        const id = Date.now()
        setToasts(prev => [...prev, { id, type, message }])
        setTimeout(() => {
            setToasts(prev => prev.filter(t => t.id !== id))
        }, 4000)
    }

    const getToastStyles = (type: ToastType) => {
        switch (type) {
            case 'success':
                return 'bg-green-500/10 border-green-500/50 text-green-400'
            case 'error':
                return 'bg-red-500/10 border-red-500/50 text-red-400'
            case 'info':
                return 'bg-blue-500/10 border-blue-500/50 text-blue-400'
        }
    }

    const getToastIcon = (type: ToastType) => {
        switch (type) {
            case 'success':
                return <CheckCircle size={18} />
            case 'error':
                return <XCircle size={18} />
            case 'info':
                return <AlertCircle size={18} />
        }
    }

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
                setShowMenu(false)
            }
        }
        document.addEventListener('mousedown', handleClickOutside)
        return () => document.removeEventListener('mousedown', handleClickOutside)
    }, [])

    const handleDelete = async () => {
        setIsDeleting(true)
        try {
            const response = await axios({
                method: 'delete',
                url: `${process.env.NEXT_PUBLIC_BACKEND_URL}/company-manager/remove-member`,
                data: {
                    accessToken: accessToken,
                    userId: id
                }
            })
            if (response.data.success) {
                showToast('success', `${name} has been removed from the company`)
                setTimeout(() => window.location.reload(), 1500)
            }
        } catch (error: any) {
            console.error('Failed to delete employee:', error)
            const errorMessage = error.response?.data?.error || 'Failed to remove employee. Please try again.'
            showToast('error', errorMessage)
        } finally {
            setIsDeleting(false)
            setShowDeleteConfirm(false)
        }
    }

    const menuItems = [
        { icon: UserCog, label: 'Change Role', action: () => setShowRoleDialog(true) },
        { icon: Users, label: 'Change Team', action: () => setShowTeamDialog(true) },
        { icon: Trash2, label: 'Remove from Company', action: () => setShowDeleteConfirm(true), danger: true }
    ]

    const component = (
        <>
            <div className="group relative rounded-lg border border-zinc-800 bg-[#1b1b1b] p-6 transition-all hover:border-zinc-700 hover:bg-[#222]">
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

                    <div className="relative" ref={menuRef}>
                        <button
                            onClick={(e) => { e.stopPropagation(); setShowMenu(!showMenu) }}
                            className="flex h-8 w-8 items-center justify-center rounded-lg border border-zinc-700 bg-zinc-800 text-gray-400 opacity-0 transition-all hover:bg-zinc-700 hover:text-white group-hover:opacity-100"
                        >
                            <MoreHorizontal size={16} />
                        </button>

                        {showMenu && (
                            <div className="absolute right-0 top-12 z-50 w-56 overflow-hidden rounded-lg border border-zinc-700 bg-zinc-900 shadow-xl">
                                {menuItems.map((item, index) => (
                                    <button
                                        key={index}
                                        onClick={() => { setShowMenu(false); item.action() }}
                                        className={`flex w-full items-center gap-3 px-4 py-2.5 text-sm transition-colors ${
                                            item.danger 
                                                ? 'text-red-400 hover:bg-red-500/10' 
                                                : 'text-gray-300 hover:bg-zinc-800 hover:text-white'
                                        }`}
                                    >
                                        <item.icon size={16} />
                                        {item.label}
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            </div>

            <ConfirmDialog
                isOpen={showDeleteConfirm}
                onClose={() => setShowDeleteConfirm(false)}
                onConfirm={handleDelete}
                title="Remove Employee"
                message={`Are you sure you want to remove ${name} from the company? They will lose access to all company resources.`}
                confirmText="Remove"
                cancelText="Cancel"
                variant="danger"
                isLoading={isDeleting}
            />

            {showRoleDialog && (
                <DialogCanvas closeDialog={() => setShowRoleDialog(false)}>
                    <div className="w-full">
                        <div className="mb-6 flex items-center gap-4">
                            <div className="flex h-14 w-14 flex-shrink-0 items-center justify-center rounded-full bg-blue-500/10">
                                <Shield className="h-7 w-7 text-blue-500" />
                            </div>
                            <div>
                                <h3 className="text-xl font-semibold text-white">Change Role</h3>
                                <p className="text-sm text-zinc-400">Update permissions for this employee</p>
                            </div>
                        </div>
                        <div className="space-y-2">
                            {['Owner', 'Admin', 'Developer', 'Viewer'].map((role) => (
                                <button
                                    key={role}
                                    onClick={() => {
                                        alert('Role change functionality coming soon')
                                        setShowRoleDialog(false)
                                    }}
                                    className={`flex w-full items-center justify-between rounded-lg border p-4 text-left transition-all ${
                                        rolename === role 
                                            ? 'border-orange-500 bg-orange-500/10' 
                                            : 'border-zinc-700 bg-zinc-800 hover:border-zinc-600'
                                    }`}
                                >
                                    <div>
                                        <div className="font-medium text-white">{role}</div>
                                        <div className="text-xs text-zinc-400">
                                            {role === 'Owner' && 'Full access to all resources'}
                                            {role === 'Admin' && 'Manage settings and team members'}
                                            {role === 'Developer' && 'Build and deploy projects'}
                                            {role === 'Viewer' && 'View only access'}
                                        </div>
                                    </div>
                                    {rolename === role && <Shield size={18} className="text-orange-500" />}
                                </button>
                            ))}
                        </div>
                    </div>
                </DialogCanvas>
            )}

            {showTeamDialog && (
                <DialogCanvas closeDialog={() => setShowTeamDialog(false)}>
                    <div className="w-full">
                        <div className="mb-6 flex items-center gap-4">
                            <div className="flex h-14 w-14 flex-shrink-0 items-center justify-center rounded-full bg-purple-500/10">
                                <Users className="h-7 w-7 text-purple-500" />
                            </div>
                            <div>
                                <h3 className="text-xl font-semibold text-white">Change Team</h3>
                                <p className="text-sm text-zinc-400">Move employee to a different team</p>
                            </div>
                        </div>
                        <div className="space-y-2">
                            {['Engineering', 'Marketing', 'Sales', 'Support'].map((team) => (
                                <button
                                    key={team}
                                    onClick={() => {
                                        alert('Team change functionality coming soon')
                                        setShowTeamDialog(false)
                                    }}
                                    className={`flex w-full items-center justify-between rounded-lg border p-4 text-left transition-all ${
                                        teamname === team 
                                            ? 'border-orange-500 bg-orange-500/10' 
                                            : 'border-zinc-700 bg-zinc-800 hover:border-zinc-600'
                                    }`}
                                >
                                    <div>
                                        <div className="font-medium text-white">{team}</div>
                                        <div className="text-xs text-zinc-400">
                                            {team === 'Engineering' && 'Development and infrastructure'}
                                            {team === 'Marketing' && 'Marketing and growth'}
                                            {team === 'Sales' && 'Sales and partnerships'}
                                            {team === 'Support' && 'Customer success'}
                                        </div>
                                    </div>
                                    {teamname === team && <Users size={18} className="text-orange-500" />}
                                </button>
                            ))}
                        </div>
                    </div>
                </DialogCanvas>
            )}
        </>
    )

    return (
        <>
            {component}
            <div className="fixed bottom-4 right-4 z-[100] flex flex-col gap-2">
                {toasts.map(toast => (
                    <div
                        key={toast.id}
                        className={`flex min-w-[280px] items-center gap-3 rounded-lg border px-4 py-3 shadow-lg ${getToastStyles(toast.type)}`}
                    >
                        {getToastIcon(toast.type)}
                        <span className="text-sm font-medium">{toast.message}</span>
                    </div>
                ))}
            </div>
        </>
    )
}

export default EmployeeCard