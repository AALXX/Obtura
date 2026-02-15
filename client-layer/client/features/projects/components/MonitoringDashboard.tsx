'use client'
import React, { useEffect, useRef, useState, useMemo, useCallback } from 'react'
import * as d3 from 'd3'
import { Activity, TrendingUp, Zap, AlertCircle, Clock, Globe, Cpu, Database, Server, Layers, ArrowUp, ArrowDown, Minus, Check, X, Wifi, WifiOff } from 'lucide-react'
import { ProjectData, Alert as ProjectAlert } from '../Types/ProjectTypes'
import axios from 'axios'
import { useProjectMetricsUpdates } from '@/hooks/useProjectMetrics'

interface MonitoringProps {
    projectData: ProjectData
    alerts: ProjectAlert[]
    onResolveAlert: (alertId: string) => void
    resolvingAlerts: Set<string>
    accessToken: string
    projectId: string
}

interface TimeSeriesPoint {
    time: number
    cpuUsage: number
    memoryUsage: number
}

interface MetricData {
    projectId: string
    production?: DeploymentMetrics
    staging?: DeploymentMetrics
    availableDataTypes: string[]
    notAvailable: string[]
    timeRange: string
    timestamp: string
    timeSeriesData?: TimeSeriesPoint[]
    latencyDistribution?: { bucket: string; count: number }[]
    statusCodes?: { code: string; count: number; label: string }[]
    endpoints?: { path?: string; endpoint?: string; requestCount?: number; requests?: number; avgLatency: number; errorRate: string; method?: string }[]
    geographicData?: { region: string; requests: number; percentage: number }[]
    heatmapData?: { day: number; hour: number; value: number }[]
    errorTypes?: { type: string; count: number; severity: string }[]
    requestsData?: { time: number; requestsPerMin: number; avgLatency: number; errorRate: number }[]
}

interface DeploymentMetrics {
    deploymentId: string
    cpuUsage: number
    memoryUsage: number
    networkRx: number
    networkTx: number
    requestsPerMin: number
    avgLatency: string
    errorRate: string
    uptime: string
    status: string
}

interface MetricCard {
    label: string
    value: string
    change: number
    icon: React.ElementType
    color: string
}

const Tooltip: React.FC<{
    visible: boolean
    x: number
    y: number
    title: string
    content: React.ReactNode
}> = ({ visible, x, y, title, content }) => {
    if (!visible) return null

    return (
        <div
            className="fixed z-50 pointer-events-none rounded-lg border border-zinc-700 bg-zinc-900 px-4 py-3 shadow-xl"
            style={{
                left: x + 10,
                top: y - 10,
                transform: 'translate(0, -100%)'
            }}
        >
            <div className="mb-1 text-xs font-medium text-zinc-400">{title}</div>
            <div className="text-sm text-white">{content}</div>
            <div className="absolute bottom-0 left-4 translate-y-1/2 rotate-45 w-2 h-2 bg-zinc-900 border-r border-b border-zinc-700" />
        </div>
    )
}

const DataUnavailable: React.FC<{ error?: boolean; message?: string }> = ({ error, message }) => {
    return (
        <div className="flex h-full min-h-[200px] flex-col items-center justify-center gap-3 rounded-lg border border-zinc-800 bg-[#1b1b1b]">
            {error ? (
                <>
                    <AlertCircle className="text-red-500" size={32} />
                    <span className="text-sm text-red-400">{message || 'Data error'}</span>
                </>
            ) : (
                <>
                    <Database className="text-zinc-600" size={32} />
                    <span className="text-sm text-zinc-500">{message || 'Data unavailable'}</span>
                </>
            )}
        </div>
    )
}

