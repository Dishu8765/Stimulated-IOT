# Simulated IoT Environmental Monitor
### FreeRTOS on ESP32 (Wokwi) → MQTT → Node/Express → React Dashboard

A full-stack embedded systems project built to demonstrate real-time task
scheduling, synchronization, and interrupt-driven design on a resource
constrained MCU — connected end-to-end to a live web dashboard.

Built as focused, deliberate upskilling from a full-stack web background
toward embedded/firmware-adjacent roles (RTOS task scheduling, mutex/queue
synchronization, interrupt handling, low-power design awareness).

---

## Architecture

```
┌─────────────┐        MQTT publish        ┌──────────────┐      Socket.io / REST     ┌───────────────┐
│   ESP32     │  ───────────────────────►  │ Public MQTT  │  ◄──────────────────────► │   Browser      │
│  (Wokwi     │   topic:                   │   Broker     │        (subscribed by      │  React +       │
│  simulation)│   silabs-prep/envmonitor/  │ (HiveMQ)     │         Node backend)       │  Recharts      │
│  FreeRTOS   │   readings                 │              │                             │                │
└─────────────┘                            └──────┬───────┘                             └───────▲────────┘
                                                    │ subscribe                                    │
                                                    ▼                                               │
                                            ┌───────────────┐        emits "reading"                │
                                            │ Node/Express  │ ──────────────────────────────────────┘
                                            │ + Socket.io   │
                                            │ (in-memory    │
                                            │  ring buffer) │
                                            └───────────────┘
```

- **Firmware** (`/firmware`) — Arduino-style `.ino` for the ESP32, run inside
  the free Wokwi browser simulator. No physical hardware required.
- **Backend** (`/backend`) — Express server that subscribes to the same MQTT
  topic the firmware publishes to, keeps a capped in-memory history, and
  re-broadcasts every reading to connected browsers over Socket.io.
- **Frontend** (`/frontend`) — Vite + React dashboard: live temperature/
  humidity chart, latest-reading cards, and a "serial monitor" style log
  panel that mirrors what you'd see in Wokwi's own serial console.

---

## RTOS task diagram

```
                         ┌────────────────────────┐
                         │      setup()            │
                         │  creates mutex + queue  │
                         │  spawns 3 tasks          │
                         └───────────┬─────────────┘
                                     │
      ┌──────────────────────────────┼──────────────────────────────┐
      ▼                              ▼                              ▼
┌───────────────┐            ┌───────────────┐              ┌────────────────┐
│  SensorTask    │            │  StatusTask   │              │  NetworkTask    │
│  priority: 2   │            │  priority: 1  │              │  priority: 1    │
│  every 2s:     │            │  blinks LED   │              │  consumer:      │
│  - read DHT22  │            │  every 500ms  │              │  - dequeue      │
│  - write ──────┼──mutex────►│  reads temp   │              │  - WiFi/MQTT    │
│    latest      │            │  via mutex    │              │    publish      │
│    reading     │            └───────────────┘              │  - services the │
│  - push ───────┼──queue───────────────────────────────────►│    emergency    │
│    reading     │                                             │    flag set    │
└───────┬────────┘                                             │    by the ISR  │
        │                                                       └────────▲───────┘
        │                                                                │
        │                              ┌─────────────────────────────────┘
        │                              │ (flag serviced in task context,
        ▼                              │  NOT inside the ISR itself)
┌────────────────┐             ┌───────┴────────┐
│ Emergency button│  interrupt  │  ISR            │
│ (GPIO 5)        │────────────►│  onEmergency…() │
└────────────────┘             │  sets a flag,    │
                                │  returns fast    │
                                └──────────────────┘
```

**Synchronization primitives used, and why:**

| Primitive | Between | Why this one |
|---|---|---|
| **Mutex** (`xSemaphoreCreateMutex`) | SensorTask ↔ StatusTask | Both tasks touch the *same* struct at unpredictable times. A mutex prevents a torn read (e.g. StatusTask seeing a new temperature paired with stale humidity). |
| **Queue** (`xQueueCreate`) | SensorTask → NetworkTask | Ownership of each *reading* passes fully to the consumer — no shared memory, natural buffering if the network task is momentarily slow (e.g. WiFi retry), and a clean producer/consumer boundary. |
| **ISR + flag** | Emergency button → NetworkTask | The ISR does the absolute minimum (set a flag, return) — no queue push, no printf, no delay inside the ISR itself. The *task* checks the flag and does the real work, which is the standard "keep ISRs short" pattern. |

