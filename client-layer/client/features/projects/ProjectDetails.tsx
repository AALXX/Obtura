'use client'
import React, { useEffect, useRef, useState } from 'react'
import { Rocket, Settings, Activity, Globe, GitBranch, Clock, CheckCircle2, XCircle, Eye, Code, Server, Lock, RotateCcw, Play, Pause, Plus, Trash2, Copy, ExternalLink, TrendingUp, Zap, Shield, Layers, Package, Hammer, Upload, Calendar, Save, Loader2, AlertCircle } from 'lucide-react'
import { Build, BuildStatus, DeploymentConfig, Deployment, ProjectData, Container, Alert, EnvironmentDeployment } from './Types/ProjectTypes'
import EnvFileUpload from '../account/components/EnvFileUpload'
import DialogCanvas from '@/common-components/DialogCanvas'
import axios from 'axios'
import BuildDialog from './components/BuildDialog'
import BuildConfigDialog from './components/BuildConfigDialog'
import BuildLogsViewer from './components/BuildLogsViewer'
import EnvVarsCard from './components/EnvVarCard'
import { useBuildUpdates } from '@/hooks/useBuildUpdates'
import DeployDialog from './components/DeployDialog'
import AlertCard from './components/AlertCard'
import DeploymentLogsViewer from './components/DeploymentLogsViewer'
import DeploymentSettings from './components/DeploymentSettings'
import MonitoringDashboard from './components/MonitoringDashboard'
import { useDeploymentUpdates } from '@/hooks/useDeployuseDeploymentUpdates'