const LineChart: React.FC<{
    data: { time: number; value: number }[]
    color: string
    height?: number
    showArea?: boolean
    valueFormatter?: (value: number) => string
}> = ({ data, color, height = 200, showArea = true, valueFormatter = (v) => v.toString() }) => {
    const svgRef = useRef<SVGSVGElement>(null)
    const containerRef = useRef<HTMLDivElement>(null)
    const [dimensions, setDimensions] = useState({ width: 800, height })
    const [tooltip, setTooltip] = useState({ visible: false, x: 0, y: 0, title: '', value: 0, time: 0 })

    useEffect(() => {
        const updateDimensions = () => {
            if (containerRef.current) {
                const { width } = containerRef.current.getBoundingClientRect()
                setDimensions({ width: Math.max(width, 300), height })
            }
        }
        updateDimensions()
        window.addEventListener('resize', updateDimensions)
        return () => window.removeEventListener('resize', updateDimensions)
    }, [height])

    useEffect(() => {
        if (!svgRef.current) return
        if (data.length === 0) {
            d3.select(svgRef.current).selectAll('*').remove()
            return
        }

        const svg = d3.select(svgRef.current)
        svg.selectAll('*').remove()

        const { width, height } = dimensions
        const margin = { top: 20, right: 20, bottom: 30, left: 50 }
        const innerWidth = width - margin.left - margin.right
        const innerHeight = height - margin.top - margin.bottom

        const xScale = d3.scaleTime()
            .domain(d3.extent(data, d => d.time) as [number, number])
            .range([0, innerWidth])

        const yScale = d3.scaleLinear()
            .domain([0, d3.max(data, d => d.value) || 0])
            .nice()
            .range([innerHeight, 0])

        const g = svg.append('g')
            .attr('transform', `translate(${margin.left},${margin.top})`)

        g.append('g')
            .attr('class', 'grid')
            .attr('transform', `translate(0,${innerHeight})`)
            .call(d3.axisBottom(xScale)
                .ticks(6)
                .tickSize(-innerHeight)
                .tickFormat(() => '')
            )
            .selectAll('line')
            .attr('stroke', '#27272a')
            .attr('stroke-dasharray', '2,2')

        g.append('g')
            .attr('class', 'grid')
            .call(d3.axisLeft(yScale)
                .ticks(5)
                .tickSize(-innerWidth)
                .tickFormat(() => '')
            )
            .selectAll('line')
            .attr('stroke', '#27272a')
            .attr('stroke-dasharray', '2,2')

        if (showArea) {
            const area = d3.area<{ time: number; value: number }>()
                .x(d => xScale(d.time))
                .y0(innerHeight)
                .y1(d => yScale(d.value))
                .curve(d3.curveMonotoneX)

            const gradientId = `gradient-${Math.random().toString(36).substr(2, 9)}`
            const defs = svg.append('defs')
            const gradient = defs.append('linearGradient')
                .attr('id', gradientId)
                .attr('gradientUnits', 'userSpaceOnUse')
                .attr('x1', 0).attr('y1', 0)
                .attr('x2', 0).attr('y2', innerHeight)

            gradient.append('stop')
                .attr('offset', '0%')
                .attr('stop-color', color)
                .attr('stop-opacity', 0.3)

            gradient.append('stop')
                .attr('offset', '100%')
                .attr('stop-color', color)
                .attr('stop-opacity', 0)

            g.append('path')
                .datum(data)
                .attr('fill', `url(#${gradientId})`)
                .attr('d', area)
        }

        // Line
        const line = d3.line<{ time: number; value: number }>()
            .x(d => xScale(d.time))
            .y(d => yScale(d.value))
            .curve(d3.curveMonotoneX)

        g.append('path')
            .datum(data)
            .attr('fill', 'none')
            .attr('stroke', color)
            .attr('stroke-width', 2)
            .attr('d', line)

        // X Axis
        const xAxis = g.append('g')
            .attr('transform', `translate(0,${innerHeight})`)
            .call(d3.axisBottom(xScale)
                .ticks(6)
                .tickFormat(d => d3.timeFormat('%H:%M')(d as Date))
            )
        xAxis.selectAll('text')
            .attr('fill', '#71717a')
            .attr('font-size', '11px')
        xAxis.selectAll('line, path')
            .attr('stroke', '#3f3f46')

        // Y Axis
        const yAxis = g.append('g')
            .call(d3.axisLeft(yScale).ticks(5).tickFormat(d => valueFormatter(d as number)))
        yAxis.selectAll('text')
            .attr('fill', '#71717a')
            .attr('font-size', '11px')
        yAxis.selectAll('line, path')
            .attr('stroke', '#3f3f46')

        // Interactive overlay for tooltips
        const overlay = g.append('rect')
            .attr('width', innerWidth)
            .attr('height', innerHeight)
            .attr('fill', 'transparent')
            .style('cursor', 'crosshair')

        // Vertical guide line
        const guideLine = g.append('line')
            .attr('stroke', '#52525b')
            .attr('stroke-width', 1)
            .attr('stroke-dasharray', '3,3')
            .style('opacity', 0)

        // Data point circle
        const dataPoint = g.append('circle')
            .attr('r', 5)
            .attr('fill', color)
            .attr('stroke', '#18181b')
            .attr('stroke-width', 2)
            .style('opacity', 0)

        overlay
            .on('mousemove', function(event) {
                const [mouseX] = d3.pointer(event)
                const domain = xScale.domain()
                const timeAtMouse = xScale.invert(mouseX)
                
                // Find closest data point
                const bisect = d3.bisector<{ time: number; value: number }, number>(d => d.time).left
                const index = bisect(data, timeAtMouse.getTime(), 1)
                const d0 = data[index - 1]
                const d1 = data[index]
                const d = !d0 ? d1 : !d1 ? d0 : timeAtMouse.getTime() - d0.time > d1.time - timeAtMouse.getTime() ? d1 : d0

                if (d) {
                    guideLine
                        .attr('x1', xScale(d.time))
                        .attr('y1', 0)
                        .attr('x2', xScale(d.time))
                        .attr('y2', innerHeight)
                        .style('opacity', 1)

                    dataPoint
                        .attr('cx', xScale(d.time))
                        .attr('cy', yScale(d.value))
                        .style('opacity', 1)

                    // Get SVG position for tooltip
                    const svgElement = svgRef.current
                    if (svgElement) {
                        const rect = svgElement.getBoundingClientRect()
                        setTooltip({
                            visible: true,
                            x: rect.left + margin.left + xScale(d.time),
                            y: rect.top + margin.top + yScale(d.value),
                            title: d3.timeFormat('%b %d, %H:%M')(new Date(d.time)),
                            value: d.value,
                            time: d.time
                        })
                    }
                }
            })
            .on('mouseleave', function() {
                guideLine.style('opacity', 0)
                dataPoint.style('opacity', 0)
                setTooltip(prev => ({ ...prev, visible: false }))
            })

    }, [data, dimensions, color, showArea])

    if (data.length === 0) {
        return <DataUnavailable />
    }

    return (
        <>
            <div ref={containerRef} className="w-full">
                <svg ref={svgRef} width={dimensions.width} height={dimensions.height} />
            </div>
            <Tooltip
                visible={tooltip.visible}
                x={tooltip.x}
                y={tooltip.y}
                title={tooltip.title}
                content={<span className="font-semibold">{valueFormatter(tooltip.value)}</span>}
            />
        </>
    )
}

