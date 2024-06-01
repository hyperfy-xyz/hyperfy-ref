import { useRef, useEffect, useState, useMemo, useLayoutEffect } from 'react'
import { cls, css, useRoute } from 'firebolt'
import { XIcon } from 'lucide-react'

import { Header } from '@/components/Header'
import { useAuth } from '@/components/AuthProvider'
import { useForceUpdate } from '@/components/useForceUpdate'

import { Verse } from '@/space/Verse'
import { CodeEditor } from '@/components/CodeEditor'
import { wrapRawCode } from '@/utils/wrapRawCode'

let verse
const getVerse = () => {
  if (!verse) verse = new Verse()
  return verse
}

export default function Page() {
  const { auth } = useAuth()
  const { id } = useRoute().params
  if (!auth) return null // TODO: loading
  return <Content key={id} />
}

function Content() {
  const verse = getVerse()
  const viewportRef = useRef()
  const [status, setStatus] = useState({ type: 'connecting' })
  const { auth } = useAuth()
  const { id } = useRoute().params
  const [context, setContext] = useState(null)
  useEffect(() => {
    const viewport = viewportRef.current
    function onConnect() {
      setStatus({ type: 'connected' })
    }
    function onActive() {
      setStatus({ type: 'active' })
    }
    function onDisconnect() {
      setStatus({ type: 'disconnected' })
    }
    function onContextOpen(msg) {
      setContext(context)
    }
    function onContextClose() {
      setContext(null)
    }
    verse.on('connect', onConnect)
    verse.on('active', onActive)
    verse.on('disconnect', onDisconnect)
    verse.on('context:open', onContextOpen)
    verse.on('context:close', onContextClose)
    verse.launch(id, auth, viewport)
    return () => {
      verse.off('connect', onConnect)
      verse.off('active', onActive)
      verse.off('disconnect', onDisconnect)
      verse.off('context:open', onContextOpen)
      verse.off('context:close', onContextClose)
      verse.stop()
    }
  }, [])
  useEffect(() => {
    verse.network.setAuth(auth)
  }, [auth])
  return (
    <>
      <Header inSpace />
      <title>{verse.network.meta?.name || 'Space'}</title>
      <div
        className='space'
        css={css`
          position: relative;
          height: 100vh;
          background: black;
          .space-viewport {
            position: absolute;
            inset: 0;
          }
          .space-overlay {
            position: absolute;
            inset: 0;
            background: blue;
            display: flex;
            align-items: center;
            justify-content: center;
            > div {
              color: white;
              font-size: 20px;
            }
          }
        `}
      >
        <div className='space-viewport' ref={viewportRef} />
        {status.type === 'connecting' && (
          <div className='space-overlay'>
            <div>Connecting</div>
          </div>
        )}
        {status.type === 'connected' && (
          <div className='space-overlay'>
            <div>Preparing</div>
          </div>
        )}
        {status.type === 'disconnected' && (
          <div className='space-overlay'>
            <div>Disconnected</div>
          </div>
        )}
        {context && (
          <Context x={context.x} y={context.y} actions={context.actions} />
        )}
        <Panels verse={verse} />
      </div>
    </>
  )
}

function Context({ x, y, actions }) {
  const ref = useRef()
  return (
    <div
      ref={ref}
      css={css`
        position: absolute;
        top: ${y}px;
        left: ${x}px;
        transform: translateX(-50%) translateY(-50%);
        pointer-events: none;
        user-select: none;
      `}
    >
      <RadialMenu
        innerRadius={50}
        outerRadius={150}
        actions={actions}
        gapAngle={6}
      />
    </div>
  )
}

