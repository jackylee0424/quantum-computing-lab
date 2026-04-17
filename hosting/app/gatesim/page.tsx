"use client"

import { useEffect, useRef, useState } from "react"
import * as THREE from "three"
import "./gatesim.css"
import { CPHASE_PROTOTYPE_MERMAID, CPHASE_PROTOTYPE_NOTES } from "../../lib/gatesim-cphase-prototype"
import { computeGateSimCircuit } from "../../lib/gatesim-circuit"
import { MermaidDiagram } from "../../components/mermaid-diagram"

// ── Complex number helpers ──────────────────────────────────────────────────
function C(re: number, im = 0) { return { re, im } }
function cAdd(a: { re: number; im: number }, b: { re: number; im: number }) { return { re: a.re + b.re, im: a.im + b.im } }
function cSub(a: { re: number; im: number }, b: { re: number; im: number }) { return { re: a.re - b.re, im: a.im - b.im } }
function cMul(a: { re: number; im: number }, b: { re: number; im: number }) { return { re: a.re * b.re - a.im * b.im, im: a.re * b.im + a.im * b.re } }
function cConj(a: { re: number; im: number }) { return { re: a.re, im: -a.im } }
function cScale(a: { re: number; im: number }, s: number) { return { re: a.re * s, im: a.im * s } }
function cAbs2(a: { re: number; im: number }) { return a.re * a.re + a.im * a.im }
function cExpI(phi: number) { return { re: Math.cos(phi), im: Math.sin(phi) } }

function kron2(
  a0: { re: number; im: number }, a1: { re: number; im: number },
  b0: { re: number; im: number }, b1: { re: number; im: number }
) {
  return [cMul(a0, b0), cMul(a0, b1), cMul(a1, b0), cMul(a1, b1)]
}

function applyHOnQ0(st: { re: number; im: number }[]) {
  const inv = 1 / Math.sqrt(2)
  const [a00, a01, a10, a11] = st
  return [
    cScale(cAdd(a00, a10), inv),
    cScale(cAdd(a01, a11), inv),
    cScale(cSub(a00, a10), inv),
    cScale(cSub(a01, a11), inv),
  ]
}

function applyControlledPhase(st: { re: number; im: number }[], lambda: number) {
  const out = st.slice()
  out[3] = cMul(out[3], cExpI(lambda))
  return out
}

function applyPhaseOnQ0(st: { re: number; im: number }[], phi: number) {
  const out = st.slice()
  const phase = cExpI(phi)
  out[2] = cMul(out[2], phase)
  out[3] = cMul(out[3], phase)
  return out
}

function reducedBlochVectors(st: { re: number; im: number }[]) {
  const [a00, a01, a10, a11] = st

  const rho0_00 = cAbs2(a00) + cAbs2(a01)
  const rho0_11 = cAbs2(a10) + cAbs2(a11)
  const rho0_01 = cAdd(cMul(a00, cConj(a10)), cMul(a01, cConj(a11)))

  const rho1_00 = cAbs2(a00) + cAbs2(a10)
  const rho1_11 = cAbs2(a01) + cAbs2(a11)
  const rho1_01 = cAdd(cMul(a00, cConj(a01)), cMul(a10, cConj(a11)))

  const r0 = new THREE.Vector3(2 * rho0_01.re, rho0_00 - rho0_11, -2 * rho0_01.im)
  const r1 = new THREE.Vector3(2 * rho1_01.re, rho1_00 - rho1_11, -2 * rho1_01.im)
  return { r0, r1 }
}

function clamp(x: number, a: number, b: number) { return Math.max(a, Math.min(b, x)) }


const UNKNOWN_STATE_KET = "|ψ⟩"
const FIRST_QUBIT_ZERO_KET = "|0⟩"
const FIRST_QUBIT_ONE_KET = "|1⟩"
const SECOND_QUBIT_MINUS_KET = "|0⟩ - |1⟩"

type Q1PresetMode = "zero" | "one" | "minus" | "psi"