const BarChart: React.FC<{
    data: { label: string; value: number; color?: string }[]
    height?: number
    horizontal?: boolean
}> = ({ data, height = 200, horizontal = false }) => {
    const svgRef = useRef<SVGSVGElement>(null)
    const containerRef = useRef<HTMLDivElement>(null)
    const [dimensions, setDimensions] = useState({ width: 800, height })
    const [tooltip, setTooltip] = useState({ visible: false, x: 0, y: 0, label: '', value: 0 })

    useEffect(() => {
        const updateDimensions = () => {
            if (containerRef.current) {
                const { width } = containerRef.current.getBoundingClientRect()
                setDimensions({ width: Math.max(width, 300), height })
            }
        }
        updateDimensions()
        window.addEventListener('resize', updateDimensions)
        return () => window.removeEventListener('resize', updateDimensions)
    }, [height])

    useEffect(() => {
        if (!svgRef.current) return
        if (data.length === 0) {
            d3.select(svgRef.current).selectAll('*').remove()
            return
        }

        const svg = d3.select(svgRef.current)
        svg.selectAll('*').remove()

        const { width, height } = dimensions
        const margin = { top: 20, right: 20, bottom: 60, left: 60 }
        const innerWidth = width - margin.left - margin.right
        const innerHeight = height - margin.top - margin.bottom

        const g = svg.append('g')
            .attr('transform', `translate(${margin.left},${margin.top})`)

        if (horizontal) {
            const xScale = d3.scaleLinear()
                .domain([0, d3.max(data, d => d.value) || 0])
                .nice()
                .range([0, innerWidth])

            const yScale = d3.scaleBand()
                .domain(data.map(d => d.label))
                .range([0, innerHeight])
                .padding(0.3)

            // Bars
            const bars = g.selectAll('.bar')
                .data(data)
                .enter()
                .append('rect')
                .attr('class', 'bar')
                .attr('x', 0)
                .attr('y', d => yScale(d.label) || 0)
                .attr('width', 0)
                .attr('height', yScale.bandwidth())
                .attr('fill', d => d.color || '#3b82f6')
                .attr('rx', 4)
                .style('cursor', 'pointer')
                .on('mouseover', function(event, d) {
                    d3.select(this).attr('opacity', 0.8)
                    const svgElement = svgRef.current
                    if (svgElement) {
                        const rect = svgElement.getBoundingClientRect()
                        setTooltip({
                            visible: true,
                            x: rect.left + margin.left + xScale(d.value),
                            y: rect.top + margin.top + ((yScale(d.label) || 0) + yScale.bandwidth() / 2),
                            label: d.label,
                            value: d.value
                        })
                    }
                })
                .on('mouseout', function() {
                    d3.select(this).attr('opacity', 1)
                    setTooltip(prev => ({ ...prev, visible: false }))
                })

            bars.transition()
                .duration(750)
                .attr('width', d => xScale(d.value))

            // X Axis
            const xAxis = g.append('g')
                .attr('transform', `translate(0,${innerHeight})`)
                .call(d3.axisBottom(xScale).ticks(5))
            xAxis.selectAll('text')
                .attr('fill', '#71717a')
                .attr('font-size', '11px')
            xAxis.selectAll('line, path')
                .attr('stroke', '#3f3f46')

            // Y Axis
            const yAxis = g.append('g')
                .call(d3.axisLeft(yScale))
            yAxis.selectAll('text')
                .attr('fill', '#a1a1aa')
                .attr('font-size', '11px')
            yAxis.selectAll('line, path')
                .attr('stroke', '#3f3f46')
        } else {
            const xScale = d3.scaleBand()
                .domain(data.map(d => d.label))
                .range([0, innerWidth])
                .padding(0.3)

            const yScale = d3.scaleLinear()
                .domain([0, d3.max(data, d => d.value) || 0])
                .nice()
                .range([innerHeight, 0])

            // Bars
            const bars = g.selectAll('.bar')
                .data(data)
                .enter()
                .append('rect')
                .attr('class', 'bar')
                .attr('x', d => xScale(d.label) || 0)
                .attr('y', innerHeight)
                .attr('width', xScale.bandwidth())
                .attr('height', 0)
                .attr('fill', d => d.color || '#3b82f6')
                .attr('rx', 4)
                .style('cursor', 'pointer')
                .on('mouseover', function(event, d) {
                    d3.select(this).attr('opacity', 0.8)
                    const svgElement = svgRef.current
                    if (svgElement) {
                        const rect = svgElement.getBoundingClientRect()
                        setTooltip({
                            visible: true,
                            x: rect.left + margin.left + ((xScale(d.label) || 0) + xScale.bandwidth() / 2),
                            y: rect.top + margin.top + yScale(d.value),
                            label: d.label,
                            value: d.value
                        })
                    }
                })
                .on('mouseout', function() {
                    d3.select(this).attr('opacity', 1)
                    setTooltip(prev => ({ ...prev, visible: false }))
                })

            bars.transition()
                .duration(750)
                .attr('y', d => yScale(d.value))
                .attr('height', d => innerHeight - yScale(d.value))

            // X Axis
            const xAxis = g.append('g')
                .attr('transform', `translate(0,${innerHeight})`)
                .call(d3.axisBottom(xScale))
            xAxis.selectAll('text')
                .attr('fill', '#a1a1aa')
                .attr('font-size', '11px')
                .style('text-anchor', 'middle')
            xAxis.selectAll('line, path')
                .attr('stroke', '#3f3f46')

            // Y Axis
            const yAxis = g.append('g')
                .call(d3.axisLeft(yScale).ticks(5))
            yAxis.selectAll('text')
                .attr('fill', '#71717a')
                .attr('font-size', '11px')
            yAxis.selectAll('line, path')
                .attr('stroke', '#3f3f46')
        }
    }, [data, dimensions, horizontal])

    if (data.length === 0) {
        return <DataUnavailable />
    }

    return (
        <>
            <div ref={containerRef} className="w-full">
                <svg ref={svgRef} width={dimensions.width} height={dimensions.height} />
            </div>
            <Tooltip
                visible={tooltip.visible}
                x={tooltip.x}
                y={tooltip.y}
                title={tooltip.label}
                content={<span className="font-semibold">{tooltip.value.toLocaleString()}</span>}
            />
        </>
    )
}

const PieChart: React.FC<{
    data: { label: string; value: number; color: string }[]
    height?: number
}> = ({ data, height = 200 }) => {
    const svgRef = useRef<SVGSVGElement>(null)
    const containerRef = useRef<HTMLDivElement>(null)
    const [dimensions, setDimensions] = useState({ width: 400, height })

    useEffect(() => {
        const updateDimensions = () => {
            if (containerRef.current) {
                const { width } = containerRef.current.getBoundingClientRect()
                setDimensions({ width: Math.max(width, 300), height })
            }
        }
        updateDimensions()
        window.addEventListener('resize', updateDimensions)
        return () => window.removeEventListener('resize', updateDimensions)
    }, [height])

    useEffect(() => {
        if (!svgRef.current) return
        if (data.length === 0) {
            d3.select(svgRef.current).selectAll('*').remove()
            return
        }

        const svg = d3.select(svgRef.current)
        svg.selectAll('*').remove()

        const { width, height } = dimensions
        const radius = Math.min(width, height) / 2 - 20

        const g = svg.append('g')
            .attr('transform', `translate(${width / 2},${height / 2})`)

        const pie = d3.pie<{ label: string; value: number; color: string }>()
            .value(d => d.value)
            .sort(null)

        const arc = d3.arc<d3.PieArcDatum<{ label: string; value: number; color: string }>>()
            .innerRadius(radius * 0.5)
            .outerRadius(radius)

        const arcs = g.selectAll('.arc')
            .data(pie(data))
            .enter()
            .append('g')
            .attr('class', 'arc')

        arcs.append('path')
            .attr('d', arc)
            .attr('fill', d => d.data.color)
            .attr('stroke', '#18181b')
            .attr('stroke-width', 2)
            .transition()
            .duration(750)
            .attrTween('d', function(d) {
                const i = d3.interpolate({ startAngle: 0, endAngle: 0 }, d)
                return (t: number) => arc(i(t))!
            })

    }, [data, dimensions])

    if (data.length === 0) {
        return <DataUnavailable />
    }

    return (
        <div ref={containerRef} className="w-full flex justify-center">
            <svg ref={svgRef} width={dimensions.width} height={dimensions.height} />
        </div>
    )
}

