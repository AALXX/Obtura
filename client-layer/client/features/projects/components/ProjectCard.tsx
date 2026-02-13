'use client'
import React, { useState, useRef, useEffect } from 'react'
import { Users, Calendar, MoreVertical, Settings, Trash2, Power, Copy, ExternalLink, AlertTriangle } from 'lucide-react'
import { ProjectResponse } from '../Types/ProjectTypes'

interface ProjectCardProps extends ProjectResponse {
    onDelete?: (id: string) => void
    onToggleStatus?: (id: string, currentStatus: string) => void
    onDuplicate?: (id: string) => void
    onViewDetails?: (id: string) => void
    onSettings?: (id: string) => void
    status?: 'active' | 'inactive' | 'paused'
    showMenu?: boolean
}

interface ProjectCardMenuProps {
    projectId: string
    projectName: string
    status?: 'active' | 'inactive' | 'paused'
    onDelete?: (id: string) => void
    onToggleStatus?: (id: string, currentStatus: string) => void
    onDuplicate?: (id: string) => void
    onViewDetails?: (id: string) => void
    onSettings?: (id: string) => void
}

const ProjectCardMenu: React.FC<ProjectCardMenuProps> = ({
    projectId,
    projectName,
    status = 'active',
    onDelete,
    onToggleStatus,
    onDuplicate,
    onViewDetails,
    onSettings
}) => {
    const [menuOpen, setMenuOpen] = useState(false)
    const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
    const menuRef = useRef<HTMLDivElement>(null)
    const buttonRef = useRef<HTMLButtonElement>(null)

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (
                menuRef.current && 
                !menuRef.current.contains(event.target as Node) &&
                buttonRef.current &&
                !buttonRef.current.contains(event.target as Node)
            ) {
                setMenuOpen(false)
            }
        }

        document.addEventListener('mousedown', handleClickOutside)
        return () => document.removeEventListener('mousedown', handleClickOutside)
    }, [])

    const handleDelete = (e: React.MouseEvent) => {
        e.preventDefault()
        e.stopPropagation()
        setShowDeleteConfirm(true)
        setMenuOpen(false)
    }

    const confirmDelete = (e: React.MouseEvent) => {
        e.preventDefault()
        e.stopPropagation()
        onDelete?.(projectId)
        setShowDeleteConfirm(false)
    }

    const handleToggleStatus = (e: React.MouseEvent) => {
        e.preventDefault()
        e.stopPropagation()
        onToggleStatus?.(projectId, status)
        setMenuOpen(false)
    }

    const handleDuplicate = (e: React.MouseEvent) => {
        e.preventDefault()
        e.stopPropagation()
        onDuplicate?.(projectId)
        setMenuOpen(false)
    }

    const handleViewDetails = (e: React.MouseEvent) => {
        e.preventDefault()
        e.stopPropagation()
        onViewDetails?.(projectId)
        setMenuOpen(false)
    }

    const handleSettings = (e: React.MouseEvent) => {
        e.preventDefault()
        e.stopPropagation()
        onSettings?.(projectId)
        setMenuOpen(false)
    }

    const handleMenuClick = (e: React.MouseEvent) => {
        e.preventDefault()
        e.stopPropagation()
        setMenuOpen(!menuOpen)
    }

    const getStatusLabel = () => {
        switch (status) {
            case 'active':
                return 'Pause Project'
            case 'paused':
            case 'inactive':
                return 'Activate Project'
            default:
                return 'Toggle Status'
        }
    }

    const getStatusIcon = () => {
        switch (status) {
            case 'active':
                return <Power size={16} className="text-yellow-500" />
            default:
                return <Power size={16} className="text-green-500" />
        }
    }

    return (
        <>
            <div className="relative">
                <button
                    ref={buttonRef}
                    className="rounded p-1 text-gray-400 transition-colors hover:bg-zinc-800 hover:text-white"
                    onClick={handleMenuClick}
                >
                    <MoreVertical size={18} />
                </button>

                {menuOpen && (
                    <div
                        ref={menuRef}
                        className="absolute right-0 top-full z-50 mt-1 w-48 rounded-lg border border-zinc-700 bg-[#252525] py-1 shadow-xl"
                        onClick={e => e.stopPropagation()}
                    >
                        <button
                            onClick={handleViewDetails}
                            className="flex w-full items-center gap-2 px-4 py-2 text-left text-sm text-gray-300 transition-colors hover:bg-zinc-700 hover:text-white"
                        >
                            <ExternalLink size={16} />
                            View Details
                        </button>
                        
                        <button
                            onClick={handleSettings}
                            className="flex w-full items-center gap-2 px-4 py-2 text-left text-sm text-gray-300 transition-colors hover:bg-zinc-700 hover:text-white"
                        >
                            <Settings size={16} />
                            Settings
                        </button>

                        <div className="my-1 border-t border-zinc-700" />

                        <button
                            onClick={handleToggleStatus}
                            className="flex w-full items-center gap-2 px-4 py-2 text-left text-sm text-gray-300 transition-colors hover:bg-zinc-700 hover:text-white"
                        >
                            {getStatusIcon()}
                            {getStatusLabel()}
                        </button>

                        <button
                            onClick={handleDuplicate}
                            className="flex w-full items-center gap-2 px-4 py-2 text-left text-sm text-gray-300 transition-colors hover:bg-zinc-700 hover:text-white"
                        >
                            <Copy size={16} />
                            Duplicate
                        </button>

                        <div className="my-1 border-t border-zinc-700" />

                        <button
                            onClick={handleDelete}
                            className="flex w-full items-center gap-2 px-4 py-2 text-left text-sm text-red-400 transition-colors hover:bg-red-500/10 hover:text-red-300"
                        >
                            <Trash2 size={16} />
                            Delete
                        </button>
                    </div>
                )}
            </div>

            {showDeleteConfirm && (
                <div 
                    className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
                    onClick={(e) => {
                        e.preventDefault()
                        e.stopPropagation()
                        setShowDeleteConfirm(false)
                    }}
                >
                    <div 
                        className="w-full max-w-md rounded-xl border border-zinc-700 bg-[#1b1b1b] p-6 shadow-2xl"
                        onClick={e => e.stopPropagation()}
                    >
                        <div className="mb-4 flex items-center gap-3 text-red-500">
                            <AlertTriangle size={32} />
                            <h3 className="text-xl font-semibold text-white">Delete Project</h3>
                        </div>
                        
                        <p className="mb-6 text-gray-300">
                            Are you sure you want to delete <strong className="text-white">{projectName}</strong>?
                            This will permanently remove:
                        </p>
                        
                        <ul className="mb-6 ml-4 list-disc space-y-1 text-sm text-gray-400">
                            <li>All project settings and configurations</li>
                            <li>All builds and deployment history</li>
                            <li>All environment variables</li>
                            <li>GitHub app integration (if connected)</li>
                            <li>Active deployments and containers</li>
                        </ul>

                        <p className="mb-6 text-sm text-red-400">
                            This action cannot be undone.
                        </p>

                        <div className="flex justify-end gap-3">
                            <button
                                onClick={(e) => {
                                    e.preventDefault()
                                    e.stopPropagation()
                                    setShowDeleteConfirm(false)
                                }}
                                className="rounded-lg border border-zinc-700 px-4 py-2 text-sm text-gray-300 transition-colors hover:bg-zinc-800 hover:text-white"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={confirmDelete}
                                className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-red-700"
                            >
                                Delete Project
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </>
    )
}

const ProjectCard: React.FC<ProjectCardProps> = ({ 
    id, 
    projectName, 
    createdAt, 
    slug, 
    teamName, 
    memberCount,
    status = 'active',
    showMenu = true,
    onDelete,
    onToggleStatus,
    onDuplicate,
    onViewDetails,
    onSettings
}) => {
    const formatDate = (dateString: string) => {
        const date = new Date(dateString)
        return date.toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
            year: 'numeric'
        })
    }

    return (
        <div className="group relative rounded-lg border border-zinc-800 bg-[#1b1b1b] p-5 transition-all hover:border-zinc-700 hover:bg-[#202020]">
            <div className="flex items-start justify-between">
                <div className="flex-1">
                    <div className="mb-3 flex items-center gap-3">
                        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-orange-500/10 text-lg font-semibold text-orange-500">
                            {projectName.charAt(0).toUpperCase()}
                        </div>
                        <div className="flex-1">
                            <h3 className="mb-0.5 text-lg font-semibold text-white">{projectName}</h3>
                            {teamName && <p className="text-xs text-gray-500">{teamName}</p>}
                        </div>
                        {status !== 'active' && (
                            <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                                status === 'paused' 
                                    ? 'bg-yellow-500/10 text-yellow-500' 
                                    : 'bg-gray-500/10 text-gray-500'
                            }`}>
                                {status}
                            </span>
                        )}
                    </div>

                    {slug && <p className="mb-4 line-clamp-2 text-sm text-gray-400">{slug}</p>}

                    <div className="flex items-center gap-4 text-xs text-gray-500">
                        <div className="flex items-center gap-1.5">
                            <Users size={14} />
                            <span>
                                {memberCount} {memberCount === 1 ? 'member' : 'members'}
                            </span>
                        </div>
                        <div className="flex items-center gap-1.5">
                            <Calendar size={14} />
                            <span>Created {formatDate(createdAt)}</span>
                        </div>
                    </div>
                </div>

                {showMenu && (
                    <ProjectCardMenu
                        projectId={id}
                        projectName={projectName}
                        status={status}
                        onDelete={onDelete}
                        onToggleStatus={onToggleStatus}
                        onDuplicate={onDuplicate}
                        onViewDetails={onViewDetails}
                        onSettings={onSettings}
                    />
                )}
            </div>
        </div>
    )
}

interface ProjectCardComponent extends React.FC<ProjectCardProps> {
    Menu: React.FC<ProjectCardMenuProps>
}

const ProjectCardWithMenu = ProjectCard as ProjectCardComponent
ProjectCardWithMenu.Menu = ProjectCardMenu

export default ProjectCardWithMenu