const RadialMenu = ({ innerRadius, outerRadius, actions, gapAngle }) => {
  const svgRef = useRef()

  const hoverScale = 1.05
  const size = outerRadius * 2 * hoverScale
  const centerX = size / 2
  const centerY = size / 2

  const buttons = useMemo(() => {
    actions = actions.filter(a => a.visible)
    while (actions.length < 4) {
      actions.push({
        label: null,
        icon: null,
        disabled: true,
        onClick: null,
      })
    }
    const buttons = []
    const angleSize = 360 / actions.length
    for (let i = 0; i < actions.length; i++) {
      const action = actions[i]
      const button = {}
      button.label = action.label
      button.icon = action.icon
      button.disabled = action.disabled
      button.onClick = action.onClick
      button.startDegree = i * angleSize
      button.endDegree = button.startDegree + angleSize
      buttons.push(button)
    }
    return buttons
  }, [actions])

  useLayoutEffect(() => {
    const svg = svgRef.current
    requestAnimationFrame(() => {
      svg.style.transform = 'scale(1) rotate(0deg)'
      svg.style.opacity = 1
    })
  }, [])

  let offsetDegree = -90 // buttons start from polar right so we adjust to top
  offsetDegree -= 360 / buttons.length / 2 // make the first button centered at top

  return (
    <svg
      ref={svgRef}
      width={size}
      height={size}
      css={css`
        transition: all 0.1s ease-out;
        transform: scale(0.5);
        opacity: 0;
        .radial-button {
          pointer-events: auto;
          transform-origin: 50%;
          transition: transform 0.1s ease-out;
          color: white;
          &.disabled {
            color: #8f8f8f;
          }
          &:hover:not(.disabled) {
            cursor: pointer;
            transform: scale(${hoverScale});
          }
        }
      `}
      onContextMenu={e => e.preventDefault()}
    >
      {buttons.map((button, index) => (
        <RadialButton
          key={index}
          centerX={centerX}
          centerY={centerY}
          innerRadius={innerRadius}
          outerRadius={outerRadius}
          startDegree={button.startDegree}
          endDegree={button.endDegree}
          offsetDegree={offsetDegree}
          gapAngle={gapAngle}
          label={button.label}
          icon={button.icon}
          disabled={button.disabled}
          onClick={button.onClick}
        />
      ))}
    </svg>
  )
}

const RadialButton = ({
  centerX,
  centerY,
  startDegree,
  endDegree,
  offsetDegree,
  innerRadius,
  outerRadius,
  gapAngle,
  label,
  icon: Icon,
  disabled,
  onClick,
}) => {
  // shape
  const outerGapAngle = gapAngle * (innerRadius / outerRadius)
  const adjustedStartDegreeInner = startDegree + offsetDegree + gapAngle / 2
  const adjustedEndDegreeInner = endDegree + offsetDegree - gapAngle / 2
  const adjustedStartDegreeOuter =
    startDegree + offsetDegree + outerGapAngle / 2
  const adjustedEndDegreeOuter = endDegree + offsetDegree - outerGapAngle / 2
  const startXInner = centerX + innerRadius * Math.cos(adjustedStartDegreeInner * (Math.PI / 180)) // prettier-ignore
  const startYInner = centerY + innerRadius * Math.sin(adjustedStartDegreeInner * (Math.PI / 180)) // prettier-ignore
  const endXInner = centerX + innerRadius * Math.cos(adjustedEndDegreeInner * (Math.PI / 180)) // prettier-ignore
  const endYInner = centerY + innerRadius * Math.sin(adjustedEndDegreeInner * (Math.PI / 180)) // prettier-ignore
  const startXOuter = centerX + outerRadius * Math.cos(adjustedStartDegreeOuter * (Math.PI / 180)) // prettier-ignore
  const startYOuter = centerY + outerRadius * Math.sin(adjustedStartDegreeOuter * (Math.PI / 180)) // prettier-ignore
  const endXOuter = centerX + outerRadius * Math.cos(adjustedEndDegreeOuter * (Math.PI / 180)) // prettier-ignore
  const endYOuter = centerY + outerRadius * Math.sin(adjustedEndDegreeOuter * (Math.PI / 180)) // prettier-ignore
  const largeArcFlagInner = adjustedEndDegreeInner - adjustedStartDegreeInner <= 180 ? '0' : '1' // prettier-ignore
  const largeArcFlagOuter = adjustedEndDegreeOuter - adjustedStartDegreeOuter <= 180 ? '0' : '1' // prettier-ignore
  const pathData = `
    M ${startXInner} ${startYInner}
    A ${innerRadius} ${innerRadius} 0 ${largeArcFlagInner} 1 ${endXInner} ${endYInner}
    L ${endXOuter} ${endYOuter}
    A ${outerRadius} ${outerRadius} 0 ${largeArcFlagOuter} 0 ${startXOuter} ${startYOuter}
    Z
  `

  // icon + text
  const adjustedStartDegree = startDegree + offsetDegree + gapAngle / 2
  const adjustedEndDegree = endDegree + offsetDegree - gapAngle / 2
  const midpointDegree = (adjustedStartDegree + adjustedEndDegree) / 2
  const verticalRadius = outerRadius - innerRadius
  const angularWidth = adjustedEndDegree - adjustedStartDegree
  const horizontalRadius = ((outerRadius + innerRadius) / 2) * Math.tan(((angularWidth / 2) * Math.PI) / 180) // prettier-ignore
  const squareSize = Math.min(verticalRadius, horizontalRadius * 2)
  const squareCenterRadius = (outerRadius + innerRadius) / 2
  const squareX = centerX + squareCenterRadius * Math.cos(midpointDegree * (Math.PI / 180)) // prettier-ignore
  const squareY = centerY + squareCenterRadius * Math.sin(midpointDegree * (Math.PI / 180)) // prettier-ignore
  const iconSize = 24
  const textSize = 14
  const gapSize = 8

  const click = () => {
    if (disabled) return
    onClick()
  }

  return (
    <g className={cls('radial-button', { disabled })} onClick={click}>
      <path d={pathData} fill='rgba(0, 0, 0, 0.4)' />
      {Icon && (
        <Icon
          size={iconSize}
          x={squareX - iconSize / 2}
          y={squareY - iconSize / 2 - textSize / 2 - gapSize / 2}
          width={iconSize}
          height={iconSize}
          stroke='currentColor'
        />
      )}
      {label && (
        <text
          x={squareX}
          y={squareY + iconSize / 2 + gapSize / 2}
          fill='currentColor'
          textAnchor='middle'
          alignmentBaseline='central'
          fontSize={textSize}
        >
          {label}
        </text>
      )}
      {/* <rect
        x={squareX - squareSize / 2}
        y={squareY - squareSize / 2}
        width={squareSize}
        height={squareSize}
        fill='rgba(255, 255, 255, 0.3)' // Semi-transparent for visibility
      /> */}
    </g>
  )
}