const HeatmapChart: React.FC<{
    data: { hour: number; day: number; value: number }[]
    height?: number
}> = ({ data, height = 200 }) => {
    const svgRef = useRef<SVGSVGElement>(null)
    const containerRef = useRef<HTMLDivElement>(null)
    const [dimensions, setDimensions] = useState({ width: 800, height })
    const [tooltip, setTooltip] = useState({ 
        visible: false, 
        x: 0, 
        y: 0, 
        day: '', 
        hour: 0, 
        value: 0 
    })

    useEffect(() => {
        const updateDimensions = () => {
            if (containerRef.current) {
                const { width } = containerRef.current.getBoundingClientRect()
                setDimensions({ width: Math.max(width, 300), height })
            }
        }
        updateDimensions()
        window.addEventListener('resize', updateDimensions)
        return () => window.removeEventListener('resize', updateDimensions)
    }, [height])

    useEffect(() => {
        if (!svgRef.current) return
        if (data.length === 0) {
            d3.select(svgRef.current).selectAll('*').remove()
            return
        }

        const svg = d3.select(svgRef.current)
        svg.selectAll('*').remove()

        const { width, height } = dimensions
        const margin = { top: 30, right: 20, bottom: 30, left: 50 }
        const innerWidth = width - margin.left - margin.right
        const innerHeight = height - margin.top - margin.bottom

        const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
        const hours = d3.range(24)

        const xScale = d3.scaleBand()
            .domain(hours.map(String))
            .range([0, innerWidth])
            .padding(0.05)

        const yScale = d3.scaleBand()
            .domain(days)
            .range([0, innerHeight])
            .padding(0.05)

        const colorScale = d3.scaleSequential(d3.interpolateViridis)
            .domain([0, d3.max(data, d => d.value) || 100])

        const g = svg.append('g')
            .attr('transform', `translate(${margin.left},${margin.top})`)

        // Heatmap cells
        g.selectAll('.cell')
            .data(data)
            .enter()
            .append('rect')
            .attr('class', 'cell')
            .attr('x', d => xScale(d.hour.toString()) || 0)
            .attr('y', d => yScale(days[d.day]) || 0)
            .attr('width', xScale.bandwidth())
            .attr('height', yScale.bandwidth())
            .attr('fill', d => colorScale(d.value))
            .attr('rx', 2)
            .style('cursor', 'pointer')
            .on('mouseover', function(event, d) {
                d3.select(this)
                    .attr('stroke', '#fff')
                    .attr('stroke-width', 2)
                
                const svgElement = svgRef.current
                if (svgElement) {
                    const rect = svgElement.getBoundingClientRect()
                    setTooltip({
                        visible: true,
                        x: rect.left + margin.left + ((xScale(d.hour.toString()) || 0) + xScale.bandwidth() / 2),
                        y: rect.top + margin.top + ((yScale(days[d.day]) || 0)),
                        day: days[d.day],
                        hour: d.hour,
                        value: d.value
                    })
                }
            })
            .on('mouseout', function() {
                d3.select(this).attr('stroke', 'none')
                setTooltip(prev => ({ ...prev, visible: false }))
            })

        // X Axis
        const xAxis = g.append('g')
            .attr('transform', `translate(0,${innerHeight})`)
            .call(d3.axisBottom(xScale)
                .tickValues(hours.filter(h => h % 3 === 0).map(String))
            )
        xAxis.selectAll('text')
            .attr('fill', '#71717a')
            .attr('font-size', '10px')
        xAxis.selectAll('line, path')
            .attr('stroke', '#3f3f46')

        // Y Axis
        const yAxis = g.append('g')
            .call(d3.axisLeft(yScale))
        yAxis.selectAll('text')
            .attr('fill', '#a1a1aa')
            .attr('font-size', '10px')
        yAxis.selectAll('line, path')
            .attr('stroke', 'none')

    }, [data, dimensions])

    if (data.length === 0) {
        return <DataUnavailable />
    }

    return (
        <>
            <div ref={containerRef} className="w-full">
                <svg ref={svgRef} width={dimensions.width} height={dimensions.height} />
            </div>
            <Tooltip
                visible={tooltip.visible}
                x={tooltip.x}
                y={tooltip.y}
                title={`${tooltip.day} ${tooltip.hour}:00`}
                content={<span><span className="font-semibold">{tooltip.value}</span> requests</span>}
            />
        </>
    )
}

const MetricCard: React.FC<{
    label: string
    value: string
    change: number
    icon: React.ElementType
    color: string
}> = ({ label, value, change, icon: Icon, color }) => {
    const ChangeIcon = change > 0 ? ArrowUp : change < 0 ? ArrowDown : Minus
    const changeColor = change > 0 ? 'text-green-500' : change < 0 ? 'text-red-500' : 'text-zinc-500'

    return (
        <div className="rounded-lg border border-zinc-800 bg-[#1b1b1b] p-4">
            <div className="mb-3 flex items-center justify-between">
                <div className={`flex h-10 w-10 items-center justify-center rounded-lg bg-opacity-10 ${color.replace('text-', 'bg-')}`}>
                    <Icon className={color} size={20} />
                </div>
                <div className={`flex items-center gap-1 text-sm font-medium ${changeColor}`}>
                    <ChangeIcon size={14} />
                    {Math.abs(change)}%
                </div>
            </div>
            <div className="text-2xl font-bold text-white">{value}</div>
            <div className="text-sm text-zinc-400">{label}</div>
        </div>
    )
}

