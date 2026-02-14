import React, { useState } from 'react'
import { Mail, X, UserPlus, Loader2, Shield, User, Crown, Code, FlaskConical, Palette, BarChart, Eye } from 'lucide-react'
import axios from 'axios'

enum TeamRole {
    CEO = 'ceo',
    CTO = 'cto',
    CFO = 'cfo',
    ENGINEERING_MANAGER = 'engineering_manager',
    TECH_LEAD = 'tech_lead',
    DEVOPS_LEAD = 'devops_lead',
    SENIOR_DEVELOPER = 'senior_developer',
    DEVELOPER = 'developer',
    JUNIOR_DEVELOPER = 'junior_developer',
    QA_LEAD = 'qa_lead',
    QA_ENGINEER = 'qa_engineer',
    PRODUCT_MANAGER = 'product_manager',
    DESIGNER = 'designer',
    BUSINESS_ANALYST = 'business_analyst',
    VIEWER = 'viewer'
}

const TEAM_ROLE_LABELS: Record<TeamRole, string> = {
    [TeamRole.CEO]: 'CEO',
    [TeamRole.CTO]: 'CTO',
    [TeamRole.CFO]: 'CFO',
    [TeamRole.ENGINEERING_MANAGER]: 'Engineering Manager',
    [TeamRole.TECH_LEAD]: 'Tech Lead',
    [TeamRole.DEVOPS_LEAD]: 'DevOps Lead',
    [TeamRole.SENIOR_DEVELOPER]: 'Senior Developer',
    [TeamRole.DEVELOPER]: 'Developer',
    [TeamRole.JUNIOR_DEVELOPER]: 'Junior Developer',
    [TeamRole.QA_LEAD]: 'QA Lead',
    [TeamRole.QA_ENGINEER]: 'QA Engineer',
    [TeamRole.PRODUCT_MANAGER]: 'Product Manager',
    [TeamRole.DESIGNER]: 'Designer',
    [TeamRole.BUSINESS_ANALYST]: 'Business Analyst',
    [TeamRole.VIEWER]: 'Viewer'
}

const ROLE_ICONS: Record<TeamRole, any> = {
    [TeamRole.CEO]: Crown,
    [TeamRole.CTO]: Crown,
    [TeamRole.CFO]: Crown,
    [TeamRole.ENGINEERING_MANAGER]: Shield,
    [TeamRole.TECH_LEAD]: Shield,
    [TeamRole.DEVOPS_LEAD]: Shield,
    [TeamRole.SENIOR_DEVELOPER]: Code,
    [TeamRole.DEVELOPER]: Code,
    [TeamRole.JUNIOR_DEVELOPER]: Code,
    [TeamRole.QA_LEAD]: FlaskConical,
    [TeamRole.QA_ENGINEER]: FlaskConical,
    [TeamRole.PRODUCT_MANAGER]: BarChart,
    [TeamRole.DESIGNER]: Palette,
    [TeamRole.BUSINESS_ANALYST]: BarChart,
    [TeamRole.VIEWER]: Eye
}

interface InviteMember {
    email: string
    role: TeamRole
    id: string
}