const ProjectDetails: React.FC<{ projectData: ProjectData; accessToken: string; services: { service_name: string; env_vars: Record<string, string> }[] }> = ({ projectData, accessToken, services }) => {
    const [activeTab, setActiveTab] = useState<'overview' | 'deployments' | 'deploymentHistory' | 'environment' | 'settings' | 'monitoring' | 'builds'>('overview')

    const [envVars, setEnvVars] = useState<{ key: string; value: string; service: string }[]>(
        services.flatMap(service =>
            Object.entries(service.env_vars).map(([key, value]) => ({
                key,
                value,
                service: service.service_name
            }))
        )
    )
    const [hasChanges, setHasChanges] = useState(false)
    const [isSaving, setIsSaving] = useState(false)
    const [selectedService, setSelectedService] = useState('')

    const serviceNames = Array.from(new Set(services.map(s => s.service_name)))

    const [showAddEnv, setShowAddEnv] = useState(false)
    const [newEnvKey, setNewEnvKey] = useState('')
    const [newEnvValue, setNewEnvValue] = useState('')
    const [newEnvService, setNewEnvService] = useState('')
    const [isDeploying, setIsDeploying] = useState(false)
    const [openBuildDialog, setOpenBuildDialog] = useState(false)
    const [showBuildConfigDialog, setShowBuildConfigDialog] = useState(false)
    const [showEnvFileDialog, setShowEnvFileDialog] = useState(false)

    const [currentBuildId, setCurrentBuildId] = useState<string | null>(null)

    // Deploy dialog state
    const [showDeployDialog, setShowDeployDialog] = useState(false)
    const [deployEnvironment, setDeployEnvironment] = useState('')
    const [selectedBranch, setSelectedBranch] = useState(projectData.production?.branch || 'main')
    const [deploymentStrategy, setDeploymentStrategy] = useState(projectData.production?.deploymentStrategy || 'blue_green')
    const [enableMonitoring, setEnableMonitoring] = useState(true)
    const [deploymentEnvironment, setDeploymentEnvironment] = useState<'production' | 'staging' | 'preview'>('production')

    const [showDeploymentLogs, setShowDeploymentLogs] = useState(false)
    const [currentDeploymentId, setCurrentDeploymentId] = useState<string | null>(null)
    const [currentDeploymentBuildId, setCurrentDeploymentBuildId] = useState<string | null>(null)
    const [currentDeploymentMode, setCurrentDeploymentMode] = useState<'deploying' | 'history'>('deploying')
    const [currentContainers, setCurrentContainers] = useState<Container[]>([])
    const [isBuildAndDeploy, setIsBuildAndDeploy] = useState(false)

    const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
    const [deploymentToDelete, setDeploymentToDelete] = useState<string | null>(null)
    const [isDeletingDeployment, setIsDeletingDeployment] = useState(false)
    const [deleteNotification, setDeleteNotification] = useState<{ show: boolean; success: boolean; message: string }>({ show: false, success: false, message: '' })

    const [productionEnv, setProductionEnv] = useState<EnvironmentDeployment | null>(projectData.production)
    const [stagingEnv, setStagingEnv] = useState<EnvironmentDeployment | null>(projectData.staging)

    const [deployments, setDeployments] = useState<Deployment[]>(
        projectData.deployments.map(deployment => ({
            id: deployment.id,
            environment: deployment.environment,
            status: deployment.status,
            deploymentStrategy: deployment.deploymentStrategy,
            branch: deployment.branch,
            commitHash: deployment.commitHash,
            deploymentUrl: deployment.deploymentUrl,
            deploymentTrigger: deployment.deploymentTrigger,
            trafficPercentage: deployment.trafficPercentage,
            replicaCount: deployment.replicaCount,
            framework: deployment.framework,
            deployedBy: deployment.deployedBy,
            startedAt: deployment.startedAt,
            completedAt: deployment.completedAt,
            duration: deployment.duration,
            buildTime: deployment.buildTime,
            strategyPhase: deployment.strategyPhase,
            trafficSwitchCount: deployment.trafficSwitchCount,
            errorMessage: deployment.errorMessage,
            containers: (deployment as any).containers || [],
            unresolvedAlerts: deployment.unresolvedAlerts || [],
            unresolvedAlertCount: deployment.unresolvedAlertCount || 0
        }))
    )
    const liveDeployments = useDeploymentUpdates(projectData.id, deployments)

    useEffect(() => {
        const productionDeployment = liveDeployments.find(d => d.environment === 'production')
        const stagingDeployment = liveDeployments.find(d => d.environment === 'staging')

        if (productionDeployment) {
            setProductionEnv(prev => prev ? {
                ...prev,
                status: productionDeployment.status,
                deploymentStrategy: productionDeployment.deploymentStrategy,
                branch: productionDeployment.branch,
                commitHash: productionDeployment.commitHash,
                containers: productionDeployment.containers || [],
                totalContainers: productionDeployment.containers?.length || 0,
                healthyContainers: productionDeployment.containers?.filter(c => c.healthStatus === 'healthy').length || 0,
                unresolvedAlerts: productionDeployment.unresolvedAlerts || [],
                unresolvedAlertCount: productionDeployment.unresolvedAlertCount || 0
            } : null)
        }

        if (stagingDeployment) {
            setStagingEnv(prev => prev ? {
                ...prev,
                status: stagingDeployment.status,
                deploymentStrategy: stagingDeployment.deploymentStrategy,
                branch: stagingDeployment.branch,
                commitHash: stagingDeployment.commitHash,
                containers: stagingDeployment.containers || [],
                totalContainers: stagingDeployment.containers?.length || 0,
                healthyContainers: stagingDeployment.containers?.filter(c => c.healthStatus === 'healthy').length || 0,
                unresolvedAlerts: stagingDeployment.unresolvedAlerts || [],
                unresolvedAlertCount: stagingDeployment.unresolvedAlertCount || 0
            } : null)
        }
    }, [liveDeployments])

    useEffect(() => {
        const fetchUpdatedDeploymentData = async () => {
            try {
                console.log('Fetching updated deployment data...')
                const resp = await axios.get<{ error: boolean; project: any }>(`${process.env.NEXT_PUBLIC_BACKEND_URL}/projects-manager/get-project-details/${projectData.id}/${accessToken}`)
                console.log('API Response:', resp.data)
                
                if (resp.data?.error === false && resp.data?.project) {
                    const updatedProject = resp.data.project
                    console.log('Updated project production:', updatedProject.production)
                    console.log('Updated project staging:', updatedProject.staging)
                    
                    if (updatedProject.production) {
                        setProductionEnv(prev => {
                            console.log('Merging production:', prev, 'with', updatedProject.production)
                            return prev ? { ...prev, ...updatedProject.production } : updatedProject.production
                        })
                    }
                    if (updatedProject.staging) {
                        setStagingEnv(prev => {
                            console.log('Merging staging:', prev, 'with', updatedProject.staging)
                            return prev ? { ...prev, ...updatedProject.staging } : updatedProject.staging
                        })
                    }
                }
            } catch (error) {
                console.error('Failed to fetch updated deployment data:', error)
            }
        }

        const productionDeployment = liveDeployments.find(d => d.environment === 'production')
        const stagingDeployment = liveDeployments.find(d => d.environment === 'staging')

        console.log('Checking for active deployment - production:', productionDeployment?.status, 'staging:', stagingDeployment?.status)

        if (productionDeployment?.status === 'active' || stagingDeployment?.status === 'active') {
            fetchUpdatedDeploymentData()
        }
    }, [liveDeployments, accessToken, projectData.id])

    const [alerts, setAlerts] = useState<Alert[]>(() => {
        const productionAlerts = projectData.production?.unresolvedAlerts || []
        const stagingAlerts = projectData.staging?.unresolvedAlerts || []
        const deploymentAlerts = projectData.deployments.flatMap(d => d.unresolvedAlerts || [])
        const projectAlerts = (projectData as any).alerts || []
        const allAlerts = [...productionAlerts, ...stagingAlerts, ...deploymentAlerts, ...projectAlerts]
        const uniqueAlerts = Array.from(new Map(allAlerts.map(a => [a.id, a])).values())
        return uniqueAlerts
    })

    const [resolvingAlerts, setResolvingAlerts] = useState<Set<string>>(new Set())

    useEffect(() => {
        const productionAlerts = projectData.production?.unresolvedAlerts || []
        const stagingAlerts = projectData.staging?.unresolvedAlerts || []
        const deploymentAlerts = projectData.deployments.flatMap(d => d.unresolvedAlerts || [])
        const projectAlerts = (projectData as any).alerts || []
        const allAlerts = [...productionAlerts, ...stagingAlerts, ...deploymentAlerts, ...projectAlerts]
        const uniqueAlerts = Array.from(new Map(allAlerts.map(a => [a.id, a])).values())
        setAlerts(uniqueAlerts)
    }, [projectData.production?.unresolvedAlerts, projectData.staging?.unresolvedAlerts, projectData.deployments, (projectData as any).alerts])

    const [builds, setBuilds] = useState<Build[]>(
        projectData.builds.map(build => ({
            id: build.id,
            status: build.status === 'completed' ? 'success' : (build.status as BuildStatus),
            branch: build.branch,
            commitHash: build.commitHash,
            startTime: build.createdAt,
            createdAt: build.createdAt,
            duration: build.buildTime || undefined,
            framework: build.framework || undefined,
            initiatedBy: build.initiatedBy || undefined,
            errorMessage: build.errorMessage || undefined
        }))
    )
    const liveBuilds = useBuildUpdates(projectData.id, builds)

    const [selectedBuild, setSelectedBuild] = useState<Build | null>(null)
    const [showBuildLogs, setShowBuildLogs] = useState(false)

    const [currentPage, setCurrentPage] = useState(1)
    const buildsPerPage = 10

    const indexOfLastBuild = currentPage * buildsPerPage
    const indexOfFirstBuild = indexOfLastBuild - buildsPerPage
    const currentBuilds = liveBuilds.slice(indexOfFirstBuild, indexOfLastBuild)
    const totalPages = Math.ceil(liveBuilds.length / buildsPerPage)

    const handlePageChange = (page: number) => {
        setCurrentPage(page)
    }

    const handleDeploy = async (config: DeploymentConfig) => {
        try {
            setIsDeploying(true)

            const deployUrl = config.buildId ? `trigger-deploy?buildId=${config.buildId}` : `trigger-deploy`

            const resp = await axios.post<{ buildId: string; deploymentId: string; environment: string; branch: string; commitHash: string }>(`${process.env.NEXT_PUBLIC_BACKEND_URL}/projects-manager/${deployUrl}`, {
                accessToken: accessToken,
                projectId: projectData.id,
                environment: config.environment,
                strategy: config.strategy
            })

            if (resp.status !== 200) {
                alert("There's an error in your deployment configuration")
                setIsDeploying(false)
                return
            }

            if (resp.data.deploymentId) {
                const newDeployment: Deployment = {
                    id: resp.data.deploymentId,
                    environment: resp.data.environment as 'production' | 'staging' | 'preview',
                    status: 'pending',
                    deploymentStrategy: config.strategy as 'blue_green' | 'rolling' | 'canary' | 'recreate',
                    branch: resp.data.branch,
                    commitHash: resp.data.commitHash,
                    deploymentUrl: '',
                    deploymentTrigger: 'manual',
                    trafficPercentage: 0,
                    replicaCount: 1,
                    framework: null,
                    deployedBy: null,
                    startedAt: 'Just now',
                    completedAt: null,
                    duration: null,
                    buildTime: null,
                    strategyPhase: 'preparing',
                    trafficSwitchCount: 0,
                    errorMessage: null,
                    buildId: resp.data.buildId || config.buildId
                }

                setDeployments(prev => [newDeployment, ...prev])

                const newEnv: EnvironmentDeployment = {
                    url: `${projectData.slug}.obtura.app`,
                    status: 'active',
                    deploymentStrategy: config.strategy || 'blue_green',
                    branch: resp.data.branch,
                    commitHash: resp.data.commitHash,
                    lastDeployment: 'Just now',
                    containers: [],
                    totalContainers: 0,
                    healthyContainers: 0,
                    unhealthyContainers: 0,
                    unresolvedAlerts: [],
                    unresolvedAlertCount: 0,
                    replicaCount: 1,
                    autoScalingEnabled: false,
                    instanceType: null,
                    trafficPercentage: 0,
                    currentRequestsPerMinute: 0,
                    avgResponseTime: '0ms',
                    errorRate: '0%',
                    sslEnabled: true,
                    monitoringEnabled: true,
                    deploymentTrigger: 'manual',
                    buildTime: null,
                    framework: null,
                    strategyDetails: null
                }
                if (config.environment === 'production') {
                    setProductionEnv(newEnv)
                } else {
                    setStagingEnv(newEnv)
                }

                // Show deployment logs viewer in deploying mode
                setCurrentDeploymentId(resp.data.deploymentId)
                setCurrentDeploymentBuildId(resp.data.buildId || config.buildId || null)
                setDeploymentEnvironment(config.environment || 'production')
                setDeploymentStrategy(config.strategy || 'blue_green')
                setCurrentDeploymentMode('deploying')
                setIsBuildAndDeploy(!config.buildId) // true if no buildId provided (new build needed)
                setShowDeploymentLogs(true)
                setShowDeployDialog(false)
            }

            setIsDeploying(false)
        } catch (error) {
            alert("There's an error in your deployment configuration")
            setIsDeploying(false)
        }
    }

    const handleResolveAlert = async (alertId: string) => {
        setResolvingAlerts(prev => new Set(prev).add(alertId))

        try {
            await axios.post(`${process.env.NEXT_PUBLIC_MONITORING_SERVICE_URL}/api/alerts/${alertId}/resolve/${accessToken}`)

            setAlerts(prev => prev.filter(alert => alert.id !== alertId))

            setDeployments(prev =>
                prev.map(deployment => {
                    if (!deployment.unresolvedAlerts) return deployment

                    const updatedAlerts = deployment.unresolvedAlerts.filter(alert => alert.id !== alertId)
                    return {
                        ...deployment,
                        unresolvedAlerts: updatedAlerts,
                        unresolvedAlertCount: updatedAlerts.length
                    }
                })
            )
        } catch (error) {
            console.error('Error resolving alert:', error)
            alert('Failed to resolve alert. Please try again.')
        } finally {
            setResolvingAlerts(prev => {
                const newSet = new Set(prev)
                newSet.delete(alertId)
                return newSet
            })
        }
    }

    const handleAddEnvVar = () => {
        if (newEnvKey && newEnvValue && (selectedService !== '__new__' ? selectedService : newEnvService)) {
            const service = selectedService === '__new__' ? newEnvService : selectedService
            setEnvVars(prev => [...prev, { key: newEnvKey, value: newEnvValue, service }])
            setNewEnvKey('')
            setNewEnvValue('')
            setNewEnvService('')
            setSelectedService('')
            setShowAddEnv(false)
            setHasChanges(true)
        }
    }

    const handleEnvFileUpload = async (data: { envLocation: string; envFile: File }) => {
        try {
            let formData = new FormData()
            formData.append('envLocation', data.envLocation)
            formData.append('envFile', data.envFile)
            formData.append('projectId', projectData.id)
            formData.append('accessToken', accessToken)

            const resp = await axios.post<{ vars: { service: string; envVars: Record<string, string> } }>(`${process.env.NEXT_PUBLIC_BACKEND_URL}/projects-manager/env-config`, formData, {
                headers: {
                    'Content-Type': 'multipart/form-data'
                }
            })

            if (resp.status === 200 && resp.data.vars) {
                const { service, envVars } = resp.data.vars

                const newEnvVars = Object.entries(envVars).map(([key, value]) => ({
                    key,
                    value: value as string,
                    service
                }))

                setEnvVars(prev => {
                    const filtered = prev.filter(env => env.service !== service)
                    return [...filtered, ...newEnvVars]
                })

                setShowEnvFileDialog(false)
            }
        } catch (error) {
            console.error('Error uploading env file:', error)
            alert('Failed to upload environment file')
        }
    }

    const handleUpdateEnvVar = (index: number, field: 'key' | 'value', newValue: string) => {
        setEnvVars(prev => {
            const updated = [...prev]
            updated[index] = { ...updated[index], [field]: newValue }
            return updated
        })
        setHasChanges(true)
    }

    const handleDeleteEnvVar = (index: number) => {
        setEnvVars(prev => prev.filter((_, i) => i !== index))
        setHasChanges(true)
    }

    const handleSaveAllChanges = async () => {
        setIsSaving(true)
        try {
            const groupedByService: Record<string, Record<string, string>> = {}

            serviceNames.forEach(serviceName => {
                groupedByService[serviceName] = {}
            })

            envVars.forEach(env => {
                if (!groupedByService[env.service]) {
                    groupedByService[env.service] = {}
                }
                groupedByService[env.service][env.key] = env.value
            })

            const response = await axios.put(`${process.env.NEXT_PUBLIC_BACKEND_URL}/projects-manager/update-env-config`, {
                projectId: projectData.id,
                accessToken: accessToken,
                services: Object.entries(groupedByService).map(([serviceName, vars]) => ({
                    service_name: serviceName,
                    env_vars: vars
                }))
            })

            if (response.status === 200) {
                setHasChanges(false)
            }
        } catch (error) {
            console.error('Error updating env variables:', error)
            alert('Failed to update environment variables')
        } finally {
            setIsSaving(false)
        }
    }

    const handleStartBuild = () => {
        setShowBuildConfigDialog(true)
    }

    const handleConfiguredBuild = async (config: {
        branch: string
        commit: string
        buildCommand?: string
        installCommand?: string
        rootDirectory?: string
        nodeVersion?: string
        enableCache?: boolean
    }) => {
        setShowBuildConfigDialog(false)
        
        try {
            const resp = await axios.post<{ buildId: string; commitHash: string; branch: string; status: string }>(`${process.env.NEXT_PUBLIC_BACKEND_URL}/projects-manager/trigger-build`, {
                projectId: projectData.id,
                accessToken: accessToken,
                branch: config.branch,
                commitHash: config.commit
            })

            console.log('Build triggered:', resp.data)

            if (resp.status !== 200 || !resp.data.buildId) {
                window.alert('Failed to start build. Please try again.')
                return
            }

            const newBuildId = resp.data.buildId
            setCurrentBuildId(newBuildId)
            setOpenBuildDialog(true)

            const newBuild: Build = {
                id: newBuildId,
                status: 'queued',
                branch: resp.data.branch || config.branch,
                commitHash: config.commit?.substring(0, 7) || 'pending...',
                startTime: new Date().toLocaleString(),
                duration: undefined
            }

            setBuilds(prev => [newBuild, ...prev])

            setCurrentPage(1)
        } catch (error) {
            console.error('Error starting build:', error)
            window.alert('Failed to start build. Please try again.')
        }
    }

    const handleDeleteBuild = async (buildId: string) => {
        if (!confirm('Are you sure you want to delete this build?')) {
            return
        }

        try {
            const response = await axios({
                method: 'delete',
                url: `${process.env.NEXT_PUBLIC_BACKEND_URL}/projects-manager/delete-build/${buildId}`,
                data: {
                    projectId: projectData.id,
                    accessToken: accessToken
                }
            })

            if (response.status === 200) {
                setBuilds(prev => prev.filter(build => build.id !== buildId))
            }
        } catch (error) {
            console.error('Error deleting build:', error)
            alert('Failed to delete build. Please try again.')
        }
    }

    const handleDeleteDeployment = async (deploymentId: string) => {
        setDeploymentToDelete(deploymentId)
        setShowDeleteConfirm(true)
    }

    const confirmDeleteDeployment = async () => {
        if (!deploymentToDelete) return

        const deploymentToRemove = deployments.find(d => d.id === deploymentToDelete)
        const deletedEnv = deploymentToRemove?.environment

        setIsDeletingDeployment(true)
        try {
            const response = await axios({
                method: 'delete',
                url: `${process.env.NEXT_PUBLIC_BACKEND_URL}/projects-manager/delete-deployment/${deploymentToDelete}`,
                data: {
                    projectId: projectData.id,
                    accessToken: accessToken
                }
            })

            if (response.status === 200) {
                setDeployments(prev => prev.filter(deployment => deployment.id !== deploymentToDelete))

                const remainingInEnv = deployments.filter(d => d.environment === deletedEnv && d.id !== deploymentToDelete)
                if (remainingInEnv.length === 0) {
                    if (deletedEnv === 'production') {
                        setProductionEnv(null)
                    } else if (deletedEnv === 'staging') {
                        setStagingEnv(null)
                    }
                }

                setDeleteNotification({ show: true, success: true, message: 'Deployment deleted successfully' })
                setTimeout(() => setDeleteNotification({ show: false, success: false, message: '' }), 3000)
            }
        } catch (error) {
            console.error('Error deleting deployment:', error)
            setDeleteNotification({ show: true, success: false, message: 'Failed to delete deployment. Please try again.' })
            setTimeout(() => setDeleteNotification({ show: false, success: false, message: '' }), 3000)
        } finally {
            setIsDeletingDeployment(false)
            setShowDeleteConfirm(false)
            setDeploymentToDelete(null)
        }
    }

    const handleBuildStatusChange = (buildData: any) => {
        setBuilds(prev =>
            prev.map(build => {
                if (build.id === buildData.buildId) {
                    let normalizedStatus = buildData.status
                    if (buildData.status === 'completed') normalizedStatus = 'success'

                    return {
                        ...build,
                        status: normalizedStatus as BuildStatus,
                        duration: buildData.duration || build.duration,
                        errorMessage: buildData.errorMessage || build.errorMessage
                    }
                }
                return build
            })
        )
    }

    const tabs = [
        { id: 'overview', label: 'Overview', icon: Activity },
        { id: 'deployments', label: 'Deployments', icon: Rocket },
        { id: 'deploymentHistory', label: 'History', icon: Calendar },
        { id: 'environment', label: 'Environment', icon: Lock },
        { id: 'settings', label: 'Settings', icon: Settings },
        { id: 'monitoring', label: 'Monitoring', icon: TrendingUp },
        { id: 'builds', label: 'Builds', icon: Hammer }
    ]

    const hasDeployments = productionEnv?.url || stagingEnv?.url || projectData.preview.length > 0

    return (
        <div className="min-h-screen text-white">
            <div className="border-b border-zinc-800">
                <div className="container mx-auto px-6 py-6">
                    <div className="mb-4 flex items-center gap-2 text-sm text-zinc-400">
                        <span className="cursor-pointer hover:text-white">Projects</span>
                        <span>/</span>
                        <span className="text-white">{projectData.name}</span>
                    </div>

                    <div className="flex items-start justify-between">
                        <div>
                            <h1 className="mb-2 text-3xl font-bold">{projectData.name}</h1>
                            <div className="flex items-center gap-4 text-sm text-zinc-400">
                                <span className="flex items-center gap-1.5">
                                    <GitBranch size={14} />
                                    {projectData.slug}
                                </span>
                                {projectData.isMonorepo ? (
                                    <span className="flex items-center gap-1.5">
                                        <Layers size={14} className="text-purple-500" />
                                        <span className="text-purple-400">Monorepo</span>
                                    </span>
                                ) : (
                                    <span className="flex items-center gap-1.5">
                                        <Code size={14} />
                                        {projectData.framework}
                                    </span>
                                )}
                                <span className="flex items-center gap-1.5">
                                    <Shield size={14} className="text-green-500" />
                                    {projectData.teamName}
                                </span>
                            </div>
                        </div>

                        <div className="flex items-center gap-3">
                            <button onClick={handleStartBuild} className="flex cursor-pointer items-center gap-2 rounded-lg bg-blue-500 px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-blue-600 disabled:opacity-50">
                                <Hammer size={18} />
                                Build
                            </button>

                            <button
                                disabled={isDeploying}
                                onClick={() => {
                                    setShowDeployDialog(true)
                                }}
                                className="flex cursor-pointer items-center gap-2 rounded-lg bg-orange-500 px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-orange-600 disabled:opacity-50"
                            >
                                {isDeploying ? (
                                    <>
                                        <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                                        Deploying...
                                    </>
                                ) : (
                                    <>
                                        <Rocket size={18} />
                                        Deploy to Production
                                    </>
                                )}
                            </button>
                        </div>
                    </div>
                </div>
            </div>
            {openBuildDialog && currentBuildId && (
                <DialogCanvas closeDialog={() => setOpenBuildDialog(false)}>
                    <BuildDialog
                        accessToken={accessToken}
                        projectId={projectData.id}
                        gitRepoUrl={projectData.gitRepoUrl}
                        buildId={currentBuildId}
                        onBuildStatusChange={handleBuildStatusChange}
                        onClose={() => {
                            setOpenBuildDialog(false)
                            setCurrentBuildId(null)
                        }}
                    />
                </DialogCanvas>
            )}

            {showBuildConfigDialog && (
                <DialogCanvas closeDialog={() => setShowBuildConfigDialog(false)}>
                    <BuildConfigDialog
                        accessToken={accessToken}
                        projectId={projectData.id}
                        gitRepoUrl={projectData.gitRepoUrl}
                        currentBranch={projectData.production?.branch || 'main'}
                        onBuild={handleConfiguredBuild}
                        onClose={() => setShowBuildConfigDialog(false)}
                    />
                </DialogCanvas>
            )}

            {showDeploymentLogs && currentDeploymentId && (
                <DialogCanvas closeDialog={() => setShowDeploymentLogs(false)}>
                    <DeploymentLogsViewer
                        deploymentId={currentDeploymentId}
                        projectId={projectData.id}
                        environment={deploymentEnvironment}
                        strategy={deploymentStrategy}
                        buildId={currentDeploymentBuildId || undefined}
                        containers={currentContainers}
                        mode={currentDeploymentMode}
                        isBuildAndDeploy={isBuildAndDeploy}
                        onClose={() => {
                            setShowDeploymentLogs(false)
                            setCurrentDeploymentId(null)
                            setCurrentDeploymentBuildId(null)
                            setCurrentContainers([])
                            setIsBuildAndDeploy(false)
                        }}
                    />
                </DialogCanvas>
            )}

            {showDeployDialog && (
                <DialogCanvas closeDialog={() => setShowDeployDialog(false)}>
                    <DeployDialog accessToken={accessToken} projectId={projectData.id} gitRepoUrl={projectData.gitRepoUrl} builds={liveBuilds} currentBranch={productionEnv?.branch || stagingEnv?.branch || 'main'} deploymentStrategy={productionEnv?.deploymentStrategy || 'blue_green'} onDeploy={handleDeploy} onClose={() => setShowDeployDialog(false)} />
                </DialogCanvas>
            )}

            {showDeleteConfirm && (
                <DialogCanvas closeDialog={() => { setShowDeleteConfirm(false); setDeploymentToDelete(null) }}>
                    <div className="w-full max-w-md p-6">
                        <div className="mb-4 flex items-center gap-3">
                            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-red-500/10">
                                <Trash2 className="h-6 w-6 text-red-500" />
                            </div>
                            <h3 className="text-xl font-semibold">Delete Deployment</h3>
                        </div>
                        <p className="mb-6 text-zinc-400">
                            Are you sure you want to delete this deployment? This will stop and remove all running containers. This action cannot be undone.
                        </p>
                        <div className="flex gap-3">
                            <button
                                onClick={() => { setShowDeleteConfirm(false); setDeploymentToDelete(null) }}
                                className="flex-1 rounded-lg border border-zinc-700 bg-zinc-800 px-4 py-2.5 text-sm font-medium text-white hover:bg-zinc-700"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={confirmDeleteDeployment}
                                disabled={isDeletingDeployment}
                                className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-red-500 px-4 py-2.5 text-sm font-medium text-white hover:bg-red-600 disabled:opacity-50"
                            >
                                {isDeletingDeployment ? (
                                    <>
                                        <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                                        Deleting...
                                    </>
                                ) : (
                                    <>
                                        <Trash2 size={16} />
                                        Delete Deployment
                                    </>
                                )}
                            </button>
                        </div>
                    </div>
                </DialogCanvas>
            )}

            {deleteNotification.show && (
                <div className={`fixed right-4 top-4 z-50 flex items-center gap-3 rounded-lg px-4 py-3 shadow-lg ${deleteNotification.success ? 'bg-green-500/90' : 'bg-red-500/90'}`}>
                    {deleteNotification.success ? (
                        <CheckCircle2 size={20} className="text-white" />
                    ) : (
                        <XCircle size={20} className="text-white" />
                    )}
                    <span className="text-sm font-medium text-white">{deleteNotification.message}</span>
                </div>
            )}

            <div className="border-b border-zinc-800">
                <div className="container mx-auto px-6">
                    <div className="flex gap-1">
                        {tabs.map(tab => {
                            const Icon = tab.icon
                            return (
                                <button key={tab.id} onClick={() => setActiveTab(tab.id as any)} className={`flex items-center gap-2 border-b-2 px-4 py-3 text-sm font-medium transition-colors ${activeTab === tab.id ? 'border-orange-500 text-white' : 'border-transparent text-zinc-400 hover:text-white'}`}>
                                    <Icon size={16} />
                                    {tab.label}
                                </button>
                            )
                        })}
                    </div>
                </div>
            </div>

            <div className="container mx-auto px-6 py-8">
                {activeTab === 'deployments' && (
                    <div className="space-y-6">
                        <div>
                            <h2 className="text-xl font-semibold">Deployment Environments</h2>
                            <p className="text-sm text-zinc-400">Manage and monitor your production and staging deployments</p>
                        </div>

                        {(() => {
                            const deployments = []

                            if (productionEnv?.url) {
                                deployments.push({
                                    type: 'production',
                                    icon: Globe,
                                    iconColor: 'text-green-500',
                                    iconBg: 'bg-green-500/10',
                                    statusColor: productionEnv?.status === 'active' ? 'bg-green-500/10 text-green-500' : 'bg-yellow-500/10 text-yellow-500',
                                    ...productionEnv
                                })
                            }

                            if (stagingEnv?.url) {
                                deployments.push({
                                    type: 'staging',
                                    icon: Server,
                                    iconColor: 'text-blue-500',
                                    iconBg: 'bg-blue-500/10',
                                    statusColor: stagingEnv.status === 'active' ? 'bg-blue-500/10 text-blue-500' : 'bg-zinc-500/10 text-zinc-500',
                                    ...stagingEnv
                                })
                            }

                            if (projectData.preview && projectData.preview.length > 0) {
                                projectData.preview.forEach(preview => {
                                    deployments.push({
                                        type: 'preview',
                                        icon: GitBranch,
                                        iconColor: 'text-purple-500',
                                        iconBg: 'bg-purple-500/10',
                                        statusColor: 'bg-purple-500/10 text-purple-500',
                                        url: preview.url,
                                        branch: preview.branch,
                                        lastDeployment: preview.createdAt,
                                        status: 'active',
                                        containers: [],
                                        totalContainers: 0,
                                        healthyContainers: 0,
                                        unhealthyContainers: 0,
                                        unresolvedAlerts: [],
                                        unresolvedAlertCount: 0
                                    })
                                })
                            }

                            if (deployments.length === 0) {
                                return (
                                    <div className="rounded-lg border border-zinc-800 bg-[#1b1b1b] p-12 text-center">
                                        <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-zinc-900">
                                            <Rocket className="text-zinc-600" size={32} />
                                        </div>
                                        <h3 className="mb-2 text-lg font-semibold text-zinc-300">No Active Deployments</h3>
                                        <p className="mb-6 text-sm text-zinc-500">Deploy your project to production or staging to see deployment details here</p>
                                        <button className="inline-flex items-center gap-2 rounded-lg bg-orange-500 px-6 py-3 text-sm font-medium text-white hover:bg-orange-600">
                                            <Rocket size={18} />
                                            Deploy to Production
                                        </button>
                                    </div>
                                )
                            }

                            return deployments.map((deployment, index) => {
                                const Icon = deployment.icon
                                const isProduction = deployment.type === 'production'

                                return (
                                    <div key={`${deployment.type}-${index}`} className="space-y-6">
                                        <div className="rounded-lg border border-zinc-800 bg-[#1b1b1b] p-6">
                                            <div className="mb-6 flex items-center justify-between">
                                                <div className="flex items-center gap-4">
                                                    <div className={`flex h-12 w-12 items-center justify-center rounded-lg ${deployment.iconBg}`}>
                                                        <Icon className={deployment.iconColor} size={24} />
                                                    </div>
                                                    <div>
                                                        <a href={`https://${deployment.url}`} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-lg font-semibold">
                                                            {deployment.url}
                                                            <ExternalLink size={12} />
                                                        </a>
                                                        <div className="flex items-center gap-3">
                                                            <h3 className="text-sm text-zinc-400 capitalize hover:text-white">{deployment.type}</h3>
                                                            <span className={`flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ${deployment.statusColor}`}>
                                                                <CheckCircle2 size={12} />
                                                                {deployment.status || 'Unknown'}
                                                            </span>
                                                        </div>
                                                    </div>
                                                </div>
                                                <div className="flex items-center gap-3">
                                                    <button
                                                        className="flex items-center gap-2 rounded-lg border border-zinc-700 bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800"
                                                        onClick={() => {
                                                            const matchingDeployment = liveDeployments.find(d => d.environment === deployment.type)
                                                            setCurrentDeploymentId(matchingDeployment?.id || null)
                                                            setCurrentDeploymentBuildId(matchingDeployment?.buildId || null)
                                                            setDeploymentEnvironment(deployment.type as 'production' | 'staging' | 'preview')
                                                            setDeploymentStrategy(matchingDeployment?.deploymentStrategy || 'blue_green')
                                                            setCurrentDeploymentMode('history')
                                                            setIsBuildAndDeploy(false)
                                                            const containers = (matchingDeployment as any)?.containers || deployment.containers || []
                                                            setCurrentContainers(containers as Container[])
                                                            setShowDeploymentLogs(true)
                                                        }}
                                                    >
                                                        <Eye size={16} />
                                                        View Logs
                                                    </button>
                                                    <button disabled={isDeploying} className="flex items-center gap-2 rounded-lg bg-orange-500 px-4 py-2 text-sm font-medium text-white hover:bg-orange-600 disabled:opacity-50">
                                                        <RotateCcw size={16} />
                                                        Redeploy
                                                    </button>
                                                    <button
                                                        onClick={() => {
                                                            const matchingDeployment = liveDeployments.find(d => d.environment === deployment.type)
                                                            if (matchingDeployment) {
                                                                handleDeleteDeployment(matchingDeployment.id)
                                                            }
                                                        }}
                                                        className="flex cursor-pointer items-center gap-2 rounded-lg border border-red-700 bg-red-900/20 px-4 py-2 text-sm font-medium text-red-400 transition-colors hover:bg-red-900/40"
                                                    >
                                                        <Trash2 size={16} />
                                                        Delete
                                                    </button>
                                                </div>
                                            </div>

                                            {/* Only show detailed metrics for production/staging, not preview */}
                                            {deployment.type !== 'preview' && (
                                                <>
                                                    {/* Deployment Strategy & Metrics */}
                                                    {deployment.deploymentStrategy && (
                                                        <div className="mb-6 grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
                                                            <div className="rounded-lg bg-zinc-900/50 p-4">
                                                                <div className="text-sm text-zinc-400">Strategy</div>
                                                                <div className="font-semibold text-blue-400">{deployment.deploymentStrategy || 'N/A'}</div>
                                                            </div>
                                                            <div className="rounded-lg bg-zinc-900/50 p-4">
                                                                <div className="text-sm text-zinc-400">Traffic</div>
                                                                <div className="font-semibold">{deployment.trafficPercentage || 0}%</div>
                                                            </div>
                                                            <div className="rounded-lg bg-zinc-900/50 p-4">
                                                                <div className="text-sm text-zinc-400">Requests/min</div>
                                                                <div className="font-semibold">{deployment.currentRequestsPerMinute || 0}</div>
                                                            </div>
                                                            <div className="rounded-lg bg-zinc-900/50 p-4">
                                                                <div className="text-sm text-zinc-400">Response Time</div>
                                                                <div className="font-semibold">{deployment.avgResponseTime}</div>
                                                            </div>
                                                        </div>
                                                    )}

                                                    {/* Strategy Details */}
                                                    {deployment.strategyDetails && (
                                                        <div className="mb-6 rounded-lg border border-zinc-700 bg-zinc-900/30 p-4">
                                                            <h4 className="mb-3 font-semibold">Deployment Strategy Details</h4>
                                                            <div className="grid grid-cols-2 gap-4 text-sm md:grid-cols-4">
                                                                <div>
                                                                    <div className="text-zinc-400">Phase</div>
                                                                    <div className="font-medium capitalize">{deployment.strategyDetails.currentPhase}</div>
                                                                </div>
                                                                <div>
                                                                    <div className="text-zinc-400">Active Group</div>
                                                                    <div className="font-medium">{deployment.strategyDetails.activeGroup || 'None'}</div>
                                                                </div>
                                                                <div>
                                                                    <div className="text-zinc-400">Total Replicas</div>
                                                                    <div className="font-medium">{deployment.strategyDetails.totalReplicas}</div>
                                                                </div>
                                                                <div>
                                                                    <div className="text-zinc-400">Healthy Replicas</div>
                                                                    <div className="font-medium text-green-500">{deployment.strategyDetails.healthyReplicas}</div>
                                                                </div>
                                                            </div>
                                                        </div>
                                                    )}

                                                    {/* Containers */}
                                                    {deployment.containers && deployment.containers.length > 0 && (
                                                        <div className="mb-6">
                                                            <h4 className="mb-3 font-semibold">Containers ({deployment.totalContainers})</h4>
                                                            <div className="space-y-3">
                                                                {deployment.containers.map(container => (
                                                                    <div key={container.id} className="rounded-lg border border-zinc-700 bg-zinc-900/50 p-4">
                                                                        <div className="flex items-center justify-between">
                                                                            <div className="flex items-center gap-3">
                                                                                <div className={`h-3 w-3 rounded-full ${container.healthStatus === 'healthy' ? 'bg-green-500' : container.healthStatus === 'unhealthy' ? 'bg-red-500' : 'bg-yellow-500'}`}></div>
                                                                                <div>
                                                                                    <div className="font-medium">{container.name}</div>
                                                                                    <div className="text-xs text-zinc-400">ID: {container.id.slice(0, 8)}...</div>
                                                                                </div>
                                                                            </div>
                                                                            <div className="flex items-center gap-4 text-sm">
                                                                                <span className={`rounded-full px-2 py-1 text-xs ${container.isActive ? 'bg-green-500/10 text-green-500' : 'bg-zinc-500/10 text-zinc-500'}`}>{container.status}</span>
                                                                                <span className="text-zinc-400">{container.deploymentGroup}</span>
                                                                            </div>
                                                                        </div>
                                                                        <div className="mt-3 grid grid-cols-2 gap-4 text-sm md:grid-cols-4">
                                                                            <div>
                                                                                <div className="text-zinc-400">CPU Usage</div>
                                                                                <div className="font-medium">{container.cpuUsage ? `${container.cpuUsage}%` : 'N/A'}</div>
                                                                            </div>
                                                                            <div>
                                                                                <div className="text-zinc-400">Memory</div>
                                                                                <div className="font-medium">{container.memoryUsage ? `${container.memoryUsage}MB` : 'N/A'}</div>
                                                                            </div>
                                                                            <div>
                                                                                <div className="text-zinc-400">Started</div>
                                                                                <div className="font-medium">{new Date(container.startedAt).toLocaleString()}</div>
                                                                            </div>
                                                                            <div>
                                                                                <div className="text-zinc-400">Health</div>
                                                                                <div className={`font-medium capitalize ${container.healthStatus === 'healthy' ? 'text-green-500' : container.healthStatus === 'unhealthy' ? 'text-red-500' : 'text-yellow-500'}`}>{container.healthStatus}</div>
                                                                            </div>
                                                                        </div>
                                                                    </div>
                                                                ))}
                                                            </div>
                                                        </div>
                                                    )}

                                                    {/* Show active alerts for this deployment - using centralized alerts state */}
                                                    {alerts.length > 0 && (
                                                        <div className="mb-6">
                                                            <h4 className="mb-3 font-semibold text-red-400">Active Alerts ({alerts.length})</h4>

                                                            <div className="space-y-2">
                                                                {alerts.slice(0, 3).map(alert => (
                                                                    <AlertCard key={alert.id} alert={alert} handleResolve={handleResolveAlert} isResolving={resolvingAlerts.has(alert.id)} />
                                                                ))}
                                                            </div>
                                                        </div>
                                                    )}
                                                </>
                                            )}

                                            {/* Deployment Info */}
                                            <div className="grid grid-cols-2 gap-4 text-sm md:grid-cols-4">
                                                <div>
                                                    <div className="text-zinc-400">Last Deployment</div>
                                                    <div className="font-medium">{deployment.lastDeployment}</div>
                                                </div>
                                                <div>
                                                    <div className="text-zinc-400">Branch</div>
                                                    <div className="font-medium">{deployment.branch || 'N/A'}</div>
                                                </div>
                                                {deployment.buildTime && (
                                                    <div>
                                                        <div className="text-zinc-400">Build Time</div>
                                                        <div className="font-medium">{deployment.buildTime}</div>
                                                    </div>
                                                )}
                                                {deployment.framework && (
                                                    <div>
                                                        <div className="text-zinc-400">Framework</div>
                                                        <div className="font-medium">{deployment.framework}</div>
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                )
                            })
                        })()}
                    </div>
                )}

                {activeTab === 'deploymentHistory' && (
                    <div className="space-y-6">
                        <div className="flex items-center justify-between">
                            <div>
                                <h2 className="text-xl font-semibold">Deployment History</h2>
                                <p className="text-sm text-zinc-400">Showing {liveDeployments.length} recent deployments</p>
                            </div>
                        </div>

                        {liveDeployments.length === 0 ? (
                            <div className="rounded-lg border border-zinc-800 bg-[#1b1b1b] p-12 text-center">
                                <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-zinc-900">
                                    <Rocket className="text-zinc-600" size={32} />
                                </div>
                                <h3 className="mb-2 text-lg font-semibold text-zinc-300">No Deployments Yet</h3>
                                <p className="mb-6 text-sm text-zinc-500">Your deployment history will appear here</p>
                            </div>
                        ) : (
                            <div className="overflow-hidden rounded-lg border border-zinc-800 bg-[#1b1b1b]">
                                <table className="w-full">
                                    <thead className="border-b border-zinc-800 bg-zinc-900/50">
                                        <tr>
                                            <th className="px-6 py-4 text-left text-xs font-medium tracking-wider text-zinc-400 uppercase">Status</th>
                                            <th className="px-6 py-4 text-left text-xs font-medium tracking-wider text-zinc-400 uppercase">Environment</th>
                                            <th className="px-6 py-4 text-left text-xs font-medium tracking-wider text-zinc-400 uppercase">Branch</th>
                                            <th className="px-6 py-4 text-left text-xs font-medium tracking-wider text-zinc-400 uppercase">Commit</th>
                                            <th className="px-6 py-4 text-left text-xs font-medium tracking-wider text-zinc-400 uppercase">Strategy</th>
                                            <th className="px-6 py-4 text-left text-xs font-medium tracking-wider text-zinc-400 uppercase">Deployed</th>
                                            <th className="px-6 py-4 text-left text-xs font-medium tracking-wider text-zinc-400 uppercase">Duration</th>
                                            <th className="px-6 py-4 text-left text-xs font-medium tracking-wider text-zinc-400 uppercase">Traffic</th>
                                            <th className="px-6 py-4 text-left text-xs font-medium tracking-wider text-zinc-400 uppercase">Actions</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-zinc-800">
                                        {liveDeployments.map(deployment => {
                                            const getStatusDisplay = () => {
                                                // Check if deployment has a build in progress
                                                if (deployment.buildId && deployment.buildStatus && ['queued', 'cloning', 'installing', 'building'].includes(deployment.buildStatus)) {
                                                    return { icon: Loader2, text: 'Building', color: 'text-blue-500', bgColor: 'bg-blue-500/10', spin: true }
                                                }
                                                switch (deployment.status) {
                                                    case 'pending':
                                                        return { icon: Clock, text: 'Pending', color: 'text-blue-500', bgColor: 'bg-blue-500/10' }
                                                    case 'deploying':
                                                        return { icon: Loader2, text: 'Deploying', color: 'text-orange-500', bgColor: 'bg-orange-500/10', spin: true }
                                                    case 'active':
                                                        return { icon: CheckCircle2, text: 'Active', color: 'text-green-500', bgColor: 'bg-green-500/10' }
                                                    case 'failed':
                                                        return { icon: XCircle, text: 'Failed', color: 'text-red-500', bgColor: 'bg-red-500/10' }
                                                    case 'rolled_back':
                                                        return { icon: RotateCcw, text: 'Rolled Back', color: 'text-yellow-500', bgColor: 'bg-yellow-500/10' }
                                                    case 'terminated':
                                                        return { icon: XCircle, text: 'Terminated', color: 'text-zinc-500', bgColor: 'bg-zinc-500/10' }
                                                    default:
                                                        return { icon: Clock, text: 'Unknown', color: 'text-zinc-500', bgColor: 'bg-zinc-500/10' }
                                                }
                                            }

                                            const statusDisplay = getStatusDisplay()
                                            const StatusIcon = statusDisplay.icon

                                            const getEnvironmentColor = () => {
                                                switch (deployment.environment) {
                                                    case 'production':
                                                        return 'bg-green-500/10 text-green-500'
                                                    case 'staging':
                                                        return 'bg-blue-500/10 text-blue-500'
                                                    case 'preview':
                                                        return 'bg-purple-500/10 text-purple-500'
                                                    default:
                                                        return 'bg-zinc-500/10 text-zinc-500'
                                                }
                                            }

                                            return (
                                                <tr key={deployment.id} className="transition-colors hover:bg-zinc-900/50">
                                                    <td className="px-6 py-4">
                                                        <div className="flex items-center gap-2">
                                                            <div className={`flex h-8 w-8 items-center justify-center rounded-lg ${statusDisplay.bgColor}`}>
                                                                <StatusIcon className={`${statusDisplay.color} ${statusDisplay.spin ? 'animate-spin' : ''}`} size={16} />
                                                            </div>
                                                            <span className={`text-sm font-medium ${statusDisplay.color}`}>{statusDisplay.text}</span>
                                                        </div>
                                                    </td>
                                                    <td className="px-6 py-4">
                                                        <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium capitalize ${getEnvironmentColor()}`}>{deployment.environment}</span>
                                                    </td>
                                                    <td className="px-6 py-4">
                                                        <div className="flex items-center gap-1.5 text-sm text-zinc-300">
                                                            <GitBranch size={14} className="text-zinc-500" />
                                                            {deployment.branch}
                                                        </div>
                                                    </td>
                                                    <td className="px-6 py-4">
                                                        <div className="font-mono text-xs text-zinc-400">{deployment.commitHash.substring(0, 7)}</div>
                                                    </td>
                                                    <td className="px-6 py-4">
                                                        <div className="text-sm text-zinc-400 capitalize">{deployment.deploymentStrategy.replace('_', ' ')}</div>
                                                        {deployment.strategyPhase && <div className="text-xs text-zinc-600">{deployment.strategyPhase}</div>}
                                                    </td>
                                                    <td className="px-6 py-4">
                                                        <div className="text-sm text-zinc-400">{deployment.startedAt}</div>
                                                        {deployment.deployedBy && <div className="text-xs text-zinc-600">{deployment.deployedBy}</div>}
                                                    </td>
                                                    <td className="px-6 py-4">
                                                        <div className="text-sm text-zinc-400">{deployment.duration || '-'}</div>
                                                        {deployment.buildTime && <div className="text-xs text-zinc-600">Build: {deployment.buildTime}</div>}
                                                    </td>
                                                    <td className="px-6 py-4">
                                                        <div className="text-sm text-zinc-400">{deployment.trafficPercentage}%</div>
                                                        {deployment.trafficSwitchCount > 0 && (
                                                            <div className="flex items-center gap-1 text-xs text-blue-400">
                                                                <TrendingUp size={12} />
                                                                {deployment.trafficSwitchCount} switch{deployment.trafficSwitchCount > 1 ? 'es' : ''}
                                                            </div>
                                                        )}
                                                    </td>
                                                    <td className="px-6 py-4">
                                                        <div className="flex items-center gap-2">
                                                            {deployment.buildId && deployment.buildStatus && ['queued', 'cloning', 'installing', 'building'].includes(deployment.buildStatus) && (
                                                                <span className="flex items-center gap-1 text-xs text-blue-400">
                                                                    <Loader2 size={12} className="animate-spin" />
                                                                    Building
                                                                </span>
                                                            )}
                                                            <button
                                                                className="flex items-center gap-2 rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-zinc-800"
                                                                onClick={() => {
                                                                    setCurrentDeploymentId(deployment.id)
                                                                    setCurrentDeploymentBuildId(deployment.buildId || null)
                                                                    setDeploymentEnvironment(deployment.environment)
                                                                    setDeploymentStrategy(deployment.deploymentStrategy)
                                                                    setCurrentDeploymentMode('history')
                                                                    setIsBuildAndDeploy(false)
                                                                    const containers = (deployment as any).containers || []
                                                                    setCurrentContainers(containers as Container[])
                                                                    setShowDeploymentLogs(true)
                                                                }}
                                                            >
                                                                <Eye size={16} />
                                                            </button>
                                                            <button
                                                                onClick={() => handleDeleteDeployment(deployment.id)}
                                                                className="flex cursor-pointer items-center gap-2 rounded-lg border border-red-700 bg-red-900/20 px-3 py-2 text-sm font-medium text-red-400 transition-colors hover:bg-red-900/40"
                                                            >
                                                                <Trash2 size={16} />
                                                            </button>
                                                        </div>
                                                    </td>
                                                </tr>
                                            )
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </div>
                )}

                {activeTab === 'overview' && (
                    <div className="space-y-6">
                        {projectData.isMonorepo && projectData.frameworks && projectData.frameworks.length > 0 && (
                            <div className="space-y-4">
                                <div className="flex items-center gap-2">
                                    <Layers className="text-purple-500" size={20} />
                                    <h2 className="text-xl font-semibold">Monorepo Applications</h2>
                                </div>
                                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                                    {projectData.frameworks.map((framework, idx) => (
                                        <div key={idx} className="rounded-lg border border-zinc-800 bg-[#1b1b1b] p-5">
                                            <div className="mb-4 flex items-start justify-between">
                                                <div className="flex items-center gap-3">
                                                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-purple-500/10">
                                                        <Package className="text-purple-500" size={20} />
                                                    </div>
                                                    <div>
                                                        <div className="font-semibold">{framework.Name}</div>
                                                        <div className="text-sm text-zinc-400">{framework.Path}</div>
                                                    </div>
                                                </div>
                                                <span className="rounded-full bg-purple-500/10 px-2 py-1 text-xs text-purple-400">Port {framework.Port}</span>
                                            </div>

                                            <div className="grid grid-cols-2 gap-3 text-sm">
                                                <div>
                                                    <div className="text-zinc-400">Runtime</div>
                                                    <div className="font-medium">{framework.Runtime}</div>
                                                </div>
                                                {framework.Version && (
                                                    <div>
                                                        <div className="text-zinc-400">Version</div>
                                                        <div className="font-medium">{framework.Version}</div>
                                                    </div>
                                                )}
                                                <div className="col-span-2">
                                                    <div className="text-zinc-400">Build Command</div>
                                                    <div className="font-mono text-xs font-medium text-orange-400">{framework.BuildCmd}</div>
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
                            <div className="rounded-lg border border-zinc-800 bg-[#1b1b1b] p-4">
                                <div className="mb-1 flex items-center gap-2 text-sm text-zinc-400">
                                    <Activity size={16} />
                                    Uptime
                                </div>
                                <div className="text-2xl font-bold text-green-500">{projectData.metrics.uptime}</div>
                            </div>

                            <div className="rounded-lg border border-zinc-800 bg-[#1b1b1b] p-4">
                                <div className="mb-1 flex items-center gap-2 text-sm text-zinc-400">
                                    <Zap size={16} />
                                    Response Time
                                </div>
                                <div className="text-2xl font-bold">{projectData.metrics.avgResponseTime}</div>
                            </div>

                            <div className="rounded-lg border border-zinc-800 bg-[#1b1b1b] p-4">
                                <div className="mb-1 flex items-center gap-2 text-sm text-zinc-400">
                                    <TrendingUp size={16} />
                                    Requests (24h)
                                </div>
                                <div className="text-2xl font-bold">{projectData.metrics.requests24h}</div>
                            </div>

                            <div className="rounded-lg border border-zinc-800 bg-[#1b1b1b] p-4">
                                <div className="mb-1 flex items-center gap-2 text-sm text-zinc-400">
                                    <AlertCircle size={16} />
                                    Errors (24h)
                                </div>
                                <div className="text-2xl font-bold text-yellow-500">{projectData.metrics.errors24h}</div>
                            </div>
                        </div>

                        <div className="space-y-4">
                            <h2 className="text-xl font-semibold">Environments</h2>

                            {!hasDeployments ? (
                                <div className="rounded-lg border border-zinc-800 bg-[#1b1b1b] p-12 text-center">
                                    <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-zinc-900">
                                        <Rocket className="text-zinc-600" size={32} />
                                    </div>
                                    <h3 className="mb-2 text-lg font-semibold text-zinc-300">No Deployments Yet</h3>
                                    <p className="mb-6 text-sm text-zinc-500">Get started by deploying your project to production or staging</p>
                                    <button className="inline-flex items-center gap-2 rounded-lg bg-orange-500 px-6 py-3 text-sm font-medium text-white hover:bg-orange-600">
                                        <Rocket size={18} />
                                        Deploy Now
                                    </button>
                                </div>
                            ) : (
                                <>
                                    {productionEnv?.url && (
                                        <div className="rounded-lg border border-zinc-800 bg-[#1b1b1b] p-5">
                                            <div className="mb-4 flex items-center justify-between">
                                                <div className="flex items-center gap-3">
                                                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-green-500/10">
                                                        <Globe className="text-green-500" size={20} />
                                                    </div>
                                                    <div>
                                                        <div className="flex items-center gap-2">
                                                            <span className="font-semibold">Production</span>
                                                            <span className="flex items-center gap-1 rounded-full bg-green-500/10 px-2 py-0.5 text-xs text-green-500">
                                                                <CheckCircle2 size={12} />
                                                                Live
                                                            </span>
                                                        </div>
                                                        <a href={productionEnv.url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-sm text-zinc-400 hover:text-white">
                                                            {productionEnv.url}
                                                            <ExternalLink size={12} />
                                                        </a>
                                                    </div>
                                                </div>

                                                <div className="flex items-center gap-2">
                                                    <button
                                                        className="rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-1.5 text-sm text-white hover:bg-zinc-800"
                                                        onClick={() => {
                                                            const matchingDeployment = liveDeployments.find(d => d.environment === 'production')
                                                            setCurrentDeploymentId(matchingDeployment?.id || null)
                                                            setCurrentDeploymentBuildId(matchingDeployment?.buildId || null)
                                                            setDeploymentEnvironment('production')
                                                            setDeploymentStrategy(matchingDeployment?.deploymentStrategy || 'blue_green')
                                                            setCurrentDeploymentMode('history')
                                                            setIsBuildAndDeploy(false)
                                                            const containers = (matchingDeployment as any)?.containers || []
                                                            setCurrentContainers(containers as Container[])
                                                            setShowDeploymentLogs(true)
                                                        }}
                                                    >
                                                        <Eye size={16} />
                                                    </button>
                                                    <button className="rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-1.5 text-sm text-white hover:bg-zinc-800">
                                                        <RotateCcw size={16} />
                                                    </button>
                                                </div>
                                            </div>

                                            <div className="grid grid-cols-2 gap-4 text-sm md:grid-cols-4">
                                                <div>
                                                    <div className="text-zinc-400">Last Deploy</div>
                                                    <div className="font-medium">{productionEnv.lastDeployment}</div>
                                                </div>
                                                <div>
                                                    <div className="text-zinc-400">Branch</div>
                                                    <div className="font-medium">{productionEnv.branch || 'N/A'}</div>
                                                </div>
                                                <div>
                                                    <div className="text-zinc-400">Build Time</div>
                                                    <div className="font-medium">{productionEnv.buildTime || 'N/A'}</div>
                                                </div>
                                                <div>
                                                    <div className="text-zinc-400">Commit</div>
                                                    <div className="truncate font-medium">{productionEnv.commitHash || 'N/A'}</div>
                                                </div>
                                            </div>
                                        </div>
                                    )}

                                    {stagingEnv?.url && (
                                        <div className="rounded-lg border border-zinc-800 bg-[#1b1b1b] p-5">
                                            <div className="mb-4 flex items-center justify-between">
                                                <div className="flex items-center gap-3">
                                                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-500/10">
                                                        <Server className="text-blue-500" size={20} />
                                                    </div>
                                                    <div>
                                                        <div className="flex items-center gap-2">
                                                            <span className="font-semibold">Staging</span>
                                                            <span className="flex items-center gap-1 rounded-full bg-blue-500/10 px-2 py-0.5 text-xs text-blue-500">
                                                                <CheckCircle2 size={12} />
                                                                Ready
                                                            </span>
                                                        </div>
                                                        <a href={stagingEnv.url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-sm text-zinc-400 hover:text-white">
                                                            {stagingEnv.url}
                                                            <ExternalLink size={12} />
                                                        </a>
                                                    </div>
                                                </div>

                                                <button className="flex items-center gap-2 rounded-lg bg-orange-500 px-4 py-2 text-sm font-medium text-white hover:bg-orange-600">
                                                    <Rocket size={16} />
                                                    Deploy
                                                </button>
                                            </div>

                                            <div className="grid grid-cols-2 gap-4 text-sm md:grid-cols-4">
                                                <div>
                                                    <div className="text-zinc-400">Last Deploy</div>
                                                    <div className="font-medium">{stagingEnv.lastDeployment}</div>
                                                </div>
                                                <div>
                                                    <div className="text-zinc-400">Branch</div>
                                                    <div className="font-medium">{stagingEnv.branch || 'N/A'}</div>
                                                </div>
                                                <div>
                                                    <div className="text-zinc-400">Build Time</div>
                                                    <div className="font-medium">{stagingEnv.buildTime || 'N/A'}</div>
                                                </div>
                                                <div>
                                                    <div className="text-zinc-400">Commit</div>
                                                    <div className="truncate font-medium">{stagingEnv.commitHash || 'N/A'}</div>
                                                </div>
                                            </div>
                                        </div>
                                    )}

                                    {projectData.preview.length > 0 && (
                                        <div>
                                            <h3 className="mb-3 text-lg font-semibold">Preview Deployments</h3>
                                            {projectData.preview.map((preview, idx) => (
                                                <div key={idx} className="rounded-lg border border-zinc-800 bg-[#1b1b1b] p-4">
                                                    <div className="flex items-center justify-between">
                                                        <div className="flex items-center gap-3">
                                                            <GitBranch className="text-purple-500" size={18} />
                                                            <div>
                                                                <div className="font-medium">{preview.branch}</div>
                                                                <a href={preview.url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-sm text-zinc-400 hover:text-white">
                                                                    {preview.url}
                                                                    <ExternalLink size={12} />
                                                                </a>
                                                            </div>
                                                        </div>
                                                        <div className="text-sm text-zinc-400">{preview.createdAt}</div>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </>
                            )}
                        </div>
                    </div>
                )}

                {activeTab === 'environment' && (
                    <div className="space-y-6">
                        <div className="flex items-center justify-between">
                            <div>
                                <h2 className="text-xl font-semibold">Environment Variables</h2>
                                <p className="text-sm text-zinc-400">Manage environment variables for your deployments</p>
                            </div>
                            <div className="flex items-center gap-3">
                                <button onClick={() => setShowEnvFileDialog(true)} className="flex items-center gap-2 rounded-lg border border-zinc-700 bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800">
                                    <Upload size={16} />
                                    Upload .env File
                                </button>
                                <button onClick={() => setShowAddEnv(true)} className="flex items-center gap-2 rounded-lg bg-orange-500 px-4 py-2 text-sm font-medium text-white hover:bg-orange-600">
                                    <Plus size={16} />
                                    Add Variable
                                </button>
                                {hasChanges && (
                                    <button onClick={handleSaveAllChanges} disabled={isSaving} className="flex items-center gap-2 rounded-lg bg-blue-500 px-4 py-2 text-sm font-medium text-white hover:bg-blue-600 disabled:opacity-50">
                                        {isSaving ? (
                                            <>
                                                <div className="h-4 w-4 animate-spin cursor-pointer rounded-full border-2 border-white border-t-transparent" />
                                                Saving...
                                            </>
                                        ) : (
                                            <>
                                                <Save size={16} />
                                                Update Variables
                                            </>
                                        )}
                                    </button>
                                )}
                            </div>
                        </div>

                        {showEnvFileDialog && (
                            <DialogCanvas closeDialog={() => setShowEnvFileDialog(false)}>
                                <EnvFileUpload onClose={() => setShowEnvFileDialog(false)} onUpload={handleEnvFileUpload} />
                            </DialogCanvas>
                        )}
                        {showAddEnv && (
                            <div className="rounded-lg border border-zinc-800 bg-[#1b1b1b] p-5">
                                <h3 className="mb-4 font-semibold">New Environment Variable</h3>
                                <div className="space-y-3">
                                    <div>
                                        <label className="mb-1 block text-sm text-zinc-400">Service/Location</label>
                                        <select value={selectedService} onChange={e => setSelectedService(e.target.value)} className="w-full rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm text-white focus:border-zinc-700 focus:outline-none">
                                            <option value="">Select service...</option>
                                            {serviceNames.map(name => (
                                                <option key={name} value={name}>
                                                    {name}
                                                </option>
                                            ))}
                                            <option value="__new__">+ Add new service</option>
                                        </select>
                                    </div>

                                    {selectedService === '__new__' && (
                                        <div>
                                            <label className="mb-1 block text-sm text-zinc-400">New Service Name</label>
                                            <input type="text" value={newEnvService} onChange={e => setNewEnvService(e.target.value)} placeholder="backend, frontend, etc." className="w-full rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm text-white focus:border-zinc-700 focus:outline-none" />
                                        </div>
                                    )}

                                    <div>
                                        <label className="mb-1 block text-sm text-zinc-400">Key</label>
                                        <input type="text" value={newEnvKey} onChange={e => setNewEnvKey(e.target.value)} placeholder="DATABASE_URL" className="w-full rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm text-white focus:border-zinc-700 focus:outline-none" />
                                    </div>
                                    <div>
                                        <label className="mb-1 block text-sm text-zinc-400">Value</label>
                                        <input type="password" value={newEnvValue} onChange={e => setNewEnvValue(e.target.value)} placeholder="postgresql://..." className="w-full rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm text-white focus:border-zinc-700 focus:outline-none" />
                                    </div>
                                    <div className="flex gap-2">
                                        <button onClick={handleAddEnvVar} className="rounded-lg bg-orange-500 px-4 py-2 text-sm font-medium text-white hover:bg-orange-600">
                                            Add Variable
                                        </button>
                                        <button
                                            onClick={() => {
                                                setShowAddEnv(false)
                                                setSelectedService('')
                                                setNewEnvService('')
                                            }}
                                            className="rounded-lg border border-zinc-700 px-4 py-2 text-sm text-white hover:bg-zinc-900"
                                        >
                                            Cancel
                                        </button>
                                    </div>
                                </div>
                            </div>
                        )}

                        <div className="space-y-2">
                            {envVars.map((env, idx) => (
                                <EnvVarsCard EnvVar={env} key={idx} id={idx} onUpdate={(field, value) => handleUpdateEnvVar(idx, field, value)} onDelete={() => handleDeleteEnvVar(idx)} />
                            ))}
                        </div>
                    </div>
                )}

                {activeTab === 'monitoring' && <MonitoringDashboard projectData={projectData} alerts={alerts} onResolveAlert={handleResolveAlert} resolvingAlerts={resolvingAlerts} accessToken={accessToken} projectId={projectData.id} />}

                {activeTab === 'settings' && <DeploymentSettings projectId={projectData.id} accessToken={accessToken} settings={projectData.settings} />}
                {showBuildLogs && selectedBuild && (
                    <DialogCanvas closeDialog={() => setShowBuildLogs(false)}>
                        <BuildLogsViewer build={selectedBuild} onClose={() => setShowBuildLogs(false)} />
                    </DialogCanvas>
                )}

                {activeTab === 'builds' && (
                    <div className="space-y-6">
                        <div className="flex items-center justify-between">
                            <div>
                                <h2 className="text-xl font-semibold">Build History</h2>
                                <p className="text-sm text-zinc-400">
                                    Showing {indexOfFirstBuild + 1}-{Math.min(indexOfLastBuild, liveBuilds.length)} of {liveBuilds.length} builds
                                </p>
                            </div>
                            <button onClick={handleStartBuild} className="flex cursor-pointer items-center gap-2 rounded-lg bg-blue-500 px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-blue-600 disabled:opacity-50">
                                <Hammer size={18} />
                                Build
                            </button>
                        </div>

                        {liveBuilds.length === 0 ? (
                            <div className="rounded-lg border border-zinc-800 bg-[#1b1b1b] p-12 text-center">
                                <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-zinc-900">
                                    <Hammer className="text-zinc-600" size={32} />
                                </div>
                                <h3 className="mb-2 text-lg font-semibold text-zinc-300">No Builds Yet</h3>
                                <p className="mb-6 text-sm text-zinc-500">Start your first build to see it here</p>
                                <button onClick={handleStartBuild} className="flex cursor-pointer items-center gap-2 rounded-lg bg-blue-500 px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-blue-600 disabled:opacity-50">
                                    <Hammer size={18} />
                                    Build
                                </button>
                            </div>
                        ) : (
                            <>
                                <div className="overflow-hidden rounded-lg border border-zinc-800 bg-[#1b1b1b]">
                                    <table className="w-full">
                                        <thead className="border-b border-zinc-800 bg-zinc-900/50">
                                            <tr>
                                                <th className="px-6 py-4 text-left text-xs font-medium tracking-wider text-zinc-400 uppercase">Status</th>
                                                <th className="px-6 py-4 text-left text-xs font-medium tracking-wider text-zinc-400 uppercase">Build ID</th>
                                                <th className="px-6 py-4 text-left text-xs font-medium tracking-wider text-zinc-400 uppercase">Branch</th>
                                                <th className="px-6 py-4 text-left text-xs font-medium tracking-wider text-zinc-400 uppercase">Commit</th>
                                                <th className="px-6 py-4 text-left text-xs font-medium tracking-wider text-zinc-400 uppercase">Started</th>
                                                <th className="px-6 py-4 text-left text-xs font-medium tracking-wider text-zinc-400 uppercase">Duration</th>
                                                <th className="px-6 py-4 text-left text-xs font-medium tracking-wider text-zinc-400 uppercase">Actions</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-zinc-800">
                                            {currentBuilds.map(build => {
                                                const getStatusDisplay = () => {
                                                    switch (build.status) {
                                                        case 'queued':
                                                            return { icon: Clock, text: 'Queued', color: 'text-blue-500', bgColor: 'bg-blue-500/10' }
                                                        case 'cloning':
                                                            return { icon: Loader2, text: 'Cloning', color: 'text-blue-500', bgColor: 'bg-blue-500/10', spin: true }
                                                        case 'installing':
                                                            return { icon: Loader2, text: 'Installing', color: 'text-blue-500', bgColor: 'bg-blue-500/10', spin: true }
                                                        case 'building':
                                                            return { icon: Loader2, text: 'Building', color: 'text-blue-500', bgColor: 'bg-blue-500/10', spin: true }
                                                        case 'deploying':
                                                            return { icon: Loader2, text: 'Deploying', color: 'text-orange-500', bgColor: 'bg-orange-500/10', spin: true }
                                                        case 'success':
                                                            return { icon: CheckCircle2, text: 'Success', color: 'text-green-500', bgColor: 'bg-green-500/10' }
                                                        case 'failed':
                                                            return { icon: XCircle, text: 'Failed', color: 'text-red-500', bgColor: 'bg-red-500/10' }
                                                        case 'cancelled':
                                                            return { icon: XCircle, text: 'Cancelled', color: 'text-yellow-500', bgColor: 'bg-yellow-500/10' }
                                                        default:
                                                            return { icon: Clock, text: 'Unknown', color: 'text-zinc-500', bgColor: 'bg-zinc-500/10' }
                                                    }
                                                }

                                                const statusDisplay = getStatusDisplay()
                                                const StatusIcon = statusDisplay.icon
                                                const isBuilding = ['queued', 'cloning', 'installing', 'building', 'deploying'].includes(build.status)

                                                return (
                                                    <tr key={build.id} className="transition-colors hover:bg-zinc-900/50">
                                                        <td className="px-6 py-4">
                                                            <div className="flex items-center gap-2">
                                                                <div className={`flex h-8 w-8 items-center justify-center rounded-lg ${statusDisplay.bgColor}`}>
                                                                    <StatusIcon className={`${statusDisplay.color} ${statusDisplay.spin ? 'animate-spin' : ''}`} size={16} />
                                                                </div>
                                                                <span className={`text-sm font-medium ${statusDisplay.color}`}>{statusDisplay.text}</span>
                                                            </div>
                                                        </td>
                                                        <td className="px-6 py-4">
                                                            <div className="font-mono text-sm text-white">#{build.id.substring(0, 8)}</div>
                                                        </td>
                                                        <td className="px-6 py-4">
                                                            <div className="flex items-center gap-1.5 text-sm text-zinc-300">
                                                                <GitBranch size={14} className="text-zinc-500" />
                                                                {build.branch}
                                                            </div>
                                                        </td>
                                                        <td className="px-6 py-4">
                                                            <div className="font-mono text-xs text-zinc-400">{build.commitHash.substring(0, 7)}</div>
                                                        </td>
                                                        <td className="px-6 py-4">
                                                            <div className="text-sm text-zinc-400">{build.startTime}</div>
                                                        </td>
                                                        <td className="px-6 py-4">
                                                            <div className="text-sm text-zinc-400">
                                                                {build.duration ||
                                                                    (isBuilding ? (
                                                                        <span className="flex items-center gap-1 text-orange-400">
                                                                            <div className="h-1.5 w-1.5 animate-pulse rounded-full bg-orange-400" />
                                                                            In progress
                                                                        </span>
                                                                    ) : (
                                                                        '-'
                                                                    ))}
                                                            </div>
                                                        </td>
                                                        <td className="px-6 py-4">
                                                            <div className="flex items-center gap-2">
                                                                <button
                                                                    onClick={() => {
                                                                        setSelectedBuild(build)
                                                                        setShowBuildLogs(true)
                                                                    }}
                                                                    className="flex items-center gap-2 rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-zinc-800"
                                                                >
                                                                    <Eye size={14} />
                                                                    View Logs
                                                                </button>
                                                                <button onClick={() => handleDeleteBuild(build.id)} className="flex cursor-pointer items-center gap-2 rounded-lg border border-red-700 bg-red-900/20 px-3 py-1.5 text-sm font-medium text-red-400 transition-colors hover:bg-red-900/40">
                                                                    <Trash2 size={14} />
                                                                </button>
                                                            </div>
                                                        </td>
                                                    </tr>
                                                )
                                            })}
                                        </tbody>
                                    </table>
                                </div>

                                {/* Pagination */}
                                {totalPages > 1 && (
                                    <div className="flex items-center justify-between border-t border-zinc-800 pt-4">
                                        <div className="text-sm text-zinc-400">
                                            Page {currentPage} of {totalPages}
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <button onClick={() => handlePageChange(currentPage - 1)} disabled={currentPage === 1} className="rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-50">
                                                Previous
                                            </button>

                                            <div className="flex items-center gap-1">
                                                {Array.from({ length: totalPages }, (_, i) => i + 1).map(page => {
                                                    if (page === 1 || page === totalPages || (page >= currentPage - 1 && page <= currentPage + 1)) {
                                                        return (
                                                            <button key={page} onClick={() => handlePageChange(page)} className={`h-10 w-10 rounded-lg text-sm font-medium transition-colors ${currentPage === page ? 'bg-orange-500 text-white' : 'border border-zinc-700 bg-zinc-900 text-white hover:bg-zinc-800'}`}>
                                                                {page}
                                                            </button>
                                                        )
                                                    } else if (page === currentPage - 2 || page === currentPage + 2) {
                                                        return (
                                                            <span key={page} className="text-zinc-500">
                                                                ...
                                                            </span>
                                                        )
                                                    }
                                                    return null
                                                })}
                                            </div>

                                            <button onClick={() => handlePageChange(currentPage + 1)} disabled={currentPage === totalPages} className="rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-50">
                                                Next
                                            </button>
                                        </div>
                                    </div>
                                )}
                            </>
                        )}
                    </div>
                )}
            </div>
        </div>
    )
}

export default ProjectDetails