---

## Design decisions (put this in your own README verbatim, or adapt it)

- **Mutex vs. queue, used deliberately, not interchangeably.** The mutex
  protects a single mutable "latest value" two tasks might touch at any
  moment; the queue moves discrete, ordered readings from producer to
  consumer without either task touching the other's memory. Using both in
  one project — for the right reason in each case — is the actual signal
  this project is meant to send.
- **The ISR only sets a flag.** All real work for the emergency-button event
  (reading the mutex-protected struct, pushing to the queue) happens inside
  `NetworkTask`, not the ISR. This avoids stack overflows, missed
  interrupts, and non-reentrant calls (like `Serial.print` or MQTT publish)
  running inside interrupt context.
- **Dropped readings are a deliberate choice, not a bug.** `xQueueSend`
  uses a short timeout and logs + drops rather than blocking indefinitely if
  then network task falls behind — a stalled sensor task is worse than a
  dropped sample.
- **Power-awareness is documented, not (fully) implemented.** Wokwi cannot
  meaningfully simulate current draw, so `setup()` includes a comment block
  describing the real redesign for battery power (light-sleep between
  reads, interrupt-only wake, batched publishes) rather than faking a
  metric that wouldn't mean anything in simulation.

---

## Running it

### 1. Firmware (Wokwi, no hardware needed)
1. Go to [wokwi.com](https://wokwi.com) → **New Project → ESP32**.
2. Replace the default `sketch.ino` with `firmware/sketch.ino`.
3. Open `firmware/diagram.json` in the Wokwi diagram editor (or paste its
   contents over the default `diagram.json`) to wire up the DHT22 sensor,
   status LED, and two buttons.
4. Add the libraries listed in `firmware/libraries.txt` via the Wokwi
   library manager (or the VS Code Wokwi extension, which reads
   `libraries.txt` automatically).
5. Start the simulation. Open the Serial Monitor to watch task logs,
   including the deliberate priority-starvation experiment from Day 2-3 if
   you want to reproduce it (temporarily lower `SensorTask`'s priority
   below `StatusTask`'s and watch sensor reads get delayed).
6. Hold the blue button to speed up the status LED blink; press the red
   button to fire the emergency-interrupt path and watch it jump the queue
   in the serial log.

### 2. Backend
```bash
cd backend
cp .env.example .env      # defaults work out of the box (public HiveMQ broker)
npm install
npm start                 # http://localhost:4000
```
No hardware or simulator required to test the backend/dashboard alone —
`POST /api/simulate` injects a fake reading:
```bash
curl -X POST http://localhost:4000/api/simulate \
  -H "Content-Type: application/json" \
  -d '{"temp": 26.4, "humidity": 58, "emergency": false}'
```

### 3. Frontend
```bash
cd frontend
cp .env.example .env      # points at http://localhost:4000 by default
npm install
npm run dev                # http://localhost:5173
```

With the backend and frontend running, start (or restart) the Wokwi
simulation — readings will appear on the dashboard within a couple of
seconds of the first MQTT publish.

---

## What NOT to overclaim

This project is simulated (Wokwi), built over a focused ~2-week window, and
is not a substitute for hands-on hardware experience. Framed precisely —
"FreeRTOS task synchronization on simulated ESP32," not "embedded systems
experience" broadly — it's an honest, credible signal of self-directed
learning and correctly-applied RTOS fundamentals, which is what it's
designed to demonstrate.

## Resume line

> **Simulated IoT Environmental Monitor (FreeRTOS on ESP32)** — Designed a
> multi-task firmware architecture using FreeRTOS with mutex-protected
> shared state and queue-based producer/consumer communication between
> sensor-read and network-publish tasks; implemented interrupt-driven event
> handling for real-time response; built a live monitoring dashboard
> (Node.js/React) consuming MQTT telemetry end-to-end.

## How to talk about it in an interview

*"I come from a full-stack background, but I deliberately built a
FreeRTOS-based project on ESP32 to understand real-time task scheduling — I
implemented mutex-protected shared state, a queue-based producer/consumer
pattern between sensor and network tasks, and interrupt-driven event
handling, then connected it to a live dashboard I built with my existing
full-stack skills."*

If asked why mutex *and* queue rather than just one: point at the table in
**Design decisions** above — it's the same answer, just said out loud.