const InviteEmployeeDialog: React.FC<{ accessToken: string }> = ({ accessToken }) => {
    const [emails, setEmails] = useState<InviteMember[]>([])
    const [currentEmail, setCurrentEmail] = useState('')
    const [currentRole, setCurrentRole] = useState<TeamRole>(TeamRole.DEVELOPER)
    const [emailError, setEmailError] = useState('')
    const [isLoading, setIsLoading] = useState(false)
    const [successMessage, setSuccessMessage] = useState('')

    const validateEmail = (email: string) => {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
        return emailRegex.test(email)
    }

    const handleAddEmail = () => {
        setEmailError('')
        setSuccessMessage('')

        if (!currentEmail.trim()) {
            setEmailError('Please enter an email address')
            return
        }

        if (!validateEmail(currentEmail)) {
            setEmailError('Please enter a valid email address')
            return
        }

        if (emails.some(e => e.email.toLowerCase() === currentEmail.toLowerCase())) {
            setEmailError('This email has already been added')
            return
        }

        setEmails([...emails, { email: currentEmail, role: currentRole, id: Date.now().toString() }])
        setCurrentEmail('')
        setCurrentRole(TeamRole.DEVELOPER)
    }

    const handleRemoveEmail = (id: string) => {
        setEmails(emails.filter(e => e.id !== id))
        setSuccessMessage('')
    }

    const handleKeyPress = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter') {
            e.preventDefault()
            handleAddEmail()
        }
    }

    const handleSendInvitations = async () => {
        if (emails.length === 0) {
            setEmailError('Please add at least one email address')
            return
        }

        setIsLoading(true)
        setSuccessMessage('')

        try {
            const resp = await axios.post(`${process.env.NEXT_PUBLIC_BACKEND_URL}/company-manager/invite-employees`, {
                accessToken: accessToken,
                invitations: emails.map(e => ({
                    email: e.email,
                    role: e.role,
                    roleName: TEAM_ROLE_LABELS[e.role]
                }))
            })

            if (resp.status !== 200) {
                setEmailError('Something went wrong while sending invitations')
                setIsLoading(false)
                return
            }

            setIsLoading(false)
            setSuccessMessage(`Invitation${emails.length > 1 ? 's' : ''} sent successfully to ${emails.length} member${emails.length > 1 ? 's' : ''}!`)

            setTimeout(() => {
                setEmails([])
                setSuccessMessage('')
            }, 2000)
        } catch (error) {
            setEmailError('Failed to send invitations. Please try again.')
            setIsLoading(false)
        }
    }

    const getRoleColor = (role: TeamRole) => {
        const executiveRoles = [TeamRole.CEO, TeamRole.CTO, TeamRole.CFO]
        const leadRoles = [TeamRole.ENGINEERING_MANAGER, TeamRole.TECH_LEAD, TeamRole.DEVOPS_LEAD, TeamRole.QA_LEAD]

        if (executiveRoles.includes(role)) return 'purple'
        if (leadRoles.includes(role)) return 'orange'
        if (role === TeamRole.VIEWER) return 'gray'
        return 'blue'
    }

    return (
        <div className="flex h-full w-full flex-col">
            <div className="pb-4">
                <div className="flex items-center gap-2 text-2xl font-bold text-white">
                    <UserPlus className="h-6 w-6" />
                    Invite  Members
                </div>
                <p className="text-gray-300">Send invitations to join your company</p>
            </div>

            <div className="my-4 h-px w-full border-b border-neutral-800" />

            <div className="flex-1 space-y-6">
                <form className="space-y-4" onSubmit={e => e.preventDefault()}>
                    <div>
                        <label className="mb-2 block text-white">Email Address</label>
                        <div className="relative">
                            <Mail className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-gray-500" size={18} />
                            <input
                                type="email"
                                placeholder="colleague@company.com"
                                value={currentEmail}
                                onChange={e => {
                                    setCurrentEmail(e.target.value)
                                    setEmailError('')
                                }}
                                onKeyPress={handleKeyPress}
                                className="w-full rounded-md bg-[#0a0a0a] py-2 pr-3 pl-10 text-white placeholder:text-gray-500 focus:ring-2 focus:ring-gray-500 focus:outline-none"
                            />
                        </div>
                    </div>

                    <div>
                        <label className="mb-2 block text-white">Role</label>
                        <select value={currentRole} onChange={e => setCurrentRole(e.target.value as TeamRole)} className="w-full cursor-pointer appearance-none rounded-md bg-[#0a0a0a] px-3 py-2 text-white focus:ring-2 focus:ring-gray-500 focus:outline-none" style={{ backgroundImage: 'none' }}>
                            <optgroup label="Executive">
                                <option value={TeamRole.CEO}>{TEAM_ROLE_LABELS[TeamRole.CEO]}</option>
                                <option value={TeamRole.CTO}>{TEAM_ROLE_LABELS[TeamRole.CTO]}</option>
                                <option value={TeamRole.CFO}>{TEAM_ROLE_LABELS[TeamRole.CFO]}</option>
                            </optgroup>
                            <optgroup label="Leadership">
                                <option value={TeamRole.ENGINEERING_MANAGER}>{TEAM_ROLE_LABELS[TeamRole.ENGINEERING_MANAGER]}</option>
                                <option value={TeamRole.TECH_LEAD}>{TEAM_ROLE_LABELS[TeamRole.TECH_LEAD]}</option>
                                <option value={TeamRole.DEVOPS_LEAD}>{TEAM_ROLE_LABELS[TeamRole.DEVOPS_LEAD]}</option>
                                <option value={TeamRole.QA_LEAD}>{TEAM_ROLE_LABELS[TeamRole.QA_LEAD]}</option>
                                <option value={TeamRole.PRODUCT_MANAGER}>{TEAM_ROLE_LABELS[TeamRole.PRODUCT_MANAGER]}</option>
                            </optgroup>
                            <optgroup label="Development">
                                <option value={TeamRole.SENIOR_DEVELOPER}>{TEAM_ROLE_LABELS[TeamRole.SENIOR_DEVELOPER]}</option>
                                <option value={TeamRole.DEVELOPER}>{TEAM_ROLE_LABELS[TeamRole.DEVELOPER]}</option>
                                <option value={TeamRole.JUNIOR_DEVELOPER}>{TEAM_ROLE_LABELS[TeamRole.JUNIOR_DEVELOPER]}</option>
                            </optgroup>
                            <optgroup label="Other">
                                <option value={TeamRole.QA_ENGINEER}>{TEAM_ROLE_LABELS[TeamRole.QA_ENGINEER]}</option>
                                <option value={TeamRole.DESIGNER}>{TEAM_ROLE_LABELS[TeamRole.DESIGNER]}</option>
                                <option value={TeamRole.BUSINESS_ANALYST}>{TEAM_ROLE_LABELS[TeamRole.BUSINESS_ANALYST]}</option>
                                <option value={TeamRole.VIEWER}>{TEAM_ROLE_LABELS[TeamRole.VIEWER]}</option>
                            </optgroup>
                        </select>
                    </div>

                    <button onClick={handleAddEmail} className="w-full cursor-pointer rounded-md border border-white px-6 py-2 text-white transition-colors hover:bg-[#ffffff1a]">
                        Add Member
                    </button>

                    {emailError && <p className="text-sm text-red-400">{emailError}</p>}
                </form>

                {emails.length > 0 && (
                    <div className="flex-1">
                        <div className="mb-3">
                            <p className="text-white">
                                {emails.length} member{emails.length > 1 ? 's' : ''} to invite
                            </p>
                        </div>
                        <div className="max-h-[300px] space-y-2 overflow-y-auto rounded-md bg-[#0a0a0a] p-4">
                            {emails.map(member => {
                                const Icon = ROLE_ICONS[member.role]
                                const color = getRoleColor(member.role)
                                return (
                                    <div key={member.id} className="flex items-center justify-between rounded-md border border-neutral-800 bg-[#1b1b1b] p-3 transition-colors hover:border-neutral-700">
                                        <div className="flex items-center gap-3">
                                            <div className={`flex h-8 w-8 items-center justify-center rounded-full ${color === 'orange' ? 'bg-orange-500/10' : color === 'purple' ? 'bg-purple-500/10' : color === 'gray' ? 'bg-gray-500/10' : 'bg-blue-500/10'}`}>
                                                <Icon className={color === 'orange' ? 'text-orange-500' : color === 'purple' ? 'text-purple-500' : color === 'gray' ? 'text-gray-500' : 'text-blue-500'} size={16} />
                                            </div>
                                            <div>
                                                <p className="text-white">{member.email}</p>
                                                <p className="text-xs text-gray-400">{TEAM_ROLE_LABELS[member.role]}</p>
                                            </div>
                                        </div>
                                        <button onClick={() => handleRemoveEmail(member.id)} className="rounded p-1 text-gray-400 transition-colors hover:bg-neutral-800 hover:text-white">
                                            <X size={18} />
                                        </button>
                                    </div>
                                )
                            })}
                        </div>
                    </div>
                )}

                {successMessage && (
                    <div className="rounded-md border border-green-500/20 bg-green-500/10 p-3">
                        <p className="text-sm text-green-400">{successMessage}</p>
                    </div>
                )}
            </div>

            <div className="mt-auto space-y-4 pt-6">
                <div className="my-4 h-px w-full border-b border-neutral-800" />

                <div className="flex justify-end gap-3">
                    <button
                        className="cursor-pointer rounded-md border border-white px-6 py-2 text-white transition-colors hover:bg-[#ffffff1a]"
                        onClick={() => {
                            setEmails([])
                            setCurrentEmail('')
                            setCurrentRole(TeamRole.DEVELOPER)
                            setEmailError('')
                            setSuccessMessage('')
                        }}
                    >
                        Cancel
                    </button>
                    <button onClick={handleSendInvitations} disabled={isLoading || emails.length === 0} className="flex cursor-pointer items-center gap-2 rounded-md bg-orange-500 px-6 py-2 text-white transition-colors hover:bg-orange-600 disabled:cursor-not-allowed disabled:opacity-70">
                        {isLoading ? (
                            <>
                                <Loader2 className="animate-spin" size={18} />
                                Sending...
                            </>
                        ) : (
                            <>
                                <Mail size={18} />
                                Send Invitation{emails.length > 1 ? 's' : ''}
                            </>
                        )}
                    </button>
                </div>

                <div className="rounded-md bg-[#0a0a0a] p-4">
                    <p className="text-sm text-gray-400">
                        <span className="font-medium text-white">Note:</span> Invited members will receive an email with instructions to join your team. Invitations expire after 7 days.
                    </p>
                </div>
            </div>
        </div>
    )
}

export default InviteEmployeeDialog