function Panels({ verse }) {
  const update = useForceUpdate()
  useEffect(() => {
    return verse.panels.subscribe(update)
  }, [])
  const panel = verse.panels.panel
  if (!panel) return null
  return (
    <div
      className='panel'
      css={css`
        position: absolute;
        top: 360px;
        left: 360px;
        width: 300px;
        height: 400px;
        background: #16161c;
        border: 1px solid rgba(255, 255, 255, 0.03);
        border-radius: 10px;
        box-shadow: 0 10px 30px rgba(0, 0, 0, 0.5);
        color: white;
        .panel-bar {
          height: 40px;
          padding: 0 10px;
          border-bottom: 1px solid rgba(255, 255, 255, 0.03);
          display: flex;
          align-items: center;
        }
        .panel-bar-gap {
          flex: 1;
        }
        .panel-bar-close {
          &:hover {
            cursor: pointer;
          }
        }
      `}
    >
      <div className='panel-bar'>
        <div className='panel-bar-gap' />
        <div className='panel-bar-close' onClick={panel.close}>
          <XIcon size={20} />
        </div>
      </div>
      {panel.type === 'inspect-prototype' && (
        <div>
          <div>It's a prototype</div>
        </div>
      )}
      {panel.type === 'inspect-avatar' && (
        <div>
          <div>It's an avatar</div>
        </div>
      )}
      {panel.type === 'inspect-self' && (
        <div>
          <div>It's me</div>
        </div>
      )}
      {panel.type === 'edit' && <EditPanel panel={panel} />}
    </div>
  )
}

function EditPanel({ panel }) {
  const entity = panel.entity
  const [node, setNode] = useState(null)
  return (
    <div>
      <div>Edit</div>
      {entity.schema.nodes.map(node => (
        <div key={node.name} onClick={() => setNode(node)}>
          {node.name}
        </div>
      ))}
      {node?.type === 'script' && (
        <CodeEditor
          value={node.raw}
          onChange={raw => {
            node.raw = raw
            node.code = wrapRawCode(raw)
          }}
        />
      )}
    </div>
  )
}