export default function GateSimPage() {
  const [isDiagramOpen, setIsDiagramOpen] = useState(false)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const fallbackRef = useRef<HTMLDivElement>(null)
  const headerRef = useRef<HTMLElement>(null)
  const statusRef = useRef<HTMLSpanElement>(null)
  const fpsRef = useRef<HTMLSpanElement>(null)
  const phaseRef = useRef<HTMLInputElement>(null)
  const phaseValRef = useRef<HTMLSpanElement>(null)
  const phaseGateRef = useRef<HTMLInputElement>(null)
  const phaseGateValRef = useRef<HTMLSpanElement>(null)
  const outReadoutRef = useRef<HTMLSpanElement>(null)
  const measureQ0Ref = useRef<HTMLSpanElement>(null)
  const measureQ1Ref = useRef<HTMLSpanElement>(null)
  const hudRef = useRef<HTMLElement>(null)
  const hudToggleRef = useRef<HTMLButtonElement>(null)
  const spheresToggleRef = useRef<HTMLButtonElement>(null)
  const q1ToggleRef = useRef<HTMLButtonElement>(null)
  const q0StateToggleRef = useRef<HTMLButtonElement>(null)
  const q1StateCycleRef = useRef<HTMLButtonElement>(null)
  const cleanupRef = useRef<(() => void) | null>(null)

  useEffect(() => {
    const canvas = canvasRef.current!
    const fallbackEl = fallbackRef.current!
    const headerEl = headerRef.current
    const statusEl = statusRef.current!
    const fpsEl = fpsRef.current!
    const phaseEl = phaseRef.current!
    const phaseValEl = phaseValRef.current!
    const phaseGateEl = phaseGateRef.current!
    const phaseGateValEl = phaseGateValRef.current!
    const outReadoutEl = outReadoutRef.current!
    const measureQ0El = measureQ0Ref.current!
    const measureQ1El = measureQ1Ref.current!
    const hudEl = hudRef.current!
    const hudToggleBtn = hudToggleRef.current!
    const spheresToggleBtn = spheresToggleRef.current!
    const q1ToggleBtn = q1ToggleRef.current!
    const q0StateToggleBtn = q0StateToggleRef.current!
    const q1StateCycleBtn = q1StateCycleRef.current!

    let disposed = false
    let animFrameId = 0
    let fitFrameId = 0
    let cameraWasAdjusted = false
    const ac = new AbortController()
    const sig = ac.signal

    // ── Scene setup ─────────────────────────────────────────────────────────
    const scene = new THREE.Scene()
    scene.fog = new THREE.FogExp2(0x040714, 0.02)

    function showFallback(message: string) {
      if (!fallbackEl) return
      fallbackEl.hidden = false
      const title = fallbackEl.querySelector("div > div") as HTMLElement
      const body = fallbackEl.querySelector("div > div + div") as HTMLElement
      if (title) title.textContent = "Nothing rendered"
      if (body) body.textContent = message || "Unknown failure."
    }

    function isElementVisible(el: HTMLElement | null | undefined) {
      if (!el || el.hidden) return false
      const rect = el.getBoundingClientRect()
      return rect.width > 0 && rect.height > 0
    }

    fallbackEl.hidden = false

    let renderer: THREE.WebGLRenderer | null = null
    try {
      renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: "high-performance" })
    } catch (err: any) {
      showFallback(`WebGLRenderer init failed: ${String(err?.message || err)}`)
    }

    if (renderer) {
      renderer.setPixelRatio(Math.min(devicePixelRatio, 2))
      renderer.setClearColor(0x000000, 0)
      if (THREE.SRGBColorSpace) renderer.outputColorSpace = THREE.SRGBColorSpace
    }

    const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100)

    // ── Orbit controls ──────────────────────────────────────────────────────
    const controls = {
      enabled: true,
      target: new THREE.Vector3(0, 0, 0),
      yaw: Math.PI / 2,
      pitch: 0.10,
      distance: 8.4,
      minDistance: 2.6,
      maxDistance: 40,
      _dragging: false,
      _lastX: 0,
      _lastY: 0,
      update() {
        const cp = Math.cos(this.pitch)
        const sp = Math.sin(this.pitch)
        const cy = Math.cos(this.yaw)
        const sy = Math.sin(this.yaw)
        const d = this.distance
        camera.position.set(
          this.target.x + d * cp * cy,
          this.target.y + d * sp,
          this.target.z + d * cp * sy
        )
        camera.lookAt(this.target)
      },
    }

    const _orbitPtrs = new Map<number, { x: number; y: number }>()
    let _orbitPrimaryId: number | null = null
    let _orbitPanMode = false
    let _orbitPrevMidX = 0, _orbitPrevMidY = 0
    let _orbitPrevPinchDist = 0

    function markCameraAdjusted() {
      cameraWasAdjusted = true
      cancelAnimationFrame(fitFrameId)
    }

    function _orbitMid() {
      let sx = 0, sy = 0
      for (const p of _orbitPtrs.values()) { sx += p.x; sy += p.y }
      const c = _orbitPtrs.size || 1
      return { x: sx / c, y: sy / c }
    }

    function _orbitApplyPan(dx: number, dy: number) {
      const rect = canvas.getBoundingClientRect()
      const fovY = camera.fov * Math.PI / 180
      const scale = (2 * Math.tan(fovY / 2) * controls.distance) / Math.max(1, rect.height)
      const fwd = camera.getWorldDirection(new THREE.Vector3())
      const right = new THREE.Vector3().crossVectors(fwd, camera.up).normalize()
      controls.target.addScaledVector(right, -dx * scale)
      controls.target.y -= dy * scale
    }

    function onPointerDown(e: PointerEvent) {
      if (!controls.enabled) return
      if (e.pointerType === "touch") e.preventDefault()
      _orbitPtrs.set(e.pointerId, { x: e.clientX, y: e.clientY })
      canvas.setPointerCapture(e.pointerId)
      _orbitPanMode = _orbitPtrs.size >= 2 || e.button === 1 || e.button === 2
      const m = _orbitMid()
      controls._dragging = true
      if (_orbitPrimaryId == null) _orbitPrimaryId = e.pointerId
      if (_orbitPtrs.size === 1) _orbitPrimaryId = e.pointerId
      controls._lastX = e.clientX
      controls._lastY = e.clientY
      _orbitPrevMidX = m.x
      _orbitPrevMidY = m.y
      if (_orbitPtrs.size === 2) {
        const pts = Array.from(_orbitPtrs.values())
        _orbitPrevPinchDist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y)
      }
    }

    function onPointerMove(e: PointerEvent) {
      if (!controls.enabled || !controls._dragging) return
      if (!_orbitPtrs.has(e.pointerId)) return
      if (e.pointerType === "touch") e.preventDefault()
      _orbitPtrs.set(e.pointerId, { x: e.clientX, y: e.clientY })
      const isPan = _orbitPanMode || _orbitPtrs.size >= 2
      if (isPan) {
        const m = _orbitMid()
        const dx = m.x - _orbitPrevMidX
        const dy = _orbitPrevMidY - m.y
        if (Math.abs(dx) > 0.01 || Math.abs(dy) > 0.01) markCameraAdjusted()
        _orbitApplyPan(m.x - _orbitPrevMidX, _orbitPrevMidY - m.y)
        _orbitPrevMidX = m.x
        _orbitPrevMidY = m.y
        if (_orbitPtrs.size >= 2) {
          const pts = Array.from(_orbitPtrs.values())
          const d = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y)
          if (_orbitPrevPinchDist > 0 && d > 0) {
            const factor = _orbitPrevPinchDist / d
            if (Math.abs(factor - 1) > 0.0005) markCameraAdjusted()
            controls.distance = clamp(controls.distance * factor, controls.minDistance, controls.maxDistance)
          }
          _orbitPrevPinchDist = d
        }
      } else {
        if (_orbitPrimaryId != null && e.pointerId !== _orbitPrimaryId) return
        const dx = e.clientX - controls._lastX
        const dy = e.clientY - controls._lastY
        controls._lastX = e.clientX
        controls._lastY = e.clientY
        if (Math.abs(dx) > 0.01 || Math.abs(dy) > 0.01) markCameraAdjusted()
        controls.yaw -= dx * 0.007
        controls.pitch -= dy * 0.007
        controls.yaw = clamp(controls.yaw, 0.05, Math.PI - 0.05)
        controls.pitch = clamp(controls.pitch, -1.35, 1.35)
      }
    }

    function endOrbitDrag(e: PointerEvent) {
      _orbitPtrs.delete(e.pointerId)
      if (_orbitPtrs.size < 2) { _orbitPanMode = false; _orbitPrevPinchDist = 0 }
      if (_orbitPtrs.size === 1) {
        const [id, p] = _orbitPtrs.entries().next().value as [number, { x: number; y: number }]
        _orbitPrimaryId = id
        controls._lastX = p.x
        controls._lastY = p.y
      }
      if (_orbitPtrs.size === 0) { controls._dragging = false; _orbitPrimaryId = null }
      try { canvas.releasePointerCapture(e.pointerId) } catch { /* ignore */ }
    }

    function onWheel(e: WheelEvent) {
      if (!controls.enabled) return
      e.preventDefault()
      markCameraAdjusted()
      const scale = Math.exp(e.deltaY * 0.0012)
      controls.distance = clamp(controls.distance * scale, controls.minDistance, controls.maxDistance)
    }

    canvas.addEventListener("pointerdown", onPointerDown, { signal: sig })
    canvas.addEventListener("pointermove", onPointerMove, { passive: false, signal: sig })
    canvas.addEventListener("pointerup", endOrbitDrag, { signal: sig })
    canvas.addEventListener("pointercancel", endOrbitDrag, { signal: sig })
    canvas.addEventListener("contextmenu", (e) => e.preventDefault(), { signal: sig })
    canvas.addEventListener("wheel", onWheel, { passive: false, signal: sig })

    controls.update()

    // ── Lights ───────────────────────────────────────────────────────────────
    scene.add(new THREE.AmbientLight(0x9fb3ff, 0.28))
    const keyLight = new THREE.DirectionalLight(0x9ffcff, 0.85)
    keyLight.position.set(4, 6, 3)
    scene.add(keyLight)
    const rimLight = new THREE.DirectionalLight(0xffa2ff, 0.45)
    rimLight.position.set(-6, 3, -4)
    scene.add(rimLight)

    // ── Palette ─────────────────────────────────────────────────────────────
    const colPrimary = new THREE.Color().setHSL(217 / 360, 0.9, 0.60)
    const colAccent = new THREE.Color().setHSL(187 / 360, 1.0, 0.50)
    const colAccent2 = new THREE.Color().setHSL(290 / 360, 1.0, 0.70)
    const colPurple = new THREE.Color(0xa78bfa)

    // ── Starfield ───────────────────────────────────────────────────────────
    {
      const count = 1500
      const geo = new THREE.BufferGeometry()
      const pos = new Float32Array(count * 3)
      for (let i = 0; i < count; i++) {
        const r = 18 * Math.pow(Math.random(), 0.35)
        const t = Math.random() * Math.PI * 2
        const u = Math.acos(THREE.MathUtils.lerp(-1, 1, Math.random()))
        pos[i * 3] = r * Math.sin(u) * Math.cos(t)
        pos[i * 3 + 1] = r * Math.cos(u)
        pos[i * 3 + 2] = r * Math.sin(u) * Math.sin(t)
      }
      geo.setAttribute("position", new THREE.BufferAttribute(pos, 3))
      const mat = new THREE.PointsMaterial({ size: 0.03, color: 0x9fb3ff, transparent: true, opacity: 0.55, depthWrite: false })
      scene.add(new THREE.Points(geo, mat))
    }

    // ── Helpers ──────────────────────────────────────────────────────────────
    function makeGlowMaterial(color: THREE.Color, opacity = 0.35) {
      return new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false })
    }

    function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
      const rr = Math.min(r, w / 2, h / 2)
      ctx.beginPath()
      ctx.moveTo(x + rr, y)
      ctx.arcTo(x + w, y, x + w, y + h, rr)
      ctx.arcTo(x + w, y + h, x, y + h, rr)
      ctx.arcTo(x, y + h, x, y, rr)
      ctx.arcTo(x, y, x + w, y, rr)
      ctx.closePath()
    }

    // ── Dynamic text sprite ─────────────────────────────────────────────────
    function makeDynamicTextSprite(text: string, opts: {
      color?: string; bg?: string; font?: string; border?: string; spriteH?: number; padX?: number
    } = {}) {
      const { color = "#ffffff", bg = "rgba(0,0,0,0.35)", font = "600 12px Inter, system-ui, sans-serif", border = "rgba(148,163,184,0.25)", spriteH = 28, padX = 10 } = opts
      const lineH = spriteH
      const c = document.createElement("canvas")
      const ctx = c.getContext("2d")!
      const mat = new THREE.SpriteMaterial({ transparent: true, depthWrite: false, depthTest: false })
      const sprite = new THREE.Sprite(mat)
      sprite.renderOrder = 10

      function draw(str: string) {
        const lines = str.split("\n")
        const numLines = lines.length
        const h = lineH * numLines
        ctx.setTransform(1, 0, 0, 1, 0, 0)
        ctx.font = font
        let maxW = 20
        for (const ln of lines) {
          const mw = Math.ceil(ctx.measureText(ln).width + padX * 2)
          if (mw > maxW) maxW = mw
        }
        const w = maxW
        c.width = w * 2
        c.height = h * 2
        ctx.scale(2, 2)
        ctx.font = font
        ctx.clearRect(0, 0, w, h)
        ctx.fillStyle = bg
        roundRect(ctx, 0.5, 0.5, w - 1, h - 1, 10)
        ctx.fill()
        ctx.strokeStyle = border
        ctx.stroke()
        ctx.fillStyle = color
        ctx.textBaseline = "middle"
        lines.forEach((ln, i) => { ctx.fillText(ln, padX, lineH * (i + 0.5)) })
        const nextTex = new THREE.CanvasTexture(c)
        nextTex.minFilter = THREE.LinearFilter
        nextTex.magFilter = THREE.LinearFilter
        nextTex.generateMipmaps = false
        if (mat.map) mat.map.dispose()
        mat.map = nextTex
        mat.needsUpdate = true
        nextTex.needsUpdate = true
        sprite.scale.set(w / 105, h / 105, 1)
      }

      draw(text)
      return { sprite, setText: (t: string) => draw(t) }
    }

    function makeTextSprite(text: string, opts: any = {}) {
      const { sprite } = makeDynamicTextSprite(text, { font: "600 13px Inter, system-ui, sans-serif", ...opts })
      return sprite
    }

    function makeAnnotationSprite(text: string) {
      return makeTextSprite(text, {
        color: "#94a3b8", bg: "rgba(2,6,23,0.00)", font: "500 11px Inter, system-ui, sans-serif",
        border: "rgba(0,0,0,0)", spriteH: 22, padX: 6,
      })
    }

    function makeCircuitSprite(text: string) {
      return makeTextSprite(text, {
        color: "#e2e8f0", bg: "rgba(4,10,32,0.58)", font: "600 22px Inter, system-ui, sans-serif",
        border: "rgba(167,139,250,0.75)", spriteH: 51, padX: 19,
      })
    }

    function makeGateToggleSprite(gateKey: string, isOn = true) {
      const c = document.createElement("canvas")
      const ctx = c.getContext("2d")!
      const mat = new THREE.SpriteMaterial({ transparent: true, depthWrite: false, depthTest: false })
      const sprite = new THREE.Sprite(mat)
      sprite.renderOrder = 12
      sprite.userData.isGateToggle = true
      sprite.userData.gateKey = gateKey

      function draw(on: boolean) {
        const text = on ? "ON" : "OFF"
        const palette = on
          ? { fg: "#dcfce7", bg: "rgba(22,163,74,0.30)", border: "rgba(74,222,128,0.88)" }
          : { fg: "#fee2e2", bg: "rgba(220,38,38,0.30)", border: "rgba(248,113,113,0.88)" }
        const font = "700 11px Inter, system-ui, sans-serif"
        const padX = 12
        const h = 28
        ctx.setTransform(1, 0, 0, 1, 0, 0)
        ctx.font = font
        const w = Math.max(44, Math.ceil(ctx.measureText(text).width + padX * 2))
        c.width = w * 2
        c.height = h * 2
        ctx.scale(2, 2)
        ctx.font = font
        ctx.clearRect(0, 0, w, h)
        roundRect(ctx, 0.5, 0.5, w - 1, h - 1, 999)
        ctx.fillStyle = palette.bg
        ctx.fill()
        ctx.lineWidth = 1.5
        ctx.strokeStyle = palette.border
        ctx.stroke()
        ctx.fillStyle = palette.fg
        ctx.textAlign = "center"
        ctx.textBaseline = "middle"
        ctx.fillText(text, w / 2, h / 2)
        const nextTex = new THREE.CanvasTexture(c)
        nextTex.minFilter = THREE.LinearFilter
        nextTex.magFilter = THREE.LinearFilter
        nextTex.generateMipmaps = false
        if (mat.map) mat.map.dispose()
        mat.map = nextTex
        mat.needsUpdate = true
        nextTex.needsUpdate = true
        sprite.scale.set(Math.max(0.58, w / 80), h / 80, 1)
      }

      draw(isOn)
      return { sprite, setOn: (on: boolean) => draw(on) }
    }

    // ── Bloch sphere factory ────────────────────────────────────────────────
    function createBlochSphere({ radius = 1, color = colPrimary, label = "q0", showHandle = true } = {}) {
      const group = new THREE.Group()

      const sphereGeo = new THREE.SphereGeometry(radius, 32, 18)
      const sphereMat = new THREE.MeshStandardMaterial({
        color: new THREE.Color(0x0b1220),
        emissive: new THREE.Color(0x0b1220).multiplyScalar(0.35),
        metalness: 0.08, roughness: 0.55, transparent: true, opacity: 0.38,
      })
      group.add(new THREE.Mesh(sphereGeo, sphereMat))

      const wire = new THREE.LineSegments(
        new THREE.WireframeGeometry(new THREE.SphereGeometry(radius, 18, 12)),
        new THREE.LineBasicMaterial({ color: color.clone().multiplyScalar(0.95), transparent: true, opacity: 0.60 })
      )
      group.add(wire)

      const ringGeo = new THREE.RingGeometry(radius * 0.995, radius * 1.005, 128)
      const ringMat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.35, side: THREE.DoubleSide })
      const ring = new THREE.Mesh(ringGeo, ringMat)
      ring.rotation.x = Math.PI / 2
      group.add(ring)

      // Axes
      const axisMat = new THREE.LineBasicMaterial({ color: 0x334155, transparent: true, opacity: 0.9 })
      const axisLen = radius * 1.25
      const axisGeo = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(-axisLen, 0, 0), new THREE.Vector3(axisLen, 0, 0),
        new THREE.Vector3(0, -axisLen, 0), new THREE.Vector3(0, axisLen, 0),
        new THREE.Vector3(0, 0, -axisLen), new THREE.Vector3(0, 0, axisLen),
      ])
      const axes = new THREE.Group()
      axes.add(new THREE.LineSegments(axisGeo, axisMat))

      const yLab = makeTextSprite("+Y", { color: "#cbd5e1", bg: "rgba(2,6,23,0.00)", border: "rgba(0,0,0,0)" })
      const zLab = makeTextSprite("+Z", { color: "#cbd5e1", bg: "rgba(2,6,23,0.00)", border: "rgba(0,0,0,0)" })
      const xLab = makeTextSprite("+X", { color: "#cbd5e1", bg: "rgba(2,6,23,0.00)", border: "rgba(0,0,0,0)" })
      yLab.position.set(axisLen * 1.02, 0, 0)
      zLab.position.set(0, axisLen * 1.06, 0)
      xLab.position.set(0, 0, axisLen * 1.02)
      axes.add(xLab, yLab, zLab)
      group.add(axes)

      // Arrow
      const arrow = new THREE.Group()
      const arrowBody = new THREE.Group()
      const shaftGeo = new THREE.CylinderGeometry(radius * 0.038, radius * 0.038, radius * 0.90, 14)
      const headGeo = new THREE.ConeGeometry(radius * 0.10, radius * 0.28, 16)
      const arrowMat = new THREE.MeshStandardMaterial({
        color, metalness: 0.15, roughness: 0.15,
        emissive: color.clone().multiplyScalar(0.85), depthTest: false,
      })
      const shaft = new THREE.Mesh(shaftGeo, arrowMat)
      const head = new THREE.Mesh(headGeo, arrowMat)
      shaft.renderOrder = 5
      head.renderOrder = 5
      shaft.position.y = radius * 0.45
      head.position.y = radius * 0.94
      arrowBody.add(shaft, head)

      let handle: THREE.Mesh | null = null
      let handleMat: THREE.MeshStandardMaterial | null = null
      if (showHandle) {
        const handleGeo = new THREE.SphereGeometry(radius * 0.12, 18, 14)
        handleMat = new THREE.MeshStandardMaterial({
          color, emissive: color.clone().multiplyScalar(0.45), metalness: 0.15, roughness: 0.15,
        })
        handle = new THREE.Mesh(handleGeo, handleMat)
        handle.position.y = radius * 1.08
        handle.userData.isHandle = true
        arrow.add(handle)
      }

      const glow = new THREE.Mesh(new THREE.SphereGeometry(radius * 1.05, 22, 16), makeGlowMaterial(color, 0.18))
      arrowBody.add(glow)
      arrowBody.renderOrder = 4
      arrow.add(arrowBody)
      group.add(arrow)

      const params = makeDynamicTextSprite("…", { color: "#e2e8f0", bg: "rgba(2,6,23,0.35)", font: "600 10px Inter, system-ui, sans-serif" })
      params.sprite.position.set(0, radius * 1.78, 0)
      group.add(params.sprite)

      const state = { theta: Math.PI / 2, phi: 0, len: 1 }

      function setState(theta: number, phi: number, len = 1) {
        state.theta = theta
        state.phi = phi
        state.len = len
        const dir = new THREE.Vector3(Math.sin(theta) * Math.cos(phi), Math.cos(theta), Math.sin(theta) * Math.sin(phi)).normalize()
        const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir)
        arrow.quaternion.copy(q)
        const l = clamp(len, 0, 1)
        arrowBody.scale.setScalar(Math.max(0.03, l))
        const deg = (x: number) => x * 180 / Math.PI
        const p0 = Math.cos(theta / 2) ** 2
        const p1 = 1 - p0
        const phiWrap = ((phi % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI)
        params.setText(`|r|=${l.toFixed(2)}  θ=${deg(theta).toFixed(0)}°  φ=${deg(phiWrap).toFixed(0)}°\nP(|0⟩)=${p0.toFixed(2)}  P(|1⟩)=${p1.toFixed(2)}`)
        const phase = (phi % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI)
        const t = phase / (2 * Math.PI)
        const phaseColor = colAccent.clone().lerp(colAccent2, t)
        ring.material.color.copy(phaseColor)
        ring.material.opacity = 0.22 + 0.18 * Math.sin(phase * 1.2 + 0.4) ** 2
      }

      function setBlochVector(vec: THREE.Vector3) {
        const v = vec.clone()
        const len = v.length()
        const l = clamp(len, 0, 1)
        let dir: THREE.Vector3
        if (len < 1e-8) dir = new THREE.Vector3(0, 1, 0)
        else dir = v.clone().multiplyScalar(1 / len)
        const theta = Math.acos(THREE.MathUtils.clamp(dir.y, -1, 1))
        const phi = Math.atan2(dir.z, dir.x)
        state.theta = theta
        state.phi = phi
        state.len = l
        const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir)
        arrow.quaternion.copy(q)
        arrowBody.scale.setScalar(Math.max(0.03, l))
        const p0 = clamp((1 + v.y) / 2, 0, 1)
        const p1 = 1 - p0
        const deg = (x: number) => x * 180 / Math.PI
        const phiWrap = ((phi % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI)
        params.setText(`|r|=${l.toFixed(2)}  θ=${deg(theta).toFixed(0)}°  φ=${deg(phiWrap).toFixed(0)}°\nP(|0⟩)=${p0.toFixed(2)}  P(|1⟩)=${p1.toFixed(2)}`)
        const phase = phiWrap
        const t = phase / (2 * Math.PI)
        const phaseColor = colAccent.clone().lerp(colAccent2, t)
        ring.material.color.copy(phaseColor)
        ring.material.opacity = 0.12 + 0.14 * Math.sin(phase * 1.2 + 0.4) ** 2
      }

      setState(state.theta, state.phi, state.len)

      return { group, setState, setBlochVector, getState: () => ({ ...state }), color, radius, handle, label, arrowMat, handleMat }
    }

    // ── Stage spheres ───────────────────────────────────────────────────────
    const stage = {
      q0: {
        s0: createBlochSphere({ radius: 0.62, color: colPrimary, label: "q0 S0", showHandle: false }),
        s1: createBlochSphere({ radius: 0.62, color: colPrimary, label: "q0 S1", showHandle: false }),
        s2: createBlochSphere({ radius: 0.62, color: colPrimary, label: "q0 S2", showHandle: false }),
        s3: createBlochSphere({ radius: 0.62, color: colPrimary, label: "q0 S3", showHandle: false }),
      },
      q1: {
        s0: createBlochSphere({ radius: 0.62, color: colPurple, label: "q1 S0", showHandle: true }),
        s1: createBlochSphere({ radius: 0.62, color: colAccent, label: "q1 S1", showHandle: false }),
        s2: createBlochSphere({ radius: 0.62, color: colAccent, label: "q1 S2", showHandle: false }),
        s3: createBlochSphere({ radius: 0.62, color: colAccent, label: "q1 S3", showHandle: false }),
      },
    }

    const phaseGateControl = createBlochSphere({ radius: 0.54, color: colAccent2, label: "q0 phase", showHandle: true })
    if (phaseGateControl.handle) phaseGateControl.handle.userData.handleKind = "phase"
    phaseGateControl.group.visible = false

    if (stage.q1.s0.handle) stage.q1.s0.handle.userData.handleKind = "q1"

    Object.values(stage.q0).forEach((s) => { scene.add(s.group); s.group.visible = false })
    Object.values(stage.q1).forEach((s) => { scene.add(s.group); s.group.visible = false })

    const CAMERA_DEFAULT = { yaw: Math.PI / 2, pitch: 0.10, distance: 8.4, target: new THREE.Vector3(0, 0, 0) }

    controls.enabled = true
    controls.yaw = CAMERA_DEFAULT.yaw
    controls.pitch = CAMERA_DEFAULT.pitch
    controls.distance = CAMERA_DEFAULT.distance
    controls.target.copy(CAMERA_DEFAULT.target)
    controls.update()

    // ── Circuit 3D ──────────────────────────────────────────────────────────
    const circuit3d = new THREE.Group()
    scene.add(circuit3d)

    function clearGroup(g: THREE.Group) {
      while (g.children.length) g.remove(g.children[g.children.length - 1])
    }

    function makeWireTube(a: THREE.Vector3, b: THREE.Vector3, radius = 0.022, color = 0x4f6d90, opacity = 0.85) {
      const dir = b.clone().sub(a)
      const len = dir.length()
      const geo = new THREE.CylinderGeometry(radius, radius, len, 8)
      const mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false })
      const mesh = new THREE.Mesh(geo, mat)
      mesh.position.copy(a.clone().add(b).multiplyScalar(0.5))
      if (len > 1e-8) mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.clone().normalize())
      return mesh
    }

    // ── Mutable state ───────────────────────────────────────────────────────
    let stageMarkerMeshes: THREE.Mesh[] = []
    const _sphereVisKeys = ["q0_s0", "q0_s1", "q0_s2", "q0_s3", "q1_s0", "q1_s1", "q1_s2", "q1_s3"]
    const sphereVis: Record<string, boolean> = Object.fromEntries(_sphereVisKeys.map((k) => [k, false]))
    let in0Sprite: THREE.Sprite | null = null
    let inxSprite: THREE.Sprite | null = null
    const measurePhotons: any[] = []
    let photonHoldTimer: ReturnType<typeof setTimeout> | null = null
    let photonIsHolding = false
    let photonHoldStartTime = 0
    const shotCounts_q0 = [0, 0]
    const shotCounts_q1 = [0, 0]
    let shotsDyn_q0: ReturnType<typeof makeDynamicTextSprite> | null = null
    let shotsDyn_q1: ReturnType<typeof makeDynamicTextSprite> | null = null
    let shotAutoResetTimer: ReturnType<typeof setTimeout> | null = null
    let circWireY_q0 = 0
    let circCPhaseX = 0
    let circCPhaseX_set = false
    let cphaseConnMat: THREE.MeshBasicMaterial | null = null
    let cphaseDotMat: THREE.MeshBasicMaterial | null = null
    const gateEnabled: Record<string, boolean> = { h1: false, cphase: false, phase: false, h2: false }
    const gateVisuals: any = {
      h1: { symbol: null, toggle: null },
      phase: { symbol: null, toggle: null },
      cphase: {
        symbol: null,
        toggle: null,
        connector: null,
        dots: [],
        kickPaths: [],
        topDot: null,
        bottomDot: null,
        topKickPath: null,
        bottomKickPath: null,
      },
      h2: { symbol: null, toggle: null },
    }
    let circInX_q0 = 0
    let circOutX_q0 = 0
    let circWireY_q1 = 0
    let circInX_q1 = 0
    let circOutX_q1 = 0
    let currentP0_q0 = 0.5
    let currentP0_q1 = 0.5
    let tPrevAnim = 0
    const stageProbs_q0 = [1.0, 0.5, 0.5, 0.5]
    const stageProbs_q1 = [0.5, 0.5, 0.5, 0.5]
    let circStageXs: number[] = []
    let q1CircuitVisible = false
    let q1LaneObjects: THREE.Object3D[] = []
    const _photonCyan = new THREE.Color(0x00e5ff)
    const _photonPink = new THREE.Color(0xff3399)
    const pinState = { pinned: false }
    const pinnedQ1Color = new THREE.Color(0xff2244)
    const q1PresetCycleOrder: Q1PresetMode[] = ["zero", "one", "minus", "psi"]

    let q0InitialBit: 0 | 1 = 0
    const inputX = { theta: Math.PI, phi: 0 }
    const freePsiState = { theta: Math.PI, phi: 0 }
    let q1PresetMode: Q1PresetMode = "psi"
    let lambda = Math.PI
    let phaseGatePhi = 0

    const sweep = { active: true, pauseUntil: 0, PAUSE_MS: 2200 }

    function pauseSweep() {
      sweep.pauseUntil = pinState.pinned ? Infinity : performance.now() + sweep.PAUSE_MS
    }

    function q0InitialLabel() {
      return q0InitialBit === 0 ? FIRST_QUBIT_ZERO_KET : FIRST_QUBIT_ONE_KET
    }

    function q1PresetLabel(mode = q1PresetMode) {
      if (mode === "zero") return FIRST_QUBIT_ZERO_KET
      if (mode === "one") return FIRST_QUBIT_ONE_KET
      if (mode === "minus") return SECOND_QUBIT_MINUS_KET
      return UNKNOWN_STATE_KET
    }

    function q1PresetAngles(mode: Q1PresetMode) {
      if (mode === "zero") return { theta: 0, phi: 0 }
      if (mode === "one") return { theta: Math.PI, phi: 0 }
      if (mode === "minus") return { theta: Math.PI / 2, phi: Math.PI }
      return null
    }

    function updateInitialStateToggleLabels() {
      if (q0StateToggleBtn) {
        q0StateToggleBtn.textContent = `q0 ${q0InitialLabel()}`
        q0StateToggleBtn.setAttribute("aria-pressed", String(q0InitialBit === 1))
      }
      if (q1StateCycleBtn) {
        q1StateCycleBtn.textContent = `ψ ${q1PresetLabel()}`
        q1StateCycleBtn.setAttribute("aria-label", `Second qubit preset ${q1PresetLabel()}`)
      }
    }

    function setInputX(theta: number, phi: number) {
      inputX.theta = theta
      inputX.phi = phi
      stage.q1.s0.setState(theta, phi, 1)
      recomputeCircuit()
    }

    function setQ0InitialBit(nextBit: 0 | 1, announce = true) {
      q0InitialBit = nextBit
      buildCircuit3DLayout()
      recomputeCircuit()
      updateInitialStateToggleLabels()
      if (announce) setStatus(`First qubit initialized to ${q0InitialLabel()}.`)
    }

    function setQ1PresetMode(nextMode: Q1PresetMode, announce = true) {
      if (nextMode !== "psi" && q1PresetMode === "psi") {
        freePsiState.theta = inputX.theta
        freePsiState.phi = inputX.phi
      }

      q1PresetMode = nextMode
      const preset = q1PresetAngles(nextMode)
      if (preset) setInputX(preset.theta, preset.phi)
      else setInputX(freePsiState.theta, freePsiState.phi)

      updateInitialStateToggleLabels()
      if (announce) setStatus(`Second qubit initialized to ${q1PresetLabel()}.`)
    }

    function setLambdaDeg(deg: number) {
      const d = ((deg % 360) + 360) % 360
      lambda = d * Math.PI / 180
      if (phaseValEl) phaseValEl.textContent = `${d.toFixed(0)}°`
      recomputeCircuit()
    }

    function setPhaseGateDeg(deg: number) {
      const d = ((deg % 360) + 360) % 360
      phaseGatePhi = d * Math.PI / 180
      if (phaseGateValEl) phaseGateValEl.textContent = `${d.toFixed(0)}°`
      phaseGateControl.setState(Math.PI / 2, phaseGatePhi, 1)
      recomputeCircuit()
    }

    function recomputeCircuit() {
      const result = computeGateSimCircuit({
        q0InitialBit,
        q1State: { theta: inputX.theta, phi: inputX.phi },
        q1CircuitVisible,
        gateEnabled: {
          h1: gateEnabled.h1,
          cphase: gateEnabled.cphase,
          phase: gateEnabled.phase,
          h2: gateEnabled.h2,
        },
        lambdaDeg: lambda * 180 / Math.PI,
        phaseGateDeg: phaseGatePhi * 180 / Math.PI,
      })

      const [bS0q0, bS1q0, bS2q0, bS3q0] = result.blochVectors.q0
      const [, bS1q1, bS2q1, bS3q1] = result.blochVectors.q1

      stage.q0.s0.setBlochVector(new THREE.Vector3(bS0q0.x, bS0q0.y, bS0q0.z))
      stage.q0.s1.setBlochVector(new THREE.Vector3(bS1q0.x, bS1q0.y, bS1q0.z))
      stage.q0.s2.setBlochVector(new THREE.Vector3(bS2q0.x, bS2q0.y, bS2q0.z))
      stage.q0.s3.setBlochVector(new THREE.Vector3(bS3q0.x, bS3q0.y, bS3q0.z))
      stage.q1.s1.setBlochVector(new THREE.Vector3(bS1q1.x, bS1q1.y, bS1q1.z))
      stage.q1.s2.setBlochVector(new THREE.Vector3(bS2q1.x, bS2q1.y, bS2q1.z))
      stage.q1.s3.setBlochVector(new THREE.Vector3(bS3q1.x, bS3q1.y, bS3q1.z))

      currentP0_q0 = result.q0Probabilities.p0
      if (outReadoutEl) outReadoutEl.textContent = `P(q0=0)=${result.q0Probabilities.p0.toFixed(3)}  P(q0=1)=${result.q0Probabilities.p1.toFixed(3)}`

      currentP0_q1 = result.q1Probabilities.p0

      stageProbs_q0[0] = result.stageProbabilities.q0[0]
      stageProbs_q0[1] = result.stageProbabilities.q0[1]
      stageProbs_q0[2] = result.stageProbabilities.q0[2]
      stageProbs_q0[3] = result.stageProbabilities.q0[3]
      stageProbs_q1[0] = result.stageProbabilities.q1[0]
      stageProbs_q1[1] = result.stageProbabilities.q1[1]
      stageProbs_q1[2] = result.stageProbabilities.q1[2]
      stageProbs_q1[3] = result.stageProbabilities.q1[3]
    }

    function layoutStagesCentered() {
      const dx = 2.35
      const dy = 2.05
      const xs = [-1.5 * dx, -0.5 * dx, 0.5 * dx, 1.5 * dx]
      const yTop = dy * 0.5
      const yBot = -dy * 0.5

      stage.q0.s0.group.position.set(xs[0], yTop, 0)
      stage.q0.s1.group.position.set(xs[1], yTop, 0)
      stage.q0.s2.group.position.set(xs[2], yTop, 0)
      stage.q0.s3.group.position.set(xs[3], yTop, 0)
      stage.q1.s0.group.position.set(xs[0], yBot, 0)
      stage.q1.s1.group.position.set(xs[1], yBot, 0)
      stage.q1.s2.group.position.set(xs[2], yBot, 0)
      stage.q1.s3.group.position.set(xs[3], yBot, 0)

      return { xs, yTop, yBot }
    }

    function isSecondQubitKey(key: string) {
      return key.startsWith("q1_")
    }

    function isLaneVisibleForKey(key: string) {
      return !isSecondQubitKey(key) || q1CircuitVisible
    }

    function updateSecondQubitToggleLabel() {
      if (!q1ToggleBtn) return
      q1ToggleBtn.textContent = q1CircuitVisible ? `Hide ${UNKNOWN_STATE_KET}` : `Show ${UNKNOWN_STATE_KET}`
      q1ToggleBtn.setAttribute("aria-pressed", String(q1CircuitVisible))
    }

    function updateSpheresToggleLabel() {
      const anyVisible = _sphereVisKeys.some((k) => sphereVis[k] && isLaneVisibleForKey(k))
      if (spheresToggleBtn) spheresToggleBtn.textContent = anyVisible ? "Hide spheres" : "Show spheres"
    }

    function syncGateVisuals() {
      if (gateVisuals.h1.symbol) gateVisuals.h1.symbol.visible = gateEnabled.h1
      if (gateVisuals.phase.symbol) gateVisuals.phase.symbol.visible = gateEnabled.phase
      phaseGateControl.group.visible = gateEnabled.phase
      if (gateVisuals.h2.symbol) gateVisuals.h2.symbol.visible = gateEnabled.h2
      if (gateVisuals.h1.toggle) gateVisuals.h1.toggle.setOn(gateEnabled.h1)
      if (gateVisuals.phase.toggle) gateVisuals.phase.toggle.setOn(gateEnabled.phase)
      if (gateVisuals.h2.toggle) gateVisuals.h2.toggle.setOn(gateEnabled.h2)
      const cphaseVisible = gateEnabled.cphase && q1CircuitVisible
      if (gateVisuals.cphase.symbol) gateVisuals.cphase.symbol.visible = cphaseVisible
      if (gateVisuals.cphase.connector) gateVisuals.cphase.connector.visible = cphaseVisible
      if (gateVisuals.cphase.topDot) gateVisuals.cphase.topDot.visible = cphaseVisible && !gateEnabled.phase
      if (gateVisuals.cphase.bottomDot) gateVisuals.cphase.bottomDot.visible = cphaseVisible
      if (gateVisuals.cphase.topKickPath) gateVisuals.cphase.topKickPath.visible = cphaseVisible
      if (gateVisuals.cphase.bottomKickPath) gateVisuals.cphase.bottomKickPath.visible = cphaseVisible
      if (gateVisuals.cphase.toggle) {
        gateVisuals.cphase.toggle.setOn(cphaseVisible)
        gateVisuals.cphase.toggle.sprite.visible = q1CircuitVisible
      }
    }

    function gateLabel(key: string) {
      if (key === "h1") return "left H gate"
      if (key === "phase") return "phase gate"
      if (key === "h2") return "right H gate"
      return "CPhase gate"
    }

    function setGateEnabled(key: string, enabled: boolean) {
      if (!(key in gateEnabled)) return
      gateEnabled[key] = !!enabled
      pauseSweep()
      syncGateVisuals()
      recomputeCircuit()
      setStatus(`${gateLabel(key)} ${gateEnabled[key] ? "enabled." : "disabled — symbol hidden and effect bypassed."}`)
    }

    function setStatus(msg: string) { if (statusEl) statusEl.textContent = msg }

    function clearMeasurementPhotons(qubit: number) {
      for (let i = measurePhotons.length - 1; i >= 0; i--) {
        const photon = measurePhotons[i]
        if (photon.qubit !== qubit) continue
        scene.remove(photon.group)
        measurePhotons.splice(i, 1)
      }
    }

    function syncSecondQubitVisibility() {
      q1LaneObjects.forEach((obj) => { obj.visible = q1CircuitVisible })

      Object.entries(stage.q1).forEach(([stageKey, sphere]: [string, any]) => {
        const key = `q1_${stageKey}`
        sphere.group.visible = q1CircuitVisible && sphereVis[key]
      })

      for (const marker of stageMarkerMeshes) {
        const key = String(marker.userData.blochKey || "")
        marker.visible = !sphereVis[key] && isLaneVisibleForKey(key)
      }

      if (!q1CircuitVisible) {
        clearMeasurementPhotons(1)
        shotCounts_q1[0] = 0
        shotCounts_q1[1] = 0
      }

      syncGateVisuals()
      updateShotsDisplay(1)
      updateSpheresToggleLabel()
      updateInitialStateToggleLabels()
      updateSecondQubitToggleLabel()
    }

    function buildCircuit3DLayout() {
      clearGroup(circuit3d)
      q1LaneObjects = []
      const { xs, yTop, yBot } = layoutStagesCentered()
      const yMid = (yTop + yBot) / 2

      circStageXs = [xs[0], xs[1], xs[2], xs[3]]

      const q0Wire = makeWireTube(new THREE.Vector3(xs[0] - 1.4, yTop, 0), new THREE.Vector3(xs[3] + 1.4, yTop, 0), 0.022, 0x4f6d90, 0.85)
      const q1Wire = makeWireTube(new THREE.Vector3(xs[0] - 1.4, yBot, 0), new THREE.Vector3(xs[3] + 1.4, yBot, 0), 0.022, 0x4f6d90, 0.85)
      circuit3d.add(q0Wire, q1Wire)
      q1LaneObjects.push(q1Wire)

      const xH1 = (xs[0] + xs[1]) / 2
      const xCP = (xs[1] + xs[2]) / 2
      const xH2 = (xs[2] + xs[3]) / 2

      const in0 = makeCircuitSprite(q0InitialLabel())
      in0.position.set(xs[0] - 1.55, yTop, 0)
      const inx = makeCircuitSprite(UNKNOWN_STATE_KET)
      inx.position.set(xs[0] - 1.55, yBot, 0)
      const out0 = makeCircuitSprite("out")
      out0.position.set(xs[3] + 1.55, yTop, 0)
      const out1 = makeCircuitSprite("out")
      out1.position.set(xs[3] + 1.55, yBot, 0)
      circuit3d.add(in0, inx, out0, out1)
      q1LaneObjects.push(inx, out1)

      in0Sprite = in0
      in0.userData.isMeasureLabel = true
      inxSprite = inx
      inx.userData.isMeasureLabel = true
      circWireY_q0 = yTop
      circInX_q0 = xs[0] - 1.55
      circOutX_q0 = xs[3] + 1.55
      circWireY_q1 = yBot
      circInX_q1 = xs[0] - 1.55
      circOutX_q1 = xs[3] + 1.55

      const stageNames = ["S0", "S1", "S2", "S3"]
      for (let i = 0; i < 4; i++) {
        const s = makeTextSprite(stageNames[i], { color: "#94a3b8", bg: "rgba(2,6,23,0.20)" })
        s.position.set(xs[i], -1.9, 0)
        circuit3d.add(s)
      }

      const h1 = makeCircuitSprite("H")
      h1.position.set(xH1, yTop, 0)
      const phaseGate = makeTextSprite("P(φ)", {
        color: "#f5d0fe", bg: "rgba(88,28,135,0.42)", font: "700 14px Inter, system-ui, sans-serif",
        border: "rgba(217,70,239,0.72)", spriteH: 30, padX: 12,
      })
      phaseGate.position.set(xCP, yTop + 0.88, 0)
      const h2 = makeCircuitSprite("H")
      h2.position.set(xH2, yTop, 0)
      const cp = makeCircuitSprite("CPhase(λ)")
      cp.position.set(xCP, yMid, 0)
      circuit3d.add(h1, phaseGate, h2, cp)
      gateVisuals.h1.symbol = h1
      gateVisuals.phase.symbol = phaseGate
      gateVisuals.h2.symbol = h2
      gateVisuals.cphase.symbol = cp

      const h1Toggle = makeGateToggleSprite("h1", gateEnabled.h1)
      h1Toggle.sprite.position.set(xH1, yTop + 0.72, 0)
      const phaseToggle = makeGateToggleSprite("phase", gateEnabled.phase)
      phaseToggle.sprite.position.set(xCP, yTop + 1.55, 0)
      const h2Toggle = makeGateToggleSprite("h2", gateEnabled.h2)
      h2Toggle.sprite.position.set(xH2, yTop + 0.72, 0)
      const cpToggle = makeGateToggleSprite("cphase", gateEnabled.cphase)
      cpToggle.sprite.position.set(xCP + 1.6, yMid, 0)
      circuit3d.add(h1Toggle.sprite, phaseToggle.sprite, h2Toggle.sprite, cpToggle.sprite)
      gateVisuals.h1.toggle = h1Toggle
      gateVisuals.phase.toggle = phaseToggle
      gateVisuals.h2.toggle = h2Toggle
      gateVisuals.cphase.toggle = cpToggle

      phaseGateControl.group.position.set(xCP, yTop, 0)
      circuit3d.add(phaseGateControl.group)

      if (!cphaseConnMat) cphaseConnMat = new THREE.MeshBasicMaterial({ color: 0x7c3aed, transparent: true, opacity: 0.85 })
      else { cphaseConnMat.color.setHex(0x7c3aed); cphaseConnMat.opacity = 0.85 }
      if (!cphaseDotMat) cphaseDotMat = new THREE.MeshBasicMaterial({ color: 0xa78bfa, transparent: true, opacity: 1.0 })
      else { cphaseDotMat.color.setHex(0xa78bfa); cphaseDotMat.opacity = 1.0 }

      const dotGeo = new THREE.SphereGeometry(0.08, 18, 14)
      const dTop = new THREE.Mesh(dotGeo, cphaseDotMat)
      const dBot = new THREE.Mesh(dotGeo, cphaseDotMat)
      dTop.position.set(xCP, yTop, 0)
      dBot.position.set(xCP, yBot, 0)
      circuit3d.add(dTop, dBot)

      const connTube = makeWireTube(new THREE.Vector3(xCP, yBot, 0), new THREE.Vector3(xCP, yTop, 0), 0.022, 0x7c3aed, 0.85)
      connTube.material = cphaseConnMat
      circuit3d.add(connTube)
      gateVisuals.cphase.connector = connTube
      gateVisuals.cphase.dots = [dTop, dBot]
      gateVisuals.cphase.topDot = dTop
      gateVisuals.cphase.bottomDot = dBot
      circCPhaseX = xCP
      circCPhaseX_set = true

      const kickTop = makeWireTube(
        new THREE.Vector3(xs[0] - 1.4, yTop, 0.05), new THREE.Vector3(xs[3] + 1.4, yTop, 0.05), 0.015, 0x9b4dff, 0.55
      )
      const kickBot = makeWireTube(
        new THREE.Vector3(xs[0] - 1.4, yBot, 0.05), new THREE.Vector3(xCP, yBot, 0.05), 0.015, 0x9b4dff, 0.55
      )
      circuit3d.add(kickTop, kickBot)
      gateVisuals.cphase.kickPaths = [kickTop, kickBot]
      gateVisuals.cphase.topKickPath = kickTop
      gateVisuals.cphase.bottomKickPath = kickBot

      stageMarkerMeshes = []
      const stageKeys4 = ["s0", "s1", "s2", "s3"]
      for (let i = 0; i < 4; i++) {
        const keyQ0 = `q0_${stageKeys4[i]}`
        const keyQ1 = `q1_${stageKeys4[i]}`
        const mq0 = new THREE.Mesh(
          new THREE.SphereGeometry(0.11, 16, 12),
          new THREE.MeshBasicMaterial({ color: 0x7eb8f7, transparent: true, opacity: 0.90 })
        )
        mq0.position.set(xs[i], yTop, 0)
        mq0.userData.blochKey = keyQ0
        mq0.visible = !sphereVis[keyQ0]
        const mq1 = new THREE.Mesh(
          new THREE.SphereGeometry(0.11, 16, 12),
          new THREE.MeshBasicMaterial({ color: 0xa78bfa, transparent: true, opacity: 0.90 })
        )
        mq1.position.set(xs[i], yBot, 0)
        mq1.userData.blochKey = keyQ1
        mq1.visible = !sphereVis[keyQ1]
        circuit3d.add(mq0, mq1)
        stageMarkerMeshes.push(mq0, mq1)
      }

      if (!shotsDyn_q0) {
        shotsDyn_q0 = makeDynamicTextSprite("Click |0⟩ to measure", {
          color: "#fde68a", bg: "rgba(4,10,32,0.88)", font: "600 13px Inter, system-ui, sans-serif",
          border: "rgba(251,191,36,0.70)", spriteH: 34, padX: 14,
        })
      }
      shotsDyn_q0.sprite.position.set(circOutX_q0 + 1.1, yTop, 0)
      circuit3d.add(shotsDyn_q0.sprite)

      if (!shotsDyn_q1) {
        shotsDyn_q1 = makeDynamicTextSprite(`Click ${UNKNOWN_STATE_KET} to measure`, {
          color: "#c4b5fd", bg: "rgba(4,10,32,0.88)", font: "600 13px Inter, system-ui, sans-serif",
          border: "rgba(167,139,250,0.70)", spriteH: 34, padX: 14,
        })
      }
      shotsDyn_q1.sprite.position.set(circOutX_q1 + 1.1, yBot, 0)
      circuit3d.add(shotsDyn_q1.sprite)
      q1LaneObjects.push(shotsDyn_q1.sprite)

      syncSecondQubitVisibility()
    }

    function fitCircuitToView() {
      const box = new THREE.Box3().setFromObject(circuit3d)
      if (!isFinite(box.min.x) || !isFinite(box.max.x)) {
        controls.yaw = CAMERA_DEFAULT.yaw
        controls.pitch = CAMERA_DEFAULT.pitch
        controls.distance = CAMERA_DEFAULT.distance
        controls.target.copy(CAMERA_DEFAULT.target)
        controls.update()
        return
      }
      const center = box.getCenter(new THREE.Vector3())
      const size = box.getSize(new THREE.Vector3())
      const viewportWidth = Math.max(1, window.innerWidth || document.documentElement.clientWidth || 1)
      const viewportHeight = Math.max(1, window.innerHeight || document.documentElement.clientHeight || 1)
      const headerHeight = headerEl && isElementVisible(headerEl) ? headerEl.getBoundingClientRect().height : 0
      const hudWidth = viewportWidth > 940 && isElementVisible(hudEl) ? hudEl.getBoundingClientRect().width + 24 : 0
      const safeWidth = Math.max(1, viewportWidth - hudWidth - 32)
      const safeHeight = Math.max(1, viewportHeight - headerHeight - 32)
      const aspect = Math.max(0.25, camera.aspect || viewportWidth / viewportHeight)
      const fovY = camera.fov * Math.PI / 180
      const heightScale = viewportHeight / safeHeight
      const widthScale = viewportWidth / safeWidth
      const distY = (size.y * 0.5) / Math.tan(fovY * 0.5) * heightScale
      const distX = (size.x * 0.5) / (Math.tan(fovY * 0.5) * aspect) * widthScale
      const dist = Math.max(distX, distY, size.z * 0.9)
      controls.target.copy(center)
      if (hudWidth > 0) {
        const worldWidth = 2 * Math.tan(fovY * 0.5) * dist * aspect
        controls.target.x += (hudWidth / viewportWidth) * worldWidth * 0.35
      }
      controls.yaw = CAMERA_DEFAULT.yaw
      controls.pitch = CAMERA_DEFAULT.pitch
      controls.distance = clamp(dist * 1.12, controls.minDistance, controls.maxDistance)
      cameraWasAdjusted = false
      controls.update()
    }

    function scheduleFitCircuitToView() {
      cancelAnimationFrame(fitFrameId)
      fitFrameId = requestAnimationFrame(() => {
        if (disposed) return
        fitCircuitToView()
      })
    }

    buildCircuit3DLayout()

    // ── Raycaster + interaction ─────────────────────────────────────────────
    const raycaster = new THREE.Raycaster()
    const ndc = new THREE.Vector2()
    const drag = { active: false, kind: "" as "" | "q1" | "phase" }
    const handles = [stage.q1.s0.handle, phaseGateControl.handle].filter(Boolean) as THREE.Mesh[]

    function setNDCFromEvent(ev: { clientX: number; clientY: number }) {
      const r = canvas.getBoundingClientRect()
      ndc.set(((ev.clientX - r.left) / r.width) * 2 - 1, -((ev.clientY - r.top) / r.height) * 2 + 1)
    }

    function rayFromEvent(ev: { clientX: number; clientY: number }) {
      setNDCFromEvent(ev)
      raycaster.setFromCamera(ndc, camera)
    }

    function intersectSphereOnRay(center: THREE.Vector3, radius: number) {
      const sphere = new THREE.Sphere(center, radius)
      const hit = new THREE.Vector3()
      return raycaster.ray.intersectSphere(sphere, hit) ? hit : null
    }

    function thetaPhiFromDir(dir: THREE.Vector3) {
      const d = dir.clone().normalize()
      const theta = Math.acos(THREE.MathUtils.clamp(d.y, -1, 1))
      const phi = Math.atan2(d.z, d.x)
      return { theta, phi }
    }

    function formatState({ theta, phi }: { theta: number; phi: number }) {
      const deg = (x: number) => x * 180 / Math.PI
      const p0 = Math.cos(theta / 2) ** 2
      const p1 = 1 - p0
      const phiWrap = ((phi % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI)
      return `θ=${deg(theta).toFixed(1)}°  φ=${deg(phiWrap).toFixed(1)}°   P(|0⟩)=${p0.toFixed(2)}  P(|1⟩)=${p1.toFixed(2)}`
    }

    function applyQ1PinnedVisualState() {
      const s = stage.q1.s0
      const nextColor = pinState.pinned ? pinnedQ1Color : s.color
      if (s.arrowMat) {
        s.arrowMat.color.copy(nextColor)
        s.arrowMat.emissive.copy(nextColor).multiplyScalar(pinState.pinned ? 0.22 : 0.15)
      }
      if (s.handleMat) {
        s.handleMat.color.copy(nextColor)
        s.handleMat.emissive.copy(nextColor).multiplyScalar(pinState.pinned ? 0.50 : 0.45)
      }
      sweep.pauseUntil = pinState.pinned ? Infinity : 0
    }

    function resetMeasurementShots() {
      shotCounts_q0[0] = 0
      shotCounts_q0[1] = 0
      shotCounts_q1[0] = 0
      shotCounts_q1[1] = 0
      updateShotsDisplay(0)
      updateShotsDisplay(1)
    }

    function beginHandleDrag(ev: PointerEvent, kind: "q1" | "phase", message: string) {
      ev.preventDefault()
      ev.stopPropagation()
      drag.active = true
      drag.kind = kind
      controls.enabled = false
      if (kind === "q1") {
        if (!pinState.pinned) pauseSweep()
      } else {
        pauseSweep()
      }
      canvas.setPointerCapture(ev.pointerId)
      setStatus(message)
    }

    // Double-tap detection
    const tap = { t: 0, x: 0, y: 0, target: "" }

    function setPhaseGateFromDir(dir: THREE.Vector3) {
      const phi = Math.atan2(dir.z, dir.x)
      const deg = THREE.MathUtils.radToDeg(((phi % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI))
      setPhaseGateDeg(deg)
      setStatus(`P(φ)  ${formatState({ theta: Math.PI / 2, phi })}`)
    }

    function togglePinQ1() {
      if (!q1CircuitVisible) return
      pinState.pinned = !pinState.pinned
      applyQ1PinnedVisualState()
      if (pinState.pinned) {
        setInputX(inputX.theta, inputX.phi)
        resetMeasurementShots()
        setStatus(`${UNKNOWN_STATE_KET} pinned — drag the tip to move it, double-click/tap to unpin.`)
      } else {
        setStatus(`${UNKNOWN_STATE_KET} unpinned.  (Tip: drag the glowing tip)`)
      }
    }

    // Handle drag
    function onHandlePointerDown(ev: PointerEvent) {
      rayFromEvent(ev)
      const hits = raycaster.intersectObjects(handles, false)
      if (!hits.length) return
      const obj = hits[0].object
      const kind = obj.userData.handleKind as "q1" | "phase" | undefined
      if (!kind) return
      if (kind === "q1" && !q1CircuitVisible) return

      const now = performance.now()
      const dx = ev.clientX - tap.x
      const dy = ev.clientY - tap.y
      const dist2 = dx * dx + dy * dy
      const isTouch = ev.pointerType === "touch"
      const sameTarget = tap.target === `${kind}_handle`
      const doubleTap = isTouch && sameTarget && (now - tap.t) < 320 && dist2 < (22 * 22)
      tap.t = now; tap.x = ev.clientX; tap.y = ev.clientY; tap.target = `${kind}_handle`

      if (kind === "q1" && doubleTap) { ev.preventDefault(); ev.stopPropagation(); togglePinQ1(); return }
      if (kind === "q1") {
        beginHandleDrag(ev, kind, pinState.pinned ? `Dragging pinned ${UNKNOWN_STATE_KET}…` : `Dragging ${UNKNOWN_STATE_KET} (q1 input)…`)
        return
      }
      beginHandleDrag(ev, kind, "Dragging phase gate P(φ)…")
    }

    function onDragPointerMove(ev: PointerEvent) {
      if (!drag.active) return
      rayFromEvent(ev)
      if (drag.kind === "q1") {
        if (!q1CircuitVisible) return
        const center = stage.q1.s0.group.position.clone()
        const hit = intersectSphereOnRay(center, stage.q1.s0.radius)
        if (!hit) return
        const dir = hit.clone().sub(center).normalize()
        const { theta, phi } = thetaPhiFromDir(dir)
        if (q1PresetMode !== "psi") {
          q1PresetMode = "psi"
          updateInitialStateToggleLabels()
        }
        freePsiState.theta = theta
        freePsiState.phi = phi
        setInputX(theta, phi)
        setStatus(`${UNKNOWN_STATE_KET}  ${formatState({ theta, phi })}`)
        return
      }
      if (drag.kind === "phase") {
        if (!gateEnabled.phase) return
        const center = phaseGateControl.group.position.clone()
        const hit = intersectSphereOnRay(center, phaseGateControl.radius)
        if (!hit) return
        const dir = hit.clone().sub(center).normalize()
        setPhaseGateFromDir(dir)
      }
    }

    function endDrag(ev: PointerEvent) {
      if (!drag.active) return
      const lastKind = drag.kind
      drag.active = false
      drag.kind = ""
      controls.enabled = true
      try { canvas.releasePointerCapture(ev.pointerId) } catch { /* ignore */ }
      if (lastKind === "q1") {
        setStatus(pinState.pinned
          ? `${UNKNOWN_STATE_KET} pinned — drag the tip to move it, double-click/tap to unpin.`
          : `Ready. (Tip: drag the glowing tip on ${UNKNOWN_STATE_KET})`)
        return
      }
      setStatus("Ready. Drag P(φ) on the circuit or use the sliders in the panel.")
    }

    canvas.addEventListener("pointerdown", onHandlePointerDown, { capture: true, signal: sig })
    canvas.addEventListener("pointermove", onDragPointerMove, { signal: sig })
    canvas.addEventListener("pointerup", endDrag, { signal: sig })
    canvas.addEventListener("pointercancel", endDrag, { signal: sig })

    // ── Measurement photon system ───────────────────────────────────────────
    function getP0AtX(qubit: number, worldX: number) {
      if (!circStageXs.length) return 0.5
      const probs = qubit === 0 ? stageProbs_q0 : stageProbs_q1
      const sxs = circStageXs
      if (worldX <= sxs[0]) return probs[0]
      for (let i = 0; i < 3; i++) {
        if (worldX <= sxs[i + 1]) {
          const t = (worldX - sxs[i]) / (sxs[i + 1] - sxs[i])
          return probs[i] * (1 - t) + probs[i + 1] * t
        }
      }
      return probs[3]
    }

    function p0ToColor(p0: number) {
      return new THREE.Color().copy(_photonCyan).lerp(_photonPink, 1 - p0)
    }

    function createPhotonMesh(p0: number) {
      const g = new THREE.Group()
      const col = p0ToColor(p0)
      const coreMat = new THREE.MeshBasicMaterial({ color: col.clone(), depthWrite: false })
      const haloMat = new THREE.MeshBasicMaterial({ color: col.clone(), transparent: true, opacity: 0.25, depthWrite: false })
      const core = new THREE.Mesh(new THREE.SphereGeometry(0.075, 14, 12), coreMat)
      const halo = new THREE.Mesh(new THREE.SphereGeometry(0.175, 14, 12), haloMat)
      g.add(core, halo)
      return { group: g, halo, coreMat }
    }

    function spawnMeasurementPhoton(qubit = 0) {
      if (qubit === 1 && !q1CircuitVisible) return
      const p0Final = qubit === 0 ? currentP0_q0 : currentP0_q1
      const outcome = Math.random() < p0Final ? 0 : 1
      const inX = qubit === 0 ? circInX_q0 : circInX_q1
      const wireY = qubit === 0 ? circWireY_q0 : circWireY_q1
      const p0Spawn = getP0AtX(qubit, inX)
      const { group, halo, coreMat } = createPhotonMesh(p0Spawn)
      group.position.set(inX, wireY, 0.13)
      scene.add(group)
      measurePhotons.push({ group, halo, coreMat, outcome, qubit, traveled: 0 })
    }

    function updateShotsDisplay(qubit: number) {
      const dyn = qubit === 0 ? shotsDyn_q0 : shotsDyn_q1
      const domEl = qubit === 0 ? measureQ0El : measureQ1El
      const counts = qubit === 0 ? shotCounts_q0 : shotCounts_q1
      const label = qubit === 0 ? "|0⟩" : UNKNOWN_STATE_KET
      if (!dyn) return
      const total = counts[0] + counts[1]
      if (total === 0) {
        dyn.setText(`Click ${label} to measure`)
        if (domEl) domEl.textContent = qubit === 1 && !q1CircuitVisible ? `hidden while ${UNKNOWN_STATE_KET} is off` : `waiting for shots from ${label}`
        console.log(`[gatesim] q${qubit} measurement reset`, { label, counts: { zero: 0, one: 0 }, total: 0 })
        return
      }
      const pct0 = (counts[0] / total * 100).toFixed(0)
      const pct1 = (counts[1] / total * 100).toFixed(0)
      dyn.setText(`0: ${counts[0]} (${pct0}%)   1: ${counts[1]} (${pct1}%)\ntotal shots: ${total}`)
      if (domEl) domEl.textContent = `0: ${counts[0]} (${pct0}%)   1: ${counts[1]} (${pct1}%)   total: ${total}`
      console.log(`[gatesim] q${qubit} measurement update`, {
        label,
        counts: { zero: counts[0], one: counts[1] },
        percentages: { zero: Number(pct0), one: Number(pct1) },
        total,
      })
    }

    function getVisibleSphereObjects() {
      const visObjs: THREE.Object3D[] = []
      for (const key of _sphereVisKeys) {
        if (!sphereVis[key]) continue
        if (!isLaneVisibleForKey(key)) continue
        if (key === "q1_s0") continue
        const s = stageFromKey(key)
        if (!s) continue
        s.group.traverse((obj: THREE.Object3D) => {
          if ((obj as any).isMesh) visObjs.push(obj)
        })
      }
      return visObjs
    }

    function isPointerOnInteractiveObject() {
      const gateToggleSprites = [
        gateVisuals.h1.toggle?.sprite,
        gateVisuals.phase.toggle?.sprite,
        gateVisuals.h2.toggle?.sprite,
        gateVisuals.cphase.toggle?.sprite,
      ].filter((sprite): sprite is THREE.Sprite => !!sprite && sprite.visible)
      if (gateToggleSprites.length && raycaster.intersectObjects(gateToggleSprites, false).length) return true

      if (gateEnabled.phase && raycaster.intersectObject(phaseGateControl.group, true).length) return true

      const visibleMarkers = stageMarkerMeshes.filter((m) => m.visible)
      if (visibleMarkers.length && raycaster.intersectObjects(visibleMarkers, false).length) return true

      const visibleSphereObjects = getVisibleSphereObjects()
      if (visibleSphereObjects.length && raycaster.intersectObjects(visibleSphereObjects, false).length) return true

      return !!(
        (in0Sprite && raycaster.intersectObject(in0Sprite, false).length) ||
        (inxSprite && raycaster.intersectObject(inxSprite, false).length)
      )
    }

    function scheduleNextPhoton() {
      if (!photonIsHolding) return
      spawnMeasurementPhoton(0)
      if (q1CircuitVisible) spawnMeasurementPhoton(1)
      const elapsed = performance.now() - photonHoldStartTime
      const interval = 25 + 175 * Math.exp(-elapsed / 1600)
      photonHoldTimer = setTimeout(scheduleNextPhoton, interval)
    }

    // Gate toggles + stage markers + photon launch
    function onInteractionPointerDown(ev: PointerEvent) {
      setNDCFromEvent(ev)
      raycaster.setFromCamera(ndc, camera)

      const gateToggleSprites = [
        gateVisuals.h1.toggle?.sprite,
        gateVisuals.phase.toggle?.sprite,
        gateVisuals.h2.toggle?.sprite,
        gateVisuals.cphase.toggle?.sprite,
      ].filter((sprite): sprite is THREE.Sprite => !!sprite && sprite.visible)
      if (gateToggleSprites.length) {
        const gateToggleHits = raycaster.intersectObjects(gateToggleSprites, false)
        if (gateToggleHits.length) {
          const gateKey = gateToggleHits[0].object.userData.gateKey
          if (gateKey) { ev.preventDefault(); ev.stopPropagation(); setGateEnabled(gateKey, !gateEnabled[gateKey]); return }
        }
      }

      if (stageMarkerMeshes.length) {
        const visibleMarkers = stageMarkerMeshes.filter((m) => m.visible)
        const markerHits = raycaster.intersectObjects(visibleMarkers, false)
        if (markerHits.length) {
          const key = markerHits[0].object.userData.blochKey
          if (key) { setSphereVisible(key, true); ev.stopPropagation(); return }
        }
      }

      // Click on visible sphere to hide it
      {
        const visObjs = getVisibleSphereObjects()
        const visObjKey = new Map<THREE.Object3D, string>()
        for (const key of _sphereVisKeys) {
          if (!sphereVis[key] || key === "q1_s0") continue
          const s = stageFromKey(key)
          if (!s) continue
          s.group.traverse((obj: THREE.Object3D) => {
            if ((obj as any).isMesh) visObjKey.set(obj, key)
          })
        }
        if (visObjs.length) {
          const hits = raycaster.intersectObjects(visObjs, false)
          if (hits.length) {
            const key = visObjKey.get(hits[0].object)
            if (key) { setSphereVisible(key, false); ev.stopPropagation(); return }
          }
        }
      }

      const hitEither =
        (in0Sprite && raycaster.intersectObject(in0Sprite, false).length) ||
        (q1CircuitVisible && inxSprite && raycaster.intersectObject(inxSprite, false).length)
      if (!hitEither) return

      ev.stopPropagation()
      if (shotAutoResetTimer) clearTimeout(shotAutoResetTimer)
      photonHoldStartTime = performance.now()
      photonIsHolding = true
      scheduleNextPhoton()
    }

    function stopPhotonHold() {
      if (!photonIsHolding) return
      photonIsHolding = false
      if (photonHoldTimer) { clearTimeout(photonHoldTimer); photonHoldTimer = null }
      shotAutoResetTimer = setTimeout(() => {
        shotCounts_q0[0] = 0; shotCounts_q0[1] = 0
        shotCounts_q1[0] = 0; shotCounts_q1[1] = 0
        updateShotsDisplay(0); updateShotsDisplay(1)
      }, 10000)
    }

    canvas.addEventListener("pointerdown", onInteractionPointerDown, { capture: true, signal: sig })
    canvas.addEventListener("pointerup", stopPhotonHold, { signal: sig })
    canvas.addEventListener("pointercancel", stopPhotonHold, { signal: sig })

    // ── Sphere visibility ───────────────────────────────────────────────────
    function stageFromKey(key: string) {
      const [q, s] = key.split("_")
      return (stage as any)[q]?.[s] ?? null
    }

    function setSphereVisible(key: string, visible: boolean) {
      sphereVis[key] = visible
      const s = stageFromKey(key)
      if (s) s.group.visible = visible && isLaneVisibleForKey(key)
      for (const m of stageMarkerMeshes) {
        if (m.userData.blochKey === key) m.visible = !visible && isLaneVisibleForKey(key)
      }
      updateSpheresToggleLabel()
    }

    function setBlochSpheresVisible(visible: boolean) {
      _sphereVisKeys.forEach((k) => setSphereVisible(k, visible))
    }

    setBlochSpheresVisible(false)

    // ── UI wiring ───────────────────────────────────────────────────────────
    function onPhaseInput() { pauseSweep(); setLambdaDeg(Number(phaseEl?.value || 0)) }
    function onPhaseGateInput() { pauseSweep(); setPhaseGateDeg(Number(phaseGateEl?.value || 0)) }
    function onQ0StateToggle() { pauseSweep(); setQ0InitialBit(q0InitialBit === 0 ? 1 : 0) }
    function onQ1StateCycle() {
      pauseSweep()
      const currentIdx = q1PresetCycleOrder.indexOf(q1PresetMode)
      const nextMode = q1PresetCycleOrder[(currentIdx + 1) % q1PresetCycleOrder.length]
      setQ1PresetMode(nextMode)
    }

    document.getElementById("gs-btn-x-one")?.addEventListener("click", () => { pauseSweep(); setQ1PresetMode("one") }, { signal: sig })
    document.getElementById("gs-btn-x-plus")?.addEventListener("click", () => {
      pauseSweep()
      freePsiState.theta = Math.PI / 2
      freePsiState.phi = 0
      setQ1PresetMode("psi")
    }, { signal: sig })
    document.getElementById("gs-btn-x-minus")?.addEventListener("click", () => { pauseSweep(); setQ1PresetMode("minus") }, { signal: sig })
    phaseEl?.addEventListener("input", onPhaseInput, { signal: sig })
    phaseGateEl?.addEventListener("input", onPhaseGateInput, { signal: sig })
    q0StateToggleBtn?.addEventListener("click", onQ0StateToggle, { signal: sig })
    q1StateCycleBtn?.addEventListener("click", onQ1StateCycle, { signal: sig })

    // Fit button
    document.getElementById("gs-fit-view")?.addEventListener("click", fitCircuitToView, { signal: sig })

    // Spheres toggle
    spheresToggleBtn?.addEventListener("click", () => {
      const anyVisible = _sphereVisKeys.some((k) => sphereVis[k] && isLaneVisibleForKey(k))
      setBlochSpheresVisible(!anyVisible)
      if (anyVisible) {
        if (shotAutoResetTimer) clearTimeout(shotAutoResetTimer)
        resetMeasurementShots()
      }
    }, { signal: sig })

    q1ToggleBtn?.addEventListener("click", () => {
      q1CircuitVisible = !q1CircuitVisible
      syncSecondQubitVisibility()
      setStatus(q1CircuitVisible
        ? `Second qubit ${UNKNOWN_STATE_KET} shown. Drag its tip or use the presets to change its state.`
        : `Second qubit ${UNKNOWN_STATE_KET} hidden — only the |0⟩ lane is visible.`)
    }, { signal: sig })

    // ── HUD show/hide ──────────────────────────────────────────────────────
    function syncToggleLabels() {
      if (hudToggleBtn) hudToggleBtn.textContent = hudEl?.hidden ? "Panel" : "Hide panel"
    }

    function setHudMinimized(minimized: boolean) {
      try { localStorage.setItem("qp:min:hud", minimized ? "1" : "0") } catch { /* ignore */ }
      hudEl.hidden = !!minimized
      syncToggleLabels()
    }

    // Restore state
    ;(function initMinState() {
      try {
        const prefHud = localStorage.getItem("qp:min:hud")
        setHudMinimized(prefHud === null ? true : prefHud === "1")
      } catch {
        setHudMinimized(true)
      }
    })()

    document.getElementById("gs-btn-hud-min")?.addEventListener("click", () => setHudMinimized(true), { signal: sig })
    hudToggleBtn?.addEventListener("click", () => setHudMinimized(!hudEl?.hidden ? true : false), { signal: sig })

    syncToggleLabels()
    updateInitialStateToggleLabels()
    updateSecondQubitToggleLabel()

    function onKeyDown(e: KeyboardEvent) {
      if (e.key.toLowerCase() === "m") {
        const hudMin = !!hudEl?.hidden
        setHudMinimized(!hudMin)
      }
    }
    window.addEventListener("keydown", onKeyDown, { signal: sig })

    // ── Double-click ────────────────────────────────────────────────────────
    function onDblClick(ev: MouseEvent) {
      setNDCFromEvent(ev)
      raycaster.setFromCamera(ndc, camera)
      const handleHits = raycaster.intersectObjects(handles, false)
      if (handleHits.length) {
        const kind = handleHits[0].object.userData.handleKind as "q1" | "phase" | undefined
        if (kind === "q1") { togglePinQ1(); return }
        if (kind === "phase") return
      }
      if (isPointerOnInteractiveObject()) return
      buildCircuit3DLayout()
      fitCircuitToView()
      setStatus("View reset.")
    }
    canvas.addEventListener("dblclick", onDblClick, { signal: sig })

    // ── Resize ──────────────────────────────────────────────────────────────
    function resize() {
      if (!renderer) return
      const w = Math.max(320, Math.floor(window.innerWidth || document.documentElement.clientWidth || 520))
      const h = Math.max(420, Math.floor(window.innerHeight || document.documentElement.clientHeight || 520))
      renderer.setSize(w, h, false)
      camera.aspect = w / h
      camera.updateProjectionMatrix()
      buildCircuit3DLayout()
      if (cameraWasAdjusted) controls.update()
      else scheduleFitCircuitToView()
    }

    window.addEventListener("resize", resize, { passive: true, signal: sig })
    if (!renderer) { setStatus("Viewer unavailable (WebGL)."); return }

    resize()
    setInputX(Math.PI, 0)
    if (phaseEl) setLambdaDeg(Number(phaseEl.value || 0))
    if (phaseGateEl) setPhaseGateDeg(Number(phaseGateEl.value || 0))
    else recomputeCircuit()
    updateShotsDisplay(0)
    updateShotsDisplay(1)

    // ── WebGL context lost ──────────────────────────────────────────────────
    function onContextLost(e: Event) {
      e.preventDefault()
      showFallback("WebGL context was lost. Try reloading the page.")
    }
    canvas.addEventListener("webglcontextlost", onContextLost, { signal: sig })

    // ── Animation loop ──────────────────────────────────────────────────────
    let frames = 0
    let fpsLast = performance.now()
    const clock = new THREE.Clock()

    function animate() {
      if (disposed) return
      animFrameId = requestAnimationFrame(animate)
      const t = clock.getElapsedTime()
      const dtAnim = t - tPrevAnim
      tPrevAnim = t

      // Photons
      const photonSpeed = 4.5
      for (let i = measurePhotons.length - 1; i >= 0; i--) {
        const ph = measurePhotons[i]
        const inX = ph.qubit === 0 ? circInX_q0 : circInX_q1
        const outX = ph.qubit === 0 ? circOutX_q0 : circOutX_q1
        const wireY = ph.qubit === 0 ? circWireY_q0 : circWireY_q1
        const wireDist = outX - inX
        ph.traveled += dtAnim * photonSpeed
        if (ph.traveled >= wireDist) {
          scene.remove(ph.group)
          measurePhotons.splice(i, 1)
          const counts = ph.qubit === 0 ? shotCounts_q0 : shotCounts_q1
          counts[ph.outcome]++
          updateShotsDisplay(ph.qubit)
        } else {
          const worldX = inX + ph.traveled
          ph.group.position.x = worldX
          ph.group.position.y = wireY
          const pulse = 0.78 + 0.22 * Math.sin(ph.traveled * 20)
          ph.group.scale.setScalar(pulse)
          const p0 = getP0AtX(ph.qubit, worldX)
          const col = p0ToColor(p0)
          ph.coreMat.color.copy(col)
          ph.halo.material.color.copy(col)
          ph.halo.material.opacity = 0.10 + 0.20 * pulse
        }
      }

      // CPhase connector pulse
      if (cphaseConnMat && circCPhaseX_set && gateEnabled.cphase && q1CircuitVisible) {
        const JOINT_RADIUS = 0.65
        let proxQ0 = 0, proxQ1 = 0
        for (const ph of measurePhotons) {
          const inX = ph.qubit === 0 ? circInX_q0 : circInX_q1
          const wx = inX + ph.traveled
          const dist = Math.abs(wx - circCPhaseX)
          if (dist < JOINT_RADIUS) {
            const p = 1 - dist / JOINT_RADIUS
            const e = p * p * (3 - 2 * p)
            if (ph.qubit === 0) proxQ0 = Math.max(proxQ0, e)
            else proxQ1 = Math.max(proxQ1, e)
          }
        }
        const connEase = Math.max(proxQ0, proxQ1)
        if (connEase > 0) {
          cphaseConnMat.color.setRGB(0.486 + 0.514 * connEase, 0.227 - 0.027 * connEase, 0.929 - 0.569 * connEase)
          cphaseConnMat.opacity = 0.72 + 0.28 * connEase
        } else {
          cphaseConnMat.color.setHex(0x7c3aed)
          cphaseConnMat.opacity = 0.72
        }
        if (cphaseDotMat) {
          const dotEase = Math.max(proxQ0, proxQ1)
          if (dotEase > 0) {
            cphaseDotMat.color.setRGB(0.655 + 0.345 * dotEase, 0.545 - 0.345 * dotEase, 0.980 - 0.580 * dotEase)
          } else {
            cphaseDotMat.color.setHex(0xa78bfa)
          }
          cphaseDotMat.opacity = 1.0
        }
      } else if (cphaseConnMat && cphaseDotMat) {
        cphaseConnMat.color.setHex(0x7c3aed)
        cphaseConnMat.opacity = 0.72
        cphaseDotMat.color.setHex(0xa78bfa)
        cphaseDotMat.opacity = 1.0
      }

      // Auto-sweep
        if (q1PresetMode === "psi" && !drag.active && performance.now() >= sweep.pauseUntil) {
        const theta = Math.PI / 2 + (Math.PI * 0.42) * Math.sin(t * 0.17)
        const phi = t * 0.31 + Math.PI * 0.55 * Math.sin(t * 0.11)
        setInputX(theta, phi)
      }

      keyLight.position.x = 4 + Math.sin(t * 0.35) * 1.2
      rimLight.position.z = -4 + Math.cos(t * 0.28) * 1.4

      controls.update()
      renderer?.render(scene, camera)

      if (!fallbackEl.hidden) fallbackEl.hidden = true

      frames++
      const now = performance.now()
      if (now - fpsLast > 450) {
        const fps = frames * 1000 / (now - fpsLast)
        fpsEl.textContent = `${fps.toFixed(0)} fps`
        frames = 0
        fpsLast = now
      }
    }

    setStatus(`Ready. Adjust λ or φ, click the gate toggles, or show ${UNKNOWN_STATE_KET} to inspect the second qubit.`)
    animate()

    const testApi = {
      snapshot() {
        const visibleSphereCount = _sphereVisKeys.reduce((count, key) => {
          const sphere = stageFromKey(key)
          return count + (sphere?.group?.visible ? 1 : 0)
        }, 0)
        return {
          q1CircuitVisible,
          gateEnabled: { ...gateEnabled },
          visibleSphereCount,
          shotCounts: {
            q0: [shotCounts_q0[0], shotCounts_q0[1]] as [number, number],
            q1: [shotCounts_q1[0], shotCounts_q1[1]] as [number, number],
          },
          photonCount: measurePhotons.length + shotCounts_q0[0] + shotCounts_q0[1] + shotCounts_q1[0] + shotCounts_q1[1],
          outputText: outReadoutEl?.textContent ?? "",
          q0MeasurementText: measureQ0El?.textContent ?? "",
          q1MeasurementText: measureQ1El?.textContent ?? "",
        }
      },
      setGateEnabled,
      setLambdaDeg,
      setPhaseGateDeg,
      setQ1PresetMode,
      setQ0InitialBit,
      clearMeasurementShots() {
        clearMeasurementPhotons(0)
        clearMeasurementPhotons(1)
        resetMeasurementShots()
      },
      spawnMeasurementPhoton(qubit = 0) {
        if (qubit === 1 && !q1CircuitVisible) return false
        const p0Final = qubit === 0 ? currentP0_q0 : currentP0_q1
        const counts = qubit === 0 ? shotCounts_q0 : shotCounts_q1
        const outcome = Math.random() < p0Final ? 0 : 1
        counts[outcome]++
        updateShotsDisplay(qubit)
        return true
      },
    }
    ;(window as any).__gatesimTestApi__ = testApi

    // ── Cleanup ─────────────────────────────────────────────────────────────
    cleanupRef.current = () => {
      delete (window as any).__gatesimTestApi__
      disposed = true
      cancelAnimationFrame(animFrameId)
      cancelAnimationFrame(fitFrameId)
      if (photonHoldTimer) clearTimeout(photonHoldTimer)
      if (shotAutoResetTimer) clearTimeout(shotAutoResetTimer)
      ac.abort()
      renderer?.dispose()
    }

    return () => { cleanupRef.current?.() }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="gatesim-page">
      <div className="gs-page">
        <div className="gs-bg3d" aria-hidden="true">
          <div className="gs-overlay" />
          <canvas ref={canvasRef} />
          <div className="gs-webgl-fallback" ref={fallbackRef} hidden>
            <div>
              <div style={{ fontWeight: 650, marginBottom: 6 }}>Loading viewer…</div>
              <div style={{ opacity: 0.85 }}>If this doesn&apos;t go away, WebGL or script loading failed.</div>
            </div>
          </div>
        </div>

        <header className="gs-header" ref={headerRef}>
          <div className="gs-container">
            <div className="gs-nav">
              <a className="gs-brand" href="/gatesim" aria-label="Quantum Computing Lab">
                <span className="gs-logo" aria-hidden="true" />
                <span>Quantum Computing Lab</span><div className="gs-pill"> by ScienceVR</div>
              </a>
              <div className="gs-pill" title="Local, GPU-friendly visualization">
                <span className="gs-dot" aria-hidden="true" />
                <span ref={fpsRef} style={{ fontVariantNumeric: "tabular-nums" }}>… fps</span>
              </div>
              <div className="gs-nav-actions" aria-label="View toggles">
                <button className="gs-iconbtn" id="gs-fit-view" type="button" title="Frame the full circuit in view">Fit</button>
                <button
                  className="gs-iconbtn"
                  type="button"
                  title="Show / hide the Mermaid prototype diagram"
                  aria-pressed={isDiagramOpen}
                  onClick={() => setIsDiagramOpen((open) => !open)}
                >
                  Diagram
                </button>
                <button className="gs-iconbtn" ref={q0StateToggleRef} type="button" title="Toggle the first qubit between |0⟩ and |1⟩">q0 |0⟩</button>
                <button className="gs-iconbtn" ref={q1StateCycleRef} type="button" title="Cycle the second qubit preset through |0⟩, |1⟩, |0⟩ - |1⟩, and |ψ⟩">ψ |ψ⟩</button>
                <button className="gs-iconbtn" ref={hudToggleRef} type="button" title="Show / hide control panel">Panel</button>
                <button className="gs-iconbtn" ref={q1ToggleRef} type="button" title="Show / hide the second qubit lane">Show |ψ⟩</button>
                <button className="gs-iconbtn" ref={spheresToggleRef} type="button" title="Show / hide Bloch spheres">Spheres</button>
              </div>
            </div>
          </div>
        </header>

        <main className="gs-main">
          <aside className="gs-hud" ref={hudRef}>
            <div className="gs-card gs-hero-left">
              <div style={{ position: "absolute", right: 14, top: 14, display: "flex", gap: 8, zIndex: 2 }}>
                <button className="gs-iconbtn" id="gs-btn-hud-min" title="Minimize panel">–</button>
              </div>

              <div className="gs-cta-row" aria-label="Circuit controls" style={{ marginTop: 4 }}>
                <button className="gs-btn gs-btn-primary" id="gs-btn-x-one">Set |ψ⟩ = |1⟩</button>
                <button className="gs-btn gs-btn-ghost" id="gs-btn-x-plus">Set |ψ⟩ = |+⟩</button>
                <button className="gs-btn gs-btn-ghost" id="gs-btn-x-minus">Set |ψ⟩ = |−⟩</button>
                <span className="gs-mini" ref={statusRef}>Ready.</span>
              </div>

              <div className="gs-card gs-feature" style={{ marginTop: 12 }}>
                <h3>Controlled‑phase angle (λ)</h3>
                <p style={{ margin: "0 0 10px" }}>Changing λ changes how much phase is kicked back onto q0 when q1 is close to |1⟩.</p>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <input ref={phaseRef} type="range" min="0" max="360" defaultValue="180" step="1" style={{ width: "100%" }} />
                  <span className="gs-pill" style={{ margin: 0 }}>
                    <span ref={phaseValRef} style={{ fontVariantNumeric: "tabular-nums" }}>180°</span>
                  </span>
                </div>
                <div style={{ marginTop: 14 }}>
                  <h3 style={{ margin: "0 0 8px" }}>Phase gate angle (φ)</h3>
                  <p style={{ margin: "0 0 10px" }}>This single-qubit phase gate rotates q0 around Z before the final H gate.</p>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <input ref={phaseGateRef} type="range" min="0" max="360" defaultValue="0" step="1" style={{ width: "100%" }} />
                    <span className="gs-pill" style={{ margin: 0 }}>
                      <span ref={phaseGateValRef} style={{ fontVariantNumeric: "tabular-nums" }}>0°</span>
                    </span>
                  </div>
                </div>
                <div style={{ marginTop: 8, color: "hsla(215 20% 65% / 1)", fontSize: 12 }}>
                  Output: <span ref={outReadoutRef} style={{ fontVariantNumeric: "tabular-nums" }}>…</span>
                </div>
                <div style={{ display: "grid", gap: 6, marginTop: 10 }}>
                  <div style={{ color: "hsla(46 90% 72% / 1)", fontSize: 12, fontVariantNumeric: "tabular-nums" }}>
                    q0 measurement: <span ref={measureQ0Ref}>waiting for shots from |0⟩</span>
                  </div>
                  <div style={{ color: "hsla(262 90% 82% / 1)", fontSize: 12, fontVariantNumeric: "tabular-nums" }}>
                    q1 measurement: <span ref={measureQ1Ref}>waiting for shots from |ψ⟩</span>
                  </div>
                </div>
              </div>

            </div>
          </aside>

          <section
            aria-label="Gold CPHASE Mermaid floating panel"
            className="gs-diagram-panel"
            hidden={!isDiagramOpen}
          >
            <div className="gs-card gs-feature gs-mermaid-card">
              <div className="gs-panel-head">
                <div className="gs-panel-title">Gold /gatesim CPHASE prototype</div>
                <div style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                  <span className="gs-badge">Cleve 1998 lens</span>
                  <button
                    className="gs-iconbtn"
                    type="button"
                    title="Close Mermaid diagram panel"
                    onClick={() => setIsDiagramOpen(false)}
                  >
                    Close
                  </button>
                </div>
              </div>
              <div className="gs-mermaid-body">
                <p className="gs-mermaid-lead">
                  Mermaid sketch of the 3D gold circuit: a compact H-CU-H prototype for describing phase kickback and the evolution of quantum algorithms.
                </p>
                <MermaidDiagram
                  chart={CPHASE_PROTOTYPE_MERMAID}
                  className="gs-mermaid-render"
                  title="Gold CPHASE Mermaid diagram"
                />
                <ul className="gs-mermaid-notes">
                  {CPHASE_PROTOTYPE_NOTES.map((note) => (
                    <li key={note}>{note}</li>
                  ))}
                </ul>
              </div>
            </div>
          </section>
        </main>
      </div>
    </div>
  )
}
