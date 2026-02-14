import React, { useState } from 'react'
import { Users, Loader2, Building2 } from 'lucide-react'
import axios from 'axios'
import { TeamData } from '../types/TeamTypes'

const CreateNewTeamDialog: React.FC<{ accessToken: string; closeDialog: () => void; setTeams: React.Dispatch<React.SetStateAction<TeamData[]>> }> = ({ accessToken, closeDialog, setTeams }) => {
    const [formData, setFormData] = useState({
        teamName: '',
        description: ''
    })
    const [errors, setErrors] = useState({
        teamName: '',
        description: ''
    })
    const [isLoading, setIsLoading] = useState(false)
    const [successMessage, setSuccessMessage] = useState('')

    const handleInputChange = (field: string, value: string) => {
        setFormData(prev => ({
            ...prev,
            [field]: value
        }))
        setErrors(prev => ({
            ...prev,
            [field]: ''
        }))
        setSuccessMessage('')
    }

    const validateForm = () => {
        const newErrors = {
            teamName: '',
            description: ''
        }

        if (!formData.teamName.trim()) {
            newErrors.teamName = 'Team name is required'
        } else if (formData.teamName.length < 3) {
            newErrors.teamName = 'Team name must be at least 3 characters'
        } else if (formData.teamName.length > 50) {
            newErrors.teamName = 'Team name must be less than 50 characters'
        }

        if (formData.description.length > 200) {
            newErrors.description = 'Description must be less than 200 characters'
        }

        setErrors(newErrors)
        return !newErrors.teamName && !newErrors.description
    }

    const handleCreateTeam = async () => {
        if (!validateForm()) {
            return
        }

        setIsLoading(true)
        setSuccessMessage('')

        try {
            const resp = await axios.post<{ id: string }>(`${process.env.NEXT_PUBLIC_BACKEND_URL}/teams-manager/create-team`, {
                accessToken: accessToken,
                teamName: formData.teamName,
                teamDescription: formData.description
            })

            if (resp.status !== 200) {
                setIsLoading(false)
                setErrors(prev => ({
                    ...prev,
                    teamName: 'Failed to create team. Please try again.'
                }))
                return
            }

            setIsLoading(false)
            setSuccessMessage('Team created successfully!')

            const newTeam: TeamData = {
                id: resp.data.id,
                name: formData.teamName,
                is_active: true,
                memberCount: 1,
                updated_at: new Date().toISOString()
            }

            setTeams(prev => [...prev, newTeam])

            setTimeout(() => {
                setFormData({ teamName: '', description: '' })
                setSuccessMessage('')
            }, 2000)
        } catch (error) {
            setIsLoading(false)
            setErrors(prev => ({
                ...prev,
                teamName: 'Failed to create team. Please try again.'
            }))
        }
    }

    const handleCancel = () => {
        setFormData({ teamName: '', description: '' })
        setErrors({ teamName: '', description: '' })
        setSuccessMessage('')
        closeDialog()
    }

    return (
        <div className="flex h-full w-full flex-col">
            <div className="pb-4">
                <div className="flex items-center gap-2 text-2xl font-bold text-white">
                    <Users className="h-6 w-6" />
                    Create New Team
                </div>
                <p className="text-gray-300">Set up a new team for your organization</p>
            </div>

            <div className="my-4 h-px w-full border-b border-neutral-800" />

            <div className="flex-1 space-y-6">
                <div>
                    <label htmlFor="teamName" className="mb-2 block text-white">
                        Team Name <span className="text-red-400">*</span>
                    </label>
                    <div className="relative">
                        <Building2 className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-gray-500" size={18} />
                        <input
                            id="teamName"
                            type="text"
                            placeholder="e.g., Frontend Team, Backend Team"
                            value={formData.teamName}
                            onChange={e => handleInputChange('teamName', e.target.value)}
                            className="w-full rounded-md bg-[#0a0a0a] py-2 pr-3 pl-10 text-white placeholder:text-gray-500 focus:ring-2 focus:ring-gray-500 focus:outline-none"
                            maxLength={50}
                        />
                    </div>
                    {errors.teamName && <p className="mt-2 text-sm text-red-400">{errors.teamName}</p>}
                    <p className="mt-1 text-xs text-gray-500">{formData.teamName.length}/50 characters</p>
                </div>

                <div>
                    <label htmlFor="description" className="mb-2 block text-white">
                        Description <span className="text-gray-500">(Optional)</span>
                    </label>
                    <textarea
                        id="description"
                        placeholder="Describe what this team works on..."
                        value={formData.description}
                        onChange={e => handleInputChange('description', e.target.value)}
                        className="min-h-[120px] w-full resize-none rounded-md bg-[#0a0a0a] p-3 text-white placeholder:text-gray-500 focus:ring-2 focus:ring-gray-500 focus:outline-none"
                        maxLength={200}
                    />
                    {errors.description && <p className="mt-2 text-sm text-red-400">{errors.description}</p>}
                    <p className="mt-1 text-xs text-gray-500">{formData.description.length}/200 characters</p>
                </div>

                {successMessage && (
                    <div className="rounded-md border border-green-500/20 bg-green-500/10 p-3">
                        <p className="text-sm text-green-400">{successMessage}</p>
                    </div>
                )}

                <div className="rounded-md bg-[#0a0a0a] p-4">
                    <h3 className="mb-2 text-sm font-medium text-white">What happens next?</h3>
                    <ul className="space-y-2 text-sm text-gray-400">
                        <li className="flex items-start gap-2">
                            <span className="mt-0.5 text-orange-500">•</span>
                            <span>Your team will be created with you as the owner</span>
                        </li>
                        <li className="flex items-start gap-2">
                            <span className="mt-0.5 text-orange-500">•</span>
                            <span>You can invite team members after creation</span>
                        </li>
                        <li className="flex items-start gap-2">
                            <span className="mt-0.5 text-orange-500">•</span>
                            <span>Team projects and deployments will be isolated</span>
                        </li>
                    </ul>
                </div>
            </div>

            <div className="mt-auto space-y-4 pt-6">
                <div className="my-4 h-px w-full border-b border-neutral-800" />

                <div className="flex justify-end gap-3">
                    <button onClick={handleCancel} className="cursor-pointer rounded-md border border-white px-6 py-2 text-white transition-colors hover:bg-[#ffffff1a]" disabled={isLoading}>
                        Cancel
                    </button>
                    <button onClick={handleCreateTeam} disabled={isLoading || !formData.teamName.trim()} className="flex cursor-pointer items-center gap-2 rounded-md bg-orange-500 px-6 py-2 text-white transition-colors hover:bg-orange-600 disabled:cursor-not-allowed disabled:opacity-70">
                        {isLoading ? (
                            <>
                                <Loader2 className="animate-spin" size={18} />
                                Creating...
                            </>
                        ) : (
                            <>
                                <Users size={18} />
                                Create Team
                            </>
                        )}
                    </button>
                </div>

                <div className="rounded-md bg-[#0a0a0a] p-4">
                    <p className="text-sm text-gray-400">
                        <span className="font-medium text-white">Note:</span> Team settings and members can be managed anytime from the team dashboard.
                    </p>
                </div>
            </div>
        </div>
    )
}

export default CreateNewTeamDialog