const TimeRangeSelector: React.FC<{
    selected: string
    onChange: (range: string) => void
}> = ({ selected, onChange }) => {
    const ranges = ['1h', '6h', '24h', '7d', '30d']

    return (
        <div className="flex gap-1 rounded-lg bg-zinc-900 p-1">
            {ranges.map(range => (
                <button
                    key={range}
                    onClick={() => onChange(range)}
                    className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                        selected === range
                            ? 'bg-zinc-800 text-white'
                            : 'text-zinc-400 hover:text-white'
                    }`}
                >
                    {range}
                </button>
            ))}
        </div>
    )
}

const MonitoringDashboard: React.FC<MonitoringProps> = ({ projectData, alerts: propAlerts, onResolveAlert, resolvingAlerts, accessToken, projectId }) => {
    const [timeRange, setTimeRange] = useState('24h')
    const [activeTab, setActiveTab] = useState<'overview' | 'performance' | 'errors' | 'infrastructure'>('overview')
    const [metricData, setMetricData] = useState<MetricData | null>(null)
    const [alerts, setAlerts] = useState<ProjectAlert[]>(propAlerts)
    const [lastUpdate, setLastUpdate] = useState<Date | null>(null)
    const [isLoading, setIsLoading] = useState(true)
    const [dataError, setDataError] = useState<string | null>(null)

    const fetchInitialMetrics = useCallback(async () => {
        setIsLoading(true)
        setDataError(null)
        try {
            const monitoringUrl = process.env.NEXT_PUBLIC_MONITORING_SERVICE_URL || 'http://localhost:5110'
            const response = await axios.get<{ data: { metrics: any } }>(
                `${monitoringUrl}/api/projects/${projectId}/metrics?timeRange=${timeRange}`
            )
            if (response.data?.data?.metrics) {
                setMetricData(response.data.data.metrics)
            }
        } catch (error) {
            console.error('Failed to fetch initial metrics:', error)
            setDataError('Failed to load metrics data')
        } finally {
            setIsLoading(false)
        }
    }, [projectId, timeRange])

    useEffect(() => {
        fetchInitialMetrics()
    }, [fetchInitialMetrics])

    const { metrics, isConnected, lastUpdate: hookLastUpdate, error } = useProjectMetricsUpdates(projectId, timeRange)

    useEffect(() => {
        if (metrics) {
            setMetricData(metrics)
        }
        if (error) {
            setDataError(error)
        }
    }, [metrics, error])

    useEffect(() => {
        if (hookLastUpdate) {
            setLastUpdate(hookLastUpdate)
        }
    }, [hookLastUpdate])

    const handleResolveAlert = async (alertId: string) => {
        try {
            const monitoringUrl = process.env.NEXT_PUBLIC_MONITORING_SERVICE_URL || 'http://localhost:5110'
            await axios.post(`${monitoringUrl}/api/alerts/${alertId}/resolve/${accessToken}`)
            setAlerts(prev => prev.filter(a => a.id !== alertId))
            onResolveAlert(alertId)
        } catch (error) {
            console.error('Failed to resolve alert:', error)
        }
    }

    const productionMetrics = metricData?.production

    // Helper function to format bytes
    const formatBytes = useCallback((bytes: number): string => {
        if (bytes === 0) return '0 B'
        const k = 1024
        const sizes = ['B', 'KB', 'MB', 'GB', 'TB']
        const i = Math.floor(Math.log(bytes) / Math.log(k))
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
    }, [])

    // Time series data from API
    const timeSeriesData = useMemo(() => {
        return metricData?.timeSeriesData || []
    }, [metricData?.timeSeriesData])

    const cpuData = useMemo(() => {
        return timeSeriesData.map(point => ({ time: point.time, value: point.cpuUsage || 0 }))
    }, [timeSeriesData])

    const memoryData = useMemo(() => {
        return timeSeriesData.map(point => ({ time: point.time, value: point.memoryUsage || 0 }))
    }, [timeSeriesData])

    const requestsData = useMemo(() => {
        if (metricData?.notAvailable?.includes('requestsData')) {
            return []
        }
        return (metricData?.requestsData || []).map(point => ({ time: point.time, value: point.requestsPerMin || 0 }))
    }, [metricData?.notAvailable, metricData?.requestsData])

    const responseTimeData = useMemo(() => {
        if (metricData?.notAvailable?.includes('requestsData')) {
            return []
        }
        return (metricData?.requestsData || []).map(point => ({ time: point.time, value: point.avgLatency || 0 }))
    }, [metricData?.notAvailable, metricData?.requestsData])

    const latencyData = useMemo(() => {
        if (metricData?.notAvailable?.includes('latencyDistribution')) {
            return []
        }
        return metricData?.latencyDistribution || []
    }, [metricData?.notAvailable, metricData?.latencyDistribution])

    const statusCodesData = useMemo(() => {
        if (metricData?.notAvailable?.includes('statusCodes')) {
            return []
        }
        return metricData?.statusCodes || []
    }, [metricData?.notAvailable, metricData?.statusCodes])

    const endpointsData = useMemo(() => {
        if (metricData?.notAvailable?.includes('endpoints')) {
            return []
        }
        return metricData?.endpoints || []
    }, [metricData?.notAvailable, metricData?.endpoints])

    const geographicData = useMemo(() => {
        if (metricData?.notAvailable?.includes('geographicData')) {
            return []
        }
        return metricData?.geographicData || []
    }, [metricData?.notAvailable, metricData?.geographicData])

    const heatmapData = useMemo(() => {
        if (metricData?.notAvailable?.includes('heatmapData')) {
            return []
        }
        return metricData?.heatmapData || []
    }, [metricData?.notAvailable, metricData?.heatmapData])

    const latestCPU = timeSeriesData.length > 0 ? timeSeriesData[timeSeriesData.length - 1].cpuUsage : 0
    const latestMemory = timeSeriesData.length > 0 ? timeSeriesData[timeSeriesData.length - 1].memoryUsage : 0

    const metricCards: MetricCard[] = useMemo(() => [
        { label: 'Requests/min', value: productionMetrics?.requestsPerMin?.toString() || 'N/A', change: 0, icon: TrendingUp, color: 'text-blue-500' },
        { label: 'Response Time', value: productionMetrics?.avgLatency || 'N/A', change: 0, icon: Clock, color: 'text-green-500' },
        { label: 'Error Rate', value: productionMetrics?.errorRate || 'N/A', change: 0, icon: AlertCircle, color: 'text-red-500' },
        { label: 'Uptime', value: productionMetrics?.uptime || 'N/A', change: 0, icon: Activity, color: 'text-purple-500' }
    ], [productionMetrics])

    const errorTypesData = useMemo(() => {
        return metricData?.errorTypes || []
    }, [metricData?.errorTypes])

    if (isLoading && !metricData) {
        return (
            <div className="flex h-96 items-center justify-center">
                <div className="flex flex-col items-center gap-4">
                    <div className="h-8 w-8 animate-spin rounded-full border-2 border-blue-500 border-t-transparent"></div>
                    <p className="text-sm text-zinc-400">Loading metrics...</p>
                </div>
            </div>
        )
    }

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                <div className="flex items-center gap-4">
                    <div>
                        <h2 className="text-xl font-semibold text-white">Monitoring Dashboard</h2>
                        <p className="text-sm text-zinc-400">Real-time observability and performance metrics</p>
                    </div>
                    <div className="flex items-center gap-2">
                        {isConnected ? (
                            <div className="flex items-center gap-1.5 rounded-full bg-green-500/10 px-3 py-1">
                                <Wifi size={14} className="text-green-500" />
                                <span className="text-xs font-medium text-green-500">Live</span>
                            </div>
                        ) : (
                            <div className="flex items-center gap-1.5 rounded-full bg-red-500/10 px-3 py-1">
                                <WifiOff size={14} className="text-red-500" />
                                <span className="text-xs font-medium text-red-500">Disconnected</span>
                            </div>
                        )}
                        {lastUpdate && (
                            <span className="text-xs text-zinc-500">
                                Updated {lastUpdate.toLocaleTimeString()}
                            </span>
                        )}
                    </div>
                </div>
                <TimeRangeSelector selected={timeRange} onChange={setTimeRange} />
            </div>

            {dataError && (
                <div className="flex items-center gap-3 rounded-lg border border-red-500/30 bg-red-500/10 p-4">
                    <AlertCircle className="text-red-500" size={20} />
                    <span className="text-sm text-red-400">{dataError}</span>
                </div>
            )}

            <div className="border-b border-zinc-800">
                <div className="flex gap-1">
                    {[
                        { id: 'overview', label: 'Overview', icon: Activity },
                        { id: 'performance', label: 'Performance', icon: Zap },
                        { id: 'errors', label: 'Errors', icon: AlertCircle },
                        { id: 'infrastructure', label: 'Infrastructure', icon: Server }
                    ].map(tab => {
                        const Icon = tab.icon
                        return (
                            <button
                                key={tab.id}
                                onClick={() => setActiveTab(tab.id as any)}
                                className={`flex items-center gap-2 border-b-2 px-4 py-3 text-sm font-medium transition-colors ${
                                    activeTab === tab.id
                                        ? 'border-blue-500 text-white'
                                        : 'border-transparent text-zinc-400 hover:text-white'
                                }`}
                            >
                                <Icon size={16} />
                                {tab.label}
                            </button>
                        )
                    })}
                </div>
            </div>

            {/* Overview Tab */}
            {activeTab === 'overview' && (
                <>
                    {/* Key Metrics */}
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
                        {metricCards.map((card, idx) => (
                            <MetricCard key={idx} {...card} />
                        ))}
                    </div>

                    {/* Active Alerts Section */}
                    {alerts.length > 0 && (
                        <div className="rounded-lg border border-zinc-800 bg-[#1b1b1b] p-5">
                            <div className="mb-4 flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                    <AlertCircle className="text-red-500" size={20} />
                                    <h3 className="font-semibold text-white">Active Alerts ({alerts.length})</h3>
                                </div>
                            </div>
                            <div className="space-y-3">
                                {alerts.map(alert => (
                                    <div
                                        key={alert.id}
                                        className={`rounded-lg border p-4 transition-all ${
                                            alert.severity === 'critical'
                                                ? 'border-red-500/30 bg-red-500/10'
                                                : alert.severity === 'high'
                                                ? 'border-orange-500/30 bg-orange-500/10'
                                                : alert.severity === 'medium'
                                                ? 'border-yellow-500/30 bg-yellow-500/10'
                                                : 'border-blue-500/30 bg-blue-500/10'
                                        }`}
                                    >
                                        <div className="flex items-start justify-between gap-4">
                                            <div className="flex items-start gap-3 min-w-0">
                                                <AlertCircle
                                                    className={`mt-0.5 shrink-0 ${
                                                        alert.severity === 'critical'
                                                            ? 'text-red-500'
                                                            : alert.severity === 'high'
                                                            ? 'text-orange-500'
                                                            : alert.severity === 'medium'
                                                            ? 'text-yellow-500'
                                                            : 'text-blue-500'
                                                    }`}
                                                    size={18}
                                                />
                                                <div className="min-w-0">
                                                    <p className="text-sm font-medium text-zinc-200">{alert.message}</p>
                                                    <p className="text-xs text-zinc-500 mt-1">
                                                        {new Date(alert.timestamp).toLocaleString()}
                                                    </p>
                                                </div>
                                            </div>
                                            <div className="flex items-center gap-2 shrink-0">
                                                <span
                                                    className={`rounded-full px-2 py-1 text-xs font-medium ${
                                                        alert.severity === 'critical'
                                                            ? 'bg-red-500/20 text-red-400'
                                                            : alert.severity === 'high'
                                                            ? 'bg-orange-500/20 text-orange-400'
                                                            : alert.severity === 'medium'
                                                            ? 'bg-yellow-500/20 text-yellow-400'
                                                            : 'bg-blue-500/20 text-blue-400'
                                                    }`}
                                                >
                                                    {alert.severity}
                                                </span>
                                                <button
                                                    onClick={() => handleResolveAlert(alert.id)}
                                                    disabled={resolvingAlerts.has(alert.id)}
                                                    className="flex items-center gap-1.5 rounded-lg border border-green-500/30 bg-green-500/10 px-3 py-1.5 text-xs font-medium text-green-400 transition-all hover:bg-green-500/20 disabled:opacity-50 disabled:cursor-not-allowed"
                                                >
                                                    {resolvingAlerts.has(alert.id) ? (
                                                        <>
                                                            <div className="h-3 w-3 animate-spin rounded-full border-2 border-green-400 border-t-transparent" />
                                                            Solving...
                                                        </>
                                                    ) : (
                                                        <>
                                                            <Check size={14} />
                                                            Solved
                                                        </>
                                                    )}
                                                </button>
                                                <button
                                                    onClick={() => handleResolveAlert(alert.id)}
                                                    disabled={resolvingAlerts.has(alert.id)}
                                                    className="flex items-center justify-center rounded-lg border border-zinc-700 bg-zinc-900 p-1.5 text-zinc-400 transition-all hover:bg-zinc-800 hover:text-white disabled:opacity-50"
                                                    title="Dismiss"
                                                >
                                                    <X size={14} />
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Request Volume */}
                    <div className="rounded-lg border border-zinc-800 bg-[#1b1b1b] p-5">
                        <div className="mb-4 flex items-center justify-between">
                            <h3 className="font-semibold text-white">Request Volume</h3>
                            <span className="text-sm text-zinc-400">{timeRange}</span>
                        </div>
                        <LineChart 
                            data={requestsData} 
                            color="#3b82f6" 
                            height={250} 
                            showArea 
                            valueFormatter={(v) => `${Math.round(v).toLocaleString()} req/min`}
                        />
                    </div>

                    {/* Geographic Distribution */}
                    <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
                        <div className="rounded-lg border border-zinc-800 bg-[#1b1b1b] p-5">
                            <h3 className="mb-4 font-semibold text-white">Geographic Distribution</h3>
                            <div className="space-y-3">
                                {geographicData.map((region, idx) => (
                                    <div key={idx} className="flex items-center justify-between">
                                        <div className="flex items-center gap-3">
                                            <Globe size={16} className="text-zinc-500" />
                                            <span className="text-sm text-zinc-300">{region.region}</span>
                                        </div>
                                        <div className="flex items-center gap-4">
                                            <div className="h-2 w-24 overflow-hidden rounded-full bg-zinc-900">
                                                <div
                                                    className="h-full bg-blue-500 transition-all"
                                                    style={{ width: `${region.percentage}%` }}
                                                />
                                            </div>
                                            <span className="w-12 text-right text-sm text-zinc-400">{region.percentage}%</span>
                                            <span className="w-16 text-right text-sm font-medium text-zinc-300">
                                                {region.requests.toLocaleString()}
                                            </span>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>

                        <div className="rounded-lg border border-zinc-800 bg-[#1b1b1b] p-5">
                            <h3 className="mb-4 font-semibold text-white">Top Endpoints</h3>
                            <div className="space-y-3">
                                {endpointsData.map((endpoint, idx) => (
                                    <div key={idx} className="flex items-center justify-between rounded-lg bg-zinc-900/50 p-3">
                                        <div>
                                            <div className="font-mono text-sm text-blue-400">{endpoint.path || endpoint.endpoint || '/'}</div>
                                            <div className="text-xs text-zinc-500">{(endpoint.requestCount || endpoint.requests || 0).toLocaleString()} requests</div>
                                        </div>
                                        <div className="text-right">
                                            <div className="text-sm font-medium text-zinc-300">{endpoint.avgLatency}ms</div>
                                            <div className={`text-xs ${parseFloat(endpoint.errorRate) > 1 ? 'text-red-400' : 'text-green-400'}`}>
                                                {endpoint.errorRate}% errors
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>

                    {/* Traffic Heatmap */}
                    <div className="rounded-lg border border-zinc-800 bg-[#1b1b1b] p-5">
                        <div className="mb-4 flex items-center justify-between">
                            <h3 className="font-semibold text-white">Traffic Heatmap</h3>
                            <span className="text-sm text-zinc-400">Requests per hour</span>
                        </div>
                        <HeatmapChart data={heatmapData} height={180} />
                    </div>
                </>
            )}

            {/* Performance Tab */}
            {activeTab === 'performance' && (
                <>
                    {/* Response Time */}
                    <div className="rounded-lg border border-zinc-800 bg-[#1b1b1b] p-5">
                        <div className="mb-4 flex items-center justify-between">
                            <h3 className="font-semibold text-white">Response Time</h3>
                            <span className="text-sm text-zinc-400">p50, p95, p99</span>
                        </div>
                        <LineChart 
                            data={responseTimeData} 
                            color="#22c55e" 
                            height={250} 
                            showArea 
                            valueFormatter={(v) => `${Math.round(v)}ms`}
                        />
                    </div>

                    {/* Latency Distribution */}
                    <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
                        <div className="rounded-lg border border-zinc-800 bg-[#1b1b1b] p-5">
                            <h3 className="mb-4 font-semibold text-white">Latency Distribution</h3>
                            <BarChart
                                data={latencyData.map(d => ({ label: d.bucket, value: d.count }))}
                                height={250}
                            />
                        </div>

                        <div className="rounded-lg border border-zinc-800 bg-[#1b1b1b] p-5">
                            <h3 className="mb-4 font-semibold text-white">Status Codes</h3>
                            <div className="space-y-2">
                                {statusCodesData.map((status, idx) => {
                                    const isError = parseInt(status.code) >= 400
                                    const isRedirect = parseInt(status.code) >= 300 && parseInt(status.code) < 400
                                    const color = isError ? 'text-red-500' : isRedirect ? 'text-yellow-500' : 'text-green-500'
                                    const bgColor = isError ? 'bg-red-500/10' : isRedirect ? 'bg-yellow-500/10' : 'bg-green-500/10'

                                    return (
                                        <div key={idx} className="flex items-center justify-between">
                                            <div className="flex items-center gap-3">
                                                <span className={`rounded px-2 py-0.5 text-xs font-medium ${bgColor} ${color}`}>
                                                    {status.code}
                                                </span>
                                                <span className="text-sm text-zinc-400">{status.label}</span>
                                            </div>
                                            <span className="text-sm font-medium text-zinc-300">{status.count.toLocaleString()}</span>
                                        </div>
                                    )
                                })}
                            </div>
                        </div>
                    </div>

                    {/* Performance Metrics Table */}
                    <div className="rounded-lg border border-zinc-800 bg-[#1b1b1b]">
                        <div className="border-b border-zinc-800 px-5 py-3">
                            <h3 className="font-semibold text-white">Endpoint Performance</h3>
                        </div>
                        <table className="w-full">
                            <thead className="border-b border-zinc-800 bg-zinc-900/50">
                                <tr>
                                    <th className="px-5 py-3 text-left text-xs font-medium tracking-wider text-zinc-400 uppercase">Endpoint</th>
                                    <th className="px-5 py-3 text-right text-xs font-medium tracking-wider text-zinc-400 uppercase">Requests</th>
                                    <th className="px-5 py-3 text-right text-xs font-medium tracking-wider text-zinc-400 uppercase">Avg Latency</th>
                                    <th className="px-5 py-3 text-right text-xs font-medium tracking-wider text-zinc-400 uppercase">p95 Latency</th>
                                    <th className="px-5 py-3 text-right text-xs font-medium tracking-wider text-zinc-400 uppercase">Error Rate</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-zinc-800">
                                {endpointsData.map((endpoint, idx) => (
                                    <tr key={idx} className="hover:bg-zinc-900/50">
                                        <td className="px-5 py-3">
                                            <span className="font-mono text-sm text-blue-400">{endpoint.path || endpoint.endpoint || '/'}</span>
                                        </td>
                                        <td className="px-5 py-3 text-right text-sm text-zinc-300">{(endpoint.requestCount || endpoint.requests || 0).toLocaleString()}</td>
                                        <td className="px-5 py-3 text-right text-sm text-zinc-300">{endpoint.avgLatency}ms</td>
                                        <td className="px-5 py-3 text-right text-sm text-zinc-300">{Math.round(endpoint.avgLatency * 2.5)}ms</td>
                                        <td className="px-5 py-3 text-right">
                                            <span className={`text-sm ${parseFloat(endpoint.errorRate) > 1 ? 'text-red-400' : parseFloat(endpoint.errorRate) > 0.5 ? 'text-yellow-400' : 'text-green-400'}`}>
                                                {endpoint.errorRate}%
                                            </span>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </>
            )}

            {/* Errors Tab */}
            {activeTab === 'errors' && (
                <>
                    {/* Error Rate Chart */}
                    <div className="rounded-lg border border-zinc-800 bg-[#1b1b1b] p-5">
                        <div className="mb-4 flex items-center justify-between">
                            <h3 className="font-semibold text-white">Error Rate Over Time</h3>
                            <span className="text-sm text-zinc-400">{projectData.metrics.errors24h} errors in 24h</span>
                        </div>
                        <LineChart 
                            data={requestsData} 
                            color="#ef4444" 
                            height={250} 
                            showArea 
                            valueFormatter={(v) => `${v.toFixed(2)}%`}
                        />
                    </div>

                    {/* Error Breakdown */}
                    <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
                        <div className="rounded-lg border border-zinc-800 bg-[#1b1b1b] p-5">
                            <h3 className="mb-4 font-semibold text-white">Error Types</h3>
                            <BarChart
                                data={errorTypesData.map(d => ({
                                    label: d.type,
                                    value: d.count,
                                    color: d.severity === 'critical' ? '#ef4444' : d.severity === 'high' ? '#f97316' : d.severity === 'medium' ? '#eab308' : '#3b82f6'
                                }))}
                                height={250}
                                horizontal
                            />
                        </div>

                        <div className="rounded-lg border border-zinc-800 bg-[#1b1b1b] p-5">
                            <h3 className="mb-4 font-semibold text-white">Recent Errors</h3>
                            <div className="space-y-3 max-h-[250px] overflow-y-auto">
                                {errorTypesData.map((error, idx) => (
                                    <div key={idx} className={`rounded-lg border p-3 ${
                                        error.severity === 'critical' ? 'border-red-500/20 bg-red-500/5' :
                                        error.severity === 'high' ? 'border-orange-500/20 bg-orange-500/5' :
                                        error.severity === 'medium' ? 'border-yellow-500/20 bg-yellow-500/5' :
                                        'border-blue-500/20 bg-blue-500/5'
                                    }`}>
                                        <div className="flex items-center justify-between">
                                            <span className="text-sm font-medium text-zinc-200">{error.type}</span>
                                            <span className={`rounded px-2 py-0.5 text-xs ${
                                                error.severity === 'critical' ? 'bg-red-500/10 text-red-400' :
                                                error.severity === 'high' ? 'bg-orange-500/10 text-orange-400' :
                                                error.severity === 'medium' ? 'bg-yellow-500/10 text-yellow-400' :
                                                'bg-blue-500/10 text-blue-400'
                                            }`}>
                                                {error.severity}
                                            </span>
                                        </div>
                                        <div className="mt-1 text-xs text-zinc-500">{error.count} occurrences</div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                </>
            )}

            {/* Infrastructure Tab */}
            {activeTab === 'infrastructure' && (
                <>
                    {/* Resource Usage Charts */}
                    <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
                        <div className="rounded-lg border border-zinc-800 bg-[#1b1b1b] p-5">
                            <div className="mb-4 flex items-center justify-between">
                                <h3 className="font-semibold text-white">CPU Usage</h3>
                                <div className="flex items-center gap-2">
                                    <Cpu size={16} className="text-blue-500" />
                                    <span className="text-sm text-zinc-400">{latestCPU > 0 ? `${latestCPU.toFixed(1)}%` : 'N/A'}</span>
                                </div>
                            </div>
                            <LineChart 
                                data={cpuData} 
                                color="#3b82f6" 
                                height={200} 
                                showArea 
                                valueFormatter={(v) => `${v.toFixed(1)}%`}
                            />
                        </div>

                        <div className="rounded-lg border border-zinc-800 bg-[#1b1b1b] p-5">
                            <div className="mb-4 flex items-center justify-between">
                                <h3 className="font-semibold text-white">Memory Usage</h3>
                                <div className="flex items-center gap-2">
                                    <Database size={16} className="text-purple-500" />
                                    <span className="text-sm text-zinc-400">{latestMemory > 0 ? formatBytes(latestMemory) : 'N/A'}</span>
                                </div>
                            </div>
                            <LineChart 
                                data={memoryData} 
                                color="#a855f7" 
                                height={200} 
                                showArea 
                                valueFormatter={(v) => formatBytes(v)}
                            />
                        </div>
                    </div>

                    {/* Container Health */}
                    <div className="rounded-lg border border-zinc-800 bg-[#1b1b1b] p-5">
                        <div className="mb-4 flex items-center justify-between">
                            <h3 className="font-semibold text-white">Container Health</h3>
                            <div className="flex items-center gap-4 text-sm">
                                <div className="flex items-center gap-2">
                                    <div className="h-3 w-3 rounded-full bg-green-500" />
                                    <span className="text-zinc-400">Healthy</span>
                                </div>
                                <div className="flex items-center gap-2">
                                    <div className="h-3 w-3 rounded-full bg-yellow-500" />
                                    <span className="text-zinc-400">Warning</span>
                                </div>
                                <div className="flex items-center gap-2">
                                    <div className="h-3 w-3 rounded-full bg-red-500" />
                                    <span className="text-zinc-400">Unhealthy</span>
                                </div>
                            </div>
                        </div>
                        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
                            {projectData.production?.containers?.map((container, idx) => (
                                <div key={idx} className="rounded-lg border border-zinc-700 bg-zinc-900/50 p-4">
                                    <div className="mb-3 flex items-center justify-between">
                                        <span className="text-sm font-medium text-zinc-300">{container.name}</span>
                                        <div className={`h-3 w-3 rounded-full ${
                                            container.healthStatus === 'healthy' ? 'bg-green-500' :
                                            container.healthStatus === 'unhealthy' ? 'bg-red-500' :
                                            'bg-yellow-500'
                                        }`} />
                                    </div>
                                    <div className="space-y-2">
                                        <div className="flex justify-between text-sm">
                                            <span className="text-zinc-500">CPU</span>
                                            <span className="text-zinc-300">{(container.cpuUsage ?? -1) < 0 ? 'N/A' : container.cpuUsage + '%'}</span>
                                        </div>
                                        <div className="flex justify-between text-sm">
                                            <span className="text-zinc-500">Memory</span>
                                            <span className="text-zinc-300">{container.memoryUsage || 'N/A'}MB</span>
                                        </div>
                                        <div className="h-1.5 overflow-hidden rounded-full bg-zinc-800">
                                            <div
                                                className={`h-full ${
                                                    (container.cpuUsage ?? -1) < 0 ? 'bg-zinc-600' :
                                                    (container.cpuUsage ?? 0) > 80 ? 'bg-red-500' :
                                                    (container.cpuUsage ?? 0) > 60 ? 'bg-yellow-500' :
                                                    'bg-green-500'
                                                }`}
                                                style={{ width: `${Math.min((container.cpuUsage ?? -1) < 0 ? 0 : (container.cpuUsage ?? 0), 100)}%` }}
                                            />
                                        </div>
                                    </div>
                                </div>
                            )) || (
                                <div className="col-span-full text-center py-8 text-zinc-500">
                                    No container data available
                                </div>
                            )}
                        </div>
                    </div>

                    {/* System Metrics */}
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
                        <div className="rounded-lg border border-zinc-800 bg-[#1b1b1b] p-4">
                            <div className="mb-1 flex items-center gap-2 text-sm text-zinc-400">
                                <Layers size={16} />
                                Replicas
                            </div>
                            <div className="text-2xl font-bold text-white">{projectData.production?.replicaCount || 3}</div>
                            <div className="text-xs text-green-500">All running</div>
                        </div>

                        <div className="rounded-lg border border-zinc-800 bg-[#1b1b1b] p-4">
                            <div className="mb-1 flex items-center gap-2 text-sm text-zinc-400">
                                <Globe size={16} />
                                Bandwidth
                            </div>
                            <div className="text-2xl font-bold text-white">45.2 MB</div>
                            <div className="text-xs text-zinc-500">Last hour</div>
                        </div>

                        <div className="rounded-lg border border-zinc-800 bg-[#1b1b1b] p-4">
                            <div className="mb-1 flex items-center gap-2 text-sm text-zinc-400">
                                <Database size={16} />
                                Disk Usage
                            </div>
                            <div className="text-2xl font-bold text-white">2.4 GB</div>
                            <div className="text-xs text-zinc-500">of 10 GB</div>
                        </div>

                        <div className="rounded-lg border border-zinc-800 bg-[#1b1b1b] p-4">
                            <div className="mb-1 flex items-center gap-2 text-sm text-zinc-400">
                                <Clock size={16} />
                                Last Restart
                            </div>
                            <div className="text-2xl font-bold text-white">3d 4h</div>
                            <div className="text-xs text-green-500">Stable</div>
                        </div>
                    </div>
                </>
            )}
        </div>
    )
}

export default MonitoringDashboard
